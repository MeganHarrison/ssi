import assert from 'node:assert/strict';
import test from 'node:test';

import { getVerifiedSupabaseUser } from './verified-user.mjs';

test('only returns a user verified by Supabase', async () => {
  const user = { id: 'authenticated-user' };
  assert.equal(await getVerifiedSupabaseUser({ auth: { getUser: async () => ({ data: { user }, error: null }) } }), user);
  assert.equal(await getVerifiedSupabaseUser({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }), null);
  assert.equal(await getVerifiedSupabaseUser({ auth: { getUser: async () => ({ data: { user }, error: new Error('invalid session') }) } }), null);
});
