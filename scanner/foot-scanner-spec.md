# Foot Scanner — Implementation Spec (v3)

> **Updated March 2026.** Rewritten to reflect the production pipeline: SAM 3
> text-prompted segmentation on Mac Mini M4 Pro, 2-view capture (sole + side,
> both required), ratio-based measurements with no reference object required.

## Concept

User scans their foot with 2 photos + shoe size → SAM 3 segmentation + OpenCV
measurement pipeline on Mac Mini → classifies foot shape → presets search filters
→ recommends best-fitting climbing shoes.

**Pipeline history:**
- v0: Claude Vision API (non-deterministic, abandoned)
- v1: U²Net-p + A4 paper reference (body leakage issues, abandoned)
- v1.5: SAM ViT-B with bounding-box prompts (too fragile, abandoned)
- **v2 (current): SAM 3 text-prompted segmentation** — zero-shot, no tuning, handles body-visible frames

---

## User Flow

### Step 1: Photo Capture

User takes 2 photos with phone camera, guided by on-screen instructions:

1. **Sole view** — foot sole facing the camera (foot lifted or placed on a glass surface)
   - Extracts: toe shape, forefoot width ratio, arch length ratio, heel width ratio
2. **Side view** — medial (inner) profile, phone at ground level
   - Extracts: instep height ratio, heel depth ratio

Both photos are required. Together they produce a complete foot profile (5 ratios + toe shape + forefoot volume + heel volume).

**No reference object needed.** The pipeline measures proportional ratios (width ÷ length, etc.),
not absolute mm dimensions. Shoe size input provides the absolute anchor.

**Instructions must specify:** barefoot (socks change apparent volume and obscure toe shape).

### Step 2: Shoe Size Input

User enters their street shoe size (EU). This anchors absolute foot length via:

```
foot_length_mm = (EU_size + 2) × 6.667
```

Photos only determine *ratios and shape*, not precise mm measurements.

### Step 3: Analysis (Per-Photo Progressive Processing)

**Critical UX decision:** Each photo is processed independently the moment it's taken,
not as a batch. While the user reads instructions for the next photo (~15s), the
previous photo is already being processed. The perceived wait is only the processing
time of the **last photo** (~2–5s on M4 Pro with SAM 3).

| Metric | Field | Source | Method | Classification |
|--------|-------|--------|--------|----------------|
| **Toe shape** | `toe_shape` | Sole | Contour analysis on SAM 3 mask → classify relative toe tip positions. Roman = first 3 toes roughly equal. Greek = 2nd toe higher than big toe. Egyptian = big toe higher than 2nd toe. | `egyptian` / `greek` / `roman` |
| **Forefoot width** | `forefoot_width_ratio` | Sole | Ball width ÷ foot length. Ball = most-LEFT (medial) point in 25–40% zone from toe tip. Forefoot width = full horizontal span at ball row. | `narrow` / `normal` / `wide` |
| **Arch length** | `arch_length_ratio` | Sole | Heel-to-ball distance ÷ foot length | `short arch` / `normal` / `long arch` |
| **Heel width** | `heel_width_ratio` | Sole | Heel width (widest span in rear 10–15%) ÷ foot length | `narrow heel` / `normal` / `wide heel` |
| **Instep height** | `instep_height_ratio` | Side | Dorsal surface at 50% from toe tip down to ground plane (level line), ÷ foot length | `low instep` / `normal` / `high instep` |
| **Heel depth** | `heel_depth_ratio` | Side | Horizontal distance from where the instep-height line meets the heel-side foot outline (Point A) to the most-rear (leftmost) foot point below that intersection (Point B), ÷ foot length. Measures how far the heel protrudes behind the ankle. | `shallow heel` / `normal` / `deep heel` |

### Step 4: Results Display

Before any shoe recommendations, show the user their foot profile using `FootScanResults.jsx`
(already built — vectorized SVG foot illustrations, animated measurement bars vs population
averages, toe shape visualization):

> **Your Foot Profile**
> - Toe shape: Egyptian (tapering from big toe)
> - Forefoot volume: Low (narrow forefoot + low instep)
> - Heel volume: Standard
> - Forefoot: Normal width
> - Heel: Narrow
> - Arch length: 0.70 (average toe length)
>
> *This means you'll likely find the best fit in low-volume shoes with an asymmetric toe box.*

### Step 5: Search Preset

The foot profile auto-sets filters in the shoe search view:

| Foot metric | Shoe filter | Mapping logic |
|------------|-------------|---------------|
| Toe shape: egyptian | Asymmetry → moderate/strong | Egyptian feet suit asymmetric shoes |
| Toe shape: greek | Asymmetry → slight/none | Greek feet need space for 2nd toe |
| Toe shape: roman | Asymmetry → none/slight | Roman/square feet need wide, symmetric toe box |
| Forefoot volume: low | Forefoot volume → low | Narrow forefoot + low instep |
| Forefoot volume: high | Forefoot volume → high | Wide forefoot + high instep |
| Heel volume: low | Heel volume → low | Narrow heel + shallow heel |
| Heel volume: high | Heel volume → high | Wide heel + deep heel |
| Forefoot: wide | Width → wide | Direct match |
| Heel: narrow | Heel fit → narrow | Direct match |
| Arch length < 0.712 | Flex point → forward | Long toes → need forward flex point |
| Arch length > 0.734 | Flex point → rearward | Short toes → need rearward flex point |

User lands on `/shoes` with these filters pre-applied but can adjust any of them.

---

## Population Reference Data

**Single source of truth: `foot_measure.py` → `POP` dict.** Values below are a snapshot
for spec reference. If they diverge from the Python code, `foot_measure.py` wins.

Values tertile-calibrated 2026-04-14 from the empirical distribution of
204 foot_scan_fits rows (see `scan_distribution_2026_04_14.md`). The
older NWB literature-derived means (2026-04-12) over-narrowed the middle
band because real population std is larger than the lit-derived std and
the arch-length mean was ~0.025 too low for our NWB photography setup.
The new lo/hi are explicit 33rd/67th percentile boundaries so each of
the three bands covers roughly one-third of users.

`mean` = population median, `std` = actual population standard deviation
(used for z-score intensity wording only), `lo`/`hi` = tertile band
boundaries (classification cutoffs).

| Ratio | Field | Formula | What It Measures | Median | Std | lo | hi |
|-------|-------|---------|------------------|--------|-----|------|------|
| Forefoot width | `forefoot_width_ratio` | ball_width / foot_length | Forefoot width relative to foot length | 0.355 | 0.028 | 0.344 | 0.367 |
| Arch length | `arch_length_ratio` | heel_to_ball / foot_length | Relative toe length (higher = shorter toes) | 0.725 | 0.025 | 0.712 | 0.734 |
| Heel width | `heel_width_ratio` | heel_width / foot_length | Heel width relative to foot length | 0.238 | 0.022 | 0.228 | 0.245 |
| Instep height | `instep_height_ratio` | instep_height / foot_length | Dorsal to ground plane at 50% from toe tip | 0.264 | 0.036 | 0.255 | 0.273 |
| Heel depth | `heel_depth_ratio` | heel_depth / foot_length | Heel protrusion depth | 0.034 | 0.020 | 0.028 | 0.041 |

**Classification thresholds (tertile bands):**

| Ratio | Low / Narrow | Normal Range | High / Wide |
|-------|-------------|--------------|-------------|
| `forefoot_width_ratio` | < 0.344 (narrow) | 0.344 – 0.367 | > 0.367 (wide) |
| `arch_length_ratio` | < 0.712 (short arch) | 0.712 – 0.734 | > 0.734 (long arch) |
| `heel_width_ratio` | < 0.228 (narrow heel) | 0.228 – 0.245 | > 0.245 (wide heel) |
| `instep_height_ratio` | < 0.255 (low instep) | 0.255 – 0.273 | > 0.273 (high instep) |
| `heel_depth_ratio` | < 0.028 (shallow heel) | 0.028 – 0.041 | > 0.041 (deep heel) |

**Volume classification (derived):**

| Volume | Formula | Low | Standard | High |
|--------|---------|-----|----------|------|
| **Forefoot volume** | instep_height + forefoot_width | Both narrow + low instep | Mixed or normal | Both wide + high instep |
| **Heel volume** | heel_width + heel_depth | Both narrow heel + shallow | Mixed or normal | Both wide heel + deep |

---

## Technical Architecture

### High-Level Flow

```
User's phone → 2 photos → Vercel frontend → Vercel proxy → Mac Mini API → ratios back to frontend
```

1. User takes photo on phone → frontend sends multipart JPEG + view type to `/api/analyze-foot`
2. Vercel serverless function proxies to `https://scan.climbing-gear.com/analyze-photo`
3. Mac Mini runs SAM 3 segmentation + OpenCV measurement (~2–5s per image)
4. Returns ratios + classifications; frontend displays results progressively
5. Photos deleted immediately after processing (privacy)

### Why Mac Mini (not Serverless)

- SAM 3 model (~3.4 GB) stays loaded in memory — no cold starts
- No 250MB function size limit (Vercel) or timeout constraints
- M4 Pro has excellent ML performance via Apple Silicon MPS (GPU)
- No per-invocation API costs
- Total footprint: ~3.4 GB model + ~200 MB Python packages on a 64 GB machine

### API Endpoints (server.py)

**Per-photo endpoint (primary — enables progressive processing):**

```
POST /analyze-photo
Content-Type: multipart/form-data
Fields:
  photo: <JPEG file>
  view: "sole" | "side"
Returns: {
  "view": "sole",
  "processing_time_s": 2.31,
  "foot_length_px": 1842,
  "forefoot_width_ratio": 0.355,
  "arch_length_ratio": 0.725,
  "heel_width_ratio": 0.238,
  "forefoot_width_class": "normal",
  "arch_length_class": "normal",
  "heel_width_class": "normal",
  "toe_shape": "egyptian"
}
```

**Combined endpoint (both photos required):**

```
POST /analyze-foot
Content-Type: multipart/form-data
Fields:
  sole: <JPEG file>        (required)
  side: <JPEG file>        (required)
  shoe_size_eu: 42         (optional)
Returns: {
  "shoe_size_eu": 42,
  "forefoot_width_ratio": 0.355,
  "arch_length_ratio": 0.725,
  "heel_width_ratio": 0.238,
  "toe_shape": "egyptian",
  "forefoot_width_class": "normal",
  "arch_length_class": "normal",
  "heel_width_class": "normal",
  "instep_height_ratio": 0.264,
  "heel_depth_ratio": 0.034,
  "instep_height_class": "normal",
  "heel_depth_class": "normal",
  "forefoot_volume": "standard",
  "heel_volume": "standard",
  "width": "normal",
  "heel_width": "normal",
  "processing_time_s": 4.52
}
```

**Health endpoint:**

```
GET /health
Returns: {
  "status": "ok",
  "model_loaded": true,
  "model_load_time_s": 12.3
}
```

The frontend polls `/health` on scanner page load. If the Mac Mini is down, show
"Scanner temporarily unavailable — try again later" instead of letting the user
take photos that can't be processed.

### Frontend Components

```
src/
├── FootScanner/
│   ├── FootScanner.jsx        -- Main scanner flow (step wizard)
│   ├── PhotoCapture.jsx       -- Camera/upload UI for each view
│   ├── PhotoGuide.jsx         -- Overlay guide showing correct positioning
│   ├── FootProfile.jsx        -- Results display (the "happiness" screen)
│   ├── ScannerContext.jsx     -- React context for scan state
│   └── scannerApi.js          -- API calls to /api/analyze-foot
├── FootScanResults.jsx        -- Already built: results visualization
```

### Frontend Integration

The Vercel function at `/api/analyze-foot.js` is a thin proxy:

```
Frontend → Vercel function → Mac Mini API → return (ratios already computed)
```

This handles CORS cleanly and lets us add rate limiting + API key validation at the proxy layer.

### Data Flow (Progressive)

```
Photo 1 taken → POST /analyze-photo (view: "sole")
  → Processing in background while user reads side-view instructions
  → Response cached in ScannerContext

Photo 2 taken → POST /analyze-photo (view: "side")
  → ~2–5s wait → both results ready
  → Navigate to /scan/results
  → FootScanResults renders full profile
  → "Find My Shoes →" navigates to /shoes with filter presets
```

Perceived processing time: **~2–5s** (only the last photo's processing).

---

## CV/ML Pipeline (foot_measure.py)

### Stack

| Component | Package | Purpose |
|-----------|---------|---------|
| ML segmentation | SAM 3 via HuggingFace `transformers` | Text-prompted segmentation ("foot") → binary mask |
| Computer vision | `opencv-python-headless` | Contour extraction, orientation normalization, measurements |
| Array ops | `numpy`, `scipy` | Image array manipulation, signal processing |
| API server | `fastapi` + `uvicorn` | HTTPS endpoint via Cloudflare Tunnel |
| ML backend | `torch` (PyTorch) | SAM 3 inference on Apple Silicon MPS |

### SAM 3 Segmentation

Each photo is processed through SAM 3 (Meta, Nov 2025, ICLR 2026):

1. Load image as PIL RGB
2. Run SAM 3 processor with text prompt `"foot"`
3. Model outputs multiple candidate masks + IoU scores
4. Pick highest-scoring mask
5. Resize to original image dimensions
6. Binarize at threshold 0.5
7. Keep only the largest connected component (removes small artifacts)
8. Morphological cleanup (opening to remove noise, closing to fill gaps)

**Why SAM 3:** Provides semantic understanding — it knows what a foot looks like.
Works zero-shot on any image without tuning. Handles the hard case (body visible
in frame) that broke U²Net-p and SAM ViT-B approaches.

### Sole View Pipeline

After segmentation:

1. **Orientation normalization** — rotate the binary mask so the foot points straight up
   (toe-tip at top). Two-pass: minAreaRect rough alignment → heel-center-to-2nd-toe-tip fine rotation.
2. **Toe tip detection** — scan the top edge of the mask contour for local maxima (peaks)
   to identify individual toes. Determine big-toe side (compare leftmost vs rightmost tip
   heights). Classify: roman = first 3 toes ≈ equal, greek = 2nd toe higher than big toe,
   egyptian = big toe higher than 2nd toe.
3. **Ball row detection** — find the most-LEFT (medial) outline point in the 25–40% zone from toe tip. Forefoot width = full horizontal span at that row.
4. **Heel row detection** — find the widest horizontal span in the rear 10–15% of the mask.
5. **Ratio computation:**
   - `forefoot_width_ratio` = ball width ÷ foot length (in pixels)
   - `arch_length_ratio` = heel-to-ball distance ÷ foot length
   - `heel_width_ratio` = heel width ÷ foot length
6. **Classification** — compare each ratio against population reference data (±1 SD thresholds).

### Side View Pipeline

After segmentation:

1. **Orientation normalization** (`normalize_side_orientation()`) — three-step process:
   a. **Ensure horizontal** — if the mask is taller than wide, rotate 90° so the foot lies flat.
   b. **Ensure heel left** — split the mask in half and compare mass. If the right half has more mass (heel is on the right), flip horizontally. Result: heel on the left, toes on the right.
   c. **Level the sole** — find the lowest point (highest y) in the heel zone (left 30%) and the lowest point in the toe zone (right 30%). Compute the angle between these two points and rotate the mask so both sit on the same horizontal line. This corrects for tilted photos.
2. **Foot boundary extraction** — find the dorsal (top) and plantar (bottom) profile of the normalized mask. Foot length = rightmost x − leftmost x.
3. **Instep measurement** — dorsal surface (topmost mask pixel) at 50% from toe tip down to the ground plane (level line from step 1c). NOT mask-bottom-to-top, which would undercount on feet with a visible arch. `instep_col = x_max - foot_length * 0.50`.
4. **Heel depth measurement** — Point A: where the instep-height horizontal line meets the heel-side (left) foot outline (leftmost mask pixel on the `instep_top` row). Point B: the most-rear (leftmost) foot pixel anywhere below Point A (rows `instep_top` downward). Heel depth = horizontal distance `A_x - B_x`, i.e. how far the heel protrudes behind the ankle.
5. **Ratio computation:**
   - `instep_height_ratio` = instep height ÷ foot length
   - `heel_depth_ratio` = heel depth ÷ foot length
6. **Classification** — compare against population thresholds.

### Volume Classification

Two separate volume classifications (in server.py):

**Forefoot volume** (`_classify_forefoot_volume()`):
- **Low:** narrow forefoot AND low instep
- **High:** wide forefoot AND high instep
- **Standard:** everything else

**Heel volume** (`_classify_heel_volume()`):
- **Low:** narrow heel AND shallow heel
- **High:** wide heel AND deep heel
- **Standard:** everything else

---

## Mac Mini Setup

### What's Installed

**System-level (via Homebrew):**
- Python 3.12
- cloudflared (Cloudflare Tunnel daemon)

**Python packages (in venv at `~/foot-scanner/venv/`):**
- `transformers` (HuggingFace — SAM 3 model support)
- `torch`, `torchvision` (PyTorch — inference on MPS)
- `opencv-python-headless` — CV operations
- `numpy`, `scipy` — array + signal processing
- `fastapi`, `uvicorn`, `python-multipart` — API server
- `Pillow` — image loading for SAM 3

**Model:** SAM 3 (`facebook/sam3`) — ~3.4 GB, cached in `~/.cache/huggingface/`

### Running the Server

```bash
cd ~/foot-scanner
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8787 --log-level info
```

Or via the `start.sh` script (used by launchd).

### Cloudflare Tunnel

Tunnel exposes port 8787 at `scan.climbing-gear.com`. Config at `~/.cloudflared/config.yml`.

### Launchd Auto-Start

Both the FastAPI server and the Cloudflare tunnel are configured as launchd services
with `KeepAlive: true` and `RunAtLoad: true`. This handles power outages, macOS updates,
and process crashes automatically.

### Privacy & Security

- Photos decoded in memory, processed, and discarded. No persistent photo storage.
- Cloudflare Tunnel provides HTTPS with no open ports on the Mac Mini.
- API key header: Vercel proxy includes a secret key. Mac Mini rejects requests without it.
- CORS: only `climbing-gear.com` origin allowed.
- Max 10 MB per image payload.

---

## Shoe Database: Fit-Related Fields

### On the `shoes` table (Supabase)

```sql
ALTER TABLE shoes ADD COLUMN volume TEXT CHECK (volume IN ('low', 'medium', 'high'));
ALTER TABLE shoes ADD COLUMN toe_box_shape TEXT CHECK (toe_box_shape IN ('asymmetric_steep', 'asymmetric_moderate', 'symmetric_round', 'symmetric_square'));
ALTER TABLE shoes ADD COLUMN heel_width TEXT CHECK (heel_width IN ('narrow', 'normal', 'wide'));
ALTER TABLE shoes ADD COLUMN forefoot_width TEXT CHECK (forefoot_width IN ('narrow', 'normal', 'wide'));
ALTER TABLE shoes ADD COLUMN flex_point_ratio NUMERIC(3,2);
```

### Integration with Existing Search

The shoe search scoring system gets new filter groups:

```javascript
{ key: 'volume',        type: 'sOrd', values: ['low','medium','high'], weight: 1.2 },
{ key: 'toe_box_shape', type: 'sSet', weight: 1.0 },
{ key: 'forefoot_width', type: 'sOrd', values: ['narrow','normal','wide'], weight: 0.8 },
{ key: 'heel_width',    type: 'sOrd', values: ['narrow','normal','wide'], weight: 0.6 },
{ key: 'flex_point',    type: 'sProx', weight: 0.7 },
```

---

## Implementation Status

### Done
- [x] SAM 3 segmentation working on Mac Mini M4 Pro (MPS)
- [x] Sole view measurement pipeline (toe shape, width, arch, heel ratios)
- [x] Side view measurement pipeline (instep, heel depth ratios)
- [x] Volume classification from combined metrics
- [x] FastAPI server with `/analyze-photo` and `/analyze-foot` endpoints
- [x] Cloudflare Tunnel at `scan.climbing-gear.com`
- [x] FootScanResults.jsx visualization component
- [x] test_sam3.py validation script
- [x] HTML results page generation in foot_measure.py

### Remaining
- [ ] Frontend scanner wizard (photo capture flow)
- [ ] Vercel proxy function (`/api/analyze-foot.js`)
- [ ] Health check polling + "scanner unavailable" fallback
- [ ] Wire scan results → shoe search filter presets
- [ ] Shoe data enrichment (volume, toe_box_shape, forefoot_width, heel_width tagging)
- [ ] Flex point ratio measurement tool for shoe images
- [ ] "Did this shoe fit?" feedback loop
- [ ] Save foot profile to localStorage for return visits

---

## Open Questions (Resolved)

| Question | Resolution |
|----------|-----------|
| Image processing library | **SAM 3** (HuggingFace transformers) for segmentation + **OpenCV** for measurements. |
| Reference object (A4 paper) | **Not needed.** Pipeline measures ratios only; shoe size provides absolute anchor. |
| Privacy | **Server-side (Mac Mini)**, photos never stored. GDPR compliant. |
| Sock vs barefoot | **Barefoot required.** |
| How many photos | **2 views:** sole (required) + side (required). Heel view dropped — heel width ratio derived from sole view. |
| Toe shape classification | **Contour-based from SAM 3 mask.** Fully deterministic. |
| Where to run ML | **Mac Mini M4 Pro** via Cloudflare Tunnel. SAM 3 on Apple Silicon MPS. |
