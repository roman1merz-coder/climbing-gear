# Security Fix - 2026-05-07

This commit closes the critical issues a reader reported on 2026-05-07:

1. The Supabase **service-role JWT** was embedded in five client-side files
   (`scan.html`, `scan-testv2.html`, `scan-admin.html`,
   `suggestion-admin.html`, `src/ScanResult.jsx`). Anyone hitting `/scan`,
   `/scan-testv2`, or any `/scan/{id}` results page could read it from page
   source, then read or modify any table or storage bucket in the project.
2. The admin pages were gated only by a **client-side SHA-256 password
   check** with the expected hash hardcoded in the HTML. Three trivial
   bypasses: precompute the hash and set `sessionStorage`, delete the gate
   `<div>` in DevTools, or skip the page entirely and use the embedded
   service-role key directly.
3. A follow-up audit confirmed Supabase **RLS was wide open** on the PII
   tables: with only the anon key (shipped to every browser), 126 real
   user emails were retrievable in a single curl call, and anon could
   INSERT/UPDATE/DELETE any row in `foot_scan_fits`.

All three are now closed. The legacy JWT keys have been hard-disabled in
Supabase, replaced with the new `sb_publishable_*` / `sb_secret_*` key
format. The admin pages are gated by HTTP Basic auth on the request,
before any HTML or JS is served. RLS now restricts anon to non-PII
columns and blocks all anon writes.

## All migration steps (now complete)

Each of these is documented for the audit trail and for anyone reproducing
the rotation pattern in the future. Marked *DONE* as of the time of this
commit.

### 1. Supabase legacy JWT keys disabled - DONE

Supabase has migrated from JWT-based legacy keys to a new format. Both
the leaked legacy `anon` JWT and the `service_role` JWT have been
**hard-disabled** in the dashboard. Both keys now return 401 when used
in the `apikey` header against the project's REST or storage endpoints.

The new keys are:
- **Publishable** (replaces legacy anon, public-safe):
  `sb_publishable_dG9yKzuhsr2DtSHIh9-cXg_DhZbfYkr`
- **Secret** (replaces legacy service-role, env-var only):
  `sb_secret_REDACTED` (also stored in macOS
  Keychain on the Mac Mini under service `climbing-gear-secret-key`,
  account `roman` -- *not yet stored, see "What is in the keychain"
  below for what is*)

Disable URL: https://supabase.com/dashboard/project/wsjsuhvpgupalwgcjatp/settings/api-keys/legacy

### 1c. RLS extended to catalog tables - DONE (2026-05-11)

Supabase's security advisor pinged the project with
`rls_disabled_in_public` because the catalog/price tables still had RLS
*off* (anon read worked by GRANT alone, with no default-deny safety
net). `supabase/migrations/20260511_enable_rls_on_catalog.sql` was
applied via the dashboard SQL editor. It enables RLS and adds an
explicit "anon select" policy on 25 catalog/price/history tables:
`shoes`, `ropes`, `belay_devices`, `crashpads`, `quickdraws`; all 8
`*_prices` tables plus the legacy `prices` table; all 7
`*_price_history` tables; and `brand_sizing`, `fit_cases`,
`shoe_reviews`. Anon SELECT still returns 200; anon INSERT/UPDATE/DELETE
now affects 0 rows (RLS hides them from those operations). Service-role
keeps bypassing RLS, so crawlers and the worker continue to write.

### 1b. RLS migration applied - DONE

`supabase/migrations/20260507_lock_pii_tables.sql` was applied via the
dashboard SQL editor on 2026-05-07. It:

- Enables RLS on `foot_scan_fits`, `foot_scan_fits_archive`, `feedback`,
  and the legacy `foot_scans` table.
- Revokes anon SELECT on `email` and `email_freq` columns of
  `foot_scan_fits` (column-level GRANT). Anon can only read non-PII
  columns.
- Removes any anon INSERT/UPDATE/DELETE policy on `foot_scan_fits`,
  defaulting all writes to denied.
- Revokes anon access entirely on `foot_scan_fits_archive`, `feedback`,
  and `foot_scans`.
- service_role bypasses RLS, so `/api/scan/*` and `/api/admin/*` keep
  working.

After this, `/scan/:id` results pages continue to render because
`ScanResult.jsx` reads the full row via `/api/scan?op=get` (server-side,
secret key bypasses RLS). The narrow poll still goes direct via the
publishable key since its columns (pipeline_stage etc.) are still
granted.

### 2. Vercel env vars - DONE

The following were set in the Vercel project (production + preview):

| Name                        | Value                                              |
| --------------------------- | -------------------------------------------------- |
| `SUPABASE_URL`              | `https://wsjsuhvpgupalwgcjatp.supabase.co`         |
| `SUPABASE_SERVICE_KEY`      | `sb_secret_REDACTED`        |
| `SUPABASE_PUBLISHABLE_KEY`  | `sb_publishable_dG9yKzuhsr2DtSHIh9-cXg_DhZbfYkr`   |
| `ADMIN_USER`                | `roman`                                            |
| `ADMIN_PASSWORD`            | (random 32-byte base64url, stored in macOS Keychain - see below) |
| `CRON_SECRET`               | unchanged (set on prior config, gates `/api/fetch-prices`) |
| `SERPAPI_KEY`               | unchanged                                          |
| `ANTHROPIC_API_KEY`         | unchanged                                          |

The env-var name `SUPABASE_SERVICE_KEY` is kept for backwards-compat with
the existing Node code that reads `process.env.SUPABASE_SERVICE_KEY`; its
*value* is now the new `sb_secret_*` key, not a JWT. A new variable
`SUPABASE_PUBLISHABLE_KEY` was added for any future code that wants the
public-safe key by name.

### 3. Mac Mini scan-worker - DONE

The launchd plist at
`/Users/rolfes/Library/LaunchAgents/com.climbing-gear.scan-worker.plist`
was updated with:

```xml
<key>EnvironmentVariables</key>
<dict>
  <key>SUPABASE_SECRET_KEY</key>      <string>sb_secret_...</string>
  <key>SUPABASE_PUBLISHABLE_KEY</key> <string>sb_publishable_...</string>
  <key>SUPABASE_SERVICE_KEY</key>     <string>sb_secret_...</string>  <!-- alias -->
</dict>
```

Worker reloaded with
`launchctl kickstart -k gui/$(id -u)/com.climbing-gear.scan-worker` and
verified processing a scan on the new key.

### 4. Python crawlers and scanner scripts - DONE

11 server-side Python scripts that previously had the legacy JWT
hardcoded now read from `os.environ["SUPABASE_SECRET_KEY"]`:

- `crawlers/run_all_crawlers.py`
- `crawlers/crawl_naturzeit.py`
- `crawlers/crawl_sportokay.py`
- `crawlers/crawl_oliunid.py`
- `crawlers/crawl_gigasport.py`
- `crawl_bergzeit.py`
- `crawl_naturzeit.py` (root-level dup)
- `snapshot_prices.py`
- `upload-instruction-imgs.py`
- `scanner/benchmark/matrix_scorer.py`
- `scanner/scan_recommender.py` (used by scan_worker.py)

The macOS-side env file `~/.cgkeys` (mode 0600, gitignored) exports the
secret + publishable keys for manual crawler runs:

```bash
source ~/.cgkeys && python3 crawlers/run_all_crawlers.py
```

The macOS file dup `crawl_bergzeit 2.py` was deleted.

## What is in the macOS Keychain

The admin Basic-auth password is stored in the keychain under
service `climbing-gear-admin`, account `roman`. Retrieve with:

```bash
security find-generic-password -a roman -s climbing-gear-admin -w
```

The Supabase secret key is **not** in the keychain (it is only in
`~/.cgkeys` and Vercel env vars). If you want it there too, add with:

```bash
security add-generic-password -a roman -s climbing-gear-secret-key \
  -w 'sb_secret_REDACTED' -U
```

## Verification (already run, results recorded)

| Probe | Expected | Actual |
| --- | --- | --- |
| Old anon JWT against REST | 401 | 401 |
| Old service_role JWT against REST | 401 | 401 |
| Publishable key, SELECT scan_id | 200 | 200 |
| Publishable key, SELECT email | 401 | 401 |
| Publishable key, INSERT row | 401 | 401 |
| Secret key, SELECT email | 200 | 200 |
| `/api/scan?op=get` (live site) | 200 | 200 |
| `/api/scan?op=status` | 200 | 200 |
| `/api/admin/scans` no auth | 401 + WWW-Authenticate | 401 |
| `/api/admin/scans` with auth | 200 | 200 |
| `/scan-admin.html` no auth | 401 + WWW-Authenticate | 401 |
| `/scan-admin.html` with auth | 200, serves admin HTML | 200 |
| Mac Mini scan-worker | processes a scan on new key | confirmed in worker.log |

## What changed in the code

### New files

- `api/_lib/supabase.js` - shared Supabase config for serverless functions.
  All secret-key usage flows through this module.
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
- `supabase/migrations/20260507_lock_pii_tables.sql` - the RLS migration.

### Moved files

- `public/scan-admin.html` -> `api/admin/_pages/scan-admin.html`
- `public/suggestion-admin.html` -> `api/admin/_pages/suggestion-admin.html`

`vercel.json` rewrites `/scan-admin.html` and `/suggestion-admin.html` to
the page-serving function. Existing bookmarks keep working.

### Modified files

- `src/supabase.js` - exports the new `sb_publishable_*` value as
  `SUPABASE_ANON_KEY` (name preserved for import compat).
- `public/scan.html`, `public/scan-testv2.html` - SB_KEY removed; all
  Supabase REST/Storage calls now go through `/api/scan/*`.
- `public/scan-browse.html` - now uses publishable key; switched from
  `select=*` to explicit granted column list (RLS lockdown rejects `*`).
- `src/ScanResult.jsx` - `SB_SERVICE_KEY` removed; email + rescore
  PATCHes go through `/api/scan` op:email and op:rescore. Full row
  fetch routes through `/api/scan?op=get` so EmailCapture pre-fill
  survives the RLS lockdown.
- `api/petz-feedback.js` - removed the hardcoded service-role fallback;
  now requires the env var and fails loudly if missing.
- `api/admin/_pages/*.html` - dropped the SHA-256 client-side gate; route
  through `/api/admin/*` instead of direct Supabase REST.
- `scripts/generate_seed.mjs`, `scripts/prerender.mjs` - publishable key.
- `scanner/browse_prototype.html` - publishable key.
- `scanner/scan_recommender.py`, `scanner/benchmark/matrix_scorer.py` -
  read secret key from env var.
- `crawlers/*.py`, `crawl_*.py` (root), `snapshot_prices.py`,
  `upload-instruction-imgs.py` - same env-var pattern.
- `public/robots.txt` - removed `/scan-admin.html` and
  `/suggestion-admin.html` entries (real protection is the auth gate).
- `CLAUDE-README.md` - redacted the service-role JWT in documentation.
- `vercel.json` - added rewrites for the admin pages, includeFiles for
  the page-serving function, and a 30s maxDuration for the upload
  endpoint.

### Deleted files

- `crawl_bergzeit 2.py` - macOS file duplicate.

## Residual risks (after this commit)

- **Targeted email lookup by scan_id.** With RLS locked down, mass-
  scraping emails through the publishable key is no longer possible. But
  anyone who knows a specific `scan_id` can still hit `/api/scan?op=get`
  and receive the email associated with it. `scan_id` is timestamped
  (`scan-YYYY-MM-DDTHH-MM-SS`), so partial enumeration is feasible.
  Full fix: mint a random `submit_token` at scan creation, store it on
  the row and in the user's local storage, require it on
  `/api/scan?op=get` and any PATCH op. See audit finding M2.
- **Storage bucket `foot-scans` is still public.** Photos are reachable
  by URL with no auth, and `scan_id`s are guessable. See audit finding H1
  for fix options (private bucket + signed URL endpoint, or random
  suffix in path).
- **No rate limiting on any endpoint.** See audit finding M1.
- **No CSRF/Origin check on /api/admin/\***. See audit finding H4.
- **AWIN feed apikey** still hardcoded in
  `crawlers/crawl_gigasport.py`. Server-side only, but a secret in repo.
  Move to env var.
- **Legacy JWT in git history.** Now useless since both keys are
  disabled at the API level, but anyone with repo access can mine the
  history and learn that the previous credentials existed in `eyJ...`
  form. Consider `git filter-repo --replace-text` if the repo is ever
  shared.

## Future hardening (audit suggestions, no code yet)

- Add a rate limit on `/api/scan/*` endpoints (Vercel Edge Config or a
  third-party lib).
- Move from a shared Basic-auth password to per-user accounts (Supabase
  Auth) once there is more than one admin.
- Add Sentry error reporting on the new `/api/admin/*` endpoints so
  failed Basic-auth attempts are visible.
- Add a strict `Content-Security-Policy` header (start in report-only
  mode).
