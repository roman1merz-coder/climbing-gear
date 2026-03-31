#!/usr/bin/env python3
"""
Foot measurement pipeline — sole view + side view.

Usage:
    python3 foot_measure.py <sole_image> [--side <side_image>] [--out results/]

Produces:
    - <slug>_overlay.png   — annotated foot silhouette with measurement lines
    - <slug>_results.json  — all measurements + classifications
    - sole_results.html    — visual results page (website-styled)

Pipeline steps:
    1. SAM 3 text-prompted segmentation ("foot") → binary mask
    2. Largest connected component cleanup
    3. Morphological refinement
    4. Sole view: toe tips, ball row, heel row → ratios
    5. Side view: instep height, heel depth → ratios
    6. Classify each ratio vs population distribution
"""
import sys, os, json, argparse, time, base64
from pathlib import Path

import cv2
import numpy as np
from scipy.ndimage import uniform_filter1d
from scipy.signal import find_peaks

SCRIPT_DIR = Path(__file__).parent
SILHOUETTE_SVG = SCRIPT_DIR.parent / "graphics" / "foot bottom.svg"

# ── SAM 3 model singleton ────────────────────────────────────────────────
# Loaded once on first call, reused across requests (for FastAPI).
_sam3_model = None
_sam3_processor = None
_sam3_device = None


def _load_sam3():
    """Load SAM 3 model + processor once, cache globally."""
    global _sam3_model, _sam3_processor, _sam3_device
    if _sam3_model is not None:
        return _sam3_model, _sam3_processor, _sam3_device

    import torch
    from transformers import Sam3Model, Sam3Processor
    from PIL import Image  # noqa: F401 — ensure available

    print("Loading SAM 3 model...")
    t0 = time.time()
    _sam3_processor = Sam3Processor.from_pretrained("facebook/sam3")
    _sam3_model = Sam3Model.from_pretrained("facebook/sam3")

    if torch.backends.mps.is_available():
        _sam3_device = torch.device("mps")
        print("  Using MPS (Apple Silicon GPU)")
    else:
        _sam3_device = torch.device("cpu")
        print("  Using CPU")

    _sam3_model = _sam3_model.to(_sam3_device)
    _sam3_model.eval()
    print(f"  Model loaded in {time.time() - t0:.1f}s")
    return _sam3_model, _sam3_processor, _sam3_device


# ── Population reference values (from spec / literature) ──────────────────
# Mean ± SD from Jurca et al. 2019, Karger 2024, Goonetilleke, PMC10226764
POP = {
    # Sole view
    "forefoot_width_ratio":  {"mean": 0.383, "std": 0.021},  # ball_width / foot_length
    "arch_length_ratio":     {"mean": 0.700, "std": 0.025},  # arch_length / foot_length
    "heel_width_ratio":      {"mean": 0.251, "std": 0.018},  # heel_width / foot_length
    # Side view
    "instep_height_ratio":   {"mean": 0.290, "std": 0.030},  # instep_height / foot_length
    "heel_depth_ratio":      {"mean": 0.070, "std": 0.025},  # heel_depth / foot_length
}

# Labels per ratio for classify_ratio()
_RATIO_LABELS = {
    "forefoot_width_ratio":  ("narrow",       "normal", "wide"),
    "arch_length_ratio":     ("short arch",   "normal", "long arch"),
    "heel_width_ratio":      ("narrow heel",  "normal", "wide heel"),
    "instep_height_ratio":   ("low instep",   "normal", "high instep"),
    "heel_depth_ratio":      ("shallow heel", "normal", "deep heel"),
}


def classify_ratio(name, value):
    """Classify a ratio as low/normal/high based on ±1 SD from population mean."""
    p = POP[name]
    z = (value - p["mean"]) / p["std"]
    labels = _RATIO_LABELS.get(name, ("low", "normal", "high"))
    if z < -1:
        return labels[0]
    if z > 1:
        return labels[2]
    return labels[1]


# ── Segmentation (SAM 3 text-prompted) ───────────────────────────────────

def segment(img_bgr, prompt="foot"):
    """Segment foot from a BGR image using SAM 3 with text prompt.

    Args:
        img_bgr: OpenCV BGR image (numpy array)
        prompt: text prompt for SAM 3 (default "foot")

    Returns:
        mask: binary uint8 mask (H, W), 0 or 255
    """
    import torch
    from PIL import Image

    model, processor, device = _load_sam3()

    # Convert BGR → RGB PIL
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(rgb)
    h, w = img_bgr.shape[:2]

    t0 = time.time()
    inputs = processor(images=pil_image, text=prompt, return_tensors="pt")
    inputs = {k: v.to(device) if isinstance(v, torch.Tensor) else v
              for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)

    results = processor.post_process_instance_segmentation(
        outputs, target_sizes=[(h, w)]
    )
    dt = time.time() - t0

    result = results[0]
    masks = result["masks"]    # [N, H, W]
    scores = result["scores"]  # [N]

    if masks.shape[0] == 0:
        print(f"  SAM 3: no instances detected ({dt:.2f}s)")
        return np.zeros((h, w), dtype=np.uint8)

    best_idx = scores.argmax().item()
    best_score = scores[best_idx].item()
    mask_tensor = masks[best_idx]

    binary = (mask_tensor.cpu().numpy() > 0).astype(np.uint8) * 255

    # Keep only largest connected component
    n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    if n_labels > 1:
        largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        binary = ((labels == largest) * 255).astype(np.uint8)

    coverage = np.count_nonzero(binary) / (h * w) * 100
    print(f"  SAM 3: score={best_score:.3f}, coverage={coverage:.1f}%, {dt:.2f}s")
    return binary


# ── Sole orientation normalization ────────────────────────────────────────
# Two-pass approach:
#   1. Rough alignment via minAreaRect (long axis → vertical)
#   2. Fine rotation so heel center → 2nd toe tip is exactly vertical
# This ensures toes are at top, heel at bottom, with consistent alignment
# regardless of how the user positions their foot during scanning.


def _rough_align(mask):
    """Pass 1: Use minAreaRect to get the foot approximately upright.

    Returns (rotated_mask, warp_matrix).
    """
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL,
                                    cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return mask, np.eye(2, 3, dtype=np.float64)
    cnt = max(contours, key=cv2.contourArea)
    rect = cv2.minAreaRect(cnt)
    center, (rw, rh), angle = rect

    # Rotate so the LONG axis of the bounding rect becomes vertical
    if rw > rh:
        rot_angle = angle + 90
    else:
        rot_angle = angle

    h, w = mask.shape[:2]
    cos_a = abs(np.cos(np.radians(rot_angle)))
    sin_a = abs(np.sin(np.radians(rot_angle)))
    new_w = int(w * cos_a + h * sin_a) + 20
    new_h = int(h * cos_a + w * sin_a) + 20

    M = cv2.getRotationMatrix2D(center, rot_angle, 1.0)
    M[0, 2] += (new_w - w) / 2
    M[1, 2] += (new_h - h) / 2

    rotated = cv2.warpAffine(mask, M, (new_w, new_h),
                              flags=cv2.INTER_NEAREST, borderValue=0)
    return rotated, M


def _ensure_toes_at_top(mask):
    """Flip 180° if toes are at the bottom (toes have wider horizontal spread)."""
    h = mask.shape[0]
    zone = int(h * 0.20)
    top_cols = np.count_nonzero(np.any(mask[:zone, :] > 0, axis=0))
    bot_cols = np.count_nonzero(np.any(mask[-zone:, :] > 0, axis=0))
    if top_cols < bot_cols:
        return cv2.rotate(mask, cv2.ROTATE_180), True
    return mask, False


def _crop_to_mask(mask, pad=15):
    """Crop to tight bounding box around mask pixels.

    Returns (cropped_mask, (x_offset, y_offset)).
    """
    ys, xs = np.where(mask > 0)
    if len(ys) == 0:
        return mask, (0, 0)
    y1 = max(0, ys.min() - pad)
    y2 = min(mask.shape[0], ys.max() + pad)
    x1 = max(0, xs.min() - pad)
    x2 = min(mask.shape[1], xs.max() + pad)
    return mask[y1:y2, x1:x2], (x1, y1)


def _find_heel_center(mask):
    """Find heel center: midpoint of widest horizontal span in bottom 15%."""
    h, w = mask.shape[:2]
    heel_start = int(h * 0.85)
    max_w = 0
    heel_row = heel_start
    heel_cx = w // 2
    for row in range(heel_start, h):
        px = np.where(mask[row, :] > 0)[0]
        if len(px) > 0:
            span = px[-1] - px[0]
            if span > max_w:
                max_w = span
                heel_row = row
                heel_cx = (px[0] + px[-1]) // 2
    return heel_cx, heel_row


def _find_second_toe_tip(mask):
    """Find 2nd toe tip using skyline peak detection on the toe region.

    Steps:
        1. Build skyline: topmost mask pixel per column in top 40%
        2. Smooth and find peaks (toe tips)
        3. Determine big-toe side (compare leftmost vs rightmost tip height)
        4. Order tips from big-toe side → return the 2nd tip

    The 2nd toe is ALWAYS the positionally second toe from the big-toe side,
    regardless of which toe is tallest. This works correctly for all toe
    shapes (Egyptian, Greek, Roman).

    Returns ((x, y) of 2nd toe, list of all toe tips), or (None, []).
    """
    h, w = mask.shape[:2]
    ys, xs = np.where(mask > 0)
    if len(ys) == 0:
        return None, []

    upper_row = int(ys.min())
    lower_row = int(ys.max())
    foot_h = lower_row - upper_row
    toe_zone_end = upper_row + int(foot_h * 0.40)

    cols_with_pixels = np.where(
        np.any(mask[upper_row:toe_zone_end, :] > 0, axis=0)
    )[0]
    if len(cols_with_pixels) < 10:
        return None, []

    col_min, col_max = cols_with_pixels[0], cols_with_pixels[-1]

    # Build skyline (topmost pixel per column)
    n_cols = col_max - col_min + 1
    skyline = np.full(n_cols, toe_zone_end, dtype=np.float64)
    for i, col in enumerate(range(col_min, col_max + 1)):
        col_px = np.where(mask[upper_row:toe_zone_end, col] > 0)[0]
        if len(col_px) > 0:
            skyline[i] = upper_row + col_px[0]

    # Smooth
    ks = max(5, n_cols // 30)
    if ks % 2 == 0:
        ks += 1
    skyline_smooth = uniform_filter1d(skyline, size=ks)

    # Find peaks (toe tips = local minima in y → maxima in -y)
    inverted = -skyline_smooth
    peaks, _ = find_peaks(inverted, distance=n_cols // 8, prominence=3)

    if len(peaks) == 0:
        return None, []

    toe_tips = [(col_min + p, int(skyline_smooth[p])) for p in peaks]
    toe_tips.sort(key=lambda t: t[0])  # left to right

    if len(toe_tips) < 2:
        return toe_tips[0], toe_tips

    # Determine big-toe side: compare leftmost vs rightmost tip heights.
    # The big toe is on the side with the lower y (higher in image).
    # Then order tips from big-toe side so index 0 = big toe, index 1 = 2nd toe.
    left_tip_y = toe_tips[0][1]
    right_tip_y = toe_tips[-1][1]
    if right_tip_y < left_tip_y:
        # Big toe is on the right → reverse so big toe comes first
        toe_tips = toe_tips[::-1]

    # toe_tips[0] = big toe, toe_tips[1] = 2nd toe (positionally)
    second_toe = toe_tips[1]

    return second_toe, toe_tips


def normalize_sole_orientation(mask, img=None):
    """Normalize sole-view orientation: toes at top, anatomically aligned.

    Two-pass approach:
        1. Rough alignment via minAreaRect (long axis → vertical)
        2. Fine rotation so heel center → 2nd toe tip is exactly vertical

    Args:
        mask: binary uint8 mask (H, W), 0 or 255
        img:  optional BGR image to transform in parallel (same shape as mask)

    Returns:
        (normalized_mask, normalized_img_or_None, info_dict)
        info_dict contains: fine_angle, heel, second_toe, all_tips
    """
    # ── Pass 1: rough minAreaRect alignment ──
    rough_mask, M1 = _rough_align(mask)
    rough_mask, crop_off = _crop_to_mask(rough_mask)
    rough_mask, flipped = _ensure_toes_at_top(rough_mask)

    # Also warp the image through pass 1 if provided
    rough_img = None
    if img is not None:
        h, w = mask.shape[:2]
        rough_img = cv2.warpAffine(img, M1,
                                    (rough_mask.shape[1] + crop_off[0] * 2,
                                     rough_mask.shape[0] + crop_off[1] * 2),
                                    borderValue=(255, 255, 255))
        # We need to re-derive crop coords from the full rough mask
        full_rough, _ = _rough_align(mask)
        ys, xs = np.where(full_rough > 0)
        if len(ys) > 0:
            pad = 15
            y1 = max(0, ys.min() - pad)
            y2 = min(full_rough.shape[0], ys.max() + pad)
            x1 = max(0, xs.min() - pad)
            x2 = min(full_rough.shape[1], xs.max() + pad)
            rough_img = cv2.warpAffine(img, M1,
                                        (full_rough.shape[1], full_rough.shape[0]),
                                        borderValue=(255, 255, 255))
            rough_img = rough_img[y1:y2, x1:x2]
            if flipped:
                rough_img = cv2.rotate(rough_img, cv2.ROTATE_180)

    # ── Pass 2: find landmarks on rough mask ──
    heel_x, heel_y = _find_heel_center(rough_mask)
    second_toe, all_tips = _find_second_toe_tip(rough_mask)

    info = {
        "heel": (heel_x, heel_y),
        "second_toe": second_toe,
        "all_tips": all_tips,
        "fine_angle": 0.0,
        "flipped": flipped,
    }

    if second_toe is None:
        print("  Rotation: could not find 2nd toe — rough alignment only")
        return rough_mask, rough_img, info

    toe_x, toe_y = second_toe
    dx = toe_x - heel_x
    dy = heel_y - toe_y  # positive = toe above heel

    if dy < 10:
        print("  Rotation: heel/toe too close vertically — rough alignment only")
        return rough_mask, rough_img, info

    fine_angle = np.degrees(np.arctan2(dx, dy))
    info["fine_angle"] = fine_angle
    print(f"  Rotation: fine angle {fine_angle:+.2f}° "
          f"(heel ({heel_x},{heel_y}) → 2nd toe ({toe_x},{toe_y}))")

    # ── Apply fine rotation ──
    mid_x = (heel_x + toe_x) / 2
    mid_y = (heel_y + toe_y) / 2
    rh, rw = rough_mask.shape[:2]

    M2 = cv2.getRotationMatrix2D((mid_x, mid_y), fine_angle, 1.0)
    cos_a = abs(np.cos(np.radians(fine_angle)))
    sin_a = abs(np.sin(np.radians(fine_angle)))
    new_w = int(rw * cos_a + rh * sin_a) + 10
    new_h = int(rh * cos_a + rw * sin_a) + 10
    M2[0, 2] += (new_w - rw) / 2
    M2[1, 2] += (new_h - rh) / 2

    final_mask = cv2.warpAffine(rough_mask, M2, (new_w, new_h),
                                 flags=cv2.INTER_NEAREST, borderValue=0)
    final_mask, _ = _crop_to_mask(final_mask)

    final_img = None
    if rough_img is not None:
        final_img = cv2.warpAffine(rough_img, M2, (new_w, new_h),
                                    borderValue=(255, 255, 255))
        # Crop to same region as mask
        fys, fxs = np.where(final_mask > 0) if final_mask is not None else ([], [])
        # Re-derive from the mask we just warped
        temp_mask = cv2.warpAffine(rough_mask, M2, (new_w, new_h),
                                    flags=cv2.INTER_NEAREST, borderValue=0)
        tys, txs = np.where(temp_mask > 0)
        if len(tys) > 0:
            pad = 15
            ty1 = max(0, tys.min() - pad)
            ty2 = min(new_h, tys.max() + pad)
            tx1 = max(0, txs.min() - pad)
            tx2 = min(new_w, txs.max() + pad)
            final_img = final_img[ty1:ty2, tx1:tx2]

    # Ensure mask is 0/1 (draw_sole_overlay expects this for * 255)
    final_mask = (final_mask > 0).astype(np.uint8)

    return final_mask, final_img, info


# ── Toe shape detection ───────────────────────────────────────────────────

def detect_toe_shape(mask, upper_row, ball_row):
    """Detect toe shape (Egyptian/Greek/Roman) from the toe region skyline.

    Method:
    1. Build skyline: for each column, find topmost mask pixel in toe zone
    2. Smooth skyline to reduce noise
    3. Find peaks (toe tips) as local minima in skyline y-values
    4. Compare relative heights of the first two peaks

    Returns: (shape_name, [(x, y), ...] list of toe tip coordinates)
    """
    toe_zone_end = upper_row + int((ball_row - upper_row) * 0.65)

    cols_with_pixels = np.where(np.any(mask[upper_row:toe_zone_end, :] > 0, axis=0))[0]
    if len(cols_with_pixels) < 10:
        return "unknown", []

    col_min, col_max = cols_with_pixels[0], cols_with_pixels[-1]

    # Build skyline: topmost mask pixel per column
    skyline = np.full(col_max - col_min + 1, toe_zone_end, dtype=np.float64)
    for i, col in enumerate(range(col_min, col_max + 1)):
        col_pixels = np.where(mask[upper_row:toe_zone_end, col] > 0)[0]
        if len(col_pixels) > 0:
            skyline[i] = upper_row + col_pixels[0]

    # Smooth to remove noise
    kernel_size = max(5, len(skyline) // 30)
    if kernel_size % 2 == 0:
        kernel_size += 1
    from scipy.ndimage import uniform_filter1d
    skyline_smooth = uniform_filter1d(skyline, size=kernel_size)

    # Find peaks (local minima in y = toe tips sticking up)
    from scipy.signal import find_peaks
    inverted = -skyline_smooth
    peaks, properties = find_peaks(inverted, distance=len(skyline) // 8, prominence=3)

    if len(peaks) < 2:
        return "unknown", []

    # Convert peak indices to (x, y) coordinates
    toe_tips = []
    for p in peaks:
        x = col_min + p
        y = int(skyline_smooth[p])
        toe_tips.append((int(x), y))

    toe_tips.sort(key=lambda t: t[0])

    # Big toe = side with lowest y (highest tip)
    left_tip_y = toe_tips[0][1]
    right_tip_y = toe_tips[-1][1]
    if right_tip_y < left_tip_y:
        toe_tips = toe_tips[::-1]

    toe_tips = toe_tips[:5]
    tip_ys = [t[1] for t in toe_tips]

    if len(tip_ys) < 2:
        return "unknown", toe_tips

    t1, t2 = tip_ys[0], tip_ys[1]
    t3 = tip_ys[2] if len(tip_ys) > 2 else t2 + 10

    # Positive diff = second toe higher (lower y in image coords)
    diff_12 = t1 - t2  # >0 means toe 2 higher than toe 1
    diff_23 = t2 - t3  # >0 means toe 3 higher than toe 2
    threshold = max(5, (ball_row - upper_row) * 0.02)

    toes_12_equal = abs(diff_12) <= threshold
    toes_23_equal = abs(diff_23) <= threshold

    if toes_12_equal and toes_23_equal:
        # First 3 toes roughly equal height
        shape = "roman"
    elif diff_12 > threshold:
        # Toe 2 higher than toe 1 → greek
        shape = "greek"
    else:
        # Toe 1 higher than (or equal to) toe 2 → egyptian
        shape = "egyptian"

    return shape, toe_tips


# ── Hallux valgus (HVA) measurement ─────────────────────────────────────
# Hallux valgus = inward drift of the big toe (bunion tendency).
# Measurement: ratio of big toe tip's lateral offset from medial edge to forefoot width.
# HVA offset ratio: (big_toe_tip_x - medial_edge_x) / forefoot_width
# Classification: normal (<0.15), mild (0.15-0.25), pronounced (>0.25)

def measure_hallux_valgus(toe_tips, ball_left, ball_width):
    """Measure hallux valgus from big toe tip position.

    Args:
        toe_tips: list of (x, y) tuples, first item is big toe
        ball_left: x-coordinate of medial forefoot edge
        ball_width: width of forefoot

    Returns:
        (hva_offset_ratio, hallux_valgus_class)
        - hva_offset_ratio: float (0-1), how far big toe drifts inward
        - hallux_valgus_class: "normal", "mild", or "pronounced"
    """
    if not toe_tips or len(toe_tips) < 1 or ball_width <= 0:
        return None, "normal"

    big_toe_x = toe_tips[0][0]

    # HVA offset = how far the big toe tip is from the medial edge
    # Normalized by forefoot width
    hva_offset = big_toe_x - ball_left
    hva_offset_ratio = round(hva_offset / ball_width, 3)

    # Clamp to [0, 1] range for safety
    hva_offset_ratio = max(0.0, min(1.0, hva_offset_ratio))

    # Classification based on population reference
    # Normal: <0.15 (big toe tip is near the medial edge)
    # Mild: 0.15-0.25 (noticeable inward drift)
    # Pronounced: >0.25 (significant inward drift)
    if hva_offset_ratio < 0.15:
        classification = "normal"
    elif hva_offset_ratio < 0.25:
        classification = "mild"
    else:
        classification = "pronounced"

    return hva_offset_ratio, classification


# ── Sole-view measurements ───────────────────────────────────────────────

def measure_sole(mask):
    """Extract all sole-view measurements from a clean binary mask.

    Returns dict with rows, widths, ratios, and classifications.
    """
    ys, xs = np.where(mask > 0)
    if len(ys) == 0:
        return None

    by, bh = ys.min(), ys.max() - ys.min()
    upper_row = int(ys.min())
    lower_row = int(ys.max())
    foot_length = lower_row - upper_row

    if foot_length < 50:
        return None

    # Ball = leftmost (most medial) outline point within 25-40% from toe tips.
    # The ball row is the row where the mask extends furthest left in this zone.
    # Forefoot width = full horizontal span at the ball row.
    search_start = by + int(bh * 0.25)
    search_end = by + int(bh * 0.40)
    min_left = mask.shape[1]
    ball_row = search_start
    for row in range(search_start, search_end):
        pixels = np.where(mask[row, :] > 0)[0]
        if len(pixels) > 0 and pixels[0] < min_left:
            min_left = pixels[0]
            ball_row = row
    ball_px = np.where(mask[ball_row, :] > 0)[0]
    ball_width = int(ball_px[-1] - ball_px[0])
    ball_left, ball_right = int(ball_px[0]), int(ball_px[-1])

    # Heel = widest horizontal span in rear 10-15% of foot
    heel_start = by + int(bh * 0.85)
    max_hw = 0
    heel_row = heel_start
    for row in range(heel_start, lower_row + 1):
        px = np.where(mask[row, :] > 0)[0]
        if len(px) > 0:
            w = px[-1] - px[0]
            if w > max_hw:
                max_hw = int(w)
                heel_row = row
    heel_px = np.where(mask[heel_row, :] > 0)[0]
    heel_left, heel_right = int(heel_px[0]), int(heel_px[-1])

    # Compute ratios
    arch_length = lower_row - ball_row
    arch_length_ratio = round(arch_length / foot_length, 3)
    forefoot_width_ratio = round(ball_width / foot_length, 3)
    heel_width_ratio = round(max_hw / foot_length, 3) if foot_length > 0 else 0.0

    # Toe shape detection
    toe_shape, toe_tips = detect_toe_shape(mask, upper_row, ball_row)

    # Hallux valgus measurement
    hva_offset_ratio, hallux_valgus_class = measure_hallux_valgus(
        toe_tips, ball_left, ball_width
    )

    return {
        "view": "sole",
        "upper_row": upper_row,
        "lower_row": lower_row,
        "ball_row": int(ball_row),
        "heel_row": int(heel_row),
        "foot_length_px": foot_length,
        "ball_width_px": ball_width,
        "ball_left": ball_left,
        "ball_right": ball_right,
        "heel_width_px": max_hw,
        "heel_left": heel_left,
        "heel_right": heel_right,
        "arch_length_px": arch_length,
        "arch_length_ratio": arch_length_ratio,
        "forefoot_width_ratio": forefoot_width_ratio,
        "heel_width_ratio": heel_width_ratio,
        "arch_length_class": classify_ratio("arch_length_ratio", arch_length_ratio),
        "forefoot_width_class": classify_ratio("forefoot_width_ratio", forefoot_width_ratio),
        "heel_width_class": classify_ratio("heel_width_ratio", heel_width_ratio),
        "toe_shape": toe_shape,
        "toe_tips": toe_tips,
        "hva_offset_ratio": hva_offset_ratio,
        "hallux_valgus_class": hallux_valgus_class,
    }


# ── Side-view orientation normalization ───────────────────────────────────
# Three-step approach:
#   1. Ensure horizontal (rotate 90° if taller than wide)
#   2. Ensure heel is left (more mass = heel; flip if needed)
#   3. Level the sole: rotate until lowest point of heel and lowest
#      point of toes sit on the same horizontal line
# After normalization: heel left, toes right, sole at bottom, dorsal on top.


def normalize_side_orientation(mask, img=None):
    """Normalize side-view orientation: heel left, toes right, sole leveled.

    Args:
        mask: binary uint8 mask (H, W), 0 or 255
        img:  optional BGR image to transform in parallel

    Returns:
        (normalized_mask, normalized_img_or_None, info_dict)
    """
    ys, xs = np.where(mask > 0)
    if len(ys) == 0:
        return mask, img, {"rotation_angle": 0.0}

    h, w = mask.shape[:2]

    # ── Step 1: Rotate foot to horizontal using minAreaRect ──
    # The naive check (h > w on image dims) fails when the foot is at a steep
    # angle in a square or landscape photo. Use minAreaRect on the actual mask
    # contour to find the true orientation and rotate the long axis horizontal.
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL,
                                    cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        cnt = max(contours, key=cv2.contourArea)
        rect = cv2.minAreaRect(cnt)
        center, (rw, rh), angle = rect

        # Determine angle to make the LONG axis horizontal.
        # minAreaRect: angle is in [-90, 0). rw is the first side.
        if rw < rh:
            # Long axis is rh (perpendicular to angle direction)
            rot_angle = angle + 90
        else:
            # Long axis is rw (along angle direction)
            rot_angle = angle

        # Only rotate if significantly off-horizontal (> 5 degrees)
        if abs(rot_angle) > 5:
            cos_a = abs(np.cos(np.radians(rot_angle)))
            sin_a = abs(np.sin(np.radians(rot_angle)))
            new_w = int(w * cos_a + h * sin_a) + 20
            new_h = int(h * cos_a + w * sin_a) + 20

            M = cv2.getRotationMatrix2D(center, rot_angle, 1.0)
            M[0, 2] += (new_w - w) / 2
            M[1, 2] += (new_h - h) / 2

            mask = cv2.warpAffine(mask, M, (new_w, new_h),
                                   flags=cv2.INTER_NEAREST, borderValue=0)
            if img is not None:
                img = cv2.warpAffine(img, M, (new_w, new_h),
                                      borderValue=(255, 255, 255))
            h, w = mask.shape[:2]
            print(f"  Side step1: rotated {rot_angle:+.1f}° to horizontal")
        else:
            print(f"  Side step1: already horizontal ({rot_angle:+.1f}°)")
    else:
        # Fallback: simple dimension check
        if h > w:
            mask = cv2.rotate(mask, cv2.ROTATE_90_CLOCKWISE)
            if img is not None:
                img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
            h, w = mask.shape[:2]

    ys, xs = np.where(mask > 0)
    x_min, x_max = int(xs.min()), int(xs.max())
    foot_width = x_max - x_min

    # ── Step 2: Ensure heel is left (more mass on heel side) ──
    mid_x = (x_min + x_max) // 2
    left_mass = np.count_nonzero(mask[:, x_min:mid_x])
    right_mass = np.count_nonzero(mask[:, mid_x:x_max])
    flipped = False
    if right_mass > left_mass:
        mask = cv2.flip(mask, 1)  # horizontal flip
        if img is not None:
            img = cv2.flip(img, 1)
        flipped = True

    # Re-derive bounds after potential flip
    ys, xs = np.where(mask > 0)
    x_min, x_max = int(xs.min()), int(xs.max())
    y_min, y_max = int(ys.min()), int(ys.max())
    foot_width = x_max - x_min

    # ── Step 3: Level the sole ──
    # Find lowest (highest y) mask pixel in heel zone (left 30%)
    heel_zone_end = x_min + int(foot_width * 0.30)
    heel_region = mask[:, x_min:heel_zone_end]
    hr_ys, hr_xs = np.where(heel_region > 0)
    if len(hr_ys) > 0:
        heel_lowest_row = int(hr_ys.max())
        at_lowest = hr_ys == heel_lowest_row
        heel_lowest_x = x_min + int(np.mean(hr_xs[at_lowest]))
    else:
        heel_lowest_row, heel_lowest_x = y_max, x_min

    # Find lowest mask pixel in toe zone (right 30%)
    toe_zone_start = x_max - int(foot_width * 0.30)
    toe_region = mask[:, toe_zone_start:x_max + 1]
    tr_ys, tr_xs = np.where(toe_region > 0)
    if len(tr_ys) > 0:
        toe_lowest_row = int(tr_ys.max())
        at_lowest = tr_ys == toe_lowest_row
        toe_lowest_x = toe_zone_start + int(np.mean(tr_xs[at_lowest]))
    else:
        toe_lowest_row, toe_lowest_x = y_max, x_max

    # Compute angle between heel bottom and toe bottom, rotate to level
    dx = toe_lowest_x - heel_lowest_x
    dy = toe_lowest_row - heel_lowest_row
    angle = np.degrees(np.arctan2(dy, dx)) if abs(dx) > 10 else 0.0

    print(f"  Side leveling: {angle:+.2f}° "
          f"(heel ({heel_lowest_x},{heel_lowest_row}) → toe ({toe_lowest_x},{toe_lowest_row}))")

    if abs(angle) > 0.3:
        center = ((heel_lowest_x + toe_lowest_x) / 2,
                  (heel_lowest_row + toe_lowest_row) / 2)
        cos_a = abs(np.cos(np.radians(angle)))
        sin_a = abs(np.sin(np.radians(angle)))
        new_w = int(w * cos_a + h * sin_a) + 10
        new_h = int(h * cos_a + w * sin_a) + 10

        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        M[0, 2] += (new_w - w) / 2
        M[1, 2] += (new_h - h) / 2

        mask = cv2.warpAffine(mask, M, (new_w, new_h),
                               flags=cv2.INTER_NEAREST, borderValue=0)
        if img is not None:
            img = cv2.warpAffine(img, M, (new_w, new_h),
                                  borderValue=(255, 255, 255))

    # Crop tight to mask
    ys, xs = np.where(mask > 0)
    if len(ys) > 0:
        pad = 15
        y1 = max(0, int(ys.min()) - pad)
        y2 = min(mask.shape[0], int(ys.max()) + pad)
        x1 = max(0, int(xs.min()) - pad)
        x2 = min(mask.shape[1], int(xs.max()) + pad)
        mask = mask[y1:y2, x1:x2]
        if img is not None:
            img = img[y1:y2, x1:x2]

    return mask, img, {"rotation_angle": angle, "flipped": flipped}


# ── Side-view measurements ───────────────────────────────────────────────

def measure_side(mask):
    """Extract side-view measurements from a normalized binary mask.

    IMPORTANT: mask must already be normalized to horizontal orientation
    with heel on left, toes on right (call normalize_side_orientation first).

    Measures:
      - foot_length: horizontal extent (toe tip to heel back)
      - instep_height: dorsal surface at 50% from toe tip down to ground plane
      - heel_depth: horizontal distance measuring how far the heel protrudes
                    behind the ankle (Point A to Point B, see below)

    All ratios are normalized to foot_length.

    Returns dict with pixel measurements, ratios, and classifications.
    """
    ys, xs = np.where(mask > 0)
    if len(ys) == 0:
        return None

    # Bounding box
    x_min, x_max = int(xs.min()), int(xs.max())
    y_min, y_max = int(ys.min()), int(ys.max())
    width = x_max - x_min
    height = y_max - y_min

    if max(width, height) < 50:
        return None

    # Mask is normalized: horizontal, heel left, toes right
    foot_length = width
    toes_left = False  # toes are always on the right after normalization

    # Instep height: dorsal surface at 50% from toe tip down to ground plane.
    # Ground plane = y_max (bottom of leveled mask). NOT mask thickness, because
    # the arch may lift the plantar surface above ground.
    instep_col = int(x_max - width * 0.50)
    instep_pixels = np.where(mask[:, instep_col] > 0)[0]
    instep_top = int(instep_pixels[0]) if len(instep_pixels) > 0 else y_min
    instep_bottom = y_max  # ground plane, not mask bottom
    instep_height = instep_bottom - instep_top

    # Ankle notch: narrowest vertical span in 70-90% from toe (= 10-30% from left/heel)
    ankle_start = int(x_max - width * 0.90)
    ankle_end = int(x_max - width * 0.70)
    if ankle_start > ankle_end:
        ankle_start, ankle_end = ankle_end, ankle_start

    min_span = height
    ankle_col = (ankle_start + ankle_end) // 2
    for col in range(ankle_start, ankle_end + 1):
        col_pixels = np.where(mask[:, col] > 0)[0]
        if len(col_pixels) > 0:
            span = int(col_pixels[-1] - col_pixels[0])
            if span < min_span:
                min_span = span
                ankle_col = col

    # Heel depth (per spec): horizontal distance between two vertical lines:
    #   Line 1 (Point A): x where instep-top horizontal line meets the
    #           heel-side (left) foot outline
    #   Line 2 (Point B): leftmost x of any foot pixel below Point A
    #           (i.e. below the instep_top row)
    # heel_depth = A_x - B_x  (how far the heel protrudes behind the ankle)

    instep_row_pixels = np.where(mask[instep_top, :] > 0)[0]
    if len(instep_row_pixels) > 0:
        heel_side_at_instep_x = int(instep_row_pixels[0])  # Point A x
    else:
        heel_side_at_instep_x = x_min

    # Point B: leftmost (most-rear) foot pixel below the instep line
    below_instep = mask[instep_top:, :]
    bi_ys, bi_xs = np.where(below_instep > 0)
    if len(bi_xs) > 0:
        heel_most_rear_x = int(bi_xs.min())
    else:
        heel_most_rear_x = heel_side_at_instep_x

    heel_depth = max(0, heel_side_at_instep_x - heel_most_rear_x)

    # Compute ratios
    instep_ratio = round(instep_height / foot_length, 3) if foot_length > 0 else 0.0
    heel_depth_ratio = round(heel_depth / foot_length, 3) if foot_length > 0 else 0.0

    return {
        "view": "side",
        "vertical": False,  # always normalized now
        "foot_length_px": foot_length,
        "foot_span_px": foot_length,
        "foot_height_px": height,
        "toes_left": False,  # always heel-left/toes-right after normalization
        "x_min": x_min,
        "x_max": x_max,
        "y_min": y_min,
        "y_max": y_max,
        "instep_col": int(instep_col),
        "instep_top": int(instep_top),
        "instep_bottom": int(instep_bottom),
        "instep_height_px": int(instep_height),
        "ankle_col": int(ankle_col),
        "heel_side_at_instep_x": int(heel_side_at_instep_x),  # Point A x (ankle line)
        "heel_most_rear_x": int(heel_most_rear_x),            # Point B x (most-rear heel point)
        "heel_depth_px": int(heel_depth),
        "instep_height_ratio": instep_ratio,
        "heel_depth_ratio": heel_depth_ratio,
        "instep_height_class": classify_ratio("instep_height_ratio", instep_ratio),
        "heel_depth_class": classify_ratio("heel_depth_ratio", heel_depth_ratio),
    }


# ── Overlay drawing (sole view) ──────────────────────────────────────────

def draw_sole_overlay(img, mask, m, out_path):
    """Draw measurement overlay for sole view: scan photo on left,
    measurement diagram (silhouette + lines) on right."""
    sil = _load_silhouette_mask()

    scan_ys, scan_xs = np.where(mask > 0)
    scan_top, scan_bot = scan_ys.min(), scan_ys.max()
    scan_left, scan_right = scan_xs.min(), scan_xs.max()
    scan_h = scan_bot - scan_top
    scan_w = scan_right - scan_left

    TGT = 700
    RIGHT_MARGIN = 20
    scan_scale = TGT / scan_h
    scan_nw = int(scan_w * scan_scale)

    # Scale silhouette to same height
    sil_nw = 0
    sil_r = None
    if sil is not None:
        sil_ys, sil_xs = np.where(sil > 0)
        sil_top, sil_bot = sil_ys.min(), sil_ys.max()
        sil_left_s, sil_right_s = sil_xs.min(), sil_xs.max()
        sil_h = sil_bot - sil_top
        sil_w = sil_right_s - sil_left_s
        sil_scale = TGT / sil_h
        sil_nw = int(sil_w * sil_scale)
        sil_crop = sil[sil_top:sil_bot+1, sil_left_s:sil_right_s+1]
        sil_r = cv2.resize(sil_crop, (sil_nw, TGT), interpolation=cv2.INTER_AREA)
        _, sil_r = cv2.threshold(sil_r, 128, 255, cv2.THRESH_BINARY)
        sil_r = cv2.flip(sil_r, 1)  # mirror to match scan orientation

    scan_crop = mask[scan_top:scan_bot+1, scan_left:scan_right+1] * 255
    scan_r = cv2.resize(scan_crop, (scan_nw, TGT), interpolation=cv2.INTER_AREA)
    _, scan_r = cv2.threshold(scan_r, 128, 255, cv2.THRESH_BINARY)

    # ── Diagram-only canvas (no raw photo) ──
    PAD = 50
    body_w = max(sil_nw, scan_nw)
    diagram_w = body_w + PAD * 2 + RIGHT_MARGIN
    diagram_h = TGT + PAD * 2

    cw = diagram_w
    ch = diagram_h
    canvas = np.zeros((ch, cw, 3), dtype=np.uint8)
    canvas[:] = (255, 255, 255)

    dx = 0
    cx = dx + PAD + body_w // 2

    # Draw silhouette outline
    if sil_r is not None:
        sil_x0 = cx - sil_nw // 2
        sil_contours, _ = cv2.findContours(sil_r, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in sil_contours:
            c[:, :, 0] += sil_x0
            c[:, :, 1] += PAD
        cv2.drawContours(canvas, sil_contours, -1, (191, 205, 213), 2, cv2.LINE_AA)

    # Draw scan: semi-transparent amber fill + outline
    AMBER_BGR = (66, 138, 201)
    scan_x0 = cx - scan_nw // 2
    region = canvas[PAD:PAD+TGT, scan_x0:scan_x0+scan_nw]
    scan_bool = scan_r[:TGT, :scan_nw] > 0
    fg = np.array(AMBER_BGR, dtype=np.float32)
    region[scan_bool] = (region[scan_bool].astype(np.float32) * 0.65 + fg * 0.35).astype(np.uint8)
    scan_contours, _ = cv2.findContours(scan_r, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for c in scan_contours:
        c[:, :, 0] += scan_x0
        c[:, :, 1] += PAD
    cv2.drawContours(canvas, scan_contours, -1, AMBER_BGR, 2, cv2.LINE_AA)

    # Measurement lines
    GREEN = (82, 122, 61)
    GREEN_LIGHT = (120, 160, 90)

    line_left = dx + PAD - 10
    line_right = dx + PAD + body_w + 10

    def to_cy(orig_row):
        return PAD + int((orig_row - scan_top) * scan_scale)

    upper_cy = to_cy(m["upper_row"])
    lower_cy = to_cy(m["lower_row"])
    ball_cy = to_cy(m["ball_row"])
    heel_cy = to_cy(m["heel_row"])

    ball_l_cx = scan_x0 + int((m["ball_left"] - scan_left) * scan_scale)
    ball_r_cx = scan_x0 + int((m["ball_right"] - scan_left) * scan_scale)
    heel_l_cx = scan_x0 + int((m["heel_left"] - scan_left) * scan_scale)
    heel_r_cx = scan_x0 + int((m["heel_right"] - scan_left) * scan_scale)

    # Upper / lower reference lines
    cv2.line(canvas, (line_left, upper_cy), (line_right, upper_cy), GREEN_LIGHT, 1, cv2.LINE_AA)
    cv2.line(canvas, (line_left, lower_cy), (line_right, lower_cy), GREEN_LIGHT, 1, cv2.LINE_AA)

    # Ball line + width markers
    cv2.line(canvas, (line_left, ball_cy), (line_right, ball_cy), GREEN, 2, cv2.LINE_AA)
    cv2.line(canvas, (ball_l_cx, ball_cy-10), (ball_l_cx, ball_cy+10), GREEN, 2, cv2.LINE_AA)
    cv2.line(canvas, (ball_r_cx, ball_cy-10), (ball_r_cx, ball_cy+10), GREEN, 2, cv2.LINE_AA)

    # Heel line + width markers
    cv2.line(canvas, (line_left, heel_cy), (line_right, heel_cy), GREEN, 2, cv2.LINE_AA)
    cv2.line(canvas, (heel_l_cx, heel_cy-10), (heel_l_cx, heel_cy+10), GREEN, 2, cv2.LINE_AA)
    cv2.line(canvas, (heel_r_cx, heel_cy-10), (heel_r_cx, heel_cy+10), GREEN, 2, cv2.LINE_AA)

    # Foot length bracket (right side)
    bx = line_right + 5
    cv2.line(canvas, (bx, upper_cy), (bx, lower_cy), GREEN, 1, cv2.LINE_AA)
    cv2.line(canvas, (bx-4, upper_cy), (bx+4, upper_cy), GREEN, 1, cv2.LINE_AA)
    cv2.line(canvas, (bx-4, lower_cy), (bx+4, lower_cy), GREEN, 1, cv2.LINE_AA)

    # Arch length bracket (left side)
    arch_bx = line_left - 10
    cv2.line(canvas, (arch_bx, ball_cy), (arch_bx, lower_cy), GREEN, 1, cv2.LINE_AA)
    cv2.line(canvas, (arch_bx-4, ball_cy), (arch_bx+4, ball_cy), GREEN, 1, cv2.LINE_AA)
    cv2.line(canvas, (arch_bx-4, lower_cy), (arch_bx+4, lower_cy), GREEN, 1, cv2.LINE_AA)

    # Toe tip dots
    TIP_GREEN = (50, 170, 50)
    for (tx, ty) in m.get("toe_tips", []):
        tcx = scan_x0 + int((tx - scan_left) * scan_scale)
        tcy = PAD + int((ty - scan_top) * scan_scale)
        cv2.circle(canvas, (tcx, tcy), 5, TIP_GREEN, -1, cv2.LINE_AA)
        cv2.circle(canvas, (tcx, tcy), 5, (255, 255, 255), 1, cv2.LINE_AA)

    # Hallux valgus visualization (if available)
    if m.get("toe_tips") and m.get("ball_left") is not None and m.get("hallux_valgus_class"):
        big_toe_x, big_toe_y = m["toe_tips"][0]
        ball_left = m["ball_left"]

        # Draw medial edge reference line (at ball row)
        med_edge_cx = scan_x0 + int((ball_left - scan_left) * scan_scale)
        cv2.line(canvas, (med_edge_cx, ball_cy - 30), (med_edge_cx, ball_cy + 30), (200, 100, 100), 1, cv2.LINE_AA)

        # Draw HVA offset line from medial edge to big toe tip
        big_toe_cx = scan_x0 + int((big_toe_x - scan_left) * scan_scale)
        big_toe_cy = PAD + int((big_toe_y - scan_top) * scan_scale)
        hva_color = (60, 140, 200)  # Orange-ish for HVA
        cv2.line(canvas, (med_edge_cx, big_toe_cy), (big_toe_cx, big_toe_cy), hva_color, 2, cv2.LINE_AA)
        cv2.circle(canvas, (big_toe_cx, big_toe_cy), 6, hva_color, -1, cv2.LINE_AA)
        cv2.circle(canvas, (big_toe_cx, big_toe_cy), 6, (255, 255, 255), 1, cv2.LINE_AA)

        # Add HVA class label
        hva_class = m.get("hallux_valgus_class", "normal")
        hva_ratio = m.get("hva_offset_ratio", 0)
        hva_text = f"HVA: {hva_class} ({hva_ratio:.3f})"
        cv2.putText(
            canvas, hva_text, (line_left, upper_cy - 15),
            cv2.FONT_HERSHEY_SIMPLEX, 0.4, hva_color, 1, cv2.LINE_AA
        )

    # Legend
    ly = ch - 30
    lx = dx + 15
    cv2.circle(canvas, (lx, ly), 4, (191, 205, 213), -1, cv2.LINE_AA)
    cv2.putText(canvas, "Average", (lx + 11, ly+4), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (98, 116, 122), 1, cv2.LINE_AA)
    cv2.circle(canvas, (lx + 80, ly), 4, AMBER_BGR, -1, cv2.LINE_AA)
    cv2.putText(canvas, "Your foot", (lx + 91, ly+4), cv2.FONT_HERSHEY_SIMPLEX, 0.35, AMBER_BGR, 1, cv2.LINE_AA)

    cv2.imwrite(out_path, canvas)
    print(f"  Sole overlay → {out_path}")
    return out_path


# ── Overlay drawing (side view) ──────────────────────────────────────────

def draw_side_overlay(img, mask, m, out_path):
    """Draw measurement overlay for side view: instep height + heel depth.
    Mask must be pre-normalized to horizontal (heel left, toes right).
    img can be None — dimensions are taken from mask."""
    h, w = mask.shape[:2]

    overlay = np.zeros((h, w, 3), dtype=np.uint8)
    overlay[:] = (255, 255, 255)

    AMBER_BGR = (66, 138, 201)
    fg = np.array(AMBER_BGR, dtype=np.float32)
    overlay[mask > 0] = (overlay[mask > 0].astype(np.float32) * 0.65 + fg * 0.35).astype(np.uint8)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(overlay, contours, -1, AMBER_BGR, 2, cv2.LINE_AA)

    GREEN = (82, 122, 61)
    PURPLE = (200, 100, 180)
    GRAY = (150, 150, 150)

    # Horizontal foot: instep is a vertical line, heel depth is horizontal
    ic = m["instep_col"]
    it = m["instep_top"]
    ib = m["instep_bottom"]

    # Ground line (horizontal at the bottom of the foot)
    cv2.line(overlay, (m["x_min"], m["y_max"]), (m["x_max"], m["y_max"]), GRAY, 1, cv2.LINE_AA)

    # Instep height line (vertical at instep column)
    cv2.line(overlay, (ic, it), (ic, ib), GREEN, 2, cv2.LINE_AA)
    cv2.line(overlay, (ic-8, it), (ic+8, it), GREEN, 2, cv2.LINE_AA)
    cv2.line(overlay, (ic-8, ib), (ic+8, ib), GREEN, 2, cv2.LINE_AA)

    # Thin horizontal reference at instep height
    cv2.line(overlay, (m["x_min"], it), (m["x_max"], it), GRAY, 1, cv2.LINE_AA)

    # Heel depth: horizontal distance between two vertical lines
    hsx = m["heel_side_at_instep_x"]  # Point A x (ankle/instep intersection)
    hmr = m["heel_most_rear_x"]       # Point B x (most-rear heel point below instep)

    # Thin vertical reference lines at Point A and Point B
    cv2.line(overlay, (hsx, m["y_min"]), (hsx, m["y_max"]), GRAY, 1, cv2.LINE_AA)
    cv2.line(overlay, (hmr, m["y_min"]), (hmr, m["y_max"]), GRAY, 1, cv2.LINE_AA)

    # Horizontal purple measurement line between them (at 75% height)
    heel_line_y = m["y_min"] + int((m["y_max"] - m["y_min"]) * 0.75)
    cv2.line(overlay, (hmr, heel_line_y), (hsx, heel_line_y), PURPLE, 2, cv2.LINE_AA)
    cv2.line(overlay, (hmr, heel_line_y-8), (hmr, heel_line_y+8), PURPLE, 2, cv2.LINE_AA)
    cv2.line(overlay, (hsx, heel_line_y-8), (hsx, heel_line_y+8), PURPLE, 2, cv2.LINE_AA)

    cv2.imwrite(out_path, overlay)
    print(f"  Side overlay → {out_path}")
    return out_path


# ── Silhouette loader ────────────────────────────────────────────────────

def _load_silhouette_mask():
    """Load the standard foot silhouette SVG, convert to binary mask."""
    import subprocess
    svg = str(SILHOUETTE_SVG)
    if not Path(svg).exists():
        return None
    tmp_png = "/tmp/_sil_tmp.png"
    subprocess.run(["qlmanage", "-t", "-s", "1200", "-o", "/tmp/", svg],
                   capture_output=True)
    ql_path = f"/tmp/{Path(svg).name}.png"
    if not os.path.exists(ql_path):
        print(f"  WARNING: could not convert silhouette SVG")
        return None
    gray = cv2.imread(ql_path, cv2.IMREAD_GRAYSCALE)
    _, bw = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
    k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    closed = cv2.morphologyEx(bw, cv2.MORPH_CLOSE, k_close)
    fill_mask = np.zeros((closed.shape[0] + 2, closed.shape[1] + 2), np.uint8)
    flood = closed.copy()
    cv2.floodFill(flood, fill_mask, (0, 0), 255)
    filled = cv2.bitwise_or(cv2.bitwise_not(flood), bw)
    return filled


# ── Metric ranges (matching FootScanResults.jsx) ─────────────────────────
METRIC_META = {
    "forefoot_width_ratio":  {"min": 0.32, "max": 0.46, "label": "Forefoot Width",    "color": "#f97316"},
    "arch_length_ratio":     {"min": 0.60, "max": 0.86, "label": "Arch Length",       "color": "#38bdf8"},
    "heel_width_ratio":      {"min": 0.19, "max": 0.31, "label": "Heel Width",        "color": "#a78bfa"},
    "instep_height_ratio":   {"min": 0.20, "max": 0.38, "label": "Instep Height",     "color": "#34d399"},
    "heel_depth_ratio":      {"min": 0.00, "max": 0.15, "label": "Heel Depth",        "color": "#f472b6"},
}

TOE_SHAPE_META = {
    "egyptian": {"title": "Egyptian",           "desc": "Big toe longest, then tapers down."},
    "greek":    {"title": "Greek (Morton's)",    "desc": "Second toe longest."},
    "roman":    {"title": "Roman (Square)",      "desc": "First 2–3 toes roughly equal length."},
}

TOE_IMG_DIR = Path(__file__).parent.parent / "app" / "public" / "images"


# ── HTML results page ────────────────────────────────────────────────────

def generate_html(results_list, out_path):
    """Generate a styled HTML results page matching climbing-gear.com design."""

    def z_color(val, mean, std):
        z = abs(val - mean) / std
        if z < 0.7: return "#3d7a52"
        if z < 1.5: return "#b8860b"
        return "#c0392b"

    def pct(val, mn, mx):
        return max(0, min(100, (val - mn) / (mx - mn) * 100))

    def metric_html(key, value):
        if key not in POP or key not in METRIC_META:
            return ""
        p = POP[key]
        meta = METRIC_META[key]
        fill_pct = pct(value, meta["min"], meta["max"])
        avg_pct = pct(p["mean"], meta["min"], meta["max"])
        color = z_color(value, p["mean"], p["std"])
        delta = value - p["mean"]
        sign = "+" if delta >= 0 else ""
        return f'''
            <div class="metric">
              <div class="metric-head">
                <span class="metric-name">{meta['label']}</span>
                <span class="metric-val">{value:.3f} <span class="metric-delta" style="color:{color}">({sign}{delta:.3f})</span></span>
              </div>
              <div class="metric-bar">
                <div class="metric-fill" style="width:{fill_pct}%"></div>
                <div class="avg-mark" style="left:{avg_pct}%" title="Average: {p['mean']:.3f}"></div>
              </div>
              <div class="metric-range"><span>{meta['min']}</span><span>{meta['max']}</span></div>
            </div>'''

    def toe_img_html(shape):
        meta = TOE_SHAPE_META.get(shape, {})
        title = meta.get("title", shape.capitalize())
        desc = meta.get("desc", "")
        img_path = TOE_IMG_DIR / f"foot-{shape}.png"
        if not img_path.exists():
            img_path = Path(out_path).parent / f"foot-{shape}.png"
        if img_path.exists():
            b64 = base64.b64encode(img_path.read_bytes()).decode()
            img_tag = f'<img src="data:image/png;base64,{b64}" alt="{shape}" class="toe-img" />'
        else:
            img_tag = f'<div class="toe-img-placeholder">{shape[0].upper()}</div>'
        return f'''
            <div class="toe-card">
              {img_tag}
              <div>
                <div class="toe-name">{title}</div>
                <div class="toe-desc">{desc}</div>
              </div>
            </div>'''

    scans_html = ""
    for r in results_list:
        sole = r.get("sole")
        side = r.get("side")

        # Sole section
        sole_metrics = ""
        sole_tags = ""
        toe_html = ""
        sole_overlay = ""
        if sole:
            m = sole
            sole_overlay = r.get("sole_overlay_file", "")
            toe_html = toe_img_html(m.get("toe_shape", "unknown"))
            sole_metrics = (
                metric_html("forefoot_width_ratio", m["forefoot_width_ratio"]) +
                metric_html("arch_length_ratio", m["arch_length_ratio"]) +
                metric_html("heel_width_ratio", m["heel_width_ratio"])
            )
            sole_tags = f'''
              <span class="tag">Forefoot: {m.get("forefoot_width_class","")}</span>
              <span class="tag">Heel: {m.get("heel_width_class","")}</span>
              <span class="tag">Arch: {m.get("arch_length_class","")}</span>
              <span class="tag">Toe: {m.get("toe_shape","")}</span>'''

        # Side section
        side_metrics = ""
        side_tags = ""
        side_overlay = ""
        if side:
            ms = side
            side_overlay = r.get("side_overlay_file", "")
            side_metrics = (
                metric_html("instep_height_ratio", ms["instep_height_ratio"]) +
                metric_html("heel_depth_ratio", ms["heel_depth_ratio"])
            )
            side_tags = f'''
              <span class="tag">Instep: {ms.get("instep_height_class","")}</span>
              <span class="tag">Heel depth: {ms.get("heel_depth_class","")}</span>'''

        # Build side panel HTML (only if side data present)
        side_panel = ""
        if side:
            side_panel = f'''
          <div class="section-label" style="margin-top:0.5rem">Side View</div>
          <div class="foot-panel-inline">
            <img src="{side_overlay}" alt="side view overlay" />
          </div>
          {side_metrics}'''

        scans_html += f'''
    <div class="card">
      <div class="header">
        <div class="header-badge">Scan Result</div>
        <h1>Your Foot Profile</h1>
      </div>
      <div class="body">
        <div class="foot-panel">
          <span class="view-label">Sole View</span>
          <div class="foot-wrap">
            <img src="{sole_overlay}" alt="foot scan overlay" />
          </div>
        </div>
        <div class="results">
          <div class="section-label">Toe Shape</div>
          {toe_html}
          <div class="section-label">Measurements vs. Population Average</div>
          {sole_metrics}
          {side_panel}
          <div class="section-label">Characteristics</div>
          <div class="tags">
            {sole_tags}
            {side_tags}
          </div>
        </div>
      </div>
    </div>'''

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Foot Scan Results — climbing-gear.com</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ background:#f5f0e8; color:#2c3227; font-family:'DM Sans',system-ui,sans-serif;
         min-height:100vh; display:flex; align-items:center; justify-content:center; padding:1.5rem; }}
  .card {{ max-width:960px; width:100%; background:#fff; border-radius:16px;
           border:1px solid #d5cdbf; overflow:hidden; box-shadow:0 4px 24px rgba(44,50,39,0.06); }}
  .header {{ padding:1.5rem 2rem; border-bottom:1px solid #d5cdbf; }}
  .header-badge {{ font-size:9px; font-weight:700; text-transform:uppercase;
                   letter-spacing:1.5px; color:#c98a42; margin-bottom:6px; }}
  .header h1 {{ font-size:24px; font-weight:800; color:#2c3227; letter-spacing:-0.5px; }}
  .body {{ display:grid; grid-template-columns:340px 1fr; }}
  .foot-panel {{ background:#faf8f4; padding:1.5rem; border-right:1px solid #d5cdbf;
                 display:flex; flex-direction:column; align-items:center; gap:1rem; }}
  .view-label {{ font-size:9px; font-weight:700; text-transform:uppercase;
                 letter-spacing:1.5px; color:#c98a42; align-self:flex-start; margin-left:1rem; }}
  .foot-wrap {{ width:100%; max-width:260px; }}
  .foot-wrap img {{ width:100%; height:auto; object-fit:contain; border-radius:12px; }}
  .results {{ padding:1.5rem 2rem; display:flex; flex-direction:column; gap:1rem; overflow-y:auto; }}
  .section-label {{ font-size:9px; font-weight:700; text-transform:uppercase;
                    letter-spacing:1.5px; color:#c98a42; margin-top:0.25rem; }}
  .toe-card {{ display:flex; align-items:center; gap:1rem; padding:0.75rem 1rem;
               background:rgba(201,138,66,0.06); border-radius:12px; border:1px solid #d5cdbf; }}
  .toe-img {{ width:90px; height:auto; flex-shrink:0; filter:brightness(0.95); }}
  .toe-img-placeholder {{ width:90px; height:90px; flex-shrink:0; display:flex; align-items:center;
                          justify-content:center; background:#e8e2d6; border-radius:8px;
                          font-size:2rem; font-weight:700; color:#7a7462; }}
  .toe-name {{ font-size:14px; font-weight:700; color:#2c3227; margin-bottom:4px; }}
  .toe-desc {{ font-size:12px; color:#7a7462; line-height:1.5; }}
  .metric {{ display:flex; flex-direction:column; gap:4px; }}
  .metric-head {{ display:flex; justify-content:space-between; align-items:baseline; }}
  .metric-name {{ font-size:0.8rem; font-weight:600; color:#2c3227; }}
  .metric-val {{ font-size:0.8rem; font-weight:700; font-variant-numeric:tabular-nums; color:#2c3227; }}
  .metric-delta {{ font-size:0.7rem; }}
  .metric-bar {{ height:6px; background:#e8e2d6; border-radius:3px; position:relative; overflow:visible; }}
  .metric-fill {{ height:100%; border-radius:3px; background:#c98a42;
                  transition:width 1.2s cubic-bezier(0.22,1,0.36,1); }}
  .avg-mark {{ position:absolute; top:-4px; width:2px; height:14px; background:#a8a08e;
               border-radius:1px; transform:translateX(-1px); }}
  .metric-range {{ display:flex; justify-content:space-between; font-size:0.6rem; color:#7a7462; }}
  .tags {{ display:flex; gap:0.4rem; flex-wrap:wrap; }}
  .tag {{ font-size:0.7rem; padding:4px 10px; border-radius:12px; background:#fff;
          border:1px solid #d5cdbf; font-weight:600; text-transform:capitalize; color:#2c3227; }}
  .foot-panel-inline {{ width:100%; max-width:400px; margin:0.5rem 0; }}
  .foot-panel-inline img {{ width:100%; height:auto; border-radius:12px; }}
  @media (max-width:700px) {{
    .body {{ grid-template-columns:1fr; }}
    .foot-panel {{ border-right:none; border-bottom:1px solid #d5cdbf; }}
  }}
</style>
</head>
<body>
  {scans_html}
</body>
</html>'''

    with open(out_path, "w") as f:
        f.write(html)
    print(f"  HTML → {out_path}")


# ── Processing functions ─────────────────────────────────────────────────

def process_sole(image_path, out_dir):
    """Full pipeline for one sole image. Returns results dict."""
    slug = Path(image_path).stem
    img = cv2.imread(str(image_path))
    if img is None:
        print(f"ERROR: cannot read {image_path}")
        return None

    print(f"Processing sole: {slug}...")
    mask = segment(img, prompt="foot")

    # Normalize orientation: toes at top, heel-to-2nd-toe vertical alignment
    mask, img, rot_info = normalize_sole_orientation(mask, img)

    m = measure_sole(mask)
    if m is None:
        print(f"  WARNING: could not measure sole for {slug}")
        return None

    # Include rotation info in measurements
    m["rotation_angle"] = rot_info["fine_angle"]

    overlay_file = os.path.join(out_dir, f"{slug}_overlay.png")
    draw_sole_overlay(img, mask, m, overlay_file)

    print(f"  Length={m['foot_length_px']}px  Ball={m['ball_width_px']}px  Heel={m['heel_width_px']}px")
    print(f"  arch_length={m['arch_length_ratio']:.3f} ({m['arch_length_class']})  "
          f"forefoot_width={m['forefoot_width_ratio']:.3f} ({m['forefoot_width_class']})  "
          f"heel_width={m['heel_width_ratio']:.3f} ({m['heel_width_class']})")
    print(f"  toe={m['toe_shape']}  rotation={rot_info['fine_angle']:+.1f}°")

    return {"measurements": m, "overlay_file": f"{slug}_overlay.png"}


def process_side(image_path, out_dir):
    """Full pipeline for one side-view image. Returns results dict."""
    slug = Path(image_path).stem
    img = cv2.imread(str(image_path))
    if img is None:
        print(f"ERROR: cannot read {image_path}")
        return None

    print(f"Processing side: {slug}...")
    mask = segment(img, prompt="foot")

    # Normalize orientation: heel left, toes right, sole leveled
    mask, img, rot_info = normalize_side_orientation(mask, img)

    m = measure_side(mask)
    if m is None:
        print(f"  WARNING: could not measure side for {slug}")
        return None

    m["rotation_angle"] = rot_info["rotation_angle"]

    overlay_file = os.path.join(out_dir, f"{slug}_side_overlay.png")
    draw_side_overlay(img, mask, m, overlay_file)

    print(f"  Span={m['foot_span_px']}px  Instep={m['instep_height_px']}px  HeelDepth={m['heel_depth_px']}px")
    print(f"  instep={m['instep_height_ratio']:.3f} ({m['instep_height_class']})  "
          f"heel_depth={m['heel_depth_ratio']:.3f} ({m['heel_depth_class']})")

    return {"measurements": m, "overlay_file": f"{slug}_side_overlay.png"}


def process_scan(sole_path, side_path=None, out_dir="results"):
    """Process a complete foot scan (sole + optional side view).

    Returns a combined results dict suitable for JSON output and HTML generation.
    """
    os.makedirs(out_dir, exist_ok=True)

    result = {"source": Path(sole_path).stem}

    # Sole view (required)
    sole_result = process_sole(sole_path, out_dir)
    if sole_result:
        result["sole"] = sole_result["measurements"]
        result["sole_overlay_file"] = sole_result["overlay_file"]

    # Side view (optional)
    if side_path:
        side_result = process_side(side_path, out_dir)
        if side_result:
            result["side"] = side_result["measurements"]
            result["side_overlay_file"] = side_result["overlay_file"]

    return result


# ── CLI ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Foot measurement pipeline — sole + side view",
        epilog="Examples:\n"
               "  python3 foot_measure.py sole.jpg\n"
               "  python3 foot_measure.py sole.jpg --side side.jpg\n"
               "  python3 foot_measure.py sole.jpg --side side.jpg --out results/\n",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("sole", help="Path to sole-view image")
    parser.add_argument("--side", help="Path to side-view image (optional)")
    parser.add_argument("--out", default="results", help="Output directory")
    args = parser.parse_args()

    result = process_scan(args.sole, args.side, args.out)

    # Save JSON
    json_path = os.path.join(args.out, "scan_results.json")
    with open(json_path, "w") as f:
        json.dump(result, f, indent=2)
    print(f"\n  JSON → {json_path}")

    # Generate HTML
    html_path = os.path.join(args.out, "scan_results.html")
    generate_html([result], html_path)

    print(f"\nDone.")


if __name__ == "__main__":
    main()
