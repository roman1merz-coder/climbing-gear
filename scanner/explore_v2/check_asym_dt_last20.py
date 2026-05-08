#!/usr/bin/env python3
"""Sandbox check: run target_asym + target_dt against the last 20 real scans.

Shows the asym foot-shape delta per scan and the resulting target_asym for
each of the 4 aggressiveness levels (comfort / balanced / moderate / aggressive).
target_dt is just the aggressiveness lookup, shown alongside for completeness.
"""
import os, sys, requests
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from target_asym_dt import (
    resolve_target_asym, resolve_target_downturn,
    ASYM_LABELS, DOWNTURN_LABELS,
)

SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY",
    "MUST_BE_SET_VIA_ENV")
HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}


def load_scans(limit=20):
    r = requests.get(f"{SB_URL}/rest/v1/foot_scan_fits", headers=HEADERS,
        params={
            "select": "id,created_at,sex,toe_shape,toe_confidence,"
                      "hva_offset_ratio,hallux_valgus_class",
            "order": "created_at.desc",
            "limit": limit,
        }, timeout=30)
    r.raise_for_status()
    return r.json()


AGGS = ["comfort", "balanced", "moderate", "aggressive"]

# Short labels for table compactness
ASYM_SHORT = {0: "non", 1: "sli", 2: "mod", 3: "str"}


def main():
    print("# Loading scans...", file=sys.stderr)
    scans = load_scans(20)
    print(f"# {len(scans)} scans\n", file=sys.stderr)

    rows = []
    rows.append("| # | scan | sex | toe_shape (conf) | HVA | hallux | Δ asym | C | B | M | A |")
    rows.append("|---|------|-----|------------------|-----|--------|--------|---|---|---|---|")

    delta_counts = {"+1": 0, "0": 0, "-1": 0}
    for i, sc in enumerate(scans, 1):
        scan_id_short = sc["id"][:8]
        sex = sc.get("sex") or "-"
        toe = sc.get("toe_shape") or "-"
        toe_conf = sc.get("toe_confidence")
        hva = sc.get("hva_offset_ratio")
        hva_class = sc.get("hallux_valgus_class") or "-"

        # Resolve once (delta + has_hallux are independent of aggressiveness)
        first = resolve_target_asym("balanced", toe, hva)
        delta = first["delta"]
        delta_str = f"{'+' if delta > 0 else ''}{delta}"
        delta_counts[delta_str if delta_str in delta_counts else "0"] += 1

        # Compute target_asym at each aggressiveness level
        asym_per_agg = {}
        for agg in AGGS:
            r = resolve_target_asym(agg, toe, hva)
            asym_per_agg[agg] = ASYM_SHORT[r["target_asym"]]

        toe_str = f"{toe}"
        if toe_conf is not None:
            toe_str += f" ({toe_conf:.2f})"
        hva_str = f"{hva:.2f}" if hva is not None else "—"
        hallux_str = "yes" if first["has_hallux"] else "no"
        if hva_class and hva_class != "-":
            hallux_str = f"{hallux_str} ({hva_class})"

        rows.append(
            f"| {i} | {scan_id_short} | {sex} | {toe_str} | {hva_str} | "
            f"{hallux_str} | **{delta_str}** | "
            f"{asym_per_agg['comfort']} | {asym_per_agg['balanced']} | "
            f"{asym_per_agg['moderate']} | {asym_per_agg['aggressive']} |"
        )

    out = "\n".join(rows)
    print(out)
    print()
    print(f"# Δ asym distribution across 20 scans: "
          f"+1={delta_counts['+1']}, 0={delta_counts['0']}, "
          f"-1={delta_counts['-1']}")
    print()
    print("# target_dt per aggressiveness (deterministic lookup, same for all scans):")
    for agg in AGGS:
        d = resolve_target_downturn(agg)
        print(f"#   {agg:<11} → {d['target_dt_lbl']}")

    Path(__file__).parent.joinpath("asym_dt_last20.md").write_text(out + "\n")
    print(f"\n# Saved to {Path(__file__).parent / 'asym_dt_last20.md'}", file=sys.stderr)


if __name__ == "__main__":
    main()
