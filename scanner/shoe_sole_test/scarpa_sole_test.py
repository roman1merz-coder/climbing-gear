#!/usr/bin/env python3
"""
scarpa_sole_test.py
===================

Run shoe_sole_measure on every Scarpa slot-F (top-down sole) photo, produce a
CSV of metrics, a per-shoe overlay PNG, and a 4-column composite grid for
fast visual audit.

Outputs (next to this file, in scanner/shoe_sole_test/):
  sole_metrics_scarpa.csv    one row per shoe
  <slug>_sole_measured.png   per-shoe overlay
  _grid_scarpa_sole.png      4-column grid of all overlays

Rebuilt 2026-05-13 after the prior session's working copy was lost. Writes
go to the iCloud-mounted scanner folder so files survive session resets.
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

# All 40 Scarpa slot-F photos available in dist/images/shoes (verified
# 2026-05-13 by listing scarpa-*-F.jpg). Ordered alphabetically.
SCARPA = [
    "arpia-v",
    "arpia-v-lv",
    "booster",
    "boostic",
    "boostic-r",
    "chimera",
    "drago",
    "drago-lv",
    "drago-xt",
    "force-v",
    "furia-air",
    "generator",
    "generator-mid",
    "generator-v",
    "generator-womens",
    "instinct-lace",
    "instinct-s",
    "instinct-vs-mens",
    "instinct-vs-womens",
    "instinct-vsr-lv",
    "instinct-vsr-mens",
    "instinct-vsr-womens",
    "instinct-womens",
    "mago",
    "origin-mens",
    "origin-vs",
    "origin-vs-womens",
    "origin-womens",
    "reflex-mens",
    "reflex-womens",
    "vapor-lace",
    "vapor-lv",
    "vapor-s",
    "vapor-s-womens",
    "vapor-v-mens",
    "vapor-womens",
    "veloce",
    "veloce-l",
    "veloce-l-womens",
    "veloce-womens",
]

# Per-shoe horizontal-flip overrides (kept as a safety hatch; populated only
# if visual audit reveals a left/right inversion). Empty for Scarpa as of
# the 2026-05-13 rebuild.
FLIP_OVERRIDE: set[str] = set()

BG_THRESH = 25  # LAB-distance cutoff (handles Scarpa white-midfoot Veloce-L)


def run_one(slug: str, in_path: str) -> dict | None:
    try:
        m, _, _ = ssm.process(
            in_path,
            out_overlay=f"{OUT_DIR}/{slug}_sole_measured.png",
            bg_thresh=BG_THRESH,
            flip_horizontal=(slug in FLIP_OVERRIDE),
        )
    except Exception as e:
        print(f"FAIL {slug}: {e}")
        return None
    L = m["length_px"]
    return {
        "slug": slug,
        "brand": "scarpa",
        "length_px":      L,
        "ff_width_px":    m["ff_width_px"],
        "heel_width_px":  m["heel_width_px"],
        "ff_to_heel_px":  m["ff_to_heel_px"],
        "heel_cx_px":     round(m["heel_cx_px"],     2),
        "ff_cx_px":       round(m["ff_cx_px"],       2),
        "toe_cx_px":      round(m["toe_cx_px"],      2),
        "toe_drift_px":   round(m["toe_drift_px"],   2),
        "toe_form_px":    round(m["toe_form_px"],    2),
        "asym_height_px": round(m["asym_height_px"], 2),
        "ff_over_len":    round(m["ff_width_px"]   / L, 4),
        "heel_over_len":  round(m["heel_width_px"] / L, 4),
        "ff2heel_over_len": round(m["ff_to_heel_px"] / L, 4),
        "toe_form_over_len": round(m["toe_form_px"] / L, 4),
        "asym_height_over_len": round(m["asym_height_px"] / L, 4),
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
        cv2.putText(cap, slug, (8, 26),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                    (0, 0, 0), 1, cv2.LINE_AA)
        imgs.append(np.concatenate([cap, im], axis=0))

    if not imgs:
        return ""

    cell_w = max(im.shape[1] for im in imgs)
    padded = []
    for im in imgs:
        h, w = im.shape[:2]
        if w < cell_w:
            pad = np.full((h, cell_w - w, 3), 255, dtype=np.uint8)
            im = np.concatenate([im, pad], axis=1)
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
    for slug_short in SCARPA:
        slug = f"scarpa-{slug_short}"
        src = f"{IMG_DIR}/{slug}-F.jpg"
        if not os.path.isfile(src):
            print(f"MISS {slug}: no source file at {src}")
            failures.append((slug, "no source"))
            continue
        r = run_one(slug, src)
        if r is None:
            failures.append((slug, "measurement failed"))
            continue
        rows.append(r)
        print(
            f"OK   {slug:34s} "
            f"L={r['length_px']:>4d} "
            f"ff/L={r['ff_over_len']:.3f} "
            f"heel/L={r['heel_over_len']:.3f} "
            f"toe_form/L={r['toe_form_over_len']:.3f} "
            f"asym_h/L={r['asym_height_over_len']:+.3f}"
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
        print("\nFAILURES:")
        for slug, why in failures:
            print(f"  {slug}: {why}")


if __name__ == "__main__":
    main()
