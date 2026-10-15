import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { createSSRClient } from '@/lib/supabase/server';
import { createServerAdminClient } from '@/lib/supabase/serverAdminClient';
import { getVerifiedSupabaseUser } from '@/lib/supabase/verified-user.mjs';
import {
  MAX_CHAT_REQUEST_BYTES,
  RequestBodyError,
  loadEvaluationChatHistory,
  parseChatRequest,
  persistEvaluationUserMessage,
  persistTrustedEvaluationAssistantMessage,
  readJsonRequestBody,
  verifyOwnedEvaluation,
} from '@/lib/evaluation-chat.mjs';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const supabase = await createSSRClient();
    if (!await getVerifiedSupabaseUser(supabase)) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    let input;
    try {
      input = parseChatRequest(await readJsonRequestBody(req, MAX_CHAT_REQUEST_BYTES));
    } catch (error) {
      if (error instanceof RequestBodyError) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
    const { evaluationId, messageId, message } = input;

    try {
      await verifyOwnedEvaluation(supabase, evaluationId);
    } catch (error) {
      console.error('Chat evaluation authorization failed:', error);
      return Response.json({ error: 'This evaluation is unavailable to your account.' }, { status: 404 });
    }

    try {
      await persistEvaluationUserMessage(supabase, {
        id: messageId,
        evaluationId,
        content: message,
      });
    } catch (error) {
      console.error('Could not save user chat message:', error);
      return Response.json({ error: 'Your message was not saved. Retry before continuing.' }, { status: 500 });
    }

    let messages;
    try {
      messages = await loadEvaluationChatHistory(supabase, evaluationId);
    } catch (error) {
      console.error('Could not load saved evaluation chat history:', error);
      return Response.json({ error: 'Your message was saved, but the conversation could not be loaded. Retry before continuing.' }, { status: 500 });
    }

    const assistantMessageId = crypto.randomUUID();

    // Stream the response using Vercel AI SDK
    const result = streamText({
      model: openai('gpt-4o'),
      system: SYSTEM_PROMPT,
      maxOutputTokens: 2_000,
      messages,
      onFinish: async ({ text }) => {
        try {
          const serviceRoleSupabase = await createServerAdminClient();
          await persistTrustedEvaluationAssistantMessage(serviceRoleSupabase, {
            id: assistantMessageId,
            evaluationId,
            content: text,
          });
        } catch (error) {
          console.error('Could not save assistant chat message:', error);
          throw error;
        }
      },
    });

    return result.toTextStreamResponse({ headers: { 'X-Assistant-Message-Id': assistantMessageId } });
  } catch (error) {
    console.error('Chat API error:', error);
    return Response.json({ error: 'Chat service is unavailable. Please retry.' }, { status: 500 });
  }
}
