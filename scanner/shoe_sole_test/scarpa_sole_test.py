#!/usr/bin/env python3
"""
scarpa_sole_test.py
===================

Run shoe_sole_measure on every Scarpa slot-F (top-down sole) photo using the
recovered prior session module API (segment_shoe + rotate_long_axis_vertical
+ ensure_toe_at_top + measure + draw_overlay).

Outputs (next to this file):
  sole_metrics_scarpa.csv     one row per shoe with the full prior schema
  <slug>_sole_measured.png    per-shoe overlay
  _grid_scarpa_sole.png       4-column grid

Notes:
  * Uses the prior session's two-criterion LAB segmentation (dark OR chroma)
    which excludes drop shadows while keeping colored midsole / TPU panels
    in the silhouette.
  * Forefoot search band = top 40 percent from the toe end (excludes the
    arch widening).
  * Heel search band = bottom 15 percent from the heel tail (avoids the
    heel-cup ramp + arch).
  * 3-point asymmetry decomposition: last_asymmetry_px (ball off heel line)
    + toe_pointiness_px (toe off ball line) = toe_drift_px.
"""
import os
import sys
import csv

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import cv2
import numpy as np
import shoe_sole_measure as ssm

_IMG_CANDIDATES = [
    "/sessions/nifty-funny-darwin/mnt/climbing-gear/dist/images/shoes",
    "/Users/rolfes/Library/Mobile Documents/com~apple~CloudDocs/Documents/"
    "GitHub/climbing-gear/dist/images/shoes",
]
IMG_DIR = next((p for p in _IMG_CANDIDATES if os.path.isdir(p)),
               _IMG_CANDIDATES[0])
OUT_DIR = HERE

SCARPA = [
    "arpia-v", "arpia-v-lv", "booster", "boostic", "boostic-r",
    "chimera", "drago", "drago-lv", "drago-xt", "force-v",
    "furia-air", "generator", "generator-mid", "generator-v",
    "generator-womens", "instinct-lace", "instinct-s",
    "instinct-vs-mens", "instinct-vs-womens", "instinct-vsr-lv",
    "instinct-vsr-mens", "instinct-vsr-womens", "instinct-womens",
    "mago", "origin-mens", "origin-vs", "origin-vs-womens",
    "origin-womens", "reflex-mens", "reflex-womens", "vapor-lace",
    "vapor-lv", "vapor-s", "vapor-s-womens", "vapor-v-mens",
    "vapor-womens", "veloce", "veloce-l", "veloce-l-womens",
    "veloce-womens",
]

# Per-shoe horizontal-flip overrides (kept for parity with the prior session
# - empty for Scarpa). Used to correct any shoe whose `ensure_toe_at_top`
# heuristic gets confused (matches the la-sportiva-python pattern from
# the prior session for other brands).
FLIP_OVERRIDE: set[str] = set()

BG_THRESH = 240  # legacy fallback only; prior LAB segmentation needs no tuning


def run_one(slug: str, in_path: str) -> dict | None:
    img = cv2.imread(in_path)
    if img is None:
        print(f"FAIL {slug}: cannot read {in_path}")
        return None
    try:
        mask = ssm.segment_shoe(img, bg_thresh=BG_THRESH)
        mask, img = ssm.rotate_long_axis_vertical(mask, img)
        mask, img = ssm.ensure_toe_at_top(mask, img)
        if slug in FLIP_OVERRIDE:
            mask = cv2.flip(mask, 1)
            img = cv2.flip(img, 1)
        m = ssm.measure(mask)
    except Exception as e:
        print(f"FAIL {slug}: {e}")
        return None

    ssm.draw_overlay(img, mask, m, f"{OUT_DIR}/{slug}_sole_measured.png")

    L = m["length_px"]
    fw = m["max_forefoot_width_px"]
    return {
        "slug":               slug,
        "brand":              "scarpa",
        "length_px":          L,
        "ff_width_px":        fw,
        "heel_width_px":      m["max_heel_width_px"],
        "ff_to_heel_px":      m["forefoot_to_heel_px"],
        "heel_cx_px":         round(m["heel_centerline_cx"], 2),
        "ff_cx_px":           round(m["forefoot_cx"],        2),
        "toe_cx_px":          round(m["toe_tip_cx"],         2),
        "toe_drift_px":       round(m["toe_drift_px"],       2),
        "last_asymmetry_px":  round(m["last_asymmetry_px"],  2),
        "toe_pointiness_px":  round(m["toe_pointiness_px"],  2),
        "toe_form_px":        round(m["toe_form_px"],        2),
        "asym_height_px":     round(m["asym_height_px"],     2),
        "ff_over_len":            round(fw / L, 4),
        "heel_over_len":          round(m["max_heel_width_px"] / L, 4),
        "ff2heel_over_len":       round(m["forefoot_to_heel_px"] / L, 4),
        "toe_drift_over_ff":      round(m["toe_drift_px"] / fw, 4),
        "last_asymmetry_over_len":round(m["last_asymmetry_px"] / L, 4),
        "toe_pointiness_over_len":round(m["toe_pointiness_px"] / L, 4),
        "toe_form_over_len":      round(m["toe_form_px"] / L, 4),
        "asym_height_over_len":   round(m["asym_height_px"] / L, 4),
    }


def make_grid(slugs: list[str], cell_h: int = 520, cols: int = 4) -> str:
    imgs = []
    for slug in slugs:
        p = f"{OUT_DIR}/scarpa-{slug}_sole_measured.png"
        im = cv2.imread(p)
        if im is None:
            continue
        h, w = im.shape[:2]
        im = cv2.resize(im, (int(w * cell_h / h), cell_h),
                        interpolation=cv2.INTER_AREA)
        cap = np.full((36, im.shape[1], 3), 245, dtype=np.uint8)
        cv2.putText(cap, slug, (8, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                    (0, 0, 0), 1, cv2.LINE_AA)
        imgs.append(np.concatenate([cap, im], axis=0))
    if not imgs:
        return ""
    cell_w = max(im.shape[1] for im in imgs)
    padded = []
    for im in imgs:
        h, w = im.shape[:2]
        if w < cell_w:
            im = np.concatenate(
                [im, np.full((h, cell_w - w, 3), 255, dtype=np.uint8)],
                axis=1)
        padded.append(im)
    rows_n = (len(padded) + cols - 1) // cols
    rows_img = []
    for r in range(rows_n):
        row_imgs = padded[r * cols:(r + 1) * cols]
        while len(row_imgs) < cols:
            row_imgs.append(np.full(
                (padded[0].shape[0], cell_w, 3), 255, dtype=np.uint8))
        rows_img.append(np.concatenate(row_imgs, axis=1))
    grid = np.concatenate(rows_img, axis=0)
    out = f"{OUT_DIR}/_grid_scarpa_sole.png"
    cv2.imwrite(out, grid)
    return out


def main():
    rows = []
    failures = []
    for short in SCARPA:
        slug = f"scarpa-{short}"
        src = f"{IMG_DIR}/{slug}-F.jpg"
        if not os.path.isfile(src):
            print(f"MISS {slug}: no source")
            failures.append(slug)
            continue
        r = run_one(slug, src)
        if r is None:
            failures.append(slug)
            continue
        rows.append(r)
        print(
            f"OK   {slug:34s} "
            f"L={r['length_px']:>4d} "
            f"ff/L={r['ff_over_len']:.3f} "
            f"heel/L={r['heel_over_len']:.3f} "
            f"toe_form/L={r['toe_form_over_len']:.3f} "
            f"asym_h/L={r['asym_height_over_len']:+.3f} "
            f"last_asym/L={r['last_asymmetry_over_len']:+.3f}"
        )

    if rows:
        csv_path = f"{OUT_DIR}/sole_metrics_scarpa.csv"
        with open(csv_path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            for r in rows:
                w.writerow(r)
        print(f"\nCSV  -> {csv_path}  ({len(rows)} rows)")

    grid = make_grid([r["slug"].replace("scarpa-", "") for r in rows])
    if grid:
        print(f"grid -> {grid}")

    if failures:
        print(f"\nFAILURES ({len(failures)}):")
        for s in failures:
            print(f"  {s}")


if __name__ == "__main__":
    main()
