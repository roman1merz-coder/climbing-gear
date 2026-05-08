# Foot Scanner

> Security boundary first. Read **[security-architecture.md](security-architecture.md)**
> before any change to `/scan`, `/api/scan/*`, or the worker. The browser
> never talks to Supabase REST or Storage directly for write paths -
> everything goes through `/api/scan/*`.

## Overview

The foot scanner at `climbing-gear.com/scan` lets users upload sole + side photos, fill in a shoe fit questionnaire, and get personalized shoe recommendations. The analysis pipeline runs on Roman's Mac Mini (M4 Pro, 64GB) - fully automated and deterministic, no LLM, $0/scan.

## User Flow

1. User uploads 2 photos. The form posts each to `POST /api/scan/upload?scan_id=X&view=sole|side`. The serverless function uses the secret key to write to Supabase Storage at `foot-scans/scans/{scanId}-{view}.jpg`.
2. The form posts `POST /api/scan {op:"init", scan_id}` which inserts a `foot_scan_fits` row with `pipeline_stage='pending'`.
3. User fills the shoe-fit questionnaire (sex, street EU size, current climbing shoes with per-dimension fit ratings).
4. Optional email, then submit. The form posts `POST /api/scan {op:"prefs", ...}` which patches the same row with the cleaned shoe-fit payload (see "Fit-value enums" below for the allow-list).
5. The Mac Mini worker polls Supabase every 5s for `pipeline_stage='pending'`. It downloads the photos, segments them, writes overlays + measurements, generates interpretation + recommendations, sets `pipeline_stage='complete'`.
6. While the worker runs, the page polls `GET /api/scan?op=status&scan_id=X` (cheap, no PII).
7. On completion, the React route `/scan/{scanId}` reads the full row via `GET /api/scan?op=get&scan_id=X` (server-side, returns email/email_freq for EmailCapture pre-fill) plus polls non-PII columns directly with the publishable key.

## Architecture in one picture

```
                        [BROWSER  /scan, /scan-testv2]
                                |
         POST /api/scan/upload  |  raw image/jpeg
         POST /api/scan {op}    |
                                v
                      [Vercel /api/scan/*]    <- holds sb_secret_*
                                |
                                v
                        [Supabase Storage]   foot-scans/scans/...
                        [Supabase REST]      foot_scan_fits row

                                ^
                                | poll every 5s
                                |
                       [Mac Mini scan_worker]   <- holds sb_secret_* via launchd plist
                                |
                                v
                       [Supabase Storage]    overlay PNGs
                       [Supabase REST]       measurements + interpretation + recommendations

                                ^
                                | GET /api/scan?op=get
                                | (publishable for status poll)
                                v
                        [BROWSER  /scan/:id]
```

`/api/scan/upload.js` is the only place where browser bytes turn into a
Supabase Storage write. `/api/scan/index.js` is the only place where
browser JSON turns into a `foot_scan_fits` row. The worker is the only
component that writes overlays and pipeline output.

## Pipeline (scan_worker.py)

Polls Supabase every 5s for `pipeline_stage='pending'`. When found:

1. **SAM3 segmentation** (~8s) - segments foot from background, normalizes orientation, measures proportions, generates overlays
2. **Upload** - overlays to Supabase Storage, measurements to `foot_scan_fits` row
3. **Deterministic interpretation** (~1s) - four rule-based engines:
   - `interp_foot_shape.py` - Section 1: "Your Foot Shape"
   - `interp_shoe_fit.py` - Section 2: "What Your Current Shoe Fit Tells Us"
   - `interp_what_to_look_for.py` - Section 3: "What to Look For"
   - `interp_shoe_desc.py` - Per-shoe P1 (description), P2 (why selected), P3 (tradeoffs)
4. **Matrix scoring** - `matrix_scorer.py` scores all shoes, selects 12 recs in 4 tiers (baseline, softer, stiffer, budget)
5. **Write results** - interpretation + recommendations to Supabase, `pipeline_stage='done'`

Total: ~10-15s per scan.

## Worker Management

```bash
# Restart worker (after code changes):
launchctl kickstart -k gui/$(id -u)/com.climbing-gear.scan-worker

# Check worker status:
launchctl list | grep scan-worker
```

## File Locations (Mac Mini)

| Path | Purpose |
|------|---------|
| `/Users/rolfes/foot-scanner/scan_worker.py` | Production worker (symlink to iCloud) |
| `/Users/rolfes/foot-scanner/foot_measure.py` | Core measurement algorithm |
| `/Users/rolfes/foot-scanner/sole_measure.py` | Sole processing pipeline |
| `/Users/rolfes/foot-scanner/benchmark/interp_*.py` | Interpretation engines (synced via iCloud) |
| `/Users/rolfes/foot-scanner/benchmark/matrix_scorer.py` | Shoe scoring |
| `/Users/rolfes/foot-scanner/server.py` | FastAPI debug server (port 8787) |
| `/Users/rolfes/foot-scanner/test_scans/` | Test scan images |
| `/Users/rolfes/foot-scanner/results/` | Output results |
| `/Users/rolfes/graphics/foot bottom.svg` | Silhouette SVG (symlink to iCloud) |

## Sole Processing Pipeline (sole_measure.py)

1. **Segment** - SAM3 segments foot from background (prompt: "foot")
2. **Normalize orientation** - two-pass rotation:
   - Pass 1: minAreaRect rough alignment (long axis vertical)
   - Pass 2: heel-center to 2nd-toe-tip fine alignment (iterates until < 0.5 deg residual)
   - `_rotate_and_crop()` ensures mask + image undergo identical transforms
   - `_ensure_toes_at_top()` flips 180 deg if toes are at bottom
   - Output mask is 0/1 uint8 (NOT 0/255)
3. **Measure** - extracts foot_length, ball_width, heel_width, arch_length, toe_shape, toe tips
4. **Draw overlay** - `draw_sole_overlay(None, mask, measurements, out_path)`:
   - First arg is None (no photo panel - website renders these separately)
   - Amber semi-transparent fill for scan, grey outline for silhouette reference
   - Silhouette flipped horizontally (`cv2.flip(sil_r, 1)`) to match scan orientation
   - No text labels (website renders values in right panel)
   - Green measurement lines: forefoot width, heel width, arch length bracket, toe tip dots
   - Legend: "Average" (grey) + "Your foot" (amber)

## Population Reference Values (POP)

These live in `sole_measure.py` AND `src/ScanResult.jsx` (must be kept in sync).

```python
POP = {
    "width_ratio":      {"mean": 0.383, "std": 0.021},  # ball_width / foot_length
    "arch_ratio":       {"mean": 0.700, "std": 0.025},  # arch_length / foot_length
    "heel_ratio":       {"mean": 0.251, "std": 0.018},  # heel_width / foot_length
    "instep_ratio":     {"mean": 0.290, "std": 0.030},  # instep_height / foot_length
    "heel_depth_ratio": {"mean": 0.070, "std": 0.025},  # heel_protrusion / foot_length
}
```

Sources (updated 2026-03-06):
- width_ratio: Foot index literature, Nepalese study (PMC11455646), Jurca et al. 2019
- heel_ratio: Same studies. NOTE: was previously heel_width/ball_width (0.655) - WRONG. Now heel_width/foot_length.
- instep_ratio: AHI literature (standing ~0.34 on truncated length), adjusted for our method. Old value 0.232 was from website v1 and made every scan "low instep".
- heel_depth_ratio: No direct literature. Derived from calcaneal CT anatomy (Qiang 2014) + scan data. Wide std - needs calibration.

## ScanResult.jsx Range Bars

META min/max define visual scale of each bar on the website:

| Metric | Min | Max | Field name in DB |
|--------|-----|-----|-----------------|
| width_ratio | 0.32 | 0.46 | forefoot_width_ratio |
| arch_ratio | 0.61 | 0.77 | arch_length_ratio |
| heel_ratio | 0.20 | 0.31 | heel_width_ratio |
| instep_ratio | 0.20 | 0.38 | instep_height_ratio |
| navicular_ratio | 0.00 | 0.15 | heel_depth_ratio |

NOTE: Website uses "navicular_ratio" as the field name for heel depth (legacy naming from v1).

## Fit-value enums (must stay in sync across 4 places)

The scan form lets the user rate each shoe along three dimensions, with
three choices each. The values used internally do **not** match the
button labels (the labels are `Tight`/`Perfect`/`Loose` everywhere, but
the underlying tokens are dimension-specific):

| Dimension | Token for "Tight" | Token for "Perfect" | Token for "Loose" |
| --- | --- | --- | --- |
| toes | `squeezed` | `perfect` | `roomy` |
| forefoot | `tight` | `perfect` | `loose` |
| heel | `tight` | `perfect` | `empty` |

These six tokens (plus `null`/`""` for unrated) flow through four
surfaces. **All four must stay in sync** - if you add or rename a
token, change all four in the same commit:

| Surface | File | What you change |
| --- | --- | --- |
| Form HTML | `public/scan.html`, `public/scan-testv2.html` | `data-val="..."` attributes inside `.fit-options` blocks (search for `data-area="toes"` etc.) |
| API allow-list | `api/scan/index.js` | The `FIT_VALUES` `Set` (cleanShoes uses it). Anything not in this set silently becomes `null`. |
| Interpretation engine | `scanner/benchmark/interp_shoe_fit.py` | `_universal_issue_text`, `_majority_issue_text`, `_contradiction_text`, `_issue_implication`. Each token needs a sentence pattern, otherwise the engine prints an awkward generic fallback or the literal token. |
| Display badge | `src/ScanResult.jsx` | `FitBadge` palette + `FIT_LABELS` map. Each token needs a colour and a human label. |

The 2026-05-07 incident was caused by exactly this drift: the form
submitted `perfect` and `squeezed`, but the API allow-list only had
`tight`/`snug`/`good`/`loose`/`very-tight`/`very-loose`, so users saw
their fit ratings disappear from the results page. See
`SECURITY-FIX.md` and the 61818c3 commit for the fix.

## Recommendation Rules

- Long arch != narrow foot. Low width_ratio can result from high arch_ratio, not actually narrow feet. Never recommend narrow/LV lasts on width_ratio alone.
- Long arch -> short toes -> recommend compact toe boxes (not "longer toe box").
- Only recommend shoes in seed_data.json. Never invent shoes.
- No duplicate brand+model variants in same list.
- Interpretation format is `{title, paragraphs: [...]}` NOT `{title, body: "..."}`. ScanResult.jsx calls `.paragraphs.map()`.
- Verify kids shoes - some are youth-only even if `kids_friendly` is false.
- Skill level matters - beginners get soft/flat shoes.
- High instep -> lace closure preferred.

## Key Gotchas

- SAM3 import only works inside the uvicorn server process (not standalone scripts)
- Overlay must be diagram-only (no photo panel) - pass None for img
- Mask must be 0/1 uint8, not 0/255 (overflow bug in `mask * 255`)
- Ball row algorithm uses LEFTMOST pixel (outer edge), not rightmost
- Silhouette SVG needs `cv2.flip(sil_r, 1)` to match scan orientation
- Supabase overlay path: `foot-scans/scans/{scanId}-sole_overlay.png` (flat, not subfolder)
- Side overlay path: `foot-scans/scans/{scanId}-side_side_overlay.png`
- After editing sole_measure.py, restart the FastAPI server (module loaded at import time)
- Known limitation: perspective distortion from non-parallel camera angle is NOT corrected

## Storage

- Bucket: `foot-scans` (public)
- Photos: `scans/{scanId}-sole.jpg`, `scans/{scanId}-side.jpg`
- Overlays: `scans/{scanId}-sole_overlay.png`, `scans/{scanId}-side_side_overlay.png`
- Instructions: `scans/instruction-sole.jpg`, `scans/instruction-side.jpg`

## Admin

`climbing-gear.com/scan-admin.html` - dashboard showing all scans with photos, shoe data, and emails. Auto-refreshes every 30s.

## Legacy Modules (NOT used in production)

- `scan_llm_sonnet.py` - Anthropic Sonnet API (~$0.05/scan, ~55s). Replaced by deterministic engines.
- `scan_llm.py` - Local fine-tuned Qwen 3.5 27B via MLX-LM. Replaced by deterministic engines.
- `server.py` async endpoints - work for local/debug but NOT used by production frontend.
