#!/usr/bin/env python3
"""
FastAPI server for foot scanner pipeline.

Endpoints:
    POST /analyze-photo  — process a single photo (sole or side)
    POST /analyze-foot   — process a complete scan (sole + optional side)
    GET  /health         — liveness + model status

Usage:
    uvicorn server:app --host 0.0.0.0 --port 8787

The SAM 3 model is loaded once at startup and reused for all requests.
"""
import io, time, os, json, tempfile
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import foot_measure

app = FastAPI(
    title="Foot Scanner API",
    description="SAM 3 foot segmentation + measurement pipeline",
    version="1.0.0",
)

# CORS — allow the Vercel frontend and localhost dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://climbing-gear.com",
        "https://www.climbing-gear.com",
        "https://*.vercel.app",
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Startup: pre-load SAM 3 ─────────────────────────────────────────────
_model_loaded = False
_model_load_time = 0.0


@app.on_event("startup")
async def startup():
    global _model_loaded, _model_load_time
    print("Pre-loading SAM 3 model...")
    t0 = time.time()
    foot_measure._load_sam3()
    _model_load_time = time.time() - t0
    _model_loaded = True
    print(f"SAM 3 ready in {_model_load_time:.1f}s")


# ── Helpers ──────────────────────────────────────────────────────────────

def _read_upload(upload: UploadFile) -> np.ndarray:
    """Read an UploadFile into an OpenCV BGR image."""
    contents = upload.file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Could not decode image")
    return img


# ── GET /health ──────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": _model_loaded,
        "model_load_time_s": round(_model_load_time, 1),
    }


# ── POST /analyze-photo ──────────────────────────────────────────────────

@app.post("/analyze-photo")
async def analyze_photo(
    photo: UploadFile = File(...),
    view: str = Form("sole"),  # "sole" or "side"
):
    """Process a single photo and return measurements.

    - view=sole: returns sole-view measurements (forefoot_width_ratio, arch_length_ratio, etc.)
    - view=side: returns side-view measurements (instep_height_ratio, heel_depth_ratio)

    Progressive processing: the frontend sends each photo as it's taken,
    so the user only waits for the last photo's ~2s inference time.
    """
    if view not in ("sole", "side"):
        raise HTTPException(status_code=400, detail="view must be 'sole' or 'side'")

    img = _read_upload(photo)
    t0 = time.time()

    # Segment
    mask = foot_measure.segment(img, prompt="foot")

    # Normalize orientation before measuring
    if view == "sole":
        mask, _, rot_info = foot_measure.normalize_sole_orientation(mask)
    else:
        mask, _, rot_info = foot_measure.normalize_side_orientation(mask)

    # Measure
    if view == "sole":
        measurements = foot_measure.measure_sole(mask)
        if measurements:
            measurements["rotation_angle"] = rot_info["fine_angle"]
    else:
        measurements = foot_measure.measure_side(mask)
        if measurements:
            measurements["rotation_angle"] = rot_info["rotation_angle"]

    if measurements is None:
        raise HTTPException(status_code=422, detail=f"Could not extract {view}-view measurements")

    dt = time.time() - t0

    # Strip pixel-coordinate fields that the frontend doesn't need
    # Keep only ratios, classifications, and key metadata
    response = {
        "view": view,
        "processing_time_s": round(dt, 2),
    }

    if view == "sole":
        response.update({
            "foot_length_px": measurements["foot_length_px"],
            "forefoot_width_ratio": measurements["forefoot_width_ratio"],
            "arch_length_ratio": measurements["arch_length_ratio"],
            "heel_width_ratio": measurements["heel_width_ratio"],
            "forefoot_width_class": measurements["forefoot_width_class"],
            "arch_length_class": measurements["arch_length_class"],
            "heel_width_class": measurements["heel_width_class"],
            "toe_shape": measurements["toe_shape"],
        })
    else:
        response.update({
            "foot_length_px": measurements["foot_length_px"],
            "instep_height_ratio": measurements["instep_height_ratio"],
            "heel_depth_ratio": measurements["heel_depth_ratio"],
            "instep_height_class": measurements["instep_height_class"],
            "heel_depth_class": measurements["heel_depth_class"],
        })

    return response


# ── POST /analyze-foot ───────────────────────────────────────────────────

@app.post("/analyze-foot")
async def analyze_foot(
    sole: UploadFile = File(...),
    side: UploadFile = File(...),
    shoe_size_eu: float = Form(None),
):
    """Process a complete foot scan (sole + side — both required).

    Returns combined measurements suitable for shoe recommendation,
    including forefoot_volume and heel_volume classifications.
    """
    t0 = time.time()

    # Process sole (required)
    sole_img = _read_upload(sole)
    sole_mask = foot_measure.segment(sole_img, prompt="foot")
    sole_mask, _, rot_info = foot_measure.normalize_sole_orientation(sole_mask)
    sole_m = foot_measure.measure_sole(sole_mask)
    if sole_m is None:
        raise HTTPException(status_code=422, detail="Could not extract sole-view measurements")

    # Process side (required)
    side_img = _read_upload(side)
    side_mask = foot_measure.segment(side_img, prompt="foot")
    side_mask, _, _ = foot_measure.normalize_side_orientation(side_mask)
    side_m = foot_measure.measure_side(side_mask)
    if side_m is None:
        raise HTTPException(status_code=422, detail="Could not extract side-view measurements")

    result = {
        "shoe_size_eu": shoe_size_eu,
        "forefoot_width_ratio": sole_m["forefoot_width_ratio"],
        "arch_length_ratio": sole_m["arch_length_ratio"],
        "heel_width_ratio": sole_m["heel_width_ratio"],
        "forefoot_width_class": sole_m["forefoot_width_class"],
        "arch_length_class": sole_m["arch_length_class"],
        "heel_width_class": sole_m["heel_width_class"],
        "toe_shape": sole_m["toe_shape"],
        "foot_length_px": sole_m["foot_length_px"],
        "rotation_angle": rot_info["fine_angle"],
        "instep_height_ratio": side_m["instep_height_ratio"],
        "heel_depth_ratio": side_m["heel_depth_ratio"],
        "instep_height_class": side_m["instep_height_class"],
        "heel_depth_class": side_m["heel_depth_class"],
    }

    # Derive volume classifications
    result["forefoot_volume"] = _classify_forefoot_volume(result)
    result["heel_volume"] = _classify_heel_volume(result)
    result["width"] = sole_m["forefoot_width_class"]
    result["heel_width"] = sole_m["heel_width_class"]
    result["processing_time_s"] = round(time.time() - t0, 2)

    return result


def _classify_forefoot_volume(result: dict) -> str:
    """Derive forefoot volume from instep height + forefoot width.

    Forefoot volume:
      - low:      narrow forefoot AND low instep → tight-fitting forefoot
      - high:     wide forefoot AND high instep → roomy forefoot
      - standard: everything else
    """
    fw = result.get("forefoot_width_class", "normal")
    instep = result.get("instep_height_class", "normal")

    low_signals = sum([fw == "narrow", instep == "low instep"])
    high_signals = sum([fw == "wide", instep == "high instep"])

    if low_signals == 2:
        return "low"
    if high_signals == 2:
        return "high"
    return "standard"


def _classify_heel_volume(result: dict) -> str:
    """Derive heel volume from heel width + heel depth.

    Heel volume:
      - low:      narrow heel AND shallow heel → tight-fitting heel
      - high:     wide heel AND deep heel → roomy heel
      - standard: everything else
    """
    hw = result.get("heel_width_class", "normal")
    hd = result.get("heel_depth_class", "normal")

    low_signals = sum([hw == "narrow heel", hd == "shallow heel"])
    high_signals = sum([hw == "wide heel", hd == "deep heel"])

    if low_signals == 2:
        return "low"
    if high_signals == 2:
        return "high"
    return "standard"


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8787)
