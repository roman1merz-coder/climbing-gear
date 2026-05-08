# Security architecture (post 2026-05-07)

This is the load-bearing reference for "what credential lives where" and
"what is the safe path for browser-side data to reach Supabase". Read it
before any change to `/scan`, `/api/scan/*`, `/api/admin/*`, the worker,
or the crawlers, otherwise you risk re-introducing the leak that closed
on 2026-05-07.

## Two keys, two roles

| Key | Where it lives | Role |
| --- | --- | --- |
| `sb_publishable_...` | `src/supabase.js` (browser bundle), `public/scan-browse.html`, `scripts/*.mjs`, `scanner/browse_prototype.html`, the `ANON_KEY` constant in each crawler | Public, read-only by RLS. Anyone holding it can only do what RLS permits anon to do. |
| `sb_secret_...` | Vercel env vars `SUPABASE_SERVICE_KEY` and `SUPABASE_PUBLISHABLE_KEY` (yes, both - one is the secret value and the other is the publishable, naming is historical), `~/.cgkeys` on the Mac Mini, the launchd plist for `scan-worker`. **Never** in any committed source file. | Bypasses RLS. Only ever used server-side: in `/api/*` serverless functions and in Python scripts running on the Mac Mini. |

The legacy JWT keys (`eyJ...`) were hard-disabled at the API level on
2026-05-07. They are dead. Do not try to "rotate them back" - the new
`sb_publishable_*` / `sb_secret_*` format replaces them.

## Where each component fits

```
                                   [BROWSER]
                                      |
       /scan, /scan-testv2,           |
       /scan/:id (ScanResult.jsx)     |
       /scan-browse.html              |
                                      |
            sb_publishable_*  -->     |  reads only
                                      v
                            [Supabase REST + Storage]
                                      ^                ^
                                      |                |
            sb_secret_*  -->          |                |  sb_secret_*
            (server-side only)        |                |
                                      |                |
                              [Vercel /api/*]   [Mac Mini scan-worker]
                                      ^                ^
                                      |                |
       browser fetches via            |                |  polls
       /api/scan/*                    |                |  pipeline_stage='pending'
       /api/admin/* (Basic auth)      |                |
                                                       |
                              [Crawlers, manual]
                                      ^
                                      |  source ~/.cgkeys
                                      |  python crawl_*.py
```

## RLS expectations (must stay this way)

`supabase/migrations/20260507_lock_pii_tables.sql` is the source of truth.
After it runs, the publishable role:

- **Can SELECT** non-PII columns of `foot_scan_fits` (everything except
  `email` and `email_freq`). Anything anon-readable must be added to the
  column-level GRANT in that migration.
- **Cannot SELECT** any column of `foot_scan_fits_archive`, `feedback`,
  or the legacy `foot_scans` table.
- **Cannot INSERT/UPDATE/DELETE** on any of the four tables.
- Can SELECT the catalog tables (`shoes`, `prices`, `price_history`,
  `ropes`, `crashpads`, `quickdraws`, `brand_sizing`, `fit_cases`).

If you add a new PII column to `foot_scan_fits`, do NOT add it to the
GRANT list. If you add a new public-safe column, add it to the GRANT
list and to `public/scan-browse.html`'s `cols` constant (which has an
explicit list because anon SELECT * is rejected).

## Where browser-side writes go

There is exactly one path: through `/api/scan/*`. The endpoints are
documented at the top of `api/scan/index.js` and `api/scan/upload.js`.

| Browser action | Endpoint | Op |
| --- | --- | --- |
| Upload a sole or side photo | `POST /api/scan/upload?scan_id=X&view=sole|side` | (raw image/jpeg body) |
| Mark a scan pending so the worker picks it up | `POST /api/scan` | `op: "init"` |
| Save shoe-fit + sex + street size + email | `POST /api/scan` | `op: "prefs"` |
| Save email + email_freq later | `POST /api/scan` | `op: "email"` |
| Trigger a re-score after editing inputs | `POST /api/scan` | `op: "rescore"` |
| Trigger pipeline re-run after a retake | `POST /api/scan` | `op: "retake"` |
| Poll status during processing | `GET /api/scan?op=status&scan_id=X` | |
| Read full row for results page | `GET /api/scan?op=get&scan_id=X` | |
| Look up queue position | `GET /api/scan?op=queue` | |

If you find yourself wanting to add direct `fetch('https://...supabase.co/rest/v1/foot_scan_fits...')`
to anything in `public/` or `src/`, **stop**. Add a new op to
`/api/scan/` instead.

## Where admin-side writes go

There is exactly one path: through `/api/admin/*` and the Basic-auth
gate in `api/_lib/admin-auth.js`. The admin HTML lives in
`api/admin/_pages/` (the underscore prefix tells Vercel not to serve it
directly). `vercel.json` rewrites `/scan-admin.html` and
`/suggestion-admin.html` to `/api/admin/page` so existing bookmarks
keep working.

If you want a new admin tool:

1. Add an HTML file to `api/admin/_pages/`.
2. Add an entry in the `PAGES` map in `api/admin/page.js`.
3. Add a `vercel.json` rewrite from the public-facing path to
   `/api/admin/page?p=yourkey`.
4. Have the page call new endpoints under `/api/admin/yourtool` that
   start with `if (!requireAdmin(req, res)) return;`.

Do not put admin HTML in `public/` and do not skip the `requireAdmin`
guard.

## Fit-value enums (must stay in sync across 4 places)

The 2026-05-07 incident was caused by these three lists drifting out of
sync. If you change one, change the other two:

| Surface | Location | Form per-dimension values |
| --- | --- | --- |
| Form HTML (what the user clicks) | `public/scan.html` and `public/scan-testv2.html`, `data-val` attributes inside `.fit-options` blocks | toes: `squeezed`/`perfect`/`roomy` &nbsp; forefoot: `tight`/`perfect`/`loose` &nbsp; heel: `tight`/`perfect`/`empty` |
| API allow-list (what gets persisted) | `FIT_VALUES` set in `api/scan/index.js` | must include every value the form can submit, plus `null`/`""` |
| Interpretation engine (what the worker reads) | `scanner/benchmark/interp_shoe_fit.py` (`_issue_implication`, `_universal_issue_text`, `_majority_issue_text`, `_contradiction_text`) | every value that flows through must have a sentence pattern, otherwise the engine prints an awkward fallback |
| Display (what the results page renders) | `FitBadge` palette + `FIT_LABELS` map in `src/ScanResult.jsx` | every value needs a colour and a label, else the badge falls back to the raw token |

If you add a fourth fit choice (say `slightly-tight`), all four surfaces
need updating *in the same commit*. Forgetting any one of them will
silently drop or mis-render that value.

## Storage bucket

`foot-scans` is a public bucket. Photo URLs are guessable from the
timestamped `scan_id`. This is a known residual risk (audit finding H1).
Do not treat photo URLs as secret. Do not log them anywhere indexed by
search engines. If a future change wants to make the bucket private,
note that the worker, the API endpoints, and the public scan results
page all currently rely on the public URLs.

## Things that must NEVER end up in committed code

| Pattern | If you see it being introduced |
| --- | --- |
| `eyJhbGciOiJIUzI1NiIs...` (JWT-shaped string) | The legacy keys are dead but a fresh JWT in source is still wrong. Use env var. |
| `sb_secret_...` | Server-side secret. Vercel env var or `~/.cgkeys` only. |
| Hardcoded `ADMIN_PASSWORD` | macOS Keychain on the Mac Mini, Vercel env var elsewhere. |
| AWIN feed apikey (currently still in `crawlers/crawl_gigasport.py`, audit finding M4) | Move to env var when convenient. |
| `service_role` as a literal string in browser-shipped code | Use `/api/scan/*` instead. |
| Direct `fetch` to `https://wsjsuhvpgupalwgcjatp.supabase.co/rest/...` from anything in `public/` or `src/` that does anything other than read non-PII columns with the publishable key | Move it server-side. |

GitHub secret-scanning push protection is enabled on this repo and will
block pushes that contain a `sb_secret_*` value. If your push is
rejected with that message, the secret has leaked into your diff -
redact and recommit; do *not* use the dashboard "allow this secret"
unblock link.

## Verification commands

After any change to scanner or admin code, run these and confirm:

```bash
# Anon must NEVER read email
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
  "$SUPABASE_URL/rest/v1/foot_scan_fits?select=email&limit=1"
# Expected: HTTP 401

# Admin must always require auth
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  "https://www.climbing-gear.com/api/admin/scans?op=list"
# Expected: HTTP 401

# Old leaked JWTs must always 401
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -H "apikey: <old eyJ... value>" \
  -H "Authorization: Bearer <old eyJ... value>" \
  "$SUPABASE_URL/rest/v1/foot_scan_fits?select=count"
# Expected: HTTP 401
```

If any of these change behaviour, you have re-opened the 2026-05-07
hole. Stop and revert.
