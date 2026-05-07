// api/admin/feedback.js - admin operations on the feedback table.
//
// Basic-auth gated.
//
//   GET  ?op=list                              load all feedback
//   POST ?op=update body { id, status, admin_notes }  update status/notes
//
// The /api/petz-feedback function is the only public writer to this table,
// using a controlled subset of fields. Everything else flows through here.

import { requireAdmin } from "../_lib/admin-auth.js";
import { sbFetch, sendSupabaseError } from "../_lib/supabase.js";

const STATUS_VALUES = new Set(["new", "in-progress", "done", "wont-fix"]);
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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
    if (op === "list") {
      const sb = await sbFetch(`/rest/v1/feedback?select=*&order=created_at.desc`);
      if (!sb.ok) return sendSupabaseError(res, sb);
      return res.status(200).json(sb.body || []);
    }
    return res.status(400).json({ error: "Unknown op" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = await readJson(req);
  if (op === "update") {
    const id = String(body.id || "");
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid id" });
    if (body.status != null && !STATUS_VALUES.has(body.status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const patch = {};
    if (body.status != null)        patch.status = body.status;
    if ("admin_notes" in body)      patch.admin_notes = body.admin_notes ? String(body.admin_notes).slice(0, 2000) : null;
    if (!Object.keys(patch).length) return res.status(400).json({ error: "Nothing to update" });

    const sb = await sbFetch(
      `/rest/v1/feedback?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      },
    );
    if (!sb.ok) return sendSupabaseError(res, sb);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "Unknown op" });
}
