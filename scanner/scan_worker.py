#!/usr/bin/env python3
"""
Scan worker - polls Supabase for pending scans, processes them locally.

This replaces the need for any tunnel/port forwarding. The Mac Mini
pulls work from Supabase instead of accepting inbound connections.

Flow:
  1. Poll foot_scan_fits for rows where pipeline_stage = 'pending'
  2. Download photos from Supabase storage
  3. Run SAM3 segmentation + measurement
  4. Upload overlays to Supabase storage
  5. Check if preferences are filled (sex is not null)
  6. If yes: run Sonnet API for recommendations, write results
  7. If no: set stage = 'waiting_preferences', re-check on next poll

Usage:
    python3 scan_worker.py

Managed by launchd (auto-restarts on crash).
"""
import asyncio
import os
import sys
import time
import traceback

import cv2
import numpy as np
import requests

# V2 engines live in climbing-gear/scanner/explore_v2/. scan_worker.py runs
# via a symlink (~/foot-scanner/scan_worker.py), so resolve the *real*
# scanner dir and put it + explore_v2/ on sys.path before importing the V2
# pipeline. Harmless for the existing benchmark/* imports (same files).
_REAL_SCANNER_DIR = os.path.dirname(os.path.realpath(__file__))
for _p in (os.path.join(_REAL_SCANNER_DIR, "explore_v2"), _REAL_SCANNER_DIR):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# Local modules (symlinked from climbing-gear/scanner/)
import foot_measure
import scan_recommender
import scan_alert

# ── Config ──────────────────────────────────────────────────────────────
POLL_INTERVAL = 5          # seconds between polls
RESULTS_DIR = "/Users/rolfes/foot-scanner/results"
SB_URL = scan_recommender.SB_URL
SB_KEY = scan_recommender.SB_KEY

# Network timeouts for every HTTP call. Without these, a dead TLS socket
# (e.g. after a network blip) will block the worker forever in ssl3_read_bytes.
# (connect_timeout_seconds, read_timeout_seconds)
REST_TIMEOUT = (10, 30)        # Supabase REST API: small JSON payloads
DOWNLOAD_TIMEOUT = (10, 60)    # Photo download from Storage: ~1-3MB JPEGs

# /scan/:scanId/browse page fetches foot_scan_fits.browse_extended and renders
# top_n shoes per tier. Must match scripts/backfill_browse_extended.py.
_BROWSE_TOP_N = 30

# ── V2 pipeline feature flag (W9) ───────────────────────────────────────
# SCANNER_PIPELINE = "v2" (default): a scan carrying the four V2 preference
#   inputs (discipline / environment / aggressiveness) is scored by the V2
#   deterministic pipeline; scans without them fall through to V1.
# SCANNER_PIPELINE = "v1": global kill-switch - every scan uses V1.
# Rollback is just flipping this env var in the launchd plist + restart;
# no code revert needed. The V1 path stays fully intact.
SCANNER_PIPELINE = os.environ.get("SCANNER_PIPELINE", "v2").strip().lower()


def _scan_wants_v2(scan_data):
    """True when this scan should be scored by the V2 pipeline."""
    if SCANNER_PIPELINE == "v1":
        return False
    return bool(scan_data.get("discipline")
                and scan_data.get("environment")
                and scan_data.get("aggressiveness"))


def log(msg):
    """Print with timestamp."""
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def validate_scan_quality(sole_m, side_m):
    """Validate that scan measurements look like a real foot, not a hand or noise.

    Returns:
        (is_valid, error_message)
        - is_valid: True if measurements pass quality checks
        - error_message: string describing the issue if invalid, None if valid
    """
    if not sole_m or not side_m:
        return False, "Missing sole or side measurements"

    # Check toe detection - warn but don't block (merged toes are still usable)
    toe_tips = sole_m.get("toe_tips", [])
    if not toe_tips or len(toe_tips) < 2:
        # Set toe_shape to unknown but continue - this is not a fatal error
        sole_m["toe_shape"] = "unknown"
        sole_m["toe_tips"] = []
        print(f"  WARNING: Could not detect individual toes (found {len(toe_tips)}). Setting toe_shape=unknown.")

    # Foot length sanity check
    foot_length = sole_m.get("foot_length_px", 0)
    if foot_length < 100:
        return False, "Detected foot is too small. Please position your foot closer to the camera."

    # Forefoot width sanity check (should be roughly 35-45% of foot length)
    forefoot_ratio = sole_m.get("forefoot_width_ratio", 0)
    if forefoot_ratio < 0.20 or forefoot_ratio > 0.55:
        return False, f"Forefoot width measurement looks unusual ({forefoot_ratio:.2f}). This might not be a foot. Try again."

    # Heel width sanity check (should be roughly 20-30% of foot length)
    heel_ratio = sole_m.get("heel_width_ratio", 0)
    if heel_ratio < 0.15 or heel_ratio > 0.45:
        return False, f"Heel width measurement looks unusual ({heel_ratio:.2f}). This might not be a foot. Try again."

    # Arch length sanity check (should be roughly 60-80% of foot length)
    arch_ratio = sole_m.get("arch_length_ratio", 0)
    if arch_ratio < 0.50 or arch_ratio > 0.85:
        return False, f"Arch length measurement looks unusual ({arch_ratio:.2f}). Try again with a clearer sole view."

    # Check side view measurements are present and plausible
    instep = side_m.get("instep_height_ratio")
    heel_depth = side_m.get("heel_depth_ratio")

    if not instep:
        return False, "Could not measure instep height from side view. Please ensure the side view clearly shows your foot profile."

    if instep < 0.15 or instep > 0.50:
        return False, f"Side view instep measurement looks unusual ({instep:.2f}). Please retake the side photo with your full foot visible."

    if heel_depth is not None and heel_depth > 0.20:
        return False, f"Side view heel measurement looks unusual ({heel_depth:.2f}). Please retake the side photo - make sure the camera is level with your foot."

    return True, None


# ── Supabase helpers ────────────────────────────────────────────────────

def fetch_pending_scans():
    """Find scans that need processing (pipeline_stage = 'pending')."""
    resp = requests.get(
        f"{SB_URL}/rest/v1/foot_scan_fits",
        headers={
            "apikey": SB_KEY,
            "Authorization": f"Bearer {SB_KEY}",
        },
        params={
            "pipeline_stage": "eq.pending",
            "select": "scan_id,sex,street_size_eu,shoes,next_shoe_preference,next_shoe_notes,email",
            "order": "created_at.asc",
            "limit": "1",
        },
        timeout=REST_TIMEOUT,
    )
    if resp.status_code != 200:
        log(f"Error fetching pending scans: HTTP {resp.status_code}")
        return []
    return resp.json()


def fetch_waiting_scans():
    """Find scans waiting for preferences that actually have preferences filled.

    Only returns scans where sex is not null (the required preference field),
    so abandoned scans without preferences don't clog the queue.
    """
    resp = requests.get(
        f"{SB_URL}/rest/v1/foot_scan_fits",
        headers={
            "apikey": SB_KEY,
            "Authorization": f"Bearer {SB_KEY}",
        },
        params={
            "pipeline_stage": "eq.waiting_preferences",
            "sex": "not.is.null",
            "select": "scan_id,sex,street_size_eu,shoes,next_shoe_preference,next_shoe_notes",
            "order": "created_at.asc",
            "limit": "10",
        },
        timeout=REST_TIMEOUT,
    )
    if resp.status_code != 200:
        return []
    return resp.json()


def fetch_rescore_scans():
    """Find scans in 'rescore' stage - triggered when user changes
    preferences on the results page. Skip SAM3, regenerate recs only.
    """
    resp = requests.get(
        f"{SB_URL}/rest/v1/foot_scan_fits",
        headers={
            "apikey": SB_KEY,
            "Authorization": f"Bearer {SB_KEY}",
        },
        params={
            "pipeline_stage": "eq.rescore",
            "select": "scan_id,sex,street_size_eu,shoes,next_shoe_preference,next_shoe_notes",
            "order": "created_at.asc",
            "limit": "10",
        },
        timeout=REST_TIMEOUT,
    )
    if resp.status_code != 200:
        return []
    return resp.json()


def fetch_stuck_scans():
    """Find scans stuck in 'finding_shoes' or 'segmenting' for over 2 minutes.

    Normal pipeline takes ~60-75s. If a scan has been in a transient state
    for over 2 minutes, the worker likely crashed mid-processing.
    Also catches scans with null pipeline_started_at (crashed before timestamp was set).
    """
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()

    results = []
    # Scans stuck with a stale timestamp
    resp = requests.get(
        f"{SB_URL}/rest/v1/foot_scan_fits",
        headers={
            "apikey": SB_KEY,
            "Authorization": f"Bearer {SB_KEY}",
        },
        params={
            "pipeline_stage": "in.(finding_shoes,segmenting)",
            "pipeline_started_at": f"lt.{cutoff}",
            "select": "scan_id,pipeline_stage,pipeline_started_at,sex",
            "order": "created_at.asc",
            "limit": "5",
        },
        timeout=REST_TIMEOUT,
    )
    if resp.status_code == 200:
        results.extend(resp.json())

    # Scans stuck with null timestamp (crashed before it was set)
    resp2 = requests.get(
        f"{SB_URL}/rest/v1/foot_scan_fits",
        headers={
            "apikey": SB_KEY,
            "Authorization": f"Bearer {SB_KEY}",
        },
        params={
            "pipeline_stage": "in.(finding_shoes,segmenting)",
            "pipeline_started_at": "is.null",
            "select": "scan_id,pipeline_stage,pipeline_started_at,sex",
            "order": "created_at.asc",
            "limit": "5",
        },
        timeout=REST_TIMEOUT,
    )
    if resp2.status_code == 200:
        results.extend(resp2.json())

    return results


def update_stage(scan_id, stage, error=None):
    """Update pipeline_stage (and optionally pipeline_error) in Supabase.

    When stage transitions to a terminal failure ('error', 'validation_failed'),
    also fire an instant Telegram alert. The watchdog catches whatever this
    misses, but this gives sub-second notification for the common case.
    """
    data = {"pipeline_stage": stage}
    if error:
        data["pipeline_error"] = str(error)[:500]
    scan_recommender.update_scan(scan_id, data)
    if stage in ("error", "validation_failed"):
        try:
            err_str = str(error)[:300] if error else "—"
            scan_alert.send_alert(
                f"❌ <b>Scan failed</b>\n"
                f"<code>{scan_id}</code>\n"
                f"Stage: <b>{stage}</b>\n"
                f"Error: {err_str}"
            )
        except Exception as e:
            log(f"  (alert send failed: {e})")


# Throttled alert state for poll-loop exceptions (avoid spamming Roman
# if Supabase is unreachable - one alert per hour is enough).
_last_poll_alert_at = 0.0
_POLL_ALERT_INTERVAL = 3600  # seconds


def alert_poll_error(exc: Exception) -> None:
    """Alert on a poll-loop exception, throttled to once per hour."""
    global _last_poll_alert_at
    now = time.time()
    if now - _last_poll_alert_at < _POLL_ALERT_INTERVAL:
        return
    _last_poll_alert_at = now
    try:
        scan_alert.send_alert(
            f"⚠️ <b>Scan worker poll error</b>\n"
            f"<code>{type(exc).__name__}: {str(exc)[:300]}</code>\n"
            f"(Suppressed for 1h to avoid spam.)"
        )
    except Exception:
        pass


def has_preferences(scan_data):
    """Check if user has submitted preferences (sex is the required field)."""
    return scan_data.get("sex") is not None


# ── Photo processing ────────────────────────────────────────────────────

def download_photo(scan_id, view):
    """Download a photo from Supabase storage. Returns numpy array or None."""
    url = f"{SB_URL}/storage/v1/object/public/foot-scans/scans/{scan_id}-{view}.jpg"
    resp = requests.get(url, timeout=DOWNLOAD_TIMEOUT)
    if resp.status_code != 200:
        return None
    arr = np.frombuffer(resp.content, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


def process_photos(scan_id):
    """Run SAM3 segmentation, measurement, and overlay generation.

    Returns (profile_dict, sole_overlay_path, side_overlay_path) or raises.
    """
    out_dir = os.path.join(RESULTS_DIR, scan_id)
    os.makedirs(out_dir, exist_ok=True)

    log(f"  Downloading photos for {scan_id}...")
    sole_img = download_photo(scan_id, "sole")
    if sole_img is None:
        raise Exception("Failed to download sole photo")

    side_img = download_photo(scan_id, "side")

    # Sole segmentation + measurement
    log(f"  Segmenting sole...")
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

    # Side segmentation + measurement (optional)
    side_m = None
    side_overlay_path = None
    if side_img is not None:
        log(f"  Segmenting side...")
        s_mask = foot_measure.segment(side_img, prompt="foot")
        s_mask, s_img, s_rot = foot_measure.normalize_side_orientation(s_mask, side_img)
        side_m = foot_measure.measure_side(s_mask)
        if side_m:
            side_m["rotation_angle"] = s_rot["rotation_angle"]
            side_overlay_path = os.path.join(out_dir, f"{scan_id}-side_overlay.png")
            foot_measure.draw_side_overlay(s_img, s_mask, side_m, side_overlay_path)

    # Build profile
    profile = {
        "toe_shape": sole_m.get("toe_shape"),
        "toe_delta_ratio": sole_m.get("toe_delta_ratio", 0.0),
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

    return profile, sole_m, side_m, sole_overlay_path, side_overlay_path


def write_measurements_to_db(scan_id, profile, sole_m, side_m):
    """Write measurement results to Supabase."""
    # Compute toe_confidence from toe_delta_ratio for DB storage.
    # toe_delta_ratio: negative = egyptian, positive = greek, ~0 = roman.
    # Confidence = how clearly the shape is one type vs borderline.
    # |ratio| >= 0.04 -> high (0.9), 0.02-0.04 -> moderate (0.65), < 0.02 -> low (0.4)
    tdr = abs(sole_m.get("toe_delta_ratio", 0.0))
    if tdr >= 0.04:
        toe_conf_num = 0.9
    elif tdr >= 0.02:
        toe_conf_num = 0.65
    else:
        toe_conf_num = 0.4

    update_data = {
        "toe_shape": profile.get("toe_shape"),
        "toe_confidence": toe_conf_num,
        "toe_delta_ratio": sole_m.get("toe_delta_ratio", 0.0),
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
    notes_parts = [
        f"Toe: {profile.get('toe_shape')} (delta {sole_m.get('toe_delta_ratio', 0.0):.4f})",
        f"Width: {profile.get('forefoot_width_ratio')} ({profile.get('forefoot_width_class')})",
        f"Heel: {profile.get('heel_width_ratio')} ({profile.get('heel_width_class')})",
        f"Arch: {profile.get('arch_length_ratio')} ({profile.get('arch_length_class')})",
    ]
    if side_m:
        notes_parts.append(f"Instep: {profile.get('instep_height_ratio')} ({profile.get('instep_height_class')})")
        notes_parts.append(f"Heel depth: {profile.get('heel_depth_ratio')} ({profile.get('heel_depth_class')})")
    update_data["notes"] = ". ".join(notes_parts) + "."

    scan_recommender.update_scan(scan_id, update_data)


# ── Deterministic engine imports (lazy-loaded) ──────────────────────────
_engine_data = None  # cached shoe DB + sizing data

def _load_engine_data():
    """Load and cache matrix_scorer data. Called once on first recommendation."""
    global _engine_data
    if _engine_data is not None:
        return _engine_data
    from benchmark.matrix_scorer import (
        load_shoes, load_brand_sizing, load_size_availability, load_best_prices,
    )
    log("  Loading shoe database for deterministic engine...")
    shoes_db = load_shoes()
    brand_sizing = load_brand_sizing()
    size_avail = load_size_availability()
    best_prices = load_best_prices()
    log(f"  Loaded {len(shoes_db)} shoes, {len(brand_sizing)} brands, "
        f"{len(size_avail)} size entries, {len(best_prices)} prices")
    _engine_data = {
        "shoes_db": shoes_db,
        "brand_sizing": brand_sizing,
        "size_avail": size_avail,
        "best_prices": best_prices,
        "shoe_by_slug": {s["slug"]: s for s in shoes_db},
    }
    return _engine_data


def _enrich_user_shoes(user_shoes, shoes_db):
    """Enrich raw user shoe entries with DB properties (db_stiffness, db_width, etc.).

    The interpretation engines expect user shoes to have db_* prefixed fields
    from the shoes table (same format as generate_review_data.py produces).
    """
    from benchmark.matrix_scorer import _lookup_user_shoes
    enriched = []
    for us, db in _lookup_user_shoes({"shoes": user_shoes}, shoes_db):
        info = dict(us)  # preserve original fields (brand, model, size_eu, fit)
        if db:
            info["db_width"] = db.get("width")
            info["db_heel_volume"] = db.get("heel_volume")
            info["db_toe_form"] = db.get("toe_form")
            info["db_closure"] = db.get("closure")
            info["db_downturn"] = db.get("downturn")
            info["db_stiffness"] = db.get("computed_stiffness")
            info["db_asymmetry"] = db.get("asymmetry")
            info["db_forefoot_volume"] = db.get("forefoot_volume")
            info["db_feel"] = db.get("feel")
            info["db_skill_level"] = db.get("skill_level")
            info["db_no_edge"] = db.get("no_edge")
            info["db_gender"] = db.get("gender")
            info["slug"] = db.get("slug")
        enriched.append(info)
    return enriched


def _build_browse_extended(tier_result, profile, shoes_db, brand_sizing,
                           best_prices, shoe_by_slug):
    """Build the browse_extended JSONB payload for /scan/:id/browse.

    Produces the same shape as scripts/backfill_browse_extended.py:
    top-30 picks per tier (baseline/softer/stiffer/budget) with full DB
    metadata, plus filters, top_picks (the 3 production picks per tier),
    and brand_sizing. Any failure here is caught at the call site and
    logged -- it must never block the recommendations write.

    Reuses the 'scored' list that run_case_full already computed, so
    this costs no extra scoring work.
    """
    from benchmark.matrix_scorer import (
        _tier_stiffness_filter, _has_hard_violation, _model_key,
        calc_recommended_size,
    )

    scored = tier_result.get("scored") or []
    baseline_3 = tier_result.get("baseline") or []
    softer_3 = tier_result.get("softer") or []
    stiffer_3 = tier_result.get("stiffer") or []
    budget_3 = tier_result.get("budget") or []

    softer_band = _tier_stiffness_filter("softer", baseline_3)
    stiffer_band = _tier_stiffness_filter("stiffer", baseline_3)

    # Budget ceiling matches select_budget's rule: 80% of baseline median price.
    baseline_prices = [best_prices.get(p["slug"]) for p in baseline_3
                       if best_prices.get(p["slug"]) is not None]
    if baseline_prices:
        sorted_bp = sorted(baseline_prices)
        mid = len(sorted_bp) // 2
        if len(sorted_bp) % 2:
            baseline_median = sorted_bp[mid]
        else:
            baseline_median = (sorted_bp[mid - 1] + sorted_bp[mid]) / 2
        budget_ceiling = baseline_median * 0.80
    else:
        budget_ceiling = None

    def _top_n_baseline(n):
        seen_models = set()
        out = []
        for s in scored:
            if _has_hard_violation(s):
                continue
            mk = _model_key(s)
            if mk in seen_models:
                continue
            seen_models.add(mk)
            out.append(s)
            if len(out) >= n:
                break
        return out

    def _top_n_band(n, band):
        if not band:
            return []
        lo, hi = band
        seen_models = set()
        out = []
        for s in scored:
            if _has_hard_violation(s):
                continue
            st = s.get("stiffness") or 0.5
            if st < lo or st >= hi:
                continue
            mk = _model_key(s)
            if mk in seen_models:
                continue
            seen_models.add(mk)
            out.append(s)
            if len(out) >= n:
                break
        return out

    def _top_n_budget(n, ceiling):
        def _price_bonus(price):
            if price is None:
                return -999
            if price < 60:
                return 25
            if price < 80:
                return 20
            if price < 100:
                return 15
            if price < 120:
                return 10
            if price < 140:
                return 5
            return 0

        def _model_root(model):
            m = (model or "").strip().lower()
            return m.split()[0] if m else ""

        user_shoe_families = set()
        for us in profile.get("shoes") or []:
            b = (us.get("brand") or "").strip().lower()
            r = _model_root(us.get("model") or "")
            if b and r:
                user_shoe_families.add((b, r))

        scored_budget = []
        for s in scored:
            if _has_hard_violation(s):
                continue
            price = best_prices.get(s["slug"])
            if price is None:
                continue
            if ceiling is not None and price > ceiling:
                continue
            cand_brand = (s.get("brand") or "").strip().lower()
            cand_root = _model_root(s.get("model") or "")
            if (cand_brand and cand_root
                    and (cand_brand, cand_root) in user_shoe_families):
                continue
            bonus = _price_bonus(price)
            scored_budget.append({
                **s,
                "budget_score": s["score"] + bonus,
                "best_price": price,
            })
        scored_budget.sort(key=lambda x: -x["budget_score"])

        seen_models = set()
        out = []
        for s in scored_budget:
            mk = _model_key(s)
            if mk in seen_models:
                continue
            seen_models.add(mk)
            out.append(s)
            if len(out) >= n:
                break
        return out

    baseline_topn = _top_n_baseline(_BROWSE_TOP_N)
    softer_topn = _top_n_band(_BROWSE_TOP_N, softer_band)
    stiffer_topn = _top_n_band(_BROWSE_TOP_N, stiffer_band)
    budget_topn = _top_n_budget(_BROWSE_TOP_N, budget_ceiling)

    # Prepend the 3 production picks so they are guaranteed to lead each
    # list, even if run_case_full's diversity / brand-cap swaps moved them
    # outside the nominal stiffness band.
    scored_by_slug = {s["slug"]: s for s in scored}

    def _prepend_stored(top_n_list, stored_picks):
        seen = set()
        out = []
        for pick in stored_picks:
            slug = pick.get("slug")
            if slug and slug in scored_by_slug and slug not in seen:
                out.append(scored_by_slug[slug])
                seen.add(slug)
        for p in top_n_list:
            if p["slug"] not in seen:
                out.append(p)
                seen.add(p["slug"])
            if len(out) >= _BROWSE_TOP_N:
                break
        return out[:_BROWSE_TOP_N]

    baseline_topn = _prepend_stored(baseline_topn, baseline_3)
    softer_topn = _prepend_stored(softer_topn, softer_3)
    stiffer_topn = _prepend_stored(stiffer_topn, stiffer_3)
    budget_topn = _prepend_stored(budget_topn, budget_3)

    # Anchor for brand-by-brand recommended-size calc
    user_shoes = profile.get("shoes") or []
    anchor = user_shoes[0] if user_shoes else {}
    anchor_size = anchor.get("size_eu")
    anchor_brand = anchor.get("brand")
    street_size = profile.get("street_size_eu")

    def _enrich(pick):
        db = shoe_by_slug.get(pick["slug"], {})
        rec_size = None
        if anchor_size and anchor_brand:
            rec_size = calc_recommended_size(
                anchor_size, anchor_brand, pick["brand"], brand_sizing,
                street_size=street_size,
            )
        if rec_size is not None:
            rec_size = round(rec_size * 2) / 2
        return {
            "slug": pick["slug"],
            "brand": pick["brand"],
            "model": pick["model"],
            "score": round(pick.get("score", 0), 1),
            "recommended_size_eu": rec_size,
            "price_eur": best_prices.get(pick["slug"]),
            "width": db.get("width") or pick.get("width"),
            "heel_volume": db.get("heel_volume") or pick.get("heel_volume"),
            "toe_form": db.get("toe_form") or pick.get("toe_form"),
            "forefoot_volume": db.get("forefoot_volume"),
            "closure": db.get("closure") or pick.get("closure"),
            "downturn": db.get("downturn") or pick.get("downturn"),
            "asymmetry": db.get("asymmetry") or pick.get("asymmetry"),
            "feel": db.get("feel") or pick.get("feel"),
            "stiffness": pick.get("stiffness"),
            "no_edge": pick.get("no_edge"),
            "rubber_thickness_mm": db.get("rubber_thickness_mm"),
            "midsole": db.get("midsole"),
            "upper_material": db.get("upper_material"),
            "gender": db.get("gender"),
            "description": db.get("description"),
        }

    def _en(picks):
        return [_enrich(p) for p in picks]

    return {
        "filters": {
            "softer_stiffness_band": list(softer_band) if softer_band else None,
            "stiffer_stiffness_band": list(stiffer_band) if stiffer_band else None,
            "budget_ceiling_eur": round(budget_ceiling, 2) if budget_ceiling else None,
        },
        "tiers": {
            "baseline": _en(baseline_topn),
            "softer": _en(softer_topn),
            "stiffer": _en(stiffer_topn),
            "budget": _en(budget_topn),
        },
        "top_picks": {
            "baseline": [p["slug"] for p in baseline_3],
            "softer": [p["slug"] for p in softer_3],
            "stiffer": [p["slug"] for p in stiffer_3],
            "budget": [p["slug"] for p in budget_3],
        },
        "brand_sizing": brand_sizing,
    }


# ── V2 deterministic pipeline ────────────────────────────────────────────
_v2_engine_data = None  # cached shoes_db + price_rows + brand_sizing


def _load_v2_engine_data():
    """Load and cache the V2 engine inputs (shoes table, price rows,
    brand sizing). Mirrors _load_engine_data for the V2 path."""
    global _v2_engine_data
    if _v2_engine_data is not None:
        return _v2_engine_data
    from check_full_v2_matrix import load_shoes_db, load_price_rows
    log("  Loading V2 engine data (shoes / prices / brand sizing)...")
    shoes_db = load_shoes_db()
    price_rows = load_price_rows()
    brand_sizing = scan_recommender._load_brand_sizing()
    log(f"  V2 engine data: {len(shoes_db)} shoes, {len(price_rows)} price rows, "
        f"{len(brand_sizing)} brands")
    _v2_engine_data = {"shoes_db": shoes_db, "price_rows": price_rows,
                       "brand_sizing": brand_sizing}
    return _v2_engine_data


def _generate_recommendations_v2(scan_id, profile, scan_data):
    """V2 path: deterministic V2 engines via explore_v2/v2_pipeline.

    Writes interpretation + recommendations in the same JSON shape the V1
    path uses (ScanResult.jsx consumes both identically) and tags the row
    pipeline_version='v2'. browse_extended is intentionally left untouched
    on the V2 path - the /scan/:id/browse page is not yet ported to the
    V2 scorer (tracked follow-up, not a go-live blocker).
    """
    from v2_pipeline import build_v2_results

    ed = _load_v2_engine_data()
    # Fresh measurements from this run's segmentation take precedence over
    # whatever is stored on the row.
    merged = {**scan_data, **(profile or {})}

    discipline     = scan_data.get("discipline")
    environment    = scan_data.get("environment")
    rock           = scan_data.get("rock_type")
    aggressiveness = scan_data.get("aggressiveness")
    log(f"  V2 pipeline: {discipline} / {environment} / {rock or '-'} / {aggressiveness}")

    res = build_v2_results(merged, ed["shoes_db"], ed["price_rows"],
                           ed["brand_sizing"], discipline, environment,
                           rock, aggressiveness)
    interpretation = res["interpretation"]
    recommendations = res["recommendations"]
    log(f"  Generated {len(recommendations)} V2 recommendations across 4 tiers")

    result_data = {
        "pipeline_stage": "complete",
        "pipeline_version": "v2",
    }
    if interpretation:
        result_data["interpretation"] = interpretation
    if recommendations:
        result_data["recommendations"] = recommendations
    browse_extended = res.get("browse_extended")
    if browse_extended:
        result_data["browse_extended"] = browse_extended
    scan_recommender.update_scan(scan_id, result_data)
    return len(recommendations)


def generate_recommendations(scan_id, profile):
    """Score shoes deterministically, generate interpretation, write to DB.

    Feature-flag dispatch (W9): a scan carrying the four V2 inputs is
    scored by the V2 pipeline unless SCANNER_PIPELINE forces V1. The V1
    path below is unchanged and stays the rollback target.

    V1 path:
    - matrix_scorer for shoe selection + scoring (4 tiers: baseline/softer/stiffer/budget)
    - interp_foot_shape for Section 1
    - interp_shoe_fit for Section 2
    - interp_what_to_look_for for Section 3
    - interp_shoe_desc for per-shoe description paragraphs (P1/P2/P3)
    """
    # Dispatch: re-fetch the row so we see the latest V2 inputs / prefs.
    _row = scan_recommender.fetch_scan_data(scan_id)
    if _row and _scan_wants_v2(_row):
        return _generate_recommendations_v2(scan_id, profile, _row)

    # ===== V1 pipeline (unchanged) =====
    from benchmark.matrix_scorer import (
        run_case_full, calc_recommended_size, check_size_available,
    )
    from benchmark.interp_foot_shape import generate_foot_shape
    from benchmark.interp_shoe_fit import generate_shoe_fit
    from benchmark.interp_what_to_look_for import generate_what_to_look_for
    from benchmark.interp_shoe_desc import generate_shoe_description

    # Load cached shoe data
    ed = _load_engine_data()
    shoes_db = ed["shoes_db"]
    brand_sizing = ed["brand_sizing"]
    size_avail = ed["size_avail"]
    best_prices = ed["best_prices"]
    shoe_by_slug = ed["shoe_by_slug"]

    # Fetch full scan data (measurements + preferences)
    scan_data = scan_recommender.fetch_scan_data(scan_id)
    if not scan_data:
        raise Exception(f"No scan data found for {scan_id}")

    # Merge fresh measurements with DB data
    merged = {**scan_data, **profile}
    merged["next_shoe_preference"] = scan_data.get("next_shoe_preference", "allround")
    merged["sex"] = scan_data.get("sex", "")
    merged["next_shoe_notes"] = scan_data.get("next_shoe_notes", "")

    # Raw user shoes from DB
    raw_shoes = scan_data.get("shoes") or []
    merged["shoes"] = raw_shoes

    # Enrich user shoes with DB properties for interpretation engines
    enriched_shoes = _enrich_user_shoes(raw_shoes, shoes_db)

    # Build profile for interpretation engines (needs enriched shoes)
    interp_profile = dict(merged)
    interp_profile["shoes"] = enriched_shoes

    # ── Section 1-3: Interpretation ──────────────────────────────────
    log(f"  Generating interpretation sections...")
    interpretation = []

    s1 = generate_foot_shape(interp_profile)
    if s1:
        interpretation.append({"title": "Your Foot Shape", "paragraphs": s1})

    s2 = generate_shoe_fit(interp_profile)
    if s2:
        interpretation.append({"title": "What Your Current Shoe Fit Tells Us", "paragraphs": s2})

    s3 = generate_what_to_look_for(interp_profile, enriched_shoes)
    if s3:
        interpretation.append({"title": "What to Look For", "paragraphs": s3})

    # ── Shoe scoring + selection (4 tiers) ───────────────────────────
    log(f"  Running matrix scorer...")
    case = {"profile": merged}
    tier_result = run_case_full(case, shoes_db, brand_sizing, size_avail,
                                best_prices=best_prices)

    # ── Build recommendations in frontend format ─────────────────────
    recommendations = []
    for tier_name in ("baseline", "softer", "stiffer", "budget"):
        tier_picks = tier_result.get(tier_name, [])

        # Enrich picks with DB properties for shoe descriptions
        enriched_picks = []
        for p in tier_picks:
            db = shoe_by_slug.get(p["slug"], {})
            pick = dict(p)
            pick["tier"] = tier_name
            pick["asymmetry"] = db.get("asymmetry") or p.get("asymmetry")
            pick["forefoot_volume"] = db.get("forefoot_volume")
            pick["feel"] = db.get("feel") or p.get("feel")
            pick["skill_level"] = db.get("skill_level")
            pick["gender"] = db.get("gender")
            pick["special_fit_notes"] = db.get("special_fit_notes")
            pick["description"] = db.get("description")
            pick["rubber_type"] = db.get("rubber_type")
            pick["rubber_hardness"] = db.get("rubber_hardness")
            pick["rubber_thickness_mm"] = db.get("rubber_thickness_mm")
            pick["midsole"] = db.get("midsole")
            pick["midsole_stiffness"] = db.get("midsole_stiffness")
            pick["upper_material"] = db.get("upper_material")
            enriched_picks.append(pick)

        # Generate shoe descriptions (P1/P2/P3) within this tier
        for pick in enriched_picks:
            pick["shoe_desc"] = generate_shoe_description(
                pick, interp_profile, all_picks=enriched_picks)

        # Convert to frontend recommendation format
        for pick in enriched_picks:
            desc = pick.get("shoe_desc", ["", "", ""])
            rec_size = pick.get("rec_size")

            rec = {
                "slug": pick["slug"],
                "brand": pick["brand"],
                "model": pick["model"],
                "category": tier_name,
                "recommended_size_eu": round(rec_size * 2) / 2 if rec_size else None,
                "description": desc[0] if len(desc) > 0 else "",  # P1 = shoe description
                "why": desc[1] if len(desc) > 1 else "",           # P2 = why selected
                "tradeoffs": desc[2] if len(desc) > 2 else "",     # P3 = tradeoffs
            }
            # Include price for budget tier
            if tier_name == "budget" and pick.get("best_price") is not None:
                rec["best_offer"] = {"price_eur": round(pick["best_price"], 2)}
            recommendations.append(rec)

    log(f"  Generated {len(recommendations)} recommendations across 4 tiers")

    # Write results to DB
    result_data = {"pipeline_stage": "complete", "pipeline_version": "v1"}
    if interpretation:
        result_data["interpretation"] = interpretation
    if recommendations:
        result_data["recommendations"] = recommendations

    # Build browse_extended (powers /scan/:id/browse).
    # NON-FATAL: any failure here is logged but must not block the
    # recommendations write -- the browse page is a nice-to-have.
    try:
        browse_extended = _build_browse_extended(
            tier_result, merged, shoes_db, brand_sizing,
            best_prices, shoe_by_slug,
        )
        if browse_extended:
            result_data["browse_extended"] = browse_extended
            tiers_counts = {t: len(browse_extended["tiers"].get(t, []))
                            for t in ("baseline", "softer", "stiffer", "budget")}
            log(f"  Built browse_extended: {tiers_counts}")
    except Exception as e:
        log(f"  WARNING: browse_extended generation failed (non-fatal): {e}")
        traceback.print_exc()

    scan_recommender.update_scan(scan_id, result_data)
    return len(recommendations)


# ── Main loop ───────────────────────────────────────────────────────────

def process_pending_scan(scan):
    """Handle a single pending scan (photos not yet processed)."""
    scan_id = scan["scan_id"]
    log(f"Processing new scan: {scan_id}")

    try:
        # Step 1: Segmentation
        update_stage(scan_id, "segmenting")
        t0 = time.time()
        profile, sole_m, side_m, sole_overlay_path, side_overlay_path = process_photos(scan_id)
        seg_time = time.time() - t0
        log(f"  Segmentation done in {seg_time:.1f}s")

        # Step 1.5: Validate scan quality
        is_valid, error_msg = validate_scan_quality(sole_m, side_m)
        if not is_valid:
            log(f"  VALIDATION FAILED: {error_msg}")
            update_stage(scan_id, "validation_failed", error_msg)
            return

        # Step 2: Upload overlays
        try:
            log(f"  Uploading sole overlay: {sole_overlay_path}")
            scan_recommender.upload_overlay(scan_id, "sole_overlay.png", sole_overlay_path)
            log(f"  Sole overlay uploaded")
            if side_overlay_path:
                log(f"  Uploading side overlay: {side_overlay_path}")
                scan_recommender.upload_overlay(scan_id, "side_overlay.png", side_overlay_path)
                log(f"  Side overlay uploaded")
        except Exception as e:
            log(f"  ERROR uploading overlays: {e}")
            traceback.print_exc()

        # Step 3: Write measurements to DB
        write_measurements_to_db(scan_id, profile, sole_m, side_m)

        # Step 4: Check if preferences exist
        if has_preferences(scan):
            # Preferences already filled - generate recommendations
            update_stage(scan_id, "finding_shoes")
            t1 = time.time()
            n_recs = generate_recommendations(scan_id, profile)
            rec_time = time.time() - t1
            total = time.time() - t0
            log(f"  Recommendations done in {rec_time:.1f}s ({n_recs} recs). Total: {total:.1f}s")
        else:
            # User still filling form - wait for preferences
            update_stage(scan_id, "waiting_preferences")
            log(f"  Waiting for user preferences...")

    except Exception as e:
        log(f"  ERROR: {e}")
        traceback.print_exc()
        try:
            update_stage(scan_id, "error", str(e))
        except Exception:
            pass


def _regenerate_from_stored(scan_id, log_prefix):
    """Run rec generation using stored measurements (no SAM3).

    Shared by check_waiting_scans (preferences just filled) and
    check_rescore_scans (preferences changed on results page).
    """
    log(f"{log_prefix} for {scan_id} - generating recommendations")
    try:
        update_stage(scan_id, "finding_shoes")
        scan_data = scan_recommender.fetch_scan_data(scan_id)
        if not scan_data:
            raise Exception("No scan data found")

        profile = {
            "toe_shape": scan_data.get("toe_shape"),
            "toe_delta_ratio": scan_data.get("toe_delta_ratio", 0.0),
            "forefoot_width_ratio": scan_data.get("forefoot_width_ratio"),
            "heel_width_ratio": scan_data.get("heel_width_ratio"),
            "arch_length_ratio": scan_data.get("arch_length_ratio"),
            "forefoot_width_class": scan_data.get("forefoot_width_class"),
            "heel_width_class": scan_data.get("heel_width_class"),
            "arch_length_class": scan_data.get("arch_length_class"),
            "hallux_valgus_class": scan_data.get("hallux_valgus_class", "normal"),
            "hva_offset_ratio": scan_data.get("hva_offset_ratio"),
            "instep_height_ratio": scan_data.get("instep_height_ratio"),
            "heel_depth_ratio": scan_data.get("heel_depth_ratio"),
            "instep_height_class": scan_data.get("instep_height_class"),
            "heel_depth_class": scan_data.get("heel_depth_class"),
        }

        t0 = time.time()
        n_recs = generate_recommendations(scan_id, profile)
        elapsed = time.time() - t0
        log(f"  Recommendations done in {elapsed:.1f}s ({n_recs} recs)")

    except Exception as e:
        log(f"  ERROR: {e}")
        traceback.print_exc()
        try:
            update_stage(scan_id, "error", str(e))
        except Exception:
            pass


def check_waiting_scans():
    """Re-check scans that were waiting for preferences."""
    for scan in fetch_waiting_scans():
        if has_preferences(scan):
            _regenerate_from_stored(scan["scan_id"], "Preferences ready")


def check_rescore_scans():
    """Re-check scans whose preferences were edited on the results page.

    Triggered by frontend PATCHing pipeline_stage='rescore'. We skip SAM3
    and regenerate recommendations + interpretation from stored measurements.
    """
    for scan in fetch_rescore_scans():
        _regenerate_from_stored(scan["scan_id"], "Rescore requested")


def recover_stuck_scans():
    """Reset scans stuck in transient stages back to a retryable state.

    If the worker crashes mid-processing, scans can get stuck in
    'finding_shoes' or 'segmenting' indefinitely. This finds any such
    scans older than 5 minutes and resets them so they get retried.
    """
    stuck = fetch_stuck_scans()
    for scan in stuck:
        scan_id = scan["scan_id"]
        old_stage = scan["pipeline_stage"]
        has_prefs = scan.get("sex") is not None

        if old_stage == "finding_shoes":
            # Measurements exist, just need to redo recommendations.
            # Reset to waiting_preferences (check_waiting_scans will pick it up
            # on the next poll if preferences are present).
            new_stage = "waiting_preferences"
        else:
            # segmenting - need full reprocessing
            new_stage = "pending"

        log(f"Recovering stuck scan {scan_id}: {old_stage} -> {new_stage}")
        update_stage(scan_id, new_stage)


def main():
    """Main polling loop."""
    log("Scan worker starting...")
    log(f"Poll interval: {POLL_INTERVAL}s")
    log(f"Results dir: {RESULTS_DIR}")

    # Pre-load SAM3 model
    log("Loading SAM3 model...")
    t0 = time.time()
    foot_measure._load_sam3()
    log(f"SAM3 ready in {time.time() - t0:.1f}s")

    log("Worker ready. Polling for scans...")

    while True:
        try:
            # Check for new pending scans
            pending = fetch_pending_scans()
            if pending:
                process_pending_scan(pending[0])

            # Check scans waiting for preferences
            check_waiting_scans()

            # Check scans needing a rescore (preferences edited on results page)
            check_rescore_scans()

            # Recover scans stuck in transient stages (crash recovery)
            recover_stuck_scans()

        except KeyboardInterrupt:
            log("Shutting down...")
            break
        except Exception as e:
            log(f"Poll loop error: {e}")
            traceback.print_exc()
            alert_poll_error(e)

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
