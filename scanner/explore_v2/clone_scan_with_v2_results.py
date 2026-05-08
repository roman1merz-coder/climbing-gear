#!/usr/bin/env python3
"""Clone an existing scan into a NEW row with V2-pipeline outputs, so we
can review the v2 result through the LIVE React design.

What it does:
  1. Loads the source scan row from foot_scan_fits (by scan_id).
  2. Runs the v2 pipeline (target_resolver_v2 + matrix_scorer_v2 +
     interp_what_to_look_for_v2 + interp_shoe_desc_v2).
  3. Reshapes the v2 output into the JSONB columns the live React app
     expects (`interpretation` = [{title, paragraphs}],
     `recommendations` = [{slug, brand, model, category,
     recommended_size_eu, description, why, tradeoffs}]).
  4. Computes recommended_size_eu via the production helper
     scan_recommender._calc_recommended_size (so size shown matches
     what a user would actually see).
  5. INSERTs a NEW row with scan_id = source + suffix, copying all
     measurement columns + uploaded shoe-fit data. Status='complete',
     pipeline_stage='complete'.

Sandbox: writes ONE clearly-suffixed clone row. Does not touch the
source row. Includes a --delete flag to remove the clone afterwards.

Usage:
    clone_scan_with_v2_results.py <source_scan_id> <discipline> <env> <rock|-> <aggr> [--suffix=-v2review]
    clone_scan_with_v2_results.py --delete <clone_scan_id>
"""
import os, sys, json, argparse
import requests
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from target_resolver_v2 import resolve_targets_v2
from matrix_scorer_v2 import compute_use_case_target, assemble_tiers
from interp_what_to_look_for_v2 import generate_what_to_look_for_v2
from interp_shoe_desc_v2 import flatten_pick, generate_shoe_description_v2
from benchmark.interp_foot_shape import generate_foot_shape
from benchmark.interp_shoe_fit  import generate_shoe_fit

from check_full_v2_matrix import load_shoes_db, load_price_rows, build_profile

# Production size helper (mirrors what scan_worker writes today)
from scan_recommender import _calc_recommended_size, _load_brand_sizing

SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY",
    "MUST_BE_SET_VIA_ENV")
HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
           "Content-Type": "application/json", "Prefer": "return=representation"}


# ───────────────────────────────────────────────────────────────────
# DB ops
# ───────────────────────────────────────────────────────────────────

def fetch_scan(scan_id):
    r = requests.get(f"{SB_URL}/rest/v1/foot_scan_fits", headers=HEADERS,
        params={"select": "*", "scan_id": f"eq.{scan_id}", "limit": 1},
        timeout=30)
    r.raise_for_status()
    rows = r.json()
    if not rows:
        raise RuntimeError(f"no row for scan_id={scan_id}")
    return rows[0]


def insert_clone(scan, clone_scan_id, interpretation, recommendations):
    """INSERT a new row mirroring scan but with a fresh scan_id and
    v2-shaped interpretation + recommendations.
    """
    # Drop the primary key + any auto-managed columns
    payload = dict(scan)
    payload.pop("id", None)               # uuid pk — DB regenerates
    payload.pop("created_at", None)        # let DB default
    payload.pop("generated_at", None)

    payload["scan_id"]         = clone_scan_id
    payload["interpretation"]  = interpretation
    payload["recommendations"] = recommendations
    payload["pipeline_stage"]  = "complete"
    payload["pipeline_error"]  = None
    payload["status"]          = "complete"
    # Mark notes so it's obvious this is a review clone, not real user data
    notes = payload.get("notes") or ""
    payload["notes"] = (notes + " [V2 REVIEW CLONE — safe to delete]").strip()

    r = requests.post(f"{SB_URL}/rest/v1/foot_scan_fits",
                      headers=HEADERS, json=payload, timeout=30)
    if r.status_code >= 300:
        raise RuntimeError(f"insert failed {r.status_code}: {r.text[:500]}")
    return r.json()


def delete_row(scan_id):
    r = requests.delete(f"{SB_URL}/rest/v1/foot_scan_fits",
                        headers=HEADERS,
                        params={"scan_id": f"eq.{scan_id}"},
                        timeout=30)
    r.raise_for_status()
    return r.text


# ───────────────────────────────────────────────────────────────────
# V2 pipeline → live JSONB shape
# ───────────────────────────────────────────────────────────────────

def build_interpretation(profile, *, discipline, environment, rock, aggressiveness, target):
    out = []
    out.append({
        "title": "Your Foot Shape",
        "paragraphs": list(generate_foot_shape(profile)),
    })
    out.append({
        "title": "What Your Current Shoe Fit Tells Us",
        "paragraphs": list(generate_shoe_fit(profile)),
    })
    out.append({
        "title": "What to Look For",
        "paragraphs": list(generate_what_to_look_for_v2(
            profile, profile["shoes"],
            discipline=discipline, environment=environment,
            rock=rock, aggressiveness=aggressiveness, target=target,
        )),
    })
    return out


def build_recommendations(tiers, profile, target, *, brand_sizing, anchor_size,
                          anchor_brand, street_size, preference):
    """Flatten 4 tiers -> the live `recommendations` JSONB shape."""
    recs = []
    # Build all_picks once for cross-pick context (P3 tradeoff comparisons)
    all_picks_flat = []
    for tname in ("baseline", "softer", "stiffer", "budget"):
        for sc, sh in tiers[tname]:
            all_picks_flat.append(flatten_pick(sc, sh, tier=tname, target=target))

    price_lookup = {}
    for sc, sh in tiers["budget"]:
        if sc.get("best_price_at_size") is not None:
            price_lookup[sh["slug"]] = sc["best_price_at_size"]

    for tname in ("baseline", "softer", "stiffer", "budget"):
        for sc, sh in tiers[tname]:
            best_price = price_lookup.get(sh["slug"]) if tname == "budget" else None
            pick = flatten_pick(sc, sh, tier=tname, target=target,
                                best_price=best_price)
            paras = generate_shoe_description_v2(pick, profile,
                                                 all_picks=all_picks_flat)
            P1 = paras[0] if len(paras) > 0 else ""
            P2 = paras[1] if len(paras) > 1 else ""
            P3 = paras[2] if len(paras) > 2 else ""

            # Best-effort recommended size via the production helper.
            # CRITICAL: snap to half-EU (43, 43.5, 44, ...) the way the live
            # worker does at scan_worker.py:773 — `round(rec_size * 2) / 2`.
            # The helper returns 0.1-precision (e.g. 45.2), which is wrong.
            try:
                raw_rec = _calc_recommended_size(
                    user_anchor_size=anchor_size, anchor_brand=anchor_brand,
                    target_brand=sh.get("brand"), brand_sizing=brand_sizing,
                    street_size=street_size, preference=preference,
                ) if anchor_size else None
                rec_size = round(raw_rec * 2) / 2 if raw_rec else None
            except Exception:
                rec_size = None

            rec = {
                "slug":        sh.get("slug"),
                "brand":       sh.get("brand"),
                "model":       sh.get("model"),
                "category":    tname,
                "recommended_size_eu": rec_size,
                "description": P1,
                "why":         P2,
                "tradeoffs":   P3,
            }
            # Mirror V1: budget tier gets a best_offer dict the React app reads.
            if tname == "budget" and best_price is not None:
                rec["best_offer"] = {"price_eur": round(float(best_price), 2)}
            recs.append(rec)
    return recs


# ───────────────────────────────────────────────────────────────────
# Main
# ───────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--delete", metavar="CLONE_SCAN_ID",
                    help="Delete the named clone row and exit.")
    ap.add_argument("source_scan_id", nargs="?")
    ap.add_argument("discipline",     nargs="?")
    ap.add_argument("environment",    nargs="?")
    ap.add_argument("rock",           nargs="?", help="rock_type or '-'")
    ap.add_argument("aggressiveness", nargs="?")
    ap.add_argument("--suffix", default="-v2review")
    args = ap.parse_args()

    if args.delete:
        delete_row(args.delete)
        print(f"deleted scan_id={args.delete}")
        return

    if not all([args.source_scan_id, args.discipline, args.environment,
                args.rock, args.aggressiveness]):
        ap.print_help()
        sys.exit(1)

    rock = None if args.rock == "-" else args.rock
    clone_scan_id = args.source_scan_id + args.suffix

    print(f"# loading source scan {args.source_scan_id}", file=sys.stderr)
    scan = fetch_scan(args.source_scan_id)
    print(f"# loading shoes_db + prices + brand_sizing", file=sys.stderr)
    shoes_db = load_shoes_db()
    price_rows = load_price_rows()
    brand_sizing = _load_brand_sizing()

    profile = build_profile(scan, shoes_db)

    # Anchor shoe info for sizing helper — use the user's first uploaded shoe
    anchor_size = anchor_brand = None
    raw_shoes = scan.get("shoes") or []
    if isinstance(raw_shoes, str):
        try: raw_shoes = json.loads(raw_shoes)
        except: raw_shoes = []
    if raw_shoes:
        first = raw_shoes[0]
        try: anchor_size = float(first.get("size_eu") or first.get("size") or 0) or None
        except: anchor_size = None
        anchor_brand = (first.get("brand") or "").strip() or None

    pref = "performance" if args.aggressiveness in ("moderate", "aggressive") else "comfort"

    # V2 unified target
    fit_target = resolve_targets_v2(profile, profile["shoes"], args.aggressiveness)
    use_target = compute_use_case_target(args.discipline, args.environment,
                                         rock, args.aggressiveness)
    target = {**fit_target, **use_target}

    print("# assembling tiers", file=sys.stderr)
    tiers = assemble_tiers(profile, shoes_db, target, price_rows=price_rows)

    interpretation = build_interpretation(
        profile,
        discipline=args.discipline, environment=args.environment,
        rock=rock, aggressiveness=args.aggressiveness, target=target,
    )
    recommendations = build_recommendations(
        tiers, profile, target,
        brand_sizing=brand_sizing,
        anchor_size=anchor_size, anchor_brand=anchor_brand,
        street_size=float(scan.get("street_size_eu") or 0) or None,
        preference=pref,
    )

    print(f"# inserting clone row scan_id={clone_scan_id}", file=sys.stderr)
    inserted = insert_clone(scan, clone_scan_id, interpretation, recommendations)

    url = f"https://www.climbing-gear.com/scan/{clone_scan_id}"
    print(f"\nDONE")
    print(f"  clone scan_id : {clone_scan_id}")
    print(f"  url           : {url}")
    print(f"  picks         : {len(recommendations)}")
    print(f"  to remove     : python3 {Path(__file__).name} --delete {clone_scan_id}")


if __name__ == "__main__":
    main()
