#!/usr/bin/env python3
"""Sandbox check: run target_resolver against the last 20 real scans.

Output: one markdown table row per scan with the inputs (ratios, current
shoes' fit feedback) and the resolved target_fw / target_hv.
"""
import os, sys, json, requests
from pathlib import Path

# Make production benchmark/ importable
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from benchmark.target_resolver import (
    resolve_targets, width_rank, heel_vol_rank, rank_label,
    WIDTH_LABELS, HV_LABELS,
)

SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY",
    "MUST_BE_SET_VIA_ENV")
HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}


def load_scans(limit=20):
    r = requests.get(f"{SB_URL}/rest/v1/foot_scan_fits", headers=HEADERS,
        params={
            "select": ("id,created_at,forefoot_width_ratio,heel_width_ratio,"
                       "heel_depth_ratio,forefoot_width_class,heel_width_class,"
                       "heel_depth_class,shoes,sex,toe_shape"),
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
    # fuzzy: substring either way
    for s in shoes_db:
        k = f"{s['brand'].strip().lower()} {s['model'].strip().lower()}"
        if key in k or k in key:
            return s
    return None


def shoe_fit_label(fit):
    parts = []
    if fit.get("forefoot"): parts.append(f"ff={fit['forefoot']}")
    if fit.get("toes"):     parts.append(f"toes={fit['toes']}")
    if fit.get("heel"):     parts.append(f"heel={fit['heel']}")
    return ",".join(parts) or "-"


def main():
    print("# Loading scans + shoes...", file=sys.stderr)
    scans = load_scans(20)
    shoes_db = load_shoes_db()
    print(f"# {len(scans)} scans, {len(shoes_db)} shoes", file=sys.stderr)

    # Header
    rows = []
    rows.append("| # | scan id | sex | fw_ratio (cls) | hw_ratio (cls) | depth (cls) | shoes (fit → vote contributions) | tgt_fw | tgt_hv | avg_fw | avg_hv |")
    rows.append("|---|---------|-----|----------------|----------------|-------------|-----------------------------------|--------|--------|--------|--------|")

    for i, sc in enumerate(scans, 1):
        scan_id_short = sc["id"][:8]
        sex = sc.get("sex") or "-"
        fw = sc.get("forefoot_width_ratio")
        hw = sc.get("heel_width_ratio")
        hd = sc.get("heel_depth_ratio")

        fw_str = f"{fw:.3f} ({sc.get('forefoot_width_class') or '-'})" if fw is not None else "—"
        hw_str = f"{hw:.3f} ({sc.get('heel_width_class') or '-'})" if hw is not None else "—"
        hd_str = f"{hd:.3f} ({sc.get('heel_depth_class') or '-'})" if hd is not None else "—"

        # Build shoes payload for resolver
        user_shoes_raw = sc.get("shoes") or []
        if isinstance(user_shoes_raw, str):
            try: user_shoes_raw = json.loads(user_shoes_raw)
            except: user_shoes_raw = []

        normalized = []
        shoe_descs = []
        for us in user_shoes_raw:
            db = lookup(shoes_db, us.get("brand"), us.get("model"))
            fit = us.get("fit") or {}
            label = f"{us.get('brand','?')} {us.get('model','?')}"
            db_w  = db.get("width") if db else None
            db_hv = db.get("heel_volume") if db else None
            normalized.append({
                "brand": us.get("brand", ""),
                "model": us.get("model", ""),
                "db_width": db_w,
                "db_heel_volume": db_hv,
                "db_forefoot_volume": db.get("forefoot_volume") if db else None,
                "fit": fit,
            })
            shoe_descs.append(f"{label} [{shoe_fit_label(fit)} | db_w={db_w or '?'} db_hv={db_hv or '?'}]")

        profile = {
            "forefoot_width_ratio": fw,
            "heel_width_ratio": hw,
            "heel_depth_ratio": hd,
        }

        result = resolve_targets(profile, normalized)
        tgt_fw_lbl = WIDTH_LABELS.get(result["target_fw"], "?")
        tgt_hv_lbl = HV_LABELS.get(result["target_hv"], "?")
        shoes_str = "<br>".join(shoe_descs) if shoe_descs else "—"
        # Trim shoes column for readability
        if len(shoes_str) > 200:
            shoes_str = shoes_str[:197] + "..."

        rows.append(
            f"| {i} | {scan_id_short} | {sex} | {fw_str} | {hw_str} | {hd_str} | "
            f"{shoes_str} | **{tgt_fw_lbl}** | **{tgt_hv_lbl}** | "
            f"{result['avg_fw']:.2f} | {result['avg_hv']:.2f} |"
        )

    out = "\n".join(rows)
    print(out)
    Path(__file__).parent.joinpath("targets_last20.md").write_text(out + "\n")
    print(f"\n# Saved to {Path(__file__).parent / 'targets_last20.md'}", file=sys.stderr)


if __name__ == "__main__":
    main()
