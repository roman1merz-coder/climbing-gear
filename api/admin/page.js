// api/admin/page.js - Basic-auth gated HTML serving for admin pages.
//
// Reads HTML from api/admin/_pages/ (the underscore prefix tells Vercel
// not to treat it as a serverless route, so the files are not served
// directly).
//
//   GET /api/admin/page?p=scan         -> scan-admin.html
//   GET /api/admin/page?p=suggestion   -> suggestion-admin.html
//
// vercel.json rewrites /scan-admin.html and /suggestion-admin.html to
// these targets so existing bookmarks keep working - but now Basic auth
// runs first.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { requireAdmin } from "../_lib/admin-auth.js";

// Static URL references so Vercel's bundler picks up the files. Using
// new URL("./_pages/x.html", import.meta.url) is a recognized pattern
// that traces correctly into the deployed bundle.
const SCAN_HTML_URL = new URL("./_pages/scan-admin.html", import.meta.url);
const SUGGESTION_HTML_URL = new URL("./_pages/suggestion-admin.html", import.meta.url);

const PAGES = {
  scan: SCAN_HTML_URL,
  suggestion: SUGGESTION_HTML_URL,
};

// Read once on cold start. Files are small (~25KB and ~15KB) and immutable
// at runtime, so caching avoids re-reading per request.
const cache = new Map();
function loadPage(key) {
  if (cache.has(key)) return cache.get(key);
  const url = PAGES[key];
  if (!url) return null;
  const html = readFileSync(fileURLToPath(url), "utf8");
  cache.set(key, html);
  return html;
}

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireAdmin(req, res)) return;

  const which = (req.query?.p || "").toString();
  let html;
  try {
    html = loadPage(which);
  } catch (e) {
    return res.status(500).json({ error: "Failed to load admin page" });
  }
  if (!html) {
    return res.status(404).json({ error: "Unknown admin page" });
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  return res.status(200).send(html);
}

// Tell Vercel to bundle the _pages directory with this function.
export const config = {
  // No special runtime needed - default Node.js runtime can read files.
  // The includeFiles config below ensures the HTML files are deployed.
  api: { bodyParser: false },
};
