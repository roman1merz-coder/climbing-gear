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

    Reads the v2 9-axis breakdown and compares each negative axis against
    the v2 unified target dict (target_fw / target_hv / target_dt /
    target_asym + stiffness window). Tier-aware suppression for stiffness.
    Peer suppression (>= 70% share a negative) for axes where it would
    otherwise read as a case-level fact.
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
    fw_score = bd.get("forefoot_width", 0)
    if fw_score < 0 and shoe_w and "target_fw" in target:
        tgt_lbl = WIDTH_LABELS[target["target_fw"]]
        sr = _FW_RANK.get(shoe_w)
        tr = target["target_fw"]
        if sr is not None:
            direction = "wider" if sr > tr else "narrower"
            issues.append(
                f"the {shoe_w} forefoot runs {direction} than your {tgt_lbl} target"
            )

    # ── Heel volume vs target ─────────────────────────────────────────
    hv_score = bd.get("heel_volume", 0)
    if hv_score < 0 and shoe_hv and "target_hv" in target:
        tgt_lbl = HV_LABELS[target["target_hv"]]
        sr = _HV_RANK.get(shoe_hv)
        tr = target["target_hv"]
        if sr is not None:
            direction = "roomier" if sr > tr else "tighter"
            issues.append(
                f"the {shoe_hv} heel volume is {direction} than your {tgt_lbl} target"
            )

    # ── Downturn vs target ────────────────────────────────────────────
    dt_score = bd.get("downturn", 0)
    if dt_score < 0 and shoe_dt and "target_dt" in target:
        tgt_lbl = DOWNTURN_LABELS[target["target_dt"]]
        sr = _DT_RANK.get(shoe_dt)
        tr = target["target_dt"]
        if sr is not None:
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
    # Note: v2 target_asym already includes the foot-shape delta
    # (Egyptian +1, HVA -1), so any negative asym score is a mismatch
    # against the user's intent-adjusted target — no separate Greek-toe
    # special-case is needed.
    as_score = bd.get("asymmetry", 0)
    if as_score < 0 and shoe_as and "target_asym" in target:
        tgt_lbl = ASYM_LABELS[target["target_asym"]]
        sr = _ASYM_RANK.get(shoe_as)
        tr = target["target_asym"]
        if sr is not None:
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

        def _join_forms(fs):
            if not fs: return None
            if len(fs) == 1: return fs[0]
            if len(fs) == 2: return f"{fs[0]} or {fs[1]}"
            return ", ".join(fs[:-1]) + f", or {fs[-1]}"

        if user_toe == "greek" and forms_lc and user_toe not in forms_lc:
            # Greek user, shoe is egyptian or roman → -5 × conf
            tf_str = _join_forms(forms) or "a different shape"
            issues.append(
                f"the toe box is shaped for {tf_str} feet, not Greek"
            )
        elif forms_lc and user_toe not in forms_lc:
            # Egyptian↔Roman opposite, full -10 × conf
            tf_str = _join_forms(forms) or "the opposite form"
            issues.append(
                f"the toe box is built for {tf_str} feet, opposite to your "
                f"{user_toe} foot"
            )

    # ── Stiffness vs user baseline (tier-aware suppression) ───────────
    st_score = bd.get("stiffness", 0)
    direction = _stiff_vs_user(shoe_st, user_shoes)
    if st_score < 0 and not _tier_intends(tier, direction):
        sw = _stiffness_word(shoe_st)
        if direction:
            if sw:
                issues.append(
                    f"the {sw} sole is {direction} than what you currently climb in"
                )
            else:
                issues.append(
                    f"the sole is {direction} than what you currently climb in"
                )
        elif sw:
            # No reference shoes — fall back to window comment
            note = pick.get("breakdown_notes", {}).get("stiffness", "")
            if "outside" in note:
                issues.append(
                    f"the {sw} stiffness sits outside the comfortable range for "
                    f"your selection"
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

    # ── Output formatting (mirrors v1) ────────────────────────────────
    if not issues:
        return "No notable tradeoffs for your foot shape."

    issues = issues[:3]
    issues[0] = issues[0][0].upper() + issues[0][1:]
    if len(issues) == 1:
        return f"Tradeoff: {issues[0]}."
    if len(issues) == 2:
        return f"Tradeoffs: {issues[0]}, and {issues[1]}."
    return f"Tradeoffs: {issues[0]}; {issues[1]}; and {issues[2]}."


# ── Public API ────────────────────────────────────────────────────────

def generate_shoe_description_v2(pick, profile, all_picks=None):
    """V2 wrapper: P1 + P2 from v1, P3 from v2.

    ``pick`` must be the flat shape returned by ``flatten_pick`` (so it
    carries v2 ``breakdown`` semantics + the merged v2 ``target`` dict).

    Returns list of 3 paragraph strings, same contract as v1.
    """
    p1 = _v1_para_description(pick, profile)
    p2 = _v1_para_why_selected(pick, profile, all_picks=all_picks)
    if pick.get("not_in_stock"):
        p2 += (" Note: this shoe is not currently available online. "
               "Check local shops or wait for restocks.")
    if pick.get("tier") == "budget" and pick.get("best_price") is not None:
        price = pick["best_price"]
        p2 = f"At EUR {price:.0f}, this is a strong value pick. {p2}"
    p3 = _para_tradeoffs_v2(pick, profile, all_picks=all_picks)
    return [p1, p2, p3]


__all__ = [
    "flatten_pick",
    "generate_shoe_description_v2",
    "_para_tradeoffs_v2",
]
