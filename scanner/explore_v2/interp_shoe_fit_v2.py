"""
Template engine for "What Your Current Shoe Fit Tells Us" interpretation section.

Generates deterministic text from shoe fit data + brand sizing context.
No LLM needed -- purely rule-based.

Key improvement over LLM: brand-aware downsizing interpretation.
E.g., La Sportiva 2 sizes down = relaxed fit (typical is 2.25),
while Mad Rock 2 sizes down = extremely aggressive (typical is 0.25).

Output: list of paragraph strings (plain text, no markdown).
"""

import json
from pathlib import Path

# ── Brand typical downsize (EU sizes below street size) ─────────────────
# Source: brand_sizing table, typical_downsize_mid column
BRAND_DS = {
    "Black Diamond": 0.25,
    "Boreal": 0.75,
    "Butora": 0.5,
    "EB": 1.5,
    "Evolv": 0.0,
    "Five Ten": 0.75,
    "La Sportiva": 2.25,
    "Mad Rock": 0.25,
    "Ocun": 0.25,
    "Red Chili": 0.5,
    "Scarpa": 1.25,
    "Tenaya": 1.5,
    "Unparallel": 0.25,
}


def _brand_typical(brand):
    return BRAND_DS.get(brand, 1.0)


def _relative_downsize(street, shoe_size, brand):
    """How aggressive is this sizing relative to brand typical?
    Returns (raw_downsize, relative_downsize, label)."""
    raw = street - shoe_size
    typical = _brand_typical(brand)
    relative = raw - typical

    if relative > 1.5:
        label = "very aggressive"
    elif relative > 1.0:
        label = "aggressive"
    elif relative > 0.5:
        label = "rather aggressive"
    elif relative >= -0.5:
        label = "typical"
    elif relative >= -1.0:
        label = "rather relaxed"
    elif relative >= -1.5:
        label = "relaxed"
    else:
        label = "very relaxed"

    return raw, relative, label


def _downsize_label_raw(raw_ds):
    """Human label for raw downsize amount."""
    if raw_ds < -0.5:
        return f"{abs(raw_ds):.1f} sizes above street size"
    elif raw_ds < 0:
        return "at street size"
    elif raw_ds == 0:
        return "at street size"
    elif raw_ds <= 0.5:
        return "half a size down"
    elif raw_ds <= 1.0:
        return "one size down"
    elif raw_ds <= 1.5:
        return "1.5 sizes down"
    elif raw_ds <= 2.0:
        return "two sizes down"
    elif raw_ds <= 2.5:
        return "2.5 sizes down"
    elif raw_ds <= 3.0:
        return "three sizes down"
    else:
        return f"{raw_ds:.1f} sizes down"


def _fit_issues(shoes):
    """Collect fit issue counts across all shoes.
    Returns dict of {dimension: {rating: count}}."""
    issues = {"heel": {}, "toes": {}, "forefoot": {}}
    for s in shoes:
        fit = s.get("fit", {})
        for dim in issues:
            rating = fit.get(dim, "perfect")
            issues[dim][rating] = issues[dim].get(rating, 0) + 1
    return issues


def _dominant_issue(issue_counts, total):
    """Find the dominant non-perfect rating for a dimension.
    Returns (rating, count, fraction) or None."""
    non_perfect = {k: v for k, v in issue_counts.items() if k != "perfect"}
    if not non_perfect:
        return None
    best = max(non_perfect.items(), key=lambda x: x[1])
    return best[0], best[1], best[1] / total


def _find_anchor(shoes, street):
    """Find the best anchor shoe (closest to perfect fit).
    Returns (shoe_dict, anchor_score) or (None, 0)."""
    if not shoes:
        return None, 0

    best = None
    best_score = -99
    for s in shoes:
        fit = s.get("fit", {})
        score = 0
        for dim in ("heel", "toes", "forefoot"):
            rating = fit.get(dim, "perfect")
            if rating == "perfect":
                score += 3
            elif rating in ("tight", "roomy"):
                score += 1
            else:  # squeezed, empty, loose
                score -= 1
        # Prefer shoes with a size set
        if s.get("size_eu") is None:
            score -= 5
        if score > best_score:
            best_score = score
            best = s
    return best, best_score


# ── Paragraph builders ──────────────────────────────────────────────────

def _para_sizing(shoes, street):
    """Build the sizing summary paragraph with brand-aware context."""
    shoes_with_size = [s for s in shoes if s.get("size_eu") is not None]
    if not shoes_with_size:
        return None

    if len(shoes_with_size) == 1:
        s = shoes_with_size[0]
        raw, rel, label = _relative_downsize(street, s["size_eu"], s["brand"])
        raw_label = _downsize_label_raw(raw)
        typical_label = _downsize_label_raw(_brand_typical(s["brand"]))

        if raw < 0:
            size_phrase = (f"which is actually {abs(raw):.1f} sizes above "
                           f"your street size of {street}")
        elif raw == 0:
            size_phrase = f"at your street size of {street}"
        else:
            size_phrase = f"{raw_label} from your street size of {street}"

        # Roman 2026-05-01 audit S7: handle typical == 0 ("at street size")
        # gracefully so we don't say "typical downsize is about at street size".
        typical_value = _brand_typical(s["brand"])
        if label == "typical":
            brand_context = f"a typical fit for {s['brand']}"
        elif typical_value == 0:
            brand_context = (
                f"{label} for {s['brand']}, where shoes typically fit at "
                f"street size"
            )
        elif typical_value < 0:
            brand_context = (
                f"{label} for {s['brand']}, where the typical fit is about "
                f"{typical_label}"
            )
        else:
            brand_context = (
                f"{label} for {s['brand']}, where the typical downsize is "
                f"about {typical_label}"
            )

        base = (
            f"You wear your {s['brand']} {s['model']} in EU {s['size_eu']}, "
            f"{size_phrase}. "
            f"That is {brand_context}."
        )

        # Roman 2026-05-01 audit S5: drop the V1 "Downsizing further toward
        # the typical range could tighten the heel..." follow-up. The new
        # cascade (S2.HEEL.empty.1.C) owns sizing diagnosis now and the two
        # together produced a duplicate paragraph.

        return base

    # Multiple shoes
    sizes = [s["size_eu"] for s in shoes_with_size]
    min_size = min(sizes)
    max_size = max(sizes)

    if min_size == max_size:
        size_range = f"EU {min_size}"
    else:
        size_range = f"EU {min_size} to {max_size}"

    # Overall sizing pattern
    rels = []
    for s in shoes_with_size:
        _, rel, _ = _relative_downsize(street, s["size_eu"], s["brand"])
        rels.append(rel)
    avg_rel = sum(rels) / len(rels)

    if avg_rel > 0.5:
        overall = "You tend to size more aggressively than average across brands."
    elif avg_rel < -0.5:
        overall = "You tend to prefer a more relaxed fit than typical across brands."
    else:
        overall = "Your sizing is close to the brand-typical fit across your shoes."

    # If all same brand, simpler text
    brands = set(s["brand"] for s in shoes_with_size)
    if len(brands) == 1:
        brand = list(brands)[0]
        typical = _brand_typical(brand)
        if min_size != max_size:
            raw_range = (f"{_downsize_label_raw(street - max_size)} to "
                         f"{_downsize_label_raw(street - min_size)}")
        else:
            raw_range = _downsize_label_raw(street - min_size)
        # Roman 2026-05-08 case-1: when min/max sizes give different
        # labels for the same brand (e.g. one shoe typical, the other
        # relaxed), the average-based "this is a X fit" verdict
        # contradicts the per-shoe diagnoses below. Drop the verdict in
        # that case and just state the facts; the per-shoe paragraphs
        # below will explain the variance.
        labels = [_relative_downsize(street, s["size_eu"], brand)[2]
                  for s in shoes_with_size]
        if len(set(labels)) > 1:
            return (
                f"You wear your {brand} shoes in sizes {size_range}, "
                f"ranging from {raw_range} from your street size of "
                f"{street}. The typical downsize for {brand} is "
                f"{_downsize_label_raw(typical)}; the per-shoe diagnoses "
                f"below break down each pair."
            )
        # Uniform label across all shoes — keep the verdict.
        _, _, label = _relative_downsize(street, sum(sizes)/len(sizes), brand)
        return (
            f"You wear your {brand} shoes in sizes {size_range}, "
            f"{raw_range} from your street size of {street}. "
            f"For {brand}, where the typical downsize is about "
            f"{_downsize_label_raw(typical)}, this is a {label} fit."
        )

    # Mixed brands -- highlight the brand differences
    # Sort by most interesting (biggest relative deviation from typical)
    interesting = sorted(
        shoes_with_size,
        key=lambda s: abs(_relative_downsize(street, s["size_eu"], s["brand"])[1]),
        reverse=True,
    )

    # Pick up to two non-typical to highlight
    highlights = []
    for s in interesting[:2]:
        raw, rel, label = _relative_downsize(street, s["size_eu"], s["brand"])
        if label != "typical":
            if raw < 0:
                size_phrase = (f"is actually {abs(raw):.1f} sizes above street size")
            elif raw == 0:
                size_phrase = "is at street size"
            else:
                size_phrase = f"is {_downsize_label_raw(raw)} from street size"
            highlights.append(
                f"Your {s['brand']} {s['model']} in EU {s['size_eu']} "
                f"{size_phrase}, "
                f"{label} for {s['brand']}, where the typical downsize is about "
                f"{_downsize_label_raw(_brand_typical(s['brand']))}."
            )

    if highlights:
        # Only append overall summary if it aligns with the highlights
        # (skip if highlights show aggressive but average is typical, etc.)
        all_highlight_labels = []
        for s in interesting[:2]:
            _, _, lbl = _relative_downsize(street, s["size_eu"], s["brand"])
            all_highlight_labels.append(lbl)
        extreme_labels = ("very aggressive", "aggressive", "very relaxed", "relaxed")
        show_overall = (
            len(shoes_with_size) > 2
            and not (
                avg_rel >= -0.5 and avg_rel <= 0.5
                and any(l in extreme_labels for l in all_highlight_labels)
            )
        )
        return (
            f"Your shoes range from {size_range} "
            f"(street size {street}), but the raw numbers do not tell the full story "
            f"because brands size very differently. "
            + " ".join(highlights)
            + (f" {overall}" if show_overall else "")
        )
    else:
        return (
            f"Your shoes range from {size_range} "
            f"(street size {street}). {overall}"
        )


def _combined_toes_squeezed_ff_loose(shoes, profile=None):
    """Detect shoes where toes=squeezed AND forefoot=loose simultaneously.
    This unusual combination means the shoe distributes volume in the wrong
    places for this foot shape -- typically a toe form mismatch and/or
    long arch pushing the foot's widest point behind where the shoe expects it.
    Returns combined explanation paragraph or None."""
    combo_shoes = []
    for s in shoes:
        fit = s.get("fit", {})
        if fit.get("toes") == "squeezed" and fit.get("forefoot") in ("loose", "roomy"):
            combo_shoes.append(s)

    if not combo_shoes:
        return None

    s = combo_shoes[0]
    brand, model = s["brand"], s["model"]
    toe_forms = s.get("db_toe_form") or []
    user_toe = (profile or {}).get("toe_shape", "") if profile else ""
    arch_cls = (profile or {}).get("arch_length_class", "") if profile else ""

    parts = []

    # Core observation
    parts.append(
        f"Your {brand} {model} presents an unusual combination: "
        "the forefoot feels loose while your toes are squeezed."
    )

    # Explain WHY: toe form mismatch
    toe_form_lower = [t.lower() for t in toe_forms]
    _labels = {"greek": "Greek", "egyptian": "Egyptian", "roman": "Roman"}
    user_label = _labels.get(user_toe.lower(), "")
    if toe_form_lower and user_toe and user_toe.lower() not in toe_form_lower:
        shoe_label = _labels.get(toe_form_lower[0], toe_form_lower[0])
        parts.append(
            f"The {shoe_label} toe form distributes room differently than "
            f"your {user_label} foot needs, so volume ends up in the wrong "
            "place: the forefoot has room your foot cannot use while your "
            "toes are crammed into a shape that does not match."
        )
    else:
        parts.append(
            "This typically means the shoe distributes volume in the wrong "
            "places for your foot shape: the forefoot has room your foot "
            "cannot use while the toe box shape does not match your toes."
        )

    # Long arch compound
    if arch_cls and "long" in arch_cls.lower():
        parts.append(
            "Your long arch compounds this by pushing the ball of your foot "
            "further back in the shoe than designed, so the widest part of your "
            "foot sits behind the forefoot zone while your toes crowd further "
            "into the toe box."
        )

    return " ".join(parts)


def _para_fit_patterns(shoes, profile=None):
    """Build the fit patterns paragraph analyzing common issues."""
    n = len(shoes)
    if n == 0:
        return None

    arch_cls = (profile or {}).get("arch_length_class", "normal")

    # Determine if sizing is relaxed (to avoid saying "aggressive downsize"
    # when the shoe is already sized generously)
    street = (profile or {}).get("street_size_eu")
    sizing_relaxed = False
    if street and n == 1:
        s = shoes[0]
        if s.get("size_eu") and s.get("brand"):
            _, _, label = _relative_downsize(street, s["size_eu"], s["brand"])
            sizing_relaxed = label in ("rather relaxed", "relaxed", "very relaxed")

    # ── Special case: toes squeezed + forefoot loose in the SAME shoe ──
    # This is a signature of toe form mismatch and/or arch-driven positional
    # offset.  Treat as a single combined insight, not two independent issues.
    combined_tf = _combined_toes_squeezed_ff_loose(shoes, profile)
    if combined_tf:
        # Still check heel independently
        issues = _fit_issues(shoes)
        heel_dom = _dominant_issue(issues["heel"], n)
        if heel_dom:
            rating, count, fraction = heel_dom
            if count == n:
                # Pass dominant shoe (or only shoe) for scan-aware disambiguation.
                dom_shoe = shoes[0] if n == 1 else None
                heel_text = _universal_issue_text(
                    "heel", rating, n, arch_cls=arch_cls,
                    profile=profile, shoe=dom_shoe,
                )
            elif fraction >= 0.5:
                heel_text = _majority_issue_text("heel", rating, count, n, shoes=shoes, profile=profile)
            else:
                heel_text = None
            if heel_text:
                return heel_text + " " + combined_tf
        return combined_tf

    issues = _fit_issues(shoes)
    patterns = []

    for dim in ("heel", "toes", "forefoot"):
        dom = _dominant_issue(issues[dim], n)
        if dom is None:
            continue
        rating, count, fraction = dom

        # Check for contradictions (e.g., heel empty in some, tight in others)
        non_perfect = {k: v for k, v in issues[dim].items() if k != "perfect"}
        has_contradiction = len(non_perfect) > 1

        if has_contradiction and n > 1:
            parts = [f"{r} in {c}" for r, c in sorted(non_perfect.items(), key=lambda x: -x[1])]
            perfect_count = issues[dim].get("perfect", 0)
            if perfect_count:
                parts.append(f"perfect in {perfect_count}")
            patterns.append({
                "dim": dim,
                "type": "contradiction",
                "text": _contradiction_text(dim, non_perfect, perfect_count, n, shoes=shoes),
            })
        elif count == n:
            # Universal issue. For n=1 we pass the lone shoe so the helper
            # can compare scan classes against the shoe's last (toe form,
            # asymmetry, width). For n>1 the multi-shoe variant uses
            # profile-only signals.
            dom_shoe = shoes[0] if n == 1 else None
            patterns.append({
                "dim": dim,
                "type": "universal",
                "text": _universal_issue_text(dim, rating, n, arch_cls=arch_cls,
                                              sizing_relaxed=sizing_relaxed,
                                              profile=profile, shoe=dom_shoe),
            })
        elif fraction >= 0.5:
            # Majority issue
            patterns.append({
                "dim": dim,
                "type": "majority",
                "text": _majority_issue_text(dim, rating, count, n, shoes=shoes, profile=profile),
            })

    if not patterns:
        if n == 1:
            s = shoes[0]
            fit = s.get("fit", {})
            if all(v == "perfect" for v in fit.values()):
                return (
                    f"Your {s['brand']} {s['model']} fits perfectly across all dimensions: "
                    "heel, toes, and forefoot. This tells us the shoe's geometry matches your foot well, "
                    "and we can use it as a reliable reference for finding similar shapes."
                )
        return (
            "Your shoes fit well across all dimensions, with no consistent pressure points or loose spots. "
            "This gives us a solid baseline for recommending shoes with similar geometry."
        )

    # When we have exactly 2 shoes and multiple single-shoe minority issues,
    # combine them to avoid repeating "In one of your two shoes" 3 times
    if n == 2:
        minorities = [p for p in patterns if p["type"] == "majority"]
        others = [p for p in patterns if p["type"] != "majority"]
        if len(minorities) >= 3:
            # Build per-shoe issue summaries (naming the shoes)
            verb_map = {"heel": "feels", "toes": "feel", "forefoot": "feels"}
            shoe_issues = {}  # shoe_name -> list of "dim verb rating"
            for m in minorities:
                dim = m["dim"]
                issue_counts = issues[dim]
                non_perfect = {k: v for k, v in issue_counts.items() if k != "perfect"}
                rating = max(non_perfect.items(), key=lambda x: x[1])[0]
                # Find which shoe has this issue
                for s in shoes:
                    if (s.get("fit") or {}).get(dim) == rating:
                        name = f"{s.get('brand','')} {s.get('model','')}".strip()
                        shoe_issues.setdefault(name, []).append(
                            f"{dim} {verb_map[dim]} {rating}")
                        break
            if shoe_issues:
                shoe_parts = []
                for name, iss_list in shoe_issues.items():
                    shoe_parts.append(
                        f"the {name} ({', '.join(iss_list)})")
                combined = (
                    "Each shoe fits differently: "
                    + " while ".join(shoe_parts) + ". "
                    "These scattered fit issues suggest each model's geometry "
                    "addresses some aspects of your foot shape but not others."
                )
            else:
                parts = []
                for m in minorities:
                    dim = m["dim"]
                    issue_counts = issues[dim]
                    non_perfect = {k: v for k, v in issue_counts.items() if k != "perfect"}
                    rating = max(non_perfect.items(), key=lambda x: x[1])[0]
                    parts.append(f"the {dim} {verb_map[dim]} {rating}")
                combined = (
                    f"Across your two shoes, different dimensions have different issues: "
                    + ", ".join(parts[:-1]) + f", and {parts[-1]}. "
                    "These scattered fit issues across different shoes suggest each model's geometry "
                    "addresses some aspects of your foot shape but not others."
                )
            return " ".join([p["text"] for p in others] + [combined])

    return " ".join(p["text"] for p in patterns)


def _heel_empty_cause(profile):
    """Disambiguate which dimension of the heel cup likely causes the empty feel,
    based on the user's scan. Returns a clause meant to splice in after
    'for your heel shape' (starting with ', '), or '' if no useful info.

    Logic: heel feels empty when cup is too wide laterally OR too deeply sculpted
    front-to-back. The scan rules each side in or out:
      - User heel deep   → depth is fine, width must be the issue
      - User heel shallow→ depth is likely the issue
      - User heel narrow → width must be the issue
      - User heel wide   → width is fine, depth must be the issue
    """
    if not profile:
        return ""
    hw = (profile.get("heel_width_class") or "").lower()
    hd = (profile.get("heel_depth_class") or "").lower()

    narrow  = "narrow"  in hw
    wide    = "wide"    in hw
    shallow = "shallow" in hd
    deep    = "deep"    in hd

    if deep and narrow:
        return (", and given your heel is deep but narrow, "
                "the cup is likely too wide rather than too deeply sculpted")
    if shallow and wide:
        return (", and given your heel is wide but shallow, "
                "the cup is likely too deeply sculpted rather than too wide")
    if deep and wide:
        return (", and given your heel is both deep and wide, "
                "the cup likely runs oversized in both dimensions")
    if shallow and narrow:
        return (", and given your heel is both narrow and shallow, "
                "both width and depth are likely contributing")
    if deep:
        return (", and given your heel is quite deep, "
                "likely the width is the issue")
    if shallow:
        return (", and given your heel is rather shallow, "
                "likely the depth is the issue")
    if narrow:
        return (", and given your heel is narrow, "
                "likely the width is the issue")
    if wide:
        return (", and given your heel is wide, "
                "likely the depth is the issue")
    return ""


def _toes_squeezed_cause(profile, shoe=None, sizing_relaxed=False):
    """Disambiguate the suspected cause of squeezed toes from scan + shoe data.

    Returns a *full replacement* second sentence describing the most likely
    cause, or '' if scan + shoe data don't pin one down. When non-empty, the
    caller drops the speculative "could be X or Y" sentence and uses this
    instead — keeps the prose decisive when we have a real signal.

    Priority of causes (highest-confidence first):
      1. Toe-form mismatch (shoe's db_toe_form doesn't include user's toe_shape)
      2. Hallux valgus + asymmetric shoe last
      3. Wide forefoot in a narrow/medium-width shoe
      4. Profile-only fallbacks when shoe specs are missing
    """
    if not profile:
        return ""

    user_toe = (profile.get("toe_shape") or "").lower()
    hva      = (profile.get("hallux_valgus_class") or "").lower()
    fw       = (profile.get("forefoot_width_class") or "").lower()

    shoe = shoe or {}
    shoe_toe_forms = [t.lower() for t in (shoe.get("db_toe_form") or [])]
    shoe_asym  = (shoe.get("db_asymmetry") or "").lower()
    shoe_width = (shoe.get("db_width") or "").lower()

    # 1. Toe-form mismatch
    if shoe_toe_forms and user_toe and user_toe not in shoe_toe_forms:
        user_lbl = _TOE_SHAPE_LABELS.get(user_toe, user_toe.capitalize())
        shoe_lbl = _TOE_SHAPE_LABELS.get(shoe_toe_forms[0], shoe_toe_forms[0].capitalize())
        u_art = "an" if user_lbl[:1].lower() in "aeiou" else "a"
        s_art = "an" if shoe_lbl[:1].lower() in "aeiou" else "a"
        return (f"Your scan shows {u_art} {user_lbl} toe shape while this shoe is built "
                f"on {s_art} {shoe_lbl} toe form, so the most likely cause is a toe-shape mismatch.")

    # 2. Hallux valgus + asymmetric shoe
    if hva and hva not in ("", "none", "normal") and shoe_asym in ("moderate", "strong", "aggressive"):
        return (f"Your scan shows {hva} hallux valgus, and this shoe has a "
                f"{shoe_asym} asymmetric last that likely presses the big-toe joint inward.")

    # 3. Wide forefoot in narrower shoe
    if "wide" in fw and shoe_width in ("narrow", "medium"):
        return (f"Your scan shows a wide forefoot and this shoe runs "
                f"{shoe_width}, so width is likely the cause.")

    # 4. Profile-only fallbacks (when shoe specs are missing but scan tells us something)
    if not shoe_toe_forms and user_toe in ("egyptian", "roman"):
        user_lbl = _TOE_SHAPE_LABELS.get(user_toe, user_toe.capitalize())
        u_art = "an" if user_lbl[:1].lower() in "aeiou" else "a"
        return (f"Your scan shows {u_art} {user_lbl} toe shape, which is sensitive "
                f"to toe-box shape mismatches and the most likely cause here.")
    if not shoe_width and "wide" in fw:
        return "Your scan shows a wide forefoot, which is the most likely cause."

    return ""


def _heel_empty_cause_multi(profile):
    """Heel-empty cause for the n>1 case: the inference is profile-only
    (cup-side specifics vary across shoes), so reuse the same scan-based clause."""
    return _heel_empty_cause(profile)


def _heel_empty_closure_note(shoe):
    """When the empty-feeling shoe is a slipper, surface that the closure type
    matters: there is nothing to tighten the heel down. A lace-up or two-strap
    velcro design could compensate where a slipper cannot.

    Returns a sentence to append (with leading space) or empty string."""
    if not shoe:
        return ""
    closure = (shoe.get("db_closure") or shoe.get("closure") or "").lower()
    if closure == "slipper":
        return (" On top of that, this is a slipper, so there is no closure to "
                "tighten the heel down. A lace-up or two-strap velcro design "
                "would let you tighten the back independently and could "
                "meaningfully reduce the empty feel.")
    return ""


def _toes_roomy_cause(profile, shoe=None):
    """Disambiguate why toes have extra room.

    Two distinct mechanisms:
      A) Length/sizing — the toe box runs longer than the foot needs.
         Fix: downsize or pick a shorter toe box.
      B) Toe-shape mismatch — the toe profile leaves dead space at one toe
         that downsizing can't recover (it'll just crush the longest toe).
         Common case: Roman or Greek foot in a steeply Egyptian-shaped shoe
         leaves a gap at the second/third toes; an Egyptian-shaped foot in
         a flat Roman last leaves a gap at the big toe.
         Fix: pick a different toe form, not a smaller size.

    Returns full replacement second sentence, or '' for the default
    "more aggressive downsize" advice.
    """
    if not profile:
        return ""
    user_toe = (profile.get("toe_shape") or "").lower()
    shoe = shoe or {}
    shoe_toe_forms = [t.lower() for t in (shoe.get("db_toe_form") or [])]

    if not (user_toe and shoe_toe_forms and user_toe not in shoe_toe_forms):
        return ""

    user_lbl = _TOE_SHAPE_LABELS.get(user_toe, user_toe.capitalize())
    shoe_lbl = _TOE_SHAPE_LABELS.get(shoe_toe_forms[0], shoe_toe_forms[0].capitalize())
    u_art = "an" if user_lbl[:1].lower() in "aeiou" else "a"
    s_art = "an" if shoe_lbl[:1].lower() in "aeiou" else "a"

    # Pinpoint where the dead space sits, when we can.
    if user_toe == "roman" and shoe_toe_forms[0] == "egyptian":
        gap = "at your second and third toes, where the shoe tapers down from the big-toe peak"
    elif user_toe == "greek" and shoe_toe_forms[0] == "egyptian":
        gap = "at your longer second toe, where the shoe expects the big toe to be longest"
    elif user_toe == "egyptian" and shoe_toe_forms[0] == "greek":
        gap = "at your big toe, where the shoe expects the second toe to be longest"
    elif user_toe == "egyptian" and shoe_toe_forms[0] == "roman":
        gap = "at your big toe, where the shoe's flat front gives no extra length"
    elif user_toe == "roman" and shoe_toe_forms[0] == "greek":
        gap = "at your big toe and outer toes, with extra length only at the second toe"
    elif user_toe == "greek" and shoe_toe_forms[0] == "roman":
        gap = "at your longer second toe, where the shoe's flat front sits short"
    else:
        gap = "in the toe box where the shapes don't align"

    fix_art = "an" if user_lbl[:1].lower() in "aeiou" else "a"
    return (f"Your scan shows {u_art} {user_lbl} toe shape while this shoe is built "
            f"on {s_art} {shoe_lbl} toe form, leaving dead space {gap}. "
            f"Downsizing would crush your longest toe before closing that gap; "
            f"a shoe with {fix_art} {user_lbl} toe form is the better fix.")


def _heel_tight_cause(profile, shoe=None):
    """Disambiguate why the heel feels tight from scan + shoe data.
    Returns a clause meant to splice after 'this heel cup is designed for'
    (starting with ', '), or '' if no useful info.

    Heel tight = cup is narrower or shallower than the user's heel. The scan
    rules each side in or out:
      - User heel wide   → width must be the issue
      - User heel narrow → depth must be the issue (width is fine)
      - User heel deep   → depth must be the issue
      - User heel shallow→ width must be the issue
    Cross-checks against shoe db_heel_volume when available: a narrow-volume
    cup + tight heel on a wide-heeled user is the expected mismatch, while
    a medium/wide-volume cup + tight heel suggests the cup runs small for
    its rated volume.
    """
    if not profile:
        return ""
    hw = (profile.get("heel_width_class") or "").lower()
    hd = (profile.get("heel_depth_class") or "").lower()

    narrow  = "narrow"  in hw
    wide    = "wide"    in hw
    shallow = "shallow" in hd
    deep    = "deep"    in hd

    shoe = shoe or {}
    shoe_hv = (shoe.get("db_heel_volume") or "").lower()

    # Cross-check for "shoe runs small": medium/wide-volume cup feels tight
    # in a normal-shaped heel — the cup probably runs smaller than rated.
    cup_runs_small = (shoe_hv in ("medium", "wide")
                      and not (narrow or wide or shallow or deep))

    if wide and deep:
        if shoe_hv == "narrow":
            return (", and given your heel is both wide and deep with this shoe's "
                    "narrow heel volume, the cup is undersized in both dimensions for your foot")
        return (", and given your heel is both wide and deep, "
                "the cup is undersized in both dimensions for your foot")
    if wide and shallow:
        return (", and given your heel is wide but shallow, "
                "the cup is likely too narrow rather than too shallow")
    if narrow and deep:
        return (", and given your heel is narrow but deep, "
                "the cup is likely too shallow rather than too narrow")
    if narrow and shallow:
        return (", and given your heel is both narrow and shallow, "
                "the cup is likely simply undersized for your back foot")
    if wide:
        return (", and given your heel is wide, "
                "likely the width is the issue")
    if narrow:
        return (", and given your heel is narrow, "
                "likely the depth is the issue")
    if deep:
        return (", and given your heel is quite deep, "
                "likely the depth is the issue")
    if shallow:
        return (", and given your heel is rather shallow, "
                "likely the width is the issue")
    if cup_runs_small:
        return (f", and given your heel scans normal but this shoe has {shoe_hv} "
                f"heel volume, the cup likely runs smaller than rated")
    return ""


def _forefoot_tight_cause(profile, shoe=None):
    """Disambiguate why the forefoot feels tight from scan + shoe data.
    Returns a *full replacement* second sentence describing the most likely
    cause, or '' if no useful info.

    Two main mechanisms can both squeeze a forefoot:
      A) lateral compression — wide forefoot in a narrower last
      B) longitudinal pressure — long arch pushes the ball of the foot
         further forward, into the narrowing taper of the toe area
    The scan + shoe specs distinguish which is dominant.
    """
    if not profile:
        return ""

    fw   = (profile.get("forefoot_width_class") or "").lower()
    arch = (profile.get("arch_length_class") or "").lower()

    shoe = shoe or {}
    shoe_width = (shoe.get("db_width") or "").lower()

    wide_ff   = "wide" in fw
    narrow_ff = "narrow" in fw
    long_arch = "long" in arch

    # Both mechanisms present
    if wide_ff and long_arch:
        if shoe_width in ("narrow", "medium"):
            return (f"Your scan shows a wide forefoot and a long arch, and this shoe runs "
                    f"{shoe_width}, so width is the primary cause with the long arch "
                    f"compounding it by pushing the ball of your foot further into the toe taper.")
        return ("Your scan shows both a wide forefoot and a long arch, so both lateral width "
                "and the arch pushing the ball of the foot forward are likely contributing.")

    # Width-dominant
    if wide_ff:
        if shoe_width in ("narrow", "medium"):
            return (f"Your scan shows a wide forefoot and this shoe runs {shoe_width}, "
                    f"so width is likely the cause.")
        return "Your scan shows a wide forefoot, which is the most likely cause."

    # Arch-dominant (long arch with normal/narrow forefoot)
    if long_arch:
        return ("Your scan shows a long arch, which pushes the ball of your foot further "
                "forward in the shoe than designed and into the narrower toe taper. "
                "That is the most likely cause here.")

    # Narrow forefoot + tight: shoe must run very narrow, or it's a length issue
    if narrow_ff and shoe_width == "narrow":
        return (f"Your scan shows a narrow forefoot but this shoe also runs narrow, "
                f"so width is likely the cause despite your slim forefoot.")

    return ""


def _toes_squeezed_cause_multi(profile):
    """Toes-squeezed cause for the n>1 case: profile-only signal that holds
    across any shoe (toe shape, HVA, forefoot width)."""
    return _toes_squeezed_cause(profile, shoe=None)


def _universal_issue_text(dim, rating, n, arch_cls=None, sizing_relaxed=False,
                          profile=None, shoe=None):
    """Text for when ALL shoes have the same issue on a dimension.
    arch_cls: optional, used to only mention long-arch when relevant.
    sizing_relaxed: if True, don't suggest 'aggressive downsize' as a cause for squeezed toes.
    profile / shoe: passed through to scan-aware disambiguation helpers."""
    count_word = "both" if n == 2 else f"all {n}" if n > 2 else "your"
    has_long_arch = arch_cls == "long arch"

    if dim == "heel":
        if rating == "empty":
            if n == 1:
                cause = _heel_empty_cause(profile)
                closure_note = _heel_empty_closure_note(shoe)
                return (
                    "Your heel feels empty in this shoe. "
                    "This is a common sign that either the heel cup is too wide or too deeply sculpted "
                    f"for your heel shape{cause}.{closure_note}"
                )
            cause = _heel_empty_cause_multi(profile)
            if cause:
                return (
                    f"Your heel feels empty in {count_word} shoes. "
                    "This is a strong signal that the issue is your foot shape rather than bad luck with one model"
                    f"{cause}."
                )
            return (
                f"Your heel feels empty in {count_word} shoes. "
                "This is a strong signal that the issue is your foot shape rather than bad luck with one model."
            )
        elif rating == "tight":
            if n == 1:
                cause = _heel_tight_cause(profile, shoe)
                return (
                    "Your heel feels tight in this shoe, "
                    f"suggesting your heel is wider or deeper than what this heel cup is designed for{cause}."
                )
            cause = _heel_tight_cause(profile)
            return (
                f"Your heel feels tight in {count_word} shoes, "
                f"suggesting your heel is wider or deeper than what these heel cups are designed for{cause}."
            )
    elif dim == "toes":
        if rating == "squeezed":
            if n == 1:
                # When scan + shoe pin down a cause, the cause sentence
                # REPLACES the speculative "could be X or Y" — keeps the
                # prose decisive. When no cause is found, fall back to the
                # original speculative wording.
                cause = _toes_squeezed_cause(profile, shoe, sizing_relaxed=sizing_relaxed)

                if has_long_arch and sizing_relaxed:
                    if cause:
                        return (
                            "Your toes feel squeezed in this shoe despite the relaxed sizing. "
                            f"{cause} Your long arch likely compounds this by pushing "
                            "the forefoot further into the toe area."
                        )
                    return (
                        "Your toes feel squeezed in this shoe despite the relaxed sizing. "
                        "This strongly suggests a toe shape mismatch, "
                        "compounded by your long arch pushing the forefoot into the toe area."
                    )
                if has_long_arch:
                    if cause:
                        return (
                            "Your toes feel squeezed in this shoe. "
                            f"{cause} Your long arch may compound this by pushing the "
                            "forefoot further into the toe area."
                        )
                    return (
                        "Your toes feel squeezed in this shoe. "
                        "This could be a toe shape mismatch, "
                        "your long arch pushing the forefoot into the toe area, or simply an aggressive downsize."
                    )
                if sizing_relaxed:
                    if cause:
                        return (
                            "Your toes feel squeezed in this shoe despite the relaxed sizing, "
                            f"so this is almost certainly a foot-shape issue rather than downsizing. "
                            f"{cause}"
                        )
                    return (
                        "Your toes feel squeezed in this shoe despite the relaxed sizing. "
                        "Since the shoe is already sized generously, this is almost certainly a toe shape "
                        "mismatch: the shoe's toe box is designed for a different foot shape than yours."
                    )
                if cause:
                    return f"Your toes feel squeezed in this shoe. {cause}"
                return (
                    "Your toes feel squeezed in this shoe. "
                    "This could be a toe shape mismatch (the shoe's toe box designed for a different foot shape) "
                    "or an aggressive downsize."
                )

            # n > 1
            cause = _toes_squeezed_cause_multi(profile)
            if has_long_arch:
                if cause:
                    return (
                        f"Your toes feel squeezed in {count_word} shoes. "
                        f"A consistent squeeze across different models points to a structural cause. "
                        f"{cause} Your long arch may compound this by pushing the forefoot into the toe box."
                    )
                return (
                    f"Your toes feel squeezed in {count_word} shoes. "
                    "A consistent squeeze across different models points to a structural cause, "
                    "likely a toe shape mismatch or your long arch pushing the forefoot into the toe box."
                )
            if cause:
                return (
                    f"Your toes feel squeezed in {count_word} shoes. "
                    f"A consistent squeeze across different models points to a structural cause. "
                    f"{cause}"
                )
            return (
                f"Your toes feel squeezed in {count_word} shoes. "
                "A consistent squeeze across different models points to a structural cause, "
                "likely a toe shape mismatch rather than bad luck with one model."
            )
        elif rating == "roomy":
            if n == 1:
                cause = _toes_roomy_cause(profile, shoe)
                if cause:
                    return f"Your toes have extra room in this shoe. {cause}"
                return (
                    "Your toes have extra room in this shoe. "
                    "A more aggressive downsize or a shoe with a shorter, more tapered toe box could help."
                )
            # n > 1: profile-only check still works when ALL shoes share the
            # same toe-form mismatch with the user.
            return (
                f"Your toes have extra room in {count_word} shoes. "
                "This suggests the toe box is longer or wider than your foot needs. "
                "A more aggressive downsize or a shoe with a shorter, more tapered toe box could help."
            )
    elif dim == "forefoot":
        if rating == "tight":
            if n == 1:
                cause = _forefoot_tight_cause(profile, shoe)
                if cause:
                    return f"Your forefoot feels tight in this shoe. {cause}"
                return (
                    "Your forefoot feels tight in this shoe. "
                    "This usually reflects either lateral width (your forefoot vs. the shoe's last) or "
                    "compression from the arch pushing the ball of your foot into a narrow toe area."
                )
            return (
                f"Your forefoot feels tight in {count_word} shoes, "
                "suggesting your foot is wider in the ball area than what these models accommodate."
            )
        elif rating == "loose":
            if n == 1:
                return (
                    "Your forefoot feels loose in this shoe, "
                    "meaning it has more forefoot volume than your foot needs."
                )
            return (
                f"Your forefoot feels loose in {count_word} shoes, "
                "meaning these shoes have more forefoot volume than your foot needs."
            )

    # Generic fallback
    return f"Your {dim} is rated {rating} across {count_word} shoes."


def _dim_verb(dim):
    """'feel' for toes (plural), 'feels' for heel/forefoot (singular)."""
    return "feel" if dim == "toes" else "feels"


def _majority_issue_text(dim, rating, count, total, shoes=None, profile=None):
    """Text for when some shoes share an issue.
    profile is forwarded to _issue_implication for scan-aware disambiguation."""
    verb = _dim_verb(dim)

    # Try to name the specific shoe(s) with this issue
    shoe_name = None
    affected_shoe = None
    if shoes and count == 1:
        for s in shoes:
            fit = s.get("fit", {})
            if fit.get(dim) == rating:
                shoe_name = f"{s.get('brand', '')} {s.get('model', '')}".strip()
                affected_shoe = s
                break

    # When count == 1 we know exactly which shoe to inspect, so we can
    # use the shoe-aware variant of the toe-squeezed cause helper.
    if count == 1 and dim == "toes" and rating == "squeezed" and affected_shoe:
        cause = _toes_squeezed_cause(profile, affected_shoe) or \
                "This may be a toe shape mismatch or aggressive sizing."
        if shoe_name:
            return f"Your {shoe_name}'s {dim} {verb} {rating}. {cause}"
        return f"In one of your {total} shoes, the {dim} {verb} {rating}. {cause}"

    impl = _issue_implication(dim, rating, profile=profile)
    if count == 1 and total == 2:
        if shoe_name:
            return f"Your {shoe_name}'s {dim} {verb} {rating}. {impl}"
        return f"In one of your two shoes, the {dim} {verb} {rating}. {impl}"
    return f"In {count} of your {total} shoes, the {dim} {verb} {rating}. {impl}"


def _contradiction_text(dim, non_perfect, perfect_count, total, shoes=None):
    """Text for contradictory fit ratings on one dimension."""
    parts = sorted(non_perfect.items(), key=lambda x: -x[1])

    # Helper: find shoe names for a given rating on a dimension
    def _shoes_with_rating(rating):
        if not shoes:
            return []
        return [f"{s.get('brand','')} {s.get('model','')}".strip()
                for s in shoes if (s.get("fit") or {}).get(dim) == rating]

    if dim == "heel":
        if "empty" in non_perfect and "tight" in non_perfect:
            empty_names = _shoes_with_rating("empty")
            tight_names = _shoes_with_rating("tight")
            if empty_names and tight_names:
                empty_str = " and ".join(empty_names)
                tight_str = " and ".join(tight_names)
                return (
                    f"Your heel fit is inconsistent: it feels empty in the {empty_str} "
                    f"but tight in the {tight_str}. "
                    "This usually means the shoes have different heel cup shapes rather than your foot being "
                    "hard to fit. The tight-heeled shoe likely has a narrower or more sculpted heel cup, "
                    "while the empty one is wider or deeper in the back."
                )
            return (
                f"Your heel fit is inconsistent: it feels empty in some shoes but tight in others. "
                "This usually means the shoes have different heel cup shapes rather than your foot being "
                "hard to fit. The shoes where the heel is tight likely have a narrower or more sculpted heel, "
                "while the empty-heel shoes are wider or deeper in the back."
            )
        elif "empty" in non_perfect:
            empty_count = non_perfect["empty"]
            return (
                f"Your heel feels empty in {empty_count} of your {total} shoes. "
                + _issue_implication("heel", "empty")
            )
    elif dim == "toes":
        if "squeezed" in non_perfect and "roomy" in non_perfect:
            return (
                f"Your toe fit varies: squeezed in some shoes, roomy in others. "
                "This points to different toe box shapes across your shoes rather than a universal sizing issue. "
                "The shoes where toes are squeezed likely have a different toe form than your foot shape."
            )
    elif dim == "forefoot":
        if "tight" in non_perfect and "loose" in non_perfect:
            return (
                f"Your forefoot fit is split: tight in some shoes, loose in others. "
                "This reflects different forefoot widths across shoe models. "
                "The tight ones may be LV or narrow-last shoes, while the loose ones are wider or HV builds."
            )

    # Generic
    items = ", ".join(f"{r} in {c}" for r, c in parts)
    return f"Your {dim} fit varies across shoes ({items}), reflecting different shoe geometries."


def _issue_implication(dim, rating, profile=None):
    """One-sentence implication for a fit issue.

    When ``profile`` is provided, the heel-empty and toes-squeezed cases use
    scan-based disambiguation instead of pointing the user at the scan
    section above. Falls back to a generic line when scan data isn't
    decisive.
    """
    if dim == "heel" and rating == "empty":
        cause = _heel_empty_cause(profile)
        if cause:
            # cause already starts with ', and given...' — strip the leading
            # ', and ' so it reads naturally as a standalone sentence opener.
            cleaned = cause.lstrip(", ").lstrip()
            if cleaned.startswith("and "):
                cleaned = cleaned[4:]
            return f"This points to a heel shape mismatch. {cleaned[:1].upper() + cleaned[1:]}."
        return "This points to a heel shape mismatch on either the width or depth axis."

    if dim == "toes" and rating == "squeezed":
        cause = _toes_squeezed_cause(profile, shoe=None)
        if cause:
            return cause
        return "This may be a toe shape mismatch or aggressive sizing."

    implications = {
        ("heel", "tight"): (
            "This suggests your heel is wider or deeper than these heel cups allow."
        ),
        ("toes", "roomy"): (
            "You may benefit from a more aggressive downsize or a shoe with a shorter toe box."
        ),
        ("forefoot", "tight"): (
            "This points to your foot being wider in the ball area than these shoes allow."
        ),
        ("forefoot", "loose"): (
            "The shoe has more forefoot volume than your foot needs."
        ),
    }
    return implications.get((dim, rating), "")


def _para_heel_soft_conformance(profile, shoes):
    """Mirror of `_para_toe_form_mismatch` but for the heel cup.

    When a soft shoe (db_stiffness < 0.4) has a perfect-feeling heel despite
    the scan suggesting the heel cup's *rated* volume is the wrong fit,
    that perfect feel may be the soft upper conforming, not the cup shape
    matching. A stiffer shoe with the same heel cup spec won't be as
    forgiving.

    Trigger conditions:
      * shoe is soft (db_stiffness < 0.4) AND heel fits perfectly
      * AND user scan is extreme on one heel axis (narrow/wide/shallow/deep)
      * AND the shoe's db_heel_volume is on the OPPOSITE end (or the
        normal side) of what that extreme scan would normally need
    """
    if not profile or not shoes:
        return None

    hw = (profile.get("heel_width_class") or "").lower()
    hd = (profile.get("heel_depth_class") or "").lower()
    narrow  = "narrow"  in hw
    wide    = "wide"    in hw
    shallow = "shallow" in hd
    deep    = "deep"    in hd
    if not (narrow or wide or shallow or deep):
        return None  # no extreme scan axis to clash with

    for s in shoes:
        heel = (s.get("fit") or {}).get("heel", "")
        if heel != "perfect":
            continue
        stiff = s.get("db_stiffness") or 0.5
        if stiff >= 0.4:
            continue
        hv = (s.get("db_heel_volume") or "").lower()
        if not hv:
            continue

        # Volume mismatch: scan suggests narrow cup needed but shoe is medium/wide,
        # or scan suggests wide cup but shoe is narrow.
        mismatch = False
        if narrow and hv in ("medium", "wide"):
            mismatch = True
            scan_phrase = "your narrow heel"
            cup_phrase  = f"this shoe's {hv} heel volume"
        elif wide and hv == "narrow":
            mismatch = True
            scan_phrase = "your wide heel"
            cup_phrase  = "this shoe's narrow heel volume"
        elif shallow and hv in ("medium", "wide"):
            mismatch = True
            scan_phrase = "your shallow heel"
            cup_phrase  = f"this shoe's {hv} heel cup"
        elif deep and hv == "narrow":
            mismatch = True
            scan_phrase = "your deep heel"
            cup_phrase  = "this shoe's narrow heel cup"

        if not mismatch:
            continue

        return (
            f"Your {s['brand']} {s['model']} fits perfectly in the heel even though "
            f"{scan_phrase} and {cup_phrase} are not an obvious match on paper. This "
            f"works because the shoe is soft enough for the upper to conform around "
            f"the cup shape. In a stiffer shoe with the same heel-volume spec, the "
            f"upper would be less forgiving and the heel could feel off, so weight "
            f"this fit data more carefully when comparing across stiffness tiers."
        )

    return None


def _para_heel_volume_vs_shape(profile, shoes):
    """Anchor-shoe contradiction: when a user has BOTH a perfect-heel shoe
    and an empty-heel shoe, AND those two shoes share the same db_heel_volume
    rating, the differentiating factor cannot be heel volume. The real cause
    is the heel cup *shape* (sculpting, taper, asymmetric cradle, padding
    distribution), not the rated volume.

    This paragraph protects the user from chasing the wrong axis. Without it,
    'narrow heel volume' becomes the implicit recommendation for the empty
    shoe — but if their perfect-heel shoe is already narrow, more 'narrow
    volume' won't help. They need a different cup shape.
    """
    if not shoes or len(shoes) < 2:
        return None

    perfect_heel = []
    empty_heel = []
    for s in shoes:
        heel = (s.get("fit") or {}).get("heel", "")
        hv   = (s.get("db_heel_volume") or "").lower()
        if not hv:
            continue
        if heel == "perfect":
            perfect_heel.append(s)
        elif heel in ("empty", "loose"):
            empty_heel.append(s)

    if not perfect_heel or not empty_heel:
        return None

    # Look for a same-volume contradiction across the two groups.
    for ps in perfect_heel:
        ps_hv = (ps.get("db_heel_volume") or "").lower()
        for es in empty_heel:
            es_hv = (es.get("db_heel_volume") or "").lower()
            if ps_hv and es_hv and ps_hv == es_hv:
                return (
                    f"There is an important contradiction in your shoes: your "
                    f"{ps['brand']} {ps['model']} fits perfectly in the heel, while your "
                    f"{es['brand']} {es['model']} feels empty, and both shoes carry the same "
                    f"{ps_hv} heel-volume rating. That rules out heel volume as the cause. "
                    f"The real difference is heel cup shape: how the cup sculpts, tapers, and "
                    f"cradles the back of your foot. So when shopping, do not just chase "
                    f"\"narrow heel volume\" labels; look for shoes built on a similar heel "
                    f"cup shape to your {ps['model']} (often signalled by reviews mentioning "
                    f"a snug or anatomic heel cradle, not just narrow volume)."
                )

    return None


def _para_brand_inconsistency(shoes, street):
    """When two pairs of the same brand sit at very different relative
    downsizes AND only one fits well, flag the brand's internal model
    inconsistency. This stops the user from blaming their own sizing
    when the issue is the brand's last varying across models.

    Fires only when:
      * >= 2 shoes from the same brand have a known size_eu
      * relative-downsize spread >= 0.75 sizes
      * one shoe is at least 'good' fit (>=2 perfect dims, no severe issues),
        the other has at least one severe issue (empty/squeezed/loose)
    """
    if not shoes or street is None:
        return None

    by_brand = {}
    for s in shoes:
        if s.get("brand") and s.get("size_eu") is not None:
            by_brand.setdefault(s["brand"], []).append(s)

    for brand, group in by_brand.items():
        if len(group) < 2:
            continue

        # Annotate each with relative downsize and a fit-quality score.
        annotated = []
        for s in group:
            _, rel, label = _relative_downsize(street, s["size_eu"], brand)
            fit = s.get("fit") or {}
            perfect = sum(1 for v in fit.values() if v == "perfect")
            severe  = any(v in ("empty", "squeezed", "loose")
                          for v in fit.values())
            annotated.append({
                "shoe": s, "rel": rel, "label": label,
                "perfect": perfect, "severe": severe,
            })

        rels = [a["rel"] for a in annotated]
        spread = max(rels) - min(rels)
        if spread < 0.75:
            continue

        # Find a "fits well" candidate and a "has issues" candidate.
        good = max(annotated, key=lambda a: (a["perfect"], -a["severe"]))
        bad  = min(annotated, key=lambda a: (a["perfect"], -a["severe"]))
        if good is bad:
            continue
        if good["perfect"] < 2 or not bad["severe"]:
            continue

        good_s = good["shoe"]
        bad_s  = bad["shoe"]
        bad_fit = bad_s.get("fit") or {}
        bad_problems = [f"{k} {v}" for k, v in bad_fit.items()
                        if v in ("empty", "squeezed", "loose", "tight", "roomy")]
        problem_phrase = ", ".join(bad_problems) if bad_problems else "an off fit"

        return (
            f"Worth noting: within {brand}, your {good_s['model']} "
            f"fits well at {good['label']} sizing, while your {bad_s['model']} "
            f"at {bad['label']} sizing has {problem_phrase}. That spread of "
            f"{spread:.1f} sizes between two pairs of the same brand is a sign that "
            f"{brand}'s lasts vary meaningfully across models. So when picking your next "
            f"{brand} shoe, treat each model's last on its own rather than assuming the "
            f"brand-typical downsize will land the same way."
        )

    return None


def _para_anchor(shoes, street):
    """Identify the anchor shoe and explain why it matters."""
    anchor, score = _find_anchor(shoes, street)
    if anchor is None:
        return None

    fit = anchor.get("fit", {})
    perfect_dims = [d for d in ("heel", "toes", "forefoot") if fit.get(d) == "perfect"]
    # Use .get() so a shoe missing one of the three dims doesn't crash
    # the pipeline -- the frontend validator now guarantees all three are
    # present, but older rows or direct Supabase edits can still be sparse.
    imperfect_dims = {
        d: fit.get(d)
        for d in ("heel", "toes", "forefoot")
        if fit.get(d) and fit.get(d) != "perfect"
    }

    def _dim_are(d, r):
        """'toes are squeezed' vs 'heel is empty'."""
        verb = "are" if d == "toes" else "is"
        return f"{d} {verb} {r}"

    brand = anchor["brand"]
    model = anchor["model"]
    size = anchor.get("size_eu")

    if len(perfect_dims) == 3:
        # Perfect anchor -- the fit_patterns paragraph already says
        # "reliable reference for finding similar shapes", so adding
        # another anchor paragraph is redundant.  Skip entirely.
        if size is not None:
            if len(shoes) == 1:
                return None  # fit_patterns already covers this
            else:
                return None  # fit_patterns already covers this
        else:
            return (
                f"Your {brand} {model} fits perfectly, but without a size on file "
                "we rely on your street size for recommendations."
            )
    elif len(perfect_dims) >= 2:
        imperfect_notes = ", ".join(_dim_are(d, r) for d, r in imperfect_dims.items())
        perfect_list = " and ".join(perfect_dims)
        if size is not None:
            if len(shoes) == 1:
                # Single shoe -- "closest to perfect" is meaningless,
                # say what works and what doesn't
                return (
                    f"Your {brand} {model} in EU {size} fits well on {perfect_list}, "
                    f"though the {imperfect_notes}. "
                    "We use it as the sizing anchor and focus on finding shoes "
                    "that improve the areas where it falls short."
                )
            else:
                # Check if multiple shoes share the same score
                # to avoid "closest to perfect" when it's not meaningfully distinct
                return (
                    f"Your {brand} {model} in EU {size} has the fewest fit issues "
                    f"among your shoes ({imperfect_notes}). "
                    "We use it as the anchor for sizing recommendations "
                    "and focus on improving the areas where it falls short."
                )
    else:
        # No great anchor -- multiple issues
        if len(shoes) == 1:
            imperfect_notes = ", ".join(_dim_are(d, r) for d, r in imperfect_dims.items())
            # Also highlight what IS perfect -- valuable reference data
            perfect_notes = ""
            if perfect_dims:
                if len(perfect_dims) == 1:
                    perfect_notes = (
                        f" The {perfect_dims[0]} fit is excellent and we preserve "
                        "that geometry in our recommendations."
                    )
                else:
                    perfect_notes = (
                        f" The {' and '.join(perfect_dims)} fit well, and we "
                        "preserve that geometry in our recommendations."
                    )
            if size is not None:
                return (
                    f"Your only reference shoe is the {brand} {model} in EU {size} "
                    f"({imperfect_notes}). "
                    "We use it as the sizing anchor and focus on finding shoes that "
                    f"address the areas where it falls short.{perfect_notes}"
                )
            else:
                return (
                    f"Your only reference shoe is the {brand} {model} ({imperfect_notes}). "
                    f"Without a size on record, we rely on your street size for recommendations."
                    f"{perfect_notes}"
                )
        else:
            # Multiple shoes, none perfect -- pick the one used and note
            if size is not None:
                return (
                    f"None of your shoes fit perfectly across all dimensions. "
                    f"We use your {brand} {model} in EU {size} as the best available reference, "
                    "as it has the fewest fit issues."
                )

    return None


# ── Toe form mismatch detection ──────────────────────────────────────────

_TOE_SHAPE_LABELS = {"greek": "Greek", "egyptian": "Egyptian", "roman": "Roman"}

def _para_toe_form_mismatch(profile, shoes):
    """Note when user's toe shape doesn't match shoe's toe form but toes fit fine.
    This happens when soft shoes conform around the mismatch -- important context
    because stiffer shoes won't be as forgiving."""
    toe_shape = (profile.get("toe_shape") or "").lower()
    if not toe_shape:
        return None

    mismatched_ok = []
    for s in shoes:
        toe_forms = s.get("db_toe_form") or []
        toe_forms_lower = [t.lower() for t in toe_forms]
        if not toe_forms_lower:
            continue
        fit = s.get("fit", {})
        toes_ok = fit.get("toes") in ("perfect", "good", "")
        ff_ok = fit.get("forefoot") == "perfect"
        stiff = s.get("db_stiffness") or 0.5
        is_soft = stiff < 0.40  # soft to moderate-soft

        if toe_shape not in toe_forms_lower and toes_ok and ff_ok and is_soft:
            mismatched_ok.append((s, toe_forms_lower))

    if not mismatched_ok:
        return None

    s, shoe_forms = mismatched_ok[0]
    shoe_form = shoe_forms[0]
    user_label = _TOE_SHAPE_LABELS.get(toe_shape, toe_shape)
    shoe_label = _TOE_SHAPE_LABELS.get(shoe_form, shoe_form)

    if toe_shape == "greek":
        toe_detail = "your longer second toe"
    elif toe_shape == "roman" and shoe_form == "egyptian":
        toe_detail = "your evenly spread toes"
    else:
        toe_detail = "your toe shape"

    return (
        f"Your {s['brand']} {s['model']} is built on an {shoe_label} toe form, "
        f"yet your {user_label} toes feel fine. This works because the shoe is soft "
        f"enough for its upper to conform around {toe_detail}. "
        f"In a stiffer shoe with the same {shoe_label} last, the toe box would be less "
        f"forgiving and may cause pressure."
    )


# ── Shallow heel depth insight ──────────────────────────────────────────

def _para_heel_depth_insight(profile, shoes):
    """When heel_depth is shallow: explain the heel depth issue.

    Two scenarios:
    1. Heels are EMPTY: the classic case -- explain depth vs width, reference
       exception shoe if one exists.
    2. Heels are PERFECT despite extreme scan (narrow + shallow): the reverse
       case -- the shoe proves the right geometry works.  This is valuable
       data because it anchors what to look for in recommendations.
    """
    heel_depth_cls = (profile.get("heel_depth_class") or "").lower()
    if "shallow" not in heel_depth_cls:
        return None

    empty_shoes = []
    perfect_heel_shoes = []
    for s in shoes:
        heel_fit = (s.get("fit") or {}).get("heel", "")
        if heel_fit in ("empty", "loose"):
            empty_shoes.append(s)
        elif heel_fit == "perfect":
            perfect_heel_shoes.append(s)

    heel_width_cls = (profile.get("heel_width_class") or "").lower()
    n = len(shoes)
    n_empty = len(empty_shoes)

    # ── Scenario 2: all heels perfect despite shallow scan ──
    # (No empty shoes, but perfect heels in a shallow-scan user)
    if not empty_shoes and perfect_heel_shoes:
        # Only fire when heel scan is notably non-normal
        hw_narrow = "narrow" in heel_width_cls
        if not hw_narrow:
            return None  # normal width + shallow + perfect = not remarkable
        s = perfect_heel_shoes[0]
        hv = s.get("db_heel_volume", "medium")
        return (
            f"Your scan shows a narrow, shallow heel that would normally "
            f"cause an empty feel in most shoes. Yet your {s['brand']} "
            f"{s['model']} ({hv} heel volume) fits perfectly. "
            "This is a valuable reference: look for shoes with similarly "
            "narrow heel cups."
        )

    # ── Scenario 1: heels are empty ──
    if not empty_shoes:
        return None

    # Only fire when empty heels are a significant pattern (majority or single shoe)
    if n > 1 and n_empty < n * 0.5:
        return None

    parts = []

    # Core insight: it is depth, not width
    if "narrow" not in heel_width_cls and "wide" not in heel_width_cls:
        # Normal heel width + shallow depth = depth is the issue
        parts.append(
            "Your scan shows average heel width but a shallow heel profile. "
            "Your heel does not project backward as much as most feet. "
            "Standard heel cups are designed for a heel that fills the back "
            "of the cup, so a shallow heel leaves dead space even when the "
            "width is right."
        )
    elif "narrow" in heel_width_cls:
        parts.append(
            "Your scan shows a narrow, shallow heel. Both width and depth "
            "contribute to the empty feel. The shallow profile means your heel "
            "sits forward in the cup, leaving dead space at the back even in "
            "narrow-volume shoes."
        )
    else:
        # Wide heel + shallow -- unusual combo
        parts.append(
            "Your scan shows a shallow heel profile. Despite your wider heel, "
            "the shallow projection means heel cups can still feel empty at the "
            "back because your heel does not fill the depth of the cup."
        )

    # Exception shoe: the one that works
    if perfect_heel_shoes and n_empty >= 1:
        s = perfect_heel_shoes[0]
        hv = s.get("db_heel_volume", "medium")
        parts.append(
            f"The exception is your {s['brand']} {s['model']}, whose {hv} "
            f"heel cup fits your heel perfectly. This tells us the right heel "
            "cup can solve the problem entirely. We prioritize shoes with "
            f"similarly {hv} heel volume."
        )

    return " ".join(parts) if parts else None


# ── Main generator ──────────────────────────────────────────────────────

# ════════════════════════════════════════════════════════════════════════
# §2 CASCADE IMPLEMENTATION (Roman 2026-04-30 locked design)
# ════════════════════════════════════════════════════════════════════════
# Each fit issue runs a decision tree A -> B -> C -> D (or A..E for toes
# squeezed). Only ONE sentence fires per (shoe, dim, rating). N>1 ALL =
# aggregate (no shoe names). N>1 MINORITY = cascade for affected shoe
# only. Contradiction = dedicated sentence.
# ════════════════════════════════════════════════════════════════════════

def _vol_rank(label):
    """0=narrow, 1=medium/normal, 2=wide.  None if unknown."""
    if not label:
        return None
    l = label.lower()
    if "narrow" in l:                 return 0
    if "wide" in l:                   return 2
    if "normal" in l or "medium" in l: return 1
    return None


def _clean_width(label):
    """'narrow heel' -> 'narrow'; 'wide forefoot' -> 'wide'; 'normal' -> 'normal'."""
    if not label:
        return ""
    return (label.replace(" heel", "").replace(" forefoot", "").strip()
            or "normal")


def _name(shoe):
    return f"{shoe.get('brand', '')} {shoe.get('model', '')}".strip() or "this shoe"


def _possessive(name):
    """Form the possessive of a shoe name without producing 's's' on names
    that already end in 's (e.g. 'Tarantulace Women's').

    Roman 2026-05-01 audit S11.

      'Skwama'             -> "Skwama's"
      'Solution'           -> "Solution's"
      'Tarantulace Women's'-> "Tarantulace Women's"   (already possessive)
      'Solutions'          -> "Solutions'"            (plural-style)
    """
    if not name:
        return ""
    lower = name.lower()
    if lower.endswith("'s"):
        return name              # already possessive — don't double-mark
    if lower.endswith("s"):
        return name + "'"        # plural-style possessive
    return name + "'s"


def _toe_label(toe):
    """Capitalize a toe-shape token for user-facing prose.

    Roman 2026-05-01 audit S13/S18: cascade outputs and aggregates were
    interpolating 'egyptian/greek/roman' lowercase; §1 already uses
    'Egyptian/Greek/Roman'. Single source of truth here.
    """
    if not toe:
        return ""
    return _TOE_SHAPE_LABELS.get(toe.lower(), toe.capitalize())


def _sizing_status(shoe, street):
    """Returns (status, raw_downsize, user_ds_label, typical_ds_label, typical_value).

    status in {'under', 'typical', 'over', None}. Threshold +/-0.5.

    Roman 2026-05-01 audit S6: also returns raw downsize so cascades can
    distinguish 'user downsized but less than typical' (raw>0) from
    'user at street size' (raw==0) from 'user upsized' (raw<0).
    Cascade C wording branches on this.
    """
    if not street or not shoe.get("size_eu"):
        return None, None, None, None, None
    raw, _, _ = _relative_downsize(street, shoe["size_eu"], shoe.get("brand", ""))
    typical = _brand_typical(shoe.get("brand", ""))
    if typical is None:
        return None, None, None, None, None
    diff = raw - typical
    if diff <= -0.5:
        status = "under"
    elif diff >= 0.5:
        status = "over"
    else:
        status = "typical"
    return (status, raw, _downsize_label_raw(raw),
            _downsize_label_raw(typical), typical)


def _under_downsize_clause(brand, raw, user_ds, typical_ds, typical_value, street):
    """Sentence fragment for cascade C suggesting 'go down further'.

    Branches on whether user downsized at all (raw>0), is at street size
    (raw==0), or upsized (raw<0). Roman 2026-05-01 audit S6 + post-fix.

    typical_ds already encodes its own position (e.g. 'at street size',
    'one size down', '1.5 sizes down'), so we don't append 'down from
    street' anywhere -- that double-marks the direction.
    """
    if raw > 0:
        # User downsized but less than typical.
        return (f"You only downsized {user_ds} vs the usual "
                f"{typical_ds} for {brand}")
    if raw == 0:
        return (f"You're wearing your {brand} at street size, while the "
                f"typical for {brand} is {typical_ds}")
    # raw < 0 -> user upsized
    return (f"You're wearing your {brand} {user_ds}, while the typical for "
            f"{brand} is {typical_ds}")


def _over_downsize_clause(brand, raw, user_ds, typical_ds):
    """Sentence fragment for cascade C suggesting 'go up half a size'."""
    return (f"You downsized {user_ds}, more aggressive than the usual "
            f"{typical_ds} for {brand}")


def _fit_summary_clause(brand, status, user_ds, typical_ds):
    """Cascade D: sentence fragment about sizing relative to brand-typical.

    Roman 2026-05-01 audit S3: previous version always claimed 'sized
    typically' even when user was over/under-downsized but cascade C
    didn't fire (e.g. over-downsized + toes roomy). Branches on actual
    sizing status now.
    """
    if status == "typical" or status is None:
        return f"you're sized typically for {brand}"
    if status == "under":
        return (f"you're sized {user_ds} (less aggressive than the typical "
                f"{typical_ds} for {brand}, which doesn't drive this issue)")
    return (f"you're sized {user_ds} (more aggressive than the typical "
            f"{typical_ds} for {brand}, which doesn't drive this issue)")


def _toe_match(profile, shoe):
    """True if user's toe shape is in shoe.db_toe_form list."""
    user_toe = (profile.get("toe_shape") or "").lower()
    shoe_forms = shoe.get("db_toe_form") or []
    if isinstance(shoe_forms, str):
        shoe_forms = [shoe_forms]
    forms_lower = [str(f).lower() for f in shoe_forms]
    return user_toe in forms_lower


# ─── Cascade: HEEL EMPTY ────────────────────────────────────────────────

def _cascade_heel_empty(shoe, profile, street):
    name = _name(shoe)
    brand = shoe.get("brand", "")
    shoe_hv  = shoe.get("db_heel_volume")
    user_hw  = profile.get("heel_width_class")
    user_hd  = (profile.get("heel_depth_class") or "").lower()
    shoe_r   = _vol_rank(shoe_hv)
    user_r   = _vol_rank(user_hw)

    # A: shoe heel volume rank > user heel width rank
    if shoe_r is not None and user_r is not None and shoe_r > user_r:
        return (f"Your {name} has a {_clean_width(shoe_hv)} heel volume while "
                f"your heel is {_clean_width(user_hw)}. The wider cup is the "
                f"most likely cause of the empty feel.")

    # B: width matches + user has shallow heel
    if "shallow" in user_hd:
        return (f"Your {_possessive(name)} {_clean_width(shoe_hv) or 'heel'} volume matches "
                f"your {_clean_width(user_hw)} heel width, but your shallow heel "
                f"may not fill deeply sculpted cups. The cause is likely heel "
                f"depth, so try shoes with a flatter, less sculpted heel cup.")

    # C: width and depth check out, but user under-downsized -> suggest going smaller
    status, raw, user_ds, typical_ds, typical_value = _sizing_status(shoe, street)
    if status == "under":
        clause = _under_downsize_clause(brand, raw, user_ds, typical_ds,
                                        typical_value, profile.get("street_size_eu"))
        return (f"Comparing your {name} to your foot profile, it should fit. "
                f"{clause}, so going down further could tighten the heel and "
                f"reduce the empty feel.")

    # D: width + depth fit; sizing is either typical or over-downsized
    # (over-downsized is fine for empty heel, just doesn't fix it).
    fit_clause = _fit_summary_clause(brand, status, user_ds, typical_ds)
    return (f"Your {name} should fit based on heel width and depth, and "
            f"{fit_clause}. In the recommendations we aim for even narrower "
            f"heel cups.")


# ─── Cascade: HEEL TIGHT ────────────────────────────────────────────────

def _cascade_heel_tight(shoe, profile, street):
    name = _name(shoe)
    brand = shoe.get("brand", "")
    shoe_hv = shoe.get("db_heel_volume")
    user_hw = profile.get("heel_width_class")
    user_hd = (profile.get("heel_depth_class") or "").lower()
    shoe_r  = _vol_rank(shoe_hv)
    user_r  = _vol_rank(user_hw)

    # A: shoe heel volume narrower than user heel width
    if shoe_r is not None and user_r is not None and shoe_r < user_r:
        return (f"Your {name} has a {_clean_width(shoe_hv)} heel volume while "
                f"your heel is {_clean_width(user_hw)}. The narrower cup is the "
                f"most likely cause of the tight feel.")

    # B: width matches + user has deep heel
    if "deep" in user_hd:
        return (f"Your {_possessive(name)} {_clean_width(shoe_hv) or 'heel'} volume matches "
                f"your {_clean_width(user_hw)} heel width, but your deep heel may "
                f"not fit cups designed for less backward projection. The cause "
                f"is likely heel depth, so try shoes with a deeper, more "
                f"sculpted heel cup.")

    # C: width + depth fit, user over-downsized -> suggest going up
    status, raw, user_ds, typical_ds, typical_value = _sizing_status(shoe, street)
    if status == "over":
        clause = _over_downsize_clause(brand, raw, user_ds, typical_ds)
        return (f"Comparing your {name} to your foot profile, it should fit. "
                f"{clause}, so going up half a size could relieve the tightness.")

    # D: width + depth fit; typical or under-downsized (under doesn't fix tight)
    fit_clause = _fit_summary_clause(brand, status, user_ds, typical_ds)
    return (f"Your {name} should fit based on heel width and depth, and "
            f"{fit_clause}. In the recommendations we aim for slightly roomier "
            f"heel cups.")


# ─── Cascade: TOES SQUEEZED (5-step) ────────────────────────────────────

def _cascade_toes_squeezed(shoe, profile, street):
    name = _name(shoe)
    brand = shoe.get("brand", "")
    user_toe  = (profile.get("toe_shape") or "egyptian").lower()
    user_fw   = profile.get("forefoot_width_class")
    arch_cls  = (profile.get("arch_length_class") or "").lower()
    shoe_w    = shoe.get("db_width")
    shoe_w_r  = _vol_rank(shoe_w)
    user_fw_r = _vol_rank(user_fw)

    # A: toe shape mismatch
    # Roman 2026-05-01 audit S13/S18: capitalize toe-shape labels (Egyptian/Greek/Roman)
    # for consistency with §1 prose.
    if not _toe_match(profile, shoe):
        shoe_forms = shoe.get("db_toe_form") or []
        if isinstance(shoe_forms, str): shoe_forms = [shoe_forms]
        shoe_form_str = "/".join(_toe_label(str(f)) for f in shoe_forms) or "different"
        user_lbl = _toe_label(user_toe)
        article = "an" if shoe_form_str[:1].lower() in "aeiou" else "a"
        return (f"Your {name} is built on {article} {shoe_form_str} toe form "
                f"while you have {user_lbl} toes. The mismatch is the most "
                f"likely cause; look for shoes with a {user_lbl}-compatible "
                f"toe box.")

    # B: toe shape matches + wide forefoot in narrower last
    if (_clean_width(user_fw) == "wide" and shoe_w_r is not None
            and user_fw_r is not None and shoe_w_r < user_fw_r):
        return (f"Your {_possessive(name)} toe shape matches your {_toe_label(user_toe)} foot, but "
                f"your wide forefoot in this {_clean_width(shoe_w)} last is "
                f"likely causing the squeeze. Look for wider lasts.")

    # C: toe shape + width fit + long arch
    if "long" in arch_cls:
        return (f"Your {_possessive(name)} toe shape and width match your foot, but your "
                f"long arch may push the ball of your foot into the toe box. "
                f"Look for shoes with a shorter toe box to relieve the squeeze.")

    # D: toe + width + arch fit, over-downsized -> suggest going up
    status, raw, user_ds, typical_ds, typical_value = _sizing_status(shoe, street)
    if status == "over":
        clause = _over_downsize_clause(brand, raw, user_ds, typical_ds)
        return (f"Comparing your {name} to your foot profile, it should fit. "
                f"{clause}, so going up half a size could relieve the squeeze.")

    # E: typical or under-downsized (under doesn't fix squeezed)
    fit_clause = _fit_summary_clause(brand, status, user_ds, typical_ds)
    return (f"Your {name} should fit based on toe form, forefoot width and "
            f"arch, and {fit_clause}. In the recommendations we aim for "
            f"slightly more toe room.")


# ─── Cascade: TOES ROOMY (4-step) ───────────────────────────────────────

def _cascade_toes_roomy(shoe, profile, street):
    name = _name(shoe)
    brand = shoe.get("brand", "")
    user_toe  = (profile.get("toe_shape") or "egyptian").lower()
    user_fw   = profile.get("forefoot_width_class")
    shoe_w    = shoe.get("db_width")
    shoe_w_r  = _vol_rank(shoe_w)
    user_fw_r = _vol_rank(user_fw)

    # A: toe shape mismatch
    # Roman 2026-05-01 audit S13/S18: capitalize toe-shape labels.
    if not _toe_match(profile, shoe):
        shoe_forms = shoe.get("db_toe_form") or []
        if isinstance(shoe_forms, str): shoe_forms = [shoe_forms]
        shoe_form_str = "/".join(_toe_label(str(f)) for f in shoe_forms) or "different"
        user_lbl = _toe_label(user_toe)
        article = "an" if shoe_form_str[:1].lower() in "aeiou" else "a"
        return (f"Your {name} is built on {article} {shoe_form_str} toe form "
                f"while you have {user_lbl} toes. The mismatch likely leaves "
                f"dead space at your second toe; look for shoes with a "
                f"{user_lbl}-compatible toe box.")

    # B: toe shape matches + narrow user in wider shoe
    if (_clean_width(user_fw) == "narrow" and shoe_w_r is not None
            and user_fw_r is not None and shoe_w_r > user_fw_r):
        return (f"Your {_possessive(name)} toe shape matches your foot, but the "
                f"{_clean_width(shoe_w)} forefoot is wider than your narrow "
                f"forefoot. Look for narrower lasts.")

    # C: toe + width fit + under-downsized -> suggest going smaller
    status, raw, user_ds, typical_ds, typical_value = _sizing_status(shoe, street)
    if status == "under":
        clause = _under_downsize_clause(brand, raw, user_ds, typical_ds,
                                        typical_value, profile.get("street_size_eu"))
        return (f"Comparing your {name} to your foot profile, it should fit. "
                f"{clause}, so going down half a size could tighten the toe box.")

    # D: typical or over-downsized (over doesn't fix roomy)
    fit_clause = _fit_summary_clause(brand, status, user_ds, typical_ds)
    return (f"Your {name} should fit based on toe form and forefoot width, "
            f"and {fit_clause}. In the recommendations we aim for snugger "
            f"toe boxes.")


# ─── Cascade: FOREFOOT TIGHT (4-step) ───────────────────────────────────

def _cascade_ff_tight(shoe, profile, street):
    name = _name(shoe)
    brand = shoe.get("brand", "")
    user_fw   = profile.get("forefoot_width_class")
    arch_cls  = (profile.get("arch_length_class") or "").lower()
    shoe_w    = shoe.get("db_width")
    shoe_w_r  = _vol_rank(shoe_w)
    user_fw_r = _vol_rank(user_fw)

    # A: width mismatch (shoe narrower than user forefoot)
    if (shoe_w_r is not None and user_fw_r is not None
            and shoe_w_r < user_fw_r):
        return (f"Your {_possessive(name)} {_clean_width(shoe_w)} forefoot is narrower "
                f"than your {_clean_width(user_fw)} forefoot. The width "
                f"mismatch is the most likely cause.")

    # B: width matches + long arch
    if "long" in arch_cls:
        return (f"Your {_possessive(name)} width matches your forefoot, but your long "
                f"arch may push the ball forward into the toe box. Look for "
                f"shoes with a shorter toe box.")

    # C: width + arch fit + over-downsized -> suggest going up
    status, raw, user_ds, typical_ds, typical_value = _sizing_status(shoe, street)
    if status == "over":
        clause = _over_downsize_clause(brand, raw, user_ds, typical_ds)
        return (f"Comparing your {name} to your foot profile, it should fit. "
                f"{clause}, so half a size up could relieve the tightness.")

    # D: typical or under-downsized (under doesn't fix tight)
    fit_clause = _fit_summary_clause(brand, status, user_ds, typical_ds)
    return (f"Your {name} should fit based on width and arch, and "
            f"{fit_clause}. In the recommendations we aim for slightly wider "
            f"forefoots.")


# ─── Cascade: FOREFOOT LOOSE (3-step) ───────────────────────────────────

def _cascade_ff_loose(shoe, profile, street):
    name = _name(shoe)
    brand = shoe.get("brand", "")
    user_fw   = profile.get("forefoot_width_class")
    shoe_w    = shoe.get("db_width")
    shoe_w_r  = _vol_rank(shoe_w)
    user_fw_r = _vol_rank(user_fw)

    # A: shoe wider than user forefoot
    if (shoe_w_r is not None and user_fw_r is not None
            and shoe_w_r > user_fw_r):
        return (f"Your {_possessive(name)} {_clean_width(shoe_w)} forefoot is wider than "
                f"your {_clean_width(user_fw)} forefoot. The width mismatch is "
                f"the most likely cause of the loose feel.")

    # B: width matches + under-downsized -> suggest going smaller
    status, raw, user_ds, typical_ds, typical_value = _sizing_status(shoe, street)
    if status == "under":
        clause = _under_downsize_clause(brand, raw, user_ds, typical_ds,
                                        typical_value, profile.get("street_size_eu"))
        return (f"Comparing your {name} to your foot profile, it should fit. "
                f"{clause}, so going down further could tighten the forefoot.")

    # C: typical or over-downsized (over doesn't fix loose)
    fit_clause = _fit_summary_clause(brand, status, user_ds, typical_ds)
    return (f"Your {name} should fit based on width, and {fit_clause}. "
            f"In the recommendations we aim for snugger forefoots.")


# ─── Aggregate (N>1 ALL) sentences ──────────────────────────────────────

def _aggregate_heel_empty(shoes, profile):
    user_hw = profile.get("heel_width_class")
    user_r  = _vol_rank(user_hw)
    user_hd = (profile.get("heel_depth_class") or "").lower()
    # Variant 1: all shoes have heel volume > user heel width
    if user_r is not None:
        ranks = [_vol_rank(s.get("db_heel_volume")) for s in shoes]
        if all(r is not None and r > user_r for r in ranks):
            return ("Your heel feels empty across all your shoes. All have "
                    f"heel cups wider than your {_clean_width(user_hw)} heel, "
                    "so for next picks we focus on narrower heel cups.")
    # Variant 2: heel widths match but user has shallow heel
    if "shallow" in user_hd and user_r is not None:
        ranks = [_vol_rank(s.get("db_heel_volume")) for s in shoes]
        if all(r is not None and r == user_r for r in ranks):
            return ("Your heel feels empty across all your shoes. Heel widths "
                    "match your foot, but your shallow heel may not fill "
                    "deeply sculpted cups across multiple models. We focus on "
                    "flatter heel cups.")
    # Variant 3: mixed / fallback. Roman 2026-05-01 audit S4: append "heel"
    # so we don't say "your normal needs cups narrower" -- include the dim noun.
    label = _clean_width(user_hw) or "narrow"
    return ("Your heel feels empty across all your shoes. This points to a "
            f"structural fit pattern; your {label} heel needs cups narrower "
            "than these models offer.")


def _aggregate_heel_tight(shoes, profile):
    user_hw = profile.get("heel_width_class")
    user_r  = _vol_rank(user_hw)
    if user_r is not None:
        ranks = [_vol_rank(s.get("db_heel_volume")) for s in shoes]
        if all(r is not None and r < user_r for r in ranks):
            return ("Your heel feels tight in all your shoes. All have heel "
                    f"cups narrower than your {_clean_width(user_hw)} heel, "
                    "so for next picks we look at wider, more accommodating "
                    "heel cups.")
    return ("Your heel feels tight in all your shoes. This points to a "
            f"structural fit pattern; your {_clean_width(user_hw) or 'wide'} "
            "heel needs wider, more accommodating heel cups.")


def _aggregate_toes_squeezed(shoes, profile):
    user_toe = (profile.get("toe_shape") or "").lower()
    user_lbl = _toe_label(user_toe)
    if user_toe and not any(_toe_match(profile, s) for s in shoes):
        return ("Your toes feel squeezed across all your shoes. None of them "
                f"are built for {user_lbl} toes, so for next picks we filter "
                f"for {user_lbl}-compatible toe boxes.")
    return ("Your toes feel squeezed across all your shoes. A consistent "
            "squeeze across different lasts points to a structural cause.")


def _aggregate_toes_roomy(shoes, profile):
    user_toe = (profile.get("toe_shape") or "").lower()
    user_lbl = _toe_label(user_toe)
    if user_toe and not any(_toe_match(profile, s) for s in shoes):
        return ("Your toes have extra room in all your shoes. None of them "
                f"are built for {user_lbl} toes, leaving dead space at your "
                f"second toe. For next picks we filter for "
                f"{user_lbl}-compatible toe boxes.")
    return ("Your toes have extra room in all your shoes. We focus on "
            "snugger toe boxes for next picks.")


def _aggregate_ff_tight(shoes, profile):
    user_fw = profile.get("forefoot_width_class")
    user_r  = _vol_rank(user_fw)
    if user_r is not None:
        ranks = [_vol_rank(s.get("db_width")) for s in shoes]
        if all(r is not None and r < user_r for r in ranks):
            return ("Your forefoot feels tight in all your shoes. All have "
                    f"forefoots narrower than your {_clean_width(user_fw)} "
                    "forefoot, so for next picks we look at wider lasts.")
    return ("Your forefoot feels tight in all your shoes. We look at wider "
            "lasts for next picks.")


def _aggregate_ff_loose(shoes, profile):
    user_fw = profile.get("forefoot_width_class")
    user_r  = _vol_rank(user_fw)
    if user_r is not None:
        ranks = [_vol_rank(s.get("db_width")) for s in shoes]
        if all(r is not None and r > user_r for r in ranks):
            return ("Your forefoot feels loose in all your shoes. All have "
                    f"forefoots wider than your {_clean_width(user_fw)} "
                    "forefoot, so for next picks we look at narrower lasts.")
    return ("Your forefoot feels loose in all your shoes. We look at "
            "narrower lasts for next picks.")


# ─── Contradiction sentences ────────────────────────────────────────────

def _contradiction_heel(shoes_empty, shoes_tight, target_hv):
    a = _name(shoes_empty[0])
    b = _name(shoes_tight[0])
    return (f"Your heel fit varies: empty in your {a}, tight in your {b}. "
            f"Different heel cup geometries; for next picks we target "
            f"{target_hv} heel volume.")


def _contradiction_toes(shoes_squeezed, shoes_roomy):
    a = _name(shoes_squeezed[0])
    b = _name(shoes_roomy[0])
    return (f"Your toe fit varies: squeezed in your {a}, roomy in your {b}. "
            f"Different toe box shapes; the next section will narrow which "
            f"one matches your scan.")


def _contradiction_ff(shoes_tight, shoes_loose, target_fw):
    a = _name(shoes_tight[0])
    b = _name(shoes_loose[0])
    return (f"Your forefoot fit is split: tight in your {a}, loose in your "
            f"{b}. Different lasts; for next picks we target {target_fw} "
            f"width as the middle ground.")


# ─── Issue dispatcher (per dim) ─────────────────────────────────────────

# (rating positive marker, rating negative marker, cascade fn, aggregate fn, contradiction fn)
_DIM_DISPATCH = {
    "heel": dict(
        positive="empty",
        negative="tight",
        cascade_pos=_cascade_heel_empty,
        cascade_neg=_cascade_heel_tight,
        aggregate_pos=_aggregate_heel_empty,
        aggregate_neg=_aggregate_heel_tight,
    ),
    "toes": dict(
        positive="squeezed",
        negative="roomy",
        cascade_pos=_cascade_toes_squeezed,
        cascade_neg=_cascade_toes_roomy,
        aggregate_pos=_aggregate_toes_squeezed,
        aggregate_neg=_aggregate_toes_roomy,
    ),
    "forefoot": dict(
        positive="tight",
        negative="loose",
        cascade_pos=_cascade_ff_tight,
        cascade_neg=_cascade_ff_loose,
        aggregate_pos=_aggregate_ff_tight,
        aggregate_neg=_aggregate_ff_loose,
    ),
}


# ════════════════════════════════════════════════════════════════════════
# §2 MINORITY GROUPING (Roman 2026-05-02 case-4 review, A)
# ════════════════════════════════════════════════════════════════════════
# When N>1 shoes have the same dim+rating issue but DIFFERENT cascade
# branches fire across them, group shoes by branch and emit one count
# statement followed by one sentence per cause group.
#
# Output shape:
#   "In {N} out of {M} of your shoes your {dim} {verb} {rating}.
#    In {n_a} of these ({names_a}) {cause_a_sentence}.
#    The other {n_b} ({names_b}) {cause_b_sentence}."
#
# Each cascade has a paired classifier (_classify_*) that returns
# (branch_id, params_dict) without calling the full cascade. The group
# renderer (_group_*) consumes the list of (shoe, params) tuples and
# emits a sentence covering them all.
# ════════════════════════════════════════════════════════════════════════

def _join_names(names):
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return ", ".join(names[:-1]) + f", and {names[-1]}"


def _join_brands(brands):
    seen = []
    for b in brands:
        if b and b not in seen:
            seen.append(b)
    return _join_names(seen)


# ─── Classifiers (mirror cascade decision trees) ───────────────────────

def _classify_heel_empty(shoe, profile, street):
    shoe_hv  = shoe.get("db_heel_volume")
    user_hw  = profile.get("heel_width_class")
    user_hd  = (profile.get("heel_depth_class") or "").lower()
    shoe_r   = _vol_rank(shoe_hv)
    user_r   = _vol_rank(user_hw)
    if shoe_r is not None and user_r is not None and shoe_r > user_r:
        return ("A", {"shoe_hv": _clean_width(shoe_hv),
                      "user_hw": _clean_width(user_hw)})
    if "shallow" in user_hd:
        return ("B", {"user_hw": _clean_width(user_hw)})
    status, raw, user_ds, typical_ds, typical_value = _sizing_status(shoe, street)
    if status == "under":
        return ("C", {"brand": shoe.get("brand"), "raw": raw,
                      "user_ds": user_ds, "typical_ds": typical_ds,
                      "typical_value": typical_value})
    return ("D", {})


def _classify_heel_tight(shoe, profile, street):
    shoe_hv = shoe.get("db_heel_volume")
    user_hw = profile.get("heel_width_class")
    user_hd = (profile.get("heel_depth_class") or "").lower()
    shoe_r  = _vol_rank(shoe_hv)
    user_r  = _vol_rank(user_hw)
    if shoe_r is not None and user_r is not None and shoe_r < user_r:
        return ("A", {"shoe_hv": _clean_width(shoe_hv),
                      "user_hw": _clean_width(user_hw)})
    if "deep" in user_hd:
        return ("B", {"user_hw": _clean_width(user_hw)})
    status, raw, user_ds, typical_ds, typical_value = _sizing_status(shoe, street)
    if status == "over":
        return ("C", {"brand": shoe.get("brand"), "raw": raw,
                      "user_ds": user_ds, "typical_ds": typical_ds})
    return ("D", {})


def _classify_toes_squeezed(shoe, profile, street):
    if not _toe_match(profile, shoe):
        forms = shoe.get("db_toe_form") or []
        if isinstance(forms, str): forms = [forms]
        forms_lc = [str(f).lower() for f in forms]
        return ("A", {"shoe_forms": forms_lc,
                      "user_toe": (profile.get("toe_shape") or "").lower()})
    user_fw   = profile.get("forefoot_width_class")
    arch_cls  = (profile.get("arch_length_class") or "").lower()
    shoe_w    = shoe.get("db_width")
    shoe_w_r  = _vol_rank(shoe_w)
    user_fw_r = _vol_rank(user_fw)
    if (_clean_width(user_fw) == "wide" and shoe_w_r is not None
            and user_fw_r is not None and shoe_w_r < user_fw_r):
        return ("B", {"shoe_w": _clean_width(shoe_w)})
    if "long" in arch_cls:
        return ("C", {})
    status, raw, user_ds, typical_ds, typical_value = _sizing_status(shoe, street)
    if status == "over":
        return ("D", {"brand": shoe.get("brand"), "user_ds": user_ds,
                      "typical_ds": typical_ds})
    return ("E", {})


def _classify_toes_roomy(shoe, profile, street):
    if not _toe_match(profile, shoe):
        forms = shoe.get("db_toe_form") or []
        if isinstance(forms, str): forms = [forms]
        forms_lc = [str(f).lower() for f in forms]
        return ("A", {"shoe_forms": forms_lc,
                      "user_toe": (profile.get("toe_shape") or "").lower()})
    user_fw   = profile.get("forefoot_width_class")
    shoe_w    = shoe.get("db_width")
    shoe_w_r  = _vol_rank(shoe_w)
    user_fw_r = _vol_rank(user_fw)
    if (_clean_width(user_fw) == "narrow" and shoe_w_r is not None
            and user_fw_r is not None and shoe_w_r > user_fw_r):
        return ("B", {"shoe_w": _clean_width(shoe_w)})
    status, raw, user_ds, typical_ds, typical_value = _sizing_status(shoe, street)
    if status == "under":
        return ("C", {"brand": shoe.get("brand"), "raw": raw,
                      "user_ds": user_ds, "typical_ds": typical_ds,
                      "typical_value": typical_value})
    return ("D", {})


def _classify_ff_tight(shoe, profile, street):
    user_fw   = profile.get("forefoot_width_class")
    arch_cls  = (profile.get("arch_length_class") or "").lower()
    shoe_w    = shoe.get("db_width")
    shoe_w_r  = _vol_rank(shoe_w)
    user_fw_r = _vol_rank(user_fw)
    if (shoe_w_r is not None and user_fw_r is not None
            and shoe_w_r < user_fw_r):
        return ("A", {"shoe_w": _clean_width(shoe_w),
                      "user_fw": _clean_width(user_fw)})
    if "long" in arch_cls:
        return ("B", {})
    status, raw, user_ds, typical_ds, typical_value = _sizing_status(shoe, street)
    if status == "over":
        return ("C", {"brand": shoe.get("brand"), "user_ds": user_ds,
                      "typical_ds": typical_ds})
    return ("D", {})


def _classify_ff_loose(shoe, profile, street):
    user_fw   = profile.get("forefoot_width_class")
    shoe_w    = shoe.get("db_width")
    shoe_w_r  = _vol_rank(shoe_w)
    user_fw_r = _vol_rank(user_fw)
    if (shoe_w_r is not None and user_fw_r is not None
            and shoe_w_r > user_fw_r):
        return ("A", {"shoe_w": _clean_width(shoe_w),
                      "user_fw": _clean_width(user_fw)})
    status, raw, user_ds, typical_ds, typical_value = _sizing_status(shoe, street)
    if status == "under":
        return ("B", {"brand": shoe.get("brand"), "raw": raw,
                      "user_ds": user_ds, "typical_ds": typical_ds,
                      "typical_value": typical_value})
    return ("C", {})


_CLASSIFIERS = {
    ("heel",     "empty"):    _classify_heel_empty,
    ("heel",     "tight"):    _classify_heel_tight,
    ("toes",     "squeezed"): _classify_toes_squeezed,
    ("toes",     "roomy"):    _classify_toes_roomy,
    ("forefoot", "tight"):    _classify_ff_tight,
    ("forefoot", "loose"):    _classify_ff_loose,
}


# ─── Group renderers ───────────────────────────────────────────────────
#
# Each renderer returns (cause_clause, fix_clause) so the dispatcher can
# compose:
#   - Multi-branch:  "In N of these ({names}) {cause}{ fix}." per group
#   - Single-branch: "In N of your M shoes ({names}), your {dim} {verb}
#                     {rating} because {cause}.{ Fix}"
# The cause clause is a noun-headed phrase that reads naturally either
# inside "In N of these (...) {cause}" OR inside "...because {cause}".
# The fix clause (if any) starts with a capital letter so it can stand
# as its own sentence.

def _group_heel_empty(branch, members, profile):
    if branch == "A":
        hvs = sorted({p["shoe_hv"] for _, p in members if p.get("shoe_hv")})
        user_hw = next((p["user_hw"] for _, p in members if p.get("user_hw")), "")
        if len(hvs) == 1:
            return (f"the {hvs[0]} heel volume is too wide for your "
                    f"{user_hw} heel", "")
        hv_str = " or ".join(hvs) if hvs else "wider"
        return (f"the heel volume ({hv_str}) runs wider than your "
                f"{user_hw} heel", "")
    if branch == "B":
        user_hw = next((p["user_hw"] for _, p in members if p.get("user_hw")), "")
        return (f"the heel volume matches your {user_hw} heel width but "
                f"your shallow heel doesn't fill the deeply sculpted cup",
                "")
    if branch == "C":
        brands = _join_brands([p.get("brand") for _, p in members])
        return (f"the heel volume already matches your foot, but you wear "
                f"them larger than typical for {brands}",
                "Going down further could tighten the heel.")
    return ("the cup matches on width and depth and sizing is in the "
            "brand-typical range",
            "We aim for narrower heel cups in the recommendations.")


def _group_heel_tight(branch, members, profile):
    if branch == "A":
        hvs = sorted({p["shoe_hv"] for _, p in members if p.get("shoe_hv")})
        user_hw = next((p["user_hw"] for _, p in members if p.get("user_hw")), "")
        if len(hvs) == 1:
            return (f"the {hvs[0]} heel volume is too narrow for your "
                    f"{user_hw} heel", "")
        return (f"the heel volume runs narrower than your {user_hw} heel", "")
    if branch == "B":
        user_hw = next((p["user_hw"] for _, p in members if p.get("user_hw")), "")
        return (f"the cup matches your {user_hw} heel width but your deep "
                f"heel needs more backward room", "")
    if branch == "C":
        brands = _join_brands([p.get("brand") for _, p in members])
        return (f"you're sized more aggressively than typical for {brands}",
                "Going up half a size could relieve the tightness.")
    return ("the cup matches on width and depth and sizing is in the "
            "brand-typical range",
            "We aim for slightly roomier heel cups in the recommendations.")


def _group_toes_squeezed(branch, members, profile):
    if branch == "A":
        user_toe = next((p["user_toe"] for _, p in members if p.get("user_toe")), "")
        user_lbl = _toe_label(user_toe)
        return (f"the toe form doesn't match your {user_lbl} toes",
                f"Look for a {user_lbl}-compatible toe box.")
    if branch == "B":
        return ("the toe form matches but the last runs narrower than your "
                "wide forefoot", "")
    if branch == "C":
        return ("the toe form and width match but your long arch pushes the "
                "ball of your foot into the toe box",
                "A shorter toe box would relieve the squeeze.")
    if branch == "D":
        brands = _join_brands([p.get("brand") for _, p in members])
        return (f"the toe shape and width match and you're sized more "
                f"aggressively than typical for {brands}",
                "Going up half a size could relieve the squeeze.")
    return ("the toe form, width, and arch all match",
            "We aim for slightly more toe room in the recommendations.")


def _group_toes_roomy(branch, members, profile):
    if branch == "A":
        user_toe = next((p["user_toe"] for _, p in members if p.get("user_toe")), "")
        user_lbl = _toe_label(user_toe)
        return (f"the toe form leaves dead space because they aren't built "
                f"for {user_lbl} toes",
                f"Look for a {user_lbl}-compatible toe box.")
    if branch == "B":
        return ("the forefoot is wider than your narrow forefoot",
                "Look for a narrower last.")
    if branch == "C":
        brands = _join_brands([p.get("brand") for _, p in members])
        return (f"the toe form and width match but you're sized less "
                f"aggressively than typical for {brands}",
                "Going down half a size could tighten the toe box.")
    return ("the toe form and width match and sizing is in the brand-typical "
            "range",
            "We aim for snugger toe boxes in the recommendations.")


def _group_ff_tight(branch, members, profile):
    if branch == "A":
        user_fw = next((p["user_fw"] for _, p in members if p.get("user_fw")), "")
        return (f"the forefoot is narrower than your {user_fw} forefoot", "")
    if branch == "B":
        return ("the width matches but your long arch pushes the ball "
                "forward into the toe box",
                "A shorter toe box would help.")
    if branch == "C":
        brands = _join_brands([p.get("brand") for _, p in members])
        return (f"the width and arch match but you're sized more aggressively "
                f"than typical for {brands}",
                "Half a size up could relieve the tightness.")
    return ("the width and arch match and sizing is in the brand-typical "
            "range",
            "We aim for slightly wider forefoots in the recommendations.")


def _group_ff_loose(branch, members, profile):
    if branch == "A":
        user_fw = next((p["user_fw"] for _, p in members if p.get("user_fw")), "")
        return (f"the forefoot runs wider than your {user_fw} forefoot", "")
    if branch == "B":
        brands = _join_brands([p.get("brand") for _, p in members])
        return (f"you're sized less aggressively than typical for {brands}",
                "Going down further could tighten the forefoot.")
    return ("the width matches and sizing is in the brand-typical range",
            "We aim for snugger forefoots in the recommendations.")


_GROUP_RENDERERS = {
    ("heel",     "empty"):    _group_heel_empty,
    ("heel",     "tight"):    _group_heel_tight,
    ("toes",     "squeezed"): _group_toes_squeezed,
    ("toes",     "roomy"):    _group_toes_roomy,
    ("forefoot", "tight"):    _group_ff_tight,
    ("forefoot", "loose"):    _group_ff_loose,
}


# ─── Minority dispatch (count + cause groups) ──────────────────────────

def _emit_minority(dim, rating, shoes_with_rating, n_total, profile, street, cascade_fn):
    """Roman 2026-05-02 case-4 review, A: replace per-shoe sentence-spam
    with a count statement + one sentence per cause group.

    Output shape:
      * N=1 minority   -> "Your X {dim} {verb} {rating} while the other
                           shoes fit on the {dim}. <cascade output>"
      * N>1 single cause -> "In N of your M shoes ({names}), your {dim}
                              {verb} {rating} because <cause>. <fix>"
      * N>1 multi cause  -> "In N out of M of your shoes your {dim}
                              {verb} {rating}. In n_a of these (X, Y) <cause_a>.
                              <fix_a> In n_b of these (Z) <cause_b>. <fix_b>"
    """
    n_affected = len(shoes_with_rating)
    verb = "feel" if dim == "toes" else "feels"

    if n_affected == 1:
        sh = shoes_with_rating[0]
        return [f"Your {_possessive(_name(sh))} {dim} {verb} {rating} "
                f"while the other shoes fit on the {dim}. "
                + cascade_fn(sh, profile, street)]

    classifier = _CLASSIFIERS.get((dim, rating))
    renderer = _GROUP_RENDERERS.get((dim, rating))
    if classifier is None or renderer is None:
        # Safety fallback: dim/rating not covered by classifiers — emit
        # per-shoe cascades so we never silently drop output.
        out = []
        for sh in shoes_with_rating:
            out.append(f"Your {_possessive(_name(sh))} {dim} {verb} {rating} "
                       f"while the other shoes fit on the {dim}. "
                       + cascade_fn(sh, profile, street))
        return out

    # Group by branch_id; preserve A->E ordering.
    groups = {}
    for sh in shoes_with_rating:
        branch_id, params = classifier(sh, profile, street)
        groups.setdefault(branch_id, []).append((sh, params))

    # ── Single-branch path: all minority shoes hit the same cause.
    # Combine count + names + dim/verb/rating + cause into ONE sentence
    # (with the fix as a follow-on sentence if any).
    if len(groups) == 1:
        branch_id, members = next(iter(groups.items()))
        cause, fix = renderer(branch_id, members, profile)
        names = _join_names([_name(s) for s, _ in members])
        sentence = (f"In {n_affected} of your {n_total} shoes ({names}), "
                    f"your {dim} {verb} {rating} because {cause}.")
        if fix:
            sentence += f" {fix}"
        return [sentence]

    # ── Multi-branch path: count opener + per-group sentences.
    parts = [f"In {n_affected} out of {n_total} of your shoes your "
             f"{dim} {verb} {rating}."]
    for branch_id in sorted(groups.keys()):
        members = groups[branch_id]
        names = _join_names([_name(s) for s, _ in members])
        cause, fix = renderer(branch_id, members, profile)
        seg = f"In {len(members)} of these ({names}) {cause}."
        if fix:
            seg += f" {fix}"
        parts.append(seg)
    return [" ".join(parts)]


_HV_LABELS = ("narrow", "medium", "wide")
_FW_LABELS = ("narrow", "medium", "wide")


def _hv_label(target):
    """Map target dict (or rank int) to user-facing heel-volume label."""
    if target is None:
        return "medium"
    if isinstance(target, dict):
        rank = target.get("target_hv")
    else:
        rank = target
    if isinstance(rank, int) and 0 <= rank <= 2:
        return _HV_LABELS[rank]
    return "medium"


def _fw_label(target):
    if target is None:
        return "medium"
    if isinstance(target, dict):
        rank = target.get("target_fw")
    else:
        rank = target
    if isinstance(rank, int) and 0 <= rank <= 2:
        return _FW_LABELS[rank]
    return "medium"


def _dispatch_dim(dim, shoes, profile, street, suppressed=None, target=None):
    """Returns list of paragraphs for the given dim across all shoes.

    Decision logic:
      - N == 1: cascade for that shoe (if non-perfect)
      - N > 1, all same negative-rating: aggregate (no shoe names)
      - N > 1, mixed positive + negative: contradiction sentence
      - N > 1, only some shoes have rating: minority -> count + cause-grouped

    `suppressed` (Roman 2026-05-08): set of (shoe_key, dim, rating) tuples
    that the cross-dim consolidation already covered. Sole-minority shoes
    matching a suppressed entry are skipped here.
    """
    suppressed = suppressed or set()
    cfg = _DIM_DISPATCH[dim]
    pos_label = cfg["positive"]
    neg_label = cfg["negative"]

    pos_shoes = [s for s in shoes if (s.get("fit") or {}).get(dim) == pos_label]
    neg_shoes = [s for s in shoes if (s.get("fit") or {}).get(dim) == neg_label]

    n = len(shoes)
    out = []

    # Filter out sole-minority shoes already covered by cross-dim consolidation.
    if len(pos_shoes) == 1 and n > 1:
        if (_name(pos_shoes[0]), dim, pos_label) in suppressed:
            pos_shoes = []
    if len(neg_shoes) == 1 and n > 1:
        if (_name(neg_shoes[0]), dim, neg_label) in suppressed:
            neg_shoes = []

    # Contradiction (N>1, both ratings present)
    if pos_shoes and neg_shoes:
        if dim == "heel":
            out.append(_contradiction_heel(pos_shoes, neg_shoes,
                                           _hv_label(target)))
        elif dim == "toes":
            out.append(_contradiction_toes(pos_shoes, neg_shoes))
        elif dim == "forefoot":
            out.append(_contradiction_ff(pos_shoes, neg_shoes,
                                         _fw_label(target)))
        return out

    # Positive rating present
    if pos_shoes:
        if n == 1:
            out.append(cfg["cascade_pos"](pos_shoes[0], profile, street))
        elif len(pos_shoes) == n:
            out.append(cfg["aggregate_pos"](pos_shoes, profile))
        else:
            # MINORITY: count + cause-grouped via _emit_minority
            # (Roman 2026-05-02 case-4 review, A).
            out.extend(_emit_minority(dim, pos_label, pos_shoes, n,
                                      profile, street, cfg["cascade_pos"]))

    # Negative rating present
    if neg_shoes:
        if n == 1:
            out.append(cfg["cascade_neg"](neg_shoes[0], profile, street))
        elif len(neg_shoes) == n:
            out.append(cfg["aggregate_neg"](neg_shoes, profile))
        else:
            out.extend(_emit_minority(dim, neg_label, neg_shoes, n,
                                      profile, street, cfg["cascade_neg"]))

    return out


# ─── Top-level generator (rewritten 2026-05-01 per locked spec) ──────────

def _canonicalize_shoes(shoes):
    """Normalize legacy/synonym fit ratings at intake so every downstream
    cascade, aggregate, and helper sees a single canonical vocabulary per
    dim. Original `shoes` argument is not mutated.

    Currently aliased:
      * heel: 'loose'  -> 'empty'    (S14, Roman 2026-05-01)
      * toes: 'tight'  -> 'squeezed' (B,   Roman 2026-05-02 case-4 review)

    The frontend lets users pick from a wider rating set than the V2
    dispatcher tracks. Without canonicalization those picks fall between
    the cracks and emit no §2 paragraph.
    """
    aliases = {
        "heel": {"loose": "empty"},
        "toes": {"tight": "squeezed"},
    }
    out = []
    for s in shoes:
        fit = s.get("fit") or {}
        new_fit = None
        for dim, dmap in aliases.items():
            v = fit.get(dim)
            if v in dmap:
                new_fit = new_fit or dict(fit)
                new_fit[dim] = dmap[v]
        if new_fit is not None:
            s = {**s, "fit": new_fit}
        out.append(s)
    return out


_S15_FALLBACK_PARA = (
    "You did not add any current climbing shoes to your scan. Without that "
    "reference, we lean on your foot scan alone and the recommendations "
    "below assume a typical brand-typical downsize for your street size."
)


# ─── Cross-dim sizing consolidation (Roman 2026-05-08 case-1 review) ────
#
# When ONE shoe is the sole minority on >=2 dims AND all the firing
# cascades trace to the same sizing fix (all under-downsized for
# loose/roomy/empty, all over-downsized for tight/squeezed), emit ONE
# combined sentence instead of N near-identical per-dim paragraphs.

# Per (dim, rating): the branch_id that means "going down further fixes it"
_SIZING_DOWN_BRANCH = {
    ("heel",     "empty"):    "C",
    ("toes",     "roomy"):    "C",
    ("forefoot", "loose"):    "B",
}
# Per (dim, rating): the branch_id that means "going up half a size fixes it"
_SIZING_UP_BRANCH = {
    ("heel",     "tight"):    "C",
    ("toes",     "squeezed"): "D",
    ("forefoot", "tight"):    "C",
}


def _classify_per_shoe_minorities(shoes, profile, street):
    """For each shoe that's the SOLE minority on a dim, classify its
    cascade branch. Returns {shoe_key: [(dim, rating, branch_id, params, shoe), ...]}.
    Only fires when total_shoes >= 2 (otherwise no minority case).
    """
    out = {}
    if len(shoes) < 2:
        return out
    for dim in ("heel", "toes", "forefoot"):
        cfg = _DIM_DISPATCH[dim]
        for rating in (cfg["positive"], cfg["negative"]):
            affected = [s for s in shoes
                        if (s.get("fit") or {}).get(dim) == rating]
            if len(affected) != 1:
                continue
            sh = affected[0]
            classifier = _CLASSIFIERS.get((dim, rating))
            if not classifier:
                continue
            branch_id, params = classifier(sh, profile, street)
            shoe_key = _name(sh)
            out.setdefault(shoe_key, []).append(
                (dim, rating, branch_id, params, sh))
    return out


def _consolidate_cross_dim_sizing(per_shoe, shoes):
    """For each shoe with >=2 minority dims all hitting the same sizing
    branch, emit ONE consolidated sentence. Returns (paragraphs,
    suppressed_set) where suppressed_set is {(shoe_key, dim, rating)}
    pairs that the per-dim dispatcher should skip.
    """
    paragraphs = []
    suppressed = set()

    for shoe_key, issues in per_shoe.items():
        down_issues = [(d, r, p, sh) for d, r, b, p, sh in issues
                       if _SIZING_DOWN_BRANCH.get((d, r)) == b]
        up_issues   = [(d, r, p, sh) for d, r, b, p, sh in issues
                       if _SIZING_UP_BRANCH.get((d, r)) == b]

        if len(down_issues) >= 2:
            sh = down_issues[0][3]
            params = down_issues[0][2]
            paragraphs.append(
                _render_sizing_consolidation(sh, down_issues, "down", params,
                                             n_total=len(shoes)))
            for d, r, _, _ in down_issues:
                suppressed.add((shoe_key, d, r))

        if len(up_issues) >= 2:
            sh = up_issues[0][3]
            params = up_issues[0][2]
            paragraphs.append(
                _render_sizing_consolidation(sh, up_issues, "up", params,
                                             n_total=len(shoes)))
            for d, r, _, _ in up_issues:
                suppressed.add((shoe_key, d, r))

    return paragraphs, suppressed


def _render_sizing_consolidation(shoe, issues, direction, params, n_total):
    """Compose ONE sentence covering all minority dims of `shoe` whose
    fixes converge on the same sizing change."""
    name = _name(shoe)
    brand = shoe.get("brand", "")

    # Build dim-list as natural prose:
    #   2 dims: "toes feel roomy and the forefoot feels loose"
    #   3 dims: "toes feel roomy, the forefoot feels loose, and the heel feels empty"
    clauses = []
    for idx, (d, r, _, _) in enumerate(issues):
        verb = "feel" if d == "toes" else "feels"
        prefix = "" if idx == 0 else "the "
        clauses.append(f"{prefix}{d} {verb} {r}")
    if len(clauses) == 2:
        dim_str = f"{clauses[0]} and {clauses[1]}"
    else:
        dim_str = ", ".join(clauses[:-1]) + f", and {clauses[-1]}"

    raw = params.get("raw") if params else None
    user_ds = params.get("user_ds") if params else None
    typical_ds = params.get("typical_ds") if params else None
    typical_value = params.get("typical_value") if params else None

    others_phrase = ("while your other shoes fit" if n_total > 2
                     else "while your other shoe fits")

    if direction == "down":
        clause = _under_downsize_clause(brand, raw, user_ds, typical_ds,
                                        typical_value, None)
        return (f"Your {_possessive(name)} {dim_str} {others_phrase}. "
                f"Comparing your {name} to your foot profile, it should fit. "
                f"{clause}, so going down further could tighten the fit.")
    # direction == "up"
    clause = _over_downsize_clause(brand, raw, user_ds, typical_ds)
    return (f"Your {_possessive(name)} {dim_str} {others_phrase}. "
            f"Comparing your {name} to your foot profile, it should fit. "
            f"{clause}, so going up half a size could relieve the issues.")


def generate_shoe_fit(profile, target=None):
    """V2 'What Your Current Shoe Fit Tells Us' (cascade design).

    Roman 2026-05-12: ``target`` is the resolved target dict from
    target_resolver_v2. Used to fill in the §2 contradiction sentences
    ("we target X heel volume / Y forefoot width") with the actual
    resolver result instead of a hardcoded placeholder.

    Roman 2026-04-30 locked design + 2026-05-08 cross-dim consolidation:
      1. S1 sizing intro (always when >=1 shoe with size)
      2. Cross-dim sizing consolidation (Roman 2026-05-08 case-1): if any
         one shoe is the sole minority on 2+ dims AND all cascades trace
         to the same sizing fix, emit ONE combined paragraph and suppress
         the per-dim emissions for those (shoe, dim) pairs.
      3. Per dim (heel -> toes -> forefoot) with non-perfect ratings:
         - N==1 -> run cascade for that shoe
         - N>1 ALL same -> aggregate (no shoe names)
         - N>1 MINORITY -> count + cause-grouped (Roman 2026-05-02 A)
         - N>1 contradiction -> dedicated sentence
         - Skips any (shoe, dim, rating) pair consolidated in step 2.
    """
    # S14: canonicalize heel='loose' -> 'empty' so downstream is uniform.
    shoes = _canonicalize_shoes(profile.get("shoes", []))
    street = profile.get("street_size_eu")

    # S15 fallback: production flow requires shoes, but if a row ever
    # arrives with shoes=[] the renderer would otherwise show an empty
    # section. Surface a transparent one-line paragraph instead.
    if not shoes:
        return [_S15_FALLBACK_PARA]

    paragraphs = []

    # S1: sizing intro (kept verbatim from V1 _para_sizing wording).
    sizing = _para_sizing(shoes, street)
    if sizing:
        paragraphs.append(sizing)

    # Cross-dim sizing consolidation (Roman 2026-05-08).
    per_shoe = _classify_per_shoe_minorities(shoes, profile, street)
    cross_dim_paras, suppressed = _consolidate_cross_dim_sizing(per_shoe, shoes)
    paragraphs.extend(cross_dim_paras)

    # Per-dim cascade in heel -> toes -> forefoot order, skipping any
    # (shoe, dim, rating) pair already covered by a cross-dim paragraph.
    for dim in ("heel", "toes", "forefoot"):
        for para in _dispatch_dim(dim, shoes, profile, street,
                                  suppressed=suppressed,
                                  target=target):
            paragraphs.append(para)

    return paragraphs


# ── CLI ─────────────────────────────────────────────────────────────────

def main():
    cases_path = Path(__file__).parent / "gold_standard_cases.json"
    with open(cases_path) as f:
        cases = json.load(f)

    print(f"Generating 'What Your Current Shoe Fit Tells Us' for {len(cases)} gold standard cases\n")

    for i, case in enumerate(cases):
        p = case["profile"]
        paras = generate_shoe_fit(p)

        print(f"{'='*80}")
        print(f"CASE {i+1}: {case.get('description', case['scan_id'])}")
        shoes = p.get("shoes", [])
        for s in shoes:
            size = s.get("size_eu", "?")
            fit = s.get("fit", {})
            problems = [f"{k}={v}" for k, v in fit.items() if v != "perfect"]
            print(f"  {s['brand']} {s['model']} EU{size}: {' | '.join(problems) if problems else 'perfect'}")
        print(f"  street={p.get('street_size_eu')}, pref={p.get('next_shoe_preference')}, notes={p.get('next_shoe_notes')}")
        print(f"{'─'*80}")
        for j, para in enumerate(paras):
            label = f"P{j+1}"
            print(f"  [{label}] {para}")
        print()


if __name__ == "__main__":
    main()
