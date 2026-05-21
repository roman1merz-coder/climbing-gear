#!/usr/bin/env python3
"""V2 go-live golden-case regression gate.

A golden case is a frozen (scan_id + 4 V2 preference inputs) tuple with
its build_v2_results() output locked to disk. Before the worker cutover
flips to V2, every golden case must reproduce its locked output exactly.

The 15 cases below were picked from production scans (2026-05-20) to
span the dimension extremes - very narrow / very wide forefoot, shallow
/ deep heel, high / low instep, every toe shape, HVA none/mild/pronounced
- crossed with the preference space (all 3 disciplines, all 3
environments, all 4 rock types, all 4 aggressiveness levels).

Usage:
    SUPABASE_SECRET_KEY=... python3 golden_run.py gen      # lock baselines
    SUPABASE_SECRET_KEY=... python3 golden_run.py verify   # regression check

Both modes also run structural sanity checks (3 interp sections, 4 rec
tiers, half-EU sizes, no banned copy).
"""
import json
import os
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent          # explore_v2/golden
_EXPLORE = _HERE.parent                          # explore_v2
_SCANNER = _EXPLORE.parent                       # scanner
for _p in (str(_EXPLORE), str(_SCANNER)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import requests
from v2_pipeline import build_v2_results
from check_full_v2_matrix import load_shoes_db, load_price_rows
from scan_recommender import _load_brand_sizing

SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SB_KEY = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
BASELINE_DIR = _HERE / "baseline"

# ---------------------------------------------------------------------
# The 15 golden cases.  rock is None for indoor / both environments.
# ---------------------------------------------------------------------
GOLDEN_CASES = [
    # name, scan_id, discipline, environment, rock, aggressiveness
    ("narrow_greek_sport_outdoor",      "scan-2026-03-06T17-59-21", "sport",           "outdoor", "limestone", "balanced"),
    ("narrow_egyptian_high_instep",     "scan-2026-04-17T18-15-45", "boulder",         "indoor",  None,        "aggressive"),
    ("wide_egyptian_hva_pronounced",    "scan-2026-05-19T14-43-26", "sport",           "outdoor", "granite",   "comfort"),
    ("wide_egyptian_hva_mild_trad",     "scan-2026-04-08T18-25-58", "trad_multipitch", "outdoor", "granite",   "comfort"),
    ("shallow_heel_greek_boulder",      "scan-2026-03-30T21-09-52", "boulder",         "indoor",  None,        "moderate"),
    ("shallow_heel_egyptian_sandstone", "scan-2026-05-03T14-51-02", "sport",           "outdoor", "sandstone", "balanced"),
    ("deep_heel_egyptian_boulder",      "scan-2026-03-31T15-18-23", "boulder",         "outdoor", "sandstone", "aggressive"),
    ("deep_heel_egyptian_2shoe_both",   "scan-2026-05-01T19-14-14", "sport",           "both",    None,        "balanced"),
    ("low_instep_roman_trad",           "scan-2026-05-11T16-07-54", "trad_multipitch", "outdoor", "limestone", "comfort"),
    ("hva_pronounced_egyptian_boulder", "scan-2026-05-16T09-40-14", "boulder",         "indoor",  None,        "moderate"),
    ("greek_6shoe_sport_aggressive",    "scan-2026-04-18T00-23-40", "sport",           "outdoor", "limestone", "aggressive"),
    ("greek_5shoe_boulder_mixed",       "scan-2026-05-19T14-28-51", "boulder",         "outdoor", "mixed",     "moderate"),
    ("roman_5shoe_sport_indoor",        "scan-2026-04-16T09-08-56", "sport",           "indoor",  None,        "balanced"),
    ("roman_4shoe_trad_mixed",          "scan-2026-04-26T20-18-19", "trad_multipitch", "outdoor", "mixed",     "comfort"),
    ("egyptian_5shoe_boulder_granite",  "scan-2026-04-26T20-39-30", "boulder",         "outdoor", "granite",   "aggressive"),
]


def fetch_scan(scan_id):
    r = requests.get(f"{SB_URL}/rest/v1/foot_scan_fits", headers=HEADERS,
                     params={"select": "*", "scan_id": f"eq.{scan_id}", "limit": 1},
                     timeout=30)
    r.raise_for_status()
    rows = r.json()
    if not rows:
        raise RuntimeError(f"no scan row for {scan_id}")
    return rows[0]


def _canon(obj):
    """Stable JSON string for deep comparison."""
    return json.dumps(obj, sort_keys=True, ensure_ascii=False)


def _sanity(name, result):
    """Structural checks. Returns list of warning strings (empty = clean)."""
    warns = []
    interp = result.get("interpretation") or []
    recs = result.get("recommendations") or []
    titles = [b.get("title") for b in interp]
    expect_titles = ["Your Foot Shape",
                     "What Your Current Shoe Fit Tells Us",
                     "What to Look For"]
    if titles != expect_titles:
        warns.append(f"interp titles {titles} != {expect_titles}")
    for b in interp:
        paras = b.get("paragraphs") or []
        if not paras or not any((p or "").strip() for p in paras):
            warns.append(f"interp block '{b.get('title')}' has no paragraphs")
    cats = {}
    for r in recs:
        cats[r.get("category")] = cats.get(r.get("category"), 0) + 1
    for tier in ("baseline", "softer", "stiffer", "budget"):
        if cats.get(tier, 0) == 0:
            warns.append(f"tier '{tier}' has 0 recommendations")
    if len(recs) != 12:
        warns.append(f"{len(recs)} recommendations (expected 12)")
    # User-facing copy checks.
    facing = []
    for b in interp:
        facing.extend(b.get("paragraphs") or [])
    for r in recs:
        facing.extend([r.get("description"), r.get("why"), r.get("tradeoffs")])
        if r.get("slug") is None or r.get("brand") is None or r.get("model") is None:
            warns.append(f"rec missing slug/brand/model: {r}")
        sz = r.get("recommended_size_eu")
        if sz is not None and round(sz * 2) != sz * 2:
            warns.append(f"rec size {sz} not half-EU ({r.get('slug')})")
    for txt in facing:
        if not txt:
            continue
        if "—" in txt or "–" in txt:
            warns.append(f"em/en dash in copy: {txt[:60]!r}")
        if "cinch" in txt.lower():
            warns.append(f"banned word 'cinch' in copy: {txt[:60]!r}")
    return warns


def run_all(shoes_db, price_rows, brand_sizing):
    """Build results for every golden case. Returns {name: result}."""
    out = {}
    for (name, scan_id, disc, env, rock, agg) in GOLDEN_CASES:
        scan = fetch_scan(scan_id)
        result = build_v2_results(scan, shoes_db, price_rows, brand_sizing,
                                  disc, env, rock, agg)
        # browse_extended is a price-sensitive derived browse list; it is
        # not part of the golden lock (interpretation + recommendations).
        result.pop("browse_extended", None)
        out[name] = result
    return out


def cmd_gen():
    BASELINE_DIR.mkdir(parents=True, exist_ok=True)
    shoes_db = load_shoes_db()
    price_rows = load_price_rows()
    brand_sizing = _load_brand_sizing()
    print(f"# loaded {len(shoes_db)} shoes, {len(price_rows)} price rows, "
          f"{len(brand_sizing)} brands\n")
    results = run_all(shoes_db, price_rows, brand_sizing)
    total_warn = 0
    for name, result in results.items():
        path = BASELINE_DIR / f"{name}.json"
        path.write_text(json.dumps(result, indent=2, ensure_ascii=False,
                                   sort_keys=True), encoding="utf-8")
        warns = _sanity(name, result)
        total_warn += len(warns)
        n_recs = len(result.get("recommendations") or [])
        flag = "  !! " + " | ".join(warns) if warns else "  ok"
        print(f"  {name:34s} {n_recs:2d} recs{flag}")
    print(f"\n# wrote {len(results)} baselines to {BASELINE_DIR}")
    print(f"# {total_warn} sanity warning(s)")
    return 0 if total_warn == 0 else 2


def cmd_verify():
    shoes_db = load_shoes_db()
    price_rows = load_price_rows()
    brand_sizing = _load_brand_sizing()
    results = run_all(shoes_db, price_rows, brand_sizing)
    fails = 0
    missing = 0
    for name, result in results.items():
        path = BASELINE_DIR / f"{name}.json"
        if not path.exists():
            print(f"  {name:34s}  NO BASELINE")
            missing += 1
            continue
        baseline = json.loads(path.read_text(encoding="utf-8"))
        if _canon(baseline) == _canon(result):
            print(f"  {name:34s}  PASS")
        else:
            fails += 1
            print(f"  {name:34s}  *** MISMATCH ***")
            _show_diff(baseline, result)
    print(f"\n# {len(results)-fails-missing} pass, {fails} mismatch, "
          f"{missing} missing baseline")
    return 0 if (fails == 0 and missing == 0) else 1


def _show_diff(baseline, result):
    """Print the first few differing fields."""
    b_interp = baseline.get("interpretation") or []
    r_interp = result.get("interpretation") or []
    for i in range(max(len(b_interp), len(r_interp))):
        bb = b_interp[i] if i < len(b_interp) else {}
        rr = r_interp[i] if i < len(r_interp) else {}
        if _canon(bb) != _canon(rr):
            print(f"      interp[{i}] '{bb.get('title')}' differs")
    b_recs = baseline.get("recommendations") or []
    r_recs = result.get("recommendations") or []
    if len(b_recs) != len(r_recs):
        print(f"      rec count {len(b_recs)} -> {len(r_recs)}")
    for i in range(min(len(b_recs), len(r_recs))):
        if _canon(b_recs[i]) != _canon(r_recs[i]):
            print(f"      rec[{i}] {b_recs[i].get('slug')} -> {r_recs[i].get('slug')}")


if __name__ == "__main__":
    if not SB_KEY:
        print("SUPABASE_SECRET_KEY must be set", file=sys.stderr)
        sys.exit(3)
    mode = sys.argv[1] if len(sys.argv) > 1 else "gen"
    if mode == "gen":
        sys.exit(cmd_gen())
    elif mode == "verify":
        sys.exit(cmd_verify())
    else:
        print(f"unknown mode {mode!r} (use gen|verify)", file=sys.stderr)
        sys.exit(3)
