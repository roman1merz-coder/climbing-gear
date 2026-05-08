#!/usr/bin/env python3
"""Sandbox harness: render P1 / P2 / P3 for all 12 v2 picks against the
latest real scan. Lets us eyeball the new P3 (tradeoffs) wording across
baseline/softer/stiffer/budget tiers.
"""
import os, sys, json, requests
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from target_resolver_v2 import resolve_targets_v2
from matrix_scorer_v2 import (
    compute_use_case_target, assemble_tiers,
    PER_TIER_BRAND_CAP, GLOBAL_BRAND_CAP, PER_TIER_NO_EDGE_CAP,
    BUDGET_POOL_SIZE,
)
from interp_shoe_desc_v2 import (
    flatten_pick, generate_shoe_description_v2,
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
                "instep_height_class,"
                "forefoot_width_ratio,forefoot_width_class,"
                "heel_width_ratio,heel_width_class,"
                "heel_depth_ratio,heel_depth_class,"
                "shoes,street_size_eu,next_shoe_preference,next_shoe_notes"
            ),
            "order": "created_at.desc", "limit": 1,
        }, timeout=30)
    r.raise_for_status()
    return r.json()[0]


def load_shoes_db():
    r = requests.get(f"{SB_URL}/rest/v1/shoes", headers=HEADERS,
        params={"select": (
            "slug,brand,model,closure,downturn,asymmetry,toe_form,"
            "computed_stiffness,use_cases,best_rock_types,kids_friendly,"
            "ankle_protection,width,heel_volume,forefoot_volume,no_edge,"
            "rubber_thickness_mm,rubber_type,midsole_stiffness,"
            "rubber_hardness,description,feel,heel_rubber_coverage,"
            "midsole,break_in_period,stretch_expectation"
        ), "limit": 1000}, timeout=30)
    r.raise_for_status()
    return r.json()


def load_price_rows():
    rows, offset = [], 0
    while True:
        r = requests.get(f"{SB_URL}/rest/v1/shoe_prices", headers=HEADERS,
            params={"select": "product_slug,price_eur,in_stock,sizes_available",
                    "limit": 1000, "offset": offset}, timeout=30)
        r.raise_for_status()
        b = r.json()
        if not b: break
        rows.extend(b)
        offset += 1000
    return rows


def lookup_db(shoes_db, brand, model):
    if not brand or not model: return None
    key = f"{(brand or '').strip().lower()} {(model or '').strip().lower()}"
    for s in shoes_db:
        k = f"{s['brand'].strip().lower()} {s['model'].strip().lower()}"
        if k == key: return s
    for s in shoes_db:
        k = f"{s['brand'].strip().lower()} {s['model'].strip().lower()}"
        if key in k or k in key: return s
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
            "db_downturn": db.get("downturn") if db else None,
            "db_asymmetry": db.get("asymmetry") if db else None,
            "db_stiffness": db.get("computed_stiffness") if db else None,
            "fit": us.get("fit") or {},
        })
    return out


def render_tier(name, picks, profile, target, all_picks_flat,
                price_lookup=None):
    print(f"\n## {name.upper()} (n={len(picks)})")
    for sc, sh in picks:
        best_price = price_lookup.get(sh["slug"]) if price_lookup else None
        pick = flatten_pick(sc, sh, tier=name, target=target,
                            best_price=best_price)
        paras = generate_shoe_description_v2(pick, profile,
                                             all_picks=all_picks_flat)
        print(f"\n  ── {sh['brand']} {sh['model']}  score={sc['score']}"
              + (f"  €{best_price:.0f}" if best_price else ""))
        for j, p in enumerate(paras, 1):
            print(f"    [P{j}] {p}")
        # Show breakdown for transparency
        bd_compact = ", ".join(
            f"{k}={v[0] if isinstance(v, tuple) else v:+d}"
            for k, v in sorted((sc.get("breakdown") or {}).items())
        )
        print(f"    breakdown: {bd_compact}")


def main():
    DISCIPLINE     = "sport"
    ENVIRONMENT    = "outdoor"
    ROCK           = "limestone"
    AGGRESSIVENESS = "moderate"

    print(f"# combo = {DISCIPLINE}/{ENVIRONMENT}/{ROCK}/{AGGRESSIVENESS}",
          file=sys.stderr)
    scan      = load_latest_scan()
    shoes_db  = load_shoes_db()
    price_rows = load_price_rows()
    print(f"# scan {scan['id'][:8]}, {len(shoes_db)} shoes, "
          f"{len(price_rows)} price rows", file=sys.stderr)

    profile = {
        "toe_shape":             scan.get("toe_shape"),
        "toe_confidence":        scan.get("toe_confidence"),
        "hva_offset_ratio":      scan.get("hva_offset_ratio"),
        "hallux_valgus_class":   scan.get("hallux_valgus_class"),
        "instep_height_ratio":   scan.get("instep_height_ratio"),
        "instep_height_class":   scan.get("instep_height_class"),
        "forefoot_width_ratio":  scan.get("forefoot_width_ratio"),
        "forefoot_width_class":  scan.get("forefoot_width_class"),
        "heel_width_ratio":      scan.get("heel_width_ratio"),
        "heel_width_class":      scan.get("heel_width_class"),
        "heel_depth_ratio":      scan.get("heel_depth_ratio"),
        "heel_depth_class":      scan.get("heel_depth_class"),
        "street_size_eu":        scan.get("street_size_eu"),
        "next_shoe_preference":  scan.get("next_shoe_preference"),
        "next_shoe_notes":       scan.get("next_shoe_notes"),
        "shoes":                 normalize_user_shoes(scan.get("shoes") or [], shoes_db),
    }

    fit_target = resolve_targets_v2(profile, profile["shoes"], AGGRESSIVENESS)
    use_target = compute_use_case_target(DISCIPLINE, ENVIRONMENT, ROCK, AGGRESSIVENESS)
    target = {**fit_target, **use_target}

    print("## TARGET")
    print(f"  fw={fit_target['target_fw']}  hv={fit_target['target_hv']}  "
          f"fv={fit_target['target_fv']}")
    print(f"  asym={fit_target['target_asym_lbl']}  dt={fit_target['target_dt_lbl']}")
    print(f"  stiff anchor={use_target['stiff_target']:.2f}  "
          f"window=[{use_target['stiff_lo']:.2f},{use_target['stiff_hi']:.2f}]")

    tiers = assemble_tiers(profile, shoes_db, target, price_rows=price_rows)

    # Build a flat all-picks list (used for peer-suppression in P3)
    all_picks_flat = []
    for tname in ("baseline", "softer", "stiffer", "budget"):
        for sc, sh in tiers[tname]:
            all_picks_flat.append(flatten_pick(sc, sh, tier=tname, target=target))

    # Look up budget prices
    price_lookup = {sc.get("best_price_at_size"): None for sc, _ in tiers["budget"]}
    # actually best price was annotated onto the score dict in _select_budget
    price_lookup = {}
    for sc, sh in tiers["budget"]:
        if sc.get("best_price_at_size") is not None:
            price_lookup[sh["slug"]] = sc["best_price_at_size"]

    render_tier("baseline", tiers["baseline"], profile, target, all_picks_flat)
    render_tier("softer",   tiers["softer"],   profile, target, all_picks_flat)
    render_tier("stiffer",  tiers["stiffer"],  profile, target, all_picks_flat)
    render_tier("budget",   tiers["budget"],   profile, target, all_picks_flat,
                price_lookup=price_lookup)


if __name__ == "__main__":
    main()
