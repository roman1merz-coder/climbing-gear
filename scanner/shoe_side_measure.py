#!/usr/bin/env python3
"""
Side-profile silhouette measurements for climbing shoes.

Input: a pure side-profile photo (shoe's long axis roughly horizontal in
the photo, clean background). Reuses shoe_sole_measure.segment_shoe for
background removal.

Extracted metrics:
  length_px            -- horizontal span of the silhouette
  height_px            -- vertical span of the silhouette
  heel_gx, heel_gy     -- deepest (max-y) point in the rightmost 15% of mask;
                          the "heel ground contact" reference
  toe_gx,  toe_gy      -- deepest point in the leftmost 15% of mask;
                          the "toe ground contact" reference
  downturn_px          -- max perpendicular lift of the sole underside above
                          the toe_g -> heel_g chord (the sagitta). Higher =
                          more banana / more aggressive camber.
  downturn_at_x        -- x of that max lift
  downturn_frac        -- (downturn_at_x - toe_gx) / (heel_gx - toe_gx)
  arch25/50/75_px      -- sampled arch lift at 25%, 50%, 75% of chord length
  heel_cup_height_px   -- vertical extent of the mask at the back 12% slice
                          (full silhouette height at the rear of the shoe;
                          includes rand + heel counter + any pull tab / collar
                          that shows in the back region).
  heel_overhang_px     -- x_max - heel_gx (how far the heel sticks out rear
                          of the heel ground contact).

All outputs are in pixels. Divide by length_px for scale-invariant ratios.

Orientation convention (after rotate + ensure_toe_at_left):
  - long axis is horizontal
  - toe is on the LEFT
  - heel is on the RIGHT
  - sole is on the BOTTOM (higher y)
"""

import cv2
import numpy as np


# ---------------------------------------------------------------- orientation

def rotate_long_axis_horizontal(mask, img):
    """Rotate so the shoe's long axis is horizontal."""
    ys, xs = np.where(mask > 0)
    pts = np.column_stack([xs, ys]).astype(np.float32)
    (cx, cy), (w, h), angle = cv2.minAreaRect(pts)
    if h > w:
        angle += 90.0
    H, W = mask.shape
    M = cv2.getRotationMatrix2D((cx, cy), angle, 1.0)
    cos, sin = abs(M[0, 0]), abs(M[0, 1])
    nW = int(H * sin + W * cos)
    nH = int(H * cos + W * sin)
    M[0, 2] += nW / 2 - cx
    M[1, 2] += nH / 2 - cy
    mask_r = cv2.warpAffine(mask, M, (nW, nH), flags=cv2.INTER_NEAREST)
    img_r  = cv2.warpAffine(img,  M, (nW, nH), flags=cv2.INTER_LINEAR,
                            borderValue=(255, 255, 255))
    return mask_r, img_r


def ensure_toe_at_left(mask, img):
    """
    Flip horizontally if needed so the toe (short/low end) is on the left.

    Heuristic: in the side view, the heel end of the silhouette has a tall
    heel counter, while the toe end is a low rubber cap. So compute
    vertical extent per end: the taller end is the heel. If the heel ends
    up on the left, flip.
    """
    ys, xs = np.where(mask > 0)
    left_x, right_x = int(xs.min()), int(xs.max())
    length = right_x - left_x + 1
    slice_w = max(2, int(length * 0.20))
    left_mask  = (xs >= left_x)             & (xs <= left_x + slice_w)
    right_mask = (xs >= right_x - slice_w)  & (xs <= right_x)
    left_ext  = int(ys[left_mask].max()  - ys[left_mask].min())  if left_mask.any()  else 0
    right_ext = int(ys[right_mask].max() - ys[right_mask].min()) if right_mask.any() else 0
    if left_ext > right_ext:
        mask = cv2.flip(mask, 1)
        img  = cv2.flip(img, 1)
    return mask, img


def ensure_sole_at_bottom(mask, img):
    """
    Flip vertically if needed so the sole is at the bottom (higher y).

    Heuristic: in a side view the sole has a relatively flat / horizontal
    extent, while the top of the shoe has more varied / diagonal slopes
    (tongue, ankle collar). But more directly, in any climbing-shoe side
    shot the silhouette's horizontal extent at the BOTTOM is larger than
    at the TOP (the footbed is wider than the ankle opening). So compute
    horizontal extent of the bottom 15% vs top 15% slice; the bottom is
    the wider slice.
    """
    ys, xs = np.where(mask > 0)
    top_y, bot_y = int(ys.min()), int(ys.max())
    height = bot_y - top_y + 1
    slice_h = max(2, int(height * 0.15))
    top_slice = (ys >= top_y)             & (ys <= top_y + slice_h)
    bot_slice = (ys >= bot_y - slice_h)   & (ys <= bot_y)
    top_ext = int(xs[top_slice].max() - xs[top_slice].min()) if top_slice.any() else 0
    bot_ext = int(xs[bot_slice].max() - xs[bot_slice].min()) if bot_slice.any() else 0
    if top_ext > bot_ext:
        mask = cv2.flip(mask, 0)
        img  = cv2.flip(img, 0)
    return mask, img


# ---------------------------------------------------------------- measurement

def measure_side(mask, heel_ref_band=0.15, toe_ref_band=0.15, heel_back_band=0.12):
    ys, xs = np.where(mask > 0)
    x_min, x_max = int(xs.min()), int(xs.max())
    y_min, y_max = int(ys.min()), int(ys.max())
    length = x_max - x_min + 1
    height = y_max - y_min + 1

    bot_y = np.full(mask.shape[1], -1, dtype=int)
    top_y = np.full(mask.shape[1], -1, dtype=int)
    for x in range(x_min, x_max + 1):
        col = np.where(mask[:, x] > 0)[0]
        if len(col):
            bot_y[x] = int(col.max())
            top_y[x] = int(col.min())

    # heel ground reference
    heel_band_start = x_max - int(length * heel_ref_band)
    heel_cands = [(x, bot_y[x]) for x in range(heel_band_start, x_max + 1) if bot_y[x] >= 0]
    heel_gx, heel_gy = max(heel_cands, key=lambda p: p[1])

    # toe ground reference
    toe_band_end = x_min + int(length * toe_ref_band)
    toe_cands = [(x, bot_y[x]) for x in range(x_min, toe_band_end + 1) if bot_y[x] >= 0]
    toe_gx, toe_gy = max(toe_cands, key=lambda p: p[1])

    def chord_y(x):
        if heel_gx == toe_gx:
            return float(heel_gy)
        t = (x - toe_gx) / (heel_gx - toe_gx)
        return float(toe_gy) + t * (float(heel_gy) - float(toe_gy))

    # downturn = max (chord - bot) across the span
    best_lift = 0.0
    best_x = (toe_gx + heel_gx) // 2
    for x in range(toe_gx, heel_gx + 1):
        if bot_y[x] >= 0:
            lift = chord_y(x) - float(bot_y[x])
            if lift > best_lift:
                best_lift = lift
                best_x = x

    # sampled arch at 25%, 50%, 75% of chord
    def arch_at(f):
        x = int(round(toe_gx + f * (heel_gx - toe_gx)))
        if 0 <= x < len(bot_y) and bot_y[x] >= 0:
            return float(chord_y(x) - float(bot_y[x])), x
        return 0.0, x

    arch25, x25 = arch_at(0.25)
    arch50, x50 = arch_at(0.50)
    arch75, x75 = arch_at(0.75)

    # heel silhouette height at back 12% slice
    heel_back_start = x_max - int(length * heel_back_band)
    back_col_mask = (xs >= heel_back_start) & (xs <= x_max)
    heel_silh_top = int(ys[back_col_mask].min())
    heel_silh_bot = int(ys[back_col_mask].max())
    heel_cup_height = heel_silh_bot - heel_silh_top

    # heel overhang: distance the heel mask extends past the heel ground pt
    heel_overhang = int(x_max - heel_gx)

    return {
        "length_px": int(length),
        "height_px": int(height),
        "x_min": int(x_min), "x_max": int(x_max),
        "y_min": int(y_min), "y_max": int(y_max),
        "heel_gx": int(heel_gx), "heel_gy": int(heel_gy),
        "toe_gx":  int(toe_gx),  "toe_gy":  int(toe_gy),
        "downturn_px":     float(best_lift),
        "downturn_at_x":   int(best_x),
        "downturn_frac":   float((best_x - toe_gx) / max(1, (heel_gx - toe_gx))),
        "arch25_px":       float(arch25),
        "arch50_px":       float(arch50),
        "arch75_px":       float(arch75),
        "arch25_x":        int(x25),
        "arch50_x":        int(x50),
        "arch75_x":        int(x75),
        "heel_cup_height_px": int(heel_cup_height),
        "heel_cup_top_y":  int(heel_silh_top),
        "heel_cup_bot_y":  int(heel_silh_bot),
        "heel_cup_x":      int(x_max - int(length * heel_back_band / 2)),
        "heel_overhang_px": int(heel_overhang),
        # not pickled to CSV; for the overlay renderer only
        "_bot_y_profile":  bot_y.tolist(),
    }


# ---------------------------------------------------------------- rendering

def draw_side_overlay(img, mask, m, out_path):
    ov = img.copy()
    bg = np.full_like(ov, 255)
    ov = cv2.addWeighted(ov, 0.78, bg, 0.22, 0)

    bot = m["_bot_y_profile"]

    # sole profile dots
    for x in range(m["x_min"], m["x_max"] + 1):
        if bot[x] >= 0:
            cv2.circle(ov, (x, bot[x]), 1, (70, 70, 70), -1)

    # chord toe_g -> heel_g
    gr = (0, 180, 0)
    cv2.line(ov, (m["toe_gx"], m["toe_gy"]), (m["heel_gx"], m["heel_gy"]),
             gr, 2, cv2.LINE_AA)
    cv2.circle(ov, (m["toe_gx"],  m["toe_gy"]),  7, gr, -1)
    cv2.circle(ov, (m["heel_gx"], m["heel_gy"]), 7, gr, -1)
    cv2.putText(ov, "toe_g",  (m["toe_gx"]  - 5, m["toe_gy"]  + 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, gr, 1, cv2.LINE_AA)
    cv2.putText(ov, "heel_g", (m["heel_gx"] - 25, m["heel_gy"] + 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, gr, 1, cv2.LINE_AA)

    # downturn arrow (chord -> sole)
    cx = m["downturn_at_x"]
    cy_chord = int(round(m["toe_gy"] + (cx - m["toe_gx"]) /
                         max(1, (m["heel_gx"] - m["toe_gx"])) *
                         (m["heel_gy"] - m["toe_gy"])))
    cy_sole = bot[cx]
    mag = (200, 40, 200)
    cv2.arrowedLine(ov, (cx, cy_chord), (cx, cy_sole), mag, 2, tipLength=0.25)
    cv2.putText(ov, f"downturn {m['downturn_px']:.0f}px",
                (cx + 8, (cy_chord + cy_sole) // 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, mag, 2, cv2.LINE_AA)

    # arch 25 / 50 / 75 tick marks
    cyan = (220, 180, 0)
    for f, x, lift in [(0.25, m["arch25_x"], m["arch25_px"]),
                       (0.50, m["arch50_x"], m["arch50_px"]),
                       (0.75, m["arch75_x"], m["arch75_px"])]:
        if x < 0 or x >= len(bot) or bot[x] < 0:
            continue
        cy_c = int(round(m["toe_gy"] + (x - m["toe_gx"]) /
                         max(1, (m["heel_gx"] - m["toe_gx"])) *
                         (m["heel_gy"] - m["toe_gy"])))
        cy_s = bot[x]
        cv2.line(ov, (x, cy_c), (x, cy_s), cyan, 1, cv2.LINE_AA)

    # heel cup silhouette height
    hx = m["heel_cup_x"]
    red = (0, 0, 220)
    cv2.line(ov, (hx, m["heel_cup_top_y"]), (hx, m["heel_cup_bot_y"]),
             red, 3, cv2.LINE_AA)
    cv2.putText(ov, f"heel {m['heel_cup_height_px']}px",
                (hx + 8, (m["heel_cup_top_y"] + m["heel_cup_bot_y"]) // 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, red, 2, cv2.LINE_AA)

    # length bar above
    bl = (60, 60, 60)
    y_bar = max(10, m["y_min"] - 22)
    cv2.line(ov, (m["x_min"], y_bar), (m["x_max"], y_bar), bl, 2, cv2.LINE_AA)
    cv2.putText(ov, f"length {m['length_px']}px",
                (m["x_min"] + 8, y_bar - 6),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, bl, 1, cv2.LINE_AA)

    # heel overhang tick
    if m["heel_overhang_px"] > 0:
        oy = m["heel_gy"] + 38
        cv2.line(ov, (m["heel_gx"], oy), (m["x_max"], oy),
                 (150, 100, 0), 2, cv2.LINE_AA)
        cv2.putText(ov, f"overhang {m['heel_overhang_px']}px",
                    (m["heel_gx"] - 8, oy + 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 100, 0), 1, cv2.LINE_AA)

    cv2.imwrite(out_path, ov)
