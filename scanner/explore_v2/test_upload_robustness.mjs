#!/usr/bin/env node
/* test_upload_robustness.mjs
 *
 * Verifies the upload+verify primitives that public/scan.html lines 2078-2161
 * (uploadThenShoeFit) rely on, against real Supabase storage. Mirrors the
 * uploadOne/verifyOne helpers verbatim so a regression in one would surface
 * here before it hit production.
 *
 * Backstory: 2 production scans on 2026-05-01 created 0-byte storage objects
 * because the POST returned 200 even when the body never transferred. The new
 * logic adds a pre-check (blob.size >= MIN_BLOB_BYTES) AND a post-upload HEAD
 * verify (content-length >= MIN_BLOB_BYTES). This script asserts both gates
 * actually fire.
 */

import { readFileSync } from 'node:fs';

const SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2MDc5MSwiZXhwIjoyMDg2MTM2NzkxfQ.6cYE1ElsvX7-BTc1DD15zoPJyr4L3bN0_QyKRQmp3M4";

const MIN_BLOB_BYTES = 5000;
const BUCKET = "foot-scans";
const PREFIX = "scans/";

const headers = {
  'Authorization': `Bearer ${SB_KEY}`,
  'apikey': SB_KEY,
  'Content-Type': 'image/jpeg',
  'x-upsert': 'true',
};

const TS = Date.now();
let counter = 0;
const newScanId = (label) => `test-upload-robust-${TS}-${++counter}-${label}`;
const uploaded = []; // for cleanup

/* ──────────────────────────────────────────────────────────────────────
 * uploadOne / verifyOne: COPIED VERBATIM from public/scan.html (with
 * pre-check pulled out so we can disable it for test 3).
 * ────────────────────────────────────────────────────────────────────── */

async function uploadOne(view, blob, scanId, { skipPreCheck = false } = {}) {
  if (!skipPreCheck && blob.size < MIN_BLOB_BYTES) {
    throw new Error('empty-blob: ' + view + '=' + blob.size);
  }
  const url = `${SB_URL}/storage/v1/object/${BUCKET}/${PREFIX}${scanId}-${view}.jpg`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { method: 'POST', headers, body: blob });
    if (res.ok) {
      uploaded.push(`${PREFIX}${scanId}-${view}.jpg`);
      return res;
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 600));
  }
  throw new Error('upload failed: ' + view);
}

async function verifyOne(scanId, view) {
  const url = `${SB_URL}/storage/v1/object/public/${BUCKET}/${PREFIX}${scanId}-${view}.jpg`;
  let lastLen = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    const len = +r.headers.get('content-length');
    lastLen = len;
    if (r.ok && len >= MIN_BLOB_BYTES) return len;
    await new Promise(r => setTimeout(r, 400));
  }
  const e = new Error('verify-empty: ' + view);
  e.observedLen = lastLen;
  throw e;
}

async function cleanup() {
  for (const path of uploaded) {
    try {
      await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${SB_KEY}`, 'apikey': SB_KEY },
      });
    } catch (e) { /* best effort */ }
  }
}

/* ──────────────────────────────────────────────────────────────────────
 * Test runner
 * ────────────────────────────────────────────────────────────────────── */

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

/* Fetch a real ~50 KB JPEG once for happy-path test. */
async function fetchSampleJpeg() {
  const r = await fetch(`${SB_URL}/storage/v1/object/public/${BUCKET}/${PREFIX}instruction-sole.jpg`);
  if (!r.ok) throw new Error('could not fetch sample jpeg: ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf;
}

async function main() {
  let sample;
  try {
    sample = await fetchSampleJpeg();
    console.log(`(loaded sample jpeg: ${sample.length} bytes)\n`);
  } catch (e) {
    console.error('FATAL: cannot load sample jpeg:', e.message);
    process.exit(2);
  }

  /* ── Test 1: happy path ────────────────────────────────────────────── */
  try {
    const scanId = newScanId('happy');
    const blob = new Blob([sample], { type: 'image/jpeg' });
    await uploadOne('sole', blob, scanId);
    const len = await verifyOne(scanId, 'sole');
    record('1. happy path (real ~50KB jpeg)', len >= MIN_BLOB_BYTES,
      `verified content-length=${len}`);
  } catch (e) {
    record('1. happy path (real ~50KB jpeg)', false, e.message);
  }

  /* ── Test 2: empty blob pre-check ──────────────────────────────────── */
  try {
    const scanId = newScanId('precheck');
    const empty = new Blob([Buffer.alloc(0)], { type: 'image/jpeg' });
    let threw = false, msg = '';
    try {
      await uploadOne('sole', empty, scanId);
    } catch (e) {
      threw = true; msg = e.message;
    }
    const isPreCheck = threw && msg.startsWith('empty-blob');
    record('2. pre-check rejects 0-byte blob', isPreCheck,
      isPreCheck ? `threw: "${msg}" (no HTTP request made)` : `did NOT throw pre-check (threw=${threw}, msg=${msg})`);
  } catch (e) {
    record('2. pre-check rejects 0-byte blob', false, 'unexpected: ' + e.message);
  }

  /* ── Test 3: 0-byte upload bypasses upload-step → caught by verify ── */
  /* This is the SMOKING GUN test: it reproduces the 2026-05-01 production
   * failure mode where the POST returns 200 on a 0-byte body. */
  try {
    const scanId = newScanId('zerobyte');
    const empty = new Blob([Buffer.alloc(0)], { type: 'image/jpeg' });
    /* Skip pre-check to confirm POST itself does NOT catch this. */
    const uploadRes = await uploadOne('sole', empty, scanId, { skipPreCheck: true });
    const postOk = uploadRes.ok;
    const postStatus = uploadRes.status;

    /* Now run verifyOne — this is the gate that MUST fire. */
    let verifyThrew = false, verifyMsg = '', observedLen = null;
    try {
      await verifyOne(scanId, 'sole');
    } catch (e) {
      verifyThrew = true;
      verifyMsg = e.message;
      observedLen = e.observedLen;
    }

    const ok = postOk && verifyThrew && verifyMsg.startsWith('verify-empty');
    record('3. 0-byte upload (POST 200) caught by verifyOne', ok,
      `POST status=${postStatus} (production bug: server accepts empty body), ` +
      `then verifyOne observed content-length=${observedLen} → threw "${verifyMsg}"`);
  } catch (e) {
    record('3. 0-byte upload caught by verifyOne', false, 'unexpected: ' + e.message);
  }

  /* ── Test 4: HEAD on nonexistent object ────────────────────────────── */
  try {
    const scanId = newScanId('nonexistent') + '-DOESNOTEXIST';
    let threw = false, msg = '', observedLen = null;
    try {
      await verifyOne(scanId, 'sole');
    } catch (e) {
      threw = true; msg = e.message; observedLen = e.observedLen;
    }
    const ok = threw && msg.startsWith('verify-empty');
    record('4. verifyOne on missing object', ok,
      ok ? `threw "${msg}" (observed len=${observedLen})` : `did NOT throw (threw=${threw})`);
  } catch (e) {
    record('4. verifyOne on missing object', false, 'unexpected: ' + e.message);
  }

  /* ── Test 5: retry path exists in source ───────────────────────────── */
  /* Skip note: we can't deterministically simulate a transient network
   * failure against real Supabase without mocking. Instead we statically
   * confirm the retry loop exists in scan.html. */
  try {
    const candidates = [
      new URL('../../public/scan.html', import.meta.url),                // user FS layout
      new URL('../../climbing-gear/public/scan.html', import.meta.url),  // sandbox layout
    ];
    let src = null, found = null;
    for (const c of candidates) {
      try { src = readFileSync(c, 'utf8'); found = c.pathname; break; } catch {}
    }
    if (!src) throw new Error('scan.html not found at any candidate path');
    const hasRetry = /for\s*\(\s*let\s+attempt\s*=\s*0;\s*attempt\s*<\s*2;[\s\S]{0,400}attempt\s*===\s*0\s*\)\s*await\s+new\s+Promise/.test(src);
    record('5. retry path exists in scan.html (static check)', hasRetry,
      hasRetry ? `found retry loop in ${found.split('/').slice(-2).join('/')}` : 'pattern not found');
  } catch (e) {
    record('5. retry path exists in scan.html', false, 'could not read scan.html: ' + e.message);
  }

  console.log('\nCleaning up uploaded test objects...');
  await cleanup();
  console.log(`Cleaned ${uploaded.length} object(s).`);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(async (e) => {
  console.error('FATAL:', e);
  await cleanup();
  process.exit(2);
});
