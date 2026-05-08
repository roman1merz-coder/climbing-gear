#!/usr/bin/env python3
"""Sandbox harness: render Section 3 v2 against the latest real scan
across all 4 aggressiveness levels, with one outdoor + one indoor combo.

Looks for:
- v1 paragraphs still present (no regression)
- New 'target shape' paragraph reads naturally for each aggressiveness
- Asym adjustment paragraph fires only when delta != 0
- Context phrase ('sport climbing on limestone' etc.) reads cleanly
"""
import os, sys, json, requests
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from interp_what_to_look_for_v2 import generate_what_to_look_for_v2
from target_resolver_v2 import resolve_targets_v2

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
                "instep_height_class,"
                "forefoot_width_ratio,forefoot_width_class,"
                "heel_width_ratio,heel_width_class,"
                "heel_depth_ratio,heel_depth_class,"
                "shoes,street_size_eu,next_shoe_preference,next_shoe_notes"
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
            "computed_stiffness,width,heel_volume,forefoot_volume,no_edge"
        ), "limit": 1000}, timeout=30)
    r.raise_for_status()
    return r.json()


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
            "db_stiffness": db.get("computed_stiffness") if db else None,
            "fit": us.get("fit") or {},
        })
    return out


def render_combo(profile, user_shoes, *, discipline, environment, rock,
                 aggressiveness, label):
    target = resolve_targets_v2(profile, user_shoes, aggressiveness)
    paras = generate_what_to_look_for_v2(
        profile, user_shoes,
        discipline=discipline, environment=environment, rock=rock,
        aggressiveness=aggressiveness, target=target,
    )
    print(f"\n{'=' * 78}\n# {label}")
    print(f"  inputs: discipline={discipline}  env={environment}  "
          f"rock={rock}  agg={aggressiveness}")
    print(f"  target_dt = {target['target_dt']} ({target['target_dt_lbl']})")
    print(f"  target_asym = {target['target_asym']} ({target['target_asym_lbl']})  "
          f"baseline={target['asym_baseline_lbl']}  "
          f"delta={target['asym_delta']:+d}  reason={target['asym_reason']}")
    print(f"  → {len(paras)} paragraphs:")
    for i, p in enumerate(paras, 1):
        print(f"\n  [P{i}] {p}")


def main():
    print("# loading scan + shoes...", file=sys.stderr)
    scan = load_latest_scan()
    shoes_db = load_shoes_db()
    print(f"# scan {scan['id'][:8]}, {len(shoes_db)} shoes", file=sys.stderr)

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
        "shoes":                 scan.get("shoes") or [],
    }
    user_shoes = normalize_user_shoes(profile["shoes"], shoes_db)

    print(f"\n# scan profile: toe_shape={profile['toe_shape']!r}  "
          f"hva={profile['hva_offset_ratio']}  "
          f"fw_class={profile['forefoot_width_class']}  "
          f"hw_class={profile['heel_width_class']}")

    # All 4 aggressiveness levels with same disc/env/rock combo
    for agg in ("comfort", "balanced", "moderate", "aggressive"):
        render_combo(
            profile, user_shoes,
            discipline="sport", environment="outdoor", rock="limestone",
            aggressiveness=agg,
            label=f"sport / outdoor / limestone / {agg}",
        )

    # Indoor (no rock) variant to verify context phrase
    render_combo(
        profile, user_shoes,
        discipline="boulder", environment="indoor", rock=None,
        aggressiveness="aggressive",
        label="boulder / indoor / -- / aggressive",
    )

    # Both env (rock=None per locked rule) variant
    render_combo(
        profile, user_shoes,
        discipline="trad_multipitch", environment="both", rock=None,
        aggressiveness="balanced",
        label="trad_multipitch / both / -- / balanced",
    )

    # ── Synthetic profile checks: exercise asym delta != 0 branches ──
    print("\n\n" + "#" * 78)
    print("# SYNTHETIC PROFILE CHECKS (asym adjustment paragraph)")
    print("#" * 78)

    # Egyptian + no HVA → delta +1
    egy_profile = dict(profile)
    egy_profile["toe_shape"] = "egyptian"
    egy_profile["hva_offset_ratio"] = 0.05
    render_combo(
        egy_profile, user_shoes,
        discipline="sport", environment="outdoor", rock="limestone",
        aggressiveness="balanced",
        label="SYNTH: Egyptian + no HVA / sport / outdoor / limestone / balanced",
    )

    # HVA ≥ 0.25 → delta -1 (use existing toe_shape)
    hva_profile = dict(profile)
    hva_profile["toe_shape"] = "egyptian"
    hva_profile["hva_offset_ratio"] = 0.32
    render_combo(
        hva_profile, user_shoes,
        discipline="sport", environment="outdoor", rock="limestone",
        aggressiveness="moderate",
        label="SYNTH: Egyptian + HVA 0.32 / sport / outdoor / limestone / moderate",
    )

    # Comfort + Egyptian no HVA: baseline 0 + delta +1 → 1, no clamp issue
    render_combo(
        egy_profile, user_shoes,
        discipline="boulder", environment="indoor", rock=None,
        aggressiveness="comfort",
        label="SYNTH: Egyptian + no HVA / boulder / indoor / comfort (clamp at top? no)",
    )

    # Aggressive + HVA: baseline 3 + delta -1 → 2
    render_combo(
        hva_profile, user_shoes,
        discipline="boulder", environment="indoor", rock=None,
        aggressiveness="aggressive",
        label="SYNTH: Egyptian + HVA 0.32 / boulder / indoor / aggressive",
    )


if __name__ == "__main__":
    main()
