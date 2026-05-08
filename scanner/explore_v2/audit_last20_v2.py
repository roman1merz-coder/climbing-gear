#!/usr/bin/env python3
"""Audit harness: pulls last 20 scans with measurements, applies seeded
random V2 inputs (discipline + environment + rock + aggressiveness) per
scan, runs §1+§2+§3 generators, writes a markdown report for review.

Sandbox-only.  No production writes.

Output: scanner/explore_v2/audit_last20_2026_05_01.md
"""
import os, sys, json, random, requests
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from target_resolver_v2 import resolve_targets_v2
from matrix_scorer_v2 import compute_use_case_target
from interp_foot_shape_v2 import generate_foot_shape
from interp_shoe_fit_v2 import generate_shoe_fit
from interp_what_to_look_for_v2 import generate_what_to_look_for_v2
from check_full_v2_matrix import load_shoes_db, build_profile

SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
# Roman 2026-05-08: keys migrated to sb_secret_/sb_publishable_ format.
# Read from env only — never hardcode (GitHub push protection blocks it).
SB_KEY = (os.environ.get("SUPABASE_SECRET_KEY")
          or os.environ.get("SUPABASE_SERVICE_KEY"))
if not SB_KEY:
    raise RuntimeError("SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_KEY) "
                       "must be set; run via launchd or `source ~/.scanner-env`.")
HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}

OUT = Path(__file__).resolve().parent / "audit_last20_2026_05_01.md"

DISCIPLINES = ["boulder", "sport", "trad_multipitch"]
ENVIRONMENTS = ["indoor", "outdoor", "both"]
ROCKS = ["granite", "limestone", "sandstone", "mixed"]
AGGRESSIVENESS = ["comfort", "balanced", "moderate", "aggressive"]


def load_recent_scans(n=20):
    r = requests.get(f"{SB_URL}/rest/v1/foot_scan_fits", headers=HEADERS,
        params={
            "select": (
                "id,scan_id,created_at,sex,toe_shape,toe_confidence,"
                "hva_offset_ratio,hallux_valgus_class,instep_height_ratio,"
                "instep_height_class,arch_length_ratio,arch_length_class,"
                "forefoot_width_ratio,forefoot_width_class,"
                "heel_width_ratio,heel_width_class,"
                "heel_depth_ratio,heel_depth_class,"
                "shoes,street_size_eu,next_shoe_preference,next_shoe_notes"
            ),
            "forefoot_width_class": "not.is.null",
            "order": "created_at.desc", "limit": n,
        }, timeout=30)
    r.raise_for_status()
    return r.json()


def pick_v2_inputs(scan_id):
    """Seeded-random choice of (discipline, environment, rock, aggressiveness)
    so re-runs are reproducible per scan."""
    rng = random.Random(scan_id)
    discipline = rng.choice(DISCIPLINES)
    environment = rng.choice(ENVIRONMENTS)
    rock = rng.choice(ROCKS) if environment == "outdoor" else None
    aggressiveness = rng.choice(AGGRESSIVENESS)
    return discipline, environment, rock, aggressiveness


def render_scan(scan, shoes_db):
    profile = build_profile(scan, shoes_db)
    # Patch arch_length_ratio for the soft-class boundary helper
    profile["arch_length_ratio"] = scan.get("arch_length_ratio")
    profile["arch_length_class"] = scan.get("arch_length_class")

    discipline, environment, rock, aggressiveness = pick_v2_inputs(scan["scan_id"])

    fit_target = resolve_targets_v2(profile, profile["shoes"], aggressiveness)
    use_target = compute_use_case_target(discipline, environment, rock, aggressiveness)
    target = {**fit_target, **use_target}

    s1 = generate_foot_shape(profile)
    s2 = generate_shoe_fit(profile)
    s3 = generate_what_to_look_for_v2(
        profile, profile["shoes"],
        discipline=discipline, environment=environment,
        rock=rock, aggressiveness=aggressiveness, target=target,
    )

    return {
        "scan_id": scan["scan_id"],
        "created_at": scan.get("created_at", ""),
        "sex": scan.get("sex"),
        "street_size_eu": scan.get("street_size_eu"),
        "toe_shape": scan.get("toe_shape"),
        "hva": scan.get("hallux_valgus_class"),
        "fw_class": scan.get("forefoot_width_class"),
        "fw_ratio": scan.get("forefoot_width_ratio"),
        "arch_class": scan.get("arch_length_class"),
        "arch_ratio": scan.get("arch_length_ratio"),
        "instep_class": scan.get("instep_height_class"),
        "hw_class": scan.get("heel_width_class"),
        "hd_class": scan.get("heel_depth_class"),
        "shoes_count": len(profile["shoes"]),
        "shoes_summary": [
            f"{s.get('brand','')} {s.get('model','')} EU{s.get('size_eu','?')} "
            f"fit:{s.get('fit', {})}"
            for s in profile["shoes"]
        ],
        "v2_inputs": dict(discipline=discipline, environment=environment,
                          rock=rock, aggressiveness=aggressiveness),
        "target": {
            "target_fw": target.get("target_fw"),
            "target_hv": target.get("target_hv"),
            "target_dt_lbl": target.get("target_dt_lbl"),
            "target_asym_lbl": target.get("target_asym_lbl"),
            "asym_baseline_lbl": target.get("asym_baseline_lbl"),
            "asym_delta": target.get("asym_delta"),
            "stiff_target": target.get("stiff_target"),
        },
        "s1": s1,
        "s2": s2,
        "s3": s3,
    }


def render_md(results):
    lines = []
    lines.append("# V2 audit — last 20 scans")
    lines.append("")
    lines.append("Generated 2026-05-01. Sandbox-only. Per-scan random V2 inputs "
                 "(seeded by scan_id for reproducibility).")
    lines.append("")
    lines.append("---")
    lines.append("")

    for i, r in enumerate(results, 1):
        v2 = r["v2_inputs"]
        rock_str = f"/{v2['rock']}" if v2["rock"] else ""
        lines.append(f"## {i}. `{r['scan_id']}`")
        lines.append("")
        lines.append(f"- **Created:** {r['created_at']}")
        lines.append(f"- **Sex / street size:** {r['sex']} / EU {r['street_size_eu']}")
        lines.append(f"- **Toe shape:** {r['toe_shape']}  |  **HVA:** {r['hva']}")
        lines.append(f"- **Forefoot:** {r['fw_class']} ({r['fw_ratio']})")
        lines.append(f"- **Arch:** {r['arch_class']} ({r['arch_ratio']})")
        lines.append(f"- **Instep:** {r['instep_class']}  |  **Heel:** {r['hw_class']} / {r['hd_class']}")
        lines.append(f"- **Shoes ({r['shoes_count']}):** "
                     + ("; ".join(r["shoes_summary"]) if r["shoes_summary"] else "_(none)_"))
        lines.append(f"- **V2 inputs:** {v2['discipline']} / {v2['environment']}{rock_str} / {v2['aggressiveness']}")
        lines.append(f"- **Targets:** fw={r['target']['target_fw']}, hv={r['target']['target_hv']}, "
                     f"dt={r['target']['target_dt_lbl']}, asym={r['target']['target_asym_lbl']} "
                     f"(baseline={r['target']['asym_baseline_lbl']}, delta={r['target']['asym_delta']}), "
                     f"stiff_target={r['target']['stiff_target']}")
        lines.append("")
        lines.append("### §1 Your Foot Shape")
        for j, p in enumerate(r["s1"], 1):
            lines.append(f"  {j}. {p}")
        lines.append("")
        lines.append("### §2 What Your Current Shoe Fit Tells Us")
        if r["s2"]:
            for j, p in enumerate(r["s2"], 1):
                lines.append(f"  {j}. {p}")
        else:
            lines.append("  _(no shoes uploaded)_")
        lines.append("")
        lines.append("### §3 What to Look For")
        for j, p in enumerate(r["s3"], 1):
            lines.append(f"  {j}. {p}")
        lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def main():
    print("# loading shoes_db + last 20 scans …", file=sys.stderr)
    shoes_db = load_shoes_db()
    scans = load_recent_scans(20)
    print(f"# {len(scans)} scans loaded", file=sys.stderr)

    results = []
    for i, scan in enumerate(scans, 1):
        print(f"  [{i}/{len(scans)}] {scan['scan_id']}", file=sys.stderr)
        try:
            results.append(render_scan(scan, shoes_db))
        except Exception as e:
            results.append({
                "scan_id": scan["scan_id"],
                "created_at": scan.get("created_at"),
                "error": f"{type(e).__name__}: {e}",
            })

    md = render_md([r for r in results if "error" not in r])
    if any("error" in r for r in results):
        md += "\n\n## Errors\n\n"
        for r in results:
            if "error" in r:
                md += f"- `{r['scan_id']}` ({r['created_at']}): {r['error']}\n"

    OUT.write_text(md, encoding="utf-8")
    print(f"# wrote {OUT} ({OUT.stat().st_size:,} bytes)", file=sys.stderr)


if __name__ == "__main__":
    main()
