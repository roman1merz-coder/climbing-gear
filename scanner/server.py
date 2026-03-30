#!/usr/bin/env python3
"""
FastAPI server for foot scanner pipeline.

Endpoints:
    POST /analyze-photo      - process a single photo (sole or side)
    POST /analyze-foot       - process a complete scan (sole + optional side)
    POST /process-scan       - segment + measure + overlays (no interpretation)
    POST /process-scan-full  - FULL PIPELINE: segment + measure + overlays + LLM interpretation + recommendations + Supabase upload
    GET  /health             - liveness + model status

Usage:
    uvicorn server:app --host 0.0.0.0 --port 8787

The SAM 3 model is loaded once at startup and reused for all requests.
The local LLM (Qwen 2.5 7B via MLX) is loaded on first /process-scan-full call.
"""
import asyncio
import io, time, os, json, tempfile
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

import foot_measure
import scan_recommender

app = FastAPI(
    title="Foot Scanner API",
    description="SAM 3 foot segmentation + measurement pipeline",
    version="1.0.0",
)

# CORS - allow the Vercel frontend and localhost dev
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


# ── POST /debug-ball (temporary) ─────────────────────────────────────────

@app.post("/debug-ball")
async def debug_ball(photo: UploadFile = File(...)):
    """Temporary: return row-by-row width + left-edge data around the ball zone."""
    import numpy as np
    img = _read_upload(photo)
    mask = foot_measure.segment(img, prompt="foot")
    mask, _, rot_info = foot_measure.normalize_sole_orientation(mask)
    ys, xs = np.where(mask > 0)
    by, bh = int(ys.min()), int(ys.max()) - int(ys.min())
    upper, lower = int(ys.min()), int(ys.max())
    foot_len = lower - upper
    rows = []
    for row in range(by + int(bh * 0.15), by + int(bh * 0.50)):
        px = np.where(mask[row, :] > 0)[0]
        if len(px) == 0:
            continue
        rows.append({
            "row": int(row),
            "pct": round((row - upper) / foot_len * 100, 1),
            "width": int(px[-1] - px[0]),
            "left": int(px[0]),
            "right": int(px[-1]),
        })
    # Current algo result
    m = foot_measure.measure_sole(mask)
    return {
        "rotation": rot_info["fine_angle"],
        "upper": upper, "lower": lower, "foot_len": foot_len,
        "algo_ball_row": m["ball_row"] if m else None,
        "algo_ball_pct": round((m["ball_row"] - upper) / foot_len * 100, 1) if m else None,
        "algo_ball_width": m["ball_width_px"] if m else None,
        "algo_ball_left": m["ball_left"] if m else None,
        "zone_data": rows,
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
            "toe_confidence": measurements.get("toe_confidence", "unknown"),
            "toe_meta": measurements.get("toe_meta"),
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
    """Process a complete foot scan (sole + side - both required).

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
        "toe_confidence": sole_m.get("toe_confidence", "unknown"),
        "toe_meta": sole_m.get("toe_meta"),
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
    result["forefoot_width_class"] = sole_m["forefoot_width_class"]
    result["heel_width_class"] = sole_m["heel_width_class"]
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


# ── POST /process-scan ────────────────────────────────────────────────

@app.post("/process-scan")
async def process_scan_endpoint(
    sole: UploadFile = File(...),
    side: UploadFile = File(None),
    scan_id: str = Form("scan"),
    out_dir: str = Form("/Users/rolfes/foot-scanner/results"),
):
    """Run the full pipeline: segment - normalize - measure - overlay.

    Saves overlay PNGs to out_dir and returns measurements + overlay paths.
    """
    t0 = time.time()
    os.makedirs(out_dir, exist_ok=True)

    # -- Sole processing --
    sole_img = _read_upload(sole)
    sole_mask = foot_measure.segment(sole_img, prompt="foot")
    sole_mask, sole_img_norm, rot_info = foot_measure.normalize_sole_orientation(
        sole_mask, sole_img
    )
    sole_m = foot_measure.measure_sole(sole_mask)
    if sole_m is None:
        raise HTTPException(status_code=422, detail="Could not measure sole")

    sole_m["rotation_angle"] = rot_info["fine_angle"]
    sole_overlay_path = os.path.join(out_dir, f"{scan_id}-sole_overlay.png")
    foot_measure.draw_sole_overlay(None, sole_mask, sole_m, sole_overlay_path)

    result = {
        "sole": {"measurements": sole_m, "overlay_file": f"{scan_id}-sole_overlay.png"},
    }

    # -- Side processing (optional) --
    if side is not None and side.filename:
        side_img = _read_upload(side)
        side_mask = foot_measure.segment(side_img, prompt="foot")
        side_mask, side_img, side_rot_info = foot_measure.normalize_side_orientation(
            side_mask, side_img
        )
        side_m = foot_measure.measure_side(side_mask)
        if side_m:
            side_m["rotation_angle"] = side_rot_info["rotation_angle"]
            side_overlay_path = os.path.join(out_dir, f"{scan_id}-side_overlay.png")
            foot_measure.draw_side_overlay(side_img, side_mask, side_m, side_overlay_path)
            result["side"] = {
                "measurements": side_m,
                "overlay_file": f"{scan_id}-side_overlay.png",
            }

    result["processing_time_s"] = round(time.time() - t0, 2)
    return result


# -- POST /process-scan-full -------------------------------------------------
# Full automated pipeline: segment + measure + overlay + LLM + Supabase update
# This is the endpoint the frontend will call for a complete scan.

@app.post("/process-scan-full")
async def process_scan_full_endpoint(
    sole: UploadFile = File(...),
    side: UploadFile = File(None),
    scan_id: str = Form("scan"),
    out_dir: str = Form("/Users/rolfes/foot-scanner/results"),
):
    """Full automated pipeline:
    1. SAM 3 segmentation + measurement + overlay (same as /process-scan)
    2. Upload overlays to Supabase storage
    3. Fetch user's shoe fit data from foot_scan_fits
    4. Pre-filter shoe candidates
    5. Run local LLM for interpretation + recommendations
    6. Validate recommendation slugs
    7. PATCH foot_scan_fits with all results

    Returns the complete result including measurements, interpretation,
    and recommendations. Total time: ~20-30s.
    """
    try:
        t0 = time.time()
        os.makedirs(out_dir, exist_ok=True)
        timings = {}

        # ── Step 1: Segmentation + Measurement + Overlays ──────────────────
        t_seg = time.time()

        sole_img = _read_upload(sole)
        sole_mask = foot_measure.segment(sole_img, prompt="foot")
        sole_mask, sole_img_norm, rot_info = foot_measure.normalize_sole_orientation(
            sole_mask, sole_img
        )
        sole_m = foot_measure.measure_sole(sole_mask)
        if sole_m is None:
            raise HTTPException(status_code=422, detail="Could not measure sole")

        sole_m["rotation_angle"] = rot_info["fine_angle"]
        sole_overlay_path = os.path.join(out_dir, f"{scan_id}-sole_overlay.png")
        foot_measure.draw_sole_overlay(None, sole_mask, sole_m, sole_overlay_path)

        side_m = None
        side_overlay_path = None
        if side is not None and side.filename:
            side_img = _read_upload(side)
            side_mask = foot_measure.segment(side_img, prompt="foot")
            side_mask, side_img, side_rot_info = foot_measure.normalize_side_orientation(
                side_mask, side_img
            )
            side_m = foot_measure.measure_side(side_mask)
            if side_m:
                side_m["rotation_angle"] = side_rot_info["rotation_angle"]
                side_overlay_path = os.path.join(out_dir, f"{scan_id}-side_overlay.png")
                foot_measure.draw_side_overlay(side_img, side_mask, side_m, side_overlay_path)

        timings["segmentation_s"] = round(time.time() - t_seg, 1)

        # ── Step 2: Upload overlays to Supabase ────────────────────────────
        t_upload = time.time()
        try:
            scan_recommender.upload_overlay(scan_id, "sole_overlay.png", sole_overlay_path)
            if side_overlay_path:
                scan_recommender.upload_overlay(scan_id, "side_overlay.png", side_overlay_path)
        except Exception as e:
            print(f"[process-scan-full] Warning: overlay upload failed: {e}")
        timings["overlay_upload_s"] = round(time.time() - t_upload, 1)

        # ── Step 3: Build measurement profile ──────────────────────────────
        profile = {
            "toe_shape": sole_m.get("toe_shape"),
            "toe_confidence": sole_m.get("toe_confidence"),
            "forefoot_width_ratio": sole_m.get("forefoot_width_ratio"),
            "heel_width_ratio": sole_m.get("heel_width_ratio"),
            "arch_length_ratio": sole_m.get("arch_length_ratio"),
            "forefoot_width_class": sole_m.get("forefoot_width_class"),
            "heel_width_class": sole_m.get("heel_width_class"),
            "arch_length_class": sole_m.get("arch_length_class"),
            "hallux_valgus_class": sole_m.get("hallux_valgus_class", "normal"),
            "hva_offset_ratio": sole_m.get("hva_offset_ratio"),
        }
        if side_m:
            profile.update({
                "instep_height_ratio": side_m.get("instep_height_ratio"),
                "heel_depth_ratio": side_m.get("heel_depth_ratio"),
                "instep_height_class": side_m.get("instep_height_class"),
                "heel_depth_class": side_m.get("heel_depth_class"),
            })

        # ── Step 4: Fetch user's scan data from Supabase ───────────────────
        scan_data = scan_recommender.fetch_scan_data(scan_id) or {}
        profile["next_shoe_preference"] = scan_data.get("next_shoe_preference", "allround")
        profile["sex"] = scan_data.get("sex", "")
        profile["shoes"] = scan_data.get("shoes") or []
        profile["next_shoe_notes"] = scan_data.get("next_shoe_notes", "")

        # ── Step 5: Pre-filter and categorize shoe candidates ─────────────
        t_filter = time.time()
        cat_result = scan_recommender.get_categorized_candidates(profile)
        insights = scan_recommender.get_applicable_insights(profile)
        timings["candidate_filter_s"] = round(time.time() - t_filter, 1)

        # Flatten categorized candidates into a single list with _category tag
        candidates = []
        for cat_name, cat_shoes in cat_result["categories"].items():
            for shoe in cat_shoes:
                shoe["_category"] = cat_name
                candidates.append(shoe)

        # ── Step 6: LLM interpretation + recommendations ───────────────────
        t_llm = time.time()
        import scan_llm  # lazy import - model loads on first call

        # Merge fresh measurements into scan_data for the LLM prompt
        # (scan_data from Supabase may have stale/empty measurement fields)
        # IMPORTANT: Exclude interpretation/recommendations/internal fields from
        # the LLM input - they're outputs, not inputs. Including them causes the
        # model to reproduce previous (potentially wrong) text verbatim.
        _llm_exclude_keys = {
            "interpretation", "recommendations", "id", "created_at",
            "landmarks", "validation_results", "generated_at", "status",
            "confidence", "notes", "volume_class", "email",
        }
        llm_scan_data = {
            k: v for k, v in {**scan_data, **profile}.items()
            if k not in _llm_exclude_keys
        }
        # Add stiffness/performance baseline metadata for the LLM prompt
        llm_scan_data["user_avg_stiffness"] = cat_result["user_avg_stiffness"]
        llm_scan_data["user_stiffness_label"] = cat_result["user_stiffness_label"]
        llm_scan_data["user_performance_label"] = cat_result["user_performance_label"]

        llm_result = scan_llm.generate_interpretation(
            scan_data=llm_scan_data,
            shoe_candidates=candidates,
        )
        timings["llm_generation_s"] = round(time.time() - t_llm, 1)

        # ── Step 7: Validate slugs against DB ──────────────────────────────
        interpretation = None
        recommendations = None

        if llm_result:
            interpretation = llm_result.get("interpretation")
            recommendations = llm_result.get("recommendations", [])

            # Final slug validation (belt + suspenders)
            validated_recs = []
            for rec in recommendations:
                if scan_recommender.verify_slug(rec.get("slug", "")):
                    validated_recs.append(rec)
                else:
                    print(f"[process-scan-full] Dropping unverified slug: {rec.get('slug')}")
            recommendations = validated_recs
        else:
            print("[process-scan-full] WARNING: LLM generation failed, no interpretation/recommendations")

        # ── Step 8: Update Supabase with all results ───────────────────────
        t_db = time.time()

        # Map toe_confidence to numeric for DB
        toe_conf_map = {"high": 0.9, "moderate": 0.65, "low": 0.4}
        toe_conf_str = str(sole_m.get("toe_confidence", "low"))
        toe_conf_num = toe_conf_map.get(toe_conf_str, 0.5)

        update_data = {
            "toe_shape": profile.get("toe_shape"),
            "toe_confidence": toe_conf_num,
            "forefoot_width_ratio": profile.get("forefoot_width_ratio"),
            "heel_width_ratio": profile.get("heel_width_ratio"),
            "arch_length_ratio": profile.get("arch_length_ratio"),
            "forefoot_width_class": profile.get("forefoot_width_class"),
            "heel_width_class": profile.get("heel_width_class"),
            "arch_length_class": profile.get("arch_length_class"),
            "hallux_valgus_class": profile.get("hallux_valgus_class"),
            "hva_offset_ratio": profile.get("hva_offset_ratio"),
            "confidence": "medium",
        }
        if side_m:
            update_data.update({
                "instep_height_ratio": profile.get("instep_height_ratio"),
                "heel_depth_ratio": profile.get("heel_depth_ratio"),
                "instep_height_class": profile.get("instep_height_class"),
                "heel_depth_class": profile.get("heel_depth_class"),
            })

        # Build notes
        notes_parts = []
        notes_parts.append(f"Toe: {profile.get('toe_shape')} ({toe_conf_str} confidence)")
        notes_parts.append(f"Width: {profile.get('forefoot_width_ratio')} ({profile.get('forefoot_width_class')})")
        notes_parts.append(f"Heel: {profile.get('heel_width_ratio')} ({profile.get('heel_width_class')})")
        notes_parts.append(f"Arch: {profile.get('arch_length_ratio')} ({profile.get('arch_length_class')})")
        if side_m:
            notes_parts.append(f"Instep: {profile.get('instep_height_ratio')} ({profile.get('instep_height_class')})")
            notes_parts.append(f"Heel depth: {profile.get('heel_depth_ratio')} ({profile.get('heel_depth_class')})")
        update_data["notes"] = ". ".join(notes_parts) + "."

        if interpretation:
            update_data["interpretation"] = interpretation
        if recommendations:
            update_data["recommendations"] = recommendations

        try:
            scan_recommender.update_scan(scan_id, update_data)
        except Exception as e:
            print(f"[process-scan-full] Warning: Supabase update failed: {e}")

        timings["db_update_s"] = round(time.time() - t_db, 1)
        timings["total_s"] = round(time.time() - t0, 1)

        # ── Response ───────────────────────────────────────────────────────
        return {
            "scan_id": scan_id,
            "measurements": profile,
            "interpretation": interpretation,
            "recommendations": recommendations,
            "insights_triggered": [i["title"] for i in insights],
            "candidates_evaluated": len(candidates),
            "timings": timings,
        }
    except Exception as e:
        print(f"[ERROR in /process-scan-full] {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ── Async pipeline state ────────────────────────────────────────────────
# In-memory state for active scans. Keyed by scan_id.
# Each entry: {
#   "photos_ready": bool,
#   "preferences_ready": bool,
#   "recommendations_ready": bool,
#   "stage": str,  # segmenting | analyzing | waiting_preferences | finding_shoes | complete | error
#   "error": str | None,
#   "profile": dict | None,      # measurements from SAM3
#   "started_at": float,          # time.time()
#   "measurements_at": float | None,
#   "recommendations_at": float | None,
# }
_pipeline_state: dict = {}
_pipeline_lock = asyncio.Lock()
_PIPELINE_TTL = 3600  # Remove completed entries after 1 hour


def _cleanup_old_entries():
    """Remove pipeline entries older than TTL to prevent memory leaks."""
    now = time.time()
    stale = [
        sid for sid, s in _pipeline_state.items()
        if s["stage"] in ("complete", "error") and now - s["started_at"] > _PIPELINE_TTL
    ]
    for sid in stale:
        del _pipeline_state[sid]
    if stale:
        print(f"[pipeline] Cleaned up {len(stale)} old entries")

RESULTS_DIR = "/Users/rolfes/foot-scanner/results"


class PreferencesPayload(BaseModel):
    scan_id: str
    sex: Optional[str] = None
    street_size_eu: Optional[float] = None
    next_shoe_preference: Optional[str] = None
    next_shoe_notes: Optional[str] = None
    shoes: Optional[list] = None
    email: Optional[str] = None


# ── POST /scan-start ────────────────────────────────────────────────────

@app.post("/scan-start")
async def scan_start(scan_id: str = Form(...)):
    """Start the SAM3 segmentation pipeline for a scan.

    The frontend has already uploaded photos to Supabase storage. This
    endpoint downloads them and starts SAM3 processing as a background
    task. Returns immediately so the user can fill in preferences.
    """
    async with _pipeline_lock:
        _cleanup_old_entries()

        if scan_id in _pipeline_state:
            # Allow re-run if previous attempt errored out
            if _pipeline_state[scan_id].get("stage") != "error":
                return {"scan_id": scan_id, "status": "already_running"}

        _pipeline_state[scan_id] = {
            "photos_ready": False,
            "preferences_ready": False,
            "recommendations_ready": False,
            "stage": "segmenting",
            "error": None,
            "profile": None,
            "started_at": time.time(),
            "measurements_at": None,
            "recommendations_at": None,
        }

    # Update DB with pipeline_stage
    try:
        scan_recommender.update_scan(scan_id, {
            "pipeline_stage": "segmenting",
            "pipeline_started_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        print(f"[scan-start] Warning: DB update failed: {e}")

    # Start background task
    asyncio.create_task(_background_process_photos(scan_id))

    return {"scan_id": scan_id, "status": "started"}


async def _background_process_photos(scan_id: str):
    """Download photos from Supabase and run SAM3 segmentation.

    Runs in the background while the user fills in preferences.
    Updates _pipeline_state when done.
    """
    state = _pipeline_state.get(scan_id)
    if not state:
        return

    try:
        out_dir = os.path.join(RESULTS_DIR, scan_id)
        os.makedirs(out_dir, exist_ok=True)

        # Download photos from Supabase storage
        import requests as req
        sb_url = scan_recommender.SB_URL
        sb_key = scan_recommender.SB_KEY

        sole_url = f"{sb_url}/storage/v1/object/public/foot-scans/scans/{scan_id}-sole.jpg"
        side_url = f"{sb_url}/storage/v1/object/public/foot-scans/scans/{scan_id}-side.jpg"

        print(f"[scan-bg] Downloading photos for {scan_id}...")
        sole_resp = await asyncio.to_thread(req.get, sole_url)
        if sole_resp.status_code != 200:
            raise Exception(f"Failed to download sole photo: HTTP {sole_resp.status_code}")
        sole_arr = np.frombuffer(sole_resp.content, np.uint8)
        sole_img = cv2.imdecode(sole_arr, cv2.IMREAD_COLOR)
        if sole_img is None:
            raise Exception("Could not decode sole photo")

        side_img = None
        side_resp = await asyncio.to_thread(req.get, side_url)
        if side_resp.status_code == 200:
            side_arr = np.frombuffer(side_resp.content, np.uint8)
            side_img = cv2.imdecode(side_arr, cv2.IMREAD_COLOR)

        # Run SAM3 segmentation (CPU/GPU intensive - run in thread)
        print(f"[scan-bg] Segmenting sole for {scan_id}...")

        def _run_segmentation():
            sole_mask = foot_measure.segment(sole_img, prompt="foot")
            sole_mask, sole_img_norm, rot_info = foot_measure.normalize_sole_orientation(
                sole_mask, sole_img
            )
            sole_m = foot_measure.measure_sole(sole_mask)
            if sole_m is None:
                raise Exception("Could not measure sole")
            sole_m["rotation_angle"] = rot_info["fine_angle"]

            sole_overlay_path = os.path.join(out_dir, f"{scan_id}-sole_overlay.png")
            foot_measure.draw_sole_overlay(None, sole_mask, sole_m, sole_overlay_path)

            side_m = None
            side_overlay_path = None
            if side_img is not None:
                s_mask = foot_measure.segment(side_img, prompt="foot")
                s_mask, s_img, s_rot = foot_measure.normalize_side_orientation(s_mask, side_img)
                side_m = foot_measure.measure_side(s_mask)
                if side_m:
                    side_m["rotation_angle"] = s_rot["rotation_angle"]
                    side_overlay_path = os.path.join(out_dir, f"{scan_id}-side_overlay.png")
                    foot_measure.draw_side_overlay(s_img, s_mask, side_m, side_overlay_path)

            return sole_m, side_m, sole_overlay_path, side_overlay_path

        sole_m, side_m, sole_overlay_path, side_overlay_path = await asyncio.to_thread(
            _run_segmentation
        )

        # Upload overlays to Supabase
        print(f"[scan-bg] Uploading overlays for {scan_id}...")
        try:
            await asyncio.to_thread(
                scan_recommender.upload_overlay, scan_id, "sole_overlay.png", sole_overlay_path
            )
            if side_overlay_path:
                await asyncio.to_thread(
                    scan_recommender.upload_overlay, scan_id, "side_overlay.png", side_overlay_path
                )
        except Exception as e:
            print(f"[scan-bg] Warning: overlay upload failed: {e}")

        # Build profile
        profile = {
            "toe_shape": sole_m.get("toe_shape"),
            "toe_confidence": sole_m.get("toe_confidence"),
            "forefoot_width_ratio": sole_m.get("forefoot_width_ratio"),
            "heel_width_ratio": sole_m.get("heel_width_ratio"),
            "arch_length_ratio": sole_m.get("arch_length_ratio"),
            "forefoot_width_class": sole_m.get("forefoot_width_class"),
            "heel_width_class": sole_m.get("heel_width_class"),
            "arch_length_class": sole_m.get("arch_length_class"),
            "hallux_valgus_class": sole_m.get("hallux_valgus_class", "normal"),
            "hva_offset_ratio": sole_m.get("hva_offset_ratio"),
        }
        if side_m:
            profile.update({
                "instep_height_ratio": side_m.get("instep_height_ratio"),
                "heel_depth_ratio": side_m.get("heel_depth_ratio"),
                "instep_height_class": side_m.get("instep_height_class"),
                "heel_depth_class": side_m.get("heel_depth_class"),
            })

        # Write measurements to DB
        toe_conf_map = {"high": 0.9, "moderate": 0.65, "low": 0.4}
        toe_conf_str = str(sole_m.get("toe_confidence", "low"))
        toe_conf_num = toe_conf_map.get(toe_conf_str, 0.5)

        update_data = {
            "toe_shape": profile.get("toe_shape"),
            "toe_confidence": toe_conf_num,
            "forefoot_width_ratio": profile.get("forefoot_width_ratio"),
            "heel_width_ratio": profile.get("heel_width_ratio"),
            "arch_length_ratio": profile.get("arch_length_ratio"),
            "forefoot_width_class": profile.get("forefoot_width_class"),
            "heel_width_class": profile.get("heel_width_class"),
            "arch_length_class": profile.get("arch_length_class"),
            "hallux_valgus_class": profile.get("hallux_valgus_class"),
            "hva_offset_ratio": profile.get("hva_offset_ratio"),
            "confidence": "medium",
            "pipeline_stage": "waiting_preferences",
        }
        if side_m:
            update_data.update({
                "instep_height_ratio": profile.get("instep_height_ratio"),
                "heel_depth_ratio": profile.get("heel_depth_ratio"),
                "instep_height_class": profile.get("instep_height_class"),
                "heel_depth_class": profile.get("heel_depth_class"),
            })

        # Build notes
        notes_parts = []
        notes_parts.append(f"Toe: {profile.get('toe_shape')} ({toe_conf_str} confidence)")
        notes_parts.append(f"Width: {profile.get('forefoot_width_ratio')} ({profile.get('forefoot_width_class')})")
        notes_parts.append(f"Heel: {profile.get('heel_width_ratio')} ({profile.get('heel_width_class')})")
        notes_parts.append(f"Arch: {profile.get('arch_length_ratio')} ({profile.get('arch_length_class')})")
        if side_m:
            notes_parts.append(f"Instep: {profile.get('instep_height_ratio')} ({profile.get('instep_height_class')})")
            notes_parts.append(f"Heel depth: {profile.get('heel_depth_ratio')} ({profile.get('heel_depth_class')})")
        update_data["notes"] = ". ".join(notes_parts) + "."

        try:
            await asyncio.to_thread(scan_recommender.update_scan, scan_id, update_data)
        except Exception as e:
            print(f"[scan-bg] Warning: measurement DB update failed: {e}")

        # Update pipeline state
        async with _pipeline_lock:
            state["photos_ready"] = True
            state["stage"] = "waiting_preferences"
            state["profile"] = profile
            state["measurements_at"] = time.time()

        elapsed = time.time() - state["started_at"]
        print(f"[scan-bg] Photos processed for {scan_id} in {elapsed:.1f}s")

        # Check if preferences already submitted - if so, trigger recommendations
        async with _pipeline_lock:
            if state["preferences_ready"]:
                asyncio.create_task(_background_generate_recommendations(scan_id))

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[scan-bg] ERROR processing {scan_id}: {e}")
        async with _pipeline_lock:
            state["stage"] = "error"
            state["error"] = str(e)
        try:
            await asyncio.to_thread(
                scan_recommender.update_scan, scan_id,
                {"pipeline_stage": "error", "pipeline_error": str(e)}
            )
        except Exception:
            pass


# ── POST /scan-preferences ──────────────────────────────────────────────

@app.post("/scan-preferences")
async def scan_preferences(payload: PreferencesPayload):
    """Save user preferences and trigger recommendations if photos are done.

    Called when the user submits the shoe fit form. If SAM3 processing
    has already finished, this immediately triggers the Sonnet API call.
    If not, the recommendation step starts as soon as SAM3 completes.
    """
    scan_id = payload.scan_id

    # Save preferences to Supabase (same as the old saveShoeFitData)
    pref_data = {}
    if payload.sex is not None:
        pref_data["sex"] = payload.sex
    if payload.street_size_eu is not None:
        pref_data["street_size_eu"] = payload.street_size_eu
    if payload.next_shoe_preference is not None:
        pref_data["next_shoe_preference"] = payload.next_shoe_preference
    if payload.next_shoe_notes is not None:
        pref_data["next_shoe_notes"] = payload.next_shoe_notes
    if payload.shoes is not None:
        pref_data["shoes"] = payload.shoes
    if payload.email is not None:
        pref_data["email"] = payload.email

    try:
        scan_recommender.update_scan(scan_id, pref_data)
    except Exception as e:
        print(f"[scan-preferences] DB save failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save preferences: {e}")

    async with _pipeline_lock:
        # If pipeline isn't tracked yet (scan-start not called), create state
        if scan_id not in _pipeline_state:
            _pipeline_state[scan_id] = {
                "photos_ready": False,
                "preferences_ready": True,
                "recommendations_ready": False,
                "stage": "waiting_preferences",
                "error": None,
                "profile": None,
                "started_at": time.time(),
                "measurements_at": None,
                "recommendations_at": None,
            }
            return {"scan_id": scan_id, "preferences_saved": True, "status": "waiting_for_photos"}

        state = _pipeline_state[scan_id]
        state["preferences_ready"] = True

        if state["photos_ready"] and not state["recommendations_ready"] and state["stage"] != "finding_shoes":
            # Both ready - trigger recommendations
            state["stage"] = "finding_shoes"
            asyncio.create_task(_background_generate_recommendations(scan_id))
            return {"scan_id": scan_id, "preferences_saved": True, "status": "generating_recommendations"}
        elif state["photos_ready"]:
            return {"scan_id": scan_id, "preferences_saved": True, "status": state["stage"]}
        else:
            return {"scan_id": scan_id, "preferences_saved": True, "status": "waiting_for_photos"}


async def _background_generate_recommendations(scan_id: str):
    """Pre-filter shoes, call Sonnet API, write results to DB.

    Triggered when both photos_ready and preferences_ready are True.
    """
    state = _pipeline_state.get(scan_id)
    if not state:
        return

    try:
        async with _pipeline_lock:
            state["stage"] = "finding_shoes"

        # Update DB stage
        try:
            await asyncio.to_thread(
                scan_recommender.update_scan, scan_id,
                {"pipeline_stage": "finding_shoes"}
            )
        except Exception:
            pass

        # Fetch full scan data (measurements + preferences merged)
        scan_data = await asyncio.to_thread(scan_recommender.fetch_scan_data, scan_id)
        if not scan_data:
            raise Exception(f"No scan data found for {scan_id}")

        # Merge in-memory profile (fresh measurements) with DB data
        profile = state.get("profile", {}) or {}
        merged = {**scan_data, **profile}
        merged["next_shoe_preference"] = scan_data.get("next_shoe_preference", "allround")
        merged["sex"] = scan_data.get("sex", "")
        merged["shoes"] = scan_data.get("shoes") or []
        merged["next_shoe_notes"] = scan_data.get("next_shoe_notes", "")

        # Pre-filter 50 shoe candidates
        print(f"[scan-recs] Pre-filtering candidates for {scan_id}...")
        cat_result = await asyncio.to_thread(scan_recommender.get_categorized_candidates, merged)
        insights = await asyncio.to_thread(scan_recommender.get_applicable_insights, merged)

        # Flatten categorized candidates with _category tag
        candidates = []
        for cat_name, cat_shoes in cat_result["categories"].items():
            for shoe in cat_shoes:
                shoe["_category"] = cat_name
                candidates.append(shoe)

        # Build LLM input data (exclude outputs and internal fields)
        _llm_exclude_keys = {
            "interpretation", "recommendations", "id", "created_at",
            "landmarks", "validation_results", "generated_at", "status",
            "confidence", "notes", "volume_class", "email",
            "pipeline_stage", "pipeline_error", "pipeline_started_at",
        }
        llm_scan_data = {
            k: v for k, v in merged.items()
            if k not in _llm_exclude_keys
        }
        llm_scan_data["user_avg_stiffness"] = cat_result["user_avg_stiffness"]
        llm_scan_data["user_stiffness_label"] = cat_result["user_stiffness_label"]
        llm_scan_data["user_performance_label"] = cat_result["user_performance_label"]

        # Call Sonnet API
        print(f"[scan-recs] Calling Sonnet API for {scan_id} with {len(candidates)} candidates...")
        import scan_llm_sonnet
        llm_result = await asyncio.to_thread(
            scan_llm_sonnet.generate_interpretation_sonnet,
            scan_data=llm_scan_data,
            shoe_candidates=candidates,
        )

        if not llm_result:
            raise Exception("Sonnet API returned no result")

        interpretation = llm_result.get("interpretation")
        recommendations = llm_result.get("recommendations", [])

        # Validate slugs
        validated_recs = []
        for rec in recommendations:
            if await asyncio.to_thread(scan_recommender.verify_slug, rec.get("slug", "")):
                validated_recs.append(rec)
            else:
                print(f"[scan-recs] Dropping unverified slug: {rec.get('slug')}")
        recommendations = validated_recs

        # Write results to DB
        result_data = {"pipeline_stage": "complete"}
        if interpretation:
            result_data["interpretation"] = interpretation
        if recommendations:
            result_data["recommendations"] = recommendations

        await asyncio.to_thread(scan_recommender.update_scan, scan_id, result_data)

        # Update in-memory state
        async with _pipeline_lock:
            state["recommendations_ready"] = True
            state["stage"] = "complete"
            state["recommendations_at"] = time.time()

        elapsed = time.time() - state["started_at"]
        print(f"[scan-recs] Recommendations complete for {scan_id} in {elapsed:.1f}s total "
              f"({len(recommendations)} recs)")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[scan-recs] ERROR generating recommendations for {scan_id}: {e}")
        async with _pipeline_lock:
            state["stage"] = "error"
            state["error"] = str(e)
        try:
            await asyncio.to_thread(
                scan_recommender.update_scan, scan_id,
                {"pipeline_stage": "error", "pipeline_error": str(e)}
            )
        except Exception:
            pass


# ── GET /scan-status/{scan_id} ──────────────────────────────────────────

@app.get("/scan-status/{scan_id}")
async def scan_status(scan_id: str):
    """Poll endpoint for frontend progress tracking.

    Returns the current pipeline state including stage, progress
    percentage, and results when complete.
    """
    state = _pipeline_state.get(scan_id)

    if not state:
        # Not in memory - check DB for completed scans
        scan_data = scan_recommender.fetch_scan_data(scan_id)
        if scan_data and scan_data.get("pipeline_stage") == "complete":
            return {
                "scan_id": scan_id,
                "stage": "complete",
                "progress": 100,
                "photos_ready": True,
                "preferences_ready": True,
                "recommendations_ready": True,
                "interpretation": scan_data.get("interpretation"),
                "recommendations": scan_data.get("recommendations"),
            }
        elif scan_data and scan_data.get("pipeline_stage") == "error":
            return {
                "scan_id": scan_id,
                "stage": "error",
                "progress": 0,
                "error": scan_data.get("pipeline_error"),
            }
        else:
            return {
                "scan_id": scan_id,
                "stage": "unknown",
                "progress": 0,
                "error": "Scan not found in pipeline",
            }

    # Calculate progress percentage based on stage and elapsed time
    elapsed = time.time() - state["started_at"]
    stage = state["stage"]

    if stage == "segmenting":
        # SAM3 typically takes 15-25s. Smoothly progress 0-35%.
        progress = min(35, int(elapsed / 25 * 35))
    elif stage == "waiting_preferences":
        # Photos done, waiting for user. Hold at 40%.
        progress = 40
    elif stage == "finding_shoes":
        # Sonnet API typically takes 45-60s.
        if state["measurements_at"]:
            recs_elapsed = time.time() - state["measurements_at"]
        else:
            recs_elapsed = elapsed - 25  # rough estimate
        # Progress from 45% to 95% over ~55 seconds
        progress = min(95, 45 + int(max(0, recs_elapsed) / 55 * 50))
    elif stage == "complete":
        progress = 100
    elif stage == "error":
        progress = 0
    else:
        progress = 0

    result = {
        "scan_id": scan_id,
        "stage": stage,
        "progress": progress,
        "photos_ready": state["photos_ready"],
        "preferences_ready": state["preferences_ready"],
        "recommendations_ready": state["recommendations_ready"],
        "error": state.get("error"),
    }

    # Include results when complete
    if stage == "complete":
        scan_data = scan_recommender.fetch_scan_data(scan_id)
        if scan_data:
            result["interpretation"] = scan_data.get("interpretation")
            result["recommendations"] = scan_data.get("recommendations")

    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8787)
