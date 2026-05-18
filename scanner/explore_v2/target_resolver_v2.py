"""V2 target resolver (sandbox).

Single source of truth for the FIVE targets the v2 scorer scores against:
  - target_fw  (forefoot width)        : unchanged from v1, weighted-vote aggregation
  - target_hv  (heel volume)           : unchanged from v1
  - target_fv  (forefoot volume)       : unchanged from v1
  - target_asym (asymmetry)            : NEW. aggressiveness baseline + foot-shape delta
  - target_dt   (downturn)             : NEW. pure aggressiveness lookup

Composition strategy
--------------------
We **delegate** to the production resolver in ``benchmark/target_resolver.py``
for the three width/volume axes — they're already battle-tested and v2 makes
no changes to their derivation. The fit-feedback votes that resolver consumes
are intentionally retained: per project_v2_shoe_scoring.md the v2 scorer no
longer double-counts fit feedback in its scoring rules, so the target itself
is the only place that signal lives. Removing it here would lose information.

For the two new axes we use the locked sandbox module
``scanner/explore_v2/target_asym_dt.py``.

Why a wrapper, not an in-place edit of production
-------------------------------------------------
Sandbox-only rule (see feedback_v2_sandbox_only memory). When v2 cuts over,
this file's contents fold into ``benchmark/target_resolver.py`` and the
sandbox copy is deleted.

Inputs in v2 (vs v1)
--------------------
v1 needed: profile{fw_ratio, hw_ratio, heel_depth_ratio} + shoes
v2 also needs:
  * profile.toe_shape          (egyptian | greek | roman | None)
  * profile.hva_offset_ratio   (float | None)
  * aggressiveness             (comfort | balanced | moderate | aggressive)

The first two come from the existing scan pipeline (already populated on
foot_scan_fits). ``aggressiveness`` is the new user input from
schema_v2_inputs.sql.
"""

import sys
from pathlib import Path

# v1 production resolver (unchanged for fw/hv/fv)
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from benchmark.target_resolver import (
    resolve_targets as _v1_resolve_targets,
    WIDTH_LABELS, HV_LABELS, FV_LABELS,
    POP_FOREFOOT_LO, POP_FOREFOOT_HI,
    POP_HEEL_WIDTH_LO, POP_HEEL_WIDTH_HI,
    POP_SHALLOW_HEEL,
    SCAN_WEIGHT_K,
)

# v2 sandbox: asym + downturn
sys.path.insert(0, str(Path(__file__).resolve().parent))
from target_asym_dt import (
    resolve_target_asym, resolve_target_downturn,
    ASYM_LABELS, DOWNTURN_LABELS,
    HVA_HAS,
)


# ── Main API ───────────────────────────────────────────────────────────
_LOOSE_RATINGS = ("loose", "empty", "roomy")
_TIGHT_RATINGS = ("tight", "squeezed")
_DOWNSIZE_ARTIFACT_THRESHOLD = 0.5  # matches "typical" band in _relative_downsize


# Roman 2026-05-12 (T1): scan-vote thresholds for the V2 sandbox. Mirror
# the V2 5-tier classifier in interp_foot_shape_v2.POP_5TIER so the
# resolver target stays in sync with what the slider + §1 prose show.
# Values are 16.7/33.3/66.7/83.3 percentiles from n=378 production scans.
# The 3-rank target (narrow/medium/wide) folds 5-tier as:
#    rank 0 = very_low + low  (value < lo)
#    rank 1 = mid             (lo <= value < hi)
#    rank 2 = high + very_high (value >= hi)
_V2_SCAN_BOUNDS = {
    "forefoot_width_ratio": {"lo": 0.343, "hi": 0.367},
    "heel_width_ratio":     {"lo": 0.228, "hi": 0.245},
}


def _scan_vote_v2(ratio, ratio_key, source, note_template):
    """V2-aligned scan vote: rank 0 if value < lo, rank 1 if lo <= value < hi,
    rank 2 if value >= hi. Strict-less-at-hi matches the 5-tier classifier
    so target resolver stays consistent with the slider/§1 prose.

    Confidence + weight follow the v1 formula, just with V2 boundaries.
    """
    if ratio is None or ratio_key not in _V2_SCAN_BOUNDS:
        return None
    p = _V2_SCAN_BOUNDS[ratio_key]
    lo, hi = p["lo"], p["hi"]
    bw = hi - lo
    if bw <= 0:
        return None
    if ratio < lo:
        rank = 0
    elif ratio < hi:                # strict < to align with 5-tier mid range
        rank = 1
    else:
        rank = 2
    d_nearest = min(abs(ratio - lo), abs(ratio - hi))
    confidence = min(1.0, max(0.0, d_nearest / bw))
    from benchmark.target_resolver import SCAN_WEIGHT_K
    weight = 1.0 + SCAN_WEIGHT_K * confidence
    return {
        "source": source,
        "rank":   rank,
        "weight": weight,
        "note":   note_template.format(ratio=ratio, confidence=confidence),
    }


def _scrub_sizing_artifacts(shoes, street, profile=None):
    """Blank per-shoe-per-dim fit ratings that are explained by either
    the user's downsize choice OR an anatomical impossibility given
    the cup spec + scan.

    Rule A (sizing artifact, applies to every dim):
      - loose-direction rating in an oversized shoe  -> artifact, blank.
      - tight-direction rating in an aggressively
        downsized shoe                                -> artifact, blank.

    Rule B (directional-impossibility artifact, applies to heel +
    forefoot where shoe spec ranks are comparable to scan ranks):
      - loose-direction rating when shoe cup is at LEAST one rank
        NARROWER than the user's scanned dim → impossible (a narrow
        cup on a wide foot must feel tight, not loose).
      - tight-direction rating when shoe cup is at LEAST one rank
        WIDER than the user's scanned dim → impossible (a wide cup
        on a narrow foot can't feel tight).

    Returns a deep-enough copy of the shoes list with offending
    fit-dim values replaced by "" (suppresses vote generation in
    benchmark.target_resolver._shoe_votes).
    """
    if not shoes:
        return shoes or []
    from interp_shoe_fit_v2 import _relative_downsize

    # User dim ranks (0=narrow, 1=medium, 2=wide). None when scan missing.
    user_hv_rank = _user_dim_rank(profile, "heel_width_ratio")  if profile else None
    user_fw_rank = _user_dim_rank(profile, "forefoot_width_ratio") if profile else None

    out = []
    for s in shoes:
        size  = s.get("size_eu")
        brand = s.get("brand")
        fit   = dict(s.get("fit") or {})

        # Rule A: sizing artifact
        if street is not None and size is not None and brand:
            try:
                _, rel, _ = _relative_downsize(float(street), float(size), brand)
            except (TypeError, ValueError):
                rel = 0.0
            if rel <= -_DOWNSIZE_ARTIFACT_THRESHOLD:
                for dim, rating in list(fit.items()):
                    if rating in _LOOSE_RATINGS:
                        fit[dim] = ""
            elif rel >= _DOWNSIZE_ARTIFACT_THRESHOLD:
                for dim, rating in list(fit.items()):
                    if rating in _TIGHT_RATINGS:
                        fit[dim] = ""

        # Rule B: directional-impossibility artifact (loose-in-narrow-cup,
        # tight-in-wide-cup).
        # Rule C (Roman 2026-05-16): perfect rating in a cup that's ≥2
        # ranks off from user's scan dim. Anatomically a wide cup can't
        # feel "perfect" on a narrow foot, nor a narrow cup on a wide
        # foot. Silent filter — no user-facing disclosure (reads odd).
        for dim, user_rank, db_key in (("heel",     user_hv_rank, "db_heel_volume"),
                                       ("forefoot", user_fw_rank, "db_width")):
            if user_rank is None: continue
            cup_rank = _cup_rank(s.get(db_key))
            if cup_rank is None: continue
            rating = fit.get(dim)
            # Rule B
            if cup_rank < user_rank and rating in _LOOSE_RATINGS:
                fit[dim] = ""
            elif cup_rank > user_rank and rating in _TIGHT_RATINGS:
                fit[dim] = ""
            # Rule C: perfect at ≥2 rank diff
            elif rating == "perfect" and abs(user_rank - cup_rank) >= 2:
                fit[dim] = ""

        new_s = dict(s)
        new_s["fit"] = fit
        out.append(new_s)
    return out


def _user_dim_rank(profile, ratio_key):
    """Return the user's 3-rank for the given dim, using V2 5-tier
    boundaries (lo/hi). 0 narrow / 1 medium / 2 wide. None if missing."""
    if not profile: return None
    p = _V2_SCAN_BOUNDS.get(ratio_key)
    val = profile.get(ratio_key)
    if not p or val is None: return None
    if val < p["lo"]: return 0
    if val < p["hi"]: return 1
    return 2


_CUP_RANK_MAP = {"narrow": 0, "low": 0,
                 "medium": 1, "standard": 1,
                 "wide":   2, "high":     2}


def _cup_rank(label):
    """Map a shoe spec label (heel_volume / width / forefoot_volume) to
    a 0/1/2 rank. None if the label is missing or unrecognised."""
    if not label: return None
    return _CUP_RANK_MAP.get(str(label).strip().lower())


def resolve_targets_v2(profile, shoes, aggressiveness):
    """Resolve all five v2 targets in one call.

    Parameters
    ----------
    profile : dict
        Read keys:
          forefoot_width_ratio, heel_width_ratio, heel_depth_ratio  (v1)
          toe_shape, hva_offset_ratio                                (v2)
        Missing keys degrade gracefully (the underlying resolvers handle
        None; missing toe_shape falls through to the "Greek/Roman + no HVA"
        zero-delta branch).
    shoes : list[dict]
        Same shape as v1: brand, model, db_width, db_heel_volume,
        db_forefoot_volume, fit.
    aggressiveness : str
        One of: comfort | balanced | moderate | aggressive.
        Drives baseline asym + dt; defaults to "balanced" inside the
        underlying resolvers if unrecognised.

    Returns
    -------
    dict — superset of the v1 return shape, with these added:
      target_asym, target_asym_lbl
      target_dt,   target_dt_lbl
      asym_baseline_rank, asym_baseline_lbl, asym_delta, asym_reason
      asym_has_hallux, asym_toe_shape
      aggressiveness                 (echoed back for traceability)

    All v1 keys (target_fw, target_hv, target_fv, votes_*, etc.) are
    preserved verbatim — downstream callers that only care about width/
    volume keep working.
    """
    # ── Sizing-artifact filter (Roman 2026-05-12) ────────────────────
    # A feedback rating is a SIZING ARTIFACT when the user's downsize
    # choice (vs brand typical) fully explains it:
    #
    #   loose / empty / roomy in a shoe sized > typical for the brand
    #     → naturally loose because the shoe is oversized for the user's
    #       expected fit, NOT because the cup is too big.
    #
    #   tight / squeezed in a shoe sized < typical for the brand
    #     → naturally tight because the user downsized aggressively,
    #       NOT because the cup is too small.
    #
    # Threshold ±0.5 sizes from brand typical matches the existing
    # "typical" band in interp_shoe_fit_v2._relative_downsize. Applied
    # to all three dims (heel / forefoot / toes) — blanking the
    # offending dim per shoe BEFORE the v1 resolver runs so the
    # artifact never generates a vote. Sandbox-only.
    street = profile.get("street_size_eu")
    clean_shoes = _scrub_sizing_artifacts(shoes, street, profile=profile)
    out = dict(_v1_resolve_targets(profile, clean_shoes))

    # ── T1: V2-aligned scan votes for target_fw and target_hv ────────
    # Production _scan_vote uses ratio <= hi for the mid rank, V2 5-tier
    # uses strict <. They disagree at exactly the hi boundary
    # (forefoot=0.367, heel=0.245) — the slider/§1 says "wide" but the
    # target says "normal". Rerun aggregation with V2-aligned scan
    # votes so target stays in sync with what the user sees.
    from benchmark.target_resolver import _shoe_votes, _aggregate, _heel_depth_vote
    _, fb_hv_clean, _ = _shoe_votes(clean_shoes or [])
    fb_fw_clean, _, fb_fv_clean = _shoe_votes(clean_shoes or [])

    scan_fw_v2 = _scan_vote_v2(
        profile.get("forefoot_width_ratio"), "forefoot_width_ratio",
        "scan_forefoot_width",
        "forefoot width {ratio:.3f} (conf {confidence:.2f}, V2 5-tier)",
    )
    scan_hv_v2 = _scan_vote_v2(
        profile.get("heel_width_ratio"), "heel_width_ratio",
        "scan_heel_width",
        "heel width {ratio:.3f} (conf {confidence:.2f}, V2 5-tier)",
    )
    depth_hv = _heel_depth_vote(profile.get("heel_depth_ratio"))
    # Forefoot volume shares the forefoot-width scan signal in v1; mirror.
    scan_fv_v2 = (dict(scan_fw_v2, source="scan_forefoot_width_for_fv")
                  if scan_fw_v2 else None)

    votes_fw_v2 = ([scan_fw_v2] if scan_fw_v2 else []) + fb_fw_clean
    votes_hv_v2 = ([scan_hv_v2] if scan_hv_v2 else []) + \
                  ([depth_hv]   if depth_hv   else []) + fb_hv_clean
    votes_fv_v2 = ([scan_fv_v2] if scan_fv_v2 else []) + fb_fv_clean

    tgt_fw_v2, avg_fw_v2 = _aggregate(votes_fw_v2, fallback_rank=1, tie="up")
    tgt_hv_v2, avg_hv_v2 = _aggregate(votes_hv_v2, fallback_rank=1, tie="down")
    tgt_fv_v2, avg_fv_v2 = _aggregate(votes_fv_v2, fallback_rank=1, tie="up")

    out["target_fw"] = tgt_fw_v2; out["avg_fw"] = avg_fw_v2; out["votes_fw"] = votes_fw_v2
    out["target_hv"] = tgt_hv_v2; out["avg_hv"] = avg_hv_v2; out["votes_hv"] = votes_hv_v2
    out["target_fv"] = tgt_fv_v2; out["avg_fv"] = avg_fv_v2; out["votes_fv"] = votes_fv_v2
    if scan_fw_v2: out["meas_fw"] = scan_fw_v2["rank"]
    if scan_hv_v2: out["meas_hv"] = scan_hv_v2["rank"]
    if scan_fv_v2: out["meas_fv"] = scan_fv_v2["rank"]

    # ── Shallow-heel vote misfire for wide-heel users ────────────────
    # The v1 shallow_heel vote always forces target_hv to rank 0
    # (narrow). It conflates heel DEPTH (anteroposterior projection)
    # with heel cup VOLUME (width × depth). For a user with a wide
    # heel + shallow heel, that drags target_hv away from the user's
    # actual heel size. Drop the depth vote when scan_heel_width says
    # wide (rank 2); keep it for narrow / medium heel widths where it
    # is anatomically consistent. Long-term fix tracked in
    # project_heel_cup_geometry_future.md (separate heel_cup_shallow
    # axis on shoes).
    if out.get("shallow_heel_triggered") and out.get("meas_hv") == 2:
        from benchmark.target_resolver import (
            _scan_vote, _shoe_votes, _aggregate,
            POP_HEEL_WIDTH_LO, POP_HEEL_WIDTH_HI,
        )
        scan_hv = _scan_vote(
            profile.get("heel_width_ratio"),
            POP_HEEL_WIDTH_LO, POP_HEEL_WIDTH_HI,
            "scan_heel_width",
            "heel width {ratio:.3f} (conf {confidence:.2f})",
        )
        _, fb_hv, _ = _shoe_votes(clean_shoes or [])
        votes_hv = ([scan_hv] if scan_hv else []) + fb_hv
        tgt_hv, avg_hv = _aggregate(votes_hv, fallback_rank=1, tie="down")
        out["target_hv"] = tgt_hv
        out["avg_hv"]    = avg_hv
        out["votes_hv"]  = votes_hv
        out["shallow_heel_suppressed_for_wide_heel"] = True

    # ── v2 axes ───────────────────────────────────────────────────────
    toe_shape = profile.get("toe_shape")
    hva       = profile.get("hva_offset_ratio")

    asym = resolve_target_asym(aggressiveness, toe_shape, hva)
    dt   = resolve_target_downturn(aggressiveness)

    out.update({
        "target_asym":        asym["target_asym"],
        "target_asym_lbl":    asym["target_asym_lbl"],
        "asym_baseline_rank": asym["baseline_rank"],
        "asym_baseline_lbl":  asym["baseline_lbl"],
        "asym_delta":         asym["delta"],
        "asym_reason":        asym["reason"],
        "asym_has_hallux":    asym["has_hallux"],
        "asym_toe_shape":     asym["toe_shape"],
        "target_dt":          dt["target_dt"],
        "target_dt_lbl":      dt["target_dt_lbl"],
        "aggressiveness":     aggressiveness,
    })
    return out


def resolve_targets_v2_from_user_shoes(profile, user_shoes_with_db, aggressiveness):
    """Scorer-shaped adapter, mirrors v1's resolve_targets_from_user_shoes.

    ``user_shoes_with_db`` is the (user_shoe_entry, db_row) tuple list
    that matrix_scorer builds. We normalise it the same way v1 does
    before calling resolve_targets_v2.
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
    return resolve_targets_v2(profile, normalized, aggressiveness)


__all__ = [
    # re-exports for convenience
    "WIDTH_LABELS", "HV_LABELS", "FV_LABELS",
    "ASYM_LABELS", "DOWNTURN_LABELS",
    "POP_FOREFOOT_LO", "POP_FOREFOOT_HI",
    "POP_HEEL_WIDTH_LO", "POP_HEEL_WIDTH_HI",
    "POP_SHALLOW_HEEL",
    "SCAN_WEIGHT_K", "HVA_HAS",
    # API
    "resolve_targets_v2",
    "resolve_targets_v2_from_user_shoes",
]
