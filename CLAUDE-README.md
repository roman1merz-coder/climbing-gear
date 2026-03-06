# CLAUDE-README - Project-Specific Rules for AI Agents

This file contains rules discovered and validated during data work sessions.
These rules are NON-NEGOTIABLE and must always be followed.

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

The foot scanner lives at `climbing-gear.com/scanner-test.html` (static HTML, not part of the React SPA).

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

## Scan Analysis Pipeline (Mac Mini M4 Pro)

The scan analysis pipeline runs on Roman's Mac Mini (M4 Pro, 48GB). It segments foot photos using SAM3, normalizes orientation, measures proportions, generates overlays, and uploads results to Supabase.

### Location
- **Code:** `/Users/rolfes/foot-scanner/sole_measure.py` (all measurement + overlay logic)
- **Server:** `/Users/rolfes/foot-scanner/server.py` (FastAPI, port 8787)
- **Test scans:** `/Users/rolfes/foot-scanner/test_scans/` (raw photos)
- **Results:** `/Users/rolfes/foot-scanner/results/` (generated overlays)
- **Silhouette SVG:** `/Users/rolfes/graphics/foot bottom.svg` (symlink to iCloud climbing-gear/graphics/)

### Server Endpoints
- `GET /health` - check if server + SAM3 model are loaded
- `POST /segment` - raw segmentation mask as PNG (params: photo, prompt)
- `POST /process-scan` - **full pipeline** (params: sole photo, optional side photo, scan_id, out_dir). Returns measurements JSON + saves overlay PNGs

### Running the Pipeline for a New Scan

**Step 1: Start server (if not running)**
```bash
cd /Users/rolfes/foot-scanner
python3 -m uvicorn server:app --host 0.0.0.0 --port 8787
```
Verify: `curl http://localhost:8787/health` should return `{"status":"ok","model_loaded":true}`

**Step 2: Run analysis via /process-scan**
```bash
curl -X POST http://localhost:8787/process-scan \
  -F "sole=@/path/to/sole.jpg" \
  -F "side=@/path/to/side.jpg" \
  -F "scan_id=scan-2026-03-06T08-33-33" \
  -F "out_dir=/Users/rolfes/foot-scanner/results"
```
This returns JSON with all measurements and saves overlay PNGs to out_dir.

**Step 3: Upload overlays to Supabase**
```bash
SERVICE_KEY="eyJhbGci...6cYE1ElsvX7..."

curl -X POST "https://wsjsuhvpgupalwgcjatp.supabase.co/storage/v1/object/foot-scans/scans/{scanId}-sole_overlay.png" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: image/png" \
  -H "x-upsert: true" \
  --data-binary @/Users/rolfes/foot-scanner/results/{scanId}-sole_overlay.png

# Same for side overlay:
curl -X POST "https://wsjsuhvpgupalwgcjatp.supabase.co/storage/v1/object/foot-scans/scans/{scanId}-side_side_overlay.png" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: image/png" \
  -H "x-upsert: true" \
  --data-binary @/Users/rolfes/foot-scanner/results/{scanId}-side_side_overlay.png
```

**Step 4: Update foot_scan_fits row with measurements**
```bash
curl -X PATCH "https://wsjsuhvpgupalwgcjatp.supabase.co/rest/v1/foot_scan_fits?scan_id=eq.{scanId}" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"toe_shape":"egyptian","width_ratio":0.359,"heel_ratio":0.702,"arch_ratio":0.663,...}'
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
