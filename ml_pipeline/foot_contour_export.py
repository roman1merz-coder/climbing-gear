"""
foot_contour_export.py — Extract normalized foot contour from ML segmentation
for overlay visualization on the result page.

Adds contour extraction to the ML pipeline. For each view (top, side), produces
a list of [x, y] points normalized to [0, 1] relative to the foot's bounding box.

The frontend renders these as SVG polylines overlaid on the average foot template.

IMPORTANT: This runs on the Mac Mini only (needs ONNX + OpenCV). The sandbox
cannot run the ML model due to resource constraints.
"""
import cv2
import numpy as np


def _simplify_contour(pts_norm, n_points):
    """Downsample normalized points to n_points evenly spaced along arc length."""
    if len(pts_norm) <= n_points:
        return pts_norm

    diffs = np.diff(pts_norm, axis=0)
    lengths = np.sqrt((diffs ** 2).sum(axis=1))
    cum_len = np.concatenate([[0], np.cumsum(lengths)])
    total = cum_len[-1]

    if total < 1e-6:
        return pts_norm[:n_points]

    target_dists = np.linspace(0, total, n_points)
    result = np.zeros((n_points, 2))
    for i, d in enumerate(target_dists):
        idx = np.searchsorted(cum_len, d, side="right") - 1
        idx = max(0, min(idx, len(pts_norm) - 2))
        seg_len = cum_len[idx + 1] - cum_len[idx]
        frac = (d - cum_len[idx]) / seg_len if seg_len > 0 else 0
        result[i] = pts_norm[idx] * (1 - frac) + pts_norm[idx + 1] * frac

    return result


def extract_top_contour(foot_mask, n_points=120):
    """Extract normalized contour from the top-view foot mask (already warped).

    Returns dict with:
        contour: [[x, y], ...] — normalized [0,1] coords, outer boundary
        landmarks: {ball_y, ball_left_x, ball_right_x, heel_y, heel_left_x, heel_right_x}
    Or None if extraction fails.
    """
    h, w = foot_mask.shape[:2]

    contours, _ = cv2.findContours(foot_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return None

    cnt = max(contours, key=cv2.contourArea)
    pts = cnt.reshape(-1, 2).astype(float)

    x_min, y_min = pts.min(axis=0)
    x_max, y_max = pts.max(axis=0)
    bw = x_max - x_min
    bh = y_max - y_min
    if bw < 10 or bh < 10:
        return None

    # Normalize to [0, 1]
    norm = np.zeros_like(pts)
    norm[:, 0] = (pts[:, 0] - x_min) / bw
    norm[:, 1] = (pts[:, 1] - y_min) / bh

    # Simplify
    simple = _simplify_contour(norm, n_points)

    # Find landmarks from mask directly
    # Widest row = ball of foot
    mask_filled = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(mask_filled, [cnt], -1, 255, -1)

    max_width = 0
    ball_y_px = int(y_min)
    for row in range(int(y_min), int(y_max)):
        nz = np.where(mask_filled[row, :] > 0)[0]
        if len(nz) > 5:
            row_w = nz[-1] - nz[0]
            if row_w > max_width:
                max_width = row_w
                ball_y_px = row

    # Heel = bottommost row with significant width
    heel_y_px = int(y_max)
    for row in range(int(y_max) - 1, int(y_min), -1):
        nz = np.where(mask_filled[row, :] > 0)[0]
        if len(nz) > 10:
            heel_y_px = row
            break

    # Width at ball
    ball_nz = np.where(mask_filled[ball_y_px, :] > 0)[0]
    ball_left = float(ball_nz[0]) if len(ball_nz) > 0 else x_min
    ball_right = float(ball_nz[-1]) if len(ball_nz) > 0 else x_max

    # Width at heel
    heel_nz = np.where(mask_filled[heel_y_px, :] > 0)[0]
    heel_left = float(heel_nz[0]) if len(heel_nz) > 5 else ball_left
    heel_right = float(heel_nz[-1]) if len(heel_nz) > 5 else ball_right

    return {
        "contour": simple.round(4).tolist(),
        "landmarks": {
            "ball_y": round((ball_y_px - y_min) / bh, 4),
            "ball_left_x": round((ball_left - x_min) / bw, 4),
            "ball_right_x": round((ball_right - x_min) / bw, 4),
            "heel_y": round((heel_y_px - y_min) / bh, 4),
            "heel_left_x": round((heel_left - x_min) / bw, 4),
            "heel_right_x": round((heel_right - x_min) / bw, 4),
        },
    }


def extract_side_contour(foot_mask, sole_y, px_per_mm, n_points=150):
    """Extract normalized side-view contour (profile outline from toe to heel).

    The mask includes foot + ankle + lower leg. We extract the foot outline
    by tracing the upper boundary from toes to the ankle, then following
    the sole (lower boundary) all the way back. The leg portion above the
    ankle is trimmed — specifically, where the upper contour hits near the
    top of the visible mask (< 8% of clip height), we stop tracing upward.

    The contour's x-axis is flipped so that x=0 = heel, x=1 = toes
    (matching the SVG template orientation).

    Returns dict with:
        contour: [[x, y], ...] — normalized [0,1] coords
        stats: {aspect_ratio, foot_span_px, clip_height_px, ...}
    Or None if extraction fails.
    """
    h, w = foot_mask.shape[:2]

    # Find foot horizontal extent in a band near the sole
    band_top = sole_y - int(50 * px_per_mm) if px_per_mm else sole_y - 200
    band_bot = sole_y + 10
    band_mask = foot_mask[max(0, band_top):band_bot, :]
    cols_in_band = np.where(band_mask.max(axis=0) > 0)[0]
    if len(cols_in_band) < 30:
        return None

    toe_col = cols_in_band[0]
    heel_col = cols_in_band[-1]
    foot_span_px = heel_col - toe_col
    if foot_span_px < 50:
        return None

    # Extract upper and lower boundary of the mask for each column
    upper_y = np.full(w, sole_y, dtype=int)
    lower_y = np.full(w, 0, dtype=int)
    for col in range(toe_col, heel_col + 1):
        nz = np.where(foot_mask[:, col] > 0)[0]
        if len(nz) > 0:
            upper_y[col] = nz[0]
            lower_y[col] = nz[-1]

    # Trim the leg: find where the upper contour approaches the image top.
    # Walking from toe to heel, the upper boundary eventually enters the
    # leg (upper_y near 0). We stop at the ankle cutoff — where upper_y
    # drops below 8% of the clip height from the top of the image.
    clip_top_y = 0
    clip_height = sole_y
    ankle_y_threshold = clip_height * 0.08

    ankle_cutoff_col = heel_col  # default: no trimming
    for col in range(toe_col, heel_col + 1):
        if upper_y[col] < ankle_y_threshold:
            ankle_cutoff_col = col
            break

    # Build the contour:
    # 1. Upper edge from toe_col to ankle_cutoff_col (foot surface)
    # 2. Lower edge (sole) from heel_col back to toe_col
    # The polygon closes between the ankle cutoff and the heel via the sole.
    raw_upper = []
    for col in range(toe_col, ankle_cutoff_col + 1):
        raw_upper.append((col, upper_y[col]))

    raw_lower = []
    for col in range(toe_col, heel_col + 1):
        raw_lower.append((col, lower_y[col]))

    # Subsample for efficiency
    step_u = max(1, len(raw_upper) // (n_points // 2))
    step_l = max(1, len(raw_lower) // (n_points // 2))
    upper_s = raw_upper[::step_u]
    lower_s = raw_lower[::step_l]
    if upper_s[-1] != raw_upper[-1]:
        upper_s.append(raw_upper[-1])
    if lower_s[-1] != raw_lower[-1]:
        lower_s.append(raw_lower[-1])

    full = upper_s + list(reversed(lower_s))

    # Compute actual y range for normalization
    all_y_vals = [y for _, y in full]
    min_y = min(all_y_vals)
    max_y = max(all_y_vals)
    y_range = max_y - min_y
    if foot_span_px < 10 or y_range < 10:
        return None

    aspect_ratio = y_range / foot_span_px

    # Normalize to [0,1] and flip x (so x=0=heel, x=1=toes for SVG)
    result = []
    for cx, cy in full:
        nx = max(0.0, min(1.0, (cx - toe_col) / foot_span_px))
        ny = max(0.0, min(1.0, (cy - min_y) / y_range))
        result.append([round(1 - nx, 4), round(ny, 4)])

    return {
        "contour": result,
        "stats": {
            "foot_span_px": int(foot_span_px),
            "clip_height_px": int(y_range),
            "aspect_ratio": round(aspect_ratio, 4),
            "toe_x": int(toe_col),
            "heel_x": int(heel_col),
            "sole_y": int(sole_y),
            "ankle_cutoff_col": int(ankle_cutoff_col),
            "n_points": len(result),
        },
    }
