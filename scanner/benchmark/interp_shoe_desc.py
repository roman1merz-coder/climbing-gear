"""
Template engine for per-shoe recommendation descriptions.

Generates 3 paragraphs for each recommended shoe:
  1. Shoe description: properties, character, special characteristics
  2. Why selected: concrete fit reasons using actual shoe + profile values
  3. Tradeoffs: specific shortcomings of this shoe for this user

Input: a single pick dict (from matrix_scorer output) + the user profile.
Output: list of 3 paragraph strings (plain text, no markdown).
"""

# ── Human-readable labels ─────────────────────────────────────────────

_CLOSURE_LABELS = {
    "lace": "lace-up",
    "velcro": "velcro",
    "slipper": "slipper",
    "hybrid": "hybrid-closure",
}

_DOWNTURN_LABELS = {
    "flat": "flat-lasted",
    "slight": "slightly downturned",
    "moderate": "moderately downturned",
    "aggressive": "aggressively downturned",
}

_SKILL_LABELS = {
    "hobby": "beginner",
    "intermediate": "intermediate",
    "advanced": "advanced",
    "elite": "elite",
}

_WIDTH_RANK = {"narrow": 0, "medium": 1, "wide": 2}
_HV_RANK = {"narrow": 0, "medium": 1, "wide": 2}


def _stiffness_word(val):
    """Return a stiffness descriptor matching the P1 scale."""
    if val is None:
        return None
    if val < 0.25:
        return "very sensitive"
    if val < 0.40:
        return "sensitive"
    if val < 0.60:
        return "balanced"
    if val < 0.75:
        return "supportive"
    return "very supportive"


def _skill_summary(levels):
    if not levels:
        return None
    ordered = ["hobby", "intermediate", "advanced", "elite"]
    present = [l for l in ordered if l in levels]
    if not present:
        return None
    labels = [_SKILL_LABELS.get(l, l) for l in present]
    if len(labels) == 1:
        return labels[0]
    return f"{labels[0]} to {labels[-1]}"


# ── Paragraph 1: Shoe description ─────────────────────────────────────

import re as _re


def _extract_rubber_info(desc):
    """Extract rubber type, thickness, and midsole info from DB description.

    Returns dict with keys: rubber, thickness, midsole, upper, extras.
    Each value is a string or None.
    """
    if not desc:
        return {}
    info = {}

    # Rubber brand/type -- order matters: try specific first, then generic
    # Patterns match ONLY the rubber brand/type name, not trailing text
    _RUBBER_PATTERNS = [
        r"Vibram XS Grip\s*2",
        r"Vibram XS Grip\s*3",
        r"Vibram XS Grip",
        r"Vibram XS Edge",
        r"Vibram Vision",
        r"Vibram",
        r"XS Grip\s*2",
        r"XS Edge",
        r"XS Grip",
        r"TRAX HF",
        r"TRAX SAS",
        r"TRAX XE",
        r"Stealth C4",
        r"Stealth Mi6",
        r"Stealth Onyxx",
        r"Stealth",
        r"Science Friction\s*3\.0",
        r"Science Friction",
        r"Zenith Quattro\s*[\d.]*",
        r"Zenith H",
        r"Zenith S",
        r"NEO Fuse",
        r"NEO Friction",
        r"Xtreme Friction",
        r"Fuse rubber",
        r"RH rubber",
        r"SenseGrip",
    ]
    for pat in _RUBBER_PATTERNS:
        m = _re.search(pat, desc, _re.I)
        if m:
            info["rubber"] = m.group(0).strip()
            break

    # Thickness
    m = _re.search(r"(\d+(?:\.\d+)?)\s*mm", desc)
    if m:
        info["thickness"] = m.group(0).replace(" ", "")

    # Midsole
    lower = desc.lower()
    if "no midsole" in lower or "no-midsole" in lower or "midsole-free" in lower:
        info["midsole"] = "no midsole"
    elif "split-sole" in lower or "split sole" in lower or "semi-split" in lower:
        info["midsole"] = "split sole"
    elif "partial midsole" in lower:
        info["midsole"] = "partial midsole"
    elif "hard midsole" in lower or "3d fit hard" in lower:
        info["midsole"] = "stiff midsole"
    elif "full-length" in lower and "midsole" in lower:
        info["midsole"] = "full-length midsole"
    elif "full midsole" in lower:
        info["midsole"] = "full midsole"
    elif "curved midsole" in lower:
        info["midsole"] = "curved midsole"

    # Upper material
    if "leather-and-microfi" in lower:
        info["upper"] = "leather and microfibre upper"
    elif "leather upper" in lower:
        info["upper"] = "leather upper"
    elif "leather" in lower and "synthetic" not in lower and "microfi" not in lower:
        info["upper"] = "leather upper"
    if "synthetic upper" in lower:
        info["upper"] = "synthetic upper"
    elif "microfiber" in lower or "microfibre" in lower:
        if "upper" not in info:
            info["upper"] = "microfibre upper"
    if "knit" in lower:
        info["upper"] = "knit upper"
    if "unlined" in lower:
        info["unlined"] = True

    # P3 system (La Sportiva)
    if "P3" in desc and "platform" not in lower:
        info["extras"] = "P3 power platform"
    elif "P3 platform" in desc or "P3 System" in desc:
        info["extras"] = "P3 system maintains downturn shape over time"

    return info


def _clean_rubber_name(raw):
    """Extract just the primary rubber compound name from DB rubber_type field.

    DB values can be compound: 'Science Friction 3.0 (sole) / Xtreme Friction (toe patch)'
    or include thickness: 'TRAX SAS 4.2mm'. We want just the main compound name.
    """
    if not raw:
        return ""
    # Take everything before first '(' or '/' -- that's the primary rubber
    name = raw.split("(")[0].split("/")[0].strip()
    # Strip trailing thickness (e.g. "TRAX SAS 4.2mm" -> "TRAX SAS")
    name = _re.sub(r"\s*\d+(\.\d+)?\s*mm\s*$", "", name).strip()
    return name


# Known rubber compounds and their hardness character
_RUBBER_HARDNESS = {
    "vibram xs grip2": "soft",
    "vibram xs grip 2": "soft",
    "vibram xs grip": "soft",
    "vibram xs grip 3": "soft",
    "vibram xs edge": "hard",
    "vibram vision": "medium",
    "vibram": None,
    "stealth c4": "hard",
    "stealth mi6": "soft",
    "stealth onyxx": "medium",
    "stealth": None,
    "trax sas": "soft",
    "trax hf": "medium-soft",
    "trax xe": "hard",
    "science friction 3.0": "medium-soft",
    "science friction": "medium-soft",
    "xtreme friction": "medium",
    "zenith quattro 2.0": "medium",
    "zenith quattro": "medium",
    "zenith h": "hard",
    "zenith s": "medium-soft",
    "neo fuse": "soft",
    "neo friction": "medium",
    "fuse": "soft",
    "cat 1.5": "hard",
    "c4": "hard",
    "la sportiva frixion rs": "medium",
    "la sportiva frixion black": "soft",
    "formula tractor": "medium",
    "formula enduro": "hard",
    "extasy (proprietary)": None,
    "x-factor (proprietary)": None,
    "rh rubber": "medium",
    "s72": "medium",
    "sensegrip": "soft",
    "red chili rx-1 allround": "medium",
}


def _para_description(pick, profile):
    """Concise shoe description: fit profile, toe form, performance, rubber/sole."""
    closure = (pick.get("closure") or "").lower()
    downturn = (pick.get("downturn") or "").lower()
    no_edge = pick.get("no_edge", False)
    width = (pick.get("width") or "").lower()
    hv = (pick.get("heel_volume") or "").lower()
    fv = (pick.get("forefoot_volume") or "").lower()
    asym = (pick.get("asymmetry") or "").lower()
    special = pick.get("special_fit_notes") or ""
    desc = pick.get("description") or ""

    # Structured DB fields (preferred over description parsing)
    db_rubber = pick.get("rubber_type") or ""
    db_thick = pick.get("rubber_thickness_mm")
    db_upper = (pick.get("upper_material") or "").lower()
    toe_form = pick.get("toe_form") or []

    parts = []

    # ── 1. Fit profile + toe form ──
    fit_str = ""
    vol_suffix = ""
    if fv == "low":
        vol_suffix = ", low forefoot volume"
    elif fv == "high":
        vol_suffix = ", high forefoot volume"

    if width and hv:
        if width == hv:
            fit_str = f"{width.capitalize()} fit throughout{vol_suffix}"
        else:
            fit_str = f"{width.capitalize()} forefoot with a {hv} heel cup{vol_suffix}"
    elif width:
        fit_str = f"{width.capitalize()} forefoot{vol_suffix}"

    # Closure -- only slipper or lace are noteworthy
    if closure == "slipper":
        fit_str += ", slipper construction" if fit_str else "Slipper construction"
    elif closure == "lace":
        fit_str += ", lace closure" if fit_str else "Lace closure"

    # Toe form -- always include, it's critical for fit
    tf_lower = [t.lower() for t in toe_form] if toe_form else []
    if tf_lower:
        tf_str = "/".join(tf_lower)
        fit_str += f". {tf_str.capitalize()} toe box" if fit_str else f"{tf_str.capitalize()} toe box"

    if fit_str:
        parts.append(fit_str + ".")

    # ── 2. Performance character ──
    perf_parts = []
    dt_desc = {
        "aggressive": "aggressively downturned",
        "moderate": "moderate downturn",
        "slight": "slight downturn",
        "flat": "flat-lasted",
    }
    asym_desc = {
        "strong": "strong asymmetry",
        "moderate": "moderate asymmetry",
        "slight": "slight asymmetry",
        "none": "symmetric profile",
    }
    dt_str = dt_desc.get(downturn)
    asym_str = asym_desc.get(asym)

    if dt_str and asym_str:
        perf_parts.append(f"{dt_str.capitalize()} with {asym_str}")
    elif dt_str:
        perf_parts.append(dt_str.capitalize())

    if no_edge:
        perf_parts.append(
            "No-edge design wraps rubber smoothly around the sole "
            "for smearing but less precision on small edges"
        )

    if perf_parts:
        parts.append(". ".join(perf_parts) + ".")

    # ── 3. Rubber / sole / upper ──
    # Use structured DB fields; fall back to description parsing only if missing
    sole_bits = []

    # Rubber compound + hardness + thickness
    rubber_name = _clean_rubber_name(db_rubber)
    hardness = _RUBBER_HARDNESS.get(rubber_name.lower(), None) if rubber_name else None

    if not rubber_name:
        # Fallback: try extracting from description
        rinfo = _extract_rubber_info(desc)
        rubber_name = rinfo.get("rubber", "")
        if rubber_name:
            hardness = _RUBBER_HARDNESS.get(rubber_name.lower(), None)

    thickness_str = ""
    if db_thick:
        thickness_str = f"{db_thick:g}mm"

    # Build the rubber phrase: "{thick} {name} rubber ({hardness})"
    rubber_phrase = ""
    if rubber_name:
        # Avoid "Tenaya proprietary rubber rubber"
        base = rubber_name if rubber_name.lower().endswith("rubber") else f"{rubber_name} rubber"
        rubber_phrase = base
        if hardness:
            rubber_phrase = f"{base} ({hardness})"
        if thickness_str:
            rubber_phrase = f"{thickness_str} {rubber_phrase}"
    elif thickness_str:
        rubber_phrase = f"{thickness_str} rubber"

    # Midsole -- from description (no structured field yet)
    rinfo_desc = _extract_rubber_info(desc) if desc else {}
    midsole = rinfo_desc.get("midsole", "")
    midsole_phrase = ""
    if midsole == "no midsole":
        midsole_phrase = "no midsole"
    elif midsole == "split sole":
        midsole_phrase = "split sole"
    elif midsole == "partial midsole":
        midsole_phrase = "partial midsole"
    elif midsole == "stiff midsole":
        midsole_phrase = "stiff midsole"
    elif midsole in ("full midsole", "full-length midsole", "curved midsole"):
        midsole_phrase = midsole

    # Sole stiffness summary from computed_stiffness
    stiffness = pick.get("stiffness")
    stiff_word = ""
    if stiffness is not None:
        if stiffness < 0.25:
            stiff_word = "very sensitive"
        elif stiffness < 0.40:
            stiff_word = "sensitive"
        elif stiffness < 0.60:
            stiff_word = "balanced"
        elif stiffness < 0.75:
            stiff_word = "supportive"
        else:
            stiff_word = "very supportive"

    # Assemble: "{rubber} with {midsole}, resulting in a {stiffness} shoe."
    if rubber_phrase:
        if midsole_phrase and stiff_word:
            sole_bits.append(f"{rubber_phrase} with {midsole_phrase}, resulting in a {stiff_word} shoe")
        elif midsole_phrase:
            sole_bits.append(f"{rubber_phrase} with {midsole_phrase}")
        elif stiff_word:
            sole_bits.append(f"{rubber_phrase}, resulting in a {stiff_word} shoe")
        else:
            sole_bits.append(rubber_phrase)
    elif stiff_word:
        sole_bits.append(f"{stiff_word.capitalize()} shoe")

    if sole_bits:
        parts.append(sole_bits[0] + ".")

    # P3 system (La Sportiva) from description
    if desc:
        lower_desc = desc.lower()
        if "p3" in lower_desc:
            parts.append("P3 system maintains downturn shape over time.")

    # Special fit notes from DB
    if special:
        parts.append(special)

    return " ".join(parts)


# ── Paragraph 2: Why this shoe was selected ───────────────────────────

def _para_why_selected(pick, profile, all_picks=None):
    """Why this shoe was selected -- property-level differentiation.

    Compares this shoe's actual properties against the other picks to
    highlight what makes it distinctive, plus any strong fit signals
    from reference-shoe feedback (heel empty/tight, toes squeezed).
    """
    bd = pick.get("breakdown", {})
    if not bd:
        return "This shoe matches your foot profile well overall."

    shoe_width = (pick.get("width") or "").lower()
    shoe_hv = (pick.get("heel_volume") or "").lower()
    shoe_dt = (pick.get("downturn") or "").lower()
    shoe_asym = (pick.get("asymmetry") or "").lower()
    shoe_stiff = pick.get("stiffness")
    shoe_feel = (pick.get("feel") or "").lower()
    shoe_closure = (pick.get("closure") or "").lower()
    shoe_no_edge = pick.get("no_edge", False)

    pref = (profile.get("next_shoe_preference") or "").lower()
    user_shoes = profile.get("shoes") or []

    # ── Peer property distributions (what the other picks look like) ──

    _DT_RANK = {"flat": 0, "slight": 1, "moderate": 2, "aggressive": 3}
    _FEEL_RANK = {"soft": 0, "moderate-soft": 1, "moderate": 2,
                  "stiff-moderate": 3, "moderate-stiff": 3, "stiff": 4}

    peers = [p for p in (all_picks or []) if p.get("slug") != pick.get("slug")]
    peer_stiffs = [p.get("stiffness") for p in peers if p.get("stiffness") is not None]
    peer_dts = [_DT_RANK.get((p.get("downturn") or "").lower(), -1) for p in peers]
    peer_dts = [d for d in peer_dts if d >= 0]
    peer_feels = [_FEEL_RANK.get((p.get("feel") or "").lower(), -1) for p in peers]
    peer_feels = [f for f in peer_feels if f >= 0]
    peer_widths = [(p.get("width") or "").lower() for p in peers]
    peer_closures = [(p.get("closure") or "").lower() for p in peers]
    peer_no_edge = [p.get("no_edge", False) for p in peers]

    reasons = []

    # ── 1. Reference-shoe feedback (highest value -- solves a real problem) ──
    # Suppress reasons that apply to nearly all peers (they're tier-level facts,
    # not shoe-level differentiators).  Keep at most 1 shared reason as lead-in.

    he_score = bd.get("2-17_heel_empty", 0)
    ht_score = bd.get("2-17_heel_tight", 0)
    ts_score = bd.get("1-15_toes_squeezed", 0)
    tr_score = bd.get("1-15_toes_roomy", 0)
    fft_score = bd.get("1-16_ff_tight", 0)
    ffl_score = bd.get("1-16_ff_loose", 0)

    def _peer_share(score_key, threshold=3):
        """What fraction of peers also score >= threshold on this dimension?"""
        if not peers:
            return 0.0
        return sum(1 for p in peers if p.get("breakdown", {}).get(score_key, 0) >= threshold) / len(peers)

    _feedback_reasons = []   # (reason_text, is_shared_by_most)

    if he_score >= 3:
        shared = _peer_share("2-17_heel_empty") >= 0.7
        _feedback_reasons.append(("the tighter heel should fix the empty-heel feeling from your current shoe", shared))
    elif ht_score >= 3:
        shared = _peer_share("2-17_heel_tight") >= 0.7
        _feedback_reasons.append(("the roomier heel relieves the tightness you felt in your current shoe", shared))
    if ts_score >= 3:
        shared = _peer_share("1-15_toes_squeezed") >= 0.7
        _feedback_reasons.append(("the wider toe box gives your toes more room than your current shoe", shared))
    elif tr_score >= 3:
        shared = _peer_share("1-15_toes_roomy") >= 0.7
        _feedback_reasons.append(("the snugger toe box avoids the loose feeling from your current shoe", shared))
    if fft_score >= 3:
        shared = _peer_share("1-16_ff_tight") >= 0.7
        _feedback_reasons.append(("the wider forefoot relieves the tightness you felt", shared))
    elif ffl_score >= 3:
        shared = _peer_share("1-16_ff_loose") >= 0.7
        _feedback_reasons.append(("the snugger forefoot fixes the loose feeling you experienced", shared))

    unique_feedback = [r for r, shared in _feedback_reasons if not shared]
    shared_feedback = [r for r, shared in _feedback_reasons if shared]

    # Always include unique (non-shared) feedback reasons
    reasons.extend(unique_feedback)
    # Include at most 1 shared reason as lead-in (only if we don't have unique ones)
    if not unique_feedback and shared_feedback:
        reasons.append(shared_feedback[0])

    # Shallow heel (specific user anatomy)
    sh_score = bd.get("2-5_shallow_heel", 0)
    if sh_score >= 3:
        reasons.append("the narrow heel cup suits your shallow heel")

    # Instep relief
    id_score = bd.get("8-4_instep_downturn", 0)
    if id_score >= 3:
        reasons.append("the downturn relieves pressure on your high instep")

    # ── 2. Property-level standouts vs other picks ──

    # Stiffness: only mention if this shoe is notably different from peers
    if shoe_stiff is not None and peer_stiffs:
        avg_stiff = sum(peer_stiffs) / len(peer_stiffs)
        sw = _stiffness_word(shoe_stiff)
        diff = shoe_stiff - avg_stiff
        if abs(diff) >= 0.10 and sw:
            direction = "stiffer" if diff > 0 else "softer"
            benefit = "support" if diff > 0 else "sensitivity"
            reasons.append(f"noticeably {direction} than most other picks, for more {benefit}")
        elif sw and pref and pref not in ("same", ""):
            # Not a standout, but aligns with stated preference
            st_score = bd.get("8-13_stiffness", 0)
            if st_score >= 3:
                reasons.append(f"the {sw} stiffness aligns with your {pref} preference")

    # Downturn: only if different from majority of peers
    shoe_dt_rank = _DT_RANK.get(shoe_dt, -1)
    if shoe_dt_rank >= 0 and peer_dts:
        avg_dt = sum(peer_dts) / len(peer_dts)
        diff = shoe_dt_rank - avg_dt
        _DT_SHORT = {0: "flat", 1: "slight", 2: "moderate", 3: "aggressive"}
        dt_word = _DT_SHORT.get(shoe_dt_rank, shoe_dt)
        if diff >= 0.8:
            reasons.append(f"the {dt_word} downturn is more aggressive than most picks, built for steeper terrain")
        elif diff <= -0.8:
            reasons.append(f"the {dt_word} downturn is less aggressive than most picks, trading power for comfort")
        elif pref == "performance" and shoe_dt_rank >= 2:
            dp_score = bd.get("6-11_downturn_perf", 0)
            if dp_score >= 3:
                reasons.append(f"the {dt_word} downturn delivers on your performance preference")

    # Feel: only if notably different
    shoe_feel_rank = _FEEL_RANK.get(shoe_feel, -1)
    if shoe_feel_rank >= 0 and peer_feels:
        avg_feel = sum(peer_feels) / len(peer_feels)
        diff = shoe_feel_rank - avg_feel
        if diff >= 1.2:
            reasons.append(f"the {shoe_feel} feel is firmer than most other picks")
        elif diff <= -1.2:
            reasons.append(f"the {shoe_feel} feel is softer than most other picks")
        elif bd.get("8b_feel", 0) >= 3 and user_shoes:
            reasons.append(f"the {shoe_feel} feel is close to what you climb in now")

    # Width: only if it stands out among peers
    if shoe_width and peer_widths:
        # Skip if we already mentioned forefoot width from feedback reasons
        _already_width = any("forefoot" in r or "toe box" in r for r in reasons)
        if not _already_width:
            _W_RANK = {"narrow": 0, "medium": 1, "wide": 2}
            shoe_w_rank = _W_RANK.get(shoe_width, -1)
            peer_w_ranks = [_W_RANK.get(w, -1) for w in peer_widths if _W_RANK.get(w, -1) >= 0]
            if shoe_w_rank >= 0 and peer_w_ranks:
                avg_w = sum(peer_w_ranks) / len(peer_w_ranks)
                if shoe_w_rank - avg_w >= 0.5:
                    reasons.append(f"the wider forefoot gives your toes more room than most other picks")
                elif avg_w - shoe_w_rank >= 0.5:
                    reasons.append(f"the narrower forefoot wraps tighter than most other picks")

    # No-edge: distinctive feature
    if shoe_no_edge and not any(peer_no_edge):
        reasons.append("the only edgeless shoe in this set, wrapping around footholds for extra contact")
    elif shoe_no_edge:
        reasons.append("edgeless design wraps around footholds for extra contact")

    # Closure: only if it stands out (e.g. lace among velcros, slipper among velcros)
    if shoe_closure and peer_closures:
        peer_majority = max(set(peer_closures), key=peer_closures.count) if peer_closures else ""
        if shoe_closure != peer_majority:
            _CL = {"lace": "the lace-up closure allows a more custom fit",
                    "slipper": "the slipper design gives a low-profile, sensitive fit",
                    "velcro": "the velcro closure allows quick on/off"}
            cl_text = _CL.get(shoe_closure)
            if cl_text:
                reasons.append(cl_text)

    # ── 3. Fallback: strong fit match (only if we have < 2 reasons) ──

    if len(reasons) < 2:
        fw_score = bd.get("1-1_fw_baseline", 0)
        hv_score = bd.get("2-2_hv_baseline", 0)
        hp_score = bd.get("2-17_heel_perfect", 0)
        if fw_score >= 6 and shoe_width:
            reasons.append(f"the {shoe_width} forefoot is a close match for your foot")
        if hv_score >= 6 and shoe_hv and len(reasons) < 3:
            reasons.append(f"the {shoe_hv} heel fits your foot well")
        if hp_score >= 3 and len(reasons) < 3:
            reasons.append("the heel geometry is close to what already fits you well")

    # Absolute fallback
    if not reasons:
        return "Good overall fit for your foot shape and climbing style."

    # ── Build sentence -- max 3 reasons, natural flow ──

    reasons = reasons[:3]
    if len(reasons) == 1:
        return f"Selected because {reasons[0]}."
    if len(reasons) == 2:
        return f"Selected because {reasons[0]}, and {reasons[1]}."
    return f"Selected because {reasons[0]}. Also, {reasons[1]}, and {reasons[2]}."


def _closest_ref_shoe(user_shoes, shoe_val, db_key, label_fn=None):
    """Find the user's reference shoe whose db_key value is closest to shoe_val.

    Returns (name, ref_val, ref_label) or (None, None, None).
    If label_fn is provided, only considers shoes where the label differs from
    label_fn(shoe_val) -- so we get a meaningful comparison.
    """
    shoe_label = label_fn(shoe_val) if label_fn and shoe_val is not None else None
    best = (None, None, None, float('inf'))
    for us in user_shoes:
        val = us.get(db_key)
        if val is None:
            continue
        ref_label = label_fn(val) if label_fn else None
        # If we have a label function, skip shoes with the same label (no contrast)
        if label_fn and ref_label == shoe_label:
            continue
        dist = abs(shoe_val - val) if shoe_val is not None else 0
        if dist < best[3]:
            name = f"{us.get('brand', '')} {us.get('model', '')}".strip()
            best = (name, val, ref_label, dist)
    if best[0] is None:
        return None, None, None
    return best[0], best[1], best[2]


# ── Paragraph 3: Remaining tradeoffs ──────────────────────────────────

def _para_tradeoffs(pick, profile, all_picks=None):
    """Specific shortcomings of this shoe for this user.

    Names reference shoes explicitly, uses property-level comparisons,
    and provides peer context when available.  Suppresses tradeoffs that
    apply to the majority of picks (those are case-level facts, not
    shoe-level differentiators).
    """
    bd = pick.get("breakdown", {})
    peers = [p for p in (all_picks or []) if p.get("slug") != pick.get("slug")]

    def _shared_by_most(dim_key):
        """True if this negative score also hits >= 70% of peers."""
        if not peers:
            return False
        neg_count = sum(1 for p in peers if p.get("breakdown", {}).get(dim_key, 0) < 0)
        return neg_count / len(peers) >= 0.7

    shoe_width = (pick.get("width") or "").lower()
    shoe_hv = (pick.get("heel_volume") or "").lower()
    shoe_fv = (pick.get("forefoot_volume") or "").lower()
    shoe_dt = (pick.get("downturn") or "").lower()
    shoe_asym = (pick.get("asymmetry") or "").lower()
    shoe_stiff = pick.get("stiffness")
    shoe_feel = (pick.get("feel") or "").lower()
    shoe_closure = (pick.get("closure") or "").lower()
    shoe_toe = pick.get("toe_form") or []

    user_fw = (profile.get("forefoot_width_class") or "").lower()
    user_hw = (profile.get("heel_width_class") or "").lower()
    user_toe = (profile.get("toe_shape") or "").lower()
    pref = (profile.get("next_shoe_preference") or "").lower()
    user_shoes = profile.get("shoes", [])

    _DT_RANK = {"flat": 0, "slight": 1, "moderate": 2, "aggressive": 3}
    _DT_SHORT = {"flat": "flat", "slight": "slight", "moderate": "moderate", "aggressive": "aggressive"}
    _FEEL_RANK = {
        "soft": 0, "moderate-soft": 1, "moderate": 2,
        "stiff-moderate": 3, "moderate-stiff": 3, "stiff": 4,
    }

    # Helper: find reference shoe by fit feedback
    def _ref_shoe_name(feedback_key, feedback_val):
        """Find the user's shoe that gave specific fit feedback."""
        for s in user_shoes:
            fit = s.get("fit", {})
            if isinstance(fit, dict) and fit.get(feedback_key) == feedback_val:
                return f"{s['brand']} {s['model']}"
        return None

    issues = []

    # ── Geometry mismatches ──

    fw_score = bd.get("1-1_fw_baseline", 0)
    if fw_score <= 0 and shoe_width and user_fw and shoe_width != user_fw:
        issues.append(f"the {shoe_width} forefoot runs {'wider' if _WIDTH_RANK.get(shoe_width,1) > _WIDTH_RANK.get(user_fw,1) else 'narrower'} than ideal for your {user_fw} foot")

    hv_score = bd.get("2-2_hv_baseline", 0)
    if hv_score <= 0 and shoe_hv and user_hw:
        issues.append(f"the {shoe_hv} heel is {'roomier' if _HV_RANK.get(shoe_hv,1) > _HV_RANK.get(user_hw,1) else 'tighter'} than your {user_hw} heel needs")

    # Forefoot volume -- skip "standard" (not actionable)
    # Connect to user traits: low instep -> high volume gaps; high instep -> low volume squeezes
    fv_score = bd.get("3-1_fv_baseline", 0)
    if fv_score <= 0 and shoe_fv and shoe_fv != "standard":
        user_instep = (profile.get("instep_height_class") or "").lower()
        if shoe_fv == "high" and "low" in user_instep:
            issues.append("the high forefoot volume will gap over your low instep")
        elif shoe_fv == "low" and "high" in user_instep:
            issues.append("the low forefoot volume may press against your high instep")
        elif shoe_fv == "high":
            issues.append("the high forefoot volume may feel loose over the top of your foot")
        elif shoe_fv == "low":
            issues.append("the low forefoot volume may feel tight across the top of your foot")

    # Toe box shape mismatch
    toe_score = bd.get("4-6_toe_match", 0)
    toe_hint = bd.get("4-15_toe_mismatch_hint", 0)
    if toe_score < 0:
        shoe_toe_lower = [t.lower() for t in shoe_toe] if shoe_toe else []
        if user_toe and user_toe in shoe_toe_lower:
            issues.append(f"the toe box shape may not work well with your foot despite nominally supporting {user_toe}")
        else:
            tf_str = ", ".join(shoe_toe) if shoe_toe else "a different shape"
            issues.append(f"the toe box is built for {tf_str} feet, not {user_toe}")
    elif toe_hint < 0 and toe_score <= 0:
        issues.append(f"the toe box shape is not a perfect match for your {user_toe} foot")

    # Long arch penalty -- suppress if it hits nearly every pick (case-level, not shoe-level)
    la_score = bd.get("1-3_long_arch", 0)
    if la_score < 0 and not _shared_by_most("1-3_long_arch"):
        issues.append("the shoe runs short internally, which can feel cramped with your long arch")

    # Reference-shoe forefoot comparisons -- name the shoe; suppress if shared
    ffl_score = bd.get("1-16_ff_loose", 0)
    fft_score = bd.get("1-16_ff_tight", 0)
    if ffl_score < 0 and not _shared_by_most("1-16_ff_loose"):
        ref = _ref_shoe_name("forefoot", "loose")
        if ref:
            issues.append(f"the forefoot may feel similarly loose to your {ref}")
        else:
            issues.append("the forefoot may feel similarly loose to your current shoe")
    if fft_score < 0 and not _shared_by_most("1-16_ff_tight"):
        ref = _ref_shoe_name("forefoot", "tight")
        if ref:
            issues.append(f"the forefoot may feel similarly tight to your {ref}")
        else:
            issues.append("the forefoot may feel similarly tight to your current shoe")

    # ── Character mismatches ──

    # Downturn -- use short labels, combine score-based and property-level
    dt_short = _DT_SHORT.get(shoe_dt, shoe_dt)
    ds_score = bd.get("6-11_downturn_same", 0)
    dp_score = bd.get("6-11_downturn_perf", 0)
    dc_score = bd.get("6-11_downturn_comfort", 0)
    _dt_mentioned = False

    if ds_score < 0:
        # Different from what user wears -- find which ref shoe is most aggressive
        ref_name = None
        if user_shoes:
            max_rank = -1
            for s in user_shoes:
                rd = (s.get("db_downturn") or "").lower()
                r = _DT_RANK.get(rd, -1)
                if r > max_rank:
                    max_rank = r
                    ref_name = f"{s['brand']} {s['model']}"
        if ref_name:
            issues.append(f"the {dt_short} downturn differs from your {ref_name}")
        else:
            issues.append(f"the {dt_short} downturn differs from what you are used to")
        _dt_mentioned = True
    elif dp_score < 0 and pref == "performance":
        issues.append(f"the {dt_short} downturn is less aggressive than a full performance shoe")
        _dt_mentioned = True
    elif dc_score < 0 and pref in ("comfort", "softer"):
        issues.append(f"more downturn than ideal for all-day comfort")
        _dt_mentioned = True

    # Property-level downturn: less aggressive than ref shoe (even if scorer was positive)
    if not _dt_mentioned and shoe_dt and user_shoes:
        ref_dts = [(s.get("db_downturn") or "").lower() for s in user_shoes if s.get("db_downturn")]
        if ref_dts:
            max_ref_rank = max(_DT_RANK.get(d, 0) for d in ref_dts)
            shoe_dt_rank = _DT_RANK.get(shoe_dt, 0)
            if shoe_dt_rank < max_ref_rank:
                ref_name = None
                for s in user_shoes:
                    rd = (s.get("db_downturn") or "").lower()
                    if _DT_RANK.get(rd, 0) == max_ref_rank:
                        ref_name = f"{s['brand']} {s['model']}"
                        break
                if ref_name:
                    issues.append(f"the {dt_short} downturn is less aggressive than your {ref_name}")

    # Property-level downturn: less aggressive than performance preference
    if not _dt_mentioned and shoe_dt and pref == "performance" and _DT_RANK.get(shoe_dt, 2) < 3:
        _already = any("downturn" in i for i in issues)
        if not _already:
            issues.append(f"the {dt_short} downturn is less aggressive than a full performance shoe")

    # Asymmetry -- only flag when it's a real problem:
    # - Strong asymmetry on a Greek foot (shoe pushes pressure onto 2nd toe)
    # - Egyptian foot in a very pointy asymmetric shoe (toe tip left empty)
    # Symmetric/minimal asymmetry is fine for all toe shapes -- it's a
    # performance characteristic, not a fit issue.
    asym_score = bd.get("7-6_asym", 0)
    asym_hint = bd.get("7-15_asym_hint", 0)
    asym_same = bd.get("7-11_asym_same", 0)
    asym_perf = bd.get("7-11_asym_perf", 0)
    asym_net_positive = (asym_same >= 3) or (asym_perf >= 3)
    _ASYM_RANK = {"none": 0, "slight": 1, "moderate": 2, "strong": 3}
    shoe_asym_rank = _ASYM_RANK.get(shoe_asym, 0)
    if asym_score < 0 and user_toe:
        # Only surface when: shoe is asymmetric AND user has Greek toe
        # (strong asymmetry on Greek foot is a genuine fit concern)
        if shoe_asym_rank >= 2 and user_toe == "greek":
            issues.append(f"the {shoe_asym} asymmetry may push pressure onto your longer second toe")
        elif shoe_asym_rank >= 2 and user_toe == "egyptian":
            # Very asymmetric Egyptian last -- only flag if extreme
            if shoe_asym_rank >= 3:
                issues.append(f"the {shoe_asym} asymmetry may leave the shoe tip empty if your big toe drifts inward")
    elif asym_hint < 0 and asym_score <= 0 and not asym_net_positive:
        # Hint-level: only flag strong asymmetry on Greek feet
        if shoe_asym_rank >= 2 and user_toe == "greek":
            issues.append(f"the {shoe_asym} asymmetry could put pressure on your second toe")

    # Stiffness -- combine note-based and baseline, dedup
    sn_score = bd.get("8-12b_notes_stiff_extra", 0)
    st_score = bd.get("8-13_stiffness", 0)
    sw = _stiffness_word(shoe_stiff)
    if sn_score < 0:
        if sw:
            issues.append(f"the {sw} stiffness does not match what you asked for")
        else:
            issues.append("the stiffness does not match what you asked for")
    elif st_score < 0:
        if sw:
            ref_name, ref_val, ref_sw = _closest_ref_shoe(
                user_shoes, shoe_stiff, "db_stiffness", _stiffness_word)
            if ref_name and ref_val is not None:
                if shoe_stiff < ref_val:
                    issues.append(f"the {sw} sole is softer than your {ref_sw} {ref_name}")
                else:
                    issues.append(f"the {sw} sole is stiffer than your {ref_sw} {ref_name}")
            else:
                direction = "stiffer" if shoe_stiff and shoe_stiff > 0.5 else "softer"
                issues.append(f"the {sw} stiffness is {direction} than what you currently climb in")

    # Feel -- name the closest ref shoe with a 2+ rank difference
    def _feel_label(val):
        """Map numeric feel rank back to label -- used by _closest_ref_shoe."""
        return None  # we don't need label-based filtering for feel

    def _find_feel_ref():
        """Find the closest user shoe with a 2+ feel rank difference."""
        if not shoe_feel or not user_shoes:
            return None, None
        shoe_feel_rank = _FEEL_RANK.get(shoe_feel)
        if shoe_feel_rank is None:
            return None, None
        best = (None, None, float('inf'))
        for rs in user_shoes:
            rf = (rs.get("db_feel") or "").lower()
            ref_rank = _FEEL_RANK.get(rf)
            if ref_rank is not None and abs(shoe_feel_rank - ref_rank) >= 2:
                dist = abs(shoe_feel_rank - ref_rank)
                # Prefer closest (smallest difference that's still >= 2)
                if dist < best[2]:
                    name = f"{rs['brand']} {rs['model']}"
                    direction = "stiffer" if shoe_feel_rank > ref_rank else "softer"
                    best = (name, direction, dist)
        if best[0]:
            return best[0], best[1]
        return None, None

    feel_score = bd.get("8b_feel", 0)
    if feel_score < 0:
        ref_feel_name, feel_dir = _find_feel_ref()
        if ref_feel_name:
            issues.append(f"the {shoe_feel} feel is noticeably {feel_dir} than your {ref_feel_name}")
        elif shoe_feel:
            issues.append(f"the {shoe_feel} feel differs from what you climb in now")
    else:
        # Feel score is >= 0, but property-level check: 2+ ranks from ref shoes
        _already = any("feel" in i for i in issues)
        if not _already:
            ref_feel_name, feel_dir = _find_feel_ref()
            if ref_feel_name:
                issues.append(f"the {shoe_feel} feel is noticeably {feel_dir} than your {ref_feel_name}")

    # Closure / instep
    instep_score = bd.get("8c_instep", 0)
    user_instep = (profile.get("instep_height_class") or "").lower()
    user_instep_clean = user_instep.replace(" instep", "").strip()
    if instep_score < 0 and user_instep_clean and user_instep_clean not in ("normal", ""):
        issues.append(f"the {shoe_closure} closure may not work well with your {user_instep_clean} instep")

    # Instep/downturn
    id_score = bd.get("8-4_instep_downturn", 0)
    if id_score < 0:
        issues.append("the flat profile may press on your high instep")

    # Shallow heel
    sh_score = bd.get("2-5_shallow_heel", 0)
    if sh_score < 0:
        issues.append("the heel cup may feel too deep for your shallow heel")

    # Reference-shoe problems -- name the actual shoe; suppress if shared by most picks
    he_score = bd.get("2-17_heel_empty", 0)
    if he_score < 0 and not _shared_by_most("2-17_heel_empty"):
        ref = _ref_shoe_name("heel", "empty")
        if ref:
            issues.append(f"the heel may feel similarly empty to your {ref}")
        else:
            issues.append("the heel fit may feel similarly empty to your current shoe")

    ht_ref_score = bd.get("2-17_heel_tight", 0)
    if ht_ref_score < 0 and not _shared_by_most("2-17_heel_tight"):
        ref = _ref_shoe_name("heel", "tight")
        if ref:
            issues.append(f"the heel is similarly tight to your {ref}")
        else:
            issues.append("the heel is similarly tight to your current shoe")

    ts_score = bd.get("1-15_toes_squeezed", 0)
    if ts_score < 0 and not _shared_by_most("1-15_toes_squeezed"):
        ref = _ref_shoe_name("toes", "squeezed")
        if ref:
            issues.append(f"the toe box may squeeze similarly to your {ref}")
        else:
            issues.append("the toe box may squeeze your toes like your current shoe")

    tr_score = bd.get("1-15_toes_roomy", 0)
    if tr_score < 0 and not _shared_by_most("1-15_toes_roomy"):
        ref = _ref_shoe_name("toes", "roomy")
        if ref:
            issues.append(f"the toe box is similarly roomy to your {ref}")
        else:
            issues.append("the toe box may feel similarly roomy to your current shoe")

    # ── Weak-match signals: score is low (0-2) but not negative ──
    # These surface when no stronger tradeoffs were found.

    _FEEL_RANK = _FEEL_RANK  # already defined above

    # Feel doesn't match reference shoes (score 0-1 = very different feel)
    if bd.get("8b_feel", 99) <= 1 and shoe_feel and user_shoes:
        _already = any("feel" in i for i in issues)
        if not _already:
            for rs in user_shoes:
                rf = (rs.get("db_feel") or "").lower()
                if rf and rf != shoe_feel:
                    issues.append(f"the {shoe_feel} feel differs from the {rf} feel of your {rs['brand']} {rs['model']}")
                    break

    # Downturn doesn't match reference (dt_same = 0 means completely different)
    if bd.get("6-11_downturn_same", 99) == 0 and shoe_dt and user_shoes:
        _already = any("downturn" in i for i in issues)
        if not _already:
            for rs in user_shoes:
                rd = (rs.get("db_downturn") or "").lower()
                if rd and rd != shoe_dt:
                    dt_short_val = _DT_SHORT.get(shoe_dt, shoe_dt)
                    rd_short = _DT_SHORT.get(rd, rd)
                    issues.append(f"the {dt_short_val} downturn is a different profile than the {rd_short} downturn on your {rs['brand']} {rs['model']}")
                    break

    # Width match weak (score <= 2 = not a close fit)
    fw_score = bd.get("1-1_fw_baseline", 99)
    if fw_score <= 2 and fw_score >= 0 and shoe_width and user_fw:
        _already = any("forefoot" in i and ("width" in i or "wider" in i or "narrower" in i) for i in issues)
        if not _already:
            # Clean "normal" -- just say "your foot width"
            fw_label = f"your {user_fw} foot" if user_fw != "normal" else "your foot"
            issues.append(f"the {shoe_width} forefoot is not an exact match for {fw_label} width")

    # Heel volume weak (score <= 2 = not a close fit)
    hv_score = bd.get("2-2_hv_baseline", 99)
    if hv_score <= 2 and hv_score >= 0 and shoe_hv and user_hw:
        _already = any("heel" in i for i in issues)
        if not _already:
            # Clean user_hw: strip trailing "heel" to avoid "narrow heel heel"
            hw_clean = user_hw.replace(" heel", "").strip() if user_hw else ""
            hw_label = f"your {hw_clean} heel" if hw_clean and hw_clean != "normal" else "your heel"
            issues.append(f"the {shoe_hv} heel volume is not an exact match for {hw_label}")

    # Stiffness weak (score <= 2 = doesn't align well with user's current shoes)
    st_score_weak = bd.get("8-13_stiffness", 99)
    if st_score_weak <= 2 and st_score_weak >= 0:
        _already = any("stiffness" in i or "sole is" in i for i in issues)
        if not _already:
            sw = _stiffness_word(shoe_stiff)
            if sw:
                ref_stiff_name, ref_stiff_val, ref_sw_label = _closest_ref_shoe(
                    user_shoes, shoe_stiff, "db_stiffness", _stiffness_word)
                if ref_stiff_name:
                    if shoe_stiff < ref_stiff_val:
                        issues.append(f"the {sw} sole is softer than your {ref_sw_label} {ref_stiff_name}")
                    else:
                        issues.append(f"the {sw} sole is stiffer than your {ref_sw_label} {ref_stiff_name}")
                else:
                    issues.append(f"the {sw} sole is a different stiffness than what you currently climb in")

    # Hint-level negatives (toe/asym hints) -- fire even if issues exist
    def _bd_num(key, default=0):
        """Safely get a numeric value from breakdown dict."""
        val = bd.get(key, default)
        return val if isinstance(val, (int, float)) else default

    toe_hint_v = _bd_num("4-15_toe_mismatch_hint")
    toe_main = _bd_num("4-6_toe_match")
    asym_hint_v = _bd_num("7-15_asym_hint")
    asym_main = _bd_num("7-6_asym")
    if toe_hint_v < 0 and toe_main <= 0 and user_toe:
        _already = any("toe box" in i for i in issues)
        if not _already:
            issues.append(f"the toe box is not a perfect match for your {user_toe} foot shape")
    if asym_hint_v < 0 and asym_main <= 0 and user_toe == "greek":
        _already = any("asymmetry" in i for i in issues)
        if not _already and shoe_asym_rank >= 2:
            issues.append(f"the {shoe_asym} asymmetry could put pressure on your second toe")

    # Last resort: if issues is empty but there ARE negative scores
    # (all were suppressed as shared), surface the most impactful one
    if not issues:
        neg_dims = [(k, v) for k, v in bd.items()
                    if isinstance(v, (int, float)) and v < 0 and k != "13_no_stock_data"]
        if neg_dims:
            neg_dims.sort(key=lambda x: x[1])  # most negative first
            worst_key, worst_val = neg_dims[0]
            _SUPPRESSED_MSG = {
                "1-3_long_arch": "the shoe runs short internally -- check comfort with your long arch when trying on",
                "1-15_toes_squeezed": "the toe box is on the narrow side -- check toe comfort when trying on",
                "1-15_toes_roomy": "the toe box runs roomy -- check that your toes feel secure",
                "3-1_fv_baseline": "the forefoot volume is not ideal for your foot -- check fit when trying on",
                "4-15_toe_mismatch_hint": "the toe box shape is not a perfect match for your foot",
                "7-15_asym_hint": f"the {shoe_asym} asymmetry could put pressure on your second toe" if user_toe == "greek" and shoe_asym_rank >= 2 else None,
            }
            msg = _SUPPRESSED_MSG.get(worst_key)
            if msg:
                issues.append(msg)

    if not issues:
        return "No notable tradeoffs for your foot shape."

    # Pick top 3 issues max
    issues = issues[:3]
    issues[0] = issues[0][0].upper() + issues[0][1:]
    if len(issues) == 1:
        return f"Tradeoff: {issues[0]}."
    if len(issues) == 2:
        return f"Tradeoffs: {issues[0]}, and {issues[1]}."
    return f"Tradeoffs: {issues[0]}; {issues[1]}; and {issues[2]}."


# ── Public API ────────────────────────────────────────────────────────

def generate_shoe_description(pick, profile, all_picks=None):
    """Generate 3 description paragraphs for a recommended shoe.

    Args:
        pick: dict from matrix_scorer output (brand, model, score, breakdown, ...)
        profile: user profile dict (same as used by interp engines)
        all_picks: optional list of all picks in this recommendation set,
                   used to highlight where this shoe stands out vs peers

    Returns:
        list of 3 paragraph strings:
          [0] shoe description
          [1] why selected
          [2] tradeoffs
    """
    p2 = _para_why_selected(pick, profile, all_picks=all_picks)
    if pick.get("not_in_stock"):
        p2 += " Note: this shoe is not currently available online -- check local shops or wait for restocks."
    return [
        _para_description(pick, profile),
        p2,
        _para_tradeoffs(pick, profile, all_picks=all_picks),
    ]
