#!/usr/bin/env python3
"""End-to-end V2 matrix harness.

For 5 real scans × 2 combos, produces the FULL user-facing output:
- v2 unified target dict
- Section 1 ("Your Foot Shape", v1, unchanged)
- Section 2 ("What Your Current Shoe Fit Tells Us", v1, unchanged)
- Section 3 ("What to Look For", v2 augmented)
- All 4 tiers × 3 picks with P1/P2/P3 (v2 P3 rewritten)

Combos exercised:
  A) sport / outdoor / limestone / balanced  (most common path)
  B) boulder / indoor / (no rock) / aggressive  (other extreme)

Output: writes a self-contained markdown report to
``explore_v2/full_v2_sample_cases.md`` so we can eyeball wording across
real foot variety before formalizing new golden cases.
"""
import os, sys, json, requests
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

# v2 sandbox
from target_resolver_v2 import resolve_targets_v2
from matrix_scorer_v2 import compute_use_case_target, assemble_tiers
from interp_what_to_look_for_v2 import generate_what_to_look_for_v2
from interp_shoe_desc_v2 import flatten_pick, generate_shoe_description_v2

# v1 (unchanged, used for Sections 1 and 2)
from benchmark.interp_foot_shape import generate_foot_shape
from benchmark.interp_shoe_fit  import generate_shoe_fit

SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
# Roman 2026-05-08: keys migrated to sb_secret_/sb_publishable_ format.
# Read from env only — never hardcode (GitHub push protection blocks it).
SB_KEY = (os.environ.get("SUPABASE_SECRET_KEY")
          or os.environ.get("SUPABASE_SERVICE_KEY"))
if not SB_KEY:
    raise RuntimeError("SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_KEY) "
                       "must be set; run via launchd or `source ~/.scanner-env`.")
HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}

OUT_PATH = Path(__file__).resolve().parent / "full_v2_sample_cases.md"

N_SCANS = 5
COMBOS = [
    {
        "label": "A. sport / outdoor / limestone / balanced",
        "discipline": "sport", "environment": "outdoor",
        "rock": "limestone", "aggressiveness": "balanced",
    },
    {
        "label": "B. boulder / indoor / aggressive",
        "discipline": "boulder", "environment": "indoor",
        "rock": None, "aggressiveness": "aggressive",
    },
]


# ─────────────────────────────────────────────────────────────────────
# Data loading
# ─────────────────────────────────────────────────────────────────────

def load_recent_scans(n):
    """Most recent n scans that have measurements (forefoot_width_class set)."""
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
            "forefoot_width_class": "not.is.null",
            "order": "created_at.desc", "limit": n,
        }, timeout=30)
    r.raise_for_status()
    return r.json()


def load_shoes_db():
    # Roman 2026-05-02 case-4 review (D): added upper_material and
    # special_fit_notes so flatten_pick can pass them through to V1
    # _para_description for the build/sole sentence.
    r = requests.get(f"{SB_URL}/rest/v1/shoes", headers=HEADERS,
        params={"select": (
            "slug,brand,model,closure,downturn,asymmetry,toe_form,"
            "computed_stiffness,use_cases,best_rock_types,kids_friendly,"
            "ankle_protection,width,heel_volume,forefoot_volume,no_edge,"
            "rubber_thickness_mm,rubber_type,midsole_stiffness,"
            "rubber_hardness,description,feel,heel_rubber_coverage,"
            "midsole,break_in_period,stretch_expectation,"
            "upper_material,special_fit_notes"
        ), "limit": 1000}, timeout=30)
    r.raise_for_status()
    return r.json()


def load_price_rows():
    """Load per-(slug,size) price rows from the shoe_prices_by_size view.

    The view normalises both shoe_prices storage models — the array model
    (sizes_available) and the per-size model (eur_size, used by the
    bergfreunde/gigasport AWIN affiliate feeds) — into one row per
    product+size. Each row carries a single numeric ``size_eu``.

    Paginated: the REST API hard-caps every response at 1000 rows, so a
    single large ``limit`` would silently truncate.
    """
    rows, offset = [], 0
    while True:
        r = requests.get(f"{SB_URL}/rest/v1/shoe_prices_by_size", headers=HEADERS,
            params={"select": "product_slug,price_eur,in_stock,size_eu",
                    "order": "source_id,size_eu",
                    "limit": 1000, "offset": offset}, timeout=30)
        r.raise_for_status()
        b = r.json()
        if not b: break
        rows.extend(b)
        if len(b) < 1000: break
        offset += 1000
    return rows


# ─────────────────────────────────────────────────────────────────────
# Profile assembly (mirrors check_shoe_desc_v2.py)
# ─────────────────────────────────────────────────────────────────────

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
        # Preserve size_eu + db_toe_form + db_closure so the §2 cascade
        # generator can derive sizing status, toe-form match, and closure
        # exclusions per shoe (Roman 2026-05-01 cascade implementation).
        size_eu = us.get("size_eu") or us.get("size")
        try:
            f = float(size_eu) if size_eu is not None else None
            # Drop trailing .0 so "44.0" -> 44, "44.5" stays 44.5
            size_eu = int(f) if (f is not None and f.is_integer()) else f
        except (TypeError, ValueError):
            size_eu = None
        out.append({
            "brand": us.get("brand", ""),
            "model": us.get("model", ""),
            "size_eu": size_eu,
            "db_width": db.get("width") if db else None,
            "db_heel_volume": db.get("heel_volume") if db else None,
            "db_forefoot_volume": db.get("forefoot_volume") if db else None,
            "db_downturn": db.get("downturn") if db else None,
            "db_asymmetry": db.get("asymmetry") if db else None,
            "db_stiffness": db.get("computed_stiffness") if db else None,
            "db_toe_form": db.get("toe_form") if db else None,
            "db_closure": db.get("closure") if db else None,
            "fit": us.get("fit") or {},
        })
    return out


def build_profile(scan, shoes_db):
    return {
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


# ─────────────────────────────────────────────────────────────────────
# Markdown rendering
# ─────────────────────────────────────────────────────────────────────

def md_paragraphs(paras, prefix=""):
    """Render a list of paragraph strings as markdown blockquotes."""
    if not paras:
        return "_(no paragraphs)_\n"
    return "\n".join(f"{prefix}> {p}\n" for p in paras) + "\n"


def md_target(target):
    fw = target.get("target_fw");  hv = target.get("target_hv")
    fv = target.get("target_fv")
    asym = target.get("target_asym_lbl");  dt = target.get("target_dt_lbl")
    asym_baseline = target.get("asym_baseline_lbl")
    asym_delta = target.get("asym_delta", 0)
    asym_reason = target.get("asym_reason", "")
    stiff_t = target.get("stiff_target");  lo = target.get("stiff_lo");  hi = target.get("stiff_hi")
    return (
        f"- target_fw=`{fw}`  target_hv=`{hv}`  target_fv=`{fv}`\n"
        f"- target_dt=`{dt}`  target_asym=`{asym}` (baseline=`{asym_baseline}`, "
        f"delta={asym_delta:+d}, reason: {asym_reason or 'none'})\n"
        f"- stiff anchor={stiff_t:.2f}, window=[{lo:.2f}, {hi:.2f}]\n"
    )


def md_breakdown(score_dict):
    bd = score_dict.get("breakdown") or {}
    parts = []
    for k in sorted(bd.keys()):
        v = bd[k]
        sc = v[0] if isinstance(v, tuple) else v
        parts.append(f"{k}={sc:+d}")
    return ", ".join(parts)


def render_scan_combo(out, scan, profile, combo, shoes_db, price_rows):
    """Render one (scan, combo) cell."""
    out.append(f"\n### Combo {combo['label']}\n")

    # ---- Build v2 unified target ----
    fit_target = resolve_targets_v2(profile, profile["shoes"], combo["aggressiveness"])
    use_target = compute_use_case_target(combo["discipline"], combo["environment"],
                                          combo["rock"], combo["aggressiveness"])
    target = {**fit_target, **use_target}

    out.append("**Unified target**\n")
    out.append(md_target(target))

    # ---- Section 1 (v1 unchanged) ----
    out.append("\n**Section 1 — Your Foot Shape**\n\n")
    sec1 = generate_foot_shape(profile)
    out.append(md_paragraphs(sec1))

    # ---- Section 2 (v1 unchanged) ----
    out.append("\n**Section 2 — What Your Current Shoe Fit Tells Us**\n\n")
    sec2 = generate_shoe_fit(profile)
    out.append(md_paragraphs(sec2))

    # ---- Section 3 (v2 augmented) ----
    out.append("\n**Section 3 — What to Look For (v2)**\n\n")
    sec3 = generate_what_to_look_for_v2(
        profile, profile["shoes"],
        discipline=combo["discipline"], environment=combo["environment"],
        rock=combo["rock"], aggressiveness=combo["aggressiveness"],
        target=target,
    )
    out.append(md_paragraphs(sec3))

    # ---- Recommendations (4 tiers × 3 picks) ----
    out.append("\n**Recommendations (4 tiers × up to 3 picks)**\n")

    try:
        tiers = assemble_tiers(profile, shoes_db, target, price_rows=price_rows)
    except Exception as e:
        out.append(f"\n_assemble_tiers raised: `{type(e).__name__}: {e}`_\n")
        return

    # Build a flat all-picks list for peer-suppression in P3
    all_picks_flat = []
    for tname in ("baseline", "softer", "stiffer", "budget"):
        for sc, sh in tiers[tname]:
            all_picks_flat.append(flatten_pick(sc, sh, tier=tname, target=target))

    # Budget price lookup
    price_lookup = {}
    for sc, sh in tiers["budget"]:
        if sc.get("best_price_at_size") is not None:
            price_lookup[sh["slug"]] = sc["best_price_at_size"]

    for tname in ("baseline", "softer", "stiffer", "budget"):
        picks = tiers[tname]
        out.append(f"\n#### Tier: {tname} (n={len(picks)})\n")
        if not picks:
            out.append("_no picks_\n")
            continue
        for sc, sh in picks:
            best_price = price_lookup.get(sh["slug"]) if tname == "budget" else None
            pick = flatten_pick(sc, sh, tier=tname, target=target,
                                 best_price=best_price)
            try:
                paras = generate_shoe_description_v2(pick, profile,
                                                     all_picks=all_picks_flat)
            except Exception as e:
                out.append(f"\n_generate_shoe_description_v2 raised: "
                           f"`{type(e).__name__}: {e}`_\n")
                continue
            price_str = f"  €{best_price:.0f}" if best_price else ""
            out.append(f"\n**{sh['brand']} {sh['model']}** — score={sc['score']}{price_str}\n\n")
            for j, p in enumerate(paras, 1):
                out.append(f"> **P{j}.** {p}\n>\n")
            out.append(f"\n_breakdown:_ `{md_breakdown(sc)}`\n")


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────

def main():
    print(f"# loading scans / shoes / prices …", file=sys.stderr)
    scans = load_recent_scans(N_SCANS)
    shoes_db = load_shoes_db()
    price_rows = load_price_rows()
    print(f"# {len(scans)} scans, {len(shoes_db)} shoes, "
          f"{len(price_rows)} price rows", file=sys.stderr)

    out = []
    out.append("# V2 end-to-end sample cases\n")
    out.append(f"\n_{N_SCANS} most recent scans × {len(COMBOS)} combos = "
               f"{N_SCANS * len(COMBOS)} cells. Generated by "
               f"`check_full_v2_matrix.py`._\n")

    for i, scan in enumerate(scans, 1):
        profile = build_profile(scan, shoes_db)
        sid8 = scan["id"][:8]
        n_shoes = len(profile["shoes"])
        out.append(f"\n---\n\n## Scan {i}/{len(scans)} — `{sid8}`  "
                   f"({scan.get('created_at', '')})\n")
        out.append(
            f"\n_summary_ — toe_shape=`{profile.get('toe_shape')}`, "
            f"hva=`{profile.get('hallux_valgus_class')}`, "
            f"fw=`{profile.get('forefoot_width_class')}`, "
            f"hw=`{profile.get('heel_width_class')}`, "
            f"hd=`{profile.get('heel_depth_class')}`, "
            f"instep=`{profile.get('instep_height_class')}`, "
            f"shoes={n_shoes}\n"
        )
        for combo in COMBOS:
            print(f"  scan {sid8} × {combo['label']}", file=sys.stderr)
            render_scan_combo(out, scan, profile, combo, shoes_db, price_rows)

    OUT_PATH.write_text("".join(out), encoding="utf-8")
    print(f"\n# wrote {OUT_PATH} ({OUT_PATH.stat().st_size:,} bytes)",
          file=sys.stderr)


if __name__ == "__main__":
    main()
