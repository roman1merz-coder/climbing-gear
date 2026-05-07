// api/admin/scans.js - admin operations on foot_scan_fits and foot-scans bucket.
//
// Basic-auth gated. All ops dispatch on req.method + req.query.op.
//
//   GET    ?op=list                          load active scans + storage listing
//   GET    ?op=archive                       load archived scans
//   POST   ?op=delete    body { scan_id }    archive then hard-delete
//   POST   ?op=restore   body { archive_id } restore from archive
//   POST   ?op=purge     body { archive_id } permanently delete from archive
//
// All Supabase work happens here with the service-role key, never in the
// browser. The admin HTML calls these endpoints with the same Basic-auth
// credentials the browser already has from the page-load gate.

import { requireAdmin } from "../_lib/admin-auth.js";
import { sbFetch, SUPABASE_URL, sbHeaders, sendSupabaseError } from "../_lib/supabase.js";

const SCAN_ID_RE = /^scan-[A-Za-z0-9_-]+$/; // a bit looser than scan/index.js, archive can have legacy ids
const SCAN_FIELDS = [
  "id", "scan_id", "status", "created_at", "generated_at", "pipeline_started_at",
  "email", "email_freq", "sex", "street_size_eu", "shoes",
  "next_shoe_preference", "next_shoe_notes",
  "toe_shape", "toe_confidence", "toe_delta_ratio",
  "forefoot_width_ratio", "forefoot_width_class",
  "heel_width_ratio", "heel_width_class",
  "heel_depth_ratio", "heel_depth_class",
  "arch_length_ratio", "arch_length_class",
  "instep_height_ratio", "instep_height_class",
  "volume_class", "hallux_valgus_class", "hva_offset_ratio",
  "confidence", "notes",
  "pipeline_stage", "pipeline_error",
  "recommendations", "interpretation", "landmarks", "validation_results",
].join(",");

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return {}; }
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  res.setHeader("Cache-Control", "no-store");

  const op = (req.query?.op || "").toString();

  if (req.method === "GET") {
    if (op === "list")    return handleList(res);
    if (op === "archive") return handleArchiveList(res);
    return res.status(400).json({ error: "Unknown op" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = await readJson(req);
  switch (op) {
    case "delete":  return handleDelete(body, res);
    case "restore": return handleRestore(body, res);
    case "purge":   return handlePurge(body, res);
    default:        return res.status(400).json({ error: "Unknown op" });
  }
}

// ---------- List active scans + storage objects ----------

async function handleList(res) {
  const [fitsRes, listRes] = await Promise.all([
    sbFetch(`/rest/v1/foot_scan_fits?select=${SCAN_FIELDS}&order=created_at.desc`),
    fetch(`${SUPABASE_URL}/storage/v1/object/list/foot-scans`, {
      method: "POST",
      headers: sbHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefix: "scans/", limit: 500, offset: 0, sortBy: { column: "created_at", order: "desc" } }),
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) })),
  ]);

  if (!fitsRes.ok) return sendSupabaseError(res, fitsRes, "fits load failed");
  if (!listRes.ok) return res.status(502).json({ error: "storage list failed" });

  return res.status(200).json({
    fits: fitsRes.body || [],
    photos: listRes.body || [],
    storage_base: `${SUPABASE_URL}/storage/v1/object/public/foot-scans/scans`,
  });
}

// ---------- Archive listing ----------

async function handleArchiveList(res) {
  const sb = await sbFetch(`/rest/v1/foot_scan_fits_archive?select=*&order=archived_at.desc`);
  if (!sb.ok) return sendSupabaseError(res, sb, "archive load failed");
  return res.status(200).json(sb.body || []);
}

// ---------- Archive + hard delete ----------

async function handleDelete(body, res) {
  const scan_id = String(body.scan_id || "");
  if (!scan_id || !SCAN_ID_RE.test(scan_id)) {
    return res.status(400).json({ error: "Invalid scan_id" });
  }

  // 1. Pull the row
  const getRes = await sbFetch(
    `/rest/v1/foot_scan_fits?scan_id=eq.${encodeURIComponent(scan_id)}&select=*`,
  );
  if (!getRes.ok) return sendSupabaseError(res, getRes);

  // 2. Archive it (drop primary id so the archive table assigns its own)
  if (Array.isArray(getRes.body) && getRes.body.length > 0) {
    const row = { ...getRes.body[0] };
    delete row.id;
    const archiveRes = await sbFetch(`/rest/v1/foot_scan_fits_archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
    if (!archiveRes.ok) return sendSupabaseError(res, archiveRes, "archive insert failed");
  }

  // 3. List storage objects for this scan
  const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/foot-scans`, {
    method: "POST",
    headers: sbHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prefix: "scans/", limit: 500, offset: 0 }),
  });
  const allFiles = listRes.ok ? await listRes.json().catch(() => []) : [];
  const toDelete = (allFiles || [])
    .filter((f) => f && f.name && f.name.startsWith(scan_id))
    .map((f) => `scans/${f.name}`);

  // 4. Delete row + storage objects in parallel
  const tasks = [
    sbFetch(`/rest/v1/foot_scan_fits?scan_id=eq.${encodeURIComponent(scan_id)}`, { method: "DELETE" }),
  ];
  if (toDelete.length > 0) {
    tasks.push(fetch(`${SUPABASE_URL}/storage/v1/object/foot-scans`, {
      method: "DELETE",
      headers: sbHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: toDelete }),
    }).then((r) => ({ ok: r.ok, status: r.status })));
  }
  await Promise.all(tasks);

  return res.status(200).json({ ok: true, archived: getRes.body?.length || 0, files_deleted: toDelete.length });
}

// ---------- Restore from archive ----------

async function handleRestore(body, res) {
  const archive_id = body.archive_id;
  if (archive_id == null) return res.status(400).json({ error: "Missing archive_id" });

  const getRes = await sbFetch(
    `/rest/v1/foot_scan_fits_archive?id=eq.${encodeURIComponent(archive_id)}&select=*`,
  );
  if (!getRes.ok) return sendSupabaseError(res, getRes);
  const rows = Array.isArray(getRes.body) ? getRes.body : [];
  if (rows.length === 0) return res.status(404).json({ error: "Archived row not found" });

  const row = { ...rows[0] };
  delete row.id;
  delete row.archived_at;
  delete row.archived_by;

  const insertRes = await sbFetch(`/rest/v1/foot_scan_fits`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  if (!insertRes.ok) return sendSupabaseError(res, insertRes, "restore insert failed");

  await sbFetch(`/rest/v1/foot_scan_fits_archive?id=eq.${encodeURIComponent(archive_id)}`, { method: "DELETE" });
  return res.status(200).json({ ok: true });
}

// ---------- Purge from archive ----------

async function handlePurge(body, res) {
  const archive_id = body.archive_id;
  if (archive_id == null) return res.status(400).json({ error: "Missing archive_id" });
  const sb = await sbFetch(`/rest/v1/foot_scan_fits_archive?id=eq.${encodeURIComponent(archive_id)}`, { method: "DELETE" });
  if (!sb.ok) return sendSupabaseError(res, sb);
  return res.status(200).json({ ok: true });
}
