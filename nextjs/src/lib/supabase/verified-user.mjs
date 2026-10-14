/**
 * Resolve the user from Supabase's verified auth endpoint.
 *
 * @param {{ auth: { getUser: () => Promise<{ data?: { user?: unknown }, error?: unknown }> } }} supabase
 * @returns {Promise<unknown | null>}
 */
export async function getVerifiedSupabaseUser(supabase) {
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data?.user ?? null;
}
