"""
foot_cv_pipeline_ml.py — ML-enhanced foot measurement pipeline

Uses U2Net-p (4.4MB ONNX model) for background-agnostic foot segmentation,
combined with the existing A4 paper detection for calibration.

The ML model handles: foot vs. any background (dark, light, wood, carpet)
The CV code handles: A4 paper detection (white rectangle) + measurements

Inputs:
  - Top view photo (foot on A4 paper, from directly above)
  - Side view photo (foot on A4 paper, camera at ground level from the side)
  - Heel view photo (foot on A4 paper, camera at ground level from behind)
  - EU shoe size (for absolute foot length)

Outputs:
  - width_ratio  = ball_width_mm / foot_length_mm
  - instep_ratio = instep_height_mm / foot_length_mm
  - arch_ratio   = foot_span_mm / foot_length_mm
  - heel_ratio   = heel_width_mm / ball_width_mm
"""
import cv2
import numpy as np
import onnxruntime as ort
import os
import time

# =============================================================================
# ML SEGMENTATION MODEL
# =============================================================================

MODEL_PATH = os.path.join(os.path.dirname(__file__), "u2netp.onnx")
_session = None

def get_model():
    """Lazy-load the ONNX model (singleton)."""
    global _session
    if _session is None:
        _session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
    return _session

def segment_foot(img):
    """Run ML segmentation to get a foot mask.
    Returns binary mask (uint8, 0/255) at original resolution."""
    session = get_model()
    input_name = session.get_inputs()[0].name
    h, w = img.shape[:2]
    
    # Preprocess: resize to 320x320, normalize
    resized = cv2.resize(img, (320, 320), interpolation=cv2.INTER_LINEAR)
    rgb = resized[:, :, ::-1].astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    normalized = (rgb - mean) / std
    tensor = np.transpose(normalized, (2, 0, 1))[np.newaxis, ...]
    
    # Run inference
    outputs = session.run(None, {input_name: tensor})
    
    # Postprocess: first output, normalize to [0,1], resize back
    mask = outputs[0][0]
    if mask.ndim == 3:
        mask = mask[0]
    mask = (mask - mask.min()) / (mask.max() - mask.min() + 1e-8)
    mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_LINEAR)
    
    # Binary threshold at 0.5
    binary = (mask > 0.5).astype(np.uint8) * 255
    
    # Keep only the largest connected component (removes small artifacts)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return binary
    largest = max(contours, key=cv2.contourArea)
    clean = np.zeros_like(binary)
    cv2.drawContours(clean, [largest], -1, 255, -1)
    
    return clean

# =============================================================================
# A4 PAPER DETECTION (unchanged — detects white rectangle, not affected by background)
# =============================================================================

A4_W_MM = 210.0  # short edge
A4_H_MM = 297.0  # long edge

def order_points(pts):
    """Order 4 points as [top-left, top-right, bottom-right, bottom-left]."""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    d = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(d)]
    rect[3] = pts[np.argmax(d)]
    return rect

def detect_a4_top_view(img):
    """Detect A4 paper in top view using 4-corner homography.
    Returns (warped_image, px_per_mm, transform_matrix) or (None, None, None)."""
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (11, 11), 0)

    best_corners = None
    best_score = 0

    for thresh_val in [140, 160, 180, 200]:
        _, bright_mask = cv2.threshold(blur, thresh_val, 255, cv2.THRESH_BINARY)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
        bright_mask = cv2.morphologyEx(bright_mask, cv2.MORPH_CLOSE, kernel, iterations=3)
        bright_mask = cv2.morphologyEx(bright_mask, cv2.MORPH_OPEN, kernel, iterations=2)

        contours, _ = cv2.findContours(bright_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue

        for cnt in sorted(contours, key=cv2.contourArea, reverse=True)[:3]:
            area = cv2.contourArea(cnt)
            if area < h * w * 0.05 or area > h * w * 0.85:
                continue
            hull = cv2.convexHull(cnt)
            for eps in [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08]:
                peri = cv2.arcLength(hull, True)
                approx = cv2.approxPolyDP(hull, eps * peri, True)
                if len(approx) == 4:
                    corners = order_points(approx.reshape(4, 2).astype("float32"))
                    w1 = np.linalg.norm(corners[0] - corners[1])
                    w2 = np.linalg.norm(corners[3] - corners[2])
                    h1 = np.linalg.norm(corners[0] - corners[3])
                    h2 = np.linalg.norm(corners[1] - corners[2])
                    avg_w = (w1 + w2) / 2
                    avg_h = (h1 + h2) / 2
                    if min(avg_w, avg_h) < 50:
                        continue
                    ratio = max(avg_w, avg_h) / min(avg_w, avg_h)
                    ratio_score = 1.0 / (1.0 + abs(ratio - 1.414))
                    score = ratio_score * (area / (h * w))
                    if score > best_score:
                        best_score = score
                        best_corners = corners

    if best_corners is None:
        return None, None, None

    w1 = np.linalg.norm(best_corners[0] - best_corners[1])
    h1 = np.linalg.norm(best_corners[0] - best_corners[3])

    if w1 > h1:  # landscape
        tw = 800
        th = int(800 * A4_W_MM / A4_H_MM)
        px_per_mm = tw / A4_H_MM
    else:  # portrait
        tw = int(800 * A4_W_MM / A4_H_MM)
        th = 800
        px_per_mm = th / A4_H_MM

    dst = np.array([[0, 0], [tw - 1, 0], [tw - 1, th - 1], [0, th - 1]], dtype="float32")
    M = cv2.getPerspectiveTransform(best_corners, dst)
    warped = cv2.warpPerspective(img, M, (tw, th))

    return warped, px_per_mm, M

def find_paper_region(img):
    """Find paper mask in side/heel view. Returns (mask, sole_y, paper_left, paper_right)."""
    h, w = img.shape[:2]
    blur = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    _, bright = cv2.threshold(blur, 150, 255, cv2.THRESH_BINARY)
    bright[:int(h * 0.35), :] = 0
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
    bright = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, kernel, iterations=3)
    bright = cv2.morphologyEx(bright, cv2.MORPH_OPEN, kernel, iterations=2)

    paper_top = np.full(w, h, dtype=int)
    for col in range(w):
        nz = np.where(bright[:, col] > 0)[0]
        if len(nz) > 0:
            paper_top[col] = nz[0]
    valid = np.where(paper_top < h)[0]
    if len(valid) < 10:
        return None, None, None, None

    sole_y = int(np.percentile(paper_top[valid], 75))
    return bright, sole_y, valid[0], valid[-1]

def detect_a4_side_edge(img):
    """Get px/mm from the A4 front edge in side view (long edge = 297mm)."""
    h, w = img.shape[:2]
    blur = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (11, 11), 0)

    best_edge = None
    best_score = 0

    for thresh_val in [140, 150, 160, 170, 180, 190, 200]:
        _, bright_mask = cv2.threshold(blur, thresh_val, 255, cv2.THRESH_BINARY)
        bright_mask[:int(h * 0.30), :] = 0
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
        bright_mask = cv2.morphologyEx(bright_mask, cv2.MORPH_CLOSE, kernel, iterations=3)
        bright_mask = cv2.morphologyEx(bright_mask, cv2.MORPH_OPEN, kernel, iterations=2)

        contours, _ = cv2.findContours(bright_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue

        for cnt in sorted(contours, key=cv2.contourArea, reverse=True)[:3]:
            if cv2.contourArea(cnt) < h * w * 0.02:
                continue
            hull = cv2.convexHull(cnt).reshape(-1, 2)
            sorted_by_y = hull[np.argsort(hull[:, 1])]
            y_min, y_max = sorted_by_y[0, 1], sorted_by_y[-1, 1]
            y_range = y_max - y_min
            if y_range < 20:
                continue
            bottom_pts = hull[hull[:, 1] > y_max - y_range * 0.25]
            if len(bottom_pts) < 2:
                continue
            left_pt = bottom_pts[np.argmin(bottom_pts[:, 0])]
            right_pt = bottom_pts[np.argmax(bottom_pts[:, 0])]
            length = np.linalg.norm(left_pt - right_pt)
            if length < 100:
                continue
            score = (length / w) * ((left_pt[1] + right_pt[1]) / (2 * h))
            if score > best_score:
                best_score = score
                best_edge = (left_pt.copy(), right_pt.copy(), length, thresh_val)

    if best_edge is None:
        return None
    _, _, length, _ = best_edge
    return length / A4_H_MM  # 297mm long edge


# =============================================================================
# FOOT MEASUREMENTS (now using ML masks)
# =============================================================================

def measure_ball_width_ml(warped_top, px_per_mm):
    """Measure ball-of-foot width from perspective-corrected top view using ML mask."""
    h, w = warped_top.shape[:2]
    
    # Segment the warped image directly (already perspective-corrected)
    foot_mask = segment_foot(warped_top)
    
    # Find the foot contour
    contours, _ = cv2.findContours(foot_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    
    foot = max(contours, key=cv2.contourArea)
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(mask, [foot], -1, 255, -1)
    
    # Find max vertical span (= ball width in the warped top view)
    x, y, bw, bh = cv2.boundingRect(foot)
    max_width = 0
    for col in range(x, x + bw):
        nz = np.where(mask[:, col] > 0)[0]
        if len(nz) > 5:
            width = nz[-1] - nz[0]
            if width > max_width:
                max_width = width
    
    return max_width / px_per_mm


def measure_instep_ml(img, px_per_mm):
    """Measure instep height from side view using ML mask for foot silhouette.
    
    The ML mask includes the foot + ankle + leg as one blob.
    We determine the foot span (toe to heel) by looking at the mask in a band
    ~50mm above the sole — within this band, the leftmost and rightmost mask
    pixels correspond to toe tip and heel back.
    
    Returns (instep_mm, foot_span_mm) or (None, None)."""
    h, w = img.shape[:2]
    
    # Get paper region for sole_y reference
    _, sole_y, paper_left, paper_right = find_paper_region(img)
    if sole_y is None:
        return None, None
    
    # ML segmentation
    foot_mask = segment_foot(img)
    
    # Determine foot span using a band from sole to ~50mm above sole.
    # Within this band, the mask extent = toe to heel (the leg/ankle
    # extends vertically above the foot, not laterally beyond it).
    band_top = sole_y - int(50 * px_per_mm)
    band_bot = sole_y + 10
    band_mask = foot_mask[max(0, band_top):band_bot, :]
    cols_in_band = np.where(band_mask.max(axis=0) > 0)[0]
    if len(cols_in_band) < 30:
        return None, None
    
    toe_col = cols_in_band[0]
    heel_col = cols_in_band[-1]
    foot_span_px = heel_col - toe_col
    
    if foot_span_px < 50:
        return None, None
    
    # Extract top boundary of foot mask for instep measurement
    foot_top = np.full(w, sole_y, dtype=int)
    for col in range(toe_col, heel_col + 1):
        nz = np.where(foot_mask[:, col] > 0)[0]
        if len(nz) > 0:
            foot_top[col] = nz[0]
    
    # Instep zone: 30-55% of foot span from toe
    iz_start = toe_col + int(foot_span_px * 0.30)
    iz_end = toe_col + int(foot_span_px * 0.55)
    
    foot_cols = np.arange(iz_start, iz_end + 1)
    heights = sole_y - foot_top[foot_cols]
    valid = heights[heights > 10]
    
    if len(valid) == 0:
        return None, None
    
    instep_px = int(np.percentile(valid, 85))
    return instep_px / px_per_mm, foot_span_px / px_per_mm


def measure_heel_width_ml(img):
    """Measure heel width using ML mask + row-local px/mm from extrapolated paper edges.
    Returns heel_width_mm or None."""
    h, w = img.shape[:2]
    
    # Paper detection for calibration (unchanged)
    bright, sole_y, paper_left, paper_right = find_paper_region(img)
    if sole_y is None:
        return None
    
    # Fit lines to paper edges below sole for row-local px/mm
    paper_left_edge = np.full(h, -1, dtype=int)
    paper_right_edge = np.full(h, -1, dtype=int)
    for row in range(h):
        row_slice = bright[row, :]
        nz = np.where(row_slice > 0)[0]
        if len(nz) >= 10:
            paper_left_edge[row] = nz[0]
            paper_right_edge[row] = nz[-1]

    fit_rows = np.arange(sole_y, min(h, sole_y + 200))
    fit_rows = fit_rows[(paper_left_edge[fit_rows] >= 0) & (paper_right_edge[fit_rows] >= 0)]
    if len(fit_rows) < 5:
        return None

    poly_left = np.polyfit(fit_rows, paper_left_edge[fit_rows], 1)
    poly_right = np.polyfit(fit_rows, paper_right_edge[fit_rows], 1)
    
    # ML segmentation for the heel
    foot_mask = segment_foot(img)
    
    # Search zone: 5-20mm above sole — this captures the widest part of the
    # heel bulge (calcaneus). The heel is widest just above the sole and
    # narrows toward the ankle.
    pl_sole = int(np.polyval(poly_left, sole_y))
    pr_sole = int(np.polyval(poly_right, sole_y))
    approx_px_mm = (pr_sole - pl_sole) / A4_W_MM
    
    search_top = sole_y - int(20 * approx_px_mm)
    search_bot = sole_y - int(5 * approx_px_mm)
    search_top = max(0, search_top)
    search_bot = min(h, search_bot)
    
    widths_mm = []
    for row in range(search_top, search_bot):
        # Local px/mm from extrapolated paper edges
        pl = int(np.polyval(poly_left, row))
        pr = int(np.polyval(poly_right, row))
        paper_w = pr - pl
        if paper_w < 50:
            continue
        local_px_mm = paper_w / A4_W_MM
        
        # Foot width from ML mask
        nz = np.where(foot_mask[row, :] > 0)[0]
        if len(nz) < 5:
            continue
        # Largest contiguous segment (handles any noise)
        diffs = np.diff(nz)
        splits = np.where(diffs > 10)[0]
        segments = []
        prev = 0
        for sp in splits:
            segments.append(nz[prev:sp + 1])
            prev = sp + 1
        segments.append(nz[prev:])
        largest = max(segments, key=len)
        skin_w = largest[-1] - largest[0]
        if skin_w > 5:
            widths_mm.append(skin_w / local_px_mm)
    
    if not widths_mm:
        return None
    
    return float(np.percentile(widths_mm, 85))


# =============================================================================
# MAIN PIPELINE
# =============================================================================

def measure_foot(top_path, side_path, heel_path, eu_size):
    """Run the complete measurement pipeline.
    Returns dict with all measurements and ratios."""
    results = {}
    timings = {}

    foot_length_mm = (eu_size + 2) * 6.667
    results["foot_length_mm"] = foot_length_mm
    results["eu_size"] = eu_size

    # TOP VIEW
    t0 = time.perf_counter()
    top_img = cv2.imread(top_path)
    warped, px_mm_top, M = detect_a4_top_view(top_img)
    if warped is not None:
        ball_w = measure_ball_width_ml(warped, px_mm_top)
        if ball_w is not None:
            results["ball_width_mm"] = ball_w
            results["width_ratio"] = ball_w / foot_length_mm
    timings["top_view"] = time.perf_counter() - t0

    # SIDE VIEW
    t0 = time.perf_counter()
    side_img = cv2.imread(side_path)
    px_mm_side = detect_a4_side_edge(side_img)
    if px_mm_side is not None:
        instep, span = measure_instep_ml(side_img, px_mm_side)
        if instep is not None:
            results["instep_height_mm"] = instep
            results["instep_ratio"] = instep / foot_length_mm
        if span is not None:
            results["arch_length_mm"] = span
            results["arch_ratio"] = span / foot_length_mm
    timings["side_view"] = time.perf_counter() - t0

    # HEEL VIEW
    t0 = time.perf_counter()
    heel_img = cv2.imread(heel_path)
    heel_w = measure_heel_width_ml(heel_img)
    if heel_w is not None:
        results["heel_width_mm"] = heel_w
        if "ball_width_mm" in results:
            results["heel_ratio"] = heel_w / results["ball_width_mm"]
    timings["heel_view"] = time.perf_counter() - t0

    results["timings"] = timings
    return results


# =============================================================================
# DEBUG VISUALIZATION
# =============================================================================

def save_debug_images(top_path, side_path, heel_path, eu_size, output_dir):
    """Run pipeline and save debug visualizations."""
    os.makedirs(output_dir, exist_ok=True)
    
    # Top view
    top_img = cv2.imread(top_path)
    warped, px_mm_top, M = detect_a4_top_view(top_img)
    if warped is not None:
        mask = segment_foot(warped)
        overlay = warped.copy()
        overlay[mask > 0] = (overlay[mask > 0] * 0.6 + np.array([0, 180, 0]) * 0.4).astype(np.uint8)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(overlay, contours, -1, (0, 0, 255), 2)
        cv2.imwrite(os.path.join(output_dir, "debug_top_ml.png"), overlay)
    
    # Side view
    side_img = cv2.imread(side_path)
    mask = segment_foot(side_img)
    overlay = side_img.copy()
    overlay[mask > 0] = (overlay[mask > 0] * 0.6 + np.array([0, 180, 0]) * 0.4).astype(np.uint8)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(overlay, contours, -1, (0, 0, 255), 2)
    cv2.imwrite(os.path.join(output_dir, "debug_side_ml.png"), overlay)
    
    # Heel view
    heel_img = cv2.imread(heel_path)
    mask = segment_foot(heel_img)
    overlay = heel_img.copy()
    overlay[mask > 0] = (overlay[mask > 0] * 0.6 + np.array([0, 180, 0]) * 0.4).astype(np.uint8)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(overlay, contours, -1, (0, 0, 255), 2)
    cv2.imwrite(os.path.join(output_dir, "debug_heel_ml.png"), overlay)


# =============================================================================
# TEST
# =============================================================================
if __name__ == "__main__":
    TOP = "/home/user/workspace/20260302_215710.jpg"
    SIDE = "/home/user/workspace/20260302_215721-2.jpg"
    HEEL = "/home/user/workspace/20260302_215727-3.jpg"
    EU = 45
    
    print("Running ML-enhanced pipeline...")
    r = measure_foot(TOP, SIDE, HEEL, eu_size=EU)

    print("\n" + "=" * 60)
    print("  RESULTS (ML-enhanced)")
    print("=" * 60)
    for k, v in r.items():
        if k == "timings":
            print(f"\n  Timing:")
            for tk, tv in v.items():
                print(f"    {tk:15s} = {tv*1000:.0f} ms")
        elif isinstance(v, float):
            print(f"  {k:20s} = {v:.3f}")
        else:
            print(f"  {k:20s} = {v}")

    print("\n  --- Expected ranges ---")
    print(f"  width_ratio:  0.37-0.42 (normal foot)")
    print(f"  instep_ratio: 0.18-0.24 (normal instep)")
    print(f"  arch_ratio:   0.75-0.90")
    print(f"  heel_ratio:   0.55-0.70")
    
    # Save debug images
    DEBUG_DIR = "/home/user/workspace/ml_debug"
    save_debug_images(TOP, SIDE, HEEL, EU, DEBUG_DIR)
    print(f"\n  Debug images saved to: {DEBUG_DIR}")
