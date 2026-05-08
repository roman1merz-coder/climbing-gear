#!/usr/bin/env python3
"""End-to-end V2 matrix harness — HTML version.

Same content as check_full_v2_matrix.py but renders to a clean, readable
self-contained HTML page with sticky nav, color-coded scores, and
proper typography.

Output: ``explore_v2/full_v2_sample_cases.html``
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

# Re-use data loading from the markdown harness
from check_full_v2_matrix import (
    load_recent_scans, load_shoes_db, load_price_rows, build_profile,
    N_SCANS, COMBOS,
)

OUT_PATH = Path(__file__).resolve().parent / "full_v2_sample_cases.html"


# ─────────────────────────────────────────────────────────────────────
# CSS
# ─────────────────────────────────────────────────────────────────────

CSS = """
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  margin: 0; color: #1a1a1a; background: #fafafa;
  display: grid; grid-template-columns: 260px 1fr; min-height: 100vh;
}
nav.toc {
  position: sticky; top: 0; align-self: start;
  height: 100vh; overflow-y: auto;
  background: #fff; border-right: 1px solid #e5e5e5;
  padding: 20px 16px; font-size: 13px; line-height: 1.5;
}
nav.toc h2 { font-size: 14px; margin: 0 0 12px; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
nav.toc ul { list-style: none; padding: 0; margin: 0; }
nav.toc li { margin: 6px 0; }
nav.toc li.scan { font-weight: 600; margin-top: 14px; }
nav.toc li.combo { padding-left: 12px; }
nav.toc a { color: #2c5282; text-decoration: none; }
nav.toc a:hover { text-decoration: underline; }

main { padding: 32px 48px 80px; max-width: 980px; }
h1 { margin: 0 0 8px; font-size: 28px; }
h1 + p { color: #666; font-size: 14px; margin: 0 0 32px; }
h2.scan { margin: 48px 0 4px; font-size: 22px; padding-top: 12px; border-top: 2px solid #ccc; }
h3.combo { margin: 24px 0 12px; font-size: 17px; color: #444; padding: 8px 14px;
           background: #f0eef9; border-left: 4px solid #6b5b95; border-radius: 3px; }
h4 { margin: 22px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.6px; color: #555; }

.summary, .target {
  background: #f5f5f5; border-radius: 6px; padding: 12px 16px; margin: 6px 0 16px;
  font-size: 13px; line-height: 1.7; color: #333;
}
.summary code, .target code {
  background: #fff; padding: 1px 6px; border-radius: 3px; border: 1px solid #ddd;
  font-size: 12px;
}

.paragraphs p {
  background: #fff; border: 1px solid #e5e5e5; border-radius: 6px;
  padding: 12px 16px; margin: 8px 0; line-height: 1.55;
}
.paragraphs p.empty { color: #999; font-style: italic; }

.tier { margin: 24px 0 8px; }
.tier-name { display: inline-block; padding: 3px 10px; border-radius: 12px;
             font-size: 12px; font-weight: 600; text-transform: uppercase;
             letter-spacing: 0.5px; }
.tier-baseline .tier-name { background: #e0f2e9; color: #1f6e3f; }
.tier-softer   .tier-name { background: #e6f0fb; color: #2563eb; }
.tier-stiffer  .tier-name { background: #fff0e0; color: #c2410c; }
.tier-budget   .tier-name { background: #f3e8ff; color: #6b21a8; }

.pick {
  background: #fff; border: 1px solid #e5e5e5; border-radius: 8px;
  margin: 10px 0; padding: 14px 18px;
}
.pick-head { display: flex; justify-content: space-between; align-items: baseline;
             gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
.pick-head .name { font-weight: 600; font-size: 15px; }
.pick-head .score {
  font-size: 13px; padding: 2px 8px; border-radius: 10px; background: #eef;
  font-variant-numeric: tabular-nums;
}
.pick-head .price { color: #666; font-size: 13px; font-variant-numeric: tabular-nums; }

.pick p { margin: 6px 0; line-height: 1.5; font-size: 14px; }
.pick p .label { display: inline-block; width: 28px; font-weight: 600; color: #6b5b95; }
.pick p.fallback { color: #888; font-style: italic; }

.breakdown { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
             font-size: 11px; color: #555; margin-top: 8px; padding-top: 8px;
             border-top: 1px dashed #e5e5e5; word-break: break-word; }
.breakdown .b-pos { color: #1f6e3f; }
.breakdown .b-neg { color: #b91c1c; }
.breakdown .b-zero { color: #999; }

.error { background: #fef2f2; border-left: 3px solid #b91c1c; padding: 8px 12px;
         color: #7f1d1d; font-size: 13px; }
"""

# Generic-fallback markers used to grey-out boilerplate paragraphs
P2_FALLBACKS = (
    "Good overall fit for your foot shape and climbing style.",
)
P3_FALLBACKS = (
    "No notable tradeoffs for your foot shape.",
)


# ─────────────────────────────────────────────────────────────────────
# Rendering helpers
# ─────────────────────────────────────────────────────────────────────

def esc(s):
    return html.escape(s if s is not None else "", quote=True)


def render_paragraphs(paras, fallback_markers=()):
    if not paras:
        return '<div class="paragraphs"><p class="empty">(no paragraphs)</p></div>'
    out = ['<div class="paragraphs">']
    for p in paras:
        cls = ""
        if any(m in p for m in fallback_markers):
            cls = ' class="empty"'
        out.append(f"<p{cls}>{esc(p)}</p>")
    out.append("</div>")
    return "".join(out)


def render_target(target):
    fw = target.get("target_fw");  hv = target.get("target_hv")
    fv = target.get("target_fv")
    asym = target.get("target_asym_lbl");  dt = target.get("target_dt_lbl")
    asym_baseline = target.get("asym_baseline_lbl")
    asym_delta = target.get("asym_delta", 0)
    asym_reason = target.get("asym_reason", "")
    stiff_t = target.get("stiff_target");  lo = target.get("stiff_lo");  hi = target.get("stiff_hi")
    return (
        '<div class="target">'
        f'fw=<code>{fw}</code> &nbsp; hv=<code>{hv}</code> &nbsp; fv=<code>{fv}</code><br>'
        f'dt=<code>{esc(dt)}</code> &nbsp; '
        f'asym=<code>{esc(asym)}</code> '
        f'(baseline <code>{esc(asym_baseline)}</code>, delta {asym_delta:+d}, '
        f'reason: {esc(asym_reason or "none")})<br>'
        f'stiff anchor <code>{stiff_t:.2f}</code>, '
        f'window <code>[{lo:.2f}, {hi:.2f}]</code>'
        '</div>'
    )


def render_breakdown(score_dict):
    bd = score_dict.get("breakdown") or {}
    parts = []
    for k in sorted(bd.keys()):
        v = bd[k]
        sc = v[0] if isinstance(v, tuple) else v
        if sc > 0:   cls = "b-pos"
        elif sc < 0: cls = "b-neg"
        else:        cls = "b-zero"
        parts.append(f'<span class="{cls}">{esc(k)}={sc:+d}</span>')
    return '<div class="breakdown">' + ", ".join(parts) + "</div>"


def render_pick(sc, sh, pick, paras, *, tier, best_price=None):
    name = f"{sh.get('brand', '')} {sh.get('model', '')}".strip()
    score = sc.get("score", 0)
    price_html = f'<span class="price">€{best_price:.0f}</span>' if best_price else ""
    out = [f'<div class="pick">']
    out.append(
        f'<div class="pick-head">'
        f'<span class="name">{esc(name)}</span>'
        f'<span style="flex:1"></span>'
        f'{price_html}'
        f'<span class="score">score {score}</span>'
        f'</div>'
    )
    labels = ("P1", "P2", "P3", "P4", "P5")
    for j, p in enumerate(paras):
        lbl = labels[j] if j < len(labels) else f"P{j+1}"
        # Grey out the generic fallback lines so the eye skips them
        is_fallback = (lbl == "P2" and any(m in p for m in P2_FALLBACKS)) or \
                      (lbl == "P3" and any(m in p for m in P3_FALLBACKS))
        cls = ' class="fallback"' if is_fallback else ""
        out.append(f'<p{cls}><span class="label">{lbl}.</span> {esc(p)}</p>')
    out.append(render_breakdown(sc))
    out.append('</div>')
    return "".join(out)


# ─────────────────────────────────────────────────────────────────────
# Cell renderer
# ─────────────────────────────────────────────────────────────────────

def render_cell(out, anchor, scan, profile, combo, shoes_db, price_rows):
    out.append(f'<h3 class="combo" id="{anchor}">{esc(combo["label"])}</h3>')

    fit_target = resolve_targets_v2(profile, profile["shoes"], combo["aggressiveness"])
    use_target = compute_use_case_target(combo["discipline"], combo["environment"],
                                          combo["rock"], combo["aggressiveness"])
    target = {**fit_target, **use_target}

    out.append('<h4>Unified target</h4>')
    out.append(render_target(target))

    out.append('<h4>Section 1 — Your Foot Shape</h4>')
    out.append(render_paragraphs(generate_foot_shape(profile)))

    out.append('<h4>Section 2 — What Your Current Shoe Fit Tells Us</h4>')
    out.append(render_paragraphs(generate_shoe_fit(profile)))

    out.append('<h4>Section 3 — What to Look For (v2)</h4>')
    sec3 = generate_what_to_look_for_v2(
        profile, profile["shoes"],
        discipline=combo["discipline"], environment=combo["environment"],
        rock=combo["rock"], aggressiveness=combo["aggressiveness"],
        target=target,
    )
    out.append(render_paragraphs(sec3))

    out.append('<h4>Recommendations (4 tiers × up to 3 picks)</h4>')

    try:
        tiers = assemble_tiers(profile, shoes_db, target, price_rows=price_rows)
    except Exception as e:
        out.append(f'<div class="error">assemble_tiers raised: '
                   f'<code>{esc(type(e).__name__)}: {esc(str(e))}</code></div>')
        return

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
        out.append(f'<div class="tier tier-{tname}">'
                   f'<span class="tier-name">{esc(tname)}</span> '
                   f'<small style="color:#888"> &nbsp;n={len(picks)}</small>'
                   f'</div>')
        if not picks:
            out.append('<p class="paragraphs"><span class="empty">(no picks)</span></p>')
            continue
        for sc, sh in picks:
            best_price = price_lookup.get(sh["slug"]) if tname == "budget" else None
            pick = flatten_pick(sc, sh, tier=tname, target=target,
                                 best_price=best_price)
            try:
                paras = generate_shoe_description_v2(pick, profile,
                                                     all_picks=all_picks_flat)
            except Exception as e:
                out.append(f'<div class="error">generate_shoe_description_v2 raised: '
                           f'<code>{esc(type(e).__name__)}: {esc(str(e))}</code></div>')
                continue
            out.append(render_pick(sc, sh, pick, paras, tier=tname, best_price=best_price))


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────

def main():
    print("# loading scans / shoes / prices …", file=sys.stderr)
    scans = load_recent_scans(N_SCANS)
    shoes_db = load_shoes_db()
    price_rows = load_price_rows()
    print(f"# {len(scans)} scans, {len(shoes_db)} shoes, "
          f"{len(price_rows)} price rows", file=sys.stderr)

    body = []
    toc  = ['<nav class="toc"><h2>Cells</h2><ul>']

    body.append('<h1>V2 end-to-end sample cases</h1>')
    body.append(f'<p>{N_SCANS} most recent scans &times; {len(COMBOS)} combos = '
                f'{N_SCANS * len(COMBOS)} cells. Generated by '
                f'<code>check_full_v2_html.py</code>. Greyed-out paragraphs are '
                f'generic fallbacks (mostly P2 silent-degrade — known TODO).</p>')

    for i, scan in enumerate(scans, 1):
        profile = build_profile(scan, shoes_db)
        sid8 = scan["id"][:8]
        n_shoes = len(profile["shoes"])
        scan_anchor = f"scan-{sid8}"
        body.append(f'<h2 class="scan" id="{scan_anchor}">'
                    f'Scan {i}/{len(scans)} — {sid8}</h2>')
        body.append(
            '<div class="summary">'
            f'<code>{esc(scan.get("created_at", ""))}</code> &nbsp;·&nbsp; '
            f'toe=<code>{esc(profile.get("toe_shape"))}</code> &nbsp; '
            f'hva=<code>{esc(profile.get("hallux_valgus_class"))}</code> &nbsp; '
            f'fw=<code>{esc(profile.get("forefoot_width_class"))}</code> &nbsp; '
            f'hw=<code>{esc(profile.get("heel_width_class"))}</code> &nbsp; '
            f'hd=<code>{esc(profile.get("heel_depth_class"))}</code> &nbsp; '
            f'instep=<code>{esc(profile.get("instep_height_class"))}</code> &nbsp; '
            f'shoes=<code>{n_shoes}</code>'
            '</div>'
        )

        toc.append(f'<li class="scan"><a href="#{scan_anchor}">'
                   f'{i}. {sid8}</a></li>')

        for combo in COMBOS:
            print(f"  scan {sid8} × {combo['label']}", file=sys.stderr)
            anchor = f"scan-{sid8}-combo-{combo['discipline']}"
            short_label = combo["label"].split(".", 1)[0]  # "A" or "B"
            toc.append(f'<li class="combo"><a href="#{anchor}">'
                       f'{short_label}: {esc(combo["discipline"])}/{esc(combo["aggressiveness"])}'
                       f'</a></li>')
            render_cell(body, anchor, scan, profile, combo, shoes_db, price_rows)

    toc.append('</ul></nav>')

    page = (
        '<!doctype html><html><head><meta charset="utf-8">'
        '<title>V2 end-to-end sample cases</title>'
        f'<style>{CSS}</style></head><body>'
        + "".join(toc)
        + '<main>' + "".join(body) + '</main>'
        + '</body></html>'
    )

    OUT_PATH.write_text(page, encoding="utf-8")
    print(f"\n# wrote {OUT_PATH} ({OUT_PATH.stat().st_size:,} bytes)",
          file=sys.stderr)


if __name__ == "__main__":
    main()
