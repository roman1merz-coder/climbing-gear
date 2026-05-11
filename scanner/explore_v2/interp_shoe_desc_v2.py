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

    issues = []

    # ── Discipline overlap (v2-specific, very high impact) ─────────────
    do = bd.get("discipline_overlap", 0)
    if do < 0:
        # When this fires, score is -100 — overrides everything else
        issues.append(
            f"the shoe is not built for {target.get('discipline', 'this discipline')} "
            f"climbing"
        )

    # ── Forefoot width vs target ──────────────────────────────────────
    # Roman 2026-05-08: trigger on any rank difference, not just score < 0.
    if shoe_w and "target_fw" in target:
        sr = _FW_RANK.get(shoe_w)
        tr = target["target_fw"]
        tgt_lbl = WIDTH_LABELS[tr]
        if sr is not None and sr != tr:
            direction = "wider" if sr > tr else "narrower"
            issues.append(
                f"the {shoe_w} forefoot runs {direction} than your {tgt_lbl} target"
            )

    # ── Heel volume vs target ─────────────────────────────────────────
    # Roman 2026-05-08: trigger on any rank difference.
    if shoe_hv and "target_hv" in target:
        sr = _HV_RANK.get(shoe_hv)
        tr = target["target_hv"]
        tgt_lbl = HV_LABELS[tr]
        if sr is not None and sr != tr:
            direction = "roomier" if sr > tr else "tighter"
            issues.append(
                f"the {shoe_hv} heel volume is {direction} than your {tgt_lbl} target"
            )

    # ── Downturn vs target ────────────────────────────────────────────
    # Roman 2026-05-08: trigger on ANY rank difference, not just score < 0.
    # A slight downturn vs moderate target is a tradeoff even if scored +5.
    if shoe_dt and "target_dt" in target:
        sr = _DT_RANK.get(shoe_dt)
        tr = target["target_dt"]
        tgt_lbl = DOWNTURN_LABELS[tr]
        if sr is not None and sr != tr:
            if sr < tr:
                issues.append(
                    f"the {shoe_dt} downturn is less aggressive than the "
                    f"{tgt_lbl} downturn we target for your selection"
                )
            else:
                issues.append(
                    f"the {shoe_dt} downturn is more aggressive than the "
                    f"{tgt_lbl} downturn we target for your selection"
                )

    # ── Asymmetry vs target ───────────────────────────────────────────
    # v2 target_asym already includes the foot-shape delta (Egyptian +1,
    # HVA -1), so any rank mismatch is a real divergence from the user's
    # intent-adjusted target.
    # Roman 2026-05-08: trigger on ANY rank difference (slight vs moderate
    # target is a tradeoff worth flagging, even though the partial-match
    # score is positive).
    if shoe_as and "target_asym" in target:
        sr = _ASYM_RANK.get(shoe_as)
        tr = target["target_asym"]
        tgt_lbl = ASYM_LABELS[tr]
        if sr is not None and sr != tr:
            if sr > tr:
                issues.append(
                    f"the {shoe_as} asymmetry is more aggressive than the "
                    f"{tgt_lbl} asymmetry we target"
                )
            else:
                issues.append(
                    f"the {shoe_as} asymmetry is less pronounced than the "
                    f"{tgt_lbl} asymmetry we target"
                )

    # ── Toe form (Egyptian↔Roman opposites, Greek neutral) ────────────
    tf_score = bd.get("toe_form", 0)
    if tf_score < 0 and user_toe:
        # Note: missing toe_form metadata returns 0 (per
        # feedback_v2_toe_form_scoring), so we never get here for that
        # case.
        forms = pick.get("toe_form") or []
        forms_lc = [f.lower() for f in forms] if forms else []
        # Roman 2026-05-01 audit S13/S18: capitalize toe-shape names in
        # user-facing prose (Egyptian/Greek/Roman).
        _TOE_LBL = {"egyptian": "Egyptian", "greek": "Greek", "roman": "Roman"}
        forms_cap = [_TOE_LBL.get(f.lower(), f.capitalize()) for f in forms]
        user_toe_cap = _TOE_LBL.get(user_toe, user_toe.capitalize() if user_toe else "")

        def _join_forms(fs):
            if not fs: return None
            if len(fs) == 1: return fs[0]
            if len(fs) == 2: return f"{fs[0]} or {fs[1]}"
            return ", ".join(fs[:-1]) + f", or {fs[-1]}"

        # Roman 2026-05-02 case-4 review (E): replace the vague
        # "opposite to your X foot" wording with a consequence-specific
        # sentence. Tell the user WHERE the mismatch will show up
        # (which toe gets pinched / where dead space sits) instead of
        # just labeling the form difference.
        if forms_lc and user_toe and user_toe not in forms_lc:
            tf_str = _join_forms(forms_cap) or "a different shape"
            shoe_first = forms_lc[0]  # primary form for pinpointing

            # Pinpoint the mechanical consequence per (user, shoe-form) pair.
            consequence = None
            if user_toe == "egyptian":
                # Egyptian = big toe longest. Greek/Roman lasts narrow elsewhere.
                if shoe_first == "greek":
                    consequence = ("expects the second toe to be longest, so your "
                                   "prominent big toe gets pushed against the front")
                elif shoe_first == "roman":
                    consequence = ("has a flatter front for evenly-lengthed toes, "
                                   "with no extra space for your longer big toe")
            elif user_toe == "greek":
                # Greek = second toe longest.
                if shoe_first == "egyptian":
                    consequence = ("tapers to where the big toe should be longest, "
                                   "so your longer second toe presses into the seam")
                elif shoe_first == "roman":
                    consequence = ("has a flatter front for evenly-lengthed toes, "
                                   "leaving no extra room for your prominent second toe")
            elif user_toe == "roman":
                # Roman = first 2-3 toes roughly equal.
                if shoe_first == "egyptian":
                    consequence = ("tapers steeply down from the big toe, leaving "
                                   "dead space where your second and third toes sit")
                elif shoe_first == "greek":
                    consequence = ("expects only the second toe to be longest, "
                                   "leaving dead space at your big toe and outer toes")

            if consequence:
                issues.append(f"the {tf_str} toe box {consequence}")
            else:
                # Fallback: less specific but still better than the old wording.
                issues.append(
                    f"the {tf_str} toe box is shaped differently than your "
                    f"{user_toe_cap} toes need"
                )

    # ── Stiffness vs target ───────────────────────────────────────────
    # Roman 2026-05-08: compare shoe stiffness against v2 target stiff_target,
    # not just the user-shoes average. Tradeoff fires whenever the shoe's
    # stiffness bin differs from the target's bin (regardless of whether
    # the partial-match score is positive). Tier intent still suppresses:
    # a softer-tier pick is intentionally softer, not a tradeoff.
    stiff_target = target.get("stiff_target")
    if shoe_st is not None and stiff_target is not None:
        shoe_bin = _stiffness_word(shoe_st)        # uses 7-level vocab
        target_bin = _stiffness_word(stiff_target)
        # Tier intent suppression: softer/stiffer tier picks are meant to
        # diverge from the baseline target; don't flag them.
        direction = "softer" if shoe_st < stiff_target else "stiffer"
        if shoe_bin and target_bin and shoe_bin != target_bin \
                and not _tier_intends(tier, direction):
            issues.append(
                f"the {shoe_bin} sole is {direction} than the {target_bin} "
                f"stiffness we target for your selection"
            )

    # ── Closure (preferred set vs bad set, from compute_use_case_target) ─
    cl_score = bd.get("closure", 0)
    if cl_score < 0 and shoe_cl:
        disc = target.get("discipline", "your selection")
        issues.append(
            f"the {shoe_cl} closure is not ideal for {disc} climbing"
        )

    # ── Instep extreme + slipper (v2 axis_instep_extreme) ─────────────
    ie_score = bd.get("instep_extreme", 0)
    if ie_score < 0 and shoe_cl == "slipper" and user_instep_clean \
            and user_instep_clean not in ("normal", ""):
        issues.append(
            f"the slipper closure leaves no adjustability for your "
            f"{user_instep_clean} instep"
        )

    # ── Peer suppression: drop axes shared by ≥70% of peers ────────────
    # Recompute issues by re-checking each issue's underlying axis.
    # Simpler approach: build (axis, msg) pairs above and filter here.
    # For now we filter only the most case-level prone ones.
    if peers:
        # Drop heel_volume / forefoot_width / asymmetry mismatches when
        # they're shared — those become case-level facts, not shoe-level
        # differentiators.
        for shared_axis, keyword in (
            ("heel_volume",     "heel volume"),
            ("forefoot_width",  "forefoot runs"),
            ("asymmetry",       "asymmetry"),
        ):
            if _shared_by_most(shared_axis, peers):
                issues = [i for i in issues if keyword not in i]

    # ── Output formatting (v2: drop dead boilerplate, return None) ────
    # Roman 2026-04-27: don't render "No notable tradeoffs..." — when there's
    # nothing to flag, omit P3 entirely. The renderer skips falsy fields.
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


def generate_shoe_description_v2(pick, profile, all_picks=None):
    """V2 wrapper: P1 + P2 from v1 (with dedup filters), P3 from v2.

    ``pick`` must be the flat shape returned by ``flatten_pick`` (so it
    carries v2 ``breakdown`` semantics + the merged v2 ``target`` dict).

    Returns list of [P1, P2, P3] strings. Any of P2/P3 may be None when
    nothing useful to say — the renderer should skip those fields.
    """
    p1_raw = _v1_para_description(pick, profile)
    p1 = _strip_p1_target_redundancy(p1_raw)

    p2_raw = _v1_para_why_selected(pick, profile, all_picks=all_picks)
    p2 = _strip_p2_boilerplate(p2_raw)
    if pick.get("not_in_stock"):
        note = ("Note: this shoe is not currently available online. "
                "Check local shops or wait for restocks.")
        p2 = f"{p2} {note}" if p2 else note
    if pick.get("tier") == "budget" and pick.get("best_price") is not None:
        price = pick["best_price"]
        prefix = f"At EUR {price:.0f}, this is a strong value pick."
        p2 = f"{prefix} {p2}" if p2 else prefix

    # Roman 2026-05-02 case-4 review (C): when no tier-distinguishing reason
    # fired (typical of the headline tier picks, since they're chosen
    # precisely for being clean matches), surface a clean alignment
    # statement instead of leaving P2 blank. Without this, ~half of the
    # shoe cards rendered with no selection rationale at all.
    if not p2:
        p2 = "Shoe geometry and features align perfectly with your fit target."

    p3 = _para_tradeoffs_v2(pick, profile, all_picks=all_picks)
    return [p1, p2, p3]


__all__ = [
    "flatten_pick",
    "generate_shoe_description_v2",
    "_para_tradeoffs_v2",
]
