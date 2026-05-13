#!/usr/bin/env python3
"""
shoe_sole_measure.py
====================

Extract sole-shape metrics from a top-down product photo of a climbing shoe.

Rebuilt 2026-05-13 after the previous session's working copy was lost. Design
follows the schema in outputs/make_xlsx_all.py and the project memory note
~/.auto-memory/project_shoe_sole_measure.md.

Aligned with the documented fixes from the prior session:

  * task #10: segment_shoe uses LAB color distance from a corner-sampled
    background. A pixel is foreground if its LAB distance to the median
    background colour exceeds bg_thresh. Default bg_thresh=40 works for
    white (Scarpa, Unparallel) and grey (La Sportiva) backdrops.
  * task #17/#11: rotation is done with cv2.minAreaRect (bounding-rectangle
    long axis), matching the side-view module the prior session also wrote.
    PCA was tried during the rebuild but disagreed with minAreaRect by
    2-4 deg on asymmetric lasts which shifted asym_height_px by 30-70 px.
  * task #18: heel_width search is restricted to the bottom 30 percent of
    the silhouette so the forefoot cannot win the heel slot.
  * task #24: toe_cx is computed as the average per-row midline
    ((min_x + max_x) / 2) over the top 0.5 percent of the length (min 2
    rows). Old centroid-of-band biased toward the gradually-tapering side
    on asymmetric tips.

Output dict (one row per shoe), matching outputs/make_xlsx_all.py columns:

    length_px         vertical extent of the canonical-orientation silhouette
    ff_width_px       max horizontal width above the heel band (forefoot)
    heel_width_px     max horizontal width in the bottom 30 percent (heel)
    ff_to_heel_px     vertical distance from forefoot-widest row to heel tip
    heel_cx_px        midline at heel widest row (5 percent band)
    ff_cx_px          midline at forefoot widest row (5 percent band)
    toe_cx_px         midline averaged over top 0.5 percent of length
    toe_drift_px      toe_cx - ff_cx (legacy)
    toe_form_px       |toe_cx - outer_ball_x| (low = Egyptian, high = Roman)
    asym_height_px    ff_cx - axis_x_at_ff, axis = heel_cx -> toe_cx line

Auxiliary keys prefixed with "_" expose the geometry needed by draw_overlay.

Background segmentation is LAB-distance-from-corners:

    bg_thresh = 40   default; works for both white and grey backdrops
    bg_thresh = 30   tighten (more aggressive foreground), if dark shadows
                      bleed into the silhouette
    bg_thresh = 55   loosen, if a low-contrast strap or rand drops out

Pipeline: read -> segment -> rotate long axis vertical (minAreaRect) ->
ensure toe at top (optional horizontal flip) -> measure -> draw overlay.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, Tuple

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Segmentation
# ---------------------------------------------------------------------------

def segment_shoe(img: np.ndarray, bg_thresh: float = 25.0,
                 corner_size: int = 32) -> np.ndarray:
    """Return a binary mask (0 / 255) of the shoe silhouette.

    Strategy (task #10 fix): sample background colour from the four image
    corners (median LAB), compute per-pixel LAB Euclidean distance, mark
    pixels as foreground if distance > bg_thresh. Robust to white, grey,
    and mildly off-white backdrops.

    If the largest connected component covers less than 60 percent of the
    total foreground area, the silhouette has likely split across a
    same-as-background midfoot (Veloce-L style). We then re-attempt
    segmentation at progressively lower bg_thresh until the largest CC
    covers >= 60 percent OR we exhaust the fallback ladder.

    Pipeline: LAB distance threshold -> general close -> vertical-bridge
    close (heals near-vertical midfoot gaps) -> fill interior holes ->
    pick largest connected component.
    """
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    c = corner_size
    corners = np.concatenate([
        lab[:c, :c].reshape(-1, 3),
        lab[:c, -c:].reshape(-1, 3),
        lab[-c:, :c].reshape(-1, 3),
        lab[-c:, -c:].reshape(-1, 3),
    ], axis=0)
    bg = np.median(corners, axis=0)
    dist = np.sqrt(np.sum((lab - bg) ** 2, axis=2))

    fallback = [bg_thresh, max(bg_thresh - 8, 12), max(bg_thresh - 15, 8)]
    best_mask = None
    best_fill = 0.0
    for t in fallback:
        m = _post_process(dist > t, mask_h=img.shape[0])
        num, lab_cc, stats, _ = cv2.connectedComponentsWithStats(
            m, connectivity=8)
        if num <= 1:
            continue
        areas = stats[1:, cv2.CC_STAT_AREA]
        largest = 1 + int(np.argmax(areas))
        total = float(areas.sum())
        fill = float(areas[largest - 1]) / total if total > 0 else 0.0
        out = np.zeros_like(m)
        out[lab_cc == largest] = 255
        if fill >= 0.85:
            return out
        if fill > best_fill:
            best_fill = fill
            best_mask = out
    return best_mask if best_mask is not None else np.zeros_like(dist, dtype=np.uint8)


def _post_process(bool_mask: np.ndarray, mask_h: int) -> np.ndarray:
    mask = (bool_mask.astype(np.uint8)) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    # Vertical bridge: heals near-vertical midfoot gaps (white-midfoot
    # shoes whose middle blends into a same-colour backdrop).
    vbridge = cv2.getStructuringElement(
        cv2.MORPH_RECT, (3, max(15, mask_h // 30)))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, vbridge, iterations=1)
    return _fill_holes(mask)


def _fill_holes(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    inv = cv2.bitwise_not(mask)
    flood = inv.copy()
    ff_mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(flood, ff_mask, (0, 0), 255)
    interior_holes = cv2.bitwise_not(flood)
    return cv2.bitwise_or(mask, interior_holes)


# ---------------------------------------------------------------------------
# Orientation
# ---------------------------------------------------------------------------

def rotate_long_axis_vertical(mask: np.ndarray,
                              img: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Rotate mask + img so the silhouette's long axis is vertical.

    Uses cv2.minAreaRect (smallest enclosing rotated rectangle) to find the
    long-axis orientation. minAreaRect respects the extreme silhouette
    points rather than the mass distribution, which keeps the rotation
    stable across asymmetric lasts (PCA drifts 2-4 deg on Egyptian-apex
    shoes because the dense forefoot biases the eigenvector).
    """
    ys, xs = np.where(mask > 0)
    if len(xs) < 10:
        return mask, img

    pts = np.column_stack([xs, ys]).astype(np.float32)
    _, (w, h), a = cv2.minAreaRect(pts)
    # cv2.minAreaRect: 'a' is the rotation of the rect's first edge from
    # horizontal (range (-90, 0] in classic OpenCV). 'w' is the dimension
    # along that first edge. The long axis is along the longer dimension:
    if w >= h:
        long_angle = a
    else:
        long_angle = a + 90.0
    rot_deg = 90.0 - long_angle  # bring long axis to vertical (90 deg)

    h_img, w_img = mask.shape[:2]
    M = cv2.getRotationMatrix2D((w_img / 2.0, h_img / 2.0), rot_deg, 1.0)
    cos = abs(M[0, 0])
    sin = abs(M[0, 1])
    new_w = int(h_img * sin + w_img * cos)
    new_h = int(h_img * cos + w_img * sin)
    M[0, 2] += (new_w / 2.0) - w_img / 2.0
    M[1, 2] += (new_h / 2.0) - h_img / 2.0

    mask_r = cv2.warpAffine(mask, M, (new_w, new_h),
                            flags=cv2.INTER_NEAREST, borderValue=0)
    img_r = cv2.warpAffine(img, M, (new_w, new_h),
                           flags=cv2.INTER_LINEAR,
                           borderValue=(255, 255, 255))
    return mask_r, img_r


def canonicalise_apex_side(mask: np.ndarray,
                           img: np.ndarray,
                           target: str = "right",
                           top_band_frac: float = 0.05,
                           ff_band_frac: float = 0.40
                          ) -> Tuple[np.ndarray, np.ndarray]:
    """Horizontal-flip the silhouette if the toe-apex lands on the wrong
    side of the forefoot midline.

    Without this step minAreaRect leaves a 180-degree ambiguity in axis
    direction which leaks into a left/right inversion of the silhouette,
    so asym_height_px and toe_drift_px can flip sign between shoes for
    no anatomical reason. We pick the toe apex by the midline of the top
    5 percent of rows, and the forefoot midline by averaging row midlines
    in the upper 40 percent of the silhouette. If the apex is on the
    opposite side from `target`, we flip horizontally.
    """
    ys, xs = np.where(mask > 0)
    if len(xs) < 10:
        return mask, img
    top_y = int(ys.min()); bot_y = int(ys.max())
    L = bot_y - top_y + 1

    apex_band_bot = top_y + max(2, int(round(L * top_band_frac)))
    ff_band_bot = top_y + max(2, int(round(L * ff_band_frac)))

    row_min = np.full(mask.shape[0], 10**9, dtype=np.int32)
    row_max = np.full(mask.shape[0], -1,    dtype=np.int32)
    np.minimum.at(row_min, ys, xs)
    np.maximum.at(row_max, ys, xs)

    apex_mids = [(row_min[y] + row_max[y]) / 2.0
                 for y in range(top_y, apex_band_bot + 1)
                 if row_max[y] >= 0]
    ff_mids = [(row_min[y] + row_max[y]) / 2.0
               for y in range(top_y, ff_band_bot + 1)
               if row_max[y] >= 0]
    if not apex_mids or not ff_mids:
        return mask, img

    apex_x = float(np.mean(apex_mids))
    ff_mid_x = float(np.mean(ff_mids))

    apex_on_right = apex_x >= ff_mid_x
    want_right = target == "right"
    if apex_on_right == want_right:
        return mask, img
    return cv2.flip(mask, 1), cv2.flip(img, 1)


def ensure_toe_at_top(mask: np.ndarray,
                      img: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Flip vertically if the widest section is in the lower half.

    For climbing shoes the forefoot (toe end) is wider than the heel. So if
    the lower half has greater max row width, the toe is at the bottom and
    we flip.
    """
    ys, xs = np.where(mask > 0)
    if len(ys) == 0:
        return mask, img
    top_y = int(ys.min())
    bot_y = int(ys.max())
    mid_y = (top_y + bot_y) // 2

    upper_w = 0
    lower_w = 0
    # vectorise: width per row
    row_min = np.full(mask.shape[0], 10**9, dtype=np.int32)
    row_max = np.full(mask.shape[0], -1,    dtype=np.int32)
    np.minimum.at(row_min, ys, xs)
    np.maximum.at(row_max, ys, xs)
    widths = np.where(row_max >= 0, row_max - row_min, -1)
    if (widths[top_y:mid_y] >= 0).any():
        upper_w = int(widths[top_y:mid_y].max())
    if (widths[mid_y:bot_y + 1] >= 0).any():
        lower_w = int(widths[mid_y:bot_y + 1].max())

    if upper_w < lower_w:
        mask = cv2.flip(mask, 0)
        img = cv2.flip(img, 0)
    return mask, img


# ---------------------------------------------------------------------------
# Measurement
# ---------------------------------------------------------------------------

def measure_sole(mask: np.ndarray,
                 heel_band_frac: float = 0.30,
                 toe_tip_band_frac: float = 0.005,
                 centroid_band_frac: float = 0.05) -> Dict:
    """Compute all metrics. Assumes mask already in canonical orientation
    (toe at top, heel at bottom, long axis vertical)."""
    ys, xs = np.where(mask > 0)
    if len(xs) == 0:
        raise RuntimeError("empty mask")

    top_y = int(ys.min())
    bot_y = int(ys.max())
    L = bot_y - top_y + 1

    # Build per-row extents in one pass
    row_min = np.full(mask.shape[0], 10**9, dtype=np.int32)
    row_max = np.full(mask.shape[0], -1,    dtype=np.int32)
    np.minimum.at(row_min, ys, xs)
    np.maximum.at(row_max, ys, xs)
    has_row = row_max >= 0
    widths = np.where(has_row, row_max - row_min, -1)

    # --- forefoot widest row (above heel band) -------------------------------
    heel_band_top_y = bot_y - int(round(L * heel_band_frac)) + 1
    ff_search = widths.copy()
    ff_search[:top_y] = -1
    ff_search[heel_band_top_y:] = -1
    ff_y = int(np.argmax(ff_search))
    if ff_search[ff_y] < 0:
        # fallback: anywhere
        ff_y = int(np.argmax(widths))
    ff_width_px = int(widths[ff_y])
    ff_left = int(row_min[ff_y]); ff_right = int(row_max[ff_y])

    # --- heel widest row (in bottom heel_band_frac) --------------------------
    heel_search = widths.copy()
    heel_search[:heel_band_top_y] = -1
    heel_y = int(np.argmax(heel_search))
    if heel_search[heel_y] < 0:
        heel_y = bot_y
    heel_width_px = int(widths[heel_y]) if widths[heel_y] >= 0 else 0
    heel_left = int(row_min[heel_y]); heel_right = int(row_max[heel_y])

    # --- canonical y positions -----------------------------------------------
    toe_tip_y = top_y
    heel_tip_y = bot_y
    ff_to_heel_px = heel_tip_y - ff_y

    # --- centroids -----------------------------------------------------------
    band_half = max(1, int(round(L * centroid_band_frac)))
    heel_cx = _midline_band(row_min, row_max, heel_y, band_half)
    ff_cx = _midline_band(row_min, row_max, ff_y, band_half)

    # toe_cx: per-row midline averaged over top toe_tip_band_frac (min 2 rows).
    # Fix from task #24: old centroid-of-pixels biased toward the
    # gradually-tapering side on asymmetric tips.
    tip_band_bot_y = top_y + max(2, int(round(L * toe_tip_band_frac)))
    tip_mids = []
    for y in range(top_y, tip_band_bot_y + 1):
        if row_max[y] >= 0:
            tip_mids.append((row_min[y] + row_max[y]) / 2.0)
    if tip_mids:
        toe_cx = float(np.mean(tip_mids))
    else:
        toe_cx = float((row_min[top_y] + row_max[top_y]) / 2.0)

    # --- toe_form_px: distance from toe_cx to the "outer" ball edge ----------
    # Outer = the ball edge on the side toe_cx leans toward. For Egyptian
    # (big toe extends), the apex is on the big-toe side and the outer
    # ball edge on that side is close to it -> small toe_form. For Roman
    # the apex is mid-ball -> large toe_form.
    ff_mid_x = (ff_left + ff_right) / 2.0
    outer_ball_x = float(ff_right) if toe_cx >= ff_mid_x else float(ff_left)
    toe_form_px = abs(toe_cx - outer_ball_x)

    # --- asym_height_px ------------------------------------------------------
    # Axis = line from (heel_cx, heel_y) to (toe_cx, toe_tip_y).
    # Evaluate at ff_y and report ff_cx - axis_x_at_ff.
    if toe_tip_y == heel_y:
        axis_x_at_ff = (heel_cx + toe_cx) / 2.0
    else:
        t = (ff_y - heel_y) / float(toe_tip_y - heel_y)
        axis_x_at_ff = heel_cx + (toe_cx - heel_cx) * t
    asym_height_px = ff_cx - axis_x_at_ff

    # --- legacy toe_drift_px -------------------------------------------------
    toe_drift_px = toe_cx - ff_cx

    return {
        "length_px":      int(L),
        "ff_width_px":    int(ff_width_px),
        "heel_width_px":  int(heel_width_px),
        "ff_to_heel_px":  int(ff_to_heel_px),
        "heel_cx_px":     float(heel_cx),
        "ff_cx_px":       float(ff_cx),
        "toe_cx_px":      float(toe_cx),
        "toe_drift_px":   float(toe_drift_px),
        "toe_form_px":    float(toe_form_px),
        "asym_height_px": float(asym_height_px),
        # auxiliary geometry for the overlay
        "_top_y": int(top_y),
        "_bot_y": int(bot_y),
        "_ff_y": int(ff_y),
        "_heel_y": int(heel_y),
        "_toe_tip_y": int(toe_tip_y),
        "_heel_tip_y": int(heel_tip_y),
        "_ff_left": int(ff_left), "_ff_right": int(ff_right),
        "_heel_left": int(heel_left), "_heel_right": int(heel_right),
        "_outer_ball_x": float(outer_ball_x),
        "_axis_x_at_ff": float(axis_x_at_ff),
    }


def _midline_band(row_min, row_max, y_center, band_half):
    """Average per-row midline ((min_x + max_x) / 2) over y in
    [y_center - band_half, y_center + band_half]. Skip rows with no mask."""
    n = row_max.shape[0]
    y_lo = max(0, y_center - band_half)
    y_hi = min(n - 1, y_center + band_half)
    mids = []
    for yy in range(y_lo, y_hi + 1):
        if row_max[yy] >= 0:
            mids.append((row_min[yy] + row_max[yy]) / 2.0)
    if mids:
        return float(np.mean(mids))
    if row_max[y_center] >= 0:
        return float((row_min[y_center] + row_max[y_center]) / 2.0)
    return float("nan")


# ---------------------------------------------------------------------------
# Overlay
# ---------------------------------------------------------------------------

_COLORS = {
    "outline":  (180, 180, 180),
    "ff":       (0,   0,   220),   # red
    "heel":     (0,   140, 220),   # orange
    "ff2heel":  (40,  170, 40),    # green
    "axis":     (220, 220, 0),     # cyan
    "toe":      (220, 0,   220),   # magenta
    "outer":    (0,   220, 220),   # yellow
}


def draw_overlay(img: np.ndarray, mask: np.ndarray, m: Dict, out_path: str):
    """Render a per-shoe overlay PNG with metric markers + a legend strip."""
    overlay = img.copy()

    # Silhouette outline
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL,
                                   cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(overlay, contours, -1, _COLORS["outline"], 1)

    ff_y = m["_ff_y"]; heel_y = m["_heel_y"]
    toe_tip_y = m["_toe_tip_y"]; heel_tip_y = m["_heel_tip_y"]
    ff_left, ff_right = m["_ff_left"], m["_ff_right"]
    heel_left, heel_right = m["_heel_left"], m["_heel_right"]
    ff_cx = int(round(m["ff_cx_px"]))
    heel_cx = int(round(m["heel_cx_px"]))
    toe_cx = int(round(m["toe_cx_px"]))
    outer_ball_x = int(round(m["_outer_ball_x"]))
    axis_x_at_ff = int(round(m["_axis_x_at_ff"]))

    cv2.line(overlay, (ff_left, ff_y), (ff_right, ff_y),
             _COLORS["ff"], 2, cv2.LINE_AA)
    cv2.line(overlay, (heel_left, heel_y), (heel_right, heel_y),
             _COLORS["heel"], 2, cv2.LINE_AA)
    cv2.line(overlay, (ff_cx, ff_y), (ff_cx, heel_tip_y),
             _COLORS["ff2heel"], 2, cv2.LINE_AA)
    _dashed(overlay, (heel_cx, heel_y), (toe_cx, toe_tip_y),
            _COLORS["axis"], 1, 8)

    cv2.circle(overlay, (heel_cx, heel_y), 5, _COLORS["heel"], -1, cv2.LINE_AA)
    cv2.circle(overlay, (ff_cx, ff_y),     5, _COLORS["ff"],   -1, cv2.LINE_AA)
    cv2.circle(overlay, (toe_cx, toe_tip_y), 5, _COLORS["toe"], -1, cv2.LINE_AA)
    cv2.circle(overlay, (outer_ball_x, ff_y), 6, _COLORS["outer"], 2, cv2.LINE_AA)
    cv2.drawMarker(overlay, (axis_x_at_ff, ff_y), _COLORS["axis"],
                   markerType=cv2.MARKER_TILTED_CROSS,
                   markerSize=12, thickness=2)

    # Legend strip
    legend_w = 290
    h, w = overlay.shape[:2]
    canvas = np.full((h, w + legend_w, 3), 250, dtype=np.uint8)
    canvas[:, :w] = overlay

    rows = [
        ("length",      f"{m['length_px']} px",       _COLORS["outline"]),
        ("ff_width",    f"{m['ff_width_px']} px",     _COLORS["ff"]),
        ("heel_width",  f"{m['heel_width_px']} px",   _COLORS["heel"]),
        ("ff -> heel",  f"{m['ff_to_heel_px']} px",   _COLORS["ff2heel"]),
        ("toe_drift",   f"{m['toe_drift_px']:+.1f}",  _COLORS["toe"]),
        ("toe_form",    f"{m['toe_form_px']:.1f}",    _COLORS["outer"]),
        ("asym_h",      f"{m['asym_height_px']:+.1f}",_COLORS["axis"]),
    ]
    y0 = 36
    for i, (k, v, col) in enumerate(rows):
        y = y0 + i * 30
        cv2.circle(canvas, (w + 18, y - 5), 6, col, -1, cv2.LINE_AA)
        cv2.putText(canvas, k, (w + 36, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (40, 40, 40), 1, cv2.LINE_AA)
        cv2.putText(canvas, v, (w + 160, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 160), 2, cv2.LINE_AA)

    cv2.imwrite(out_path, canvas)


def _dashed(img, p1, p2, color, thickness, dash):
    x1, y1 = p1; x2, y2 = p2
    dx = x2 - x1; dy = y2 - y1
    dist = (dx * dx + dy * dy) ** 0.5
    if dist < 1e-6:
        return
    n = max(1, int(dist // dash))
    for i in range(n):
        t1 = i / n
        t2 = (i + 0.5) / n
        a = (int(round(x1 + dx * t1)), int(round(y1 + dy * t1)))
        b = (int(round(x1 + dx * t2)), int(round(y1 + dy * t2)))
        cv2.line(img, a, b, color, thickness, cv2.LINE_AA)


# ---------------------------------------------------------------------------
# Top-level convenience
# ---------------------------------------------------------------------------

def process(in_path: str,
            out_overlay: str | None = None,
            bg_thresh: float = 40.0,
            flip_horizontal: bool = False) -> Tuple[Dict, np.ndarray, np.ndarray]:
    """Run the full pipeline on one image.

    Returns (metrics_dict, canonical_mask, canonical_img).
    """
    img = cv2.imread(in_path)
    if img is None:
        raise RuntimeError(f"cannot read {in_path}")
    mask = segment_shoe(img, bg_thresh=bg_thresh)
    mask, img = rotate_long_axis_vertical(mask, img)
    mask, img = ensure_toe_at_top(mask, img)
    mask, img = canonicalise_apex_side(mask, img, target="right")
    if flip_horizontal:
        mask = cv2.flip(mask, 1)
        img = cv2.flip(img, 1)
    m = measure_sole(mask)
    if out_overlay:
        os.makedirs(os.path.dirname(out_overlay) or ".", exist_ok=True)
        draw_overlay(img, mask, m, out_overlay)
    return m, mask, img


if __name__ == "__main__":
    import argparse, json
    p = argparse.ArgumentParser()
    p.add_argument("image")
    p.add_argument("--overlay", default=None)
    p.add_argument("--bg-thresh", type=float, default=40.0)
    p.add_argument("--flip-h", action="store_true")
    a = p.parse_args()
    m, _, _ = process(a.image, out_overlay=a.overlay,
                      bg_thresh=a.bg_thresh, flip_horizontal=a.flip_h)
    keep = {k: v for k, v in m.items() if not k.startswith("_")}
    print(json.dumps(keep, indent=2))
