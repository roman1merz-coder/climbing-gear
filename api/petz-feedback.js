// api/petz-feedback.js - Vercel Serverless Function
// Receives feedback submissions from the /petz-feedback page at the
// Petz Boulderhalle Neustadt scanner demo event (2026-04-24).
//
// Writes into the existing `feedback` table using the service-role key
// (anon-INSERT is blocked by RLS). Payload is stored as structured JSON
// inside message, with type='petz-event' for easy filtering.
//
// Env vars (already set in Vercel for /api/fetch-prices):
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY

// Fallbacks match the constants in src/supabase.js and CLAUDE-README. The
// service-role key is already in the repo, so no new secret is exposed.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://wsjsuhvpgupalwgcjatp.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2MDc5MSwiZXhwIjoyMDg2MTM2NzkxfQ.6cYE1ElsvX7-BTc1DD15zoPJyr4L3bN0_QyKRQmp3M4";

export default async function handler(req, res) {
  // Basic CORS for safety (same-origin is the main use case)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Server not configured" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    // Extract + coerce expected fields. Everything optional.
    const payload = {
      scan_helpful: body.scan_helpful != null ? Number(body.scan_helpful) : null,
      desired_features: String(body.desired_features || "").slice(0, 2000),
      try_at_petz: String(body.try_at_petz || "").slice(0, 100),
      pay_premium: String(body.pay_premium || "").slice(0, 100),
      model_to_try: String(body.model_to_try || "").slice(0, 200),
      general_comment: String(body.general_comment || "").slice(0, 2000),
      email: String(body.email || "").slice(0, 200),
      event_label: "petz-neustadt-2026-04-24",
      user_agent: String(req.headers["user-agent"] || "").slice(0, 500),
      submitted_at: new Date().toISOString(),
    };

    // Quick sanity check - at least one field filled
    const hasContent =
      payload.scan_helpful != null ||
      payload.desired_features ||
      payload.try_at_petz ||
      payload.pay_premium ||
      payload.model_to_try ||
      payload.general_comment;

    if (!hasContent) {
      return res.status(400).json({ error: "Leere Antwort" });
    }

    // The feedback table CHECKs type IN ('feature','bug','data','general').
    // We use 'general' and mark the payload with event_label for filtering.
    const row = {
      type: "general",
      message: "[PETZ-EVENT] " + JSON.stringify(payload),
      page_url: String(body.page_url || "https://climbing-gear.com/petz-feedback").slice(0, 500),
    };

    const supaRes = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });

    if (!supaRes.ok) {
      const errText = await supaRes.text();
      console.error("Supabase insert failed:", supaRes.status, errText);
      return res.status(502).json({
        error: "Speichern fehlgeschlagen",
        detail: errText.slice(0, 300),
        status: supaRes.status,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("petz-feedback error:", err);
    return res.status(500).json({ error: "Unbekannter Fehler" });
  }
}
