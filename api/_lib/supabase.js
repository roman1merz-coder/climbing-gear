// api/_lib/supabase.js - shared Supabase config for serverless functions.
//
// All service-role usage MUST happen through this module. Never inline the
// service-role key in any /api function: it lets the next reader assume the
// key is allowed to live in source again.
//
// Required env vars (set in Vercel project settings):
//   SUPABASE_URL          e.g. https://wsjsuhvpgupalwgcjatp.supabase.co
//   SUPABASE_SERVICE_KEY  the rotated service-role JWT (NEVER commit this)

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export function assertSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("server-misconfig: SUPABASE_URL or SUPABASE_SERVICE_KEY missing");
  }
}

// Standard headers for any service-role REST call.
export function sbHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    ...extra,
  };
}

// Thin wrapper around fetch that proxies the response status + JSON.
// Returns { ok, status, body } where body is parsed JSON or text fallback.
export async function sbFetch(path, init = {}) {
  assertSupabaseEnv();
  const url = path.startsWith("http") ? path : `${SUPABASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...sbHeaders(), ...(init.headers || {}) },
  });
  let body = null;
  const text = await res.text();
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { ok: res.ok, status: res.status, body };
}

// Helper for endpoints that just want to forward Supabase failures back to
// the client without leaking server internals.
export function sendSupabaseError(res, sb, fallbackMsg = "Upstream error") {
  const status = sb.status >= 400 ? sb.status : 500;
  const msg = typeof sb.body === "string" ? sb.body.slice(0, 300) : fallbackMsg;
  return res.status(status).json({ error: msg });
}
