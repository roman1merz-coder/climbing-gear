#!/usr/bin/env python3
"""Sandbox harness: assemble all 4 v2 tiers for one real scan.

Loads the latest scan + the full shoes catalog + the shoe_prices table,
runs assemble_tiers with a hand-picked (discipline, env, rock, agg)
combo, and prints baseline / softer / stiffer / budget side by side
with brand and no_edge tracking.

Tweak the constants in main() to explore other combos.
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
    TIER_SIZE, BUDGET_POOL_SIZE,
)

SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2MDc5MSwiZXhwIjoyMDg2MTM2NzkxfQ.6cYE1ElsvX7-BTc1DD15zoPJyr4L3bN0_QyKRQmp3M4")
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


def load_price_rows():
    """Paginate full shoe_prices table."""
    rows = []
    offset = 0
    while True:
        r = requests.get(f"{SB_URL}/rest/v1/shoe_prices", headers=HEADERS,
            params={"select": "product_slug,price_eur,in_stock,sizes_available",
                    "limit": 1000, "offset": offset}, timeout=30)
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        rows.extend(batch)
        offset += 1000
    return rows


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


def print_tier(name, picks, show_price=False):
    print(f"\n## {name.upper()} (n={len(picks)})")
    if not picks:
        print("    (empty)")
        return
    for i, (sc, s) in enumerate(picks, 1):
        ne = " [no_edge]" if s.get("no_edge") else ""
        line = f"  {i}. {s['brand']} {s['model']}{ne}  score={sc['score']}"
        if show_price:
            p = sc.get("best_price_at_size")
            line += f"  price={p:.0f} EUR" if p else "  price=??"
        print(line)


def main():
    DISCIPLINE     = "sport"
    ENVIRONMENT    = "outdoor"
    ROCK           = "limestone"
    AGGRESSIVENESS = "moderate"

    print(f"# combo = {DISCIPLINE} / {ENVIRONMENT} / {ROCK} / {AGGRESSIVENESS}",
          file=sys.stderr)
    print("# loading scan + shoes + prices...", file=sys.stderr)
    scan = load_latest_scan()
    shoes_db = load_shoes_db()
    price_rows = load_price_rows()
    print(f"# scan {scan['id'][:8]}, {len(shoes_db)} shoes, "
          f"{len(price_rows)} price rows", file=sys.stderr)

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

    fit_target = resolve_targets_v2(profile, user_shoes, AGGRESSIVENESS)
    use_target = compute_use_case_target(DISCIPLINE, ENVIRONMENT, ROCK, AGGRESSIVENESS)
    target = {**fit_target, **use_target}

    print()
    print("## TARGET")
    print(f"  fw={fit_target['target_fw']}  hv={fit_target['target_hv']}  "
          f"fv={fit_target['target_fv']}")
    print(f"  asym={fit_target['target_asym_lbl']}  dt={fit_target['target_dt_lbl']}")
    print(f"  stiff anchor={use_target['stiff_target']:.2f}  "
          f"window=[{use_target['stiff_lo']:.2f},{use_target['stiff_hi']:.2f}]")
    print(f"  closure pref={use_target['closure_pref']}  bad={use_target['closure_bad']}")
    print(f"  user street_size_eu={profile.get('street_size_eu')}")
    print(f"  caps: per-tier brand={PER_TIER_BRAND_CAP}  "
          f"global brand={GLOBAL_BRAND_CAP}  per-tier no_edge={PER_TIER_NO_EDGE_CAP}  "
          f"budget pool={BUDGET_POOL_SIZE}")

    tiers = assemble_tiers(profile, shoes_db, target, price_rows=price_rows)

    print_tier("baseline", tiers["baseline"])
    print_tier("softer",   tiers["softer"])
    print_tier("stiffer",  tiers["stiffer"])
    print_tier("budget",   tiers["budget"], show_price=True)

    # Cap audit
    all_picks = (tiers["baseline"] + tiers["softer"]
                 + tiers["stiffer"] + tiers["budget"])
    brand_total = {}
    for _, s in all_picks:
        b = (s.get("brand") or "").strip()
        brand_total[b] = brand_total.get(b, 0) + 1
    overrep = {b: c for b, c in brand_total.items() if c > GLOBAL_BRAND_CAP}
    print(f"\n## CAP AUDIT (total picks: {len(all_picks)} / 12 max)")
    for b, c in sorted(brand_total.items(), key=lambda x: -x[1]):
        flag = "  ⚠ OVER GLOBAL CAP" if c > GLOBAL_BRAND_CAP else ""
        print(f"  {b}: {c}{flag}")
    if not overrep:
        print(f"  (no brand exceeds global cap of {GLOBAL_BRAND_CAP})")


if __name__ == "__main__":
    main()
