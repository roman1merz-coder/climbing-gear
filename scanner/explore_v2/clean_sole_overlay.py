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
from PIL import Image

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
SILHOUETTE_RGB = (213, 205, 191)
SIL_TOL = 25

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


def clean_overlay(img):
    """Strip avg silhouette outline + HVA text label + bottom legend.
    Returns the cleaned PIL Image."""
    arr = np.array(img)
    h, w, _ = arr.shape

    # 1. Strip the silhouette outline globally (the AA-line color is
    # distinct from amber + green, so this only removes the outline).
    strip_color(arr, SILHOUETTE_RGB, SIL_TOL)

    # 2. Strip the HVA text label (only in the top band where it sits).
    # The HVA text uses BGR (60,140,200) which is similar to AMBER
    # (66,138,201). Restrict to the top band so we don't touch the
    # amber foot outline lower down.
    top_band = arr[HVA_TEXT_TOP:HVA_TEXT_BOTTOM]
    strip_color(top_band, HVA_RGB, HVA_TOL)

    # 3. Crop the bottom legend area entirely.
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
