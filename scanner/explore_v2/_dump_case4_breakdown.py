"""Dump full per-shoe V2 score breakdown for one scan + combo."""
import os, sys, json, requests
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from target_resolver_v2 import resolve_targets_v2
from matrix_scorer_v2 import compute_use_case_target, assemble_tiers
from interp_shoe_desc_v2 import flatten_pick
from check_full_v2_matrix import load_shoes_db, build_profile

SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SB_KEY = "MUST_BE_SET_VIA_ENV"
HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}

SCAN_ID = "b42503a3-b5ca-469d-a893-59b56701f79f"
COMBO = {"discipline": "boulder", "environment": "indoor", "rock": None, "aggressiveness": "moderate"}


def load_scan(sid):
    r = requests.get(f"{SB_URL}/rest/v1/foot_scan_fits", headers=HEADERS,
        params={"select": (
            "id,created_at,sex,toe_shape,toe_confidence,"
            "hva_offset_ratio,hallux_valgus_class,instep_height_ratio,"
            "instep_height_class,"
            "forefoot_width_ratio,forefoot_width_class,"
            "heel_width_ratio,heel_width_class,"
            "heel_depth_ratio,heel_depth_class,"
            "shoes,street_size_eu,next_shoe_preference,next_shoe_notes"
        ), "id": f"eq.{sid}", "limit": 1}, timeout=30)
    r.raise_for_status()
    return r.json()[0]


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


def main():
    print(f"# Loading scan {SCAN_ID[:8]} ...", file=sys.stderr)
    scan = load_scan(SCAN_ID)
    shoes_db = load_shoes_db()
    price_rows = load_price_rows()
    profile = build_profile(scan, shoes_db)

    print(f"\n=== SCAN {SCAN_ID[:8]} ({scan['created_at']}) ===")
    print(f"profile: toe={profile.get('toe_shape')}, hva={profile.get('hallux_valgus_class')}, "
          f"fw={profile.get('forefoot_width_class')}, hw={profile.get('heel_width_class')}, "
          f"hd={profile.get('heel_depth_class')}, instep={profile.get('instep_height_class')}, "
          f"shoes_owned={len(profile.get('shoes', []))}")
    print(f"combo: {COMBO}")

    fit_target = resolve_targets_v2(profile, profile["shoes"], COMBO["aggressiveness"])
    use_target = compute_use_case_target(COMBO["discipline"], COMBO["environment"],
                                          COMBO["rock"], COMBO["aggressiveness"])
    target = {**fit_target, **use_target}
    print(f"\ntarget: {json.dumps(target, default=str, indent=2)}")

    tiers = assemble_tiers(profile, shoes_db, target, price_rows=price_rows)

    all_axes = set()
    rows = []
    for tname in ("baseline", "softer", "stiffer", "budget"):
        picks = tiers[tname]
        print(f"\n--- TIER: {tname} (n={len(picks)}) ---")
        for sc, sh in picks:
            bd = sc.get("breakdown") or {}
            for k in bd: all_axes.add(k)
            print(f"\n  {sh['brand']} {sh['model']}  | total score={sc.get('score')}")
            axis_summary = {"pos": 0, "zero": 0, "neg": 0}
            axis_signs = {}
            for k in sorted(bd.keys()):
                v = bd[k]
                val = v[0] if isinstance(v, tuple) else v
                if val > 0:
                    sign = "POS"; axis_summary["pos"] += 1
                elif val < 0:
                    sign = "NEG"; axis_summary["neg"] += 1
                else:
                    sign = "zero"; axis_summary["zero"] += 1
                axis_signs[k] = (val, sign)
                print(f"    {k:25s} = {val:+d}  ({sign})")
            print(f"    SUMMARY: pos={axis_summary['pos']}  zero={axis_summary['zero']}  neg={axis_summary['neg']}")
            rows.append({
                "tier": tname, "brand": sh['brand'], "model": sh['model'],
                "score": sc.get('score'), "summary": axis_summary,
                "axis_signs": axis_signs,
            })

    print("\n\n========================================")
    print("AGGREGATE SUMMARY (all picks)")
    print("========================================")
    n_picks = len(rows)
    print(f"Total picks: {n_picks}")

    dist = {0: 0, 1: 0, 2: 0, "3+": 0}
    for r in rows:
        n = r["summary"]["neg"]
        if n >= 3: dist["3+"] += 1
        else: dist[n] += 1
    print(f"\nDistribution of negative-axis count per pick:")
    for k, v in dist.items():
        print(f"  {k} negatives : {v} picks")

    print(f"\nPer-axis sign distribution across all {n_picks} picks:")
    all_axes_sorted = sorted(all_axes)
    print(f"  {'axis':25s}  POS  ZERO   NEG  | flag")
    for ax in all_axes_sorted:
        pos = sum(1 for r in rows if r["axis_signs"].get(ax, (0,"zero"))[1] == "POS")
        zero = sum(1 for r in rows if r["axis_signs"].get(ax, (0,"zero"))[1] == "zero")
        neg = sum(1 for r in rows if r["axis_signs"].get(ax, (0,"zero"))[1] == "NEG")
        flag = "  *** NEVER NEG ***" if neg == 0 else ""
        print(f"  {ax:25s}  {pos:3d}  {zero:4d}  {neg:4d}{flag}")

    print(f"\nNegative count by tier:")
    for tname in ("baseline", "softer", "stiffer", "budget"):
        tier_rows = [r for r in rows if r["tier"] == tname]
        if not tier_rows: continue
        avg_neg = sum(r["summary"]["neg"] for r in tier_rows) / len(tier_rows)
        zero_neg_count = sum(1 for r in tier_rows if r["summary"]["neg"] == 0)
        print(f"  {tname:10s}: n={len(tier_rows)}, avg neg={avg_neg:.1f}, zero-neg picks={zero_neg_count}")


if __name__ == "__main__":
    main()
