"""V2 sandbox: per-shoe description generator (P1, P2, P3).

Wraps the production v1 ``benchmark/interp_shoe_desc.py`` and replaces ONLY
the P3 (tradeoffs) paragraph, since v2 changed:

  * the scoring breakdown structure (axis → (score, note) tuple, simpler
    axis names, dropped many v1 axes),
  * the target shape (now a unified dict with target_fw/hv/fv/dt/asym
    plus stiffness window from compute_use_case_target).

P1 (description) and P2 (why selected) are voice/marketing-style
paragraphs that don't depend on the scoring breakdown structure — they
read shoe properties directly. We reuse the v1 versions verbatim.

Sandbox-only — folds back into ``benchmark/interp_shoe_desc.py`` once
v2 cuts over.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from benchmark.interp_shoe_desc import (
    _para_description as _v1_para_description,
    _para_why_selected as _v1_para_why_selected,
    _stiffness_word,
)
from target_resolver_v2 import (
    WIDTH_LABELS, HV_LABELS, ASYM_LABELS, DOWNTURN_LABELS,
)


# ── Pick adapter ───────────────────────────────────────────────────────

def flatten_pick(score_dict, shoe, *, tier, target, best_price=None,
                 not_in_stock=False):
    """Turn a v2 (score_dict, shoe) tuple into the flat ``pick`` shape
    the description paragraphs expect.

    The v2 scorer returns ``score_dict["breakdown"][axis] = (score, note)``.
    We split that into ``breakdown`` (axis → score) and
    ``breakdown_notes`` (axis → note) for downstream callers.
    """
    bd_scores = {}
    bd_notes  = {}
    for k, v in (score_dict.get("breakdown") or {}).items():
        if isinstance(v, tuple) and len(v) == 2:
            bd_scores[k], bd_notes[k] = v
        else:
            bd_scores[k] = v
            bd_notes[k]  = ""

    return {
        # Shoe props (mirror v1 pick shape)
        "slug":              shoe.get("slug"),
        "brand":             shoe.get("brand"),
        "model":             shoe.get("model"),
        "closure":           shoe.get("closure"),
        "downturn":          shoe.get("downturn"),
        "asymmetry":         shoe.get("asymmetry"),
        "toe_form":          shoe.get("toe_form"),
        "stiffness":         shoe.get("computed_stiffness"),
        "width":             shoe.get("width"),
        "heel_volume":       shoe.get("heel_volume"),
        "forefoot_volume":   shoe.get("forefoot_volume"),
        "no_edge":           shoe.get("no_edge"),
        # Build fields used by V1 _para_description for the sole sentence.
        # Roman 2026-05-02 case-4 review (D): without these, P1 collapsed
        # to just "Sensitive shoe." with no rubber / midsole / build context.
        "rubber_type":          shoe.get("rubber_type"),
        "rubber_thickness_mm":  shoe.get("rubber_thickness_mm"),
        "midsole":              shoe.get("midsole"),
        "midsole_stiffness":    shoe.get("midsole_stiffness"),
        "upper_material":       shoe.get("upper_material"),
        "description":          shoe.get("description"),
        "special_fit_notes":    shoe.get("special_fit_notes"),
        # Scoring + context
        "score":             score_dict.get("score"),
        "breakdown":         bd_scores,
        "breakdown_notes":   bd_notes,
        "tier":              tier,
        "target":            target,          # NEW in v2
        "best_price":        best_price,
        "not_in_stock":      not_in_stock,
    }


# ── Internal helpers ──────────────────────────────────────────────────

_FW_RANK   = {"narrow": 0, "medium": 1, "wide": 2}
_HV_RANK   = {"narrow": 0, "low": 0, "medium": 1, "standard": 1,
              "wide": 2, "high": 2}
_DT_RANK   = {"flat": 0, "slight": 1, "moderate": 2, "aggressive": 3}
_ASYM_RANK = {"none": 0, "slight": 1, "moderate": 2, "strong": 3}


def _stiff_vs_user(shoe_stiff, user_shoes):
    """Return 'softer' / 'stiffer' / None vs the user's shoe avg.
    Used for tier-aware suppression so the stiffer tier doesn't surface
    'stiffer than your current shoes' as a tradeoff."""
    if shoe_stiff is None:
        return None
    vals = [s.get("db_stiffness") for s in (user_shoes or [])
            if s.get("db_stiffness") is not None]
    if not vals:
        return None
    avg = sum(vals) / len(vals)
    if shoe_stiff < avg - 0.05: return "softer"
    if shoe_stiff > avg + 0.05: return "stiffer"
    return None


def _tier_intends(tier, direction):
    return (tier == "softer" and direction == "softer") or \
           (tier == "stiffer" and direction == "stiffer")


def _shared_by_most(axis, picks_minus_self):
    """True if this axis is also negative for >= 70% of peer picks."""
    if not picks_minus_self:
        return False
    neg = sum(1 for p in picks_minus_self
              if (p.get("breakdown") or {}).get(axis, 0) < 0)
    return neg / len(picks_minus_self) >= 0.7


# ── Per-axis diff helpers (Roman 2026-05-08 concise wording) ──────────
#
# Each axis maps to a (positive_phrase, negative_phrase) pair where
# positive = shoe rank > target rank and negative = shoe rank < target.
# Phrases are short adjective fragments that compose cleanly into
# "{magnitude} {phrase} than we target".

_AXIS_DIFF_PHRASES = {
    "downturn":      ("more downturned",          "less downturned"),
    "asymmetry":     ("more asymmetric",          "less asymmetric"),
    "forefoot":      ("wider in the forefoot",    "narrower in the forefoot"),
    "heel":          ("roomier in the heel",      "tighter in the heel"),
    "stiffness":     ("stiffer",                  "softer"),
}

# Per-axis "matches target" phrasing for the pros (P2)
_AXIS_MATCH_LABELS = {
    "downturn":      "downturn",
    "asymmetry":     "asymmetry",
    "forefoot":      "forefoot width",
    "heel":          "heel volume",
    "stiffness":     "stiffness",
    "toe_form":      "toe form",
    "closure":       "closure",
}


def _magnitude_prefix(abs_diff):
    """1 step -> 'slightly ', 2 steps -> '', 3+ steps -> 'much '."""
    if abs_diff == 1:
        return "slightly "
    if abs_diff >= 3:
        return "much "
    return ""


def _format_axis_diffs(diffs):
    """`diffs` = list of (axis, shoe_rank, target_rank). Returns concise
    "X and Y than we target" string, or None.

    Roman 2026-05-18: connector is always "and". Every entry here is a
    tradeoff (a deviation from target) — there is no "good" item to
    contrast against, so "but" was never appropriate. The earlier
    same-direction check conflated "shoe ranks above vs below target"
    with "desirable vs undesirable", which they are not."""
    if not diffs:
        return None
    phrases = []
    for axis, sr, tr in diffs:
        diff = sr - tr
        if diff == 0:
            continue
        pos, neg = _AXIS_DIFF_PHRASES.get(axis, (axis, axis))
        phrases.append(_magnitude_prefix(abs(diff)) + (pos if diff > 0 else neg))
    if not phrases:
        return None
    if len(phrases) == 1:
        return f"{phrases[0]} than we target"
    if len(phrases) == 2:
        return f"{phrases[0]} and {phrases[1]} than we target"
    # 3+: comma list with "and" before the last
    return ", ".join(phrases[:-1]) + f", and {phrases[-1]} than we target"


def _join_match_labels(labels):
    """'a' / 'a and b' / 'a, b, and c'."""
    if not labels:
        return ""
    if len(labels) == 1:
        return labels[0]
    if len(labels) == 2:
        return f"{labels[0]} and {labels[1]}"
    return ", ".join(labels[:-1]) + f", and {labels[-1]}"


# ── P3 (v2) ───────────────────────────────────────────────────────────

def _para_tradeoffs_v2(pick, profile, all_picks=None):
    """V2 tradeoffs paragraph.

    Roman 2026-05-08: a tradeoff is any axis where the pick's value
    DIFFERS from the ideal target value, regardless of whether the
    score is positive or negative. A pick with asymmetry +5 (slight
    instead of moderate target) IS a tradeoff even though the score
    is positive — the user should know this pick is weaker on that
    axis vs the ideal.

    Earlier (pre-2026-05-08) the function only flagged score < 0,
    which missed partial-match cases entirely. That made baseline tier
    P3 always empty (filter excludes hard-mismatch shoes; survivors
    that get partial matches were silently treated as tradeoff-free).

    Tier-aware suppression for stiffness still applies (a softer-tier
    pick is intentionally softer, not a tradeoff). Peer suppression
    (>= 70% share a negative) still applies for the case-level facts.
    """
    bd        = pick.get("breakdown") or {}
    target    = pick.get("target") or {}
    tier      = (pick.get("tier") or "").lower()
    peers     = [p for p in (all_picks or []) if p.get("slug") != pick.get("slug")]
    user_shoes = profile.get("shoes", [])

    shoe_w   = (pick.get("width")        or "").lower()
    shoe_hv  = (pick.get("heel_volume")  or "").lower()
    shoe_fv  = (pick.get("forefoot_volume") or "").lower()
    shoe_dt  = (pick.get("downturn")     or "").lower()
    shoe_as  = (pick.get("asymmetry")    or "").lower()
    shoe_cl  = (pick.get("closure")      or "").lower()
    shoe_st  = pick.get("stiffness")

    user_toe = (profile.get("toe_shape") or "").lower()
    user_instep = (profile.get("instep_height_class") or "").lower()
    user_instep_clean = user_instep.replace(" instep", "").strip()

    # Roman 2026-05-08: collect rank-axis diffs as concise phrases joined
    # with "and" / "but". Toe form, closure, instep, discipline-overlap
    # remain separate categorical issues (not rank diffs).
    rank_diffs = []   # list of (axis, shoe_rank, target_rank)

    # ── Discipline overlap (v2-specific, very high impact) ─────────────
    do = bd.get("discipline_overlap", 0)
    discipline_issue = None
    if do < 0:
        # When this fires, score is -100 — overrides everything else
        discipline_issue = (
            f"the shoe is not built for "
            f"{target.get('discipline', 'this discipline')} climbing"
        )

    # ── Forefoot width vs target ──────────────────────────────────────
    if shoe_w and "target_fw" in target:
        sr = _FW_RANK.get(shoe_w)
        tr = target["target_fw"]
        if sr is not None and sr != tr:
            rank_diffs.append(("forefoot", sr, tr))

    # ── Heel volume vs target ─────────────────────────────────────────
    if shoe_hv and "target_hv" in target:
        sr = _HV_RANK.get(shoe_hv)
        tr = target["target_hv"]
        if sr is not None and sr != tr:
            rank_diffs.append(("heel", sr, tr))

    # ── Downturn vs target ────────────────────────────────────────────
    if shoe_dt and "target_dt" in target:
        sr = _DT_RANK.get(shoe_dt)
        tr = target["target_dt"]
        if sr is not None and sr != tr:
            rank_diffs.append(("downturn", sr, tr))

    # ── Asymmetry vs target ───────────────────────────────────────────
    # v2 target_asym already includes the foot-shape delta.
    if shoe_as and "target_asym" in target:
        sr = _ASYM_RANK.get(shoe_as)
        tr = target["target_asym"]
        if sr is not None and sr != tr:
            rank_diffs.append(("asymmetry", sr, tr))

    issues = []
    if discipline_issue:
        issues.append(discipline_issue)

    # ── Toe form (Egyptian↔Roman opposites, Greek neutral) ────────────
    # Roman 2026-05-18: keep the toe-form tradeoff short and consistent
    # with the other one-line tradeoffs. The earlier per-pair
    # "consequence" wording was long, and one mapping (Roman foot in
    # Egyptian last) was anatomically backwards. Dropped in favour of a
    # plain form-mismatch statement.
    tf_score = bd.get("toe_form", 0)
    if tf_score < 0 and user_toe:
        # Note: missing toe_form metadata returns 0 (per
        # feedback_v2_toe_form_scoring), so we never get here for that case.
        forms = pick.get("toe_form") or []
        forms_lc = [f.lower() for f in forms] if forms else []
        _TOE_LBL = {"egyptian": "Egyptian", "greek": "Greek", "roman": "Roman"}
        forms_cap = [_TOE_LBL.get(f, f.capitalize()) for f in forms_lc]
        user_toe_cap = _TOE_LBL.get(user_toe, user_toe.capitalize())

        def _join_forms(fs):
            if not fs: return "a different"
            if len(fs) == 1: return fs[0]
            if len(fs) == 2: return f"{fs[0]} or {fs[1]}"
            return ", ".join(fs[:-1]) + f", or {fs[-1]}"

        if forms_lc and user_toe not in forms_lc:
            tf_str = _join_forms(forms_cap)
            issues.append(
                f"{tf_str} toe form might not be a perfect fit for "
                f"your {user_toe_cap} toe"
            )

    # ── Stiffness vs target (rank-style) ──────────────────────────────
    # Roman 2026-05-08: compare shoe stiffness against v2 target stiff_target,
    # not just the user-shoes average. Tradeoff fires whenever the shoe's
    # stiffness differs meaningfully from the target. Tier intent still
    # suppresses: a softer-tier pick is intentionally softer, not a tradeoff.
    # Synthetic rank diff: 1 step per ~0.20 stiffness-unit gap.
    stiff_target_val = target.get("stiff_target")
    if shoe_st is not None and stiff_target_val is not None:
        diff = shoe_st - stiff_target_val
        direction = "stiffer" if diff > 0 else "softer"
        if abs(diff) >= 0.05 and not _tier_intends(tier, direction):
            if abs(diff) < 0.20:
                steps = 1
            elif abs(diff) < 0.40:
                steps = 2
            else:
                steps = 3
            rank_diffs.append(("stiffness",
                               steps if diff > 0 else -steps, 0))

    # ── Closure (preferred set vs bad set) ─────────────────────────────
    # Roman 2026-05-18: a closure that merely scores 0 ("acceptable")
    # is still a tradeoff if it's not in the PREFERRED set — e.g. a
    # recommended lace-up when §3 targets velcro/slipper for bouldering.
    # Flag whenever the closure isn't preferred, with softer wording
    # for the acceptable-but-not-preferred case than the bad case.
    closure_issue = None
    cl_score = bd.get("closure", 0)
    closure_pref = [c.lower() for c in (target.get("closure_pref") or [])]
    if shoe_cl and closure_pref and shoe_cl not in closure_pref:
        disc = target.get("discipline", "your selection")
        # Roman 2026-05-18: natural-language discipline phrase
        # ("bouldering", not "boulder climbing").
        disc_phrase = {
            "boulder": "bouldering",
            "sport": "sport climbing",
            "trad_multipitch": "trad and multipitch climbing",
        }.get(disc, f"{disc} climbing")
        if cl_score < 0:
            closure_issue = f"the {shoe_cl} closure is not ideal for {disc_phrase}"
        else:
            pref_str = (closure_pref[0] if len(closure_pref) == 1
                        else " or ".join(closure_pref))
            closure_issue = (f"the {shoe_cl} closure, vs the {pref_str} "
                             f"we target for {disc_phrase}")

    # ── Instep extreme + slipper ──────────────────────────────────────
    instep_issue = None
    ie_score = bd.get("instep_extreme", 0)
    if ie_score < 0 and shoe_cl == "slipper" and user_instep_clean \
            and user_instep_clean not in ("normal", ""):
        instep_issue = (f"the slipper closure leaves no adjustability for "
                        f"your {user_instep_clean} instep")

    # ── Peer suppression: drop axes shared by >=70% of peers ───────────
    # Roman 2026-05-08: applies to rank diffs only (case-level facts vs
    # shoe-specific differentiators). Map axis name to v2 breakdown key.
    # Roman 2026-05-18: foot-shape axes (heel, forefoot) are NO LONGER
    # peer-suppressed. A heel/forefoot mismatch is a real per-shoe
    # tradeoff the user must see even when most picks share it — e.g.
    # medium-fw + wide-heel shoes are rare, so most picks miss a wide
    # heel, but each card still has to disclose its own heel miss.
    if peers:
        suppress_keys = {
            "asymmetry": "asymmetry",
        }
        rank_diffs = [
            d for d in rank_diffs
            if not (d[0] in suppress_keys
                    and _shared_by_most(suppress_keys[d[0]], peers))
        ]

    # ── Append the categorical issues already in `issues`, then add
    # closure / instep, then the rank-diffs as one combined phrase.
    if closure_issue:
        issues.append(closure_issue)
    if instep_issue:
        issues.append(instep_issue)

    rank_phrase = _format_axis_diffs(rank_diffs)
    if rank_phrase:
        issues.append(rank_phrase)

    # ── Output formatting (v2: drop dead boilerplate, return None) ────
    # Roman 2026-04-27: don't render "No notable tradeoffs..." — when
    # there's nothing to flag, omit P3 entirely.
    if not issues:
        return None

    issues = issues[:3]
    issues[0] = issues[0][0].upper() + issues[0][1:]
    if len(issues) == 1:
        return f"Tradeoff: {issues[0]}."
    if len(issues) == 2:
        return f"Tradeoffs: {issues[0]}, and {issues[1]}."
    return f"Tradeoffs: {issues[0]}; {issues[1]}; and {issues[2]}."


# ── Public API ────────────────────────────────────────────────────────

import re as _re

# P1 sentences that restate the USER'S target, not anything specific to
# this shoe — strip across all picks. The toe-shape and downturn/asym
# targets already appear in §3; repeating them in every shoe card
# creates the "11 of 12 cards say the same thing" duplication
# (Roman 2026-04-27).
_P1_TOE_BOX_RE = _re.compile(r'^[A-Za-z]+(?:/[a-z]+)* toe box$')
_P1_PERF_RE = _re.compile(
    r'^(Aggressively downturned|Moderate downturn|Slight downturn|Flat-lasted)'
    r'( with (?:strong|moderate|slight) asymmetry| with symmetric profile)?$'
)


def _strip_p1_target_redundancy(p1):
    """Drop sentences in P1 that repeat the user's target (toe box,
    downturn+asym). Keep shoe-specific sentences (fit profile, no-edge,
    rubber/sole/stiffness).

    Roman 2026-05-08: split on sentence-ending periods only (period followed
    by whitespace or end-of-string), NOT on every period — otherwise
    decimal numbers in rubber names ("Science Friction 3.0") and rubber
    thicknesses ("3.5mm") get broken into "3. 0" and "3. 5mm".
    """
    if not p1:
        return p1
    # Split on '.' that's followed by whitespace OR end-of-string only.
    sentences = [s.strip() for s in _re.split(r'\.(?=\s|$)', p1) if s.strip()]
    kept = [s for s in sentences
            if not _P1_TOE_BOX_RE.match(s) and not _P1_PERF_RE.match(s)]
    if not kept:
        return ""
    return ". ".join(kept) + "."


# P2 boilerplate fallback the v1 generator emits when no specific
# selection reason fired. Shows up 4/12 times — dead text. Return None.
_P2_BOILERPLATE = "Good overall fit for your foot shape and climbing style."


def _strip_p2_boilerplate(p2):
    if not p2:
        return None
    if p2.strip() == _P2_BOILERPLATE:
        return None
    cleaned = p2.replace(_P2_BOILERPLATE, "").strip()
    return cleaned if cleaned else None


# ── V2 P1 description (Roman 2026-05-08) ──────────────────────────────
#
# Complete 2-sentence description, replacing the V1 multi-sentence build.
#
#   "{Closure} with {ToeForm} toe form, {width} forefoot with a {hv}
#    heel cup. {thickness}mm {rubber} rubber with a {midsole_coverage},
#    {midsole_stiff} midsole, resulting in a {stiff_word} shoe with
#    {downturn} and {asymmetry}."
#
# Drops P2 entirely — P1 carries all the shoe character; P3 carries
# tradeoffs vs the user's target.

_CLOSURE_LBL = {"velcro": "Velcro", "lace": "Lace-up", "slipper": "Slipper"}

_MIDSOLE_COVERAGE_LABEL = {
    "none": None,
    "toe": "toe-only",
    "partial": "partial",
    "forefoot": "forefoot",
    "half": "half-length",
    "three_quarter": "three-quarter",
    "full": "full",
}

_MIDSOLE_STIFF_LABEL = {
    "none": None,
    "soft": "soft",
    "medium_soft": "medium-soft",
    "medium": "medium",
    "medium_hard": "medium-hard",
    "hard": "hard",
}

def _stiffness_word_9(s):
    """Roman 2026-05-08: replace V1's 7-level stiffness vocab with a
    9-level scheme using ~0.10 bins. The old "sensitive" bin (0.25-0.40)
    was 15 percentile points wide and swallowed multiple picks per case.
    Finer bins give P1 distinct labels per pick.

      < 0.15        super soft
      0.15 - 0.25   very soft
      0.25 - 0.35   soft
      0.35 - 0.45   medium-soft
      0.45 - 0.55   balanced-stiffness  (hyphenated — "balanced" alone
                                          would be ambiguous in P1's
                                          "balanced shoe" reading;
                                          consistent with §3 wording)
      0.55 - 0.65   medium-firm
      0.65 - 0.75   firm
      0.75 - 0.85   very firm
      >= 0.85       super firm
    """
    if s is None:
        return ""
    s = float(s)
    if s < 0.15: return "super soft"
    if s < 0.25: return "very soft"
    if s < 0.35: return "soft"
    if s < 0.45: return "medium-soft"
    if s < 0.55: return "balanced-stiffness"
    if s < 0.65: return "medium-firm"
    if s < 0.75: return "firm"
    if s < 0.85: return "very firm"
    return "super firm"


_DOWNTURN_PHRASE = {
    "flat":       "flat profile",
    "slight":     "slight downturn",
    "moderate":   "moderate downturn",
    "aggressive": "aggressive downturn",
}

_ASYM_PHRASE = {
    "none":     "symmetric profile",
    "slight":   "slight asymmetry",
    "moderate": "moderate asymmetry",
    "strong":   "strong asymmetry",
}


def _build_p1_v2(pick, profile):
    """Build the 2-sentence V2 shoe description.

    Format:
      "{Closure} with {ToeForm} toe form, {width} forefoot with a
       {hv} heel cup. {thickness}mm {rubber} rubber with a {midsole},
       {midsole_stiff} midsole, resulting in a {stiff_word} shoe with
       {downturn} and {asymmetry}."

    Gracefully degrades when fields are missing.
    """
    from benchmark.interp_shoe_desc import _clean_rubber_name

    _TOE_LBL = {"egyptian": "Egyptian", "greek": "Greek", "roman": "Roman"}

    closure = (pick.get("closure") or "").lower()
    closure_lbl = _CLOSURE_LBL.get(closure, closure.capitalize() if closure else None)

    toe_forms = pick.get("toe_form") or []
    if isinstance(toe_forms, str):
        toe_forms = [toe_forms]
    toe_form_lbl = "/".join(
        _TOE_LBL.get(str(f).lower(), str(f).capitalize()) for f in toe_forms
    ) or None

    width = (pick.get("width") or "").lower()
    hv    = (pick.get("heel_volume") or "").lower()
    fv    = (pick.get("forefoot_volume") or "").lower()

    # ── Sentence 1: closure + toe form + fit profile ──
    s1_parts = []
    if closure_lbl and toe_form_lbl:
        s1_parts.append(f"{closure_lbl} with {toe_form_lbl} toe form")
    elif closure_lbl:
        s1_parts.append(closure_lbl)
    elif toe_form_lbl:
        s1_parts.append(f"{toe_form_lbl} toe form")

    fit_str = ""
    vol_suffix = ""
    if fv == "low":  vol_suffix = ", low forefoot volume"
    elif fv == "high": vol_suffix = ", high forefoot volume"

    if width and hv:
        if width == hv:
            fit_str = f"{width} fit throughout{vol_suffix}"
        else:
            # Roman 2026-05-08: "and a" not "with a" — avoids double "with"
            # when the closure prefix is "Velcro with Egyptian toe form".
            fit_str = f"{width} forefoot and a {hv} heel cup{vol_suffix}"
    elif width:
        fit_str = f"{width} forefoot{vol_suffix}"

    if fit_str:
        s1_parts.append(fit_str)

    s1 = ", ".join(s1_parts) + "." if s1_parts else ""

    # ── Sentence 2: rubber + midsole + stiffness + downturn + asym ──
    db_rubber = pick.get("rubber_type") or ""
    rubber_name = _clean_rubber_name(db_rubber)
    thick = pick.get("rubber_thickness_mm")
    thickness_str = f"{thick:g}mm" if thick else ""

    if rubber_name:
        rubber_phrase = f"{thickness_str} {rubber_name} rubber".strip() \
            if thickness_str else f"{rubber_name} rubber"
    elif thickness_str:
        rubber_phrase = f"{thickness_str} rubber"
    else:
        rubber_phrase = ""

    db_midsole       = (pick.get("midsole") or "").lower()
    db_midsole_stiff = (pick.get("midsole_stiffness") or "").lower()
    coverage_label = _MIDSOLE_COVERAGE_LABEL.get(db_midsole)
    stiff_label    = _MIDSOLE_STIFF_LABEL.get(db_midsole_stiff)

    if db_midsole == "none" or coverage_label is None:
        midsole_phrase = "no midsole"
    elif coverage_label and stiff_label:
        midsole_phrase = f"a {coverage_label}, {stiff_label} midsole"
    elif coverage_label:
        midsole_phrase = f"a {coverage_label} midsole"
    else:
        midsole_phrase = ""

    # Roman 2026-05-08: 9-level stiffness vocab (replaces V1's 7-level
    # which had a too-wide "sensitive" bin that swallowed multiple picks).
    stiff_word = _stiffness_word_9(pick.get("stiffness"))

    downturn = (pick.get("downturn") or "").lower()
    asym = (pick.get("asymmetry") or "").lower()
    perf_parts = []
    if downturn in _DOWNTURN_PHRASE:
        perf_parts.append(_DOWNTURN_PHRASE[downturn])
    if asym in _ASYM_PHRASE:
        perf_parts.append(_ASYM_PHRASE[asym])

    if len(perf_parts) == 2:
        perf_phrase = f"{perf_parts[0]} and {perf_parts[1]}"
    elif perf_parts:
        perf_phrase = perf_parts[0]
    else:
        perf_phrase = ""

    # Assemble sentence 2
    s2 = ""
    if rubber_phrase and midsole_phrase:
        head = f"{rubber_phrase} with {midsole_phrase}"
    elif rubber_phrase:
        head = rubber_phrase
    elif midsole_phrase:
        head = midsole_phrase[0].upper() + midsole_phrase[1:]
    else:
        head = ""

    if head and stiff_word and perf_phrase:
        s2 = f"{head}, resulting in a {stiff_word} shoe with {perf_phrase}."
    elif head and stiff_word:
        s2 = f"{head}, resulting in a {stiff_word} shoe."
    elif head and perf_phrase:
        s2 = f"{head}, with {perf_phrase}."
    elif head:
        s2 = f"{head}."
    elif stiff_word and perf_phrase:
        s2 = f"{stiff_word.capitalize()} shoe with {perf_phrase}."
    elif stiff_word:
        s2 = f"{stiff_word.capitalize()} shoe."

    # Optional 3rd sentence: no-edge construction
    extras = []
    if pick.get("no_edge"):
        extras.append("No-edge construction wraps rubber smoothly for smearing.")
    special = pick.get("special_fit_notes")
    if special:
        extras.append(special.strip())

    parts = [p for p in [s1, s2] + extras if p]
    return " ".join(parts)


def _matched_axes(pick, profile):
    """Return list of user-facing axis labels where the pick's value
    matches the v2 target. Roman 2026-05-08: P2 pros mirror P3 tradeoffs
    — list which axes are aligned, in the same order as P3 lists which
    differ. Composable with the existing V1 tier-rationale text.
    """
    target = pick.get("target") or {}
    matched = []

    shoe_w  = (pick.get("width")        or "").lower()
    shoe_hv = (pick.get("heel_volume")  or "").lower()
    shoe_dt = (pick.get("downturn")     or "").lower()
    shoe_as = (pick.get("asymmetry")    or "").lower()
    shoe_st = pick.get("stiffness")
    user_toe = (profile.get("toe_shape") or "").lower()
    pick_toe_forms = [str(f).lower() for f in (pick.get("toe_form") or [])]

    if "target_fw" in target and _FW_RANK.get(shoe_w) == target["target_fw"]:
        matched.append("forefoot width")
    if "target_hv" in target and _HV_RANK.get(shoe_hv) == target["target_hv"]:
        matched.append("heel volume")
    if "target_dt" in target and _DT_RANK.get(shoe_dt) == target["target_dt"]:
        matched.append("downturn")
    if "target_asym" in target and _ASYM_RANK.get(shoe_as) == target["target_asym"]:
        matched.append("asymmetry")
    if user_toe and pick_toe_forms and user_toe in pick_toe_forms:
        matched.append("toe form")
    stiff_target = target.get("stiff_target")
    if shoe_st is not None and stiff_target is not None \
            and abs(shoe_st - stiff_target) < 0.05:
        matched.append("stiffness")
    return matched


def generate_shoe_description_v2(pick, profile, all_picks=None):
    """V2 generator: P1 (full shoe description) + P3 (tradeoffs vs target).

    Roman 2026-05-08: P2 dropped entirely. P1 carries the full shoe
    character (closure + toe form + fit + build + downturn + asymmetry).
    P3 carries the tradeoffs vs the user's target. The tier label
    above the cards already communicates the per-tier intent (Your Best
    Match / Softer / Stiffer / Best Value).

    Returns list of [P1, P2, P3] where P2 is always None (kept in the
    return shape for renderer compatibility — the renderer skips None).
    """
    p1 = _build_p1_v2(pick, profile)

    # Append not-in-stock + budget price as a continuation of P1 — these
    # are the only non-tier pieces of context worth carrying forward.
    extras = []
    if pick.get("tier") == "budget" and pick.get("best_price") is not None:
        extras.append(f"At EUR {pick['best_price']:.0f}, a strong-value pick.")
    if pick.get("not_in_stock"):
        extras.append("Note: not currently available online — check local shops.")
    if extras:
        p1 = f"{p1} {' '.join(extras)}"

    p3 = _para_tradeoffs_v2(pick, profile, all_picks=all_picks)

    # P2 retired (Roman 2026-05-08). Returned as None for renderer compat.
    return [p1, None, p3]


__all__ = [
    "flatten_pick",
    "generate_shoe_description_v2",
    "_para_tradeoffs_v2",
]
