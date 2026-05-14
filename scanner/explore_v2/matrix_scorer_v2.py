"""V2 shoe scorer (sandbox skeleton).

Locked design — see memory/project_v2_shoe_scoring.md (2026-04-24):
  * 9 scored axes, one weight per axis
  * 2 hard filters: H1 kids shoe, H2 already-owned
  * All 25+ fit-feedback / anatomy modifier rules from production are
    DROPPED — that signal lives entirely in the target derivation
    (target_resolver_v2 + target_asym_dt) so scoring against the target
    captures it once.

This file is a *skeleton*: each axis is implemented as a small named
function so the rules table in project_v2_shoe_scoring.md maps 1:1 to
code. Stiffness window math lifted from combinations_top5.py.

Inputs (target dict)
--------------------
Caller assembles ONE target dict by merging:
  * resolve_targets_v2(...)                    → target_fw/hv/fv,
                                                 target_asym, target_dt,
                                                 (asym/dt labels)
  * compute_use_case_target(disc, env, rock,   → stiff_target/lo/hi,
    aggressiveness)                              closure_pref/ok/bad,
                                                 ankle_required, rock

Both are deterministic, both already validated against last 20 scans.

Inputs (shoe dict)
------------------
Same shoes table columns the production scorer consumes:
  brand, model, slug, width, heel_volume, forefoot_volume, toe_form,
  closure, downturn, asymmetry, computed_stiffness, ankle_protection,
  kids_friendly, no_edge, use_cases.

Inputs (profile dict)
---------------------
  toe_shape, toe_confidence, instep_height_ratio, street_size_eu,
  shoes (user's current shoes — for H2 already-owned filter only).
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from target_resolver_v2 import (
    WIDTH_LABELS, HV_LABELS, FV_LABELS,
    ASYM_LABELS, DOWNTURN_LABELS,
)
from combinations_top5 import (
    DISCIPLINE_STIFF, ENV_SHIFT, ENV_SHIFT_BY_DISC, ROCK_SHIFT,
    CLOSURE_PREFS, closure_prefs_for, needs_ankle_protection,
    DISCIPLINE_USE_CASES, ROCK_ALIASES,
    DOWNTURN_ORDER, ASYM_ORDER,
)

# ── Constants from the locked scoring spec ────────────────────────────
INSTEP_HIGH_THRESHOLD = 0.273   # ≥ this → "high instep"
INSTEP_LOW_THRESHOLD  = 0.255   # < this → "low instep"
KIDS_STREET_SIZE_CUT  = 36      # user EU size ≥ this → H1 fires for kids shoes


# ══════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════

def _norm(s):
    return (s or "").strip().lower() if isinstance(s, str) else s

def _as_list(v):
    """Robust list-extraction for db columns that can be list, JSON
    string, or scalar."""
    import json
    if isinstance(v, list): return v
    if isinstance(v, str):
        try: return json.loads(v)
        except: return []
    return []

def _toe_forms(shoe):
    """All toe_forms a shoe matches (some shoes list multiple)."""
    raw = shoe.get("toe_form") or ""
    if isinstance(raw, list):
        return [_norm(t) for t in raw if t]
    return [_norm(str(raw))] if raw else []


# ══════════════════════════════════════════════════════════════════════
# Hard filters (H1 + H2 only — H3 skill-gap removed in v2)
# ══════════════════════════════════════════════════════════════════════

def hard_filter_kids(shoe, profile):
    """H1: kids shoe AND user is adult-sized."""
    if not shoe.get("kids_friendly"):
        return None
    street = profile.get("street_size_eu")
    if street is None or street >= KIDS_STREET_SIZE_CUT:
        return "H1: kids shoe, user is adult-sized"
    return None

def hard_filter_owned(shoe, profile):
    """H2: same brand+model as one of the user's current shoes."""
    s_brand = _norm(shoe.get("brand"))
    s_model = _norm(shoe.get("model"))
    for us in profile.get("shoes") or []:
        if _norm(us.get("brand")) == s_brand and _norm(us.get("model")) == s_model:
            return f"H2: user already owns {s_brand} {s_model}"
    return None

HARD_FILTERS = [hard_filter_kids, hard_filter_owned]


# ══════════════════════════════════════════════════════════════════════
# Use-case target  (stiffness window + closure prefs + ankle requirement)
# Mirrors combinations_top5.compute_target — kept here so the scorer
# never imports from a sibling sandbox file's main fn.
# ══════════════════════════════════════════════════════════════════════

def compute_use_case_target(discipline, env, rock, aggressiveness):
    """Stiffness window + closure prefs + ankle gate from
    discipline/env/rock. Aggressiveness only consulted by the
    asym/dt resolver elsewhere."""
    center, lo, hi = DISCIPLINE_STIFF[discipline]
    env_s  = ENV_SHIFT_BY_DISC.get((discipline, env),
                                   ENV_SHIFT.get(env, 0.0))
    rock_s = ROCK_SHIFT.get(rock, 0.0) if env != "indoor" else 0.0

    # Roman 2026-05-12: dropped the pad term (was +0.05 per active env or
    # rock shift). It widened 15 of 18 input combinations on top of the
    # discipline-base width — turning boulder/outdoor/sandstone from a
    # 0.30-wide window into a 0.50-wide window that swallowed >70% of
    # the shoe catalog. Window width now stays at the discipline base
    # (0.30 boulder/sport, 0.35 trad); env+rock just shift the center.
    target_stiff = max(0.0, min(1.0, center + env_s + rock_s))
    target_lo = max(0.0, lo + env_s + rock_s)
    target_hi = min(1.0, hi + env_s + rock_s)

    pref_cl, ok_cl, bad_cl = closure_prefs_for(discipline, env)
    return {
        "stiff_target":   target_stiff,
        "stiff_lo":       target_lo,
        "stiff_hi":       target_hi,
        "closure_pref":   pref_cl,
        "closure_ok":     ok_cl,
        "closure_bad":    bad_cl,
        "ankle_required": needs_ankle_protection(discipline, rock),
        "rock":           rock,
        "discipline":     discipline,
    }


# ══════════════════════════════════════════════════════════════════════
# Discipline use-case filter (kept implicit in v1; v2 keeps it as a
# soft filter — out-of-discipline shoes are eligible but heavily
# penalised. Per spec it's not in the 9 scored axes, so we treat it as
# a separate eligibility gate that returns -100 if discipline doesn't
# overlap. Not a "hard filter" because Roman may want to flip it.)
# ══════════════════════════════════════════════════════════════════════

def discipline_overlap(shoe, discipline):
    use_cases = [_norm(u).replace("-", "_") for u in _as_list(shoe.get("use_cases"))]
    aliases   = [_norm(a).replace("-", "_") for a in DISCIPLINE_USE_CASES[discipline]]
    return any(a == uc or a in uc or uc in a for a in aliases for uc in use_cases)


# ══════════════════════════════════════════════════════════════════════
# 9 SCORING AXES
# ══════════════════════════════════════════════════════════════════════
# Each axis is a function (shoe, target, profile) -> (score, note).
# Notes go into the breakdown dict for debugging / explainability.
# ══════════════════════════════════════════════════════════════════════

def axis_stiffness(shoe, target, profile):
    """+20 at center; ~+12 at window edge; falls off ~-56 far outside."""
    cs = shoe.get("computed_stiffness")
    if cs is None:
        return -5, "no computed_stiffness on shoe"
    lo, hi = target["stiff_lo"], target["stiff_hi"]
    center = target["stiff_target"]
    if lo <= cs <= hi:
        dist = abs(cs - center)
        s = int(round(20 - 40 * dist))
        return s, f"stiff {cs:.2f} in window [{lo:.2f},{hi:.2f}], +{s}"
    edge_dist = min(abs(cs - lo), abs(cs - hi))
    s = -int(round(20 + 60 * edge_dist))
    return s, f"stiff {cs:.2f} outside [{lo:.2f},{hi:.2f}] by {edge_dist:.2f}, {s}"


def axis_ankle(shoe, target, profile):
    """+15 if discipline+rock require ankle AND shoe provides it; else 0.
    No penalty for absence — scoring is asymmetric per spec."""
    if not target["ankle_required"]:
        return 0, "ankle not required"
    ap = _norm(shoe.get("ankle_protection"))
    if ap and ap not in ("none", "no", "minimal", "low"):
        return 15, f"ankle required, shoe has '{ap}', +15"
    return 0, "ankle required, shoe lacks it (no penalty per spec)"


def axis_downturn(shoe, target, profile):
    """Roman 2026-05-12: steepened d=1 from +8 to +3. The old curve only
    lost 7 points for a 1-step downturn mismatch — letting moderate-
    downturn all-rounders score nearly as well as aggressive-downturn
    shoes for users who explicitly chose 'aggressive'. New curve makes
    the d=0 perfect match decisive."""
    tgt = target["target_dt"]
    sd  = _norm(shoe.get("downturn"))
    if sd not in DOWNTURN_ORDER:
        return 0, f"shoe downturn unknown ('{sd}')"
    d = abs(tgt - DOWNTURN_ORDER.index(sd))
    s = {0: 15, 1: 3, 2: -8, 3: -18}[d]
    return s, f"shoe dt={sd} vs target dt={DOWNTURN_LABELS[tgt]}, {'+' if s>=0 else ''}{s}"


def axis_toe_form(shoe, target, profile):
    """+10 if shoe last matches scanned toe_shape, -10 if opposite-form,
    -5 if neutral mismatch (user greek vs shoe egyptian/roman, or vice
    versa). Egyptian↔Roman is the "opposite" pair; Greek is the
    neutral middle.

    Multi-form shoes match if ANY of their forms equals the scan
    toe_shape.

    Roman 2026-05-12: toe_confidence multiplier dropped. Low-confidence
    scans were getting near-zero rewards/penalties (×0.4 conf → ±4),
    which let opposite-form shoes leak into top picks. The scan
    classifier IS our best estimate of the user's foot — commit to
    it. If we're wrong, the user can flag it and we re-score.
    """
    user_toe = _norm(profile.get("toe_shape"))
    if not user_toe:
        return 0, "no scanned toe_shape"
    forms = _toe_forms(shoe)
    if not forms:
        return 0, "shoe has no toe_form"

    if user_toe in forms:
        return 10, f"shoe toe_form {forms} matches scan '{user_toe}', +10"

    # opposite-form check (egyptian ↔ roman)
    opposites = {"egyptian": "roman", "roman": "egyptian"}
    opp = opposites.get(user_toe)
    if opp and opp in forms:
        # Roman 2026-05-12: softened from -10 → -6. Opposite-form is real
        # mismatch but shouldn't fully kill an otherwise-perfect-fit shoe.
        return -6, f"shoe toe_form {forms} opposite to scan '{user_toe}', -6"

    # otherwise neutral (e.g. user greek, shoe egyptian or roman)
    # Roman 2026-05-12: softened from -5 → -3 in line with the opposite-
    # form softening — neutral mismatch is half of opposite mismatch.
    return -3, f"shoe toe_form {forms} mismatched to scan '{user_toe}', -3"


def axis_forefoot_width(shoe, target, profile):
    """+10 if shoe width = target_fw; -3 per grade off; -6 floor at 2+ off."""
    tgt = target["target_fw"]
    sw  = _norm(shoe.get("width"))
    rank_map = {"narrow": 0, "medium": 1, "wide": 2}
    sr = rank_map.get(sw)
    if sr is None:
        return 0, f"shoe width unknown ('{sw}')"
    d = abs(tgt - sr)
    s = {0: 10, 1: -3, 2: -6}[min(d, 2)]
    return s, f"shoe fw={sw} vs target {WIDTH_LABELS[tgt]}, {'+' if s>=0 else ''}{s}"


def axis_heel_volume(shoe, target, profile):
    """+10 if shoe heel_volume = target_hv; -3 per grade; -6 floor at 2+."""
    tgt = target["target_hv"]
    sv  = _norm(shoe.get("heel_volume"))
    rank_map = {"narrow": 0, "low": 0, "medium": 1, "standard": 1, "wide": 2, "high": 2}
    sr = rank_map.get(sv)
    if sr is None:
        return 0, f"shoe heel_volume unknown ('{sv}')"
    d = abs(tgt - sr)
    s = {0: 10, 1: -3, 2: -6}[min(d, 2)]
    return s, f"shoe hv={sv} vs target {HV_LABELS[tgt]}, {'+' if s>=0 else ''}{s}"


def axis_asymmetry(shoe, target, profile):
    """Roman 2026-05-12: peak reward bumped 10→15 and d=1 tightened
    5→3 to match downturn weighting (both axes are equally use-case-
    defining, should have equal influence)."""
    tgt = target["target_asym"]
    sa  = _norm(shoe.get("asymmetry"))
    if sa not in ASYM_ORDER:
        return 0, f"shoe asymmetry unknown ('{sa}')"
    d = abs(tgt - ASYM_ORDER.index(sa))
    s = {0: 15, 1: 3, 2: -6, 3: -15}[d]
    return s, f"shoe asym={sa} vs target {ASYM_LABELS[tgt]}, {'+' if s>=0 else ''}{s}"


def axis_closure(shoe, target, profile):
    """+10 if closure in preferred set; 0 if acceptable; -10 if bad."""
    cl = _norm(shoe.get("closure"))
    if cl in target["closure_pref"]:
        return 10, f"closure '{cl}' preferred for ({target['discipline']}), +10"
    if cl in target["closure_bad"]:
        return -10, f"closure '{cl}' bad for ({target['discipline']}), -10"
    return 0, f"closure '{cl}' acceptable, 0"


def axis_instep_extreme(shoe, target, profile):
    """+10 if instep extreme AND closure is lace/velcro;
    -10 if instep extreme AND closure is slipper.
    Otherwise 0 (most users aren't extreme)."""
    instep = profile.get("instep_height_ratio")
    if instep is None:
        return 0, "no instep_height_ratio"
    is_high = instep >= INSTEP_HIGH_THRESHOLD
    is_low  = instep <  INSTEP_LOW_THRESHOLD
    if not (is_high or is_low):
        return 0, f"instep {instep:.3f} not extreme"
    label = "high" if is_high else "low"
    cl = _norm(shoe.get("closure"))
    if cl in ("lace", "velcro"):
        return 10, f"{label} instep {instep:.3f} + adjustable closure '{cl}', +10"
    if cl == "slipper":
        return -10, f"{label} instep {instep:.3f} + slipper closure, -10"
    return 0, f"{label} instep {instep:.3f}, closure '{cl}' neutral"


SCORING_AXES = [
    ("stiffness",        axis_stiffness),
    ("ankle",            axis_ankle),
    ("downturn",         axis_downturn),
    ("toe_form",         axis_toe_form),
    ("forefoot_width",   axis_forefoot_width),
    ("heel_volume",      axis_heel_volume),
    ("asymmetry",        axis_asymmetry),
    ("closure",          axis_closure),
    ("instep_extreme",   axis_instep_extreme),
]


# ══════════════════════════════════════════════════════════════════════
# Main scoring entry point
# ══════════════════════════════════════════════════════════════════════

def score_shoe(shoe, target, profile):
    """Returns dict with score + breakdown, or None if hard-filtered.

    ``target`` must already be the merged dict from
    resolve_targets_v2(...) ∪ compute_use_case_target(...).
    """
    # Hard filters
    for hf in HARD_FILTERS:
        why = hf(shoe, profile)
        if why is not None:
            return None  # caller can log `why` if interested

    # Soft eligibility: discipline overlap (heavy penalty if missing)
    breakdown = {}
    if not discipline_overlap(shoe, target["discipline"]):
        return {
            "score": -100,
            "breakdown": {"discipline_overlap": (-100, "no discipline overlap")},
            "hard_filtered": False,
        }

    total = 0
    for name, fn in SCORING_AXES:
        s, note = fn(shoe, target, profile)
        breakdown[name] = (s, note)
        total += s

    return {"score": total, "breakdown": breakdown, "hard_filtered": False}


# ══════════════════════════════════════════════════════════════════════
# Tier assembly  (locked 2026-04-25 — see project_v2_tier_assembly memory)
# ══════════════════════════════════════════════════════════════════════
# Layout:
#   * baseline  (3 shoes, anchor stiffness)
#   * softer    (3 shoes, anchor − 0.10)
#   * stiffer   (3 shoes, anchor + 0.10)
#   * budget    (≤3 shoes, top-30 by baseline → cheapest-3 by price-at-size)
#
# Caps (apply across all 4 tiers):
#   * max 1 model per brand per tier
#   * max 3 picks of any one brand across all 4 tiers
#   * max 1 no_edge shoe per tier (so up to 4 across all 12 picks)
# ══════════════════════════════════════════════════════════════════════

TIER_STIFFNESS_SHIFT = {
    "baseline": 0.00,
    "softer":  -0.10,
    "stiffer": +0.10,
    "budget":   0.00,   # same anchor as baseline
}
PER_TIER_BRAND_CAP   = 1
GLOBAL_BRAND_CAP     = 3
PER_TIER_NO_EDGE_CAP = 1
TIER_SIZE            = 3
BUDGET_POOL_SIZE     = 30   # confirmed by Roman 2026-04-25


def _shift_target(target, dstiff):
    """Return a copy of the merged target with stiffness center shifted."""
    if dstiff == 0:
        return target
    out = dict(target)
    out["stiff_target"] = max(0.0, min(1.0, target["stiff_target"] + dstiff))
    out["stiff_lo"]     = max(0.0, target["stiff_lo"] + dstiff)
    out["stiff_hi"]     = min(1.0, target["stiff_hi"] + dstiff)
    return out


def _score_against(shoes_db, target, profile):
    """Score every shoe and return [(score_dict, shoe), ...] sorted desc.
    Hard-filtered shoes are dropped."""
    out = []
    for s in shoes_db:
        r = score_shoe(s, target, profile)
        if r is None:
            continue
        out.append((r, s))
    out.sort(key=lambda x: -x[0]["score"])
    return out


def _pick_with_caps(scored, picked_slugs, brand_count, no_edge_count, n=TIER_SIZE):
    """Walk a sorted-desc scored list and pick up to n entries respecting:
      * skip if slug already picked (cross-tier dedup)
      * skip if brand already at PER_TIER_BRAND_CAP within this tier
      * skip if brand already at GLOBAL_BRAND_CAP across all tiers
      * skip if no_edge and tier already has PER_TIER_NO_EDGE_CAP
    Mutates picked_slugs / brand_count / no_edge_count counters in-place
    so that GLOBAL caps carry between tiers.
    Returns list of (score_dict, shoe).
    """
    tier_picks = []
    tier_brand_count = {}
    tier_no_edge = 0
    for sc, shoe in scored:
        slug = shoe.get("slug")
        brand = _norm(shoe.get("brand"))
        if slug in picked_slugs:
            continue
        if tier_brand_count.get(brand, 0) >= PER_TIER_BRAND_CAP:
            continue
        if brand_count.get(brand, 0) >= GLOBAL_BRAND_CAP:
            continue
        if shoe.get("no_edge") and tier_no_edge >= PER_TIER_NO_EDGE_CAP:
            continue
        tier_picks.append((sc, shoe))
        picked_slugs.add(slug)
        tier_brand_count[brand] = tier_brand_count.get(brand, 0) + 1
        brand_count[brand]      = brand_count.get(brand, 0) + 1
        if shoe.get("no_edge"):
            tier_no_edge += 1
        if len(tier_picks) == n:
            break
    return tier_picks


# ── Price-at-size helper (budget tier only) ───────────────────────────
def best_price_at_size(slug, user_size_eu, price_rows):
    """Return min price_eur for ``slug`` across in-stock vendor rows whose
    ``sizes_available`` include ``user_size_eu``. None if not available.

    ``price_rows`` is a list of dicts with keys product_slug, price_eur,
    in_stock, sizes_available — the raw shoe_prices rows.
    """
    if not slug or user_size_eu is None or not price_rows:
        return None
    import json as _json
    user_size = float(user_size_eu)
    best = None
    for row in price_rows:
        if row.get("product_slug") != slug:
            continue
        if not row.get("in_stock"):
            continue
        sizes = row.get("sizes_available") or []
        if isinstance(sizes, str):
            try: sizes = _json.loads(sizes)
            except: sizes = []
        try:
            sizes_f = {float(x) for x in sizes}
        except (TypeError, ValueError):
            continue
        if user_size not in sizes_f:
            continue
        p = row.get("price_eur")
        if p is None:
            continue
        p = float(p)
        if best is None or p < best:
            best = p
    return best


def _select_budget(baseline_scored, profile, price_rows,
                   picked_slugs, brand_count):
    """Budget tier: top-30 by baseline score → cheapest-3 by price-at-size.

    See project_v2_tier_assembly memory for the locked rules.
    """
    user_size = profile.get("street_size_eu")
    pool = baseline_scored[:BUDGET_POOL_SIZE]

    # Build (price, score_dict, shoe) for each pool entry that has a
    # price-at-size and isn't already picked.
    priced = []
    for sc, shoe in pool:
        slug = shoe.get("slug")
        if slug in picked_slugs:
            continue
        price = best_price_at_size(slug, user_size, price_rows)
        if price is None:
            continue
        # Annotate the score dict so the harness can show the price
        sc_with_price = {**sc, "best_price_at_size": price}
        priced.append((price, sc_with_price, shoe))

    # Cheapest first
    priced.sort(key=lambda x: x[0])

    # Re-shape into the standard (score_dict, shoe) form for _pick_with_caps,
    # but feed it in price-ascending order (override score-desc sort).
    scored_for_caps = [(sc, shoe) for _, sc, shoe in priced]
    # _pick_with_caps assumes desc-sorted input; we already sorted ASC by
    # price so it walks in the order we want.
    return _pick_with_caps(scored_for_caps, picked_slugs, brand_count,
                           no_edge_count=0, n=TIER_SIZE)


def assemble_tiers(profile, shoes_db, target, price_rows=None):
    """Build all 4 tiers in one call.

    Parameters
    ----------
    profile : dict (must include street_size_eu for budget tier)
    shoes_db : list[dict]
    target : merged dict from resolve_targets_v2(...) ∪ compute_use_case_target(...)
    price_rows : raw shoe_prices rows (only needed for budget tier)

    Returns
    -------
    {
      "baseline": [(score_dict, shoe), ...],
      "softer":   [...],
      "stiffer":  [...],
      "budget":   [...],
      "scored_baseline": full baseline-scored list (debug / further-browse)
    }
    """
    picked_slugs = set()
    brand_count  = {}

    baseline_scored = _score_against(shoes_db,
                                     _shift_target(target, TIER_STIFFNESS_SHIFT["baseline"]),
                                     profile)
    softer_scored   = _score_against(shoes_db,
                                     _shift_target(target, TIER_STIFFNESS_SHIFT["softer"]),
                                     profile)
    stiffer_scored  = _score_against(shoes_db,
                                     _shift_target(target, TIER_STIFFNESS_SHIFT["stiffer"]),
                                     profile)

    baseline = _pick_with_caps(baseline_scored, picked_slugs, brand_count, 0)
    softer   = _pick_with_caps(softer_scored,   picked_slugs, brand_count, 0)
    stiffer  = _pick_with_caps(stiffer_scored,  picked_slugs, brand_count, 0)
    budget   = _select_budget(baseline_scored, profile, price_rows or [],
                              picked_slugs, brand_count)

    return {
        "baseline":        baseline,
        "softer":          softer,
        "stiffer":         stiffer,
        "budget":          budget,
        "scored_baseline": baseline_scored,
    }


__all__ = [
    "score_shoe", "compute_use_case_target",
    "assemble_tiers", "best_price_at_size",
    "SCORING_AXES", "HARD_FILTERS",
    "TIER_STIFFNESS_SHIFT", "PER_TIER_BRAND_CAP", "GLOBAL_BRAND_CAP",
    "PER_TIER_NO_EDGE_CAP", "TIER_SIZE", "BUDGET_POOL_SIZE",
    "INSTEP_HIGH_THRESHOLD", "INSTEP_LOW_THRESHOLD",
]
