#!/usr/bin/env python3
"""
shoe_sole_measure.py
====================

Extract sole-shape metrics from a top-down product photo of a climbing shoe.

Rebuilt 2026-05-13 after the previous session's working copy was lost. Design
follows the schema in outputs/make_xlsx_all.py and the project memory note
~/.auto-memory/project_shoe_sole_measure.md. Includes the two fixes from the
prior session (task #18 + task #24):

  * heel_width search is restricted to the bottom 30 percent of the silhouette
    so the forefoot cannot win the heel slot,
  * toe_cx is computed as the average per-row midline ((min_x + max_x) / 2)
    over the top 0.5 percent of the length (min 2 rows). Old centroid-of-band
    biased toward the gradually-tapering side on asymmetric tips.

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

Background segmentation is grayscale-threshold based:

    bg_thresh = 240  white backgrounds (Scarpa F, Unparallel E)
    bg_thresh = 180  grey backgrounds  (La Sportiva 2)

Pipeline: read -> segment -> rotate long axis vertical -> ensure toe at top
(optional horizontal flip) -> measure -> draw overlay.
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

def segment_shoe(img: np.ndarray, bg_thresh: int = 240) -> np.ndarray:
    """Return a binary mask (0 / 255) of the shoe silhouette.

    Strategy: grayscale threshold (pixels brighter than bg_thresh are
    background), morphological close to bridge small interior gaps, fill
    interior holes via flood-fill, then keep only the largest connected
    component.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mask = (gray < bg_thresh).astype(np.uint8) * 255

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = _fill_holes(mask)

    num, lab, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if num <= 1:
        return mask
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    out = np.zeros_like(mask)
    out[lab == largest] = 255
    return out


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

    Uses PCA on the foreground pixel coordinates: the dominant eigenvector
    gives the long-axis direction; rotate so it aligns with the y-axis.
    """
    ys, xs = np.where(mask > 0)
    if len(xs) < 10:
        return mask, img

    pts = np.column_stack([xs.astype(np.float32), ys.astype(np.float32)])
    mean = np.mean(pts, axis=0)
    centered = pts - mean
    cov = np.cov(centered.T)
    eigvals, eigvecs = np.linalg.eigh(cov)
    long_vec = eigvecs[:, -1]  # (dx, dy), unit vector

    theta_deg = float(np.degrees(np.arctan2(long_vec[1], long_vec[0])))
    # We want the long axis aligned with the vertical (y) axis. The y-axis
    # points "down" in image space (theta = +90 deg). Rotation angle:
    rot_deg = 90.0 - theta_deg

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
            bg_thresh: int = 240,
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
    p.add_argument("--bg-thresh", type=int, default=240)
    p.add_argument("--flip-h", action="store_true")
    a = p.parse_args()
    m, _, _ = process(a.image, out_overlay=a.overlay,
                      bg_thresh=a.bg_thresh, flip_horizontal=a.flip_h)
    keep = {k: v for k, v in m.items() if not k.startswith("_")}
    print(json.dumps(keep, indent=2))
