import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { createSSRClient } from '@/lib/supabase/server';
import { getVerifiedSupabaseUser } from '@/lib/supabase/verified-user.mjs';
import { persistEvaluationChatMessage, verifyOwnedEvaluation } from '@/lib/evaluation-chat.mjs';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const supabase = await createSSRClient();
    if (!await getVerifiedSupabaseUser(supabase)) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { evaluationId, messageId, messages } = await req.json();

    // Validate messages
    if (typeof evaluationId !== 'string' || typeof messageId !== 'string' || !Array.isArray(messages)) {
      return Response.json({ error: 'An evaluation, message ID, and message history are required.' }, { status: 400 });
    }
    const latestMessage = messages.at(-1);
    if (latestMessage?.role !== 'user' || typeof latestMessage.content !== 'string' || !latestMessage.content.trim()) {
      return Response.json({ error: 'The latest chat message must contain user text.' }, { status: 400 });
    }

    try {
      await verifyOwnedEvaluation(supabase, evaluationId);
    } catch (error) {
      console.error('Chat evaluation authorization failed:', error);
      return Response.json({ error: 'This evaluation is unavailable to your account.' }, { status: 404 });
    }

    try {
      await persistEvaluationChatMessage(supabase, {
        id: messageId,
        evaluationId,
        role: 'user',
        content: latestMessage.content,
      });
    } catch (error) {
      console.error('Could not save user chat message:', error);
      return Response.json({ error: 'Your message was not saved. Retry before continuing.' }, { status: 500 });
    }

    const assistantMessageId = crypto.randomUUID();

    // Stream the response using Vercel AI SDK
    const result = streamText({
      model: openai('gpt-4o'),
      system: SYSTEM_PROMPT,
      messages,
      onFinish: async ({ text }) => {
        try {
          await persistEvaluationChatMessage(supabase, {
            id: assistantMessageId,
            evaluationId,
            role: 'assistant',
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
    return new Response('Internal server error', { status: 500 });
  }
}
