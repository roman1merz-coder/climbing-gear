# CLAUDE-README - Project-Specific Rules for AI Agents

This file contains rules discovered and validated during data work sessions.
These rules are NON-NEGOTIABLE and must always be followed.

## Knowledge Wiki

For deeper context beyond rules, read the relevant file in `docs/` before working on that area:

- **[docs/architecture.md](docs/architecture.md)** - Component map, routing, data flow, build process, hooks, shared modules
- **[docs/schemas.md](docs/schemas.md)** - All Supabase table schemas with column types and notes
- **[docs/scanner.md](docs/scanner.md)** - Foot scanner pipeline, POP values, recommendation rules, gotchas
- **[docs/patterns.md](docs/patterns.md)** - Code conventions, design system, data sync workflow, SEO, analytics
- **[docs/crawlers.md](docs/crawlers.md)** - Price crawler infrastructure, retailer list, how to run

These docs are the project's persistent knowledge base. Update them when making significant changes.

---

## No Em Dashes (NON-NEGOTIABLE)

**Never use em dashes (—) anywhere in this project** - not in code, comments, copy, JSON, HTML, or any file.
- Always use a regular hyphen/dash (-) instead
- Users perceive em dashes as a telltale sign of AI-generated text
- This applies to all user-facing text, code comments, commit messages, and data

---

## Graphics Rule (NON-NEGOTIABLE)

**NEVER attempt to programmatically draw, trace, or generate images/overlays.**
- Do NOT use edge detection, thresholding, or any image-processing trick to "trace" outlines from photos
- Do NOT generate PNGs from pixel data or try to create silhouettes from reference images
- If a graphic asset (SVG, PNG, overlay) already exists, use it as-is - transform it with CSS (rotate, scale, translate) instead of recreating it
- If a new graphic is genuinely needed, ask Roman to provide it

---

## Analytics (PostHog)

| Field | Value |
|-------|-------|
| Service | PostHog (EU cloud) |
| Dashboard | https://eu.posthog.com/project/135032/ |
| API Key | `phc_OkrxqJzUXVGEdKKvbuAMZ5jdZ2R9Vp9GItLNYW9UIWe` |
| Host | `https://eu.i.posthog.com` |
| Config file | `src/posthog.js` |

**How it works:**
- Base analytics (pageviews, autocapture, custom events) runs in **cookieless/memory mode** - no GDPR consent needed
- Session replays are **opt-in** via the cookie consent banner (analytics category)
- Disabled in dev mode (`import.meta.env.DEV`), respects Do Not Track
- SPA pageviews tracked via `PostHogPageView` component in `main.jsx` (fires on every route change)
- Affiliate link clicks auto-tracked via global click listener (AWIN URLs)

**Custom events tracked:**
- `$pageview` - on every route change (SPA-aware)
- `affiliate_click` - when user clicks an AWIN affiliate link (properties: retailer, product_slug, destination_url, page_path)
- `outbound_click` - when user clicks any external link (properties: url, page_path)
- Autocapture covers all other clicks, form submits, etc.

**Adding new custom events:**
```js
import { trackEvent } from "./posthog.js";
trackEvent("event_name", { key: "value" });
```

---

## Rubber Thickness Rule (NON-NEGOTIABLE)

`rubber_thickness_mm` = **sole/outsole/front rubber thickness ONLY**.
- Use the "Rubber front" field from manufacturer specs
- NEVER use "Rubber rand" thickness as sole thickness
- If a model has no "Rubber front" data, leave `rubber_thickness_mm` as NULL
- Rand thickness is typically 1.5–2.0mm and is NOT the sole

## Rubber Hardness Rule (NON-NEGOTIABLE)

`rubber_hardness` = **sole rubber compound hardness ONLY**.
- Determined by the SOLE rubber compound, not rand or heel
- If sole compound is unknown, check the product page "Rubber" field (not just the spec table)
- The "Rubber" field on Red Chili product pages = sole rubber
- Store as JSON array, e.g. `["medium"]`

### Red Chili Rubber Compound → Hardness Mapping (softest → hardest)

| Compound | DB value | Shore | Notes |
|----------|----------|-------|-------|
| Vibram XS Grip | `soft` | ~45° | Stickiest, performance, high-end models |
| RX-1 ALLROUND | `soft` | 50° | Balanced friction/edge/durability - soft in industry context |
| RX-2 TECHGRIP | `medium` | ~55° | Edge stability, more rigid |
| RX-3 ENDURANCE | `hard` | ~60°+ | Max durability, rental/gym shoes |

## Closure Rule (NON-NEGOTIABLE)

Closure classification is based on **user experience**, not marketing names:
- **velcro**: If you can quickly open and close it (straps, VCR, speed-lace + velcro combos)
- **lace**: If you have to knot laces
- **slipper**: If there is no closure mechanism at all

Examples:
- "Slipper Single VCR" = **velcro** (has a VCR strap)
- "VCR / Technora Lace" = **velcro** (speed-lace secured by velcro, no knotting)
- "Lace / VCR" = **velcro** (fast-lace with velcro, no knotting)
- "Asymmetrical Lace" = **lace** (traditional lacing, must knot)
- "Double VCR" = **velcro**

## Downturn & Asymmetry Enums (4 levels each)

**`downturn`** - 4-value enum (low → high):
`flat` → `slight` → `moderate` → `aggressive`

**`asymmetry`** - 4-value enum (low → high):
`none` → `slight` → `moderate` → `strong`

## Vegan Determination (NON-NEGOTIABLE)

`vegan` does **NOT** depend only on upper material. ALL components matter:
- Upper, Lining, Footbed, Tongue, Glues, Insole, Rand materials
- If ANY component contains leather/suede/animal-derived material → NOT vegan
- "Suede leather footbed" = NOT vegan (even if upper is synthetic)
- A synthetic/microfiber upper alone does NOT make a shoe vegan
- Only mark `vegan = true` if manufacturer explicitly markets it as vegan or ALL components confirmed animal-free
- When in doubt, leave `vegan = false`

## Shoe Weight Rule (NON-NEGOTIABLE)

`weight_g` in the `shoes` table is **ALWAYS pair weight** (both shoes combined).
- The site displays pair weight everywhere - never single shoe weight
- Manufacturers often list single-shoe weight in specs - ALWAYS multiply by 2 before storing
- Any adult (non-kids) shoe under ~300g pair weight is suspicious and must be verified
- When sourcing weight from retailer pages, check whether they state "per shoe" or "per pair"


## Foot Scanner

The foot scanner lives at `climbing-gear.com/scan` (static HTML scan.html, rewritten via vercel.json). Old URL `/scanner-test.html` 301-redirects to `/scan`.

### Flow
1. User takes 2 photos: **sole** and **side** (no other views)
2. Photos upload to Supabase Storage bucket `foot-scans` under `scans/{scanId}-sole.jpg` and `scans/{scanId}-side.jpg`
3. User fills in shoe fit questionnaire: sex, street shoe size (EU), climbing shoes (brand, model, EU size, fit ratings for toes/forefoot/heel)
4. User optionally enters email, then hits Done
5. Shoe fit data saves to `foot_scan_fits` table

### Single Source of Truth: `foot_scan_fits` table (NON-NEGOTIABLE)
Everything for one scan lives in **one row** in `foot_scan_fits`, matched by `scan_id`. Photos, shoe fit data, and analysis results all share the same `scan_id` (e.g. `scan-2026-03-05T13-35-21`). Never create separate tables for scan results -- always write to `foot_scan_fits`.

**Columns -- user-submitted data:**
- `scan_id` (text) -- matches photo filenames, e.g. `scan-2026-03-05T13-35-21`
- `sex` (text) -- male/female
- `street_size_eu` (numeric) -- EU street shoe size
- `shoes` (jsonb) -- array of `{ brand, model, size_eu, fit: { toes, forefoot, heel } }`
- `email` (text) -- optional user email
- `created_at` (timestamptz)

**Columns -- analysis results (written after AI processes photos):**
- `toe_shape` (text) -- egyptian/greek/roman/celtic/germanic
- `toe_confidence` (numeric) -- 0-1
- `width_ratio` (numeric) -- forefoot_width / foot_length
- `heel_ratio` (numeric) -- heel_width / foot_length
- `arch_ratio` (numeric) -- ball position as fraction of foot length from heel
- `instep_ratio` (numeric) -- instep height / foot length
- `navicular_ratio` (numeric) -- navicular height ratio
- `volume` (text) -- low/medium/high
- `width` (text) -- narrow/medium/wide
- `heel_width` (text) -- narrow/medium/wide
- `confidence` (text) -- low/medium/high
- `notes` (text) -- analysis notes
- `landmarks` (jsonb) -- raw landmark coordinates

**Workflow for analysis results:**
1. Row already exists (created when user submits shoe fit data)
2. UPDATE the existing row by matching `scan_id`: `PATCH /rest/v1/foot_scan_fits?scan_id=eq.{scanId}` with analysis fields
3. If no row exists yet (user only uploaded photos, skipped shoe fit), INSERT a new row with just `scan_id` + analysis fields

- **`foot_scans`** -- legacy table from old 3-photo analyze-foot API (no longer populated, kept for reference)

### Storage
- Bucket: `foot-scans` (public)
- Path: `scans/{scanId}-sole.jpg`, `scans/{scanId}-side.jpg`
- Instruction images also in `scans/instruction-sole.jpg`, `scans/instruction-side.jpg`

### Admin
- `climbing-gear.com/scan-admin.html` -- dashboard showing all scans with photos, shoe data, and emails. Auto-refreshes every 30s.

### Supabase Access (Scanner)
- **Project URL:** `https://wsjsuhvpgupalwgcjatp.supabase.co`
- **Service-role key (read+write):** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2MDc5MSwiZXhwIjoyMDg2MTM2NzkxfQ.6cYE1ElsvX7-BTc1DD15zoPJyr4L3bN0_QyKRQmp3M4`
- **Anon key (read-only):** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjA3OTEsImV4cCI6MjA4NjEzNjc5MX0.QH3wFa14gSvRKOz8Q099sbKvKoSroGJfPerdZgPtbTI`
- The scanner HTML embeds the service-role key for storage uploads and table inserts
- To pull data: `GET /rest/v1/foot_scan_fits?select=*` with service-role key in `apikey` + `Authorization: Bearer` headers
- To list photos: `POST /storage/v1/object/list/foot-scans` with body `{"prefix":"scans/","limit":500,"offset":0,"sortBy":{"column":"created_at","order":"desc"}}`

### Static HTML Pages
These pages are excluded from the Vercel SPA rewrite in `vercel.json`: `scanner-test.html`, `scan-admin.html`, `shoe-fit-v2.html`.

---

## Scan Analysis Pipeline (Mac Mini M4 Pro, 64GB)

The scan analysis pipeline runs on Roman's Mac Mini (M4 Pro, 64GB) via `scan_worker.py` (launchd service). It is **fully automated and deterministic** - no LLM or API calls needed.

### Production Pipeline (scan_worker.py)

`scan_worker.py` polls Supabase every 5s for rows with `pipeline_stage='pending'`. When found:

1. **SAM3 segmentation** (~8s) - segments foot from background, normalizes orientation, measures proportions, generates overlays
2. **Upload** - overlays to Supabase Storage, measurements to `foot_scan_fits` row
3. **Deterministic interpretation** (~1s) - four rule-based engines generate all text:
   - `interp_foot_shape.py` - Section 1: "Your Foot Shape"
   - `interp_shoe_fit.py` - Section 2: "What Your Current Shoe Fit Tells Us"
   - `interp_what_to_look_for.py` - Section 3: "What to Look For"
   - `interp_shoe_desc.py` - Per-shoe P1 (description), P2 (why selected), P3 (tradeoffs)
4. **Matrix scoring** - `matrix_scorer.py` scores all shoes deterministically, selects 12 recs in 4 tiers (baseline, softer, stiffer, budget)
5. **Write results** - interpretation + recommendations written to Supabase, `pipeline_stage` set to `'done'`

Total: ~10-15s per scan, $0/scan. No Sonnet API, no LLM.

### Worker Management
```bash
# Restart worker (after code changes):
launchctl kickstart -k gui/$(id -u)/com.climbing-gear.scan-worker

# Check worker status:
launchctl list | grep scan-worker
```

### Location
- **Worker:** `/Users/rolfes/foot-scanner/scan_worker.py` (symlink to iCloud climbing-gear/scanner/)
- **Measurement code:** `/Users/rolfes/foot-scanner/foot_measure.py`
- **Interp engines:** `/Users/rolfes/foot-scanner/benchmark/interp_*.py` (synced via iCloud)
- **Server (debug only):** `/Users/rolfes/foot-scanner/server.py` (FastAPI, port 8787)
- **Test scans:** `/Users/rolfes/foot-scanner/test_scans/`
- **Results:** `/Users/rolfes/foot-scanner/results/`
- **Silhouette SVG:** `/Users/rolfes/graphics/foot bottom.svg` (symlink to iCloud)

### Legacy Modules (NOT used in production)
- `scan_llm_sonnet.py` - Anthropic Sonnet API module (was ~$0.05/scan, ~55s). Replaced by deterministic engines.
- `scan_llm.py` - Local fine-tuned Qwen 3.5 27B via MLX-LM. Replaced by deterministic engines.
- `server.py` async endpoints - still work for local/debug but NOT used by production frontend.

### Manual Pipeline (debug/reprocess only)

**Start server (if not running):**
```bash
cd /Users/rolfes/foot-scanner
python3 -m uvicorn server:app --host 0.0.0.0 --port 8787
```
Verify: `curl http://localhost:8787/health` should return `{"status":"ok","model_loaded":true}`

**Run analysis via /process-scan:**
```bash
curl -X POST http://localhost:8787/process-scan \
  -F "sole=@/path/to/sole.jpg" \
  -F "side=@/path/to/side.jpg" \
  -F "scan_id=scan-2026-03-06T08-33-33" \
  -F "out_dir=/Users/rolfes/foot-scanner/results"
```

### Sole Processing Pipeline (sole_measure.py)
1. **Segment** - SAM3 model segments the foot from background (prompt: "foot")
2. **Normalize orientation** - two-pass rotation:
   - Pass 1: minAreaRect rough alignment (long axis vertical)
   - Pass 2: heel-center to 2nd-toe-tip fine alignment (iterates until < 0.5 deg residual)
   - `_rotate_and_crop()` helper ensures mask + image undergo identical transforms
   - `_ensure_toes_at_top()` flips 180 deg if toes are at bottom
   - Output mask is 0/1 uint8 (NOT 0/255 - draw_sole_overlay multiplies by 255)
3. **Measure** - extracts foot_length, ball_width, heel_width, arch_length, toe_shape, toe tips
4. **Draw overlay** - `draw_sole_overlay(None, mask, measurements, out_path)`:
   - First arg is None (no photo panel - website only shows the diagram)
   - Amber semi-transparent fill for scan shape, grey outline for silhouette reference
   - Silhouette is flipped horizontally (`cv2.flip(sil_r, 1)`) to match scan orientation
   - No text labels on the diagram (website renders these in the right panel)
   - Green measurement lines: forefoot width, heel width, arch length bracket, toe tip dots
   - Legend at bottom: "Average" (grey) + "Your foot" (amber)

### Population Reference Values (POP)
These are in sole_measure.py AND src/ScanResult.jsx (must be kept in sync). They define what "average" means for classifications and range bars:
```python
POP = {
    "width_ratio":      {"mean": 0.383, "std": 0.021},  # ball_width / foot_length
    "arch_ratio":       {"mean": 0.700, "std": 0.025},  # arch_length / foot_length
    "heel_ratio":       {"mean": 0.251, "std": 0.018},  # heel_width / foot_length (NOT ball_width!)
    "instep_ratio":     {"mean": 0.290, "std": 0.030},  # instep_height / foot_length (peak arch, full length)
    "heel_depth_ratio": {"mean": 0.070, "std": 0.025},  # heel_protrusion / foot_length (2D side photo)
}
```

Sources for POP values (updated 2026-03-06):
- width_ratio: Foot index literature, Nepalese study (PMC11455646), Jurca et al. 2019
- heel_ratio: Same studies. NOTE: was previously heel_width/ball_width (0.655) — WRONG. Now heel_width/foot_length.
- instep_ratio: AHI literature (standing ~0.34 on truncated length), adjusted for our method (peak arch height, full foot length). Old value 0.232 was from website v1 and made every scan "low instep".
- heel_depth_ratio: No direct literature equivalent. Derived from calcaneal CT anatomy (Qiang 2014) + our scan data. Wide std — needs calibration as more scans arrive.

### ScanResult.jsx Range Bars (Website)
The website (src/ScanResult.jsx) has POP and META definitions that MUST match the pipeline values above. Updated in commit 74bd968. META min/max define the visual scale of each bar:
- width_ratio: [0.32, 0.46]
- arch_ratio: [0.61, 0.77]
- heel_ratio: [0.20, 0.31]
- instep_ratio: [0.20, 0.38]
- navicular_ratio (heel depth): [0.00, 0.15]

NOTE: Website uses "navicular_ratio" as the field name for heel depth (legacy naming from v1).

### Key Gotchas
- SAM3 import only works inside the uvicorn server process (not standalone scripts)
- Overlay must be diagram-only (no photo panel) — pass None for img: `draw_sole_overlay(None, mask, m, path)`
- Mask from normalize_sole_orientation must be 0/1 uint8, not 0/255 (overflow bug in draw: `mask * 255`)
- Ball row algorithm uses LEFTMOST pixel (outer edge), not rightmost — foot orientation has ball side on left after normalization
- Silhouette SVG needs cv2.flip(sil_r, 1) to match scan orientation
- Text labels removed from overlay — website shows values in its own panel
- Silhouette SVG at `/Users/rolfes/graphics/foot bottom.svg` is a symlink to iCloud
- Supabase overlay path format: `foot-scans/scans/{scanId}-sole_overlay.png` (flat, not subfolder)
- Side overlay path format: `foot-scans/scans/{scanId}-side_side_overlay.png`
- After editing sole_measure.py, the FastAPI server MUST be restarted (it loads the module at import time)
- Known limitation: perspective distortion from non-parallel camera angle (heel closer to camera than toes) is NOT corrected. Future: add gyroscope-based angle guidance to capture UI.

### Shoe Recommendation Rules
- **Long arch ≠ narrow foot.** A low width_ratio (e.g. 0.358) can result from a long arch (high arch_ratio), NOT from an actually narrow foot. The foot length is long relative to width because the ball sits far back. NEVER recommend narrow/LV (Low Volume) lasts based on width_ratio alone. Check the absolute width and arch_ratio first.
- **Long arch → short toes → compact toe box.** High arch_ratio means ball-to-heel is long, leaving a short toe zone. Recommend shoes with compact toe boxes so toes don't swim in dead space. Does NOT mean "longer toe box".
- **Never invent shoes.** Only recommend shoes that exist in `src/seed_data.json`. If a model isn't in the database, don't recommend it. If only LV/HV variants exist but the standard version is needed, flag it — don't silently substitute.
- **No duplicate brand+model variants.** Don't recommend both "Cobra" and "Cobra Eco" or similar near-identical variants in the same list.
- **Interpretation format is `{title, paragraphs: [...]}`**, NOT `{title, body: "..."}`. ScanResult.jsx calls `block.paragraphs.map()` — a `body` string will crash the page with "Cannot read properties of undefined (reading 'map')".
- **Verify kids shoes.** Some shoes (e.g. Lowa Pirol) are kids/youth shoes even if `kids_friendly` is false in seed_data. Sanity-check before recommending.
- **Skill level matters.** A beginner should get soft/moderate-soft feel, flat/slight downturn. Don't recommend aggressive/stiff shoes regardless of foot geometry.
- **High instep → adjustable closure.** Lace closure is best for high instep (fine-tune tension). Velcro is acceptable. Slippers are least adjustable.
- **Supabase project URL changed (2026-03-06).** Old: `ixnlbbfnhbvuqjnatxht.supabase.co`. New: `wsjsuhvpgupalwgcjatp.supabase.co`. Config is in `src/supabase.js`. Use service-role key for writes (anon key is read-only due to RLS). Service-role key is in this README under Supabase section.


## SEO Route Conventions & Redirects (NON-NEGOTIABLE)

**Canonical product URL pattern: SINGULAR.** `/shoe/<slug>`, `/rope/<slug>`, `/crashpad/<slug>`, `/belay/<slug>`, `/quickdraw/<slug>`. Listing pages stay plural: `/shoes`, `/ropes`, `/crashpads`, `/belays`, `/quickdraws`.

**Why this matters:** A 2026-02-23 migration moved product routes from plural (`/shoes/<slug>`) to singular (`/shoe/<slug>`) without 301 redirects. Google deindexed ~800 URLs and the GSC indexed-page count dropped sharply. The `vercel.json` redirects added 2026-04-30 are what stop the bleed. **Never remove them.**

### Redirect rules in `vercel.json` (must stay in this order)

1. **Specific lost-slug redirects FIRST** — discontinued products, slug renames (e.g. `tenaya-oasi-kids` → `tenaya-oasi`), and old gendered slugs that were absorbed into a unisex variant (e.g. `scarpa-arpia-womens` → `scarpa-arpia-v`). When in doubt, redirect to the category browse page (`/shoes`, `/ropes`, …) — never to the homepage (Google treats that as a soft 404).
2. **Catch-all plural→singular redirects LAST** — `/shoes/:slug → /shoe/:slug`, etc. This handles every slug that didn't change between Feb 23 and now.

### When you change a product slug or remove a product

1. Add a specific entry to the `redirects` block in `vercel.json` BEFORE the catch-all rules.
2. Map to the closest current product page if there is one; otherwise to the relevant `/shoes` `/ropes` `/crashpads` `/belays` `/quickdraws` listing.
3. Push and verify with `curl -sIL https://www.climbing-gear.com/shoes/<old-slug>` — expect `308` then `200`, never `404`.

### Top-level renames already in place

- `/gear-news` → `/news`
- `/legal` → `/impressum`

### Other SEO essentials

- All product detail pages have a single `<link rel="canonical">` matching the current URL (no plural canonicals).
- The `noindex` meta tag is ONLY served on the 404 page (`public/404.html`) — verify this stays that way for any new error/utility pages.
- Sitemap is split into 6 files: `sitemap.xml` (index) + `sitemap-{core,shoes,ropes,crashpads,belays,quickdraws}.xml`. The build pipeline regenerates them from Supabase via `scripts/generate-sitemap.js`.

