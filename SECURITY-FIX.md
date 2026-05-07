# Security Fix - 2026-05-07

This commit closes two critical issues a reader reported on 2026-05-07:

1. The Supabase **service-role JWT** was embedded in five client-side files.
   Anyone hitting `/scan`, `/scan-testv2`, or any `/scan/{id}` results page
   could read it from page source, then read or modify any table or storage
   bucket in the Supabase project.
2. The admin pages (`/scan-admin.html`, `/suggestion-admin.html`) were gated
   only by a **client-side SHA-256 password check** with the expected hash
   hardcoded in the HTML. Three trivial bypasses: precompute the hash and
   set `sessionStorage`, delete the gate `<div>` in DevTools, or skip the
   page entirely and use the embedded service-role key directly.

The committed code change moves all writes server-side and gates the admin
pages with HTTP Basic auth on the request, before any HTML or JS is served.

## You must do this part yourself

The leaked JWT remains valid until you rotate it. Anyone who scraped it
between when the site went live and now retains full DB access until then.

### 1. Rotate the service-role JWT

1. Open https://supabase.com/dashboard/project/wsjsuhvpgupalwgcjatp/settings/api
2. Under **Project API keys -> service_role secret**, click **Reset**.
3. Copy the new key. Store it in your password manager.

The old key (`...6cYE1ElsvX7-BTc1DD15zoPJyr4L3bN0_QyKRQmp3M4`) is now
invalid for any new request.

### 1b. Apply the RLS migration

Independent of rotation, the public anon key today can read user emails
straight out of `foot_scan_fits` (verified live during the audit: 126 real
emails pulled in one curl). Apply the migration that locks that down:

1. Open the Supabase dashboard SQL editor for project `wsjsuhvpgupalwgcjatp`.
2. Paste the contents of `supabase/migrations/20260507_lock_pii_tables.sql`.
3. Run.
4. Verify with the queries listed at the bottom of that file (run them as
   the anon role - the SQL editor has a role switcher, or use curl with
   the anon JWT).

After this, `/scan/:id` results pages will continue to render because
`ScanResult.jsx` now reads the full row via `/api/scan?op=get` (server-
side, service-role bypasses RLS). The narrow poll still goes direct via
anon REST since its columns (pipeline_stage etc.) are still granted.

### 2. Set Vercel env vars

Open https://vercel.com/dashboard/[your-team]/climbing-gear/settings/environment-variables and
ensure these exist for **Production**, **Preview**, and **Development**:

| Name                 | Value                                                                       |
| -------------------- | --------------------------------------------------------------------------- |
| `SUPABASE_URL`       | `https://wsjsuhvpgupalwgcjatp.supabase.co`                                  |
| `SUPABASE_SERVICE_KEY` | the NEW service-role key from step 1                                      |
| `ADMIN_USER`         | optional, defaults to `admin`                                               |
| `ADMIN_PASSWORD`     | a long random string. Pick fresh; do NOT reuse the old SHA-256 password.    |
| `SERPAPI_KEY`        | unchanged, kept for `/api/fetch-prices`                                     |

After saving, redeploy: `vercel --prod` or push any commit. The new env
vars only apply to deployments built after they were saved.

### 3. Update the Mac Mini scan_worker

`scan_worker.py` on the Mac Mini polls Supabase with the service-role key.
After rotation it will start failing with 401s.

```bash
# On the Mac Mini, edit the launchd plist (or .env) used by scan_worker
# and replace the SUPABASE_SERVICE_KEY value with the new one, then:
launchctl kickstart -k gui/$(id -u)/com.climbing-gear.scan-worker
launchctl list | grep scan-worker        # confirm it's running
tail -f /Users/rolfes/foot-scanner/worker.log
```

A scan submitted from `/scan` should reach `pipeline_stage='complete'`
within ~15s of upload.

### 4. Verify the fix in the browser

1. Visit https://www.climbing-gear.com/scan-admin.html.
   Browser must show a native Basic-auth prompt before any HTML loads.
2. Cancel the prompt. Browser must show 401, not the admin UI.
3. Authenticate. Page renders, `loadData()` succeeds.
4. Visit https://www.climbing-gear.com/scan, submit a scan, confirm:
   - Photos upload (status `Uploaded!`)
   - Pipeline runs (`pipeline_stage` advances past `pending`)
   - Results render
5. Open DevTools -> Network -> view the JS bundle and `scan.html`.
   Search for `service_role` and `eyJ`. Neither should match.

### 5. Look for abuse in Supabase logs

Open https://supabase.com/dashboard/project/wsjsuhvpgupalwgcjatp/logs/api-logs and
filter on:
- requests with `apikey: <old service-role JWT>` (now 401)
- DELETE requests on any table from IPs not yours
- Mass SELECT on `foot_scan_fits` (the PII table)

If anything looks wrong, escalate. Otherwise the leak window is closed.

## What changed in the code

### New files

- `api/_lib/supabase.js` - shared Supabase config for serverless functions.
  All service-role usage flows through this module.
- `api/_lib/admin-auth.js` - HTTP Basic auth guard with timing-safe compare.
- `api/scan/upload.js` - replaces direct `/storage/v1/object/foot-scans` POSTs.
- `api/scan/index.js` - replaces direct `/rest/v1/foot_scan_fits` REST calls
  for the public scanner. Dispatches on `op` (init/prefs/email/rescore/retake/
  status/queue/get).
- `api/admin/scans.js` - admin CRUD on foot_scan_fits and storage. Basic-auth
  gated.
- `api/admin/feedback.js` - admin CRUD on the feedback table. Basic-auth gated.
- `api/admin/page.js` - serves the admin HTML files only after Basic-auth
  passes. Reads from `api/admin/_pages/` (which Vercel does not serve
  directly because of the underscore prefix).

### Moved files

- `public/scan-admin.html` -> `api/admin/_pages/scan-admin.html`
- `public/suggestion-admin.html` -> `api/admin/_pages/suggestion-admin.html`

`vercel.json` rewrites `/scan-admin.html` and `/suggestion-admin.html` to
the page-serving function. Existing bookmarks keep working.

### Modified files

- `public/scan.html`, `public/scan-testv2.html` - SB_KEY removed; all
  Supabase REST/Storage calls now go through `/api/scan/*`.
- `src/ScanResult.jsx` - `SB_SERVICE_KEY` removed; email + rescore PATCHes
  go through `/api/scan` op:email and op:rescore.
- `api/petz-feedback.js` - removed the hardcoded service-role fallback;
  now requires the env var and fails loudly if missing.
- `api/admin/_pages/*.html` - dropped the SHA-256 client-side gate; route
  through `/api/admin/*` instead of direct Supabase REST. The pages are
  not reachable without Basic auth in the first place.
- `public/robots.txt` - removed `/scan-admin.html` and
  `/suggestion-admin.html` entries (they were advertising the URLs;
  real protection is the auth gate, not robots.txt).
- `CLAUDE-README.md` - redacted the service-role JWT in the documentation.
- `vercel.json` - added rewrites for the admin pages, includeFiles for the
  page-serving function, and a 30s maxDuration for the upload endpoint.

## Residual risks (after this commit, before further hardening)

- **Targeted email lookup by scan_id.** With RLS locked down, mass-scraping
  emails through the anon key is no longer possible. But anyone who knows
  a specific `scan_id` can still hit `/api/scan?op=get` and receive the
  email associated with it. `scan_id` is timestamped (`scan-YYYY-MM-DDT
  HH-MM-SS`), so partial enumeration is feasible. A targeted attacker
  would still need to guess the second granularity. Full fix: mint a
  random `submit_token` at scan creation, store it on the row and in the
  user's local storage, require it on `/api/scan?op=get` and any PATCH op.
  See audit finding M2.
- **Storage bucket `foot-scans` is still public.** Photos are reachable
  by URL with no auth, and `scan_id`s are guessable. See audit finding H1
  for fix options (private bucket + signed URL endpoint, or random suffix
  in path).
- **No rate limiting on any endpoint.** See audit finding M1.
- **No CSRF/Origin check on /api/admin/\***. See audit finding H4.
- **CRON_SECRET unset = `/api/fetch-prices` open.** See audit finding H2.
- **Service-role JWT remains in 11 server-side Python scripts** that need
  the env-var migration before rotation can complete (crawlers, scanner
  utilities). See audit finding C4 for the file list.

## Future hardening (audit suggestions, no code yet)

- The committed key remains in git history. After rotation it's useless,
  but consider running `git filter-repo --replace-text` to strip it from
  history before the repo is shared more widely.
- Add a rate limit on `/api/scan/*` endpoints (Vercel Edge Config or a
  third-party lib). Currently there is no abuse mitigation on the public
  scanner submit endpoints beyond standard Vercel quotas.
- Move from a shared Basic-auth password to per-user accounts (Supabase
  Auth) once there is more than one admin.
- Add Sentry error reporting on the new /api/admin/* endpoints so failed
  Basic-auth attempts are visible.
- Add a strict `Content-Security-Policy` header (start in report-only mode).
