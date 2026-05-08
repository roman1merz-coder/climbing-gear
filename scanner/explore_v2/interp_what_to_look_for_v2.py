"""V2 sandbox: 'What to Look For' paragraph generator.

Augments the production v1 generator with two NEW paragraphs that cover
the v2 axes the user can now influence directly:

  * target downturn (from aggressiveness)
  * target asymmetry (from aggressiveness + foot-shape delta)

Design choices
--------------
- **Augment, not replace.** The v1 paragraphs (target width / heel volume,
  shallow heel, forefoot paradox, stiffness adjustment, preference, toe
  form, closure/HVA, tradeoffs, fit context) all keep working unchanged.
  We only insert v2 paragraphs into the sequence. This preserves voice
  and avoids regressing nine paragraph builders that already pass golden
  cases.
- **Insertion point: right after P1 target profile.** The v2 paragraph
  also describes target geometry, so it belongs adjacent to the width/
  heel-volume target paragraph rather than buried at the bottom.
- **Honest sourcing.** target_dt and target_asym come from the same
  ``resolve_targets_v2`` dict the scorer uses, so the user sees exactly
  what we're scoring against.

Sandbox-only — when v2 cuts over, this module folds into
``benchmark/interp_what_to_look_for.py``.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from benchmark.interp_what_to_look_for import (
    generate_what_to_look_for as _v1_generate,
)
from target_resolver_v2 import resolve_targets_v2


# ── Aggressiveness → climbing-context phrasing ─────────────────────────
# Used only for warm prose; the actual targets come from resolve_targets_v2.
_AGG_INTENT = {
    "comfort":    "comfort-focused selection",
    "balanced":   "balanced selection",
    "moderate":   "moderate selection",
    "aggressive": "aggressive selection",
}

_DISCIPLINE_LBL = {
    "boulder":         "bouldering",
    "sport":           "sport climbing",
    "trad_multipitch": "trad/multi-pitch climbing",
}

_ENV_LBL = {
    "indoor":  "indoors",
    "outdoor": "outdoors",
    "both":    "indoors and outdoors",
}

_ROCK_LBL = {
    "granite":   "granite",
    "limestone": "limestone",
    "sandstone": "sandstone",
    "mixed":     "mixed rock",
}


def _ctx_phrase(discipline, environment, rock):
    """Compose a short context phrase: 'sport climbing on limestone',
    'bouldering indoors', 'trad/multi-pitch climbing indoors and outdoors'.
    Falls back to 'your climbing' when nothing useful was provided.
    """
    disc = _DISCIPLINE_LBL.get((discipline or "").lower())
    env  = _ENV_LBL.get((environment or "").lower())
    rk   = _ROCK_LBL.get((rock or "").lower())

    if disc and env == "outdoors" and rk:
        return f"{disc} on {rk}"
    if disc and env:
        return f"{disc} {env}"
    if disc:
        return disc
    return "your climbing"


# ── New paragraphs ─────────────────────────────────────────────────────

def _para_target_shape(target, *, discipline, environment, rock,
                       aggressiveness):
    """P1.5: target downturn + target asymmetry, anchored on the user's
    aggressiveness selection. Always emitted when a target dict is given.

    Format mirrors v1 P1's voice — one or two sentences, prose, no jargon
    beyond the labels the rest of the result page uses.
    """
    if not target or not aggressiveness:
        return None

    dt_lbl   = target.get("target_dt_lbl")
    asym_lbl = target.get("target_asym_lbl")
    if not dt_lbl or not asym_lbl:
        return None

    ctx = _ctx_phrase(discipline, environment, rock)
    intent = _AGG_INTENT.get(aggressiveness, "balanced selection")

    # Article guard: "an aggressive", "a slight", etc.
    dt_art = "an" if dt_lbl[:1].lower() in "aeiou" else "a"

    # Two cases for readable phrasing of the asym/dt pair:
    if asym_lbl == "none" and dt_lbl == "flat":
        shape = "flat shoes with a symmetric last"
    elif asym_lbl == "none":
        shape = f"{dt_art} {dt_lbl} downturn with a symmetric last"
    elif dt_lbl == "flat":
        shape = f"flat shoes with {asym_lbl} asymmetry"
    else:
        shape = f"{dt_art} {dt_lbl} downturn with {asym_lbl} asymmetry"

    return (
        f"For your {intent} in {ctx}, we target {shape}. "
        f"Stiffness, downturn, and asymmetry all anchor on this choice. "
        f"The softer, stiffer, and budget tiers below offer adjacent options "
        f"around the same shape."
    )


def _para_asym_adjustment(target):
    """P1.6: only emit when the foot-shape delta moved asym off baseline.

    Explains why the asymmetry target was bumped up or down from the
    aggressiveness baseline. Mirrors the spec in target_asym_dt.py.
    """
    if not target:
        return None
    delta = target.get("asym_delta", 0)
    if delta == 0:
        return None

    baseline_lbl = target.get("asym_baseline_lbl")
    target_lbl   = target.get("target_asym_lbl")
    has_hva      = bool(target.get("asym_has_hallux"))
    toe          = (target.get("asym_toe_shape") or "").lower()

    if delta > 0:
        # +1: Egyptian foot, no HVA — the longer-big-toe axis matches an
        # asymmetric last better than the baseline would suggest.
        return (
            f"Your Egyptian toe shape (longest at the big toe) lines up with "
            f"a slightly more asymmetric last, so we shift the asymmetry "
            f"target up from {baseline_lbl} to {target_lbl}. The shoe's curve "
            f"follows your foot's natural axis instead of fighting it."
        )
    # delta < 0
    if has_hva:
        return (
            f"Your hallux deviation pushes the asymmetry target down from "
            f"{baseline_lbl} to {target_lbl}. A more symmetric last keeps the "
            f"big-toe joint from being squeezed inward, where an aggressively "
            f"asymmetric shoe would aggravate it."
        )
    # Unusual fallback (shouldn't fire under current rules but safe).
    return (
        f"Based on your foot shape we shift the asymmetry target from "
        f"{baseline_lbl} to {target_lbl}."
    )


# ── Shallow heel transparency note ─────────────────────────────────────

def _para_shallow_heel_transparency(profile):
    """Honest disclaimer for shallow-heel users.

    v1's ``_para_shallow_heel_guidance`` claims we mitigate shallow heels
    by targeting narrow heel volume. That is approximate at best — heel
    *volume* is not heel *depth*. Until we have per-shoe heel-cup depth
    data, we are limited to heel width matching.

    Surface the limitation directly rather than pretending the workaround
    is a fix. Per Roman 2026-04-25.
    """
    heel_depth_cls = (profile.get("heel_depth_class") or "").lower()
    if "shallow" not in heel_depth_cls:
        return None
    return (
        "A heel cup may feel too deep for your shallow heel. We are "
        "working to get heel depth data for shoes so we can give better "
        "recommendations moving forward. Right now the suggestions are "
        "limited to heel width."
    )


# ── v1 paragraph filtering ─────────────────────────────────────────────

# Markers identifying v1's "shallow heel + narrow-volume workaround"
# paragraph. We drop it in favour of the v2 transparency note above.
# We deliberately do NOT drop v1's reverse-insight or anchor variants
# ("your X fits perfectly, prioritize similar Y heel volume") — those
# are real positive signals.
_V1_SHALLOW_DROP_MARKERS = (
    "shallow heel profile means",
    "We target narrow heel volume to minimize the gap",
)


def _drop_v1_shallow_workaround(paragraphs):
    """Strip the v1 paragraph that recommends narrow heel volume as a
    proxy for heel depth. Other v1 shallow-heel paragraphs survive.
    """
    return [
        p for p in paragraphs
        if not any(m in p for m in _V1_SHALLOW_DROP_MARKERS)
    ]


# ── Top-level v2 generator ─────────────────────────────────────────────

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
    """Augmented v2 paragraph list.

    Parameters
    ----------
    profile, shoes : same as v1.
    discipline, environment, rock, aggressiveness : v2 user inputs.
    target : optional pre-computed v2 target dict. If omitted and
             ``aggressiveness`` is given, we build it via
             ``resolve_targets_v2``. Pass it in when the caller has
             already computed it (e.g. matrix_scorer in the same
             pipeline) to avoid duplicate work.

    Returns
    -------
    list[str] — paragraph strings, ready to render.
    """
    if shoes is None:
        shoes = profile.get("shoes", [])

    if target is None and aggressiveness is not None:
        target = resolve_targets_v2(profile, shoes, aggressiveness)

    # Start with v1 paragraphs (preserve voice + golden behaviour),
    # then strip the v1 shallow-heel workaround claim — we replace it
    # with a transparent disclaimer further down.
    paragraphs = _v1_generate(profile, shoes)
    paragraphs = _drop_v1_shallow_workaround(paragraphs)

    # Insertions: P1.5 (target shape) and P1.6 (asym adjustment) right
    # after P1 (the existing target-profile paragraph). If v1 returned
    # zero paragraphs (rare; only on totally empty profiles), we still
    # surface the v2 target shape as the first paragraph.
    insertions = []
    p_shape = _para_target_shape(
        target,
        discipline=discipline,
        environment=environment,
        rock=rock,
        aggressiveness=aggressiveness,
    )
    if p_shape:
        insertions.append(p_shape)

    p_adj = _para_asym_adjustment(target)
    if p_adj:
        insertions.append(p_adj)

    if insertions:
        if paragraphs:
            paragraphs = [paragraphs[0]] + insertions + paragraphs[1:]
        else:
            paragraphs = insertions

    # Append shallow-heel transparency note at the end (closing caveat).
    p_shallow = _para_shallow_heel_transparency(profile)
    if p_shallow:
        paragraphs.append(p_shallow)

    return paragraphs


__all__ = [
    "generate_what_to_look_for_v2",
    # paragraph helpers re-exported for finer-grained sandbox testing
    "_para_target_shape",
    "_para_asym_adjustment",
    "_para_shallow_heel_transparency",
    "_ctx_phrase",
]
