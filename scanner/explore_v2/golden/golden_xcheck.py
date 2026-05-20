#!/usr/bin/env python3
"""Fidelity cross-check: confirm v2_pipeline's extracted helpers produce
identical output to the reference definitions in render_v2_review_static.py.

This guards against transcription error in the extraction performed at
V2 go-live (2026-05-20). If this passes, v2_pipeline is a faithful
restatement of the validated reference implementation.

    SUPABASE_SECRET_KEY=... python3 golden_xcheck.py
"""
import json
import os
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_EXPLORE = _HERE.parent
_SCANNER = _EXPLORE.parent
for _p in (str(_EXPLORE), str(_SCANNER)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import requests
import v2_pipeline as V
import render_v2_review_static as R
from target_resolver_v2 import resolve_targets_v2
from matrix_scorer_v2 import compute_use_case_target
from golden_run import GOLDEN_CASES, fetch_scan
from check_full_v2_matrix import load_shoes_db, load_price_rows


def main():
    shoes_db = load_shoes_db()
    fails = 0

    # calc_rec_size + _norm_cup: exhaustive small-input check.
    bs = {"La Sportiva": 1.5, "Scarpa": 1.0, "Tenaya": 2.0}
    for brand in list(bs) + ["Unknown"]:
        for street in (38, 41.5, 44, None):
            for pref in ("performance", "comfort"):
                a = R.calc_rec_size([], brand, bs, street, pref)
                b = V.calc_rec_size([], brand, bs, street, pref)
                if a != b:
                    print(f"  calc_rec_size MISMATCH {brand} {street} {pref}: {a} != {b}")
                    fails += 1
    for lbl in ("standard", "low", "high", "narrow", "wide", "medium", None, ""):
        if R._norm_cup(lbl) != V._norm_cup(lbl):
            print(f"  _norm_cup MISMATCH {lbl!r}")
            fails += 1

    # _shoe_fit_with_artifact_filter: identical output on every golden profile.
    for (name, scan_id, disc, env, rock, agg) in GOLDEN_CASES:
        scan = fetch_scan(scan_id)
        profile = V.build_profile(scan, shoes_db)
        fit_target = resolve_targets_v2(profile, profile["shoes"], agg)
        use_target = compute_use_case_target(disc, env, rock, agg)
        target = {**fit_target, **use_target}
        r_out = list(R._shoe_fit_with_artifact_filter(profile, target=target))
        v_out = list(V._shoe_fit_with_artifact_filter(profile, target=target))
        if r_out != v_out:
            fails += 1
            print(f"  {name:34s}  *** _shoe_fit MISMATCH ***")
            for i in range(max(len(r_out), len(v_out))):
                rr = r_out[i] if i < len(r_out) else "<missing>"
                vv = v_out[i] if i < len(v_out) else "<missing>"
                if rr != vv:
                    print(f"      para[{i}] ref={rr!r}")
                    print(f"      para[{i}] v2 ={vv!r}")
        else:
            print(f"  {name:34s}  helpers match")

    print(f"\n# {fails} fidelity mismatch(es)")
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    if not (os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")):
        print("SUPABASE_SECRET_KEY must be set", file=sys.stderr)
        sys.exit(3)
    sys.exit(main())
