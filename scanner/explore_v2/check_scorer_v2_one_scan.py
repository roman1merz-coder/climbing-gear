#!/usr/bin/env python3
"""Sandbox harness: score one real scan against the v2 scorer.

Picks the most recent scan, picks a synthetic v2 input combo, and prints
the top 5 shoes with a per-axis breakdown. Lets us eyeball whether the
9 axes sum to sensible totals before wiring this into scan_worker.

Tweak DISCIPLINE/ENV/ROCK/AGGRESSIVENESS at the top of main() to explore.
"""
import os, sys, json, requests
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from target_resolver_v2 import resolve_targets_v2
from matrix_scorer_v2 import (
    score_shoe, compute_use_case_target, apply_post_caps,
    SCORING_AXES, HARD_FILTERS,
)

SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY",
    "MUST_BE_SET_VIA_ENV")
HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}


def load_latest_scan():
    r = requests.get(f"{SB_URL}/rest/v1/foot_scan_fits", headers=HEADERS,
        params={
            "select": (
                "id,created_at,sex,toe_shape,toe_confidence,"
                "hva_offset_ratio,hallux_valgus_class,instep_height_ratio,"
                "forefoot_width_ratio,heel_width_ratio,heel_depth_ratio,"
                "shoes,street_size_eu"
            ),
            "order": "created_at.desc", "limit": 1,
        }, timeout=30)
    r.raise_for_status()
    js = r.json()
    return js[0] if js else None


def load_shoes_db():
    r = requests.get(f"{SB_URL}/rest/v1/shoes", headers=HEADERS,
        params={"select": (
            "slug,brand,model,closure,downturn,asymmetry,toe_form,"
            "computed_stiffness,use_cases,best_rock_types,kids_friendly,"
            "ankle_protection,width,heel_volume,forefoot_volume,no_edge"
        ), "limit": 1000}, timeout=30)
    r.raise_for_status()
    return r.json()


def lookup_db(shoes_db, brand, model):
    if not brand or not model: return None
    key = f"{(brand or '').strip().lower()} {(model or '').strip().lower()}"
    for s in shoes_db:
        k = f"{s['brand'].strip().lower()} {s['model'].strip().lower()}"
        if k == key:
            return s
    for s in shoes_db:
        k = f"{s['brand'].strip().lower()} {s['model'].strip().lower()}"
        if key in k or k in key:
            return s
    return None


def normalize_user_shoes(raw, shoes_db):
    if isinstance(raw, str):
        try: raw = json.loads(raw)
        except: raw = []
    out = []
    for us in raw or []:
        db = lookup_db(shoes_db, us.get("brand"), us.get("model"))
        out.append({
            "brand": us.get("brand", ""),
            "model": us.get("model", ""),
            "db_width": db.get("width") if db else None,
            "db_heel_volume": db.get("heel_volume") if db else None,
            "db_forefoot_volume": db.get("forefoot_volume") if db else None,
            "fit": us.get("fit") or {},
        })
    return out


def main():
    # ── tweakables ────────────────────────────────────────────────────
    DISCIPLINE     = "sport"
    ENVIRONMENT    = "outdoor"
    ROCK           = "limestone"
    AGGRESSIVENESS = "moderate"
    TOP_N          = 5
    # ──────────────────────────────────────────────────────────────────

    print(f"# combo = {DISCIPLINE} / {ENVIRONMENT} / {ROCK} / {AGGRESSIVENESS}",
          file=sys.stderr)
    print("# loading scan + shoes...", file=sys.stderr)
    scan = load_latest_scan()
    shoes_db = load_shoes_db()
    print(f"# scan {scan['id'][:8]}, {len(shoes_db)} shoes", file=sys.stderr)

    profile = {
        "toe_shape":             scan.get("toe_shape"),
        "toe_confidence":        scan.get("toe_confidence"),
        "hva_offset_ratio":      scan.get("hva_offset_ratio"),
        "instep_height_ratio":   scan.get("instep_height_ratio"),
        "forefoot_width_ratio":  scan.get("forefoot_width_ratio"),
        "heel_width_ratio":      scan.get("heel_width_ratio"),
        "heel_depth_ratio":      scan.get("heel_depth_ratio"),
        "street_size_eu":        scan.get("street_size_eu"),
        "shoes":                 scan.get("shoes") or [],
    }
    user_shoes = normalize_user_shoes(profile["shoes"], shoes_db)

    # Build merged target dict
    fit_target = resolve_targets_v2(profile, user_shoes, AGGRESSIVENESS)
    use_target = compute_use_case_target(DISCIPLINE, ENVIRONMENT, ROCK, AGGRESSIVENESS)
    target = {**fit_target, **use_target}

    # Print target summary
    print()
    print("## TARGET")
    print(f"  fw={fit_target['target_fw']} ({fit_target.get('target_fw') and ['narrow','medium','wide'][fit_target['target_fw']]})")
    print(f"  hv={fit_target['target_hv']} ({['narrow','medium','wide'][fit_target['target_hv']]})")
    print(f"  fv={fit_target['target_fv']} ({['low','medium','high'][fit_target['target_fv']]})")
    print(f"  asym={fit_target['target_asym']} ({fit_target['target_asym_lbl']})  "
          f"  reason: {fit_target['asym_reason']}")
    print(f"  dt={fit_target['target_dt']} ({fit_target['target_dt_lbl']})")
    print(f"  stiff={use_target['stiff_target']:.2f} window=[{use_target['stiff_lo']:.2f},{use_target['stiff_hi']:.2f}]")
    print(f"  closure pref={use_target['closure_pref']}  bad={use_target['closure_bad']}")
    print(f"  ankle_required={use_target['ankle_required']}")

    # Score every shoe
    scored = []
    filtered = 0
    for s in shoes_db:
        r = score_shoe(s, target, profile)
        if r is None:
            filtered += 1
            continue
        scored.append((r, s))

    print(f"\n# {len(scored)} shoes scored, {filtered} hard-filtered", file=sys.stderr)

    top = apply_post_caps(scored, top_n=TOP_N, brand_cap=2, no_edge_cap=1)

    print(f"\n## TOP {TOP_N} (after brand cap=2 + no_edge cap=1)")
    for rank, (r, s) in enumerate(top, 1):
        ne = " [no_edge]" if s.get("no_edge") else ""
        print(f"\n{rank}. {s['brand']} {s['model']}{ne}  →  total = {r['score']}")
        for axis_name, _ in SCORING_AXES:
            score, note = r["breakdown"][axis_name]
            sign = "+" if score >= 0 else ""
            print(f"     {axis_name:<16} {sign}{score:>4}   {note}")

    print()
    print("# (use SCORING_AXES order; tweak DISCIPLINE/ENV/ROCK/AGG at top of main())")


if __name__ == "__main__":
    main()
