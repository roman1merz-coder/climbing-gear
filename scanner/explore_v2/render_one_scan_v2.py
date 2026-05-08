#!/usr/bin/env python3
"""Render a single scan through the V2 pipeline and emit a self-contained
HTML page for review.

Usage:
    render_one_scan_v2.py <scan_id> <discipline> <environment> <rock_or_-> <aggressiveness> <out_html>

Example:
    render_one_scan_v2.py scan-2026-04-27T10-19-34 boulder outdoor sandstone aggressive /tmp/v2_review.html

Sandbox rule: lives in scanner/explore_v2 alongside the rest of the V2
harness. Reads from production foot_scan_fits but writes nowhere else.
"""
import os, sys, json, html, requests
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

# Re-use loaders + profile builder from the matrix harness
from check_full_v2_matrix import (
    load_shoes_db, load_price_rows, build_profile,
)
# Re-use HTML rendering helpers (CSS, render_paragraphs, render_target,
# render_breakdown, render_pick, P2/P3 fallback markers)
from check_full_v2_html import (
    CSS, render_paragraphs, render_target, render_pick,
    P2_FALLBACKS, P3_FALLBACKS, esc,
)

SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY",
    "MUST_BE_SET_VIA_ENV")
HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}


def load_scan_by_id(scan_id):
    """Pull one row by its human-readable scan_id (NOT the uuid pk)."""
    r = requests.get(f"{SB_URL}/rest/v1/foot_scan_fits", headers=HEADERS,
        params={
            "select": (
                "id,scan_id,created_at,sex,toe_shape,toe_confidence,"
                "hva_offset_ratio,hallux_valgus_class,instep_height_ratio,"
                "instep_height_class,"
                "forefoot_width_ratio,forefoot_width_class,"
                "heel_width_ratio,heel_width_class,"
                "heel_depth_ratio,heel_depth_class,"
                "shoes,street_size_eu,next_shoe_preference,next_shoe_notes,"
                "interpretation,recommendations"
            ),
            "scan_id": f"eq.{scan_id}",
            "limit": 1,
        }, timeout=30)
    r.raise_for_status()
    rows = r.json()
    if not rows:
        raise RuntimeError(f"no scan with scan_id={scan_id}")
    return rows[0]


def main():
    if len(sys.argv) != 7:
        print(__doc__); sys.exit(1)
    scan_id, discipline, environment, rock, aggressiveness, out_path = sys.argv[1:]
    if rock == "-": rock = None

    print(f"# loading scan {scan_id} + shoes/prices …", file=sys.stderr)
    scan = load_scan_by_id(scan_id)
    shoes_db = load_shoes_db()
    price_rows = load_price_rows()
    profile = build_profile(scan, shoes_db)
    print(f"# scan loaded; {len(shoes_db)} shoes, {len(price_rows)} prices",
          file=sys.stderr)

    # Build unified target
    fit_target = resolve_targets_v2(profile, profile["shoes"], aggressiveness)
    use_target = compute_use_case_target(discipline, environment, rock, aggressiveness)
    target = {**fit_target, **use_target}

    # Page header
    body = []
    body.append('<h1>V2 result preview</h1>')
    body.append(
        f'<p><code>{esc(scan_id)}</code> &middot; '
        f'{esc(scan.get("created_at",""))} &middot; '
        f'sex=<code>{esc(scan.get("sex"))}</code> &middot; '
        f'street EU <code>{esc(str(scan.get("street_size_eu")))}</code></p>'
    )
    body.append(
        '<div class="summary">'
        f'toe=<code>{esc(profile.get("toe_shape"))}</code> &nbsp; '
        f'hva=<code>{esc(profile.get("hallux_valgus_class"))}</code> &nbsp; '
        f'fw=<code>{esc(profile.get("forefoot_width_class"))}</code> &nbsp; '
        f'hw=<code>{esc(profile.get("heel_width_class"))}</code> &nbsp; '
        f'hd=<code>{esc(profile.get("heel_depth_class"))}</code> &nbsp; '
        f'instep=<code>{esc(profile.get("instep_height_class"))}</code> &nbsp; '
        f'shoes=<code>{len(profile["shoes"])}</code>'
        '</div>'
    )

    body.append('<h3 class="combo">V2 wizard answers</h3>')
    body.append(
        '<div class="summary">'
        f'discipline=<code>{esc(discipline)}</code> &nbsp; '
        f'environment=<code>{esc(environment)}</code> &nbsp; '
        f'rock=<code>{esc(rock if rock else "-")}</code> &nbsp; '
        f'aggressiveness=<code>{esc(aggressiveness)}</code>'
        '</div>'
    )

    body.append('<h4>Unified target (v2)</h4>')
    body.append(render_target(target))

    body.append('<h4>Section 1 &mdash; Your Foot Shape</h4>')
    body.append(render_paragraphs(generate_foot_shape(profile)))

    body.append('<h4>Section 2 &mdash; What Your Current Shoe Fit Tells Us</h4>')
    body.append(render_paragraphs(generate_shoe_fit(profile)))

    body.append('<h4>Section 3 &mdash; What to Look For (v2)</h4>')
    sec3 = generate_what_to_look_for_v2(
        profile, profile["shoes"],
        discipline=discipline, environment=environment,
        rock=rock, aggressiveness=aggressiveness, target=target,
    )
    body.append(render_paragraphs(sec3))

    body.append('<h4>Recommendations &mdash; 4 tiers &times; up to 3 picks (v2)</h4>')

    try:
        tiers = assemble_tiers(profile, shoes_db, target, price_rows=price_rows)
    except Exception as e:
        body.append(f'<div class="error">assemble_tiers raised: '
                    f'<code>{esc(type(e).__name__)}: {esc(str(e))}</code></div>')
        tiers = {"baseline": [], "softer": [], "stiffer": [], "budget": []}

    all_picks_flat = []
    for tname in ("baseline", "softer", "stiffer", "budget"):
        for sc, sh in tiers[tname]:
            all_picks_flat.append(flatten_pick(sc, sh, tier=tname, target=target))

    price_lookup = {}
    for sc, sh in tiers["budget"]:
        if sc.get("best_price_at_size") is not None:
            price_lookup[sh["slug"]] = sc["best_price_at_size"]

    for tname in ("baseline", "softer", "stiffer", "budget"):
        picks = tiers[tname]
        body.append(f'<div class="tier tier-{tname}">'
                    f'<span class="tier-name">{esc(tname)}</span> '
                    f'<small style="color:#888"> &nbsp;n={len(picks)}</small>'
                    f'</div>')
        if not picks:
            body.append('<p class="paragraphs"><span class="empty">(no picks)</span></p>')
            continue
        for sc, sh in picks:
            best_price = price_lookup.get(sh["slug"]) if tname == "budget" else None
            pick = flatten_pick(sc, sh, tier=tname, target=target,
                                best_price=best_price)
            try:
                paras = generate_shoe_description_v2(pick, profile,
                                                    all_picks=all_picks_flat)
            except Exception as e:
                body.append(f'<div class="error">generate_shoe_description_v2 raised: '
                            f'<code>{esc(type(e).__name__)}: {esc(str(e))}</code></div>')
                continue
            body.append(render_pick(sc, sh, pick, paras, tier=tname,
                                    best_price=best_price))

    # Single-column layout (no nav.toc — only one cell)
    css_extra = """
    body { display: block !important; }
    main { max-width: 980px; margin: 0 auto; padding: 32px 48px 80px; }
    """
    page = (
        '<!doctype html><html><head><meta charset="utf-8">'
        f'<title>V2 review &middot; {esc(scan_id)}</title>'
        f'<style>{CSS}{css_extra}</style></head><body>'
        '<main>' + "".join(body) + '</main>'
        '</body></html>'
    )

    Path(out_path).write_text(page, encoding="utf-8")
    print(f"# wrote {out_path} ({Path(out_path).stat().st_size:,} bytes)",
          file=sys.stderr)


if __name__ == "__main__":
    main()
