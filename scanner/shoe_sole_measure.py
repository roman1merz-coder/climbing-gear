#!/usr/bin/env python3
"""
shoe_sole_measure.py -- first-pass climbing shoe outsole measurement
from a product photo (dark shoe on white seamless background, camera
below the shoe so the outsole is visible).

Extracts 4 shape metrics in pixel space:
  1. max_forefoot_width
  2. max_heel_width
  3. forefoot_to_heel        (distance from max-forefoot row to heel back)
  4. toe_drift               (inward offset of the toe tip vs heel centerline)

Usage:
  python3 shoe_sole_measure.py <in.jpg> [out.png] [bg_thresh]

bg_thresh default is 240 (white backgrounds, e.g. Scarpa). For La Sportiva
grey backgrounds (~225) use ~200. The background is the everything >=
bg_thresh on a grayscale read; lower values get classified as shoe.
"""
import sys
import cv2
import numpy as np


# ---------- segmentation --------------------------------------------------

def segment_shoe(img_bgr, bg_thresh=240, color_tol=18, dark_gap=55):
    """
    Segment the shoe silhouette from a white or grey backdrop, ignoring the
    drop shadow.

    Works in L*A*B* space:
      * shoe = pixel is much darker than background (L drop > dark_gap) OR
               pixel has strong chroma (|a-bg_a| + |b-bg_b| > color_tol).
      * background = near-background L AND near-neutral chroma.
      * soft drop shadows on neutral backdrops have L slightly below bg and
        a/b close to bg (neutral), so they satisfy neither rule and get
        excluded.

    bg_thresh is retained only as a final fallback if LAB segmentation yields
    almost nothing (defensive; shouldn't normally trigger).
    """
    h, w = img_bgr.shape[:2]
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]

    patch = 12
    def corner(pix_sum):
        return np.concatenate([
            pix_sum[:patch, :patch].reshape(-1),
            pix_sum[:patch, -patch:].reshape(-1),
            pix_sum[-patch:, :patch].reshape(-1),
            pix_sum[-patch:, -patch:].reshape(-1),
        ])
    bg_L = float(np.median(corner(L)))
    bg_A = float(np.median(corner(A)))
    bg_B = float(np.median(corner(B)))

    chroma_diff = np.abs(A - bg_A) + np.abs(B - bg_B)
    dark_drop   = bg_L - L

    is_colored = chroma_diff > color_tol
    is_dark    = dark_drop   > dark_gap
    mask = ((is_colored | is_dark).astype(np.uint8)) * 255

    if mask.sum() < 0.01 * 255 * h * w:
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        _, mask = cv2.threshold(gray, bg_thresh, 255, cv2.THRESH_BINARY_INV)

    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,  np.ones((3, 3), np.uint8))

    nb, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if nb < 2:
        return mask
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return ((labels == largest).astype(np.uint8) * 255)


# ---------- orientation ---------------------------------------------------

def rotate_long_axis_vertical(mask, img):
    """Rotate so the shoe's long axis is vertical."""
    ys, xs = np.where(mask > 0)
    pts = np.column_stack([xs, ys]).astype(np.float32)
    (cx, cy), (w, h), angle = cv2.minAreaRect(pts)
    if w > h:
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


def ensure_toe_at_top(mask, img):
    """
    Orient the mask so the toe is at the top.

    Heuristic: the ball of foot is the WIDEST row of the silhouette and sits
    at roughly 25-35% of the length measured from the toe end. The toe end is
    therefore the end of the mask that is CLOSER to the widest row.

    (Prior versions assumed 'pointier end = toe'. That's wrong for climbing
    shoe soles - the heel cup tapers to a narrow rear tail, often narrower
    than the rounded toe cap, so the pointier-end heuristic flipped most of
    the dataset.)
    """
    ys, xs = np.where(mask > 0)
    top_y, bot_y = int(ys.min()), int(ys.max())

    # width per row across the full mask
    rows = {}
    for y in range(top_y, bot_y + 1):
        row_xs = xs[ys == y]
        if len(row_xs):
            rows[y] = int(row_xs.max() - row_xs.min())
    if not rows:
        return mask, img

    widest_y = max(rows, key=lambda y: rows[y])
    dist_to_top = widest_y - top_y
    dist_to_bot = bot_y - widest_y

    # toe end is the end CLOSER to the widest row
    if dist_to_bot < dist_to_top:
        mask = cv2.flip(mask, -1)
        img  = cv2.flip(img,  -1)
    return mask, img


# ---------- measurement ---------------------------------------------------

def measure(mask, ff_band=0.40, heel_band=0.15, toe_band=0.02):
    """
    ff_band:   fraction of total length, measured from the toe end, in which
               to search for the max forefoot width. Default 40 percent keeps
               the search at the ball-of-foot region and excludes the arch.
    heel_band: fraction of total length, measured from the heel tail, in which
               to search for the max heel width. Default 15 percent keeps the
               search tight on the heel cup and excludes the arch / midfoot.
               Prior iterations: 50% (whole bottom half) routinely landed on
               a midfoot widening; 30% still reached into the arch on long
               narrow-waisted climbing lasts; 20% was closer but still picked
               up the top of the heel cup ramp. 15% reliably stays within
               the widest part of the heel cup itself.
    toe_band:  fraction of total length, measured from the toe end, over
               which to compute the toe-tip centroid. Default 2 percent
               smooths single-row noise while still being distal enough to
               read toe-cap shape (Egyptian / Greek / round). For a 500 px
               shoe this is ~10 rows.

    Returns, in addition to the 4 legacy metrics, a 3-point asymmetry
    decomposition:
      last_asymmetry_px = ff_cx - heel_cx  (ball-of-foot offset from heel
                                            centerline; captures truly
                                            asymmetric lasts)
      toe_pointiness_px = toe_cx - ff_cx   (toe-tip offset from ball-of-foot
                                            midline; captures Egyptian vs
                                            round toe-box shape)
    By construction last_asymmetry_px + toe_pointiness_px == toe_drift_px,
    so the decomposition is lossless.

    Ratios last_asymmetry_over_len and toe_pointiness_over_len are
    normalised by total length (consistent with ff_over_len, heel_over_len).
    Sign is camera-frame (depends on which foot is photographed); magnitude
    is what matrix_scorer should consume.
    """
    ys, xs = np.where(mask > 0)
    top_y, bot_y = int(ys.min()), int(ys.max())
    length = bot_y - top_y

    # width per row
    rows = {}
    for y in range(top_y, bot_y + 1):
        row_xs = xs[ys == y]
        if len(row_xs):
            rows[y] = (int(row_xs.min()), int(row_xs.max()),
                       int(row_xs.max() - row_xs.min()))

    ff_cutoff   = top_y + int(length * ff_band)        # search top  ff_band
    heel_cutoff = bot_y - int(length * heel_band)      # search bot  heel_band
    ff_rows = [(y, *rows[y]) for y in rows if y <= ff_cutoff]
    hl_rows = [(y, *rows[y]) for y in rows if y >= heel_cutoff]

    ff_y, ff_lx, ff_rx, ff_w = max(ff_rows, key=lambda r: r[3])
    hl_y, hl_lx, hl_rx, hl_w = max(hl_rows, key=lambda r: r[3])

    # heel back = bottom-most row centroid
    heel_back_xs = xs[ys == bot_y]
    heel_back_cx = float((heel_back_xs.min() + heel_back_xs.max()) / 2)

    # toe tip: per-row midline ((min_x + max_x)/2) averaged over a narrow
    # top band. Using midlines removes the area-weighting bias you get from
    # np.mean(xs) on asymmetric tip profiles where the silhouette tapers
    # more gradually on one side. A tight top 0.5% band (min 3 rows) keeps
    # the sample close to the apex while providing anti-aliasing against
    # 1-pixel mask edge noise.
    tip_band_bot_y = top_y + max(2, int(round(length * 0.005)))
    row_mids = []
    for y in range(top_y, tip_band_bot_y + 1):
        r_xs = xs[ys == y]
        if len(r_xs):
            row_mids.append((float(r_xs.min()) + float(r_xs.max())) / 2.0)
    if row_mids:
        toe_cx = float(np.mean(row_mids))
    else:
        # extremely thin tip / degenerate mask -> fall back to old centroid
        toe_band_bot_y_fallback = top_y + max(1, int(round(length * toe_band)))
        toe_cx = float(np.mean(xs[(ys >= top_y) & (ys <= toe_band_bot_y_fallback)]))
    toe_tip_y = top_y                       # overlay reference line (visual)
    toe_band_bot_y = int(tip_band_bot_y)

    # forefoot centerline: mid-x of the widest forefoot row
    ff_cx = float((ff_lx + ff_rx) / 2)

    # heel centerline: mid-x of the widest heel row
    heel_cx = float((hl_lx + hl_rx) / 2)

    forefoot_to_heel = bot_y - ff_y
    toe_drift = toe_cx - heel_cx            # sign: + means drifted right

    last_asymmetry = ff_cx  - heel_cx       # ball-of-foot off heel line
    toe_pointiness = toe_cx - ff_cx         # toe tip off ball-of-foot line

    # --- Toe form (Egyptian / Greek / Roman proxy) ---------------------
    # Distance from the toe tip to the SAME-side outer ball edge.
    #   low  -> Egyptian (tip sits at / past the ball's outer edge, i.e.
    #                     big toe extends to the edge of the ball)
    #   mid  -> Greek    (tip slightly inside the ball envelope)
    #   high -> Roman    (tip well inside the ball envelope; toe box is
    #                     squared off, no single toe protrudes)
    # The "same side" is decided by which side the toe is biased toward
    # relative to the ball midline.
    if toe_cx >= ff_cx:
        toe_form_outer_x = float(ff_rx)     # right-side outer ball edge
    else:
        toe_form_outer_x = float(ff_lx)     # left-side outer ball edge
    toe_form = float(abs(toe_form_outer_x - toe_cx))

    # --- Triangle-height asymmetry -------------------------------------
    # Triangle A=heel, B=ball, C=toe. Project the heel->toe axis line to
    # y=ff_y and measure how far ff_cx sits off that line. For a banana
    # shape where the ball lies smoothly between heel and toe, this value
    # is ~0. For a last where the ball bulges medially (or laterally) off
    # the heel-toe axis, the value is non-zero and signed.
    dy = float(hl_y - top_y)                # = heel_y - toe_y > 0
    if dy > 0:
        s = (hl_y - ff_y) / dy              # 0 at heel, 1 at toe
        axis_x_at_ff = heel_cx + s * (toe_cx - heel_cx)
    else:
        axis_x_at_ff = (heel_cx + toe_cx) / 2.0
    asym_height = ff_cx - axis_x_at_ff      # signed; + means ball right of axis

    return dict(
        length_px               = int(length),
        forefoot_y              = int(ff_y),
        forefoot_lx             = int(ff_lx),
        forefoot_rx             = int(ff_rx),
        forefoot_cx             = ff_cx,
        max_forefoot_width_px   = int(ff_w),
        heel_y                  = int(hl_y),
        heel_lx                 = int(hl_lx),
        heel_rx                 = int(hl_rx),
        max_heel_width_px       = int(hl_w),
        heel_back_y             = int(bot_y),
        heel_back_cx            = heel_back_cx,
        toe_tip_y               = int(top_y),
        toe_band_bot_y          = toe_band_bot_y,
        toe_tip_cx              = toe_cx,
        heel_centerline_cx      = heel_cx,
        forefoot_to_heel_px     = int(forefoot_to_heel),
        toe_drift_px            = float(toe_drift),
        last_asymmetry_px       = float(last_asymmetry),
        toe_pointiness_px       = float(toe_pointiness),
        toe_form_px             = toe_form,
        toe_form_outer_x        = toe_form_outer_x,
        asym_height_px          = float(asym_height),
        asym_axis_x_at_ff       = float(axis_x_at_ff),
    )


# ---------- overlay -------------------------------------------------------

def draw_overlay(img, mask, m, out_path):
    # extend the canvas on the right so the legend sits OUTSIDE the sole photo
    src_h, src_w = img.shape[:2]
    panel_w = 360
    out = np.full((src_h, src_w + panel_w, 3), 255, dtype=np.uint8)
    out[:, :src_w] = img

    # amber mask tint on the shoe region only
    tint = np.zeros_like(out)
    shoe_region = np.zeros((src_h, src_w + panel_w), dtype=np.uint8)
    shoe_region[:, :src_w] = mask
    tint[shoe_region > 0] = (0, 165, 255)
    out = cv2.addWeighted(out, 1.0, tint, 0.18, 0)

    green = (60, 200, 80)
    red   = (40,  40, 220)
    mag   = (220, 40, 200)
    cyan  = (220, 180, 0)       # toe_form delta (BGR: teal/cyan)
    yel   = (0, 210, 210)       # triangle-height asymmetry (BGR: yellow)
    black = (0, 0, 0)

    # --- 1. forefoot width: green line with dot endpoints + label to the left
    y = m["forefoot_y"]; lx = m["forefoot_lx"]; rx = m["forefoot_rx"]
    cv2.line(out, (lx, y), (rx, y), green, 2)
    cv2.circle(out, (lx, y), 5, green, -1)
    cv2.circle(out, (rx, y), 5, green, -1)
    lbl = f"1. forefoot width {m['max_forefoot_width_px']}px"
    cv2.putText(out, lbl, (max(5, lx - 190), y - 6),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, green, 1, cv2.LINE_AA)

    # --- 2. heel width: green line with dots + label to the left
    y = m["heel_y"]; lx = m["heel_lx"]; rx = m["heel_rx"]
    cv2.line(out, (lx, y), (rx, y), green, 2)
    cv2.circle(out, (lx, y), 5, green, -1)
    cv2.circle(out, (rx, y), 5, green, -1)
    lbl = f"2. heel width {m['max_heel_width_px']}px"
    cv2.putText(out, lbl, (max(5, lx - 160), y + 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, green, 1, cv2.LINE_AA)

    # --- 3. forefoot to heel back: vertical bracket on the right of the sole
    x_br = max(m["forefoot_rx"], m["heel_rx"]) + 22
    y_top = m["forefoot_y"]; y_bot = m["heel_back_y"]
    cv2.line(out, (x_br, y_top), (x_br, y_bot), red, 2)
    cv2.line(out, (x_br - 8, y_top), (x_br + 8, y_top), red, 2)
    cv2.line(out, (x_br - 8, y_bot), (x_br + 8, y_bot), red, 2)
    cv2.circle(out, (int(m["heel_back_cx"]), y_bot), 6, red, -1)
    lbl = f"3. forefoot->heel {m['forefoot_to_heel_px']}px"
    cv2.putText(out, lbl, (x_br + 14, (y_top + y_bot) // 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, red, 1, cv2.LINE_AA)

    # --- 4. toe drift + 3-point decomposition (heel_cx -> ff_cx -> toe_cx)
    hx = int(m["heel_centerline_cx"])
    fx = int(m["forefoot_cx"])
    tx = int(m["toe_tip_cx"])

    # thin full-length heel centerline (visual anchor)
    cv2.line(out, (hx, m["heel_y"]), (hx, m["toe_tip_y"]),
             mag, 1, lineType=cv2.LINE_AA)

    # polyline heel_cx -> ff_cx -> toe_cx (the decomposition path)
    cv2.line(out, (hx, m["heel_y"]),       (fx, m["forefoot_y"]),
             mag, 2, lineType=cv2.LINE_AA)
    cv2.line(out, (fx, m["forefoot_y"]),   (tx, m["toe_tip_y"]),
             mag, 2, lineType=cv2.LINE_AA)

    # tick marks at each of the three centerlines
    cv2.circle(out, (hx, m["heel_y"]),      5, mag, -1)
    cv2.circle(out, (fx, m["forefoot_y"]),  5, mag, -1)
    cv2.circle(out, (tx, m["toe_tip_y"]),   6, mag, -1)

    # horizontal arrow at toe tip showing the total toe drift (legacy)
    cv2.arrowedLine(out, (hx, m["toe_tip_y"]),
                         (tx, m["toe_tip_y"]),
                         mag, 2, tipLength=0.3)
    lbl = f"4. toe drift {m['toe_drift_px']:+.1f}px"
    cv2.putText(out, lbl,
                (min(hx, tx) - 10, m["toe_tip_y"] - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, mag, 1, cv2.LINE_AA)

    # --- 5. toe form: short arrow from toe_cx to same-side outer ball edge
    ox = int(m["toe_form_outer_x"])
    # a short vertical stub at the outer-ball-edge point (at the ff row)
    cv2.circle(out, (ox, m["forefoot_y"]), 4, cyan, -1)
    # project the outer edge up to toe_y with a thin reference line
    cv2.line(out, (ox, m["forefoot_y"]), (ox, m["toe_tip_y"] + 18),
             cyan, 1, lineType=cv2.LINE_AA)
    # arrow from toe_cx to outer-x at toe_y row
    cv2.arrowedLine(out, (tx, m["toe_tip_y"] + 18),
                         (ox, m["toe_tip_y"] + 18),
                         cyan, 2, tipLength=0.3)
    lbl = f"5. toe form {m['toe_form_px']:.1f}px"
    cv2.putText(out, lbl,
                (min(tx, ox) + 5, m["toe_tip_y"] + 34),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, cyan, 1, cv2.LINE_AA)

    # --- 6. triangle-height asymmetry: heel->toe axis (dotted) + arrow to ff_cx
    ax = int(m["asym_axis_x_at_ff"])
    # dotted heel->toe axis
    for t in range(0, 100, 6):
        s0, s1 = t / 100.0, min((t + 3) / 100.0, 1.0)
        x0 = int(hx + s0 * (tx - hx))
        y0 = int(m["heel_y"] + s0 * (m["toe_tip_y"] - m["heel_y"]))
        x1 = int(hx + s1 * (tx - hx))
        y1 = int(m["heel_y"] + s1 * (m["toe_tip_y"] - m["heel_y"]))
        cv2.line(out, (x0, y0), (x1, y1), yel, 1, lineType=cv2.LINE_AA)
    # horizontal arrow from axis crossing to ff_cx, at y=ff_y
    cv2.circle(out, (ax, m["forefoot_y"]), 5, yel, -1)
    cv2.arrowedLine(out, (ax, m["forefoot_y"]),
                         (fx, m["forefoot_y"]),
                         yel, 2, tipLength=0.35)
    lbl = f"6. asym height {m['asym_height_px']:+.1f}px"
    tx_lbl_x = max(ax, fx) + 8
    cv2.putText(out, lbl,
                (tx_lbl_x, m["forefoot_y"] - 4),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, yel, 1, cv2.LINE_AA)

    # --- legend panel on the right, outside the sole photo
    px0 = src_w + 10
    py0 = 20
    panel_h = 380
    cv2.rectangle(out, (px0, py0),
                       (px0 + panel_w - 20, py0 + panel_h),
                       (240, 240, 240), -1)
    cv2.rectangle(out, (px0, py0),
                       (px0 + panel_w - 20, py0 + panel_h),
                       (180, 180, 180), 1)
    lines = [
        ("length",                 f"{m['length_px']} px",               black),
        ("1. max forefoot width",  f"{m['max_forefoot_width_px']} px "
                                   f"({100*m['max_forefoot_width_px']/m['length_px']:.1f}%)",
                                   green),
        ("2. max heel width",      f"{m['max_heel_width_px']} px "
                                   f"({100*m['max_heel_width_px']/m['length_px']:.1f}%)",
                                   green),
        ("3. forefoot->heel",      f"{m['forefoot_to_heel_px']} px "
                                   f"({100*m['forefoot_to_heel_px']/m['length_px']:.1f}%)",
                                   red),
        ("4. toe drift (legacy)",  f"{m['toe_drift_px']:+.1f} px "
                                   f"({100*m['toe_drift_px']/m['max_forefoot_width_px']:+.1f}% of ff)",
                                   mag),
        ("5. toe form (low=Egyptian)",
                                   f"{m['toe_form_px']:.1f} px "
                                   f"({100*m['toe_form_px']/m['length_px']:.1f}% of len)",
                                   cyan),
        ("6. asym height",         f"{m['asym_height_px']:+.1f} px "
                                   f"({100*m['asym_height_px']/m['length_px']:+.1f}% of len)",
                                   yel),
    ]
    for i, (label, val, color) in enumerate(lines):
        cv2.putText(out, label, (px0 + 10, py0 + 28 + i * 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, color, 1, cv2.LINE_AA)
        cv2.putText(out, val,   (px0 + 10, py0 + 48 + i * 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.50, black, 1, cv2.LINE_AA)

    cv2.imwrite(out_path, out)


# ---------- main ----------------------------------------------------------

def main(argv):
    if len(argv) < 2:
        print("usage: shoe_sole_measure.py <image> [out.png] [bg_thresh]")
        return 1
    in_path  = argv[1]
    out_path = argv[2] if len(argv) > 2 else in_path.rsplit(".", 1)[0] + "_measured.png"
    bg_thresh = int(argv[3]) if len(argv) > 3 else 240

    img = cv2.imread(in_path)
    if img is None:
        print(f"cannot read {in_path}")
        return 2

    mask = segment_shoe(img, bg_thresh=bg_thresh)
    mask, img = rotate_long_axis_vertical(mask, img)
    mask, img = ensure_toe_at_top(mask, img)

    m = measure(mask)

    print("=== outsole measurement (pixels) ===")
    print(f"length                  : {m['length_px']} px")
    print(f"max forefoot width      : {m['max_forefoot_width_px']} px  (row y={m['forefoot_y']})")
    print(f"max heel width          : {m['max_heel_width_px']} px  (row y={m['heel_y']})")
    print(f"forefoot to heel back   : {m['forefoot_to_heel_px']} px  "
          f"({100*m['forefoot_to_heel_px']/m['length_px']:.1f}% of length)")
    print(f"toe drift (+ = right)   : {m['toe_drift_px']:+.1f} px  "
          f"({100*m['toe_drift_px']/m['max_forefoot_width_px']:+.1f}% of forefoot width)")
    print()
    print("ratios (scale-invariant):")
    print(f"  forefoot_width / length : {m['max_forefoot_width_px']/m['length_px']:.3f}")
    print(f"  heel_width / length     : {m['max_heel_width_px']/m['length_px']:.3f}")
    print(f"  forefoot_to_heel / len  : {m['forefoot_to_heel_px']/m['length_px']:.3f}")
    print(f"  toe_drift / ff_width    : {m['toe_drift_px']/m['max_forefoot_width_px']:+.3f}")

    draw_overlay(img, mask, m, out_path)
    print(f"\noverlay -> {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
