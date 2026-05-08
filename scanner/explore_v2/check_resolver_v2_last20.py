#!/usr/bin/env python3
"""Sandbox check: run target_resolver_v2 against the last 20 real scans.

Aggressiveness is not yet in the DB (schema_v2_inputs.sql is unapplied),
so we show how each scan resolves at *every* aggressiveness level. The
fw/hv/fv columns are invariant across aggressiveness (v1 logic), so we
only print them once per scan; asym/dt are repeated per level.
"""
import os, sys, json, requests
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))                              # benchmark/...
sys.path.insert(0, str(Path(__file__).resolve().parent))   # explore_v2/...

from target_resolver_v2 import (
    resolve_targets_v2,
    WIDTH_LABELS, HV_LABELS, FV_LABELS,
    ASYM_LABELS, DOWNTURN_LABELS,
)

SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY",
    "MUST_BE_SET_VIA_ENV")
HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}

AGGS = ["comfort", "balanced", "moderate", "aggressive"]

ASYM_SHORT = {0: "non", 1: "sli", 2: "mod", 3: "str"}
DT_SHORT   = {0: "flt", 1: "sli", 2: "mod", 3: "agr"}
W_SHORT    = {0: "n", 1: "m", 2: "w"}
FV_SHORT   = {0: "lo", 1: "md", 2: "hi"}


def load_scans(limit=20):
    r = requests.get(f"{SB_URL}/rest/v1/foot_scan_fits", headers=HEADERS,
        params={
            "select": (
                "id,created_at,sex,toe_shape,toe_confidence,"
                "hva_offset_ratio,hallux_valgus_class,"
                "forefoot_width_ratio,heel_width_ratio,heel_depth_ratio,"
                "shoes"
            ),
            "order": "created_at.desc",
            "limit": limit,
        }, timeout=30)
    r.raise_for_status()
    return r.json()


def load_shoes_db():
    r = requests.get(f"{SB_URL}/rest/v1/shoes", headers=HEADERS,
        params={"select": "brand,model,width,heel_volume,forefoot_volume",
                "limit": 1000}, timeout=30)
    r.raise_for_status()
    return r.json()


def lookup(shoes_db, brand, model):
    if not brand or not model:
        return None
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


def normalize_shoes(user_shoes_raw, shoes_db):
    if isinstance(user_shoes_raw, str):
        try: user_shoes_raw = json.loads(user_shoes_raw)
        except: user_shoes_raw = []
    out = []
    for us in user_shoes_raw or []:
        db = lookup(shoes_db, us.get("brand"), us.get("model"))
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
    print("# Loading scans + shoes...", file=sys.stderr)
    scans = load_scans(20)
    shoes_db = load_shoes_db()
    print(f"# {len(scans)} scans, {len(shoes_db)} shoes", file=sys.stderr)

    rows = []
    rows.append("| # | scan | sex | toe / HVA | fw·hv·fv (invariant) | "
                "asym C·B·M·A | dt C·B·M·A |")
    rows.append("|---|------|-----|-----------|----------------------|"
                "--------------|------------|")

    asym_dist = {agg: {0: 0, 1: 0, 2: 0, 3: 0} for agg in AGGS}

    for i, sc in enumerate(scans, 1):
        scan_id_short = sc["id"][:8]
        sex = sc.get("sex") or "-"
        toe = sc.get("toe_shape") or "-"
        hva = sc.get("hva_offset_ratio")
        hva_str = f"{hva:.2f}" if hva is not None else "—"
        toe_hva = f"{toe}/{hva_str}"

        profile = {
            "forefoot_width_ratio": sc.get("forefoot_width_ratio"),
            "heel_width_ratio":     sc.get("heel_width_ratio"),
            "heel_depth_ratio":     sc.get("heel_depth_ratio"),
            "toe_shape":            sc.get("toe_shape"),
            "hva_offset_ratio":     sc.get("hva_offset_ratio"),
        }
        shoes = normalize_shoes(sc.get("shoes"), shoes_db)

        # First pass to get invariant fw/hv/fv (any aggressiveness works)
        base = resolve_targets_v2(profile, shoes, "balanced")
        fw = W_SHORT[base["target_fw"]]
        hv = W_SHORT[base["target_hv"]]
        fv = FV_SHORT[base["target_fv"]]
        whv = f"{fw}·{hv}·{fv}"

        asym_cells = []
        dt_cells = []
        for agg in AGGS:
            r = resolve_targets_v2(profile, shoes, agg)
            asym_cells.append(ASYM_SHORT[r["target_asym"]])
            dt_cells.append(DT_SHORT[r["target_dt"]])
            asym_dist[agg][r["target_asym"]] += 1

        rows.append(
            f"| {i} | {scan_id_short} | {sex} | {toe_hva} | {whv} | "
            f"{' · '.join(asym_cells)} | {' · '.join(dt_cells)} |"
        )

    out = "\n".join(rows)
    print(out)
    print()
    print("# Asymmetry distribution per aggressiveness (N=20):")
    for agg in AGGS:
        d = asym_dist[agg]
        total = sum(d.values())
        line = ", ".join(
            f"{ASYM_LABELS[k]}={d[k]}" for k in sorted(d) if d[k] > 0
        )
        print(f"#   {agg:<11} → {line}  (total {total})")
    print()
    print("# Downturn target = pure aggressiveness lookup (no foot input):")
    for agg in AGGS:
        rank = {"comfort": 0, "balanced": 1, "moderate": 2, "aggressive": 3}[agg]
        print(f"#   {agg:<11} → {DOWNTURN_LABELS[rank]}")

    Path(__file__).parent.joinpath("resolver_v2_last20.md").write_text(out + "\n")
    print(f"\n# Saved to {Path(__file__).parent / 'resolver_v2_last20.md'}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
