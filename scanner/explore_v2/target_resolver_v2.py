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
    # ── v1 axes (unchanged) ───────────────────────────────────────────
    out = dict(_v1_resolve_targets(profile, shoes))

    # Roman 2026-05-12: the v1 shallow-heel vote always forces target_hv
    # to rank 0 (narrow). That logic conflates heel DEPTH (anteroposterior
    # projection) with heel cup VOLUME (width × depth). For a user with
    # WIDE heel + shallow heel, it drags the target away from the user's
    # actual heel size — even when shoe feedback also says "tight heel,
    # go wider". We rerun the aggregation with the shallow-heel vote
    # removed when the user's heel WIDTH scan says wide (rank 2). The
    # vote stays for narrow/medium heel widths where it's anatomically
    # consistent. Production target_resolver untouched (project memory
    # heel_cup_geometry_future tracks the proper fix: a separate
    # heel_cup_shallow_compatible axis).
    # Roman 2026-05-12: two corrections applied as a single rerun.
    #
    #  (A) Shallow-heel vote always forces rank 0 (narrow). Conflates
    #      heel DEPTH with cup VOLUME. Drop it when scan_heel_width is
    #      wide — the scan there is the stronger signal.
    #
    #  (B) When heel feedback is CONTRADICTORY (some shoes report tight
    #      AND others report empty), the user's lived fit experience is
    #      ambiguous and the simple weighted average dilutes the scan
    #      with noise. We boost the scan vote's weight ×3 in that case
    #      so the scan dominates as the tiebreaker. Single-direction
    #      feedback (all tight, all empty, or only perfect+one side)
    #      keeps the original weighting.
    #
    # Both rules are sandbox-only — production target_resolver untouched.
    # Proper fix tracked in project_heel_cup_geometry_future.md (separate
    # heel_cup_shallow axis on shoes + smarter sizing-artifact detection).
    needs_rerun_A = out.get("shallow_heel_triggered") and out.get("meas_hv") == 2
    heel_fits = [(s.get("fit") or {}).get("heel") for s in (shoes or [])]
    has_tight = any(f in ("tight", "squeezed") for f in heel_fits)
    has_empty = any(f in ("empty", "loose") for f in heel_fits)
    needs_rerun_B = has_tight and has_empty
    if needs_rerun_A or needs_rerun_B:
        from benchmark.target_resolver import (
            _scan_vote, _shoe_votes, _aggregate, _heel_depth_vote,
            POP_HEEL_WIDTH_LO, POP_HEEL_WIDTH_HI,
        )
        scan_hv = _scan_vote(
            profile.get("heel_width_ratio"),
            POP_HEEL_WIDTH_LO, POP_HEEL_WIDTH_HI,
            "scan_heel_width",
            "heel width {ratio:.3f} (conf {confidence:.2f})",
        )
        # Drop the depth vote only when the wide-heel guard fires (A);
        # otherwise leave it in (B alone keeps the production behaviour).
        depth_hv = None if needs_rerun_A else _heel_depth_vote(
            profile.get("heel_depth_ratio")
        )
        _, fb_hv, _ = _shoe_votes(shoes or [])
        if needs_rerun_B and scan_hv is not None:
            scan_hv = dict(scan_hv)
            scan_hv["weight"] *= 3.0
            scan_hv["note"] += "; scan boosted ×3 (contradictory heel feedback)"
        votes_hv = ([scan_hv]  if scan_hv  else []) + \
                   ([depth_hv] if depth_hv else []) + fb_hv
        tgt_hv, avg_hv = _aggregate(votes_hv, fallback_rank=1, tie="down")
        out["target_hv"] = tgt_hv
        out["avg_hv"]    = avg_hv
        out["votes_hv"]  = votes_hv
        if needs_rerun_A: out["shallow_heel_suppressed_for_wide_heel"] = True
        if needs_rerun_B: out["scan_boosted_for_contradictory_heel_fb"] = True

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
