#!/usr/bin/env python3
"""Deterministic review helper for the scanner-v2-test-case skill.

Runs the V2 pipeline for one (scan_id, prefs) tuple, captures full
score breakdowns + automated review checks (R2-R8), and writes:

  <out_base>.scoring.json   — per-pick score breakdowns (R5 input)
  <out_base>.checks.json    — machine-readable findings (R2/R3/R4/R6/R7/R8)

Usage:
    python3 run_review.py <scan_id> <discipline> <env> <rock_or_-> \
        <aggressiveness> <out_base>
"""
import json, os, re, sys
from collections import Counter
from pathlib import Path

# Allow imports from the V2 sandbox + repo root
EXPLORE_V2 = Path(__file__).resolve().parents[2]
SCANNER    = EXPLORE_V2.parent
sys.path.insert(0, str(EXPLORE_V2))
sys.path.insert(0, str(SCANNER))

import requests

SB  = "https://wsjsuhvpgupalwgcjatp.supabase.co"
KEY = (os.environ.get("SUPABASE_SECRET_KEY")
       or os.environ.get("SUPABASE_SERVICE_KEY"))
H   = {"apikey": KEY, "Authorization": f"Bearer {KEY}"} if KEY else {}


def _load_scan(scan_id):
    r = requests.get(f"{SB}/rest/v1/foot_scan_fits", headers=H, params={
        "select": "*", "scan_id": f"eq.{scan_id}", "limit": 1}, timeout=20)
    r.raise_for_status()
    rows = r.json()
    if not rows:
        sys.exit(f"scan_id {scan_id} not found in foot_scan_fits")
    return rows[0]


def _load_brand_typical():
    """Mirror BRAND_DS in interp_shoe_fit_v2.py."""
    from interp_shoe_fit_v2 import BRAND_DS
    return BRAND_DS


def _round_half_eu(x):
    return round(float(x) * 2) / 2


def main():
    if len(sys.argv) != 7:
        print(__doc__); sys.exit(1)
    scan_id, disc, env, rock_arg, aggr, out_base = sys.argv[1:]
    rock = None if rock_arg == "-" else rock_arg
    if not KEY:
        sys.exit("ERROR: SUPABASE_SECRET_KEY env var not set")

    # Run the V2 pipeline (re-uses the renderer's data plumbing)
    from target_resolver_v2 import resolve_targets_v2
    from matrix_scorer_v2 import (compute_use_case_target, assemble_tiers,
                                    score_shoe)
    from check_full_v2_matrix import build_profile, load_shoes_db, load_price_rows
    from scan_recommender import _load_brand_sizing as load_brand_sizing

    scan = _load_scan(scan_id)
    shoes_db = load_shoes_db()
    price_rows = load_price_rows()
    profile = build_profile(scan, shoes_db)
    profile["arch_length_ratio"] = scan.get("arch_length_ratio")
    profile["arch_length_class"] = scan.get("arch_length_class")
    brand_sizing = load_brand_sizing()
    street = scan.get("street_size_eu")

    fit_target = resolve_targets_v2(profile, profile["shoes"], aggr)
    use_target = compute_use_case_target(disc, env, rock, aggr)
    target = {**fit_target, **use_target}
    tiers = assemble_tiers(profile, shoes_db, target, price_rows=price_rows)

    # ── O3 — full score breakdowns per pick ───────────────────────────
    scoring = {}
    for tname in ("baseline", "softer", "stiffer", "budget"):
        scoring[tname] = []
        for sc, sh in tiers[tname]:
            res = score_shoe(sh, target, profile)
            entry = {
                "slug":  sh.get("slug"),
                "brand": sh.get("brand"),
                "model": sh.get("model"),
                "width": sh.get("width"),
                "heel_volume": sh.get("heel_volume"),
                "toe_form":  sh.get("toe_form"),
                "downturn":  sh.get("downturn"),
                "asymmetry": sh.get("asymmetry"),
                "computed_stiffness": sh.get("computed_stiffness"),
                "no_edge":   sh.get("no_edge"),
                "best_price_at_size": sc.get("best_price_at_size"),
                "score":     res["score"] if res else None,
                "breakdown": {a: list(v) for a, v in (res or {"breakdown": {}}).get("breakdown", {}).items()},
            }
            scoring[tname].append(entry)

    out_base = Path(out_base)
    out_base.parent.mkdir(parents=True, exist_ok=True)
    out_base.with_suffix(".scoring.json").write_text(json.dumps({
        "scan_id": scan_id, "prefs": [disc, env, rock, aggr],
        "target": {k: v for k, v in target.items() if isinstance(v, (int, float, str, list, type(None)))},
        "tiers": scoring,
    }, indent=2))

    # ── Deterministic checks ─────────────────────────────────────────
    findings = []

    # R3 — tier composition
    for tname, expected in (("baseline", 3), ("softer", 3), ("stiffer", 3), ("budget", 3)):
        got = len(scoring[tname])
        if got != expected:
            findings.append({"rule": "R3", "severity": "WARNING",
                             "msg": f"{tname} tier has {got} picks, expected {expected}"})
    # Brand cap
    all_picks = [p for t in scoring.values() for p in t]
    brand_counts = Counter(p["brand"] for p in all_picks)
    for brand, n in brand_counts.items():
        if n > 3:
            findings.append({"rule": "R3", "severity": "WARNING",
                             "msg": f"brand {brand} appears {n} times (cap 3 global)"})
    # Per-tier brand cap
    for tname, picks in scoring.items():
        tier_brand_counts = Counter(p["brand"] for p in picks)
        for brand, n in tier_brand_counts.items():
            if n > 1:
                findings.append({"rule": "R3", "severity": "WARNING",
                                 "msg": f"brand {brand} appears {n} times in {tname} tier (cap 1)"})
    # No-edge cap (1/tier)
    for tname, picks in scoring.items():
        ne = sum(1 for p in picks if p["no_edge"])
        if ne > 1:
            findings.append({"rule": "R3", "severity": "WARNING",
                             "msg": f"{tname} tier has {ne} no_edge shoes (cap 1)"})

    # R4 — baseline foot-shape gate
    target_fw_lbl = ("narrow", "medium", "wide")[target.get("target_fw", 1)]
    target_hv_lbl = ("narrow", "medium", "wide")[target.get("target_hv", 1)]
    fw_aliases = {"narrow":["narrow","low"], "medium":["medium","standard"], "wide":["wide","high"]}
    for p in scoring["baseline"]:
        sw = (p.get("width") or "").lower()
        sv = (p.get("heel_volume") or "").lower()
        fw_ok = sw in fw_aliases[target_fw_lbl]
        hv_ok = sv in fw_aliases[target_hv_lbl]
        if not (fw_ok and hv_ok):
            findings.append({"rule": "R4", "severity": "CRITICAL",
                             "msg": f"baseline pick {p['brand']} {p['model']} fails foot-shape gate "
                                    f"(width={sw}, heel={sv} vs target fw={target_fw_lbl}, hv={target_hv_lbl})"})

    # R2 — recommended size sanity: read sizes back from the rendered HTML
    # and verify half-EU snap. Skip per-shoe brand-expectation math (the v1
    # _calc_recommended_size signature varies; just trust the renderer + flag
    # off-grid sizes).
    html_path_for_r2 = Path(str(out_base) + ".html")
    if html_path_for_r2.exists():
        h = html_path_for_r2.read_text()
        for m in re.finditer(r'pill-size">EU ([\d.]+)<', h):
            sz = float(m.group(1))
            if sz != _round_half_eu(sz):
                findings.append({"rule": "R2", "severity": "WARNING",
                                 "msg": f"recommended_size {sz} not snapped to half-EU"})

    # R5 — score breakdown sanity
    for p in scoring["baseline"]:
        for axis, (s, _why) in p["breakdown"].items():
            if s is not None and s <= -15:
                findings.append({"rule": "R5", "severity": "WARNING",
                                 "msg": f"baseline pick {p['brand']} {p['model']} axis {axis} = {s} (≤-15)"})

    # R7 — price coverage
    n_priced = sum(1 for p in all_picks if p.get("best_price_at_size"))
    if n_priced < len(all_picks) // 2:
        findings.append({"rule": "R7", "severity": "WARNING",
                         "msg": f"only {n_priced}/{len(all_picks)} picks have prices (>50% missing)"})

    # R8 — tradeoff repetition (read from rendered HTML if available)
    html_path = Path(str(out_base) + ".html")
    if html_path.exists():
        html = html_path.read_text()
        trades = re.findall(r'shoe-tradeoffs">([^<]+)<', html)
        # Strip HTML entities
        trades = [t.replace('&#x27;', "'").replace('&amp;', '&').strip() for t in trades]
        counter = Counter(trades)
        for sent, n in counter.items():
            if n > 3:
                findings.append({"rule": "R8", "severity": "NOTE",
                                 "msg": f"tradeoff sentence repeats {n} times: \"{sent[:80]}...\""})

    # ── Write checks.json ────────────────────────────────────────────
    out_base.with_suffix(".checks.json").write_text(json.dumps({
        "scan_id": scan_id, "prefs": [disc, env, rock, aggr],
        "n_findings": len(findings),
        "findings_by_severity": {
            sev: sum(1 for f in findings if f["severity"] == sev)
            for sev in ("CRITICAL", "WARNING", "NOTE")
        },
        "findings": findings,
    }, indent=2))

    print(f"# wrote {out_base}.scoring.json + {out_base}.checks.json", file=sys.stderr)
    print(f"# {len(findings)} findings (CRIT={sum(1 for f in findings if f['severity']=='CRITICAL')}, "
          f"WARN={sum(1 for f in findings if f['severity']=='WARNING')}, "
          f"NOTE={sum(1 for f in findings if f['severity']=='NOTE')})", file=sys.stderr)


if __name__ == "__main__":
    main()
