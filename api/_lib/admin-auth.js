// api/_lib/admin-auth.js - HTTP Basic auth gate for /api/admin/* endpoints
// and the admin HTML pages they back.
//
// Uses a constant-time comparison so a timing-attack on the password is not
// possible. Credentials live in Vercel env vars:
//   ADMIN_USER      defaults to "admin" if unset
//   ADMIN_PASSWORD  REQUIRED. Pick a long random string.
//
// Usage in a route:
//   import { requireAdmin } from "../_lib/admin-auth.js";
//   if (!requireAdmin(req, res)) return;   // sends 401 itself when needed
//
// The 401 response includes WWW-Authenticate: Basic so browsers show a
// native login prompt the first time they hit a gated URL.

import { timingSafeEqual } from "node:crypto";

const REALM = "climbing-gear admin";

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // Still run a comparison of equal-length buffers to avoid leaking length
    // via timing. The result is discarded.
    timingSafeEqual(Buffer.alloc(ba.length || 1), Buffer.alloc(ba.length || 1));
    return false;
  }
  return timingSafeEqual(ba, bb);
}

// Returns true on success. On failure, writes a 401 to res and returns false.
// Caller should bail out (return) when this returns false.
export function requireAdmin(req, res) {
  const expectedUser = process.env.ADMIN_USER || "admin";
  const expectedPass = process.env.ADMIN_PASSWORD;

  if (!expectedPass) {
    // Misconfigured server. Refuse instead of silently allowing access.
    res.status(500).json({ error: "server-misconfig: ADMIN_PASSWORD not set" });
    return false;
  }

  const header = req.headers["authorization"] || "";
  if (!header.startsWith("Basic ")) {
    return sendUnauthorized(res);
  }

  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return sendUnauthorized(res);
  }

  const sep = decoded.indexOf(":");
  if (sep < 0) return sendUnauthorized(res);

  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);

  const userOk = safeEqual(user, expectedUser);
  const passOk = safeEqual(pass, expectedPass);
  if (!(userOk && passOk)) {
    return sendUnauthorized(res);
  }
  return true;
}

function sendUnauthorized(res) {
  res.setHeader("WWW-Authenticate", `Basic realm="${REALM}", charset="UTF-8"`);
  res.status(401).json({ error: "Unauthorized" });
  return false;
}
