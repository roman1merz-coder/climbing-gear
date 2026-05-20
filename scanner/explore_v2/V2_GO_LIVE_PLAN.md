# V2 Scanner — Go-Live Plan

Drafted 2026-05-20. Status of every claim below was verified against the live code/DB on that date.

## 1. Where things stand today

The V2 rebuild is **interpretation-and-scoring complete but unwired**. The new engines (`target_resolver_v2`, `matrix_scorer_v2`, `interp_foot_shape_v2`, `interp_shoe_fit_v2`, `interp_what_to_look_for_v2`, `interp_shoe_desc_v2`) live in `scanner/explore_v2/` and are exercised only by `render_v2_review_static.py`, a static-HTML test harness. Nothing in the production path imports them.

What is already in place:

- **Results page** — `src/ScanResult.jsx` is already shape-compatible with V2 output. It renders `interpretation` as an array of `{title, paragraphs}` blocks, groups `recommendations` by `category` into the four tiers, and renders per-shoe description/why/tradeoffs plus measurement sliders. The V2 engines emit exactly this shape. Low risk here, but see W4 for the slider/overlay detail.
- **V2 capture flow** — `public/scan-testv2.html` is a complete capture-and-submit page with the four V2 question screens (discipline, environment, rock, aggressiveness), live at `/scan-testv2`.
- **DB-fed shoe dropdown** — shipped 2026-05-20 (commit 913b393): both `scan.html` and `scan-testv2.html` pull the current-shoe list from the live `shoes` table.

What is still V1:

- `scan_worker.py` imports and calls only the V1 `benchmark/*` engines. It reads no V2 inputs.
- `foot_scan_fits` has **no** `discipline` / `environment` / `rock_type` / `aggressiveness` columns (38 columns, none V2).
- `scan-testv2.html` collects the four V2 answers but keeps them in `localStorage` + URL hash only — `submitPreferencesAndProcess` never POSTs them. `api/scan` `handlePrefs` has no allow-list entry for them.
- The rescore / edit-preferences path (`EditInputsModal` → `op=rescore` → `_regenerate_from_stored`) carries only V1 fields.
- `/scan` still serves `scan.html` (V1 capture, no V2 questions).

The single biggest lift is the **worker cutover** (W3). `render_v2_review_static.py:main()` is effectively the reference implementation of what the worker must do — it already builds the V2 `interpretation` + `recommendations` objects; it just writes them to an HTML file instead of the DB.

---

## 2. Workstreams

### W1 — Database schema

1. Add four columns to `foot_scan_fits`: `discipline text`, `environment text`, `rock_type text` (nullable; null for indoor/both), `aggressiveness text`.
2. Decide a `pipeline_version` (or `scanner_version`) column so V1 and V2 rows are distinguishable and the worker can branch. Recommended — without it, mixed V1/V2 rows are ambiguous.
3. HVA threshold change (carried from `feedback_hva_threshold_pending`): raise the mild HVA threshold 0.25 → 0.28 in production `foot_measure.py`. Pronounced stays 0.35. Per decision 4 this affects new scans only — no backfill of existing rows (see W7).
4. RLS: the four new columns inherit the existing `foot_scan_fits` policy — no new policy needed, but confirm the `api/scan` service-role write still covers them.

Risk: low. Pure additive DDL. Must be applied before W2/W3 deploy (the API and worker reference the columns).

### W2 — Frontend capture flow

1. **Persist the V2 answers.** `scan-testv2.html` `submitPreferencesAndProcess` must include `discipline / environment / rock_type / aggressiveness` in the `prefs` POST. `api/scan/index.js` `handlePrefs` must add them to the allow-list, validate against fixed enums (discipline ∈ boulder/sport/trad_multipitch; environment ∈ indoor/outdoor/both; rock ∈ granite/limestone/sandstone/mixed or null; aggressiveness ∈ comfort/balanced/moderate/aggressive), and patch them onto the row.
2. **Promote the V2 page to `/scan`.** At go-live, `/scan` should serve the V2 flow. Either repoint the `vercel.json` rewrite `/scan → /scan-testv2.html` (simplest) or rename the file. Keep `/scanner-test.html` and `/scanner-test` 301s intact. **Decision 2:** keep the old `scan.html` reachable at a `/scan-v1` path through the transition window (do not archive it) — add a `vercel.json` rewrite for `/scan-v1 → /scan.html`.
3. **Carry forward early-version bug fixes.** `scan-testv2.html` was authored fresh — audit it against the fixes already proven in `scan.html`: the 0-byte upload bug (task #35), no `localStorage`-as-storage misuse for scan data, the processing-screen progress bar, the post-scan redirect, and the API-key handling (audit 2026-03-30). Diff the two capture/upload code paths and confirm parity. Do not assume the fresh page inherited them.

Risk: medium. The persist gap (#1) is the critical missing link; the page promotion (#2) is mechanical.

### W3 — Worker cutover (the main lift)

1. `scan_worker.py` `generate_recommendations` must call the V2 engines instead of the V1 `benchmark/*` ones. `render_v2_review_static.py:main()` already shows the exact call sequence: `resolve_targets_v2` → `compute_use_case_target` → `assemble_tiers` → `generate_foot_shape` / `_shoe_fit_with_artifact_filter` / `generate_what_to_look_for_v2` / `flatten_pick` + `generate_shoe_description_v2`. Port that logic into the worker, writing the resulting `interpretation` + `recommendations` to `foot_scan_fits` via `scan_recommender.update_scan` (the JSON shape already matches — array of `{title, paragraphs}` blocks; rec dicts with `slug/brand/model/category/recommended_size_eu/description/why/tradeoffs`).
2. Worker must **read the four V2 inputs** from the scan row and pass them through (`fetch_pending_scans` currently selects only V1 fields — add the four columns).
3. **V2 engine code home (decision 3).** For launch the worker imports the engines from `explore_v2/` as-is — the folder stays where it is. Promoting the `explore_v2/*_v2.py` modules to production locations (replacing `benchmark/*` usage) is a tracked follow-up task, not a go-live blocker.
4. **Recommended-size formula.** The worker currently uses `scan_recommender._calc_recommended_size` (anchor-based). V2 uses `calc_rec_size` in `render_v2_review_static.py` (street size − brand downsize, round down for performance / up for comfort). Port the V2 formula into the worker.
5. **Sole-overlay cleanup (decision 5).** `render_v2_review_static.py` strips the avg outline / HVA text / legend via `clean_sole_overlay.py` as a post-process. Production `foot_measure.py` still bakes those into the overlay PNG. Clean fix at the source: modify `foot_measure.py` to stop drawing the avg outline, HVA text, and legend, so new scans render a clean overlay directly. `clean_sole_overlay.py` is then not needed on the new-scan path.
6. Deploy mechanics: the worker runs via launchd on the Mac Mini off the iCloud-synced copy. After editing, verify iCloud sync, restart the launchd service, and confirm the Telegram watchdog sees it healthy.

Risk: high — this is the cutover. Mitigate with W8 (golden cases) and W9 (feature flag + rollback).

### W4 — Results page (`ScanResult.jsx`)

`ScanResult.jsx` already renders the V2 interpretation/recommendations shape. Remaining checks:

1. Verify it renders the V2 **5-tier** measurement bars (`MetricBar` with vl/lo/mid/hi/vh bands) and the **HVA "Big Toe Inward Drift"** slider, and that it uses the cleaned sole overlay. `render_v2_review_static.py` describes itself as a faithful clone of `ScanResult.jsx` — reconcile any divergence (the V2 5-tier work may have advanced the sandbox renderer ahead of the live React component).
2. Confirm the four new recommendation-tier subtitles ("Best fit to your use case and performance preference", etc.) are reflected — these were updated in the sandbox renderer 2026-05-20 and should match in `ScanResult.jsx`.
3. The "What This Means" / §1-§2-§3 section titles must match the V2 wording.

Risk: medium — depends entirely on how far `ScanResult.jsx` has drifted from the sandbox renderer. Needs a side-by-side diff before launch.

### W5 — Preference editing & rescore

1. `EditInputsModal` in `ScanResult.jsx` must expose the four V2 inputs as editable fields (discipline/environment/rock/aggressiveness), pre-filled from the stored row.
2. **Old V1 scans (decision 1):** a scan created before go-live has no V2 inputs. When the user opens the edit flow on such a scan, the four V2 questions must be presented as **required** (empty, must be answered) — the rescore cannot proceed to V2 until they are supplied. New (V2) scans pre-fill from the stored values.
3. `op=rescore` (`api/scan` `handleRescore`) must accept and patch the four V2 fields, and reject a rescore that lacks them (W6 enforcement).
4. `scan_worker.py` rescore handler (`check_rescore_scans` → `_regenerate_from_stored`) must read the V2 inputs and run the V2 engines — same cutover as W3, on the rescore path.

Risk: medium. Same engine wiring as W3, applied to the second entry point.

### W6 — Validation hardening ("save only if complete")

This is the explicitly-requested early-bug carry-over. Today validation is loose and inconsistent:

- `api/scan` `cleanShoes` keeps any entry with `brand OR model` and silently nulls a missing size/fit — partial shoe rows are saved.
- `scan-testv2.html` `validatePreferencesForm` requires full fields only for the **first** shoe; extra partial shoes pass.
- `ScanResult.jsx` `EditInputsModal.validate()` is already strict (every non-blank row needs all fields).

Fix to a single consistent rule, enforced at three layers:

1. **Per-screen progression gating (primary requirement, matches the current live version).** The user cannot advance to the next screen until the current screen's required data is complete. On a shoe-entry screen the "Next"/continue button stays disabled until brand + model + size + all three fit ratings are filled; on each preference question screen it stays disabled until that question is answered. No partial screen can be left behind.
2. **Form-submit validation** (client-side, both initial-submit and edit/rescore forms): a shoe entry is either **fully complete** (brand + model + size + all three fit ratings) or **fully empty** — never a partial row. Preferences (sex, street size, the four V2 inputs) must all be present.
3. **Server-side enforcement** (`api/scan` `handlePrefs` / `handleRescore`, the source of truth): reject incomplete payloads with a 400 and a clear message instead of cleaning-and-accepting. `cleanShoes` must stop silently nulling missing size/fit and silently keeping `brand`-only rows.

All three layers apply equally to the initial capture flow and the results-page edit/rescore flow.

Risk: low-medium. Touches the API and both forms; well-scoped.

### W7 — Existing-scan migration

~272+ scans were scored under V1 and have no V2 inputs. Decisions 1 and 4 (see §5):

- **Decision 1:** leave existing V1 results as-is. Only new scans, and rescores where the user supplies the four V2 preferences, get V2 output. Tag rows with `pipeline_version`. The edit/rescore flow on an old V1 scan must collect the four V2 inputs first (W5.2).
- **Decision 4:** the HVA threshold change (W1.3) applies to new scans only. Do **not** backfill or re-classify existing rows — old rows keep their stored `hallux_valgus_class`.

### W8 — Go-live gate: golden cases

(Task G, still pending.) Build a fixed set of **~15–20 golden test cases** — diverse foot profiles × preference combinations with hand-verified expected §1/§2/§3 + recommendations — and make passing them the hard gate before the worker cutover. Per decision 6, a single golden-case mismatch is a hard block (see §5a for the case-selection coverage and the fix-or-re-lock rule). The 13 skill-driven test cases in `explore_v2/test_cases_2026_05_16/` are a starting corpus but are review artifacts, not pass/fail golden cases. Convert a representative subset into deterministic golden cases with locked expected output.

### W9 — Deploy sequencing & rollback

1. **Feature flag** the worker: a `pipeline_version` check (or env flag) so the worker runs V1 or V2 per-scan / globally, and can be flipped back without a code revert.
2. Keep the V1 `benchmark/*` engines in place during the transition — do not delete until V2 is proven in production.
3. Vercel frontend and the Mac Mini worker deploy independently — sequence so the DB columns (W1) land first, then the API (W2.1), then the worker (W3), then flip `/scan` to the V2 page (W2.2).
4. Rollback: revert the `/scan` rewrite + flip the worker flag back to V1. The V1 path stays fully intact.

---

## 3. Suggested phasing

- **Phase 0 — gate:** W8 golden cases built and passing against the sandbox engines.
- **Phase 1 — schema:** W1 (columns + `pipeline_version` + HVA threshold). Additive, deployable with zero user impact.
- **Phase 2 — capture persistence:** W2.1 (persist V2 answers) + W6 (validation hardening). The four answers start landing in the DB even while the worker is still V1 (worker ignores unknown columns).
- **Phase 3 — worker cutover:** W3, behind the W9 feature flag, validated against W8. W5 rescore path in the same change.
- **Phase 4 — results + go-live:** W4 reconciliation, then W2.2 (flip `/scan` to the V2 page). Monitor via the existing Telegram watchdog + scan-audit task.
- **Phase 5 — cleanup:** W7 migration decision applied; retire V1 engines once V2 is stable.

---

## 4. Known limitations accepted at launch

Per Roman 2026-05-20, these stay open at go-live (see `explore_v2/test_cases_2026_05_16/BACKLOG.md`):

- **B6** — baseline tier has no hard foot-shape gate; a one-tier miss can still land in baseline.
- **B4** — thin price coverage; root cause is `shoe_prices` scraper data (empty `sizes_available`), handled separately.
- **B13** — §3 heel-depth caveat fires for shallow heels only, not deep.
- **R8 / B11** — identical per-axis tradeoff sentence can repeat across picks.

Other open backlog (B9, B16, B17, B10-extension done) — triage as post-launch polish unless Roman re-prioritises.

---

## 5. Decisions (Roman, 2026-05-20)

1. **Existing scans** — leave V1 results as-is; tag rows with `pipeline_version`. When a user edits/rescores an old (V1) scan, the edit flow must **collect the four V2 inputs first** (old rows have none) before it can re-score under V2. See W5.
2. **Old `scan.html`** — keep it reachable at `/scan-v1` (transition window), not archived.
3. **V2 engine code home** — worker imports the engines from `explore_v2/` as-is for launch. Promoting the modules to production locations stays a tracked follow-up task, not a go-live blocker.
4. **HVA** — apply the threshold change (mild 0.25 → 0.28) in `foot_measure.py` so new scans use it; do NOT backfill or re-classify existing rows.
5. **Sole overlay** — clean fix at the source: modify production `foot_measure.py` to stop baking the avg outline / HVA text / legend into the overlay PNG. New scans render clean; `clean_sole_overlay.py` is then unneeded for new scans.
6. **Go-live gate (W8)** — build ~15–20 golden cases; a single mismatch is a hard block on the worker cutover. Confirmed by Roman 2026-05-20. Detail below.

### 5a. The go-live gate

A "golden case" is a frozen test: a specific scan + preference set, with its **expected output written down and locked** (the exact §1/§2/§3 text and the exact 12 recommendations). The go-live gate works like this: before flipping the worker to V2, run every golden case through the V2 engine and compare the output to its locked expected version. If any case produces different output, that is a "regression" — something changed that we didn't intend.

Confirmed parameters:
- **Count:** ~15–20 golden cases, chosen to cover the dimension extremes (very narrow / very wide foot, shallow / deep heel, each toe shape, HVA mild/pronounced) crossed with the main preference combinations (each discipline, comfort vs aggressive).
- **Strictness:** a single golden-case mismatch is a **hard block** — the worker cutover does not proceed until the mismatch is either fixed or the expected output is deliberately re-locked.
