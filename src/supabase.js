/**
 * Centralized Supabase configuration.
 *
 * The publishable key is a PUBLIC, read-only key - safe to ship in
 * client-side code. Supabase uses Row Level Security (RLS) to control
 * access; the publishable key authenticates requests as the "anonymous
 * public reader" role.
 *
 * Migrated 2026-05-07 from the legacy `eyJ...` JWT anon key to the new
 * `sb_publishable_...` format. The secret key (write access) lives ONLY
 * in Vercel env vars (SUPABASE_SERVICE_KEY) and is never bundled.
 *
 * The export name `SUPABASE_ANON_KEY` is kept for backwards-compat with
 * existing imports across the codebase; the value is now the publishable
 * key, not a JWT.
 */

export const SUPABASE_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co";

export const SUPABASE_ANON_KEY = "sb_publishable_dG9yKzuhsr2DtSHIh9-cXg_DhZbfYkr";

/**
 * Helper: fetch JSON from Supabase REST API (read-only, anon key).
 * @param {string} path - e.g. "/rest/v1/shoes?select=*"
 * @returns {Promise<any>}
 */
export async function supabaseFetch(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status}`);
  return res.json();
}

/**
 * Call a Supabase RPC (stored function) via POST.
 * @param {string} fnName - function name, e.g. "get_best_prices"
 * @param {object} params - JSON body passed to the function
 * @returns {Promise<any>}
 */
export async function supabaseRpc(fnName, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Supabase RPC ${fnName}: ${res.status}`);
  return res.json();
}
