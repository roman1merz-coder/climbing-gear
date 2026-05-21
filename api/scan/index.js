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
//   GET  ?op=shoes                {brand:[model,...]} from the shoes table
//                                 (feeds the scanner's current-shoe dropdown)
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

// V2 preference inputs - fixed enums, mirror the foot_scan_fits CHECK
// constraints from the v2_scanner_inputs_and_pipeline_version migration.
const DISCIPLINE_VALUES = new Set(["boulder", "sport", "trad_multipitch"]);
const ENVIRONMENT_VALUES = new Set(["indoor", "outdoor", "both"]);
const ROCK_VALUES = new Set(["granite", "limestone", "sandstone", "mixed"]);
const AGGRESSIVENESS_VALUES = new Set(["comfort", "balanced", "moderate", "aggressive"]);
const FIT_AREAS = ["toes", "forefoot", "heel"];

function validScanId(id) {
  return typeof id === "string" && SCAN_ID_RE.test(id);
}

// W6: a shoe entry is either fully complete (brand + model + size + all
// three fit ratings) or fully empty - never a partial row. A partial row
// returns an { error } so the caller answers 400 instead of silently
// nulling fields and accepting corrupt data.
function validateShoes(arr) {
  if (arr == null) return { shoes: [] };
  if (!Array.isArray(arr)) return { error: "shoes must be a list" };
  const out = [];
  for (let i = 0; i < arr.length && i < 10; i++) {
    const s = arr[i] || {};
    const brand = String(s.brand || "").trim();
    const model = String(s.model || "").trim();
    const size = s.size_eu == null || s.size_eu === "" ? null : Number(s.size_eu);
    const sizeOk = size != null && Number.isFinite(size);
    const fit = s.fit && typeof s.fit === "object" ? s.fit : {};
    const ratings = {};
    let filledFits = 0;
    for (const area of FIT_AREAS) {
      const v = fit[area];
      if (v && v !== "") {
        if (!FIT_VALUES.has(v)) return { error: `Shoe ${i + 1}: invalid ${area} rating` };
        ratings[area] = v;
        filledFits++;
      } else {
        ratings[area] = null;
      }
    }
    const anyFilled = brand || model || sizeOk || filledFits > 0;
    if (!anyFilled) continue; // fully empty row - skip silently
    const missing = [];
    if (!brand) missing.push("brand");
    if (!model) missing.push("model");
    if (!sizeOk) missing.push("size");
    if (filledFits < FIT_AREAS.length) missing.push("fit ratings");
    if (missing.length) {
      return {
        error: `Shoe ${i + 1} is incomplete (missing ${missing.join(", ")}). ` +
               `Fill it in fully or remove it.`,
      };
    }
    out.push({
      brand: brand.slice(0, 80),
      model: model.slice(0, 120),
      size_eu: size,
      fit: { toes: ratings.toes, forefoot: ratings.forefoot, heel: ratings.heel },
    });
  }
  return { shoes: out };
}

// W2.1: validate + normalize the four V2 preference inputs. When
// `required` is true (rescore path) the three core inputs must all be
// present; otherwise they are all-or-nothing (a V1 capture submits
// none, a V2 capture submits all). rock_type is only kept outdoors,
// mirroring the foot_scan_fits cross-field CHECK.
function validateV2Inputs(body, required) {
  const norm = (v) => (v == null || v === "" ? null : String(v).trim().toLowerCase());
  const discipline = norm(body.discipline);
  const environment = norm(body.environment);
  let rock_type = norm(body.rock_type);
  const aggressiveness = norm(body.aggressiveness);
  if (discipline && !DISCIPLINE_VALUES.has(discipline)) return { error: "Invalid discipline" };
  if (environment && !ENVIRONMENT_VALUES.has(environment)) return { error: "Invalid environment" };
  if (aggressiveness && !AGGRESSIVENESS_VALUES.has(aggressiveness)) {
    return { error: "Invalid aggressiveness" };
  }
  const present = [discipline, environment, aggressiveness].filter(Boolean).length;
  if (required && present < 3) {
    return { error: "Climbing preferences (discipline, environment, aggressiveness) are required." };
  }
  if (!required && present > 0 && present < 3) {
    return { error: "Incomplete climbing preferences: discipline, environment and aggressiveness must be set together." };
  }
  if (rock_type) {
    if (!ROCK_VALUES.has(rock_type)) return { error: "Invalid rock_type" };
    if (environment !== "outdoor") rock_type = null; // mirror DB CHECK
  }
  return { discipline, environment, rock_type, aggressiveness };
}

// Advanced-preferences overrides (mirror the v2_pipeline override layer).
// preference_overrides is a sparse object - only the axes the user
// customized are present. Returns { overrides } (clean sparse object or
// null) or { error }.
const DOWNTURN_VALUES = new Set(["flat", "slight", "moderate", "aggressive"]);
const ASYMMETRY_VALUES = new Set(["none", "slight", "moderate", "strong"]);
const CLOSURE_PREF_VALUES = new Set(["lace", "velcro", "slipper", "any"]);
const PREF_OVERRIDE_KEYS = new Set(["stiffness", "downturn", "asymmetry", "closure", "ankle"]);

function validatePreferenceOverrides(raw) {
  if (raw == null) return { overrides: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "preference_overrides must be an object" };
  }
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!PREF_OVERRIDE_KEYS.has(k)) {
      return { error: `Unknown preference override: ${k}` };
    }
    if (v == null) continue; // sparse - a null value just means "not set"
    if (k === "stiffness") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        return { error: "stiffness override must be a number between 0 and 1" };
      }
      out.stiffness = n;
    } else if (k === "downturn") {
      if (!DOWNTURN_VALUES.has(v)) return { error: "Invalid downturn override" };
      out.downturn = v;
    } else if (k === "asymmetry") {
      if (!ASYMMETRY_VALUES.has(v)) return { error: "Invalid asymmetry override" };
      out.asymmetry = v;
    } else if (k === "closure") {
      // closure is multi-select: an array of 1-2 of lace/velcro/slipper.
      const arr = [...new Set((Array.isArray(v) ? v : [v])
        .filter((x) => x === "lace" || x === "velcro" || x === "slipper"))];
      if (arr.length < 1 || arr.length > 2) {
        return { error: "closure override must be 1 or 2 of lace, velcro, slipper" };
      }
      out.closure = arr;
    } else if (k === "ankle") {
      out.ankle = Boolean(v);
    }
  }
  return { overrides: Object.keys(out).length ? out : null };
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
    if (op === "shoes") return handleShoes(req, res);
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

// Returns the catalog as { brand: [model, ...] } so the scanner's
// current-shoe dropdown is fed by the live shoes table — every
// selectable shoe is guaranteed to exist in the DB.
async function handleShoes(req, res) {
  const sb = await sbFetch(
    `/rest/v1/shoes?select=brand,model&order=brand.asc,model.asc&limit=2000`,
  );
  if (!sb.ok) return sendSupabaseError(res, sb);
  const byBrand = {};
  for (const row of (Array.isArray(sb.body) ? sb.body : [])) {
    const b = (row.brand || "").trim();
    const m = (row.model || "").trim();
    if (!b || !m) continue;
    (byBrand[b] = byBrand[b] || []).push(m);
  }
  return res.status(200).json(byBrand);
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
  const shoesResult = validateShoes(body.shoes);
  if (shoesResult.error) return res.status(400).json({ error: shoesResult.error });
  const v2 = validateV2Inputs(body, false);
  if (v2.error) return res.status(400).json({ error: v2.error });
  const patch = {
    sex: body.sex || null,
    street_size_eu: cleanNumber(body.street_size_eu),
    shoes: shoesResult.shoes,
    next_shoe_preference: cleanString(body.next_shoe_preference, 100),
    next_shoe_notes: cleanString(body.next_shoe_notes, 2000),
    discipline: v2.discipline,
    environment: v2.environment,
    rock_type: v2.rock_type,
    aggressiveness: v2.aggressiveness,
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
  if (body.sex != null && !SEX_VALUES.has(body.sex)) {
    return res.status(400).json({ error: "Invalid sex" });
  }
  const shoesResult = validateShoes(body.shoes);
  if (shoesResult.error) return res.status(400).json({ error: shoesResult.error });
  // V2 inputs are enum-validated if present; the edit modal enforces their
  // presence client-side. A rescore that lacks them keeps the row on V1.
  const v2 = validateV2Inputs(body, false);
  if (v2.error) return res.status(400).json({ error: v2.error });
  const po = validatePreferenceOverrides(body.preference_overrides);
  if (po.error) return res.status(400).json({ error: po.error });
  const patch = {
    sex: SEX_VALUES.has(body.sex) ? body.sex || null : null,
    shoes: shoesResult.shoes,
    next_shoe_preference: cleanString(body.next_shoe_preference, 100),
    next_shoe_notes: cleanString(body.next_shoe_notes, 2000),
    discipline: v2.discipline,
    environment: v2.environment,
    rock_type: v2.rock_type,
    aggressiveness: v2.aggressiveness,
    preference_overrides: po.overrides,
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
