# Foot Scanner

## Overview

The foot scanner at `climbing-gear.com/scan` lets users upload sole + side photos, fill in a shoe fit questionnaire, and get personalized shoe recommendations. The analysis pipeline runs on Roman's Mac Mini (M4 Pro, 64GB) - fully automated and deterministic, no LLM, $0/scan.

## User Flow

1. User uploads 2 photos: sole and side
2. Photos go to Supabase Storage: `foot-scans/scans/{scanId}-sole.jpg`, `scans/{scanId}-side.jpg`
3. User fills shoe fit questionnaire: sex, street shoe size (EU), climbing shoes (brand, model, EU size, fit ratings)
4. Optional email, then submit
5. Data saves to `foot_scan_fits` table with `pipeline_stage='pending'`
6. Worker picks it up, processes, results viewable at `/scan/{scanId}`

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
