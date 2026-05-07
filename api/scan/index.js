// api/scan/index.js - non-upload scan operations.
//
// One endpoint, dispatched by `op` in the body or query string, replaces all
// the direct service-role calls that scan.html and ScanResult.jsx used to
// make against /rest/v1/foot_scan_fits.
//
// Operations (all POST except status/queue/get which are GET):
//   GET  ?op=status&scan_id=X     pipeline progress poll
//   GET  ?op=queue                in-flight scans for queue position
//   GET  ?op=get&scan_id=X        full row read (used by retake page)
//   POST {op:"init",  scan_id}                              insert pending row
//   POST {op:"prefs", scan_id, sex, street_size_eu, shoes,
//                     next_shoe_preference, next_shoe_notes, email?}
//                                                            patch shoe-fit
//   POST {op:"email", scan_id, email, email_freq}            patch email
//   POST {op:"rescore", scan_id, sex, shoes, street_size_eu?,
//                       next_shoe_preference, next_shoe_notes}
//                                                            kick rescore
//   POST {op:"retake", scan_id}                              kick re-pipeline
//
// All shapes are validated. Anything not in the allow-list is rejected so
// a malicious client cannot patch arbitrary columns on foot_scan_fits.

import { sbFetch, sendSupabaseError } from "../_lib/supabase.js";

const SCAN_ID_RE = /^scan-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;
const SEX_VALUES = new Set(["male", "female", null, undefined, ""]);
// The values the public scanner form actually submits, per dimension:
//   toes:     squeezed | perfect | roomy
//   forefoot: tight    | perfect | loose
//   heel:     tight    | perfect | empty
// Plus the legacy keywords the older /shoe-fit-v2 form used. Anything
// outside this set falls back to null in cleanShoes().
const FIT_VALUES = new Set([
  "", null, undefined,
  "perfect",
  "squeezed", "tight",        // tightness keywords
  "roomy", "loose", "empty",  // looseness keywords
  // legacy aliases that may still appear in older serialized payloads
  "snug", "good", "very-tight", "very-loose",
]);

function validScanId(id) {
  return typeof id === "string" && SCAN_ID_RE.test(id);
}

function cleanShoes(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s) => s && (s.brand || s.model))
    .slice(0, 10)
    .map((s) => ({
      brand: String(s.brand || "").trim().slice(0, 80),
      model: String(s.model || "").trim().slice(0, 120),
      size_eu: s.size_eu == null || s.size_eu === "" ? null : Number(s.size_eu),
      fit: s.fit && typeof s.fit === "object" ? {
        toes: FIT_VALUES.has(s.fit.toes) ? s.fit.toes || null : null,
        forefoot: FIT_VALUES.has(s.fit.forefoot) ? s.fit.forefoot || null : null,
        heel: FIT_VALUES.has(s.fit.heel) ? s.fit.heel || null : null,
      } : null,
    }));
}

function cleanString(v, max = 500) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function cleanNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanEmail(v) {
  const s = cleanString(v, 200);
  if (!s) return null;
  // basic shape check, not RFC compliant - we just want to refuse junk
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s.toLowerCase();
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  // Fallback: stream body ourselves
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const op = (req.query?.op || (await readJsonSafely(req)).op || "").toString();

  // Re-read body for POST handlers (readJsonSafely doesn't consume on GET).
  // We still need the body for POSTs, so handle each op explicitly.
  if (req.method === "GET") {
    if (op === "status") return handleStatus(req, res);
    if (op === "queue") return handleQueue(req, res);
    if (op === "get") return handleGet(req, res);
    return res.status(400).json({ error: "Unknown op" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = await readJson(req);
  const opPost = (body.op || op || "").toString();
  switch (opPost) {
    case "init":    return handleInit(body, res);
    case "prefs":   return handlePrefs(body, res);
    case "email":   return handleEmail(body, res);
    case "rescore": return handleRescore(body, res);
    case "retake":  return handleRetake(body, res);
    default:        return res.status(400).json({ error: "Unknown op" });
  }
}

// readJsonSafely is used only to peek at `op` from a POST body during GET
// handling, which never happens; kept as a no-op for symmetry / safety.
async function readJsonSafely() { return {}; }

// ---------- Handlers ----------

async function handleStatus(req, res) {
  const scan_id = req.query.scan_id;
  if (!validScanId(scan_id)) return res.status(400).json({ error: "Invalid scan_id" });
  const sb = await sbFetch(
    `/rest/v1/foot_scan_fits?scan_id=eq.${encodeURIComponent(scan_id)}` +
      `&select=pipeline_stage,pipeline_error,pipeline_started_at,interpretation,recommendations`,
  );
  if (!sb.ok) return sendSupabaseError(res, sb);
  return res.status(200).json(Array.isArray(sb.body) ? sb.body[0] || null : null);
}

async function handleQueue(req, res) {
  const sb = await sbFetch(
    `/rest/v1/foot_scan_fits?pipeline_stage=in.(pending,segmenting,finding_shoes)` +
      `&select=scan_id,created_at,pipeline_started_at&order=created_at.asc`,
  );
  if (!sb.ok) return sendSupabaseError(res, sb);
  return res.status(200).json(sb.body || []);
}

async function handleGet(req, res) {
  const scan_id = req.query.scan_id;
  if (!validScanId(scan_id)) return res.status(400).json({ error: "Invalid scan_id" });
  const sb = await sbFetch(
    `/rest/v1/foot_scan_fits?scan_id=eq.${encodeURIComponent(scan_id)}&select=*`,
  );
  if (!sb.ok) return sendSupabaseError(res, sb);
  return res.status(200).json(Array.isArray(sb.body) ? sb.body[0] || null : null);
}

async function handleInit(body, res) {
  if (!validScanId(body.scan_id)) return res.status(400).json({ error: "Invalid scan_id" });
  const payload = {
    scan_id: body.scan_id,
    pipeline_stage: "pending",
    pipeline_started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  const sb = await sbFetch(`/rest/v1/foot_scan_fits`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify(payload),
  });
  if (!sb.ok) return sendSupabaseError(res, sb);
  return res.status(200).json({ ok: true });
}

async function handlePrefs(body, res) {
  if (!validScanId(body.scan_id)) return res.status(400).json({ error: "Invalid scan_id" });
  if (body.sex != null && !SEX_VALUES.has(body.sex)) {
    return res.status(400).json({ error: "Invalid sex" });
  }
  const patch = {
    sex: body.sex || null,
    street_size_eu: cleanNumber(body.street_size_eu),
    shoes: cleanShoes(body.shoes),
    next_shoe_preference: cleanString(body.next_shoe_preference, 100),
    next_shoe_notes: cleanString(body.next_shoe_notes, 2000),
  };
  const email = cleanEmail(body.email);
  if (email) patch.email = email;

  const sb = await sbFetch(
    `/rest/v1/foot_scan_fits?scan_id=eq.${encodeURIComponent(body.scan_id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    },
  );
  if (!sb.ok) return sendSupabaseError(res, sb);
  return res.status(200).json({ ok: true });
}

async function handleEmail(body, res) {
  if (!validScanId(body.scan_id)) return res.status(400).json({ error: "Invalid scan_id" });
  const email = cleanEmail(body.email);
  if (!email) return res.status(400).json({ error: "Invalid email" });
  const freqAllowed = new Set(["never", "monthly", "quarterly", "important", "important-only"]);
  const freq = freqAllowed.has(body.email_freq) ? body.email_freq : null;
  const patch = { email, email_freq: freq };

  const sb = await sbFetch(
    `/rest/v1/foot_scan_fits?scan_id=eq.${encodeURIComponent(body.scan_id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    },
  );
  if (!sb.ok) return sendSupabaseError(res, sb);
  return res.status(200).json({ ok: true });
}

async function handleRescore(body, res) {
  if (!validScanId(body.scan_id)) return res.status(400).json({ error: "Invalid scan_id" });
  const patch = {
    sex: SEX_VALUES.has(body.sex) ? body.sex || null : null,
    shoes: cleanShoes(body.shoes),
    next_shoe_preference: cleanString(body.next_shoe_preference, 100),
    next_shoe_notes: cleanString(body.next_shoe_notes, 2000),
    pipeline_stage: "rescore",
    pipeline_started_at: new Date().toISOString(),
  };
  const street = cleanNumber(body.street_size_eu);
  if (street != null) patch.street_size_eu = street;

  const sb = await sbFetch(
    `/rest/v1/foot_scan_fits?scan_id=eq.${encodeURIComponent(body.scan_id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    },
  );
  if (!sb.ok) return sendSupabaseError(res, sb);
  return res.status(200).json({ ok: true });
}

async function handleRetake(body, res) {
  if (!validScanId(body.scan_id)) return res.status(400).json({ error: "Invalid scan_id" });
  const patch = {
    pipeline_stage: "pending",
    pipeline_error: null,
    pipeline_started_at: new Date().toISOString(),
  };
  const sb = await sbFetch(
    `/rest/v1/foot_scan_fits?scan_id=eq.${encodeURIComponent(body.scan_id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    },
  );
  if (!sb.ok) return sendSupabaseError(res, sb);
  return res.status(200).json({ ok: true });
}
