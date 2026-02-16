/**
 * Centralized Supabase configuration.
 *
 * The anon key is a PUBLIC, read-only key — safe to ship in client-side code.
 * Supabase uses Row Level Security (RLS) to control access; the anon key
 * simply authenticates requests as "anonymous public reader".
 *
 * Service-role key (write access) lives ONLY in Vercel env vars and is
 * never included in client bundles.
 */

export const SUPABASE_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co";

export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjA3OTEsImV4cCI6MjA4NjEzNjc5MX0.QH3wFa14gSvRKOz8Q099sbKvKoSroGJfPerdZgPtbTI";

/**
 * Helper: fetch JSON from Supabase REST API (read-only, anon key).
 * @param {string} path — e.g. "/rest/v1/shoes?select=*"
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
