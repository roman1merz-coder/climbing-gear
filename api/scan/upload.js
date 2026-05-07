// api/scan/upload.js - public scanner photo upload proxy.
//
// Replaces the direct /storage/v1/object/foot-scans calls that used to live
// in public/scan.html with the service-role key. Now the browser POSTs the
// JPEG bytes here and the server forwards them to Supabase Storage.
//
//   POST /api/scan/upload?scan_id=scan-2026-05-07T08-12-33&view=sole
//   Content-Type: image/jpeg
//   Body: raw JPEG bytes
//
// Validates: scan_id format, view in (sole|side), Content-Type, body size.
// Returns 200 + the public URL on success. The browser then HEADs that URL
// to verify the object actually landed (existing scan.html flow stays).

import { SUPABASE_URL, sbHeaders, assertSupabaseEnv } from "../_lib/supabase.js";

// Reasonable bounds. Real camera JPEGs are typically 200KB to 4MB.
const MIN_BYTES = 5_000;
const MAX_BYTES = 10 * 1024 * 1024;
const SCAN_ID_RE = /^scan-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;

export const config = {
  api: {
    // Accept binary uploads up to MAX_BYTES. Vercel default is 4mb.
    bodyParser: false,
  },
};

async function readRawBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BYTES) {
      throw new Error("body-too-large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    assertSupabaseEnv();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const { scan_id, view } = req.query || {};
  if (!scan_id || !SCAN_ID_RE.test(String(scan_id))) {
    return res.status(400).json({ error: "Invalid scan_id" });
  }
  if (view !== "sole" && view !== "side") {
    return res.status(400).json({ error: "Invalid view" });
  }
  const ct = (req.headers["content-type"] || "").toLowerCase();
  if (!ct.startsWith("image/jpeg") && !ct.startsWith("image/jpg")) {
    return res.status(415).json({ error: "Content-Type must be image/jpeg" });
  }

  let body;
  try {
    body = await readRawBody(req);
  } catch (e) {
    if (e.message === "body-too-large") {
      return res.status(413).json({ error: "Image exceeds 10 MB" });
    }
    return res.status(400).json({ error: "Failed to read body" });
  }
  if (body.length < MIN_BYTES) {
    return res.status(400).json({ error: "Image too small (likely empty)" });
  }

  const objectPath = `scans/${scan_id}-${view}.jpg`;
  const target = `${SUPABASE_URL}/storage/v1/object/foot-scans/${objectPath}`;

  const upRes = await fetch(target, {
    method: "POST",
    headers: sbHeaders({
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
    }),
    body,
  });

  if (!upRes.ok) {
    const txt = await upRes.text().catch(() => "");
    return res.status(502).json({
      error: "Upload to storage failed",
      detail: txt.slice(0, 200),
    });
  }

  return res.status(200).json({
    ok: true,
    public_url: `${SUPABASE_URL}/storage/v1/object/public/foot-scans/${objectPath}`,
  });
}
