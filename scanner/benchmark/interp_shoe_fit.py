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

        if label == "typical":
            brand_context = f"a typical fit for {s['brand']}"
        else:
            brand_context = (
                f"{label} for {s['brand']}, where the typical downsize is about {typical_label}"
            )

        base = (
            f"You wear your {s['brand']} {s['model']} in EU {s['size_eu']}, "
            f"{size_phrase}. "
            f"That is {brand_context}."
        )

        # When the downsize is relaxed AND the heel feels empty,
        # connect the dots: more downsize could help the heel.
        if label in ("rather relaxed", "very relaxed"):
            heel_fit = (s.get("fit") or {}).get("heel", "")
            if heel_fit in ("empty", "loose"):
                base += (
                    f" Downsizing further toward the typical range could "
                    "tighten the heel cup and reduce the empty feel."
                )

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
                heel_text = _universal_issue_text("heel", rating, n, arch_cls=arch_cls)
            elif fraction >= 0.5:
                heel_text = _majority_issue_text("heel", rating, count, n, shoes=shoes)
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
            # Universal issue
            patterns.append({
                "dim": dim,
                "type": "universal",
                "text": _universal_issue_text(dim, rating, n, arch_cls=arch_cls,
                                              sizing_relaxed=sizing_relaxed),
            })
        elif fraction >= 0.5:
            # Majority issue
            patterns.append({
                "dim": dim,
                "type": "majority",
                "text": _majority_issue_text(dim, rating, count, n, shoes=shoes),
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


def _universal_issue_text(dim, rating, n, arch_cls=None, sizing_relaxed=False):
    """Text for when ALL shoes have the same issue on a dimension.
    arch_cls: optional, used to only mention long-arch when relevant.
    sizing_relaxed: if True, don't suggest 'aggressive downsize' as a cause for squeezed toes."""
    count_word = "both" if n == 2 else f"all {n}" if n > 2 else "your"
    has_long_arch = arch_cls == "long arch"

    if dim == "heel":
        if rating == "empty":
            if n == 1:
                return (
                    "Your heel feels empty in this shoe. "
                    "This is a common sign that either the heel cup is too wide or too deeply sculpted "
                    "for your heel shape (see the scan analysis above for which applies to you)."
                )
            return (
                f"Your heel feels empty in {count_word} shoes. "
                "This is a strong signal that the issue is your foot shape rather than bad luck with one model. "
                "Your scan data above pinpoints whether it is heel width, heel depth, or both."
            )
        elif rating == "tight":
            if n == 1:
                return (
                    "Your heel feels tight in this shoe, "
                    "suggesting your heel is wider or deeper than what this heel cup is designed for."
                )
            return (
                f"Your heel feels tight in {count_word} shoes, "
                "suggesting your heel is wider or deeper than what these heel cups are designed for."
            )
    elif dim == "toes":
        if rating == "squeezed":
            if n == 1:
                if has_long_arch and sizing_relaxed:
                    return (
                        "Your toes feel squeezed in this shoe despite the relaxed sizing. "
                        "This strongly suggests a toe shape mismatch (your foot shape vs. the shoe's toe box), "
                        "compounded by your long arch pushing the forefoot into the toe area."
                    )
                if has_long_arch:
                    return (
                        "Your toes feel squeezed in this shoe. "
                        "This could be a toe shape mismatch (e.g., your foot shape in a differently shaped toe box), "
                        "your long arch pushing the forefoot into the toe area, or simply an aggressive downsize."
                    )
                if sizing_relaxed:
                    return (
                        "Your toes feel squeezed in this shoe despite the relaxed sizing. "
                        "Since the shoe is already sized generously, this is almost certainly a toe shape "
                        "mismatch: the shoe's toe box is designed for a different foot shape than yours."
                    )
                return (
                    "Your toes feel squeezed in this shoe. "
                    "This could be a toe shape mismatch (the shoe's toe box designed for a different foot shape) "
                    "or an aggressive downsize."
                )
            if has_long_arch:
                return (
                    f"Your toes feel squeezed in {count_word} shoes. "
                    "A consistent squeeze across different models points to a structural cause, "
                    "likely a toe shape mismatch or your long arch pushing the forefoot into the toe box."
                )
            return (
                f"Your toes feel squeezed in {count_word} shoes. "
                "A consistent squeeze across different models points to a structural cause, "
                "likely a toe shape mismatch rather than bad luck with one model."
            )
        elif rating == "roomy":
            if n == 1:
                return (
                    "Your toes have extra room in this shoe. "
                    "A more aggressive downsize or a shoe with a shorter, more tapered toe box could help."
                )
            return (
                f"Your toes have extra room in {count_word} shoes. "
                "This suggests the toe box is longer or wider than your foot needs. "
                "A more aggressive downsize or a shoe with a shorter, more tapered toe box could help."
            )
    elif dim == "forefoot":
        if rating == "tight":
            if n == 1:
                return (
                    "Your forefoot feels tight in this shoe. "
                    "Check whether the issue is width (your forefoot vs. the shoe's last) or "
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


def _majority_issue_text(dim, rating, count, total, shoes=None):
    """Text for when some shoes share an issue."""
    verb = _dim_verb(dim)

    # Try to name the specific shoe(s) with this issue
    shoe_name = None
    if shoes and count == 1:
        for s in shoes:
            fit = s.get("fit", {})
            if fit.get(dim) == rating:
                shoe_name = f"{s.get('brand', '')} {s.get('model', '')}".strip()
                break

    if count == 1 and total == 2:
        if shoe_name:
            return (
                f"Your {shoe_name}'s {dim} {verb} {rating}. "
                + _issue_implication(dim, rating)
            )
        return (
            f"In one of your two shoes, the {dim} {verb} {rating}. "
            + _issue_implication(dim, rating)
        )
    return (
        f"In {count} of your {total} shoes, the {dim} {verb} {rating}. "
        + _issue_implication(dim, rating)
    )


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


def _issue_implication(dim, rating):
    """One-sentence implication for a fit issue."""
    implications = {
        ("heel", "empty"): (
            "This points to a heel shape mismatch. See the scan analysis above "
            "for whether it is heel width, depth, or both."
        ),
        ("heel", "tight"): (
            "This suggests your heel is wider or deeper than these heel cups allow."
        ),
        ("toes", "squeezed"): (
            "This may be a toe shape mismatch or aggressive sizing."
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


def _para_anchor(shoes, street):
    """Identify the anchor shoe and explain why it matters."""
    anchor, score = _find_anchor(shoes, street)
    if anchor is None:
        return None

    fit = anchor.get("fit", {})
    perfect_dims = [d for d in ("heel", "toes", "forefoot") if fit.get(d) == "perfect"]
    imperfect_dims = {d: fit[d] for d in ("heel", "toes", "forefoot") if fit.get(d) != "perfect"}

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

def generate_shoe_fit(profile):
    """
    Generate the "What Your Current Shoe Fit Tells Us" section.

    Args:
        profile: dict with scan measurements + shoes list

    Returns:
        list of paragraph strings, or empty list if no shoes
    """
    shoes = profile.get("shoes", [])
    street = profile.get("street_size_eu")

    if not shoes:
        return []

    paragraphs = []

    # Sizing paragraph
    sizing = _para_sizing(shoes, street)
    if sizing:
        paragraphs.append(sizing)

    # Fit patterns
    fit_patterns = _para_fit_patterns(shoes, profile)
    if fit_patterns:
        paragraphs.append(fit_patterns)

    # Shallow heel depth insight (empty heels OR perfect heel despite extreme scan)
    heel_depth = _para_heel_depth_insight(profile, shoes)
    if heel_depth:
        paragraphs.append(heel_depth)

    # Toe form mismatch (soft shoe masking toe shape incompatibility)
    toe_mismatch = _para_toe_form_mismatch(profile, shoes)
    if toe_mismatch:
        paragraphs.append(toe_mismatch)

    # Anchor shoe
    anchor = _para_anchor(shoes, street)
    if anchor:
        paragraphs.append(anchor)

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
