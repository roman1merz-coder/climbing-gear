# Foot Scanner — Pipeline Guide

> **Updated March 2026.** Production pipeline uses **SAM 3 (Segment Anything Model 3)**
> with text prompts for segmentation, running on Mac Mini M4 Pro.

---

## What This Is

The foot scanner lets users photograph their bare feet to determine foot shape,
then recommends best-fitting climbing shoes on climbing-gear.com.

**Current state:** SAM 3 segmentation + sole/side measurement pipeline is built
and running. FastAPI server exposes endpoints at `scan.climbing-gear.com` via
Cloudflare Tunnel. Frontend scanner wizard still to be built.

---

## Folder Structure

```
scanner/
├── README.md                  ← This file
├── foot-scanner-spec.md       ← Full implementation spec (v2)
├── foot-measurements.jpg      ← Reference photo
├── foot_measure.py            ← SAM 3 segmentation + measurement pipeline (ratios, classification, HTML output)
├── test_scans/                ← Sole-view test images
│   ├── sole_roman_45.jpg      ← Roman, EU 45 (clean, body not visible)
│   ├── sole_iris_40_a.jpg     ← Iris, EU 40 (body visible — the hard case)
│   └── sole_iris_40_b.jpg     ← Iris, EU 40 (body visible, different angle)
├── Foot 1_45_Roman/           ← Test scan set (Roman, EU 45)
└── Foot 2_40_Iris/            ← Test scan set (Iris, EU 40)
```

---

## Architecture

```
User's phone → sole photo → Mac Mini API → SAM 3 segmentation → OpenCV measurements → ratios JSON → shoe recommendations
```

**Processing runs on Roman's Mac Mini M4 Pro (64 GB)**, exposed via Cloudflare Tunnel
at `scan.climbing-gear.com`. SAM 3 model stays loaded in memory for fast inference.

---

## SAM 3 — Key Facts

| Property | Value |
|----------|-------|
| Model | SAM 3 (Meta, Nov 2025, ICLR 2026) |
| Parameters | 848M |
| Model size | ~3.4 GB |
| Concepts | 4M+ (zero-shot, text-prompted) |
| Our prompt | `text="foot"` |
| Mac compatibility | Via HuggingFace transformers on MPS (Apple Silicon GPU) |
| Expected speed (M4 Pro) | ~5–15 seconds per image (to be benchmarked) |
| License | Meta research license (free for research + commercial) |

**Why not the official Meta repo?** It requires CUDA/Triton (NVIDIA only).
The HuggingFace transformers implementation supports Apple Silicon MPS natively.

---

## Mac Mini Installation Guide

### Prerequisites

- macOS with Apple Silicon (M4 Pro confirmed)
- Python 3.12+ (`brew install python@3.12`)
- ~5 GB free disk space (model + dependencies)
- HuggingFace account (free) — needed to request SAM 3 model access

### Step 1: Request SAM 3 Model Access

1. Go to https://huggingface.co/facebook/sam3
2. Click "Request access" (requires free HuggingFace account)
3. Wait for approval (usually within hours)
4. Once approved, log in via CLI:

```bash
pip install huggingface_hub --break-system-packages
huggingface-cli login
# Paste your HF access token when prompted
```

### Step 2: Create Project Environment

```bash
mkdir -p ~/foot-scanner && cd ~/foot-scanner
python3.12 -m venv venv
source venv/bin/activate
```

### Step 3: Install Dependencies

```bash
# SAM 3 via HuggingFace transformers (supports MPS)
pip install git+https://github.com/huggingface/transformers
pip install torch torchvision

# CV + API stack
pip install opencv-python-headless numpy
pip install fastapi uvicorn python-multipart

# For first test
pip install Pillow
```

### Step 4: Download SAM 3 Model (one-time, ~3.4 GB)

```python
# Run once — downloads and caches the model
python3 -c "
from transformers import Sam3Model, Sam3Processor
print('Downloading SAM 3 model...')
model = Sam3Model.from_pretrained('facebook/sam3')
processor = Sam3Processor.from_pretrained('facebook/sam3')
print('Done. Model cached in ~/.cache/huggingface/')
"
```

### Step 5: MPS Fix (Apple Silicon)

There's a known issue with `.pin_memory()` on MPS devices.
After installing, apply this one-line fix:

```bash
# Find the file
SITE=$(python3 -c "import transformers; print(transformers.__file__.rsplit('/',1)[0])")
FILE="$SITE/models/sam3/processing_sam3_video.py"

# Remove .pin_memory() call on line ~343
# (Only needed if you get a "Cannot pin memory on MPS" error)
sed -i '' 's/\.pin_memory()//g' "$FILE" 2>/dev/null && echo "Fixed" || echo "File not found (may not need fix)"
```

### Step 6: First Test — Verify Segmentation Works

Copy `test_sam3.py` (from this scanner folder) to `~/foot-scanner/` and run:

```bash
cd ~/foot-scanner
source venv/bin/activate
python3 test_sam3.py /path/to/scanner/test_scans/sole_iris_40_a.jpg
```

This runs SAM 3 with `text="foot"` on the hardest test image (body visible)
and outputs:
- Segmentation mask overlay
- Mask coverage percentage
- Inference time

**Expected result:** Clean foot mask with no body/ankle leakage, even though
the person's legs and body are visible in the frame.

---

## Remaining Work

The SAM 3 pipeline and API server are running. What's left:

1. **Frontend scanner wizard** — photo capture flow with progressive processing
2. **Vercel proxy** — `/api/analyze-foot.js` serverless function
3. **Health check polling** — "scanner unavailable" fallback in frontend
4. **Search integration** — wire scan results to shoe filter presets
5. **Shoe data enrichment** — tag shoes with volume, toe_box_shape, forefoot_width, heel_width

---

## Key Rules

1. **Supabase is the single source of truth** for all product data — see CLAUDE.md
2. **SAM 3 text prompt is the segmentation approach** — `text="foot"`, zero-shot
3. **Test on the hard cases first** (sole_iris_40_a.jpg with body visible)
4. **Full spec** in `foot-scanner-spec.md` — covers API, pipeline, population data, and remaining work
