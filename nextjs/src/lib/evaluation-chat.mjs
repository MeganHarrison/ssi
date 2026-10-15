export const MAX_CHAT_MESSAGE_CHARS = 24_000;
export const MAX_CHAT_HISTORY_MESSAGES = 40;
export const MAX_CHAT_HISTORY_CHARS = 60_000;
export const MAX_CHAT_REQUEST_BYTES = 100 * 1024;
export const MAX_PDF_REQUEST_BYTES = 2 * 1024;
export const INITIAL_TRANSCRIPT_PREFIX = 'Here is my evaluation transcript:\n\n';

export function buildInitialTranscriptMessage(transcript) {
  return `${INITIAL_TRANSCRIPT_PREFIX}${transcript}`;
}

export function getInitialTranscriptError(transcript) {
  if (typeof transcript !== 'string' || !transcript.trim()) return 'Enter a transcript before continuing.';
  const messageLength = buildInitialTranscriptMessage(transcript).length;
  if (messageLength > MAX_CHAT_MESSAGE_CHARS) {
    return `This transcript is too long to send in one message. Shorten it to ${MAX_CHAT_MESSAGE_CHARS - INITIAL_TRANSCRIPT_PREFIX.length} characters or fewer. No evaluation has been created.`;
  }
  return null;
}

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export class RequestBodyError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'RequestBodyError';
    this.status = status;
  }
}

export async function readJsonRequestBody(request, maxBytes) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyError('Request body is too large.', 413);
  }

  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError('A JSON request body is required.', 400);

  const chunks = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      throw new RequestBodyError('Request body is too large.', 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new RequestBodyError('Request body must contain valid JSON.', 400);
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
  return Object.keys(value).every(key => allowedKeys.includes(key));
}

export function parseChatRequest(payload) {
  if (!isRecord(payload) || !hasOnlyKeys(payload, ['evaluationId', 'messageId', 'message'])) {
    throw new RequestBodyError('Provide only an evaluation ID, message ID, and message text.', 400);
  }
  if (typeof payload.evaluationId !== 'string' || !UUID_PATTERN.test(payload.evaluationId)) {
    throw new RequestBodyError('A valid evaluation ID is required.', 400);
  }
  if (typeof payload.messageId !== 'string' || !UUID_PATTERN.test(payload.messageId)) {
    throw new RequestBodyError('A valid message ID is required.', 400);
  }
  if (typeof payload.message !== 'string' || !payload.message.trim()) {
    throw new RequestBodyError('Message text is required.', 400);
  }
  if (payload.message.length > MAX_CHAT_MESSAGE_CHARS) {
    throw new RequestBodyError(`Message text must be ${MAX_CHAT_MESSAGE_CHARS} characters or fewer.`, 413);
  }

  return {
    evaluationId: payload.evaluationId,
    messageId: payload.messageId,
    message: payload.message,
  };
}

export function parsePdfRequest(payload) {
  if (!isRecord(payload) || !hasOnlyKeys(payload, ['evaluationId'])) {
    throw new RequestBodyError('Provide only an evaluation ID.', 400);
  }
  if (typeof payload.evaluationId !== 'string' || !UUID_PATTERN.test(payload.evaluationId)) {
    throw new RequestBodyError('A valid evaluation ID is required.', 400);
  }
  return { evaluationId: payload.evaluationId };
}

/**
 * Only user messages and server-marked assistant messages are model context.
 * Legacy assistant rows predate provenance tracking and default to untrusted.
 * @param {unknown[]} rows
 * @returns {{role: 'user' | 'assistant', content: string}[]}
 */
export function selectTrustedChatHistory(rows) {
  if (!Array.isArray(rows)) return [];

  const eligible = rows.filter(row => isRecord(row)
    && (row.role === 'user' || (row.role === 'assistant' && row.trusted === true))
    && typeof row.content === 'string'
    && row.content.length > 0
    && row.content.length <= MAX_CHAT_MESSAGE_CHARS);

  const selected = [];
  let totalChars = 0;
  for (let index = eligible.length - 1; index >= 0 && selected.length < MAX_CHAT_HISTORY_MESSAGES; index -= 1) {
    const { role, content } = eligible[index];
    if (totalChars + content.length > MAX_CHAT_HISTORY_CHARS) break;
    selected.push({ role, content });
    totalChars += content.length;
  }
  return selected.reverse();
}

/**
 * Return bounded history visible through the current user's RLS-scoped client.
 * @param {{ from: (table: string) => any }} supabase
 * @param {string} evaluationId
 * @returns {Promise<{role: 'user' | 'assistant', content: string}[]>}
 */
export async function loadEvaluationChatHistory(supabase, evaluationId) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content, trusted, created_at, id')
    .eq('evaluation_id', evaluationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MAX_CHAT_HISTORY_MESSAGES);

  if (error) throw new Error('Could not load the saved conversation', { cause: error });
  return selectTrustedChatHistory((data ?? []).slice().reverse());
}

/**
 * Confirm the signed-in user's RLS-visible evaluation before storing chat data.
 * @param {{ from: (table: string) => any }} supabase
 * @param {string} evaluationId
 */
export async function verifyOwnedEvaluation(supabase, evaluationId) {
  const { data, error } = await supabase
    .from('evaluations')
    .select('id')
    .eq('id', evaluationId)
    .maybeSingle();

  if (error) throw new Error('Could not verify evaluation ownership', { cause: error });
  if (!data) throw new Error('Evaluation was not found or is not accessible to this user');
}

/** @param {{ from: (table: string) => any }} supabase */
async function insertMessage(supabase, message, role, trusted) {
  const { error } = await supabase.from('chat_messages').insert({
    id: message.id,
    evaluation_id: message.evaluationId,
    role,
    content: message.content,
    trusted,
  });

  if (error) throw new Error(`Could not save ${role} evaluation chat message`, { cause: error });
}

/** @param {{ from: (table: string) => any }} supabase */
export async function persistEvaluationUserMessage(supabase, message) {
  return insertMessage(supabase, message, 'user', false);
}

/** @param {{ from: (table: string) => any }} serviceRoleSupabase */
export async function persistTrustedEvaluationAssistantMessage(serviceRoleSupabase, message) {
  return insertMessage(serviceRoleSupabase, message, 'assistant', true);
}
