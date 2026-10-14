import assert from 'node:assert/strict';
import test from 'node:test';

import { persistEvaluationChatMessage, verifyOwnedEvaluation } from './evaluation-chat.mjs';

test('chat writes are bound to an RLS-visible evaluation and preserve message identity', async () => {
  const calls = [];
  const supabase = {
    from(table) {
      return {
        select(columns) { calls.push(['select', table, columns]); return this; },
        eq(column, value) { calls.push(['eq', table, column, value]); return this; },
        async maybeSingle() { return { data: { id: 'eval-1' }, error: null }; },
        async insert(row) { calls.push(['insert', table, row]); return { error: null }; },
      };
    },
  };

  await verifyOwnedEvaluation(supabase, 'eval-1');
  await persistEvaluationChatMessage(supabase, {
    id: 'msg-1', evaluationId: 'eval-1', role: 'user', content: 'Clinical source text',
  });

  assert.deepEqual(calls, [
    ['select', 'evaluations', 'id'],
    ['eq', 'evaluations', 'id', 'eval-1'],
    ['insert', 'chat_messages', {
      id: 'msg-1', evaluation_id: 'eval-1', role: 'user', content: 'Clinical source text',
    }],
  ]);
});

test('chat writes fail loudly for inaccessible evaluations or failed message inserts', async () => {
  const inaccessible = {
    from: () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } }),
  };
  await assert.rejects(verifyOwnedEvaluation(inaccessible, 'other-user-evaluation'), /not found or is not accessible/);

  const failedWrite = { from: () => ({ async insert() { return { error: new Error('RLS denied') }; } }) };
  await assert.rejects(persistEvaluationChatMessage(failedWrite, {
    id: 'msg-2', evaluationId: 'eval-1', role: 'assistant', content: 'Reply',
  }), /Could not save evaluation chat message/);
});
