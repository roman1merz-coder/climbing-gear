"""Single source of truth for fit-target resolution.

Phase 2 (2026-04-15): weighted-vote aggregation.

Each target (forefoot width, heel volume, forefoot volume) is computed as
the rounded weighted average of a set of votes.

Vote kinds:
  * scan vote          — rank 0/1/2 from a ratio; weight 1 + k * confidence,
                         where confidence = clamp(distance_from_nearest_boundary
                         / band_width, 0, 1) and k = 2. Range [1, 3].
  * heel-depth vote    — one-sided. Fires only when r_depth < 0.028; contributes
                         rank 0 to target_hv with weight 1 + k * confidence where
                         confidence = clamp((0.028 - r_depth) / 0.028, 0, 1).
  * shoe feedback vote — one per shoe-dimension pair, weight 1.00.

Rounding of the weighted average:
  * target_fw, target_fv : ties to wider (half-up).  Reason: pain >> sloppy.
  * target_hv            : ties to narrower (half-down). Reason: empty heels
                           are the most common complaint; a narrow cup is
                           the safer default at 0.5.

This replaces the phase-1 hard shallow-heel override. Shallow heel depth
now contributes a (heavy) vote proportional to how shallow it is. A
crystal-clear shallow scan (r_depth near 0) gives weight ~3, which
overwhelms a single opposing shoe feedback but not two agreeing ones.

Callers:
  - benchmark/matrix_scorer.py          (via resolve_targets_from_user_shoes)
  - benchmark/interp_what_to_look_for.py (via resolve_targets)
  - benchmark/interp_shoe_fit.py        (should migrate — see phase-2 plan)
"""

import math

# ── Classification boundaries (tertile POP, see foot_measure.py) ───────
POP_FOREFOOT_LO = 0.344
POP_FOREFOOT_HI = 0.367
POP_HEEL_WIDTH_LO = 0.228
POP_HEEL_WIDTH_HI = 0.245
POP_SHALLOW_HEEL = 0.028  # heel_depth_ratio threshold for shallow-heel vote

# ── Aggregation dials ──────────────────────────────────────────────────
# k controls how much a crystal-clear scan outweighs a single shoe
# feedback. k=2 means the scan's weight ranges over [1, 3]: a boundary
# scan counts like one shoe, a confident scan like three.
SCAN_WEIGHT_K = 2.0

# ── Label maps ─────────────────────────────────────────────────────────
WIDTH_LABELS = {0: "narrow", 1: "medium", 2: "wide"}
HV_LABELS    = {0: "narrow", 1: "medium", 2: "wide"}
FV_LABELS    = {0: "low",    1: "medium", 2: "high"}


# ── Rank helpers (canonical) ───────────────────────────────────────────
def width_rank(w):
    w = (w or "").lower().strip()
    if w == "narrow": return 0
    if w == "medium": return 1
    if w == "wide":   return 2
    return 1


def heel_vol_rank(v):
    v = (v or "").lower().strip()
    if v in ("low", "narrow"):      return 0
    if v in ("standard", "medium"): return 1
    if v in ("high", "wide"):       return 2
    return 1


def fv_rank(fv):
    fv = (fv or "").lower().strip()
    if fv == "low":                       return 0
    if fv in ("standard", "medium", ""):  return 1
    if fv == "high":                      return 2
    return 1


def rank_label(rank, labels=None):
    labels = labels or WIDTH_LABELS
    return labels.get(rank, "medium")


# ── Scan vote construction ─────────────────────────────────────────────
def _scan_vote(ratio, lo, hi, source, note_template):
    """Build a scan vote from a ratio and its tertile boundaries.

    Returns ``{rank, weight, source, note}`` or ``None`` if ratio is missing.
    Confidence = distance from nearest tertile edge, normalised by band
    width, clamped to [0,1]. Weight = 1 + SCAN_WEIGHT_K * confidence.
    """
    if ratio is None:
        return None
    bw = hi - lo
    if bw <= 0:
        return None
    if ratio < lo:
        rank = 0
    elif ratio <= hi:
        rank = 1
    else:
        rank = 2
    d_nearest = min(abs(ratio - lo), abs(ratio - hi))
    confidence = min(1.0, max(0.0, d_nearest / bw))
    weight = 1.0 + SCAN_WEIGHT_K * confidence
    return {
        "source": source,
        "rank":   rank,
        "weight": weight,
        "note":   note_template.format(ratio=ratio, confidence=confidence),
    }


def _heel_depth_vote(heel_depth):
    """Shallow-heel vote for target_hv. One-sided: only fires when
    heel_depth < POP_SHALLOW_HEEL. Rank is always 0 (narrow); weight
    scales with how far below threshold the depth is."""
    if heel_depth is None or heel_depth >= POP_SHALLOW_HEEL:
        return None
    confidence = min(1.0, max(0.0, (POP_SHALLOW_HEEL - heel_depth) / POP_SHALLOW_HEEL))
    weight = 1.0 + SCAN_WEIGHT_K * confidence
    return {
        "source": "scan_heel_depth",
        "rank":   0,
        "weight": weight,
        "note":   f"heel depth {heel_depth:.3f} < {POP_SHALLOW_HEEL} (shallow, conf {confidence:.2f})",
    }


# ── Feedback votes (one per shoe × dimension) ──────────────────────────
def _shoe_votes(shoes):
    """Extract per-shoe votes for fw/hv/fv.

    Returns three lists of vote dicts. Each vote has weight 1.0.
    Rules match the phase-1 ``_feedback_votes`` logic.
    """
    fw_votes, hv_votes, fv_votes = [], [], []
    for s in shoes or []:
        fit = s.get("fit") or {}
        ff   = fit.get("forefoot", "")
        toes = fit.get("toes", "")
        heel = fit.get("heel", "")
        tag  = f"shoe:{s.get('brand','')} {s.get('model','')}".strip()

        cw  = width_rank(s.get("db_width"))            if s.get("db_width")           else None
        chv = heel_vol_rank(s.get("db_heel_volume"))   if s.get("db_heel_volume")     else None
        cfv = fv_rank(s.get("db_forefoot_volume"))     if s.get("db_forefoot_volume") else None

        # Width vote from forefoot + toes feedback
        if cw is not None:
            r = None; note = None
            if ff == "perfect" and toes in ("perfect", "good", ""):
                r = cw; note = f"forefoot+toes perfect in {rank_label(cw)} shoe"
            elif ff == "perfect" and toes == "squeezed":
                r = cw; note = "toes squeezed (length/toe-form), width unchanged"
            elif ff in ("tight", "squeezed") or toes == "squeezed":
                r = min(2, cw + 1); note = f"forefoot/toes tight in {rank_label(cw)} shoe → wider"
            elif ff in ("loose", "roomy") or toes == "roomy":
                r = max(0, cw - 1); note = f"forefoot loose in {rank_label(cw)} shoe → narrower"
            if r is not None:
                fw_votes.append({"source": tag, "rank": r, "weight": 1.0, "note": note})

        # Heel-volume vote from heel feedback
        if chv is not None:
            r = None; note = None
            if heel == "perfect":
                r = chv; note = f"heel perfect in {rank_label(chv, HV_LABELS)} cup"
            elif heel in ("empty", "loose"):
                r = max(0, chv - 1); note = f"heel empty in {rank_label(chv, HV_LABELS)} cup → narrower"
            elif heel in ("tight", "squeezed"):
                r = min(2, chv + 1); note = f"heel tight in {rank_label(chv, HV_LABELS)} cup → wider"
            if r is not None:
                hv_votes.append({"source": tag, "rank": r, "weight": 1.0, "note": note})

        # Forefoot-volume vote from forefoot feedback
        if cfv is not None:
            r = None; note = None
            if ff == "perfect":
                r = cfv; note = f"forefoot perfect in {rank_label(cfv, FV_LABELS)} vol"
            elif ff == "tight":
                r = min(2, cfv + 1); note = f"forefoot tight in {rank_label(cfv, FV_LABELS)} vol → higher"
            elif ff == "loose":
                r = max(0, cfv - 1); note = f"forefoot loose in {rank_label(cfv, FV_LABELS)} vol → lower"
            if r is not None:
                fv_votes.append({"source": tag, "rank": r, "weight": 1.0, "note": note})

    return fw_votes, hv_votes, fv_votes


# ── Rounding with configurable tie direction ───────────────────────────
def _round_half_up(x):   return int(math.floor(x + 0.5))
def _round_half_down(x): return int(math.ceil(x - 0.5))


def _aggregate(votes, fallback_rank, tie="up"):
    """Aggregate weighted votes into a single rank.

    ``fallback_rank`` is returned when ``votes`` is empty (no scan and no
    feedback), which should be rare in practice.
    ``tie`` is "up" (half-up, favours wider/higher) or "down"
    (half-down, favours narrower/lower).
    """
    if not votes:
        return fallback_rank, 0.0
    num   = sum(v["rank"] * v["weight"] for v in votes)
    denom = sum(v["weight"]               for v in votes)
    if denom == 0:
        return fallback_rank, 0.0
    avg = num / denom
    rounded = _round_half_up(avg) if tie == "up" else _round_half_down(avg)
    rounded = max(0, min(2, rounded))
    return rounded, avg


# ── Main API ───────────────────────────────────────────────────────────
def resolve_targets(profile, shoes):
    """Resolve {width, heel_volume, forefoot_volume} targets.

    Parameters
    ----------
    profile : dict
        Keys read: forefoot_width_ratio, heel_width_ratio, heel_depth_ratio.
        None values suppress the corresponding scan vote.
    shoes : list[dict]
        User's current shoes with fit feedback. Each entry: brand, model,
        db_width, db_heel_volume, db_forefoot_volume, fit.

    Returns
    -------
    dict with keys:
      target_fw, target_hv, target_fv          rounded int ranks 0..2
      avg_fw, avg_hv, avg_fv                   unrounded weighted averages
      votes_fw, votes_hv, votes_fv             list[vote dict] for narrative
      shallow_heel_triggered                   bool — heel_depth vote fired
      # phase-1-compat aliases (legacy callers):
      meas_fw, meas_hv, meas_fv                scan-only ranks
      fb_fw_votes, fb_hv_votes, fb_fv_votes    list[int] — ranks only
      shallow_heel_override                    alias of shallow_heel_triggered
    """
    fw_ratio   = profile.get("forefoot_width_ratio")
    hw_ratio   = profile.get("heel_width_ratio")
    heel_depth = profile.get("heel_depth_ratio")

    scan_fw = _scan_vote(fw_ratio, POP_FOREFOOT_LO, POP_FOREFOOT_HI,
                         "scan_forefoot_width",
                         "forefoot width {ratio:.3f} (conf {confidence:.2f})")
    scan_hv = _scan_vote(hw_ratio, POP_HEEL_WIDTH_LO, POP_HEEL_WIDTH_HI,
                         "scan_heel_width",
                         "heel width {ratio:.3f} (conf {confidence:.2f})")
    depth_hv = _heel_depth_vote(heel_depth)
    # Forefoot volume shares the width scan as its scan signal.
    scan_fv = None
    if scan_fw is not None:
        scan_fv = dict(scan_fw); scan_fv["source"] = "scan_forefoot_width_for_fv"

    fb_fw, fb_hv, fb_fv = _shoe_votes(shoes)

    votes_fw = ([scan_fw] if scan_fw else []) + fb_fw
    votes_hv = ([scan_hv] if scan_hv else []) + \
               ([depth_hv] if depth_hv else []) + fb_hv
    votes_fv = ([scan_fv] if scan_fv else []) + fb_fv

    tgt_fw, avg_fw = _aggregate(votes_fw, fallback_rank=1, tie="up")
    tgt_hv, avg_hv = _aggregate(votes_hv, fallback_rank=1, tie="down")
    tgt_fv, avg_fv = _aggregate(votes_fv, fallback_rank=1, tie="up")

    meas_fw = scan_fw["rank"] if scan_fw else 1
    meas_hv = scan_hv["rank"] if scan_hv else 1
    meas_fv = scan_fv["rank"] if scan_fv else 1

    return {
        "target_fw": tgt_fw,
        "target_hv": tgt_hv,
        "target_fv": tgt_fv,
        "avg_fw": avg_fw,
        "avg_hv": avg_hv,
        "avg_fv": avg_fv,
        "votes_fw": votes_fw,
        "votes_hv": votes_hv,
        "votes_fv": votes_fv,
        "shallow_heel_triggered": depth_hv is not None,
        # phase-1 compatibility keys
        "meas_fw": meas_fw,
        "meas_hv": meas_hv,
        "meas_fv": meas_fv,
        "fb_fw_votes": [v["rank"] for v in fb_fw],
        "fb_hv_votes": [v["rank"] for v in fb_hv],
        "fb_fv_votes": [v["rank"] for v in fb_fv],
        "shallow_heel_override": depth_hv is not None,  # deprecated alias
    }


def resolve_targets_from_user_shoes(profile, user_shoes_with_db):
    """Scorer-shaped adapter.

    ``user_shoes_with_db`` is the list of ``(user_shoe_entry, db_row)``
    tuples that matrix_scorer builds via ``_lookup_user_shoes``.
    """
    normalized = []
    for us, db in user_shoes_with_db or []:
        if not db:
            continue
        normalized.append({
            "brand": us.get("brand", ""),
            "model": us.get("model", ""),
            "db_width": db.get("width"),
            "db_heel_volume": db.get("heel_volume"),
            "db_forefoot_volume": db.get("forefoot_volume"),
            "fit": us.get("fit") or {},
        })
    return resolve_targets(profile, normalized)


__all__ = [
    "POP_FOREFOOT_LO", "POP_FOREFOOT_HI",
    "POP_HEEL_WIDTH_LO", "POP_HEEL_WIDTH_HI",
    "POP_SHALLOW_HEEL",
    "SCAN_WEIGHT_K",
    "WIDTH_LABELS", "HV_LABELS", "FV_LABELS",
    "width_rank", "heel_vol_rank", "fv_rank", "rank_label",
    "resolve_targets", "resolve_targets_from_user_shoes",
]
