#!/usr/bin/env python3
"""V2 scanner pipeline - shared results builder.

Single source of truth for turning a foot_scan_fits row plus the four V2
preference inputs (discipline / environment / rock_type / aggressiveness)
into the {interpretation, recommendations} payload that gets written to
the DB and rendered by ScanResult.jsx.

Used by:
  * scan_worker.generate_recommendations  (production worker, V2 path)
  * explore_v2/golden/golden_run.py        (regression gate harness)
  * render_v2_review_static.py             (debug HTML harness)

Extracted from render_v2_review_static.main() at V2 go-live (2026-05-20)
so the production worker and the review/golden harnesses can never drift.

This module is PURE: it takes already-loaded data (shoes_db, price_rows,
brand_sizing) as arguments and never touches Supabase itself, so it has
no import-time environment dependency.
"""
import json
import math
import sys
from pathlib import Path

# explore_v2/ (siblings) and scanner/ (for benchmark.*) on the path.
_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parent
for _p in (str(_HERE), str(_ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from target_resolver_v2 import (resolve_targets_v2, _scrub_sizing_artifacts,
                                _user_dim_rank, _cup_rank)
from matrix_scorer_v2 import (compute_use_case_target, assemble_tiers,
                              best_price_at_size)
from combinations_top5 import DOWNTURN_ORDER, ASYM_ORDER
from interp_what_to_look_for_v2 import generate_what_to_look_for_v2
from interp_shoe_desc_v2 import flatten_pick, generate_shoe_description_v2
from interp_foot_shape_v2 import generate_foot_shape
from interp_shoe_fit_v2 import generate_shoe_fit


# ---------------------------------------------------------------------
# Profile assembly (inlined from check_full_v2_matrix.py so this module
# stays pure - check_full_v2_matrix raises at import time when no
# Supabase key is set).
# ---------------------------------------------------------------------

def lookup_db(shoes_db, brand, model):
    if not brand or not model:
        return None
    key = f"{(brand or '').strip().lower()} {(model or '').strip().lower()}"
    for s in shoes_db:
        k = f"{s['brand'].strip().lower()} {s['model'].strip().lower()}"
        if k == key:
            return s
    for s in shoes_db:
        k = f"{s['brand'].strip().lower()} {s['model'].strip().lower()}"
        if key in k or k in key:
            return s
    return None


def normalize_user_shoes(raw, shoes_db):
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = []
    out = []
    for us in raw or []:
        db = lookup_db(shoes_db, us.get("brand"), us.get("model"))
        size_eu = us.get("size_eu") or us.get("size")
        try:
            f = float(size_eu) if size_eu is not None else None
            size_eu = int(f) if (f is not None and f.is_integer()) else f
        except (TypeError, ValueError):
            size_eu = None
        out.append({
            "brand": us.get("brand", ""),
            "model": us.get("model", ""),
            "size_eu": size_eu,
            "db_width": db.get("width") if db else None,
            "db_heel_volume": db.get("heel_volume") if db else None,
            "db_forefoot_volume": db.get("forefoot_volume") if db else None,
            "db_downturn": db.get("downturn") if db else None,
            "db_asymmetry": db.get("asymmetry") if db else None,
            "db_stiffness": db.get("computed_stiffness") if db else None,
            "db_toe_form": db.get("toe_form") if db else None,
            "db_closure": db.get("closure") if db else None,
            "fit": us.get("fit") or {},
        })
    return out


def build_profile(scan, shoes_db):
    return {
        "toe_shape":             scan.get("toe_shape"),
        "toe_confidence":        scan.get("toe_confidence"),
        "hva_offset_ratio":      scan.get("hva_offset_ratio"),
        "hallux_valgus_class":   scan.get("hallux_valgus_class"),
        "instep_height_ratio":   scan.get("instep_height_ratio"),
        "instep_height_class":   scan.get("instep_height_class"),
        "forefoot_width_ratio":  scan.get("forefoot_width_ratio"),
        "forefoot_width_class":  scan.get("forefoot_width_class"),
        "heel_width_ratio":      scan.get("heel_width_ratio"),
        "heel_width_class":      scan.get("heel_width_class"),
        "heel_depth_ratio":      scan.get("heel_depth_ratio"),
        "heel_depth_class":      scan.get("heel_depth_class"),
        "arch_length_ratio":     scan.get("arch_length_ratio"),
        "arch_length_class":     scan.get("arch_length_class"),
        "street_size_eu":        scan.get("street_size_eu"),
        "next_shoe_preference":  scan.get("next_shoe_preference"),
        "next_shoe_notes":       scan.get("next_shoe_notes"),
        "shoes":                 normalize_user_shoes(scan.get("shoes") or [], shoes_db),
    }


# ---------------------------------------------------------------------
# Recommended-size resolver (V2). Extracted verbatim from
# render_v2_review_static.calc_rec_size.
# ---------------------------------------------------------------------

def calc_rec_size(profile_shoes, target_brand, brand_sizing, street_size, preference):
    """V2 target size.

    Target size = street shoe size adjusted by the target brand's typical
    downsize, then snapped to a half-EU:
      - performance (moderate / aggressive)  -> round DOWN  (tighter)
      - comfort     (balanced / comfort)     -> round UP    (roomier)

    The anchor shoe is no longer used. ``profile_shoes`` is kept in the
    signature only for call-site compatibility. Output is always a
    half-EU value (floor/ceil of an integer divided by 2).
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
    """Normalize shoe cup labels for prose: 'standard' -> 'medium', etc."""
    if not label:
        return "unknown"
    s = str(label).strip().lower()
    return {"standard": "medium", "low": "narrow", "high": "wide"}.get(s, s)


# ---------------------------------------------------------------------
# Section 2 with sizing-artifact filter + disclosure. Extracted verbatim
# from render_v2_review_static._shoe_fit_with_artifact_filter.
# ---------------------------------------------------------------------

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
    #  1. SIZING - if the shoes downsize choice is far enough from
    #     brand typical that the feedback direction is fully explained
    #     by sizing alone.
    #  2. SHALLOW_HEEL - heel + loose-direction + user has shallow
    #     or very-shallow heel on V2 5-tier. The back of the foot
    #     doesn't project far enough to fill the cup, explaining
    #     the empty feel before reaching for a cup-geometry story.
    #  3. SIT_ABOVE - heel-only contradictory cup (cup narrower than
    #     user heel width) with loose-direction feedback, any diff >= 1.
    #     Speculative: foot too big to seat in cup, sits on top
    #     instead, leaving space below.
    #  4. SILENT - perfect-at-2+-rank-diff (Rule C) and any other
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
        # Step 2: shallow_heel - heel + loose-direction +
        # shallow/very-shallow user heel.
        if (dim == "heel"
                and rating in ("loose", "empty", "roomy")
                and user_heel_depth_5t in ("very shallow", "shallow heel")):
            return "shallow_heel"
        # Step 3: sit_above - heel-only, cup narrower than user heel,
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
            else:  # toes - no rank comparison, default to sizing
                user_r = cup_r = None
            reason = _classify_reason(raw, dim, rating, user_r, cup_r)
            discounted.append({"shoe": raw, "dim": dim, "rating": rating,
                                "reason": reason,
                                "user_rank": user_r, "cup_rank": cup_r})

    # Build the section 2 paragraph sequence (Roman 2026-05-12: sizing
    # intro FIRST, then disclosure of discounted ratings, then cascade).
    paragraphs = []

    # Splice the filtered shoes into a profile copy so the cascade sees them.
    filtered_profile = dict(profile)
    filtered_profile["shoes"] = clean_shoes
    cascade_paragraphs = list(generate_shoe_fit(filtered_profile, target=target))

    # First paragraph from the cascade is the sizing intro - emit it
    # before the disclosure so context comes first.
    if cascade_paragraphs:
        paragraphs.append(cascade_paragraphs[0])
        cascade_remainder = cascade_paragraphs[1:]
    else:
        cascade_remainder = []

    if discounted:
        from collections import defaultdict
        parts = []

        # Sizing reason: consolidate per shoe (Roman 2026-05-18, B10).
        # A uniformly over/under-sized shoe has ONE cause across all its
        # discounted dims - emit one sentence listing the dims, not one
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

        # Non-sizing reasons: group by (dim, rating, reason). Different
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

            # "silent" reason - perfect-mismatch (Rule C) or mild
            # non-heel directional. No user-facing prose; the filter
            # already excluded these ratings from target math. Skip.

        # Emit the disclosure only if at least one non-silent finding fired.
        if parts:
            paragraphs.append(" ".join(parts))

    paragraphs.extend(cascade_remainder)
    return paragraphs


# ---------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------

# ---------------------------------------------------------------------
# Advanced preferences: an optional user override layer on top of the
# question-derived target. derive_preferences() snapshots what the four
# V2 questions produced (the results-page panel renders these as the
# "auto" defaults); apply_preference_overrides() lays the user's explicit
# choices on top before scoring.
# ---------------------------------------------------------------------

_CLOSURE_ALL = {"lace", "velcro", "slipper"}


def derive_preferences(target):
    """Snapshot the five adjustable preferences as the V2 questions
    derived them, before any user override."""
    cp = target.get("closure_pref") or set()
    closure = sorted(c for c in cp if c)  # multi-select: list of closures
    return {
        "stiffness": round(float(target.get("stiff_target", 0.5)), 3),
        "downturn":  target.get("target_dt_lbl"),
        "asymmetry": target.get("target_asym_lbl"),
        "closure":   closure,
        "ankle":     bool(target.get("ankle_required")),
    }


def apply_preference_overrides(target, overrides):
    """Apply the user's explicit preference overrides onto the merged
    target dict. ``overrides`` is sparse - only customized axes are
    present. Returns a new dict; the input is not mutated."""
    if not overrides:
        return target
    t = dict(target)

    # Stiffness: recenter the scoring window on the user's value, keeping
    # the question-derived window width.
    sv = overrides.get("stiffness")
    if sv is not None:
        try:
            v = max(0.0, min(1.0, float(sv)))
            width = float(t.get("stiff_hi", 0.6)) - float(t.get("stiff_lo", 0.3))
            if width <= 0:
                width = 0.30
            t["stiff_target"] = v
            t["stiff_lo"] = max(0.0, v - width / 2)
            t["stiff_hi"] = min(1.0, v + width / 2)
        except (TypeError, ValueError):
            pass

    dt = overrides.get("downturn")
    if dt in DOWNTURN_ORDER:
        t["target_dt"] = DOWNTURN_ORDER.index(dt)
        t["target_dt_lbl"] = dt

    asym = overrides.get("asymmetry")
    if asym in ASYM_ORDER:
        t["target_asym"] = ASYM_ORDER.index(asym)
        t["target_asym_lbl"] = asym

    cl = overrides.get("closure")
    if isinstance(cl, str):  # tolerate a legacy single-value string
        cl = [] if cl in ("any", "") else [cl]
    if isinstance(cl, list):
        chosen = {c for c in cl if c in _CLOSURE_ALL}
        if chosen:
            t["closure_pref"] = chosen
            t["closure_ok"]   = set()
            t["closure_bad"]  = set(_CLOSURE_ALL) - chosen
        else:
            # Explicit empty list = "no closure preference": clear any
            # discipline-derived closure bias so every closure scores 0.
            t["closure_pref"] = set()
            t["closure_ok"]   = set(_CLOSURE_ALL)
            t["closure_bad"]  = set()

    av = overrides.get("ankle")
    if av is not None:
        t["ankle_required"] = bool(av)

    return t


def build_browse_extended(profile, tiers, brand_sizing, price_rows,
                          street_size, pref, top_n=30):
    """Build the browse_extended payload that powers /scan/:id/browse.

    Top-N picks per tier ranked by V2 scanner score (budget tier ranked
    cheapest-first instead). The shape matches what scan-browse.html
    consumes: {"tiers": {baseline/softer/stiffer/budget: [pick, ...]}},
    where each pick carries slug / brand / model / recommended_size_eu
    (plus score / toe_form / feel, kept for parity with the V1 payload).
    """
    def _rec(brand):
        return calc_rec_size(profile.get("shoes"), brand, brand_sizing,
                             street_size, pref)

    def _pick(sc, sh):
        return {
            "slug":  sh.get("slug"),
            "brand": sh.get("brand"),
            "model": sh.get("model"),
            "score": sc.get("score"),
            "recommended_size_eu": _rec(sh.get("brand")),
            "toe_form": sh.get("toe_form"),
            "feel": sh.get("feel"),
        }

    def _topn(scored):
        return [_pick(sc, sh) for sc, sh in (scored or [])[:top_n]]

    # Budget browse: the baseline-scored pool re-ranked cheapest-first,
    # restricted to shoes that have a price at the user's recommended size.
    budget = []
    for sc, sh in (tiers.get("scored_baseline") or [])[:80]:
        rs = _rec(sh.get("brand"))
        price = (best_price_at_size(sh.get("slug"), rs, price_rows)
                 if rs is not None else None)
        if price is not None:
            budget.append((price, sc, sh))
    budget.sort(key=lambda x: x[0])
    budget_picks = [_pick(sc, sh) for _p, sc, sh in budget[:top_n]]

    return {
        "tiers": {
            "baseline": _topn(tiers.get("scored_baseline")),
            "softer":   _topn(tiers.get("scored_softer")),
            "stiffer":  _topn(tiers.get("scored_stiffer")),
            "budget":   budget_picks,
        },
    }


def build_v2_results(scan, shoes_db, price_rows, brand_sizing,
                     discipline, environment, rock, aggressiveness,
                     preference_overrides=None):
    """Run the full V2 pipeline for one scan + preference set.

    Parameters
    ----------
    scan : dict
        A foot_scan_fits row (must carry measurements + shoes + street size).
    shoes_db : list[dict]
        Shoes table rows (see check_full_v2_matrix.load_shoes_db columns).
    price_rows : list[dict]
        shoe_prices_by_size view rows (product_slug, price_eur, in_stock, size_eu).
    brand_sizing : dict
        brand -> typical_downsize_mid.
    discipline / environment / rock / aggressiveness : str
        The four V2 preference inputs. ``rock`` is None for indoor/both.

    Returns
    -------
    dict : {"interpretation": [...], "recommendations": [...]}
        Exactly the shape ScanResult.jsx consumes - interpretation is an
        array of {title, paragraphs} blocks; each recommendation carries
        slug/brand/model/category/recommended_size_eu/description/why/
        tradeoffs and an optional best_offer.
    """
    profile = build_profile(scan, shoes_db)
    street_size = float(scan.get("street_size_eu") or 0) or None
    pref = "performance" if aggressiveness in ("moderate", "aggressive") else "comfort"
    rec_size_fn = lambda sh: calc_rec_size(profile["shoes"], sh.get("brand"),
                                           brand_sizing, street_size, pref)

    # V2 unified target + tiers
    fit_target = resolve_targets_v2(profile, profile["shoes"], aggressiveness)
    use_target = compute_use_case_target(discipline, environment, rock, aggressiveness)
    target = {**fit_target, **use_target}
    # Snapshot what the four questions derived, then lay the user's
    # explicit preference overrides (if any) on top before scoring.
    derived_prefs = derive_preferences(target)
    target = apply_preference_overrides(target, preference_overrides)
    # A closure override is a hard constraint: restrict the shoe pool to the
    # chosen closure so the override fully overwrites the derived closure
    # preference (build_profile already ran on the full db, so the user's
    # own current-shoe lookup is unaffected).
    _cl = (preference_overrides or {}).get("closure")
    if isinstance(_cl, str):
        _cl = [_cl]
    _cl_set = {c for c in (_cl or []) if c in ("lace", "velcro", "slipper")}
    if _cl_set:
        shoes_db = [s for s in shoes_db
                    if str(s.get("closure") or "").strip().lower() in _cl_set]
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
             rock=rock, aggressiveness=aggressiveness, target=target,
             preference_overrides=preference_overrides))},
    ]

    # Flat all-picks list for peer-suppression in P3.
    all_picks_flat = []
    for tname in ("baseline", "softer", "stiffer", "budget"):
        for sc, sh in tiers[tname]:
            all_picks_flat.append(flatten_pick(sc, sh, tier=tname, target=target))

    # Prices for ALL tiers (matrix_scorer_v2 only annotates budget picks).
    price_lookup = {}
    for tname in ("baseline", "softer", "stiffer", "budget"):
        for sc, sh in tiers[tname]:
            slug = sh.get("slug")
            if slug in price_lookup:
                continue
            existing = sc.get("best_price_at_size")
            if existing is not None:
                price_lookup[slug] = existing
                continue
            rec_size = calc_rec_size(profile["shoes"], sh.get("brand"),
                                     brand_sizing, street_size, pref)
            if rec_size is not None:
                p = best_price_at_size(slug, rec_size, price_rows)
                if p is not None:
                    price_lookup[slug] = p

    recommendations = []
    for tname in ("baseline", "softer", "stiffer", "budget"):
        for sc, sh in tiers[tname]:
            best_price = price_lookup.get(sh["slug"])
            pick = flatten_pick(sc, sh, tier=tname, target=target,
                                best_price=best_price)
            paras = generate_shoe_description_v2(pick, profile,
                                                 all_picks=all_picks_flat)
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

    browse_extended = build_browse_extended(profile, tiers, brand_sizing,
                                            price_rows, street_size, pref)

    return {"interpretation": interpretation,
            "recommendations": recommendations,
            "browse_extended": browse_extended,
            "derived_preferences": derived_prefs}
