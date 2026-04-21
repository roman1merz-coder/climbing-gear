#!/usr/bin/env python3
"""One-shot backfill of foot_scan_fits.browse_extended for any complete
scans that currently have it null.

Reuses scan_worker._build_browse_extended so the shape is guaranteed to
match what the worker writes for new scans + rescores. Does NOT touch
recommendations or interpretation columns.
"""
import sys, requests
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "benchmark"))

import scan_worker
import scan_recommender as sr
from benchmark.matrix_scorer import (
    load_shoes, load_brand_sizing, load_size_availability, load_best_prices,
    run_case_full,
)

H = {"apikey": sr.SB_KEY, "Authorization": f"Bearer {sr.SB_KEY}"}
HP = {**H, "Content-Type": "application/json"}


def main():
    print("Loading reference data...")
    shoes_db = load_shoes()
    brand_sizing = load_brand_sizing()
    size_avail = load_size_availability()
    best_prices = load_best_prices()
    shoe_by_slug = {s["slug"]: s for s in shoes_db}
    print(f"  {len(shoes_db)} shoes loaded")

    r = requests.get(
        f"{sr.SB_URL}/rest/v1/foot_scan_fits", headers=H,
        params={"select": "scan_id",
                "pipeline_stage": "eq.complete",
                "browse_extended": "is.null",
                "order": "created_at.desc"},
    )
    r.raise_for_status()
    ids = [row["scan_id"] for row in r.json()]
    print(f"Found {len(ids)} complete scans missing browse_extended")

    ok = 0
    skipped = 0
    failed = []
    for i, scan_id in enumerate(ids, 1):
        try:
            scan_data = sr.fetch_scan_data(scan_id)
            if not scan_data or scan_data.get("toe_shape") is None:
                print(f"  [{i}/{len(ids)}] {scan_id}: SKIP (no measurements)")
                skipped += 1
                continue
            merged = dict(scan_data)
            merged["shoes"] = scan_data.get("shoes") or []
            tier_result = run_case_full(
                {"profile": merged}, shoes_db, brand_sizing, size_avail,
                best_prices=best_prices,
            )
            be = scan_worker._build_browse_extended(
                tier_result, merged, shoes_db, brand_sizing,
                best_prices, shoe_by_slug,
            )
            w = requests.patch(
                f"{sr.SB_URL}/rest/v1/foot_scan_fits", headers=HP,
                params={"scan_id": f"eq.{scan_id}"},
                json={"browse_extended": be},
            )
            w.raise_for_status()
            counts = {t: len(be["tiers"][t])
                      for t in ("baseline", "softer", "stiffer", "budget")}
            print(f"  [{i}/{len(ids)}] {scan_id}: OK {counts}")
            ok += 1
        except Exception as e:
            print(f"  [{i}/{len(ids)}] {scan_id}: FAIL {e!r}")
            failed.append((scan_id, str(e)))

    print()
    print(f"Done: {ok}/{len(ids)} succeeded, {skipped} skipped")
    if failed:
        print("Failures:")
        for sid, err in failed:
            print(f"  {sid}: {err}")


if __name__ == "__main__":
    main()
