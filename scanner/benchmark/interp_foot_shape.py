"""
Template engine for "Your Foot Shape" interpretation section.

Generates deterministic, consistent text from scan measurements.
No LLM needed -- purely rule-based.

Output: list of paragraph strings (plain text, no markdown).
"""

import json
from pathlib import Path

# ── Population reference (mirrors foot_measure.py) ──────────────────────
POP = {
    "forefoot_width_ratio":  {"mean": 0.383, "std": 0.021},
    "arch_length_ratio":     {"mean": 0.700, "std": 0.025},
    "heel_width_ratio":      {"mean": 0.251, "std": 0.018},
    "instep_height_ratio":   {"mean": 0.290, "std": 0.030},
    "heel_depth_ratio":      {"mean": 0.070, "std": 0.025},
}


def _z(ratio_name, value):
    """Z-score relative to population mean."""
    p = POP[ratio_name]
    return (value - p["mean"]) / p["std"]


def _intensity_adverb(z):
    """Adverb form: 'slightly', 'noticeably', 'significantly'."""
    az = abs(z)
    if az < 1.5:
        return "slightly"
    if az < 2.0:
        return "noticeably"
    return "significantly"


def _ratio_str(value):
    """Format a ratio as '0.367'."""
    return f"{value:.3f}"


# ── Helpers for class normalization ─────────────────────────────────────

def _is_narrow_heel(cls):
    return cls in ("narrow heel", "narrow")

def _is_wide_heel(cls):
    return cls in ("wide heel", "wide")

def _is_high_instep(cls):
    return cls in ("high instep", "high")

def _is_low_instep(cls):
    return cls in ("low instep", "low")


# ── Per-dimension sentence generators ──────────────────────────────────
# These return (sentence, is_notable) tuples.
# Normal dims return is_notable=False so we can condense them.

def _dim_forefoot(p):
    cls = p.get("forefoot_width_class", "normal")
    ratio = p.get("forefoot_width_ratio")
    z = _z("forefoot_width_ratio", ratio) if ratio is not None else 0
    hw_cls = p.get("heel_width_class", "normal")
    arch_cls = p.get("arch_length_class", "normal")

    if cls == "normal":
        return None  # will be covered in the combined normal sentence
    elif cls == "narrow":
        adv = _intensity_adverb(z)
        # Vary the explanation based on context.
        # NOTE: do NOT mention long arch here -- the arch paragraph and closing
        # already cover the interaction. Mentioning it here triples the coverage.
        if _is_narrow_heel(hw_cls):
            return (
                f"Your forefoot is {adv} narrower than average ({_ratio_str(ratio)}), "
                "matching the slim profile of your heel. Standard-volume shoes will "
                "feel loose across the entire front of your foot."
            )
        else:
            return (
                f"At {_ratio_str(ratio)}, your forefoot is {adv} narrower than average. "
                "Standard-width shoes tend to leave too much space around the ball of "
                "your foot, so narrow or LV (low volume) models fit better."
            )
    else:  # wide
        adv = _intensity_adverb(z)
        return (f"Your forefoot measures {adv} wider than average ({_ratio_str(ratio)}). "
                "Standard or narrow shoes may squeeze around the ball of your foot, "
                "so wider or HV (high volume) models are a better starting point.")


def _dim_heel_width(p):
    cls = p.get("heel_width_class", "normal")
    ratio = p.get("heel_width_ratio")
    z = _z("heel_width_ratio", ratio) if ratio is not None else 0

    if cls == "normal":
        return None
    elif _is_narrow_heel(cls):
        adv = _intensity_adverb(z)
        return (f"Your heel is {adv} narrower than average (ratio {_ratio_str(ratio)}). "
                "In shoes with a standard or wide heel cup, the heel may feel loose or empty. "
                "Shoes with a snug, sculpted heel pocket will hold your foot better.")
    else:  # wide
        adv = _intensity_adverb(z)
        return (f"Your heel is {adv} wider than average (ratio {_ratio_str(ratio)}). "
                "Tight or narrow heel cups may dig in or feel overly snug. "
                "Shoes with a roomier heel construction will be more comfortable.")


def _dim_instep(p):
    cls = p.get("instep_height_class", "normal")
    ratio = p.get("instep_height_ratio")
    z = _z("instep_height_ratio", ratio) if ratio is not None else 0

    if cls == "normal":
        return None
    elif _is_low_instep(cls):
        adv = _intensity_adverb(z)
        return (f"Your instep sits {adv} lower than average ({_ratio_str(ratio)}). "
                "Shoes with a high tongue or rigid upper may gap over the top of your foot. "
                "Lace-ups let you cinch down across the instep to close that gap.")
    else:  # high
        adv = _intensity_adverb(z)
        return (f"Your instep rises {adv} higher than average ({_ratio_str(ratio)}). "
                "Shoes with a low-cut upper or stiff single strap may press uncomfortably on top. "
                "Lace-up or two-strap closures give room to accommodate the extra height.")


def _dim_arch(p):
    cls = p.get("arch_length_class", "normal")
    ratio = p.get("arch_length_ratio")
    z = _z("arch_length_ratio", ratio) if ratio is not None else 0

    if cls == "normal":
        return None
    elif cls == "short arch":
        adv = _intensity_adverb(z)
        return (f"Your arch is {adv} shorter than average ({_ratio_str(ratio)}), "
                "placing the ball of your foot further forward. "
                "This gives your toes more room in the toe box relative to your foot length.")
    else:  # long arch
        adv = _intensity_adverb(z)
        return (f"Your arch is {adv} longer than average ({_ratio_str(ratio)}), "
                "which means the ball of your foot sits further back than in most feet. "
                "The result: your forefoot gets pushed into the toe box, and your toes "
                "can feel crowded even when the overall shoe length is correct.")


def _dim_heel_depth(p):
    cls = p.get("heel_depth_class", "normal")
    ratio = p.get("heel_depth_ratio")
    z = _z("heel_depth_ratio", ratio) if ratio is not None else 0

    if cls == "normal":
        return None
    elif cls == "shallow heel":
        adv = _intensity_adverb(z)
        return (f"Your heel has a {adv} shallow profile (ratio {_ratio_str(ratio)}) -- "
                "it does not project backward as much as most feet. "
                "Deeply sculpted heel cups can feel empty at the back even when the width is right. "
                "This is a shape issue, not a volume issue.")
    else:  # deep
        adv = _intensity_adverb(z)
        return (f"Your heel projects {adv} further backward than average (ratio {_ratio_str(ratio)}). "
                "Shallow heel cups may press against the back of your heel. "
                "Shoes with a deeper, more sculpted heel pocket will fit more naturally.")


# ── Combined heel paragraph (width + depth together) ──────────────────

def _dim_heel_combined(p):
    """Generate a single paragraph covering heel width and depth together.
    Returns paragraph string or None if both are normal."""
    hw_cls = p.get("heel_width_class", "normal")
    hd_cls = p.get("heel_depth_class", "normal")
    hw_ratio = p.get("heel_width_ratio")
    hd_ratio = p.get("heel_depth_ratio")
    z_hw = _z("heel_width_ratio", hw_ratio) if hw_ratio is not None else 0
    z_hd = _z("heel_depth_ratio", hd_ratio) if hd_ratio is not None else 0

    hw_narrow = _is_narrow_heel(hw_cls)
    hw_wide = _is_wide_heel(hw_cls)
    hd_shallow = hd_cls == "shallow heel"
    hd_deep = hd_cls not in ("normal", "shallow heel") and hd_cls != "normal"

    hw_normal = hw_cls == "normal"
    hd_normal = hd_cls == "normal"

    if hw_normal and hd_normal:
        return None

    adv_hw = _intensity_adverb(z_hw)
    adv_hd = _intensity_adverb(z_hd)

    # Both non-normal: combined paragraph
    if hw_narrow and hd_shallow:
        return (
            f"Your heel is {adv_hw} narrower than average (width ratio {_ratio_str(hw_ratio)}) "
            f"and has a {adv_hd} shallow profile (depth ratio {_ratio_str(hd_ratio)}). "
            "Together, this means most heel cups will feel empty -- "
            "they are both too wide and too deeply sculpted for your heel shape. "
            "A narrow, flat-backed heel pocket is the best match."
        )
    elif hw_narrow and hd_deep:
        return (
            f"Your heel is {adv_hw} narrower than average (width ratio {_ratio_str(hw_ratio)}) "
            f"but projects {adv_hd} further back than most (depth ratio {_ratio_str(hd_ratio)}). "
            "You need a heel cup that is snug side to side but deep enough to contain the backward projection."
        )
    elif hw_wide and hd_shallow:
        return (
            f"Your heel is {adv_hw} wider than average (width ratio {_ratio_str(hw_ratio)}) "
            f"but has a {adv_hd} shallow profile (depth ratio {_ratio_str(hd_ratio)}). "
            "You need a heel cup that is roomy side to side but flat rather than deeply sculpted."
        )
    elif hw_wide and hd_deep:
        return (
            f"Your heel is {adv_hw} wider than average (width ratio {_ratio_str(hw_ratio)}) "
            f"and projects {adv_hd} further back than most (depth ratio {_ratio_str(hd_ratio)}). "
            "You have a large heel that needs both width and depth in the heel cup. "
            "Narrow or shallow heel pockets will feel tight and uncomfortable."
        )

    # Only one non-normal: single-dimension paragraph
    fw_cls = p.get("forefoot_width_class", "normal")
    if hw_narrow and hd_normal:
        if fw_cls == "narrow":
            # Already mentioned in closing as "consistently slim"
            return (
                f"Your heel is {adv_hw} narrower than average (ratio {_ratio_str(hw_ratio)}), "
                f"with normal heel depth ({_ratio_str(hd_ratio)}). "
                "Like your forefoot, the heel needs a snug fit -- standard or wide heel cups "
                "leave dead space that no amount of tightening fixes."
            )
        else:
            return (
                f"Your heel measures {adv_hw} narrower than average "
                f"(ratio {_ratio_str(hw_ratio)}), though your heel depth "
                f"({_ratio_str(hd_ratio)}) is normal. The narrow width means "
                "standard heel cups can feel loose or empty even in shoes that fit "
                "well elsewhere. A sculpted, snug heel pocket makes the difference."
            )
    elif hw_wide and hd_normal:
        return (
            f"Your heel is {adv_hw} wider than average (width ratio {_ratio_str(hw_ratio)}), "
            f"while your heel depth ({_ratio_str(hd_ratio)}) is in the normal range. "
            "Tight or narrow heel cups may dig in. "
            "Shoes with a roomier heel construction will be more comfortable."
        )
    elif hw_normal and hd_shallow:
        return (
            f"Your heel width ({_ratio_str(hw_ratio)}) is average, but your heel has a "
            f"{adv_hd} shallow profile (depth ratio {_ratio_str(hd_ratio)}) -- "
            "it does not project backward as much as most feet. "
            "Deeply sculpted heel cups can feel empty at the back even when the width is right."
        )
    elif hw_normal and hd_deep:
        return (
            f"Your heel width ({_ratio_str(hw_ratio)}) is average, but your heel projects "
            f"{adv_hd} further back than most (depth ratio {_ratio_str(hd_ratio)}). "
            "Shallow heel cups may press against the back of your heel."
        )

    return None


# ── Hallux valgus paragraphs ───────────────────────────────────────────

def _paras_hallux_valgus(p):
    """Returns list of paragraphs or empty list."""
    hva = p.get("hallux_valgus_class")
    if not hva or hva == "normal":
        return []

    hva_ratio = p.get("hva_offset_ratio")
    ratio_note = f" (offset ratio {_ratio_str(hva_ratio)})" if hva_ratio else ""

    paras = []
    paras.append(
        f"Our scan measured how far your big toe tip sits from the inner edge of your forefoot, "
        f"relative to your foot width. Your result suggests a {hva} inward drift of the big toe{ratio_note} "
        f"-- a pattern commonly known as hallux valgus. This is very common among climbers and does not "
        f"necessarily mean anything is wrong. Scan angle or foot placement can influence this measurement. "
        f"If the result surprises you, try re-scanning with your foot held flat and straight above the camera "
        f"during the sole scan. This is not a medical diagnosis -- if you have concerns, consult a podiatrist."
    )
    toe = p.get("toe_shape", "egyptian")
    if toe == "greek":
        paras.append(
            "What this means for shoe fit: with Greek toes, your big toe is already shorter than your second "
            "toe. Combined with an inward drift, the big toe can lose contact with the inner front of the shoe "
            "entirely -- reducing power transfer and sensitivity on footholds, and reinforcing the drift over time. "
            "Avoid very asymmetric Egyptian lasts that taper sharply to the big-toe side. A moderately wide, "
            "rounded toe box keeps both your second toe and your drifting big toe in contact with the shoe."
        )
    else:
        paras.append(
            "What this means for shoe fit: in shoes with a pointy, tapered toe box, your big toe may not reach "
            "the actual tip of the shoe. The toe curls inward and leaves the tip empty -- you lose sensitivity "
            "and power transfer on footholds, and your hallux valgus is being reinforced whilst climbing. "
            "Instead look for a shoe that actually pushes your big toe out -- also meaning that falling back to "
            "a Greek toe shape might be a bad idea as it pronounces your wrong toe position further."
        )
    return paras


# ── Closing paragraph: the synthesis ────────────────────────────────────

def _build_closing(p):
    """
    Build the closing paragraph that synthesizes the user's unique
    combination of dimensions into practical fit implications.

    Focuses on INTERACTIONS between dimensions -- the tricky combos
    that make shoe fitting non-obvious. Each piece targets ~25-40 words.
    Max 3 pieces for readability (~80-120 words total).
    """
    fw_cls = p.get("forefoot_width_class", "normal")
    hw_cls = p.get("heel_width_class", "normal")
    arch_cls = p.get("arch_length_class", "normal")
    instep_cls = p.get("instep_height_class", "normal")
    heel_d_cls = p.get("heel_depth_class", "normal")
    toe = p.get("toe_shape", "egyptian")
    hva = p.get("hallux_valgus_class")

    hw_narrow = _is_narrow_heel(hw_cls)
    hw_wide = _is_wide_heel(hw_cls)
    instep_high = _is_high_instep(instep_cls)
    instep_low = _is_low_instep(instep_cls)

    pieces = []

    # ── 1. Width profile (forefoot vs heel) ──
    # Focus on the practical implication of the combination, not re-describing
    # each dimension (that was done in the per-dimension paragraphs above).
    if fw_cls == "wide" and hw_narrow:
        pieces.append(
            "The tricky part is finding one shoe that handles both ends: "
            "HV shoes give your forefoot room but feel sloppy at the heel, "
            "while LV models lock the heel but squeeze the forefoot. "
            "Shoes with a wide toe box and a sculpted, snug heel are the target."
        )
    elif fw_cls == "wide" and hw_wide:
        pieces.append(
            "Since both forefoot and heel are wider than average, HV or "
            "wide-fit shoes should work well across the board. Avoid LV "
            "models -- they will compress both ends."
        )
    elif fw_cls == "narrow" and hw_narrow:
        pieces.append(
            "With a consistently slim profile from front to back, LV (low volume) "
            "shoes are your best match. Standard-volume models will feel "
            "sloppy around both the ball and the heel."
        )
    elif fw_cls == "narrow" and hw_wide:
        pieces.append(
            "This reverse-taper profile is unusual: LV shoes may squeeze the "
            "heel while standard shoes leave the forefoot swimming. Lace-ups "
            "help by letting you tighten the forefoot independently."
        )
    # Note: narrow fw with normal heel is already covered by the forefoot
    # dimension paragraph. Only add a closing piece if there is a meaningful
    # interaction with another dimension (arch, instep, etc.) -- those are
    # handled below.
    elif fw_cls == "normal" and hw_narrow:
        pieces.append(
            "Rather than switching to full LV models, look for shoes with a "
            "narrow, sculpted heel cup that does not compromise the forefoot fit."
        )
    elif fw_cls == "wide" and not hw_narrow and not hw_wide:
        pieces.append(
            "HV shoes will give your forefoot the space it needs, but check "
            "that the heel stays snug."
        )

    # ── 2. Heel depth + width interaction ──
    # Note: the per-dimension heel paragraph already covers the width+depth
    # combination in detail. The closing only adds interaction context when
    # the heel interacts with OTHER dimensions (width profile, instep, etc.).
    # We skip standalone heel-only pieces here to avoid repetition.

    # ── 3. Arch length interaction (don't restate the arch effect itself,
    #    that's covered in the per-dimension paragraph -- only add the
    #    interaction with width/toe shape) ──
    if arch_cls == "long arch":
        if fw_cls in ("narrow", "normal"):
            pieces.append(
                "Combined with your long arch, the toe box may feel tighter "
                "than your forefoot width alone would suggest -- look for shoes "
                "with a compact forefoot zone that does not force your toes to "
                "fill space they cannot reach."
            )
        elif fw_cls == "wide":
            pieces.append(
                "Your long arch and wide forefoot together demand a shoe with "
                "a spacious, untapered toe box that starts further back than "
                "most designs place it."
            )
    elif arch_cls == "short arch" and fw_cls == "narrow":
        pieces.append(
            "Your short arch offsets your narrow forefoot somewhat -- the ball "
            "sits further forward, giving your toes more breathing room than "
            "the width ratio alone implies."
        )

    # ── 4. Instep interactions ──
    if instep_high and heel_d_cls == "shallow heel":
        pieces.append(
            "Your foot needs volume over the midfoot but not behind it. "
            "Lace-ups are ideal -- you can open them across the instep without affecting heel fit."
        )
    elif instep_high and hw_narrow and heel_d_cls != "shallow heel":
        pieces.append(
            "Your high instep needs room on top while your narrow heel needs a snug fit. "
            "Lace-ups or two-strap closures let you adjust each zone independently."
        )
    elif instep_low and fw_cls == "narrow":
        pieces.append(
            "Your narrow forefoot and low instep give your foot a low overall volume. "
            "Even LV shoes may gap over the instep -- lace-ups let you cinch down for a precise fit."
        )

    # ── 5. Toe shape + hallux valgus ──
    if hva and hva != "normal":
        if toe == "egyptian":
            pieces.append(
                f"Your {hva} hallux valgus means very asymmetric Egyptian-last shoes "
                "will leave the tip empty. Moderately asymmetric or slightly Greek-shaped lasts "
                "can push the big toe outward and restore contact with the shoe tip."
            )
        elif toe == "greek":
            pieces.append(
                f"Your {hva} hallux valgus means the big toe drifts inward "
                "and may not fill the inner side of the toe box. "
                "A slightly wider, less pointed toe box helps compensate."
            )
    elif toe == "greek" and fw_cls == "narrow" and len(pieces) <= 2:
        pieces.append(
            "With your Greek toe shape, look for shoes "
            "that are not too aggressively tapered, giving your second toe room at the tip."
        )
    elif toe == "egyptian" and fw_cls == "wide" and (not hva or hva == "normal"):
        pieces.append(
            "Your Egyptian toe shape pairs well with asymmetric lasts. "
            "Combined with your wide forefoot, choose shoes with a generous toe box "
            "that does not force your toes together laterally."
        )

    # ── Fallback: no interaction pieces fired ──
    # Distinguish "truly all normal" from "has notable dims but no cross-dim
    # interactions" -- the per-dimension paragraphs already covered each dim
    # individually, so we just add toe-shape guidance as the synthesis.
    has_notable = (
        fw_cls != "normal" or hw_cls != "normal" or
        arch_cls != "normal" or instep_cls != "normal" or
        heel_d_cls != "normal"
    )
    if not pieces:
        if has_notable:
            # There ARE notable dims, but no interesting interactions.
            # The per-dim paragraphs covered the details; just add toe guidance.
            toe_advice = {
                "egyptian": (
                    "For the toe box, your Egyptian foot works best with asymmetric "
                    "lasts that give your big toe room at the tip."
                ),
                "greek": (
                    "For the toe box, your Greek toe shape means you should avoid "
                    "shoes that aggressively taper to a single point, as your second "
                    "toe needs room at the front."
                ),
                "roman": (
                    "For the toe box, your Roman toe shape works best with a wider, "
                    "less tapered design that gives all your toes equal room."
                ),
            }
            pieces.append(toe_advice.get(toe, toe_advice["egyptian"]))
        else:
            # Truly all-normal profile
            toe_advice = {
                "egyptian": (
                    "With no dimensions standing out, the main fitting decision is the toe box shape. "
                    "Your Egyptian foot works best with asymmetric lasts that give "
                    "your big toe room at the tip. Beyond that, pick the shoe character that suits how you climb."
                ),
                "greek": (
                    "With no dimensions standing out, the main fitting decision is the toe box shape. "
                    "Your Greek toe shape means you should avoid shoes that aggressively taper to a single point, "
                    "as your second toe needs room at the front."
                ),
                "roman": (
                    "With no dimensions standing out, the main fitting decision is the toe box shape. "
                    "Your Roman toe shape works best with a wider, less tapered toe box "
                    "that gives all your toes equal room."
                ),
            }
            pieces.append(toe_advice.get(toe, toe_advice["egyptian"]))

    # Filter empty strings
    pieces = [p for p in pieces if p]

    # Length control: max 3 pieces.
    # Always keep HVA piece if present (clinically important).
    if len(pieces) > 3:
        has_hva = hva and hva != "normal"
        if has_hva:
            # Keep first 2 + the hva piece (always last)
            pieces = pieces[:2] + [pieces[-1]]
        else:
            pieces = pieces[:3]

    return " ".join(pieces)


# ── Main generator ──────────────────────────────────────────────────────

def generate_foot_shape(profile):
    """
    Generate the "Your Foot Shape" interpretation section.

    Structure (toe-to-heel order):
    1. Opening: toe shape + notable dimensions summary
    2. Normal dims compact sentence (only if mixed with notable ones)
    3. Forefoot width (if non-normal)
    4. Arch length (if non-normal)
    5. Instep height (if non-normal)
    6. Heel (combined width + depth, if either non-normal)
    7. Hallux valgus (if present)
    8. Closing synthesis

    Args:
        profile: dict with scan measurements (same structure as gold_standard_cases profile)

    Returns:
        list of paragraph strings
    """
    p = profile

    # ── Collect dimension data in toe-to-heel order ──
    # Forefoot, arch, instep are individual; heel width+depth are combined
    fw_para = _dim_forefoot(p)
    arch_para = _dim_arch(p)
    instep_para = _dim_instep(p)
    heel_para = _dim_heel_combined(p)  # combined width + depth

    notable_paras = [x for x in [fw_para, arch_para, instep_para, heel_para] if x is not None]

    # Track which dims are normal (for the compact normal line)
    normal_dims = []
    dim_checks = [
        ("forefoot_width_class", "forefoot width", "forefoot_width_ratio"),
        ("arch_length_class", "arch length", "arch_length_ratio"),
        ("instep_height_class", "instep height", "instep_height_ratio"),
    ]
    for dim_key, label, ratio_key in dim_checks:
        if p.get(dim_key, "normal") == "normal":
            ratio_val = p.get(ratio_key)
            normal_dims.append((label, ratio_val))
    # Heel: only add to normal list if BOTH width and depth are normal
    hw_cls = p.get("heel_width_class", "normal")
    hd_cls = p.get("heel_depth_class", "normal")
    if hw_cls == "normal" and hd_cls == "normal":
        hw_r = p.get("heel_width_ratio")
        hd_r = p.get("heel_depth_ratio")
        normal_dims.append(("heel width", hw_r))
        normal_dims.append(("heel depth", hd_r))

    # ── Build opening paragraph ──
    toe_desc = _toe_shape_text(p)
    paragraphs = []

    dim_notes = _notable_dim_labels(p)
    if dim_notes:
        opening = f"Your foot scan reveals {toe_desc}."
        if len(dim_notes) == 1:
            opening += f" You also have {dim_notes[0]}."
        else:
            opening += f" You also have {', '.join(dim_notes[:-1])} and {dim_notes[-1]}."
        paragraphs.append(opening)
    else:
        # All normal -- concise opening, no repetition
        paragraphs.append(
            f"Your foot scan reveals {toe_desc}. "
            "All five dimensions we measure -- forefoot width, arch length, instep height, "
            "heel width, and heel depth -- are within the normal range for climbers."
        )

    # ── Normal dimensions: one compact sentence (only when mixed with notable) ──
    # Skip entirely when there is only one normal dim -- it reads like filler.
    # The notable dims carry all the important info; one normal dim is implied.
    if normal_dims and notable_paras and len(normal_dims) >= 2:
        labels = [f"{label} ({_ratio_str(r)})" for label, r in normal_dims if r is not None]
        if labels:
            if len(labels) == 1:
                paragraphs.append(f"Your {labels[0]} is in the normal range.")
            else:
                joiner = "are both" if len(labels) == 2 else "are all"
                paragraphs.append(
                    f"Your {', '.join(labels[:-1])} and {labels[-1]} {joiner} in the normal range."
                )

    # ── Notable dimension paragraphs (toe-to-heel order) ──
    for para in notable_paras:
        paragraphs.append(para)

    # ── Hallux valgus (conditional) ──
    hva_paras = _paras_hallux_valgus(p)
    paragraphs.extend(hva_paras)

    # ── Closing synthesis paragraph ──
    closing = _build_closing(p)
    paragraphs.append(closing)

    return paragraphs


def _toe_shape_text(p):
    """Toe shape phrase for the opening sentence.
    When confidence is low, qualify the classification as borderline."""
    ts = p["toe_shape"]
    conf = p.get("toe_confidence")

    # Borderline: only when confidence is very low (below 0.5).
    # Confidence mapping: low=0.4, moderate=0.65, high=0.9.
    # Moderate confidence is good enough -- don't call it borderline.
    if conf is not None and conf < 0.5:
        borderline = {
            "egyptian": (
                "a borderline Egyptian toe shape -- your big toe is the longest "
                "but only barely longer than your second toe"
            ),
            "greek": (
                "a borderline Greek toe shape -- your second toe extends just "
                "slightly past your big toe"
            ),
            "roman": (
                "a borderline Roman toe shape -- your first toes are close "
                "to equal length but not clearly so"
            ),
        }
        return borderline.get(ts, f"a borderline {ts} toe shape")

    labels = {
        "egyptian": "an Egyptian toe shape, where your big toe is the longest",
        "greek":    "a Greek toe shape, where your second toe extends past the big toe",
        "roman":    "a Roman toe shape, where your first two or three toes are roughly equal in length",
    }
    return labels.get(ts, f"a {ts} toe shape")


def _notable_dim_labels(p):
    """List of human-readable labels for non-normal dimensions.
    Order: forefoot -> arch -> instep -> heel width -> heel depth (toe-to-heel)."""
    labels = []
    fw = p.get("forefoot_width_class", "normal")
    arch = p.get("arch_length_class", "normal")
    instep = p.get("instep_height_class", "normal")
    hw = p.get("heel_width_class", "normal")
    heel_d = p.get("heel_depth_class", "normal")

    if fw != "normal":
        labels.append(f"a {fw} forefoot")
    if arch != "normal":
        labels.append(f"a {arch}")
    if instep != "normal":
        # Normalize: "high instep"/"high" -> "high instep", "low instep"/"low" -> "low instep"
        instep_label = instep if "instep" in instep else f"{instep} instep"
        labels.append(f"a {instep_label}")
    if hw != "normal":
        # Normalize: "narrow heel"/"narrow" -> "narrow heel", "wide heel"/"wide" -> "wide heel"
        hw_label = hw if "heel" in hw else f"{hw} heel"
        labels.append(f"a {hw_label}")
    if heel_d != "normal":
        labels.append(f"a {heel_d}")
    return labels


# ── CLI: run against gold standard cases ────────────────────────────────

def main():
    cases_path = Path(__file__).parent / "gold_standard_cases.json"
    with open(cases_path) as f:
        cases = json.load(f)

    print(f"Generating 'Your Foot Shape' for {len(cases)} gold standard cases\n")
    print("=" * 80)

    results = []
    for i, case in enumerate(cases):
        p = case["profile"]
        paras = generate_foot_shape(p)
        results.append({
            "case": i + 1,
            "scan_id": case["scan_id"],
            "description": case.get("description", ""),
            "paragraphs": paras,
        })

        print(f"\n{'='*80}")
        print(f"CASE {i+1}: {case.get('description', case['scan_id'])}")
        print(f"  toe={p['toe_shape']}, fw={p.get('forefoot_width_class')}, "
              f"hw={p.get('heel_width_class')}, arch={p.get('arch_length_class')}, "
              f"instep={p.get('instep_height_class')}, heel_d={p.get('heel_depth_class')}, "
              f"hva={p.get('hallux_valgus_class')}")
        print(f"{'─'*80}")
        for j, para in enumerate(paras):
            label = "CLOSING" if j == len(paras) - 1 else f"P{j+1}"
            print(f"  [{label}] {para}")
        print()

    return results


if __name__ == "__main__":
    main()
