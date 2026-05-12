"""
Template engine for "Your Foot Shape" interpretation section.

Generates deterministic, consistent text from scan measurements.
No LLM needed -- purely rule-based.

Output: list of paragraph strings (plain text, no markdown).
"""

import json
from pathlib import Path

# ── Population reference (mirrors foot_measure.py) ──────────────────────
# Tertile-calibrated 2026-04-14 — must stay in sync with scanner/foot_measure.py.
# mean = population median, std = real population std (used for z-score
# intensity wording), lo/hi = 33rd/67th percentile (classification bands).
POP = {
    "forefoot_width_ratio":  {"mean": 0.355, "std": 0.028, "lo": 0.344, "hi": 0.367},
    "arch_length_ratio":     {"mean": 0.725, "std": 0.025, "lo": 0.712, "hi": 0.734},
    "heel_width_ratio":      {"mean": 0.238, "std": 0.022, "lo": 0.228, "hi": 0.245},
    "instep_height_ratio":   {"mean": 0.264, "std": 0.036, "lo": 0.255, "hi": 0.273},
    "heel_depth_ratio":      {"mean": 0.034, "std": 0.020, "lo": 0.028, "hi": 0.041},
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

    adv = _intensity_adverb(z)
    # Roman 2026-04-27: forefoot paragraph stays forefoot-only unless the
    # heel OPPOSES (narrow forefoot + wide heel, or wide forefoot + narrow
    # heel). Same-direction heel is covered by the synthesis paragraph and
    # the heel paragraph itself; mentioning it here was redundant.
    # Also: "entire" dropped per same review — say "across the front", not
    # "across the entire front".
    if cls == "narrow":
        if _is_wide_heel(hw_cls):  # opposing
            return (
                f"Your forefoot is {adv} narrower than average ({_ratio_str(ratio)}), "
                "opposite to your wider heel. Look for a narrow forefoot paired with a "
                "roomier heel cup."
            )
        return (
            f"Your forefoot is {adv} narrower than average ({_ratio_str(ratio)}). "
            "Standard-volume shoes will feel loose across the front of your foot, "
            "so narrow or LV (low volume) models fit better."
        )
    # wide
    if _is_narrow_heel(hw_cls):  # opposing
        return (
            f"Your forefoot is {adv} wider than average ({_ratio_str(ratio)}), "
            "opposite to your narrower heel. Look for a wider forefoot paired with a "
            "snug heel cup."
        )
    return (
        f"Your forefoot is {adv} wider than average ({_ratio_str(ratio)}). "
        "Standard or narrow shoes may squeeze around the ball of your foot, "
        "so wider or HV (high volume) models are a better starting point."
    )


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
                "Lace-ups or two-strap velcro tighten across the instep to close that gap.")
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
        return (f"Your heel has a {adv} shallow profile (ratio {_ratio_str(ratio)}). "
                "It does not project backward as much as most feet. "
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
            "Together, this means most heel cups will feel empty because "
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
                "Like your forefoot, the heel needs a snug fit. Standard or wide heel cups "
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
            f"{adv_hd} shallow profile (depth ratio {_ratio_str(hd_ratio)}). "
            "It does not project backward as much as most feet. "
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
        f", a pattern commonly known as hallux valgus. This is very common among climbers and does not "
        f"necessarily mean anything is wrong. Scan angle or foot placement can influence this measurement. "
        f"If the result surprises you, try re-scanning with your foot held flat and straight above the camera "
        f"during the sole scan. This is not a medical diagnosis. If you have concerns, consult a podiatrist."
    )
    toe = p.get("toe_shape", "egyptian")
    if toe == "greek":
        paras.append(
            "What this means for shoe fit: with Greek toes, your big toe is already shorter than your second "
            "toe. Combined with an inward drift, the big toe can lose contact with the inner front of the shoe "
            "entirely, reducing power transfer and sensitivity on footholds and reinforcing the drift over time. "
            "Avoid very asymmetric Egyptian lasts that taper sharply to the big-toe side. A moderately wide, "
            "rounded toe box keeps both your second toe and your drifting big toe in contact with the shoe."
        )
    else:
        paras.append(
            "What this means for shoe fit: in shoes with a pointy, tapered toe box, your big toe may not reach "
            "the actual tip of the shoe. The toe curls inward and leaves the tip empty, so you lose sensitivity "
            "and power transfer on footholds, and your hallux valgus is being reinforced whilst climbing. "
            "Instead look for a shoe that actually pushes your big toe out. This also means that falling back to "
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
            "models because they will compress both ends."
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
                "than your forefoot width alone would suggest. Look for shoes "
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
            "Your short arch offsets your narrow forefoot somewhat: the ball "
            "sits further forward, giving your toes more breathing room than "
            "the width ratio alone implies."
        )

    # ── 4. Instep interactions ──
    if instep_high and heel_d_cls == "shallow heel":
        pieces.append(
            "Your foot needs volume over the midfoot but not behind it. "
            "Lace-ups are ideal because you can open them across the instep without affecting heel fit."
        )
    elif instep_high and hw_narrow and heel_d_cls != "shallow heel":
        pieces.append(
            "Your high instep needs room on top while your narrow heel needs a snug fit. "
            "Lace-ups or two-strap closures let you adjust each zone independently."
        )
    elif instep_low and fw_cls == "narrow":
        pieces.append(
            "Your narrow forefoot and low instep give your foot a low overall volume. "
            "Even LV shoes may gap over the instep. Lace-ups or two-strap velcro tighten the fit precisely."
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
                    "For the toe box, your Roman toe shape -- with your first toes close to "
                    "equal in length -- is forgiving: moderately asymmetric Egyptian lasts work, "
                    "and so do Greek-friendly rounded toe boxes. Avoid only the sharpest, "
                    "single-point tapers."
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
                    "Your Roman toe shape -- with your first toes close to equal in length -- is forgiving: "
                    "moderately asymmetric Egyptian lasts work, and so do Greek-friendly rounded toe boxes. "
                    "Avoid only the sharpest, single-point tapers."
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

    Locked design (Roman 2026-04-27, V2 review):
      §1[1] (T2): basics paragraph — two sentences. Sentence 1 names toe
                  shape + forefoot/heel widths. Sentence 2 labels the
                  overall profile (narrow / wide / medium / mixed).
      §1[2] (T4): secondaries paragraph — either T4.1 fallback when
                  nothing notable, or T4.2..T4.10 sentences in order
                  with the "Beyond the obvious:" prefix.

    The old per-dimension paragraphs and synthesis are dropped — every
    point they made is now covered by T4 sentences.
    """
    p = profile
    paragraphs = []

    basics = _build_basics_paragraph_v2(p)
    if basics:
        paragraphs.append(basics)

    secondaries = _build_secondaries_paragraph_v2(p)
    if secondaries:
        paragraphs.append(secondaries)

    return paragraphs


# ── 5-tier population reference (Roman 2026-05-08, sandbox) ────────────
#
# Replaces the production 3-tier classifier (still in foot_measure.py)
# with a 5-tier scheme using 20th/40th/60th/80th percentiles from
# n=340 production scans. Sandbox-only — production classifier untouched
# until cutover.
#
# Tier order:    very_low / low / mid / high / very_high
# vl_lo: bound between very_low and low (20th pctile)
# lo:    bound between low and mid       (40th pctile)
# hi:    bound between mid and high      (60th pctile)
# vh_hi: bound between high and very_high (80th pctile)

POP_5TIER = {
    "forefoot_width_ratio":  {"vl_lo": 0.334, "lo": 0.347, "hi": 0.363, "vh_hi": 0.380},
    "arch_length_ratio":     {"vl_lo": 0.703, "lo": 0.719, "hi": 0.731, "vh_hi": 0.745},
    "heel_width_ratio":      {"vl_lo": 0.220, "lo": 0.233, "hi": 0.241, "vh_hi": 0.252},
    "instep_height_ratio":   {"vl_lo": 0.243, "lo": 0.258, "hi": 0.270, "vh_hi": 0.289},
    "heel_depth_ratio":      {"vl_lo": 0.024, "lo": 0.032, "hi": 0.041, "vh_hi": 0.051},
}

# Per-axis 5-tier label tuples (very_low, low, mid, high, very_high)
_LABELS_5TIER = {
    "forefoot_width_ratio":  ("very narrow", "narrow",       "medium-width", "wide",        "very wide"),
    "arch_length_ratio":     ("very short",  "short arch",   "medium",       "long arch",   "very long"),
    "heel_width_ratio":      ("very narrow", "narrow heel",  "medium-width", "wide heel",   "very wide heel"),
    "instep_height_ratio":   ("very low",    "low instep",   "medium",       "high instep", "very high instep"),
    "heel_depth_ratio":      ("very shallow","shallow heel", "medium",       "deep heel",   "very deep heel"),
}


def _classify_5tier(ratio_key, value):
    """Classify a raw ratio into one of 5 tiers using POP_5TIER bounds.
    Returns the user-facing label string (e.g. "very narrow" / "wide").
    Falls back to "medium" if value or bounds are missing.
    """
    if value is None or ratio_key not in POP_5TIER:
        return "medium"
    p = POP_5TIER[ratio_key]
    labels = _LABELS_5TIER[ratio_key]
    if value < p["vl_lo"]:    return labels[0]
    if value < p["lo"]:       return labels[1]
    if value < p["hi"]:       return labels[2]
    if value < p["vh_hi"]:    return labels[3]
    return labels[4]


def _is_extreme_low_5(label):
    """Helper: True if label is 'very X' on the low side."""
    return label.startswith("very ") and any(
        x in label for x in ("narrow", "short", "low", "shallow"))


def _is_extreme_high_5(label):
    """Helper: True if label is 'very X' on the high side."""
    return label.startswith("very ") and any(
        x in label for x in ("wide", "long", "high", "deep"))


# ── T2: Basics paragraph ───────────────────────────────────────────────

_TOE_ARTICLE = {"egyptian": "an", "greek": "a", "roman": "a"}

def _profile_label_t3(fw_label, hw_cls):
    """T3.1..T3.4 — overall profile sentence.
    fw_label is already lower-cased forefoot width without the 'forefoot'
    suffix ('narrow' / 'normal' / 'wide').
    hw_cls is the raw heel class ('narrow heel' / 'normal' / 'wide heel')."""
    fw_n = fw_label == "narrow"
    fw_w = fw_label == "wide"
    fw_norm = fw_label == "normal"
    hw_n = _is_narrow_heel(hw_cls)
    hw_w = _is_wide_heel(hw_cls)
    hw_norm = hw_cls == "normal"

    if fw_n and hw_n:                       # T3.1
        return "Throughout a narrow profile."
    if fw_w and hw_w:                       # T3.2
        return "Throughout a wide profile."
    if fw_norm and hw_norm:                 # T3.3
        return "Throughout a medium profile."
    return "A mixed profile; forefoot and heel require different fits."  # T3.4


def _build_basics_paragraph_v2(p):
    toe = (p.get("toe_shape") or "").lower().strip() or "egyptian"
    article = _TOE_ARTICLE.get(toe, "a")
    toe_cap = toe.capitalize()

    # Roman 2026-05-08: use sandbox 5-tier classifier instead of the
    # production 3-tier `*_class` columns. Production classes still get
    # written; this just re-derives a more granular label from the raw
    # ratio for prose (and to match the 5-section MetricBar in the renderer).
    fw_lbl = _classify_5tier("forefoot_width_ratio", p.get("forefoot_width_ratio"))
    hw_lbl = _classify_5tier("heel_width_ratio", p.get("heel_width_ratio"))

    # Heel labels include " heel" suffix on the low/high tiers (e.g.
    # "narrow heel", "wide heel"); strip for inline use.
    heel_label = hw_lbl.replace(" heel", "")
    forefoot_label = fw_lbl.replace(" forefoot", "")  # no-op (no suffix used)

    if forefoot_label == heel_label:
        # Same width front and back — collapse
        s1 = (f"You have {article} {toe_cap} toe form with "
              f"{forefoot_label} forefoot and heel.")
    else:
        s1 = (f"You have {article} {toe_cap} toe form with "
              f"{forefoot_label} forefoot and a "
              f"{heel_label} heel.")

    # Sentence 2 — overall profile label (T3.1..T3.4)
    s2 = _profile_label_t3_5tier(forefoot_label, heel_label)
    return f"{s1} {s2}"


def _profile_label_t3_5tier(fw_label, hw_label):
    """5-tier-aware overall profile sentence.
    fw_label / hw_label are raw 5-tier labels from _classify_5tier
    (already stripped of " heel" / " forefoot" suffixes).
    """
    # Check for extreme matches on both ends
    fw_low  = fw_label in ("very narrow", "narrow")
    fw_med  = fw_label == "medium-width"
    fw_high = fw_label in ("wide", "very wide")
    hw_low  = hw_label in ("very narrow", "narrow")
    hw_med  = hw_label == "medium-width"
    hw_high = hw_label in ("wide", "very wide")

    if fw_low and hw_low:
        return "Throughout a narrow profile."
    if fw_high and hw_high:
        return "Throughout a wide profile."
    if fw_med and hw_med:
        return "Throughout a medium profile."
    return "A mixed profile; forefoot and heel require different fits."


# ── T4: Secondaries paragraph ─────────────────────────────────────────

def _t4_clause(p):
    """Return the list of T4.x sentences that fire for this profile,
    in declared order T4.2 -> T4.10."""
    out = []

    toe = (p.get("toe_shape") or "egyptian").lower()
    # Raw classifier classes (no soft-promotion) per Roman 2026-05-01 S8 / A.
    arch_cls   = p.get("arch_length_class", "normal")
    instep_cls = p.get("instep_height_class", "normal")
    heel_d_cls = p.get("heel_depth_class", "normal")
    hva = (p.get("hallux_valgus_class") or "normal").lower()

    # T4.2 — non-Egyptian toes
    # Roman 2026-05-01 audit S18: capitalize toe-shape names in §1 prose.
    if toe in ("greek", "roman"):
        toe_cap_t42 = toe.capitalize()
        out.append(
            f"Given your {toe_cap_t42} toes, rather avoid very pointy shoes. "
            "These might squeeze your toe tips, even if the width of the shoe fits you."
        )

    # T4.3 / T4.4 — arch length
    if arch_cls == "long arch":
        out.append(
            "Given your long arch, the ball of your foot may be pushed into "
            "the toe box. A squeezed forefoot may be caused by this instead "
            "of actual shoe width, so look for rather short toe boxes."
        )
    elif arch_cls == "short arch":
        out.append(
            "Your arch is rather short, meaning your toes are relatively long. "
            "Especially when considering aggressive shoes look for sufficient "
            "height in the toe box to let your toes curl up."
        )

    # T4.5 / T4.6 — instep
    if _is_low_instep(instep_cls):
        out.append(
            "Additionally your instep is rather low, so an adjustable closure "
            "is preferable to avoid dead space. Ideally double velcro or laces, "
            "rather avoid pure slippers."
        )
    elif _is_high_instep(instep_cls):
        out.append(
            "Additionally your instep is rather high, so an adjustable closure "
            "is preferable to actually get into the shoe. Ideally double velcro "
            "or laces, you may struggle getting into slippers if adequately downsized."
        )

    # T4.7 / T4.8 — heel depth
    if heel_d_cls == "deep heel":
        out.append(
            "Your deep heel projects further back than most, so a deeper, more "
            "sculpted heel cup fits naturally."
        )
    elif heel_d_cls == "shallow heel":
        out.append(
            "Your shallow heel doesn't project as far back as most. Deeply "
            "sculpted cups will feel empty at the back."
        )

    # T4.9 / T4.10 — HVA
    # Roman 2026-05-08: lead with user-friendly "big toe drifts inwards"
    # description and put the medical term in parentheses. Recommendation
    # uses "not too asymmetric" instead of "less pointed" / "less aggressive".
    if hva in ("mild", "pronounced"):
        drift_word = "slightly" if hva == "mild" else "noticeably"
        if toe == "egyptian":
            out.append(
                f"Your big toe drifts {drift_word} inwards (could be a "
                f"{hva} hallux valgus); we avoid very asymmetric lasts "
                "and prefer moderately asymmetric or wider-tipped designs "
                "that help the big toe stay in contact with the shoe tip."
            )
        else:  # greek or roman — same treatment per Q2
            out.append(
                f"Your big toe drifts {drift_word} inwards (could be a "
                f"{hva} hallux valgus), hence we recommend a slightly "
                "wider and not too asymmetric shape."
            )

    return out


def _build_secondaries_paragraph_v2(p):
    """T4.0 single rule: if no T4.2..T4.10 fires, emit T4.1 (all average).
    Otherwise emit triggered sentences with 'Beyond the obvious:' prefix."""
    clauses = _t4_clause(p)
    if not clauses:
        # T4.1
        return ("As your arch length, instep height and heel depth are within "
                "average, you can focus mostly on toe form and shoe width when "
                "looking for a new shoe.")
    return "Beyond the obvious: " + " ".join(clauses)


def _toe_shape_text(p):
    """Toe shape phrase for the opening sentence.

    Uses toe_delta_ratio (from foot_measure) to decide if the classification
    is clear or borderline. The ratio is normalized by foot length:
      positive = big toe longer (egyptian)
      negative = 2nd toe longer (greek)
      near zero = roughly equal (roman)

    Borderline threshold: abs(ratio) < 0.02 means the toes are almost equal
    and the classification could go either way.
    """
    ts = p["toe_shape"]
    tdr = p.get("toe_delta_ratio")

    # Borderline: delta is very small (toes nearly equal length)
    is_borderline = tdr is not None and abs(tdr) < 0.02

    if is_borderline:
        borderline = {
            "egyptian": (
                "a borderline Egyptian toe shape, where your big toe is the longest "
                "but only barely longer than your second toe"
            ),
            "greek": (
                "a borderline Greek toe shape, where your second toe extends just "
                "slightly past your big toe"
            ),
            "roman": (
                "a borderline Roman toe shape, where your first toes are close "
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


# Soft-class boundary helper REMOVED 2026-05-01 per Roman's S8 / Option A:
# "we keep the boundaries as is".  The V2 prose now uses the raw classifier
# class directly, so it always agrees with what the live MetricBar shows.
# The tag list opening (T1) was already dropped from the locked design, so
# its helper went with the soft-class block.


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
