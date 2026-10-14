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

/**
 * @param {{ from: (table: string) => any }} supabase
 * @param {{ id: string, evaluationId: string, role: 'user' | 'assistant', content: string }} message
 */
export async function persistEvaluationChatMessage(supabase, message) {
  const { error } = await supabase.from('chat_messages').insert({
    id: message.id,
    evaluation_id: message.evaluationId,
    role: message.role,
    content: message.content,
  });

  if (error) throw new Error('Could not save evaluation chat message', { cause: error });
}
