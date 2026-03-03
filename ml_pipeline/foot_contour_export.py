"""
foot_contour_export.py — Extract normalized foot contour from ML segmentation
for overlay visualization on the result page.

Adds contour extraction to the ML pipeline. For each view (top, side), produces
a list of [x, y] points normalized to [0, 1] relative to the foot's bounding box.

The frontend renders these as SVG polylines overlaid on the average foot template.

═══ ORIENTATION CONTRACT ═══

TOP VIEW:
  ML mask: horizontal foot, toes LEFT (small x), heel RIGHT (large x),
           big toe at BOTTOM (large y), lateral toes at TOP (small y).
  Output:  x=0 LEFT (medial/big toe), x=1 RIGHT (lateral),
           y=0 TOP (toes), y=1 BOTTOM (heel).
  This is achieved by: new_x = 1 - norm_y, new_y = norm_x

SIDE VIEW:
  ML mask: toes LEFT (small x), heel RIGHT (large x),
           top at TOP (small y), sole at BOTTOM (large y).
  Output:  x=0 toes (LEFT), x=1 heel (RIGHT),
           y=0 top, y=1 sole.
  NO flip — mask orientation matches the standard model reference.
  The SVG template is mirrored in the frontend with scale(-1,1).

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


def extract_top_contour(foot_mask, n_points=150):
    """Extract normalized contour from the top-view foot mask.

    The mask has: toes LEFT (small x), heel RIGHT (large x),
    big toe at BOTTOM (large y), lateral at TOP (small y).

    Output contour is rotated to match the SVG template:
        x=0 LEFT (medial/big toe), x=1 RIGHT (lateral)
        y=0 TOP (toes), y=1 BOTTOM (heel)

    Returns dict with:
        contour: [[x, y], ...] — normalized [0,1] coords
        stats: {n_points, mask_w, mask_h}
    Or None if extraction fails.
    """
    h, w = foot_mask.shape[:2]

    # Binarize if not already
    if foot_mask.max() > 1:
        mask_bin = (foot_mask > 127).astype(np.uint8)
    else:
        mask_bin = foot_mask.astype(np.uint8)

    rows = np.where(mask_bin.any(axis=1))[0]
    cols = np.where(mask_bin.any(axis=0))[0]
    if len(rows) < 10 or len(cols) < 10:
        return None

    y_min, y_max = rows[0], rows[-1]
    x_min, x_max = cols[0], cols[-1]
    bw = x_max - x_min
    bh = y_max - y_min
    if bw < 10 or bh < 10:
        return None

    # Extract boundary by column scanning
    upper = []  # small y = lateral side
    lower = []  # large y = medial/big toe side

    for col in range(x_min, x_max + 1):
        col_data = mask_bin[:, col]
        whites = np.where(col_data > 0)[0]
        if len(whites) > 0:
            upper.append((col, whites[0]))
            lower.append((col, whites[-1]))

    # Build closed contour: upper (toe→heel) + lower reversed (heel→toe)
    step = max(1, len(upper) // (n_points // 2))
    upper_s = upper[::step]
    lower_s = lower[::step]
    if upper_s[-1] != upper[-1]:
        upper_s.append(upper[-1])
    if lower_s[-1] != lower[-1]:
        lower_s.append(lower[-1])

    full = upper_s + list(reversed(lower_s))

    # Normalize to bounding box [0,1]
    norm = []
    for (cx, cy) in full:
        nx = (cx - x_min) / bw   # 0=toes(left), 1=heel(right)
        ny = (cy - y_min) / bh   # 0=lateral(top), 1=medial(bottom)
        norm.append((nx, ny))

    # Rotate to match SVG template orientation:
    # new_x = 1 - norm_y  → medial(large ny) becomes LEFT (small x)
    # new_y = norm_x       → toes(small nx) becomes TOP (small y)
    rotated = [[round(1 - ny, 4), round(nx, 4)] for (nx, ny) in norm]

    return {
        "contour": rotated,
        "stats": {
            "n_points": len(rotated),
            "mask_w": int(w),
            "mask_h": int(h),
        },
    }


def extract_side_contour(foot_mask, sole_y, px_per_mm, n_points=220):
    """Extract normalized side-view contour (profile outline from toe to heel).

    The mask includes foot + ankle + lower leg. We extract the foot outline
    by tracing the upper boundary from toes to the ankle, then following
    the sole (lower boundary) all the way back. The leg portion above the
    ankle is trimmed — specifically, where the upper contour hits near the
    top of the visible mask (< 8% of clip height), we stop tracing upward.

    Output contour:
        x=0 = toes (LEFT), x=1 = heel (RIGHT)
        y=0 = top, y=1 = sole
    This matches the standard model (toes LEFT, heel RIGHT).
    The SVG template is mirrored in the frontend — do NOT flip here.

    Returns dict with:
        contour: [[x, y], ...] — normalized [0,1] coords
        stats: {aspect_ratio, foot_span_px, clip_height_px, ...}
    Or None if extraction fails.
    """
    h, w = foot_mask.shape[:2]

    # Binarize if not already
    if foot_mask.max() > 1:
        mask_bin = (foot_mask > 127).astype(np.uint8)
    else:
        mask_bin = foot_mask.astype(np.uint8)

    # Find foot horizontal extent in a band near the sole
    band_top = sole_y - int(50 * px_per_mm) if px_per_mm else sole_y - 200
    band_bot = sole_y + 10
    band_mask = mask_bin[max(0, band_top):band_bot, :]
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
        nz = np.where(mask_bin[:, col] > 0)[0]
        if len(nz) > 0:
            upper_y[col] = nz[0]
            lower_y[col] = nz[-1]

    # Trim the leg: find where the upper contour approaches the image top.
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
    raw_upper = [(c, upper_y[c]) for c in range(toe_col, ankle_cutoff_col + 1)]
    raw_lower = [(c, lower_y[c]) for c in range(toe_col, heel_col + 1)]

    # Subsample
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

    # Normalize to [0,1] — NO x-flip!
    # x=0 = toes (left), x=1 = heel (right)
    # y=0 = top, y=1 = sole
    result = []
    for cx, cy in full:
        nx = max(0.0, min(1.0, (cx - toe_col) / foot_span_px))
        ny = max(0.0, min(1.0, (cy - min_y) / y_range))
        result.append([round(nx, 4), round(ny, 4)])

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
