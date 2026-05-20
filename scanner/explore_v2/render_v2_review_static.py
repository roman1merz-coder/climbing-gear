#!/usr/bin/env python3
"""Faithful static HTML clone of ScanResult.jsx, populated with V2
pipeline output for a single scan. NO production writes. NO live fetch.

Matches every component visible on the live results page:
  - Header (climbing-gear.com badge + 'Your Foot Profile')
  - ShareCard
  - EmailCapture (visual; non-functional)
  - UserInputsPanel (sex, street size, next shoe, current shoes + FitBadges)
  - SectionNav (centered pill tabs)
  - Foot views row: sole card (toe shape + 3 MetricBars) + side card (2 MetricBars)
  - 'What This Means' interpretation blocks (V2 Section 3)
  - Recommendations (4 tier groups, ShoeCards, "See more" CTAs)
  - Footer CTAs (Browse Database, Give Feedback)
"""
import os, sys, json, html as htmllib, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import requests

from target_resolver_v2 import (resolve_targets_v2, _scrub_sizing_artifacts,
                                  _user_dim_rank, _cup_rank)
from matrix_scorer_v2 import compute_use_case_target, assemble_tiers
from interp_what_to_look_for_v2 import generate_what_to_look_for_v2
from interp_shoe_desc_v2 import flatten_pick, generate_shoe_description_v2
# Both interpretation engines come from the sandbox copies so production
# benchmark/* files are untouched. Section 1 = interp_foot_shape_v2 (with
# Option C tag-list opening + cinch sweep). Section 2 = interp_shoe_fit_v2
# (scan-aware heel/toes disambiguation).
from interp_foot_shape_v2 import generate_foot_shape
from interp_shoe_fit_v2 import generate_shoe_fit
from check_full_v2_matrix import load_shoes_db, load_price_rows, build_profile

SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
# Roman 2026-05-08: keys migrated to sb_secret_/sb_publishable_ format
# (see security: migrate to Supabase publishable/secret key format commit).
# Read from env only — never hardcode (GitHub push protection blocks it).
SB_KEY = (os.environ.get("SUPABASE_SECRET_KEY")
          or os.environ.get("SUPABASE_SERVICE_KEY"))
if not SB_KEY:
    raise RuntimeError("SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_KEY) "
                       "must be set; run via launchd or `source ~/.scanner-env`.")
HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}

CDN_BASE = "https://www.climbing-gear.com"

# ─── tokens.js mirror ──────────────────────────────────────────────
T = {
    "bg": "#f5f0e8", "surface": "#ffffff", "card": "#ffffff",
    "border": "#d5cdbf", "text": "#2c3227", "muted": "#7a7462",
    "accent": "#c98a42", "accentSoft": "rgba(201,138,66,0.10)",
    # Roman 2026-05-08: extreme-tier color (very low / very high / pronounced)
    # — darker variant of accent for stronger off-target signal.
    "accentDark": "#8a5d20",
    "primary": "#3d7a52", "green": "#3d7a52",
    "navBg": "rgba(245,240,232,0.92)",
    "font": "'DM Sans', 'Instrument Sans', system-ui, sans-serif",
    "display": "'Playfair Display', Georgia, serif",
    "mono": "'JetBrains Mono', monospace",
}

# ─── ScanResult.jsx constants (Roman 2026-05-08: 5-tier, sandbox) ──
# Boundaries from POP_5TIER in interp_foot_shape_v2.py — derived from
# n=340 production scans at the 20th/40th/60th/80th percentiles.
# Roman 2026-05-12: tier widths rebalanced to 16.7 / 16.7 / 33.3 / 16.7 / 16.7
# percentile splits (was 20 / 20 / 20 / 20 / 20). Keeps mid-tier 1/3 of
# population so users only get flagged off-center when meaningfully so.
# Thresholds match interp_foot_shape_v2.POP_5TIER (single source of truth).
POP = {
    "forefoot_width_ratio":  {"mean": 0.354, "std": 0.029,
                              "vl_lo": 0.331, "lo": 0.343, "hi": 0.367, "vh_hi": 0.384},
    "arch_length_ratio":     {"mean": 0.725, "std": 0.024,
                              "vl_lo": 0.700, "lo": 0.714, "hi": 0.735, "vh_hi": 0.747},
    "heel_width_ratio":      {"mean": 0.236, "std": 0.021,
                              "vl_lo": 0.218, "lo": 0.228, "hi": 0.245, "vh_hi": 0.255},
    "instep_height_ratio":   {"mean": 0.263, "std": 0.102,
                              "vl_lo": 0.241, "lo": 0.255, "hi": 0.273, "vh_hi": 0.294},
    "heel_depth_ratio":      {"mean": 0.036, "std": 0.030,
                              "vl_lo": 0.022, "lo": 0.029, "hi": 0.043, "vh_hi": 0.053},
}
# HVA: kept at 3 tiers (per Roman 2026-05-08 — "use the HVA logic and
# values, just visualization, call it differently"). Thresholds match
# the existing classifier in foot_measure.py.
HVA_BOUNDS = {"mild_lo": 0.25, "pronounced_lo": 0.35}

META = {
    "forefoot_width_ratio":  "Forefoot Width",
    "arch_length_ratio":     "Arch Length",
    "heel_width_ratio":      "Heel Width",
    "instep_height_ratio":   "Instep Height",
    "heel_depth_ratio":      "Heel Depth",
    "hva_offset_ratio":      "Big Toe Inward Drift",
}
VISUAL_SIGMA = 3
TOE_DESCRIPTIONS = {
    "egyptian": "Big toe is the longest, toes descend in a smooth slope.",
    "greek":    "Second toe is the longest, extends past the big toe.",
    "roman":    "First two toes are nearly equal in length.",
}
PREF_LABELS = {
    "comfort": "More comfort", "same": "Same balance",
    "performance": "More performance", "allround": "Not specified",
}
FIT_LABELS = {"tight": "Tight", "perfect": "Perfect", "loose": "Loose"}
CATEGORY_META = {
    "baseline": ("Your Best Match", "Best fit to your use case and performance preference", "top matches"),
    "softer":   ("Softer Shoes",    "For more sensitivity and better smearing.", "softer picks"),
    "stiffer":  ("Stiffer Shoes",   "For more support and better edging.", "stiffer picks"),
    "budget":   ("Best Value",      "Affordable picks for real dirtbags.", "value picks"),
}

def esc(s):
    return htmllib.escape("" if s is None else str(s), quote=True)


# ─── DB helpers ────────────────────────────────────────────────────
def fetch_scan(scan_id):
    r = requests.get(f"{SB_URL}/rest/v1/foot_scan_fits", headers=HEADERS,
        params={"select": "*", "scan_id": f"eq.{scan_id}", "limit": 1}, timeout=30)
    r.raise_for_status()
    rows = r.json()
    if not rows: raise RuntimeError(f"no scan_id={scan_id}")
    return rows[0]


def fetch_shoe_images():
    r = requests.get(f"{SB_URL}/rest/v1/shoes", headers=HEADERS,
        params={"select": "slug,image_url", "limit": 2000}, timeout=30)
    r.raise_for_status()
    return {s["slug"]: s.get("image_url") for s in r.json()}


# ─── MetricBar (Roman 2026-05-12: 5-section, mid-tier widened) ─────
# Band widths in track px: 16.67 / 16.67 / 33.33 / 16.67 / 16.67 — visually
# wider mid section reflects that 1/3 of users land in mid (vs 1/5 in each
# extreme tier). Both the underlying classifier and the visual layout
# share the same percentile distribution so position math stays in sync.
_BAND_WIDTHS = (16.667, 16.667, 33.333, 16.667, 16.667)
_BAND_STARTS = (0.0, 16.667, 33.333, 66.667, 83.333)


def section_pct_5(val, vmin, vl_lo, lo, hi, vh_hi, vmax):
    """Compute pointer position 0-100 across a 5-section track. Each
    section maps 1:1 from its value range onto its band width on the
    track (which is no longer uniform — see _BAND_WIDTHS)."""
    bounds = [vmin, vl_lo, lo, hi, vh_hi, vmax]
    for i in range(5):
        b0, b1 = bounds[i], bounds[i+1]
        if val <= b1:
            span = b1 - b0
            t = (val - b0) / span if span > 0 else 0.5
            t = max(0, min(1, t))
            return _BAND_STARTS[i] + t * _BAND_WIDTHS[i]
    return 100.0


def level_label_5(val, vl_lo, lo, hi, vh_hi):
    if val < vl_lo:  return "very low"
    if val < lo:     return "low"
    if val < hi:     return "mid"
    if val < vh_hi:  return "high"
    return "very high"


def render_metric_bar(ratio_key, value):
    if value is None or ratio_key not in POP: return ""
    p = POP[ratio_key]
    vl_lo, lo, hi, vh_hi = p["vl_lo"], p["lo"], p["hi"], p["vh_hi"]
    vmin = max(0, p["mean"] - VISUAL_SIGMA * p["std"])
    vmax = p["mean"] + VISUAL_SIGMA * p["std"]
    pos = section_pct_5(value, vmin, vl_lo, lo, hi, vh_hi, vmax)
    lbl = level_label_5(value, vl_lo, lo, hi, vh_hi)
    # Color (Roman 2026-05-08): mid = green, low/high = light orange
    # (accent), very_low/very_high = dark orange (accentDark). 3-color
    # scheme matches HVA slider for consistency.
    if lbl in ("very low", "very high"):
        col = T["accentDark"]
    elif lbl in ("low", "high"):
        col = T["accent"]
    else:
        col = T["green"]
    label = META.get(ratio_key, ratio_key)
    return f"""
<div class="mbar">
  <div class="mbar-row">
    <span class="mbar-label">{esc(label)}</span>
    <span class="mbar-level" style="color:{col}">{lbl}</span>
  </div>
  <div class="mbar-track">
    <div class="mbar-band b5-1"></div>
    <div class="mbar-band b5-2"></div>
    <div class="mbar-band b5-3"></div>
    <div class="mbar-band b5-4"></div>
    <div class="mbar-band b5-5"></div>
    <div class="mbar-pointer" title="{value:.3f}" style="left:{pos:.2f}%; background:{col}"></div>
  </div>
  <div class="mbar-axis-5"><span>very low</span><span>low</span><span>mid</span><span>high</span><span>very high</span></div>
</div>
"""


# ─── HVA slider (Roman 2026-05-08): 3 sections, label "Big toe inward
# drift". Uses existing 3-tier thresholds (none / mild / pronounced).
def render_hva_bar(value, hva_class=None):
    if value is None: return ""
    mild_lo = HVA_BOUNDS["mild_lo"]       # 0.25
    pronounced_lo = HVA_BOUNDS["pronounced_lo"]  # 0.35
    # Visualize on a track from 0 to ~0.50 (covers all observed values).
    vmin = 0.0
    vmax = 0.50
    bounds = [vmin, mild_lo, pronounced_lo, vmax]
    pos = 0.0
    for i in range(3):
        b0, b1 = bounds[i], bounds[i+1]
        if value <= b1:
            span = b1 - b0
            t = (value - b0) / span if span > 0 else 0.5
            t = max(0, min(1, t))
            pos = i * 33.333 + t * 33.333
            break
    else:
        pos = 100.0

    # Roman 2026-05-08: 3-color scheme matching other sliders.
    # none = green, mild = light orange (accent), pronounced = dark
    # orange (accentDark).
    if value < mild_lo:
        lbl, col = "none", T["green"]
    elif value < pronounced_lo:
        lbl, col = "mild", T["accent"]
    else:
        lbl, col = "pronounced", T["accentDark"]

    return f"""
<div class="mbar">
  <div class="mbar-row">
    <span class="mbar-label">Big Toe Inward Drift</span>
    <span class="mbar-level" style="color:{col}">{lbl}</span>
  </div>
  <div class="mbar-track">
    <div class="mbar-band b1"></div>
    <div class="mbar-band b2"></div>
    <div class="mbar-band b3"></div>
    <div class="mbar-pointer" title="{value:.3f}" style="left:{pos:.2f}%; background:{col}"></div>
  </div>
  <div class="mbar-axis"><span>none</span><span>mild</span><span>pronounced</span></div>
</div>
"""


# ─── Visual components ─────────────────────────────────────────────
def render_share_card():
    return f"""
<div class="share-card">
  <div class="share-left">
    <span class="share-icon" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
        <line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/>
        <line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/>
      </svg>
    </span>
    <div>
      <div class="share-title">Share your results</div>
      <div class="share-sub">Send this scan to yourself or a friend.</div>
    </div>
  </div>
  <button class="share-btn" type="button">Share</button>
</div>
"""


def render_email_capture():
    return f"""
<div class="email-card">
  <div class="email-title">Get your results via email</div>
  <input class="email-input" type="email" placeholder="your@email.com" />
  <div class="email-radios">
    <label class="email-radio">
      <input type="radio" name="freq" checked />
      <span><strong>Just send me my results once.</strong>
      <span class="email-radio-sub">No follow-ups, just this one email.</span></span>
    </label>
    <label class="email-radio">
      <input type="radio" name="freq" />
      <span><strong>Keep me posted on scan updates.</strong>
      <span class="email-radio-sub">If we re-score your scan with better data, you'll hear about it.</span></span>
    </label>
  </div>
  <button class="email-send" type="button">Save</button>
</div>
"""


def fit_badge(value):
    if not value: return ""
    palette = {
        "tight":   ("#f3e3d8", "#8a4f20"),
        "perfect": ("#e3ede0", "#4a6a3a"),
        "loose":   ("#f3e3d8", "#8a4f20"),
        "squeezed": ("#f3e3d8", "#8a4f20"),
        "empty":   ("#f3e3d8", "#8a4f20"),
        "roomy":   ("#f3e3d8", "#8a4f20"),
    }
    bg, fg = palette.get(value, ("#ece5d4", "#6a5c42"))
    return f'<span class="fit-badge" style="background:{bg};color:{fg}">{esc(FIT_LABELS.get(value, value))}</span>'


def render_user_inputs_panel(scan, v2_inputs):
    shoes = scan.get("shoes") or []
    if isinstance(shoes, str):
        try: shoes = json.loads(shoes)
        except Exception: shoes = []
    sex = (scan.get("sex") or "Not specified").capitalize()
    street = scan.get("street_size_eu")
    size_str = f"EU {street}" if street is not None else "Not specified"

    # V2 inputs replace the V1 next_shoe_preference in the panel
    v2_summary = (f'{v2_inputs["discipline"]} &middot; {v2_inputs["environment"]}'
                  + (f' &middot; {v2_inputs["rock"]}' if v2_inputs["rock"] else "")
                  + f' &middot; {v2_inputs["aggressiveness"]}')

    shoe_rows = []
    for sh in shoes:
        brand_model = " ".join(filter(None, [sh.get("brand"), sh.get("model")])) or "(unnamed)"
        sz = sh.get("size_eu") or sh.get("size")
        fit = sh.get("fit") or {}
        fit_html = ""
        if fit:
            fit_bits = []
            for k in ("toes", "forefoot", "heel"):
                v = fit.get(k)
                if v:
                    fit_bits.append(f'<span class="fit-k">{k}</span>{fit_badge(v)}')
            fit_html = f'<span class="fit-row">{"".join(fit_bits)}</span>'
        shoe_rows.append(
            f'<div class="ui-shoe-row">'
            f'<span class="ui-shoe-name">{esc(brand_model)}</span>'
            + (f'<span class="ui-shoe-sz">EU {esc(sz)}</span>' if sz else "")
            + fit_html
            + '</div>'
        )

    return f"""
<div class="ui-panel">
  <div class="ui-head">
    <div class="ui-pill">Your inputs</div>
    <button class="ui-edit" type="button">Edit</button>
  </div>
  <div class="ui-row"><span class="ui-k">Sex</span><span class="ui-v">{esc(sex)}</span></div>
  <div class="ui-row"><span class="ui-k">Street size</span><span class="ui-v">{esc(size_str)}</span></div>
  <div class="ui-row"><span class="ui-k">V2 inputs</span><span class="ui-v">{v2_summary}</span></div>
  <div class="ui-shoes">
    <div class="ui-k" style="margin-bottom:6px">Current shoes {f"({len(shoes)})" if shoes else ""}</div>
    {"".join(shoe_rows) if shoe_rows else '<div class="ui-empty">None submitted</div>'}
  </div>
</div>
"""


def render_section_nav(groups):
    items = ['<a href="#interpretation-section" class="snav-link">Your foot profile</a>']
    for cat, label in groups:
        items.append(f'<a href="#recs-{cat}" class="snav-link">{esc(label)}</a>')
    return f'<nav class="snav">{"".join(items)}</nav>'


def render_foot_views(scan, scan_id, out_dir=None):
    # Roman 2026-05-08: prefer the sandbox-cleaned sole overlay (avg
    # silhouette + HVA text + bottom legend stripped). Falls back to
    # production overlay if the clean version isn't generated yet.
    # Roman 2026-05-18: also check a sibling sole_overlays/ folder
    # next to the rendered HTML, so test_cases_* folders can carry
    # their own clean PNGs without dumping into sample_cases_2026_05_02.
    # If no clean PNG exists anywhere, auto-generate one into the
    # sibling sole_overlays/ folder so the next render is clean.
    fname = f"{scan_id}-sole_overlay-clean.png"
    sole_url = None
    if out_dir is not None:
        local_clean = Path(out_dir) / "sole_overlays" / fname
        if local_clean.exists():
            sole_url = f"sole_overlays/{fname}"
    if sole_url is None:
        shared_clean = (Path(__file__).resolve().parent
                        / "sample_cases_2026_05_02" / "sole_overlays" / fname)
        if shared_clean.exists():
            sole_url = f"sole_overlays/{fname}"
    if sole_url is None and out_dir is not None:
        # Try to generate it on demand.
        try:
            from clean_sole_overlay import clean_one
            target = Path(out_dir) / "sole_overlays"
            generated = clean_one(scan_id, target)
            if generated and generated.exists():
                sole_url = f"sole_overlays/{fname}"
        except Exception as e:
            print(f"# clean_one({scan_id}) failed: {e}", file=sys.stderr)
    if sole_url is None:
        sole_url = f"{SB_URL}/storage/v1/object/public/foot-scans/scans/{scan_id}-sole_overlay.png"
    side_url = f"{SB_URL}/storage/v1/object/public/foot-scans/scans/{scan_id}-side_overlay.png"
    toe = scan.get("toe_shape") or "egyptian"
    toe_desc = TOE_DESCRIPTIONS.get(toe, TOE_DESCRIPTIONS["egyptian"])

    # Roman 2026-05-08 (corrected): HVA is a SOLE-view measurement
    # (top-down big-toe deviation), so the Big Toe Inward Drift slider
    # belongs with the sole metrics, not the side metrics.
    sole_metrics = "".join([
        render_metric_bar("forefoot_width_ratio", scan.get("forefoot_width_ratio")),
        render_metric_bar("arch_length_ratio", scan.get("arch_length_ratio")),
        render_metric_bar("heel_width_ratio", scan.get("heel_width_ratio")),
        render_hva_bar(scan.get("hva_offset_ratio"), scan.get("hallux_valgus_class")),
    ])
    side_metrics = "".join([
        render_metric_bar("instep_height_ratio", scan.get("instep_height_ratio")),
        render_metric_bar("heel_depth_ratio", scan.get("heel_depth_ratio")),
    ])

    return f"""
<div class="views-row">
  <div class="view-card">
    <div class="view-head">
      <span class="view-label">Sole Scan Results</span>
      <a class="retake-link" href="#">Retake</a>
    </div>
    <div class="view-body sole-body">
      <div class="view-img-wrap">
        <img src="{esc(sole_url)}" alt="sole overlay" onerror="this.style.opacity=0.2" />
      </div>
      <div class="view-side">
        <div class="toe-card">
          <img src="{CDN_BASE}/images/foot-{esc(toe)}.png" alt="{esc(toe)}" class="toe-img" />
          <div>
            <div class="toe-name">{esc(toe.capitalize())}</div>
            <div class="toe-desc">{esc(toe_desc)}</div>
          </div>
        </div>
        {sole_metrics}
      </div>
    </div>
  </div>
  <div class="view-card">
    <div class="view-head">
      <span class="view-label">Side Scan Results</span>
      <a class="retake-link" href="#">Retake</a>
    </div>
    <div class="view-body side-body">
      <div class="view-img-wrap">
        <img src="{esc(side_url)}" alt="side overlay" onerror="this.style.opacity=0.2" />
      </div>
      <div class="side-metrics-row">{side_metrics}</div>
    </div>
  </div>
</div>
"""


def render_interpretation(blocks):
    out = ['<div class="interp-section" id="interpretation-section">'
           '<h2 class="big-h2">What This Means</h2>']
    for b in (blocks or []):
        out.append('<div class="interp-block">')
        out.append(f'<h3 class="interp-h3">{esc(b.get("title",""))}</h3>')
        for p in b.get("paragraphs", []):
            out.append(f'<p class="interp-p">{esc(p)}</p>')
        out.append('</div>')
    out.append('</div>')
    return "".join(out)


def render_shoe_card(rec, image_url):
    bo = rec.get("best_offer") or {}
    img = image_url or f"/images/shoes/{rec.get('slug')}.jpg"
    img_src = img if img.startswith("http") else f"{CDN_BASE}{img}"
    rec_size = rec.get("recommended_size_eu")
    has_pill = (rec_size is not None) or bo.get("price_eur")

    pill_inner = []
    if rec_size is not None:
        pill_inner.append(f'<span class="pill-size">EU {rec_size:g}</span>')
    if rec_size is not None and bo.get("price_eur"):
        pill_inner.append('<span class="pill-sep">|</span>')
    if bo.get("price_eur"):
        pill_inner.append(f'<span class="pill-price">{bo["price_eur"]:.0f} EUR</span>')
    if bo.get("retailer"):
        pill_inner.append(f'<span class="pill-retailer">@ {esc(bo["retailer"])}</span>')
    pill = f'<div class="size-pill">{"".join(pill_inner)}</div>' if has_pill else ""

    desc = rec.get("description") or ""
    why  = rec.get("why") or ""
    trade = rec.get("tradeoffs") or ""
    return f"""
<div class="shoe-card">
  <div class="shoe-img-wrap">
    <img src="{esc(img_src)}" alt="{esc(rec.get('brand',''))} {esc(rec.get('model',''))}" loading="lazy" />
  </div>
  <div class="shoe-body">
    <div class="shoe-brand">{esc(rec.get('brand',''))}</div>
    <div class="shoe-model">{esc(rec.get('model',''))}</div>
    {pill}
    {f'<div class="shoe-desc">{esc(desc)}</div>' if desc else ""}
    {f'<div class="shoe-why">{esc(why)}</div>' if why else ""}
    {f'<div class="shoe-tradeoffs">{esc(trade)}</div>' if trade else ""}
    <div class="shoe-cta">Check details and availability</div>
  </div>
</div>
"""


def render_recommendations(recs, image_lookup):
    has_cats = any(r.get("category") for r in recs)
    if has_cats:
        groups = []
        for cat in ("baseline", "softer", "stiffer", "budget"):
            shoes = [r for r in recs if r.get("category") == cat]
            if shoes:
                label, desc, ctaText = CATEGORY_META[cat]
                groups.append((cat, label, desc, ctaText, shoes))
    else:
        groups = [("all", "Recommended Shoes", "", "shoes", recs)]

    out = ['<div class="recs-section"><h2 class="big-h2">Recommended Shoes</h2>']
    for cat, label, desc, ctaText, shoes in groups:
        out.append(f'<div class="rec-group" id="recs-{cat}">')
        if cat != "all":
            out.append('<div class="rec-head">')
            out.append(f'<h3 class="interp-h3">{esc(label)}</h3>')
            if desc:
                out.append(f'<p class="rec-desc">{esc(desc)}</p>')
            out.append('</div>')
        out.append('<div class="shoe-grid">')
        for r in shoes:
            out.append(render_shoe_card(r, image_lookup.get(r.get("slug"))))
        out.append('</div>')
        if cat != "all":
            out.append(f'<div class="see-more"><a class="see-more-btn" href="#">See more {esc(ctaText)} <span>&rarr;</span></a></div>')
        out.append('</div>')
    out.append('</div>')
    return "".join(out)


def render_footer_ctas():
    return f"""
<div class="footer-ctas">
  <div class="cta-card">
    <h3 class="cta-title">Browse the Database</h3>
    <p class="cta-text">Check out our full database of 350+ climbing shoes with detailed specs, fit profiles and price comparison.</p>
    <a class="cta-btn cta-btn-fill" href="#">Browse Shoes</a>
  </div>
  <div class="cta-card">
    <h3 class="cta-title">Was this scan helpful?</h3>
    <p class="cta-text">We're building this tool to help climbers find their perfect shoe. Your feedback helps us improve.</p>
    <a class="cta-btn cta-btn-outline" href="#">Give Feedback</a>
  </div>
</div>
"""


# ─── CSS ───────────────────────────────────────────────────────────
CSS = f"""
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700&display=swap');
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{ font-family: {T['font']}; background: {T['bg']}; color: {T['text']}; }}
.page {{ max-width: 1060px; margin: 0 auto; padding: 2rem 1.5rem; }}
@media (max-width: 600px) {{ .page {{ padding: 1rem 0.75rem; }} }}

/* ─── Header ─── */
.header {{ text-align: center; margin-bottom: 1.2rem; }}
.header-eyebrow {{ font-size: 11px; font-weight: 700; text-transform: uppercase;
                   letter-spacing: 2px; color: {T['accent']}; margin-bottom: 6px; }}
.header h1 {{ font-size: 28px; font-weight: 800; color: {T['text']}; letter-spacing: -0.5px; margin: 0; }}
.header-sub {{ font-size: 13px; color: {T['muted']}; margin-top: 4px; }}
@media (max-width: 600px) {{ .header h1 {{ font-size: 22px; }} }}

/* ─── ShareCard ─── */
.share-card {{ background: #fff; border-radius: 14px; border: 1px solid #e8e2d6;
              padding: 0.7rem 1rem; margin-bottom: 1rem;
              box-shadow: 0 2px 16px rgba(44,50,39,0.05);
              display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }}
.share-left {{ display: flex; align-items: center; gap: 0.6rem; min-width: 0; }}
.share-icon {{ width: 28px; height: 28px; border-radius: 50%; background: #fdf3e3; color: #c98a42;
              display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }}
.share-title {{ font-size: 0.82rem; font-weight: 700; color: {T['text']}; line-height: 1.3; }}
.share-sub {{ font-size: 0.72rem; color: {T['muted']}; line-height: 1.4; }}
.share-btn {{ padding: 8px 14px; border: none; border-radius: 10px;
             background: #c98a42; color: #fff; font-size: 0.8rem; font-weight: 700;
             cursor: pointer; font-family: inherit; flex-shrink: 0; }}

/* ─── EmailCapture ─── */
.email-card {{ background: #fff; border-radius: 14px; border: 1px solid #e8e2d6;
              padding: 1rem 1.2rem; margin-bottom: 1rem;
              box-shadow: 0 2px 16px rgba(44,50,39,0.05); }}
.email-title {{ font-size: 0.85rem; font-weight: 700; color: {T['text']}; margin-bottom: 0.5rem; }}
.email-input {{ width: 100%; padding: 10px 12px; border: 1.5px solid #e8e2d6; border-radius: 10px;
               font-size: 0.85rem; font-family: inherit; background: #faf8f4; outline: none;
               margin-bottom: 0.6rem; }}
.email-radios {{ display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.7rem; }}
.email-radio {{ display: flex; gap: 0.5rem; padding: 0.5rem 0.65rem;
               border: 1.5px solid #e8e2d6; border-radius: 10px; background: #faf8f4;
               cursor: pointer; align-items: flex-start; font-size: 0.78rem; }}
.email-radio input {{ margin-top: 4px; accent-color: {T['accent']}; }}
.email-radio-sub {{ display: block; font-size: 0.7rem; color: {T['muted']}; margin-top: 2px; font-weight: 400; }}
.email-send {{ padding: 9px 16px; border: none; border-radius: 10px; background: {T['accent']};
              color: #fff; font-size: 0.8rem; font-weight: 700; cursor: pointer; font-family: inherit; }}

/* ─── UserInputsPanel ─── */
.ui-panel {{ background: {T['card']}; border-radius: 12px; border: 1px solid {T['border']};
            padding: 0.9rem 1.1rem; margin-bottom: 1.1rem; }}
.ui-head {{ display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 0.5rem; gap: 0.75rem; }}
.ui-pill {{ font-size: 10px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 1.5px; color: {T['accent']}; }}
.ui-edit {{ font-size: 0.72rem; font-weight: 700; padding: 0.25rem 0.7rem; border-radius: 6px;
            border: 1px solid {T['accent']}; background: transparent; color: {T['accent']};
            cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px; font-family: inherit; }}
.ui-row {{ display: flex; align-items: baseline; gap: 0.5rem; padding: 0.4rem 0;
           border-bottom: 1px dashed #eee8dc; font-size: 0.8rem; }}
.ui-k {{ flex: 0 0 120px; color: {T['muted']}; font-weight: 600;
         text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.5px; }}
.ui-v {{ color: {T['text']}; }}
.ui-shoes {{ padding-top: 0.6rem; }}
.ui-shoe-row {{ display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
               padding: 0.35rem 0.6rem; background: {T['accentSoft']};
               border-radius: 8px; font-size: 0.78rem; margin-bottom: 6px; }}
.ui-shoe-name {{ font-weight: 700; color: {T['text']}; }}
.ui-shoe-sz {{ color: {T['muted']}; }}
.fit-row {{ display: inline-flex; gap: 4px; margin-left: auto; align-items: center; }}
.fit-k {{ font-size: 0.68rem; color: {T['muted']}; margin-right: 2px; }}
.fit-badge {{ display: inline-block; padding: 1px 7px; border-radius: 10px;
              font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; margin-right: 6px; }}
.ui-empty {{ font-size: 0.78rem; color: {T['muted']}; font-style: italic; }}

/* ─── SectionNav ─── */
.snav {{ display: flex; gap: 6px; flex-wrap: wrap; justify-content: center;
         max-width: 500px; margin: 0 auto 1.2rem; padding: 0 4px; }}
.snav-link {{ padding: 6px 12px; border-radius: 20px; font-size: 0.72rem; font-weight: 600;
              color: #8a6930; background: transparent; border: 1.5px solid #e8e2d6;
              text-decoration: none; white-space: nowrap; transition: background 0.15s, border-color 0.15s; }}
.snav-link:hover {{ background: {T['accentSoft']}; border-color: {T['accent']}; }}

/* ─── Foot views ─── */
.views-row {{ display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-bottom: 1.25rem; }}
@media (max-width: 700px) {{ .views-row {{ grid-template-columns: 1fr; }} }}
.view-card {{ background: {T['card']}; border-radius: 16px; border: 1px solid {T['border']};
             overflow: hidden; box-shadow: 0 2px 16px rgba(44,50,39,0.05); }}
.view-head {{ padding: 0.7rem 1.5rem 0.5rem; border-bottom: 1px solid #eee8dc;
             display: flex; align-items: center; justify-content: space-between; gap: 8px; }}
.view-label {{ font-size: 10px; font-weight: 700; text-transform: uppercase;
              letter-spacing: 1.5px; color: {T['accent']}; }}
.retake-link {{ font-size: 0.7rem; font-weight: 600; color: {T['muted']};
               text-decoration: none; padding: 2px 6px; border-radius: 4px; }}
.retake-link:hover {{ color: {T['accent']}; background: {T['accentSoft']}; }}
.sole-body {{ display: grid; grid-template-columns: 1fr 1fr; }}
.side-body {{ display: flex; flex-direction: column; }}
@media (max-width: 700px) {{ .sole-body {{ grid-template-columns: 1fr; }} }}
.view-img-wrap {{ background: #faf8f4; padding: 0.75rem; display: flex;
                 align-items: center; justify-content: center; border-bottom: 1px solid #eee8dc; }}
.sole-body .view-img-wrap {{ border-right: 1px solid #eee8dc; border-bottom: none; }}
@media (max-width: 700px) {{ .sole-body .view-img-wrap {{ border-right: none; border-bottom: 1px solid #eee8dc; }} }}
.view-img-wrap img {{ max-width: 100%; max-height: 320px; object-fit: contain; border-radius: 8px; }}
.view-side {{ padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; justify-content: center; }}
.toe-card {{ display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem;
            background: {T['accentSoft']}; border-radius: 10px; border: 1px solid #eee8dc;
            margin-bottom: 0.25rem; }}
.toe-img {{ width: 56px; height: auto; flex-shrink: 0; }}
.toe-name {{ font-size: 13px; font-weight: 700; color: {T['text']}; margin-bottom: 2px; text-transform: capitalize; }}
.toe-desc {{ font-size: 11px; color: {T['muted']}; line-height: 1.4; }}
.side-metrics-row {{ padding: 0.75rem 1.25rem; display: flex; flex-wrap: wrap;
                    gap: 0.65rem 2rem; align-items: flex-start; }}
.side-metrics-row > .mbar {{ flex: 1; min-width: 180px; }}

/* ─── MetricBar ─── */
.mbar {{ display: flex; flex-direction: column; gap: 4px; }}
.mbar-row {{ display: flex; justify-content: space-between; align-items: baseline; }}
.mbar-label {{ font-size: 0.78rem; font-weight: 600; color: {T['text']}; }}
.mbar-level {{ font-size: 0.78rem; font-weight: 700; }}
.mbar-track {{ height: 8px; border-radius: 4px; position: relative; overflow: visible; }}
.mbar-band {{ position: absolute; top: 0; bottom: 0; width: 33.333%; }}
/* Roman 2026-05-08: HVA 3-tier bands now match the 5-tier color
   semantics — none = green tint, mild = light orange, pronounced =
   darker orange. */
.mbar-band.b1 {{ left: 0; background: #cad7c4; border-top-left-radius: 4px; border-bottom-left-radius: 4px; }}
.mbar-band.b2 {{ left: 33.333%; background: #efdbc1; border-left: 1px solid #d8c4a4; border-right: 1px solid #d8c4a4; }}
.mbar-band.b3 {{ left: 66.666%; background: #e8c79b; border-top-right-radius: 4px; border-bottom-right-radius: 4px; }}
/* 5-section bands (Roman 2026-05-08): extremes amber-strong, off-mid amber-soft, mid green */
/* Roman 2026-05-12: band widths now 16.67 / 16.67 / 33.33 / 16.67 / 16.67
   to mirror the rebalanced tier population (1/3 mid, 1/6 each side). */
.mbar-band.b5-1 {{ left: 0;        width: 16.667%; background: #e8c79b; border-top-left-radius: 4px; border-bottom-left-radius: 4px; }}
.mbar-band.b5-2 {{ left: 16.667%;  width: 16.667%; background: #efdbc1; }}
.mbar-band.b5-3 {{ left: 33.333%;  width: 33.333%; background: #cad7c4; border-left: 1px solid #b9c8b1; border-right: 1px solid #b9c8b1; }}
.mbar-band.b5-4 {{ left: 66.667%;  width: 16.667%; background: #efdbc1; }}
.mbar-band.b5-5 {{ left: 83.333%;  width: 16.667%; background: #e8c79b; border-top-right-radius: 4px; border-bottom-right-radius: 4px; }}
.mbar-pointer {{ position: absolute; top: -3px; transform: translateX(-50%);
                width: 4px; height: 14px; border-radius: 2px;
                box-shadow: 0 0 0 1.5px #fff; }}
.mbar-axis {{ display: flex; font-size: 0.58rem; color: #a8a08e; text-transform: lowercase; }}
.mbar-axis span {{ flex: 1; }}
.mbar-axis span:nth-child(1) {{ text-align: left; }}
.mbar-axis span:nth-child(2) {{ text-align: center; }}
.mbar-axis span:nth-child(3) {{ text-align: right; }}
.mbar-axis-5 {{ display: flex; font-size: 0.55rem; color: #a8a08e; text-transform: lowercase; }}
.mbar-axis-5 span {{ flex: 1; }}
.mbar-axis-5 span:nth-child(1) {{ text-align: left; }}
.mbar-axis-5 span:nth-child(5) {{ text-align: right; }}
.mbar-axis-5 span:nth-child(2),
.mbar-axis-5 span:nth-child(3),
.mbar-axis-5 span:nth-child(4) {{ text-align: center; }}

/* ─── Big section headlines ─── */
.big-h2 {{ font-family: {T['display']}; font-size: 1.3rem; color: {T['text']};
          margin: 0 0 1rem; font-weight: 700; }}

/* ─── Interpretation ─── */
.interp-section {{ margin-top: 1.5rem; }}
.interp-block {{ margin-bottom: 1.2rem; }}
.interp-h3 {{ font-size: 0.85rem; font-weight: 700; color: #8a6930;
              margin: 0 0 0.3rem; text-transform: uppercase; letter-spacing: 0.03em; }}
.interp-p {{ font-size: 0.82rem; color: #4a4538; line-height: 1.55; margin-top: 0.4rem; }}
.interp-p:first-of-type {{ margin-top: 0; }}

/* ─── Recommendations ─── */
.recs-section {{ margin-top: 1.5rem; }}
.rec-group {{ margin-bottom: 1.5rem; }}
.rec-head {{ margin: 0 0 0.6rem; }}
.rec-desc {{ font-size: 0.72rem; color: {T['muted']}; margin: 0.15rem 0 0; }}
.shoe-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }}
@media (max-width: 600px) {{ .shoe-grid {{ grid-template-columns: 1fr; }} }}
.see-more {{ margin-top: 1rem; display: flex; justify-content: center; }}
.see-more-btn {{ display: inline-flex; align-items: center; gap: 0.45rem;
                padding: 0.65rem 1.5rem; border-radius: 999px;
                background: {T['accent']}; color: #fff; font-size: 0.85rem;
                font-weight: 700; letter-spacing: 0.2px; text-decoration: none;
                box-shadow: 0 2px 8px rgba(201,138,66,0.28); }}
.see-more-btn span {{ font-size: 1rem; line-height: 1; margin-top: -1px; }}

/* ─── ShoeCard ─── */
.shoe-card {{ background: {T['card']}; border: 1px solid #eee8dc; border-radius: 12px; overflow: hidden; }}
.shoe-img-wrap {{ background: #faf8f4; padding: 12px; }}
.shoe-img-wrap img {{ width: 100%; aspect-ratio: 1/1; object-fit: contain; }}
.shoe-body {{ padding: 0.8rem 1rem; }}
.shoe-brand {{ font-size: 0.7rem; color: {T['muted']}; text-transform: uppercase; letter-spacing: 0.04em; }}
.shoe-model {{ font-size: 0.95rem; font-weight: 700; color: {T['text']}; margin: 0.15rem 0 0.4rem; }}
.size-pill {{ display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
             margin: 0 0 0.4rem; padding: 0.35rem 0.5rem;
             background: {T['accentSoft']}; border-radius: 6px; }}
.pill-size {{ font-size: 0.72rem; font-weight: 700; color: {T['accent']}; white-space: nowrap; }}
.pill-sep {{ font-size: 0.65rem; color: #c5bfb3; }}
.pill-price {{ font-size: 0.72rem; font-weight: 700; color: #2d7a3a; white-space: nowrap; }}
.pill-retailer {{ font-size: 0.65rem; color: {T['muted']}; }}
.shoe-desc {{ font-size: 0.75rem; color: #5a5344; line-height: 1.5; margin-bottom: 0.3rem; }}
.shoe-why {{ font-size: 0.75rem; color: #5a5344; line-height: 1.5; }}
.shoe-tradeoffs {{ font-size: 0.73rem; color: #8a7e6e; line-height: 1.5; font-style: italic; margin-top: 0.3rem; }}
.shoe-cta {{ margin-top: 0.6rem; padding: 0.45rem 0; text-align: center;
            font-size: 0.75rem; font-weight: 600; color: {T['accent']};
            border: 1px solid {T['accent']}; border-radius: 6px; }}

/* ─── Footer CTAs ─── */
.footer-ctas {{ display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-top: 1.5rem; }}
@media (max-width: 600px) {{ .footer-ctas {{ grid-template-columns: 1fr; }} }}
.cta-card {{ background: {T['card']}; border-radius: 16px; border: 1px solid {T['border']};
            box-shadow: 0 2px 16px rgba(44,50,39,0.05);
            padding: 1.5rem; display: flex; flex-direction: column; align-items: flex-start; gap: 0.6rem; }}
.cta-title {{ font-size: 0.95rem; font-weight: 700; color: {T['text']}; margin: 0; }}
.cta-text {{ font-size: 0.8rem; color: #5a5344; line-height: 1.5; margin: 0; }}
.cta-btn {{ display: inline-block; padding: 0.5rem 1.25rem; border-radius: 8px;
           font-size: 0.8rem; font-weight: 700; text-decoration: none; }}
.cta-btn-fill {{ background: {T['accent']}; color: #fff; }}
.cta-btn-outline {{ background: transparent; color: {T['accent']}; border: 1.5px solid {T['accent']}; }}
"""


# ─── Main ──────────────────────────────────────────────────────────
def calc_rec_size(profile_shoes, target_brand, brand_sizing, street_size, preference):
    """V2 target size (Roman 2026-05-18).

    Target size = street shoe size adjusted by the target brand's typical
    downsize, then snapped to a half-EU:
      - performance (moderate / aggressive)  -> round DOWN  (tighter)
      - comfort     (balanced / comfort)     -> round UP    (roomier)

    The anchor shoe is no longer used. `profile_shoes` is kept in the
    signature only for call-site compatibility. Sandbox-only — the
    production scan_recommender._calc_recommended_size is unchanged.
    """
    if street_size is None:
        return None
    try:
        street = float(street_size)
    except (TypeError, ValueError):
        return None
    target_ds = brand_sizing.get(target_brand, 1.0)
    half = (street - target_ds) * 2
    if preference == "performance":
        return math.floor(half) / 2
    return math.ceil(half) / 2


def _norm_cup(label):
    """Normalize shoe cup labels for prose: 'standard' → 'medium', etc."""
    if not label: return "unknown"
    s = str(label).strip().lower()
    return {"standard": "medium", "low": "narrow", "high": "wide"}.get(s, s)


def _shoe_fit_with_artifact_filter(profile, target=None):
    """Run generate_shoe_fit on shoes with sizing-artifact feedback
    blanked, AND prepend a disclosure sentence listing what was
    discounted so the user understands why a contradictory rating
    was set aside.

    Roman 2026-05-12: passing filtered shoes to the cascade prevents
    artifact ratings from triggering false "fit varies" contradiction
    sentences (case 5 Veloce empty heel was sizing, not cup geometry).
    The disclosure is only added when something was actually filtered.
    """
    from interp_shoe_fit_v2 import _relative_downsize, _brand_typical, _downsize_label_raw
    raw_shoes = profile.get("shoes") or []
    street    = profile.get("street_size_eu")
    clean_shoes = _scrub_sizing_artifacts(raw_shoes, street, profile=profile)

    # Identify each discounted (shoe, dim, rating) and tag the most-
    # likely cause. Priority:
    #  1. SIZING — if the shoes downsize choice is far enough from
    #     brand typical that the feedback direction is fully explained
    #     by sizing alone.
    #  2. SHALLOW_HEEL — heel + loose-direction + user has shallow
    #     or very-shallow heel on V2 5-tier. The back of the foot
    #     doesn't project far enough to fill the cup, explaining
    #     the empty feel before reaching for a cup-geometry story.
    #  3. SIT_ABOVE — heel-only contradictory cup (cup narrower than
    #     user heel width) with loose-direction feedback, any diff >= 1.
    #     Speculative: foot too big to seat in cup, sits on top
    #     instead, leaving space below.
    #  4. SILENT — perfect-at-2+-rank-diff (Rule C) and any other
    #     residual mild-directional case without a clean story.
    user_hv_rank = _user_dim_rank(profile, "heel_width_ratio")
    user_fw_rank = _user_dim_rank(profile, "forefoot_width_ratio")
    from interp_shoe_fit_v2 import _relative_downsize, _brand_typical, _downsize_label_raw
    from interp_foot_shape_v2 import _classify_5tier
    user_heel_depth_5t = _classify_5tier(
        "heel_depth_ratio", profile.get("heel_depth_ratio"))

    def _classify_reason(shoe, dim, rating, user_rank, cup_rank):
        # Step 1: sizing-driven (Rule A)?
        size, brand = shoe.get("size_eu"), shoe.get("brand")
        if street is not None and size is not None and brand:
            try:
                _, rel, _ = _relative_downsize(float(street), float(size), brand)
            except (TypeError, ValueError):
                rel = 0.0
            if (rel <= -0.5 and rating in ("loose", "empty", "roomy")) or \
               (rel >= +0.5 and rating in ("tight", "squeezed")):
                return "sizing"
        # Step 2: shallow_heel — heel + loose-direction +
        # shallow/very-shallow user heel.
        if (dim == "heel"
                and rating in ("loose", "empty", "roomy")
                and user_heel_depth_5t in ("very shallow", "shallow heel")):
            return "shallow_heel"
        # Step 3: sit_above — heel-only, cup narrower than user heel,
        # loose-direction feedback. Any diff >= 1 (Roman 2026-05-18:
        # arbitrary >= 2 threshold dropped).
        if dim == "heel" and user_rank is not None and cup_rank is not None:
            diff = user_rank - cup_rank
            if rating in ("loose", "empty", "roomy") and diff >= 1:
                return "sit_above"
        # Anything else (perfect-at-2+-rank-diff, mild non-heel
        # directional) -> silent. The filter already excluded these
        # from the target math.
        return "silent"

    discounted = []
    for raw, clean in zip(raw_shoes, clean_shoes):
        raw_fit   = raw.get("fit") or {}
        clean_fit = clean.get("fit") or {}
        for dim in ("heel", "toes", "forefoot"):
            if not (raw_fit.get(dim) and not clean_fit.get(dim)):
                continue
            rating = raw_fit[dim]
            if dim == "heel":
                user_r = user_hv_rank
                cup_r  = _cup_rank(raw.get("db_heel_volume"))
            elif dim == "forefoot":
                user_r = user_fw_rank
                cup_r  = _cup_rank(raw.get("db_width"))
            else:  # toes — no rank comparison, default to sizing
                user_r = cup_r = None
            reason = _classify_reason(raw, dim, rating, user_r, cup_r)
            discounted.append({"shoe": raw, "dim": dim, "rating": rating,
                                "reason": reason,
                                "user_rank": user_r, "cup_rank": cup_r})

    # Build the §2 paragraph sequence (Roman 2026-05-12: sizing intro
    # FIRST, then disclosure of discounted ratings, then cascade).
    paragraphs = []

    # Splice the filtered shoes into a profile copy so the cascade sees them.
    filtered_profile = dict(profile)
    filtered_profile["shoes"] = clean_shoes
    cascade_paragraphs = list(generate_shoe_fit(filtered_profile, target=target))

    # First paragraph from the cascade is the sizing intro — emit it
    # before the disclosure so context comes first.
    if cascade_paragraphs:
        paragraphs.append(cascade_paragraphs[0])
        cascade_remainder = cascade_paragraphs[1:]
    else:
        cascade_remainder = []

    if discounted:
        from collections import defaultdict
        parts = []

        # ── Sizing reason: consolidate per shoe (Roman 2026-05-18, B10).
        # A uniformly over/under-sized shoe has ONE cause across all its
        # discounted dims — emit one sentence listing the dims, not one
        # sentence per dim.
        sizing_by_shoe = defaultdict(list)
        for d in discounted:
            if d["reason"] == "sizing":
                s = d["shoe"]
                key = s.get("slug") or f"{s.get('brand')}|{s.get('model')}"
                sizing_by_shoe[key].append(d)
        for members in sizing_by_shoe.values():
            s = members[0]["shoe"]
            brand, model = s.get("brand"), s.get("model")
            ratings = [m["rating"] for m in members]
            direction = ("loose" if ratings[0] in ("loose", "empty", "roomy")
                         else "tight")
            # Roman 2026-05-18: close with actionable advice instead of
            # the brand-sizing explanation. Loose -> size down,
            # tight -> size up.
            size_advice = ("a size smaller" if direction == "loose"
                           else "a size larger")
            dim_phrases = [f"{m['rating']} {m['dim']}" for m in members]
            if len(dim_phrases) == 1:
                dims_str, verb = dim_phrases[0], "is"
            elif len(dim_phrases) == 2:
                dims_str = f"{dim_phrases[0]} and {dim_phrases[1]}"
                verb = "are"
            else:
                dims_str = ", ".join(dim_phrases[:-1]) + f", and {dim_phrases[-1]}"
                verb = "are"
            parts.append(
                f"Your {brand} {model}'s {dims_str} {verb} most likely a "
                f"sizing problem, you could try {size_advice} for a "
                f"better fit."
            )

        # ── Non-sizing reasons: group by (dim, rating, reason). Different
        # reasons get different sentences even for the same dim+rating.
        groups = defaultdict(list)
        for d in discounted:
            if d["reason"] == "sizing":
                continue
            groups[(d["dim"], d["rating"], d["reason"])].append(d)

        for (dim, rating, reason), members in groups.items():
            user_dim = "heel" if dim == "heel" else ("forefoot" if dim == "forefoot" else "toes")

            if reason == "shallow_heel":
                # Roman's exact wording (2026-05-18): heel-only, commas.
                for m in members:
                    s = m["shoe"]
                    brand, model = s.get("brand"), s.get("model")
                    parts.append(
                        f"Your {brand} {model}'s {rating} could be "
                        f"caused by your shallow heel, the back of "
                        f"your foot may not project far enough to fill "
                        f"the cup which you perceive as {rating} feel."
                    )

            elif reason == "sit_above":
                # Roman's exact wording (2026-05-16): heel-only, commas.
                # user_lbl uses the actual user rank (2026-05-18).
                # Roman 2026-05-18: consolidate shoes that share the same
                # heel cup label into ONE sentence ("A and B's empty
                # heels are contradictory ...") instead of repeating a
                # near-identical sentence per shoe.
                _RANK_LBL = {0: "narrow", 1: "medium", 2: "wide"}
                by_cup = defaultdict(list)
                for m in members:
                    by_cup[_norm_cup(m["shoe"].get("db_heel_volume"))].append(m)
                for cup_lbl, grp in by_cup.items():
                    user_lbl = _RANK_LBL.get(grp[0]["user_rank"], "")
                    names = [f"{m['shoe'].get('brand')} {m['shoe'].get('model')}"
                             for m in grp]
                    if len(names) == 1:
                        subj = f"Your {names[0]}'s {rating} heel is"
                    else:
                        joined = (" and ".join(names) if len(names) == 2
                                  else ", ".join(names[:-1]) + ", and " + names[-1])
                        subj = f"Your {joined}'s {rating} heels are"
                    parts.append(
                        f"{subj} contradictory, a {cup_lbl} cup shouldn't "
                        f"feel {rating} on your {user_lbl} heel. Likely your "
                        f"heel does not fit inside the cup and hence leaves "
                        f"the empty space at the bottom which you perceive "
                        f"as {rating} feel."
                    )

            # "silent" reason — perfect-mismatch (Rule C) or mild
            # non-heel directional. No user-facing prose; the filter
            # already excluded these ratings from target math. Skip.

        # Emit the disclosure only if at least one non-silent finding fired.
        if parts:
            paragraphs.append(" ".join(parts))

    paragraphs.extend(cascade_remainder)
    return paragraphs


def main():
    if len(sys.argv) != 7:
        print(__doc__); sys.exit(1)
    scan_id, discipline, environment, rock_arg, aggressiveness, out_path = sys.argv[1:]
    rock = None if rock_arg == "-" else rock_arg

    scan = fetch_scan(scan_id)
    shoes_db = load_shoes_db()
    price_rows = load_price_rows()
    profile = build_profile(scan, shoes_db)
    # check_full_v2_matrix.build_profile omits arch_length_ratio + class.
    # Patch them in so the soft-boundary classifier in interp_foot_shape_v2
    # can promote borderline cases (Roman's 0.733 vs hi 0.734) to long arch.
    profile["arch_length_ratio"] = scan.get("arch_length_ratio")
    profile["arch_length_class"] = scan.get("arch_length_class")
    image_lookup = fetch_shoe_images()
    from scan_recommender import _load_brand_sizing
    brand_sizing = _load_brand_sizing()
    street_size = float(scan.get("street_size_eu") or 0) or None
    pref = "performance" if aggressiveness in ("moderate", "aggressive") else "comfort"
    # Recommended-size resolver — used to price budget candidates at
    # their downsized size, not the user's street size.
    rec_size_fn = lambda sh: calc_rec_size(profile["shoes"], sh.get("brand"),
                                           brand_sizing, street_size, pref)

    # V2 unified target + tiers
    fit_target = resolve_targets_v2(profile, profile["shoes"], aggressiveness)
    use_target = compute_use_case_target(discipline, environment, rock, aggressiveness)
    target = {**fit_target, **use_target}
    tiers = assemble_tiers(profile, shoes_db, target, price_rows=price_rows,
                           rec_size_fn=rec_size_fn)

    interpretation = [
        {"title": "Your Foot Shape",
         "paragraphs": list(generate_foot_shape(profile))},
        {"title": "What Your Current Shoe Fit Tells Us",
         "paragraphs": list(_shoe_fit_with_artifact_filter(profile, target=target))},
        {"title": "What to Look For",
         "paragraphs": list(generate_what_to_look_for_v2(
             profile, profile["shoes"],
             discipline=discipline, environment=environment,
             rock=rock, aggressiveness=aggressiveness, target=target))},
    ]

    # Build recommendations
    all_picks_flat = []
    for tname in ("baseline", "softer", "stiffer", "budget"):
        for sc, sh in tiers[tname]:
            all_picks_flat.append(flatten_pick(sc, sh, tier=tname, target=target))
    # Roman 2026-05-08: prices for ALL tiers (not just budget). matrix_scorer_v2
    # only attaches best_price_at_size to budget picks because that tier is
    # selected by price; baseline/softer/stiffer never get prices attached
    # internally. Look them up here per pick using the shoe's recommended
    # size at this brand, so every card shows a price when a vendor is in
    # stock at that size.
    from matrix_scorer_v2 import best_price_at_size as _best_price
    price_lookup = {}
    for tname in ("baseline", "softer", "stiffer", "budget"):
        for sc, sh in tiers[tname]:
            slug = sh.get("slug")
            if slug in price_lookup:
                continue
            # Budget already has the price annotated on sc.
            existing = sc.get("best_price_at_size")
            if existing is not None:
                price_lookup[slug] = existing
                continue
            # Compute price-at-recommended-size for this shoe.
            rec_size = calc_rec_size(profile["shoes"], sh.get("brand"),
                                      brand_sizing, street_size, pref)
            if rec_size is not None:
                p = _best_price(slug, rec_size, price_rows)
                if p is not None:
                    price_lookup[slug] = p

    recommendations = []
    for tname in ("baseline", "softer", "stiffer", "budget"):
        for sc, sh in tiers[tname]:
            best_price = price_lookup.get(sh["slug"])
            pick = flatten_pick(sc, sh, tier=tname, target=target, best_price=best_price)
            paras = generate_shoe_description_v2(pick, profile, all_picks=all_picks_flat)
            P1 = paras[0] if len(paras) > 0 else ""
            P2 = paras[1] if len(paras) > 1 else ""
            P3 = paras[2] if len(paras) > 2 else ""
            rec_size = calc_rec_size(profile["shoes"], sh.get("brand"),
                                     brand_sizing, street_size, pref)
            rec = {"slug": sh.get("slug"), "brand": sh.get("brand"),
                   "model": sh.get("model"), "category": tname,
                   "recommended_size_eu": rec_size,
                   "description": P1, "why": P2, "tradeoffs": P3}
            if best_price is not None:
                rec["best_offer"] = {"price_eur": round(float(best_price), 2)}
            recommendations.append(rec)

    v2_inputs = {"discipline": discipline, "environment": environment,
                 "rock": rock, "aggressiveness": aggressiveness}
    nav_groups = []
    for cat in ("baseline", "softer", "stiffer", "budget"):
        if any(r.get("category") == cat for r in recommendations):
            short = {"baseline": "Your Best Match", "softer": "Softer Feel",
                     "stiffer": "Stiffer Feel", "budget": "Best Value"}[cat]
            nav_groups.append((cat, short))

    body = (
        '<div class="page">'
        '<div class="header">'
        '<div class="header-eyebrow">climbing-gear.com</div>'
        '<h1>Your Foot Profile</h1>'
        '<div class="header-sub">Scan analysis: sole &amp; side view</div>'
        '</div>'
        + render_share_card()
        + render_email_capture()
        + render_user_inputs_panel(scan, v2_inputs)
        + render_section_nav(nav_groups)
        + render_foot_views(scan, scan_id, out_dir=Path(out_path).parent)
        + render_interpretation(interpretation)
        + render_recommendations(recommendations, image_lookup)
        + render_footer_ctas()
        + '</div>'
    )

    page = (
        '<!doctype html><html><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f'<title>V2 review &middot; {esc(scan_id)}</title>'
        f'<style>{CSS}</style></head><body>'
        + body + '</body></html>'
    )
    Path(out_path).write_text(page, encoding="utf-8")
    print(f"# wrote {out_path} ({Path(out_path).stat().st_size:,} bytes)", file=sys.stderr)


if __name__ == "__main__":
    main()
