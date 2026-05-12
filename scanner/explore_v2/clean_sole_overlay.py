#!/usr/bin/env python3
"""Sandbox-only: fetch the production sole_overlay.png for a list of
sample scan_ids, strip the average-foot silhouette outline + HVA text
label + bottom legend, save clean PNGs to sample_cases_2026_05_02/sole_overlays/.

Roman 2026-05-08: production foot_measure.py bakes the avg outline,
HVA text, and legend into the overlay PNG. Sandbox display wants those
removed but keeping the user's foot outline + measurement lines.

Run: python3 clean_sole_overlay.py
"""
import os, sys, requests, io
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

SB = "https://wsjsuhvpgupalwgcjatp.supabase.co"
KEY = (os.environ.get("SUPABASE_SECRET_KEY")
       or os.environ.get("SUPABASE_SERVICE_KEY"))
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}"} if KEY else {}

OUT_DIR = Path(__file__).resolve().parent / "sample_cases_2026_05_02" / "sole_overlays"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Sample scan IDs (matches the 5 sample cases)
SAMPLE_SCANS = [
    "scan-2026-04-30T00-13-44",
    "scan-2026-04-13T15-21-21",
    "scan-2026-04-26T08-40-41",
    "scan-2026-04-26T20-39-30",
    "scan-2026-04-22T15-30-01",
]

# Color used for avg silhouette outline in foot_measure.draw_sole_overlay
# BGR (191,205,213) -> RGB (213,205,191). Tolerance for anti-aliased pixels.
# Roman 2026-05-08: tightened from 25 -> 10 because the user's amber
# semi-transparent foot fill RGB (236,214,189) was within 25 channels
# of the silhouette color and was being stripped along with the outline.
# 10 is enough to catch antialiased silhouette edge pixels but won't
# touch the much-warmer foot fill.
SILHOUETTE_RGB = (213, 205, 191)
SIL_TOL = 10

# HVA visualization color BGR (60, 140, 200) -> RGB (200, 140, 60)
HVA_RGB = (200, 140, 60)
HVA_TOL = 30

# Bottom legend area height (~40px from foot_measure: ly = ch - 30 + text height)
LEGEND_HEIGHT = 50

# Top area where HVA text label sits (~30px below the top padding)
HVA_TEXT_TOP = 0
HVA_TEXT_BOTTOM = 80   # generous to catch the text


def fetch_overlay(scan_id):
    url = f"{SB}/storage/v1/object/public/foot-scans/scans/{scan_id}-sole_overlay.png"
    r = requests.get(url, timeout=30)
    if not r.ok:
        return None
    return Image.open(io.BytesIO(r.content)).convert("RGB")


def strip_color(arr, target_rgb, tol):
    """Replace pixels close to target_rgb with white. Modifies arr in place."""
    target = np.array(target_rgb, dtype=np.int16)
    diff = np.abs(arr.astype(np.int16) - target)
    mask = (diff[..., 0] <= tol) & (diff[..., 1] <= tol) & (diff[..., 2] <= tol)
    arr[mask] = (255, 255, 255)


# Production foot_measure GREEN BGR (82,122,61) -> RGB (61,122,82)
GREEN_RGB = (61, 122, 82)
GREEN_TOL = 25  # Match against existing green forefoot/heel lines

# Pink medial-edge tick BGR (200,100,100) -> RGB (100,100,200). Distinct
# from amber + foot outline (max channel diff ~135), safe to color-strip.
PINK_RGB = (100, 100, 200)
PINK_TOL = 30


def _detect_green_lines_geometry(arr):
    """Find geometry of existing GREEN forefoot/heel measurement lines.
    Returns (line_left, line_right, ball_cy, heel_cy) — pixel coords —
    or None if detection fails. The ball/heel lines are 2px-wide
    horizontal GREEN lines spanning roughly the full canvas width.
    """
    h, w, _ = arr.shape
    target = np.array(GREEN_RGB, dtype=np.int16)
    diff = np.abs(arr.astype(np.int16) - target)
    mask = (diff[..., 0] <= GREEN_TOL) & (diff[..., 1] <= GREEN_TOL) & (diff[..., 2] <= GREEN_TOL)
    # Per-row count of green pixels — horizontal lines have many.
    row_counts = mask.sum(axis=1)
    # Threshold: rows with at least half the canvas width as green.
    candidate_rows = np.where(row_counts > w * 0.5)[0]
    if len(candidate_rows) < 2:
        return None
    # Cluster candidate rows into runs (2px lines may show 2-3 rows).
    runs = []
    cur = [candidate_rows[0]]
    for r in candidate_rows[1:]:
        if r - cur[-1] <= 3:
            cur.append(r)
        else:
            runs.append(cur)
            cur = [r]
    runs.append(cur)
    # Ball line is the upper one, heel line the lower (assuming foot
    # toes at top — verified by foot_measure orientation normalization).
    if len(runs) < 2:
        return None
    ball_cy = int(np.mean(runs[0]))
    heel_cy = int(np.mean(runs[-1]))
    # line_left / line_right from the longest green row.
    longest_row = candidate_rows[np.argmax(row_counts[candidate_rows])]
    cols = np.where(mask[longest_row])[0]
    line_left = int(cols.min())
    line_right = int(cols.max())
    return line_left, line_right, ball_cy, heel_cy


def _detect_foot_top_and_big_toe_x(arr, ball_cy, line_left, line_right):
    """Find the topmost amber-fill row (big_toe_cy) and the x of the
    foot's leftmost pixel at that row (big_toe_cx). Also find ball_left
    (med_edge_cx) — leftmost amber pixel at ball_cy.
    """
    h, w, _ = arr.shape
    # Amber fill mask — center color RGB (236,214,189) ± wide tol.
    fill_target = np.array((236, 214, 189), dtype=np.int16)
    fdiff = np.abs(arr.astype(np.int16) - fill_target)
    fill_mask = (fdiff[..., 0] <= 18) & (fdiff[..., 1] <= 18) & (fdiff[..., 2] <= 18)
    # Search only inside the line_left .. line_right window.
    fill_mask[:, :line_left] = False
    fill_mask[:, line_right + 1:] = False
    # Topmost row with SUBSTANTIAL fill (>= 10 pixels) — skip stray
    # antialiased halo pixels at very top.
    row_fill_counts = fill_mask.sum(axis=1)
    rows_with_solid_fill = np.where(row_fill_counts >= 10)[0]
    if len(rows_with_solid_fill) == 0:
        return None
    foot_top = int(rows_with_solid_fill[0])
    # big_toe_cy: a few rows BELOW foot top to land on the toe meat
    # (not antialiased halo). 6 rows in is safely past the halo.
    big_toe_cy = min(foot_top + 6, h - 1)
    cols_at_top = np.where(fill_mask[big_toe_cy])[0]
    if len(cols_at_top) == 0:
        return None
    big_toe_cx = int(cols_at_top.min())
    # med_edge_cx: leftmost fill pixel near ball_cy. Cannot use ball_cy
    # itself — the production GREEN ball line paints over the amber
    # there. Sample 5 rows above (still firmly inside the foot at the
    # ball level for any normal foot orientation).
    sample_y = max(0, ball_cy - 5)
    cols_at_ball = np.where(fill_mask[sample_y])[0]
    if len(cols_at_ball) == 0:
        return None
    med_edge_cx = int(cols_at_ball.min())
    return big_toe_cy, big_toe_cx, med_edge_cx


def _strip_pink(arr):
    """Replace pink medial-edge tick pixels (RGB 100,100,200) with white.
    Color is far from amber + foot outline, so safe."""
    target = np.array(PINK_RGB, dtype=np.int16)
    diff = np.abs(arr.astype(np.int16) - target)
    mask = (diff[..., 0] <= PINK_TOL) & (diff[..., 1] <= PINK_TOL) & (diff[..., 2] <= PINK_TOL)
    arr[mask] = (255, 255, 255)


def _draw_green_hva_line(img, line_left, line_right, big_toe_cy,
                         big_toe_cx, med_edge_cx):
    """Overlay a GREEN horizontal HVA measurement line at big_toe_cy
    spanning line_left → line_right, with vertical tick markers at
    med_edge_cx and big_toe_cx. Matches forefoot/heel width style.

    The green overdraw covers the production orange HVA line at the
    same Y. Tick markers cover the orange filled circle at big_toe_cx.
    """
    draw = ImageDraw.Draw(img)
    g = GREEN_RGB
    # Horizontal line — 2px thick to match production ball/heel lines.
    draw.line([(line_left, big_toe_cy), (line_right, big_toe_cy)],
              fill=g, width=2)
    # Vertical tick markers ±10px around big_toe_cy.
    for cx in (med_edge_cx, big_toe_cx):
        draw.line([(cx, big_toe_cy - 10), (cx, big_toe_cy + 10)],
                  fill=g, width=2)


def clean_overlay(img):
    """Strip avg silhouette outline + HVA text label + bottom legend.
    Returns the cleaned PIL Image.

    Roman 2026-05-08: HVA text color (RGB 200,140,60) is nearly identical
    to the amber foot outline color (RGB 201,138,66) — color-based
    stripping destroyed the foot outline pixels. Switched to region-based
    crop for the HVA text (top-left rectangle, far left of where the
    foot sits).
    """
    arr = np.array(img)
    h, w, _ = arr.shape

    # 1. Strip the silhouette outline globally. The silhouette gray
    # (RGB 213,205,191) is far from the amber foot (RGB 201,138,66) and
    # green measurement lines (RGB 61,122,82), so color-replace is safe.
    strip_color(arr, SILHOUETTE_RGB, SIL_TOL)

    # 2. Paint white over the HVA text region — region-based (NOT color-
    # based, because the HVA text uses BGR (60,140,200) → RGB (200,140,60)
    # which is virtually identical to the amber foot outline RGB
    # (201,138,66). Color-stripping destroyed the foot outline pixels.
    #
    # The text is drawn at foot_measure.py line ~1170 at coords
    # (line_left, upper_cy - 15). With PAD=50:
    #   line_left = dx + PAD - 10 = 40
    #   upper_cy  = PAD + 0 = 50 (foot's top edge, since upper_row =
    #               scan_top after orientation normalization)
    #   text top  = upper_cy - 15 = 35
    # So the text sits at y ≈ 25-48, x ≈ 40-180 — ENTIRELY ABOVE the
    # foot's top edge at y=50. Clearing y<48 is always safe.
    arr[0:48, :] = (255, 255, 255)

    # 3. Strip the pink medial-edge tick (production HVA viz). Pink
    # color RGB (100,100,200) is far enough from amber + foot outline
    # to color-strip safely.
    _strip_pink(arr)

    # 4. Redraw the HVA measurement line in green to match the
    # forefoot/heel width style. The original orange HVA line + circle
    # share color with the foot outline (RGB 200,140,60 ~ 201,138,66)
    # so we cannot strip it cleanly. Instead we OVERDRAW: a 2px green
    # horizontal line at the same Y covers the orange line, and 20px
    # green vertical tick markers cover the orange filled circle at
    # big_toe_cx and the medial edge at med_edge_cx.
    geom = _detect_green_lines_geometry(arr)
    if geom is not None:
        line_left, line_right, ball_cy, _heel_cy = geom
        coords = _detect_foot_top_and_big_toe_x(
            arr, ball_cy, line_left, line_right
        )
        if coords is not None:
            big_toe_cy, big_toe_cx, med_edge_cx = coords
            # Crop bottom legend BEFORE drawing so we don't lose new
            # green pixels near the bottom (HVA line is high up, so
            # ordering doesn't matter for it, but keep array fresh).
            arr = arr[:h - LEGEND_HEIGHT, :, :]
            img2 = Image.fromarray(arr)
            _draw_green_hva_line(img2, line_left, line_right,
                                  big_toe_cy, big_toe_cx, med_edge_cx)
            return img2

    # Fallback: if detection failed, just crop the legend and return.
    arr = arr[:h - LEGEND_HEIGHT, :, :]
    return Image.fromarray(arr)


def main():
    if not KEY:
        print("ERROR: SUPABASE_SECRET_KEY env var not set", file=sys.stderr)
        sys.exit(1)
    for scan_id in SAMPLE_SCANS:
        print(f"# {scan_id}", file=sys.stderr)
        img = fetch_overlay(scan_id)
        if img is None:
            print(f"  skip — overlay not found", file=sys.stderr)
            continue
        clean = clean_overlay(img)
        out = OUT_DIR / f"{scan_id}-sole_overlay-clean.png"
        clean.save(out)
        print(f"  wrote {out} ({out.stat().st_size:,} bytes)", file=sys.stderr)


if __name__ == "__main__":
    main()
