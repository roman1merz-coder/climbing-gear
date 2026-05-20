#!/usr/bin/env python3
"""Worker-cutover gate: confirm scan_worker._generate_recommendations_v2
reproduces the locked golden baselines exactly.

This exercises the production glue - the worker's sys.path setup, its
import of explore_v2/v2_pipeline, _load_v2_engine_data, the V2 feature
flag, and the result payload shape - without needing SAM3 / photos.

scan_recommender.update_scan is stubbed so nothing is written to the DB.

    SUPABASE_SECRET_KEY=... python3 golden_worker_check.py
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

from golden_run import GOLDEN_CASES, fetch_scan, BASELINE_DIR


def main():
    import scan_recommender
    import scan_worker

    # Stub the DB write - capture the payload instead.
    captured = {}

    def _fake_update(scan_id, data):
        captured[scan_id] = data
        return {}

    scan_recommender.update_scan = _fake_update

    # Feature-flag logic.
    flag_fails = 0
    if scan_worker._scan_wants_v2({}) is not False:
        print("  _scan_wants_v2({}) should be False"); flag_fails += 1
    if scan_worker._scan_wants_v2(
            {"discipline": "sport", "environment": "indoor"}) is not False:
        print("  _scan_wants_v2 without aggressiveness should be False"); flag_fails += 1
    if scan_worker._scan_wants_v2(
            {"discipline": "sport", "environment": "indoor",
             "aggressiveness": "balanced"}) is not True:
        print("  _scan_wants_v2 with all 3 should be True"); flag_fails += 1
    print(f"  feature-flag logic: {'OK' if flag_fails == 0 else 'FAIL'}")

    fails = flag_fails
    for (name, scan_id, disc, env, rock, agg) in GOLDEN_CASES:
        # Real rows have no V2 inputs (they are V1 scans); inject the
        # golden case's preference set so _generate_recommendations_v2
        # sees them, exactly as a live V2 scan row would carry them.
        row = fetch_scan(scan_id)
        row = {**row, "discipline": disc, "environment": env,
               "rock_type": rock, "aggressiveness": agg}
        captured.clear()
        n = scan_worker._generate_recommendations_v2(scan_id, {}, row)
        written = captured.get(scan_id)
        if not written:
            fails += 1
            print(f"  {name:34s}  *** no DB write captured ***")
            continue
        problems = []
        if written.get("pipeline_stage") != "complete":
            problems.append(f"stage={written.get('pipeline_stage')}")
        if written.get("pipeline_version") != "v2":
            problems.append(f"version={written.get('pipeline_version')}")
        result = {"interpretation": written.get("interpretation"),
                  "recommendations": written.get("recommendations")}
        baseline = json.loads((BASELINE_DIR / f"{name}.json").read_text(encoding="utf-8"))
        same = (json.dumps(result, sort_keys=True, ensure_ascii=False)
                == json.dumps(baseline, sort_keys=True, ensure_ascii=False))
        if not same:
            problems.append("output != golden baseline")
        if problems:
            fails += 1
            print(f"  {name:34s}  *** {' | '.join(problems)} ***")
        else:
            print(f"  {name:34s}  worker output == golden ({n} recs)")

    print(f"\n# {fails} failure(s)")
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    if not (os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")):
        print("SUPABASE_SECRET_KEY must be set", file=sys.stderr)
        sys.exit(3)
    sys.exit(main())
