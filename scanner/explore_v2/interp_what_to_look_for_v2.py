"""V2 'What to Look For' generator -- locked 3-paragraph design.

Roman 2026-04-30 confirmed the structure:

  P1 = fit target (toe form + forefoot width + heel width). One sentence.
  P2 = use-case target (discipline phrase + closure_pref + downturn +
       asymmetry + ankle for trad). One sentence.
  P3 = caveats (shallow heel disclaimer + soft-mask warning + inconsistent
       feedback note + always-closing tier hint). 1-4 conditional clauses.

Replaces the v1 wrapping approach (~30 explainer paragraph variants) with
a clean 3-paragraph generator that mirrors what the scorer actually
computes.

Sandbox-only.  When v2 cuts over to production, this module folds back
into ``benchmark/interp_what_to_look_for.py``.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from target_resolver_v2 import resolve_targets_v2


# ─── Discipline phrase ────────────────────────────────────────────────

_DISCIPLINE_LBL = {
    "boulder":         "bouldering",
    "sport":           "sport climbing",
    "trad_multipitch": "trad and multipitch",
}

def _discipline_phrase(discipline, environment, rock):
    """Builds 'bouldering outdoors on sandstone' / 'sport climbing indoors'
    / 'trad and multipitch both indoors and outdoors' style phrase."""
    disc = _DISCIPLINE_LBL.get((discipline or "").lower(), discipline or "your climbing")
    env = (environment or "").lower()
    rk = (rock or "").strip().lower() or None

    if env == "indoor":
        return f"{disc} indoors"
    if env == "outdoor":
        return f"{disc} outdoors on {rk}" if rk else f"{disc} outdoors"
    if env == "both":
        return f"{disc} both indoors and outdoors"
    return disc


# ─── Closure preference (discipline ∩ instep-allowed) ──────────────────

_DISCIPLINE_CLOSURE_PREF = {
    "boulder":         ["slipper", "velcro"],
    "sport":           ["velcro", "lace"],
    "trad_multipitch": ["lace"],
}


def _closure_pref(discipline, instep_class):
    """Returns (closure_phrase, caveat_str_with_leading_space).

    Anatomy exclusions:
      - low instep  -> exclude pure slippers
      - high instep -> exclude pure slippers
      - normal instep -> no exclusions

    Roman 2026-05-08: dropped the high-instep "double-velcros" /
    "single-strap velcros" distinction. The shoes table only carries
    closure=velcro/lace/slipper — single vs double strap isn't a tracked
    field, so recommending one over the other was inventing data.
    Both extreme insteps now exclude slippers only.
    """
    pref = _DISCIPLINE_CLOSURE_PREF.get((discipline or "").lower(), [])
    instep = (instep_class or "").lower()

    is_low = "low instep" in instep or instep == "low"
    is_high = "high instep" in instep or instep == "high"

    excluded = []
    parts = []
    for c in pref:
        if c == "slipper":
            if is_low or is_high:
                excluded.append("pure slippers")
                continue
            parts.append("slippers")
        elif c == "velcro":
            parts.append("velcros")
        elif c == "lace":
            parts.append("lace-ups")

    # Edge case: every preferred closure was excluded -> fall back to lace-ups
    if not parts:
        parts = ["lace-ups"]

    if len(parts) == 1:
        phrase = parts[0]
    else:
        phrase = " or ".join(parts)

    if not excluded:
        return phrase, ""

    instep_short = "low" if is_low else "high" if is_high else "normal"
    if len(excluded) == 1:
        caveat = f" (avoiding {excluded[0]} due to your {instep_short} instep)"
    else:
        caveat = (f" (avoiding {' and '.join(excluded)} "
                  f"due to your {instep_short} instep)")
    return phrase, caveat


# ─── Stiffness vocabulary (5 levels) ──────────────────────────────────

def _stiffness_word_5(stiff_target):
    """Roman 2026-04-30: very soft / soft / balanced-stiffness / stiff /
    very stiff. (5 levels, replaces the 7-level vocab used in shoe card
    P1 description.)

    Roman 2026-05-01 audit S9: the "balanced" bin uses the noun "stiffness"
    rather than an adjective like the other 4 bins, so used as an attributive
    modifier ("balanced stiffness double-velcros") it parses as
    "balanced [stiffness double-velcros]". Hyphenating it
    ("balanced-stiffness double-velcros") makes the compound modifier
    explicit. The other 4 levels are already adjectives and need no change.
    """
    if stiff_target is None:
        return "balanced-stiffness"
    s = float(stiff_target)
    if s < 0.25: return "very soft"
    if s < 0.40: return "soft"
    if s < 0.60: return "balanced-stiffness"
    if s < 0.75: return "stiff"
    return "very stiff"


# ─── Downturn / asymmetry labels ──────────────────────────────────────

_DT_LABELS = {
    "flat":       "flat profile",
    "slight":     "slight downturn",
    "moderate":   "moderate downturn",
    "aggressive": "aggressive downturn",
}

_ASYM_LABELS = {
    "none":     "no asymmetry",
    "slight":   "slight asymmetry",
    "moderate": "moderate asymmetry",
    "strong":   "strong asymmetry",
}


def _downturn_label(target_dt_lbl):
    if not target_dt_lbl:
        return "moderate downturn"
    return _DT_LABELS.get(target_dt_lbl.lower(), f"{target_dt_lbl} downturn")


def _asymmetry_label(target_asym_lbl):
    if not target_asym_lbl:
        return "moderate asymmetry"
    return _ASYM_LABELS.get(target_asym_lbl.lower(), f"{target_asym_lbl} asymmetry")


# ─── Asymmetry caveat (with tautology guard) ──────────────────────────

def _asym_caveat(target, profile):
    """Returns ' (shifted higher ...)' or ' (shifted lower ...)' or ''.

    Tautology guard kept (Roman 2026-04-27): caveat fires ONLY when
    baseline_lbl != target_lbl. So 'aggressive baseline = strong asym,
    Egyptian + no HVA wants +1 capped at strong' -> labels match -> no
    caveat (Roman's actual case)."""
    if not target:
        return ""
    delta = target.get("asym_delta", 0)
    if delta == 0:
        return ""

    baseline_lbl = target.get("asym_baseline_lbl")
    target_lbl   = target.get("target_asym_lbl")
    if baseline_lbl and target_lbl and baseline_lbl == target_lbl:
        return ""

    if delta > 0:
        # +1 step: Egyptian + no HVA per current rules
        return " (shifted higher to match your Egyptian toe shape)"

    hva = (profile.get("hallux_valgus_class") or "").lower()
    if hva in ("mild", "pronounced"):
        return f" (shifted lower to accommodate your {hva} hallux valgus)"
    # Fallback (shouldn't fire under current rules)
    return f" (shifted lower from {baseline_lbl} to {target_lbl})"


# ─── Ankle clause (trad/multipitch only) ──────────────────────────────

def _ankle_clause(discipline):
    if (discipline or "").lower() == "trad_multipitch":
        return ", with ankle protection for trad/multipitch wear"
    return ""


# ─── Width-rank to label ──────────────────────────────────────────────

_RANK_LABELS = {0: "narrow", 1: "normal", 2: "wide"}


def _rank_label(rank, default="normal"):
    if rank is None:
        return default
    return _RANK_LABELS.get(int(rank), default)


# ─── P1: fit target ───────────────────────────────────────────────────

def _build_p1(profile, target):
    """One sentence stating the final fit target after any shoe-feedback
    adjustment is BAKED IN.  No '(adjusted from X)' footnote per Roman
    2026-04-30 (the conclusion is what matters)."""
    toe = (profile.get("toe_shape") or "egyptian").capitalize()
    fw  = _rank_label(target.get("target_fw") if target else None, "normal")
    hv  = _rank_label(target.get("target_hv") if target else None, "normal")
    return (
        f"Based on your scan and current shoe fit, we target shoes with "
        f"{toe} toe form, {fw} forefoot width, and {hv} heel width."
    )


# ─── P2: use-case target ──────────────────────────────────────────────

def _build_p2(profile, target, *, discipline, environment, rock,
              aggressiveness):
    if not aggressiveness:
        return None  # no V2 inputs -> P2 doesn't fire
    disc_phrase = _discipline_phrase(discipline, environment, rock)
    closure_phrase, closure_caveat = _closure_pref(
        discipline, profile.get("instep_height_class"))
    stiffness   = _stiffness_word_5(target.get("stiff_target") if target else None)
    downturn    = _downturn_label(target.get("target_dt_lbl") if target else None)
    asymmetry   = _asymmetry_label(target.get("target_asym_lbl") if target else None)
    asym_cav    = _asym_caveat(target, profile)
    ankle       = _ankle_clause(discipline)
    # Article guard: "an aggressive" (vowel sound), "a balanced" / "a comfort"
    # / "a moderate" (consonant). Roman 2026-05-01 audit S1.
    article = "an" if aggressiveness[:1].lower() in "aeiou" else "a"
    return (
        f"Given your preference for {disc_phrase} and {article} {aggressiveness} "
        f"fit, we prioritize {stiffness} {closure_phrase}{closure_caveat} "
        f"with {downturn} and {asymmetry}{asym_cav}{ankle}."
    )


# ─── P3 helpers ───────────────────────────────────────────────────────

_SHALLOW_HEEL_CLAUSE = (
    "Note: data on shoe heel depth is unfortunately not widely available. "
    "We're working on extracting this data from shoe scans, but for now "
    "the recommendations match heel width only."
)

_SOFT_MASK_CLAUSE = (
    "Your current shoes are soft enough to forgive some mismatch; "
    "stiffer recommendations may feel different at the same target geometry."
)

_INCONSISTENT_CLAUSE = (
    "Your shoe feedback was inconsistent across models. "
    "We weight the most consistent signal."
)

_TIER_CLOSING = (
    "The softer, stiffer, and budget tiers below offer alternative "
    "options around this target."
)


def _heel_classes_disagree(profile_class, shoe_class):
    """True if user heel width and shoe heel volume sit on opposite ends
    of the spectrum (narrow vs wide)."""
    p = (profile_class or "").lower()
    s = (shoe_class or "").lower()
    p_narrow = "narrow" in p
    p_wide   = "wide" in p
    s_narrow = "narrow" in s
    s_wide   = "wide" in s
    return (p_narrow and s_wide) or (p_wide and s_narrow)


def _detect_soft_mask(profile, shoes):
    """Soft-mask: any user shoe with db_stiffness < 0.4 AND heel fit
    perfect AND user heel class extreme that contradicts the shoe's heel
    volume rating.  Signals the user that softness is hiding a fit risk
    visible only in stiffer recommendations."""
    user_heel = profile.get("heel_width_class")
    if not user_heel:
        return False
    for s in (shoes or []):
        try:
            stiff = float(s.get("db_stiffness") or 0)
        except (ValueError, TypeError):
            continue
        if stiff >= 0.4:
            continue
        fit = s.get("fit") or {}
        if fit.get("heel") != "perfect":
            continue
        if _heel_classes_disagree(user_heel, s.get("db_heel_volume")):
            return True
    return False


def _detect_inconsistent(shoes):
    """Inconsistent feedback: same dim has both extremes across the user's
    shoes (e.g. heel empty in one, tight in another)."""
    if not shoes or len(shoes) < 2:
        return False
    pairs = (
        ("heel",     {"empty"},    {"tight"}),
        ("toes",     {"squeezed"}, {"roomy"}),
        ("forefoot", {"tight"},    {"loose"}),
    )
    for dim, pos, neg in pairs:
        ratings = [(s.get("fit") or {}).get(dim) for s in shoes]
        ratings = [r for r in ratings if r]
        if any(r in pos for r in ratings) and any(r in neg for r in ratings):
            return True
    return False


def _build_p3(profile, shoes):
    """Returns a list of one or more paragraph strings.

    The closing tier-hint is always included; conditional caveats prepend
    when their triggers fire. Roman 2026-05-01 audit S20: when multiple
    caveats fire, render as separate paragraphs instead of one dense run-on
    so the user can scan them.
    """
    parts = []
    heel_depth = (profile.get("heel_depth_class") or "").lower()
    if "shallow" in heel_depth:
        parts.append(_SHALLOW_HEEL_CLAUSE)

    if _detect_soft_mask(profile, shoes):
        parts.append(_SOFT_MASK_CLAUSE)

    if _detect_inconsistent(shoes):
        parts.append(_INCONSISTENT_CLAUSE)

    parts.append(_TIER_CLOSING)
    return parts


# ─── Top-level generator ──────────────────────────────────────────────

def generate_what_to_look_for_v2(
    profile,
    shoes=None,
    *,
    discipline=None,
    environment=None,
    rock=None,
    aggressiveness=None,
    target=None,
):
    """3-paragraph generator. Locked design Roman 2026-04-30.

    Returns list of 1-3 paragraphs depending on whether V2 inputs are
    present. P1 always fires (when a target dict is available). P2
    fires when V2 wizard inputs are present. P3 always fires (closing
    tier hint is unconditional).
    """
    if shoes is None:
        shoes = profile.get("shoes", [])

    if target is None and aggressiveness is not None:
        target = resolve_targets_v2(profile, shoes, aggressiveness)
    if target is None:
        target = {}

    paragraphs = []

    p1 = _build_p1(profile, target)
    if p1:
        paragraphs.append(p1)

    p2 = _build_p2(profile, target, discipline=discipline,
                   environment=environment, rock=rock,
                   aggressiveness=aggressiveness)
    if p2:
        paragraphs.append(p2)

    # _build_p3 returns a LIST of paragraphs (Roman 2026-05-01 audit S20:
    # multi-clause caveats render as separate paragraphs, not one run-on).
    p3_parts = _build_p3(profile, shoes)
    if p3_parts:
        paragraphs.extend(p3_parts)

    return paragraphs


__all__ = [
    "generate_what_to_look_for_v2",
    "_discipline_phrase",
    "_closure_pref",
    "_stiffness_word_5",
    "_downturn_label",
    "_asymmetry_label",
    "_asym_caveat",
    "_ankle_clause",
    "_build_p1",
    "_build_p2",
    "_build_p3",
]
