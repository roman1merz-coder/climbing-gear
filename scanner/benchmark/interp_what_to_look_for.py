"""
Template engine for "What to Look For" interpretation section (Section 3).

Synthesizes scan measurements + shoe fit feedback into concrete guidance
for what properties to look for in the next shoe.

Key logic:
- Measurement targets (from scan) vs feedback targets (from shoe fit)
- When they diverge: explain why and which we follow
- Stiffness-dependent cross-tier adjustment (soft shoes forgive snug,
  stiff shoes forgive loose)
- Closure/instep guidance (only when relevant)
- User preference integration (performance, comfort, same)
- HVA toe box guidance (only when HVA present)
- Competing constraints / tradeoffs

Output: list of paragraph strings (plain text, no markdown).
"""

import json
from pathlib import Path

# ── Rank helpers (must match matrix_scorer.py) ─────────────────────────

_WIDTH_LABELS = {0: "narrow", 1: "medium", 2: "wide"}
_HV_LABELS = {0: "narrow", 1: "medium", 2: "wide"}

def _width_rank(w):
    w = (w or "").lower().strip()
    if w == "narrow": return 0
    if w == "medium": return 1
    if w == "wide": return 2
    return 1

def _heel_vol_rank(v):
    v = (v or "").lower().strip()
    if v in ("low", "narrow"): return 0
    if v in ("standard", "medium"): return 1
    if v in ("high", "wide"): return 2
    return 1

def _fv_rank(fv):
    fv = (fv or "").lower().strip()
    if fv in ("low",): return 0
    if fv in ("standard", "medium", ""): return 1
    if fv in ("high",): return 2
    return 1

def _rank_label(rank, labels=None):
    labels = labels or _WIDTH_LABELS
    return labels.get(rank, "medium")


# ── Stiffness helpers ──────────────────────────────────────────────────

def _stiffness_tier(val):
    if val is None: return "moderate"
    if val < 0.33: return "soft"
    if val <= 0.66: return "moderate"
    return "stiff"

def _stiffness_label(val):
    if val is None: return "moderate"
    if val < 0.15: return "very soft"
    if val < 0.33: return "soft"
    if val < 0.50: return "moderate"
    if val <= 0.66: return "moderately stiff"
    if val <= 0.80: return "stiff"
    return "very stiff"


# ── Measurement-based targets ──────────────────────────────────────────

def _meas_width_target(profile):
    cls = (profile.get("forefoot_width_class") or "normal").lower()
    if cls == "narrow": return 0
    if cls == "wide": return 2
    return 1

def _meas_heel_target(profile):
    cls = (profile.get("heel_width_class") or "normal").lower()
    if cls in ("narrow", "narrow heel"): return 0
    if cls in ("wide", "wide heel"): return 2
    return 1


# ── Feedback-based targets ─────────────────────────────────────────────

def _feedback_targets(shoes):
    fw_targets, hv_targets, fv_targets = [], [], []
    for s in shoes:
        fit = s.get("fit", {})
        cur_w = _width_rank(s.get("db_width"))
        cur_hv = _heel_vol_rank(s.get("db_heel_volume"))
        cur_fv = _fv_rank(s.get("db_forefoot_volume"))
        ff = fit.get("forefoot", "")
        toes = fit.get("toes", "")
        heel = fit.get("heel", "")

        if ff == "perfect" and toes in ("perfect", "good", ""):
            fw_targets.append(cur_w)
        elif ff in ("tight", "squeezed") or toes == "squeezed":
            fw_targets.append(min(2, cur_w + 1))
        elif ff in ("loose", "roomy") or toes == "roomy":
            fw_targets.append(max(0, cur_w - 1))

        if heel == "perfect":
            hv_targets.append(cur_hv)
        elif heel in ("empty", "loose"):
            hv_targets.append(max(0, cur_hv - 1))
        elif heel in ("tight", "squeezed"):
            hv_targets.append(min(2, cur_hv + 1))

        if ff == "perfect":
            fv_targets.append(cur_fv)
        elif ff == "tight":
            fv_targets.append(min(2, cur_fv + 1))
        elif ff == "loose":
            fv_targets.append(max(0, cur_fv - 1))

    return fw_targets, hv_targets, fv_targets


def _avg_round(targets):
    """Average feedback targets and round.  Use half-up rounding (0.5 -> 1)
    instead of Python 3 banker's rounding (0.5 -> 0).  When in doubt,
    wider/more volume is the safer direction -- avoids pain and squeeze."""
    if not targets: return None
    avg = sum(targets) / len(targets)
    import math
    return int(math.floor(avg + 0.5))


def _clamp_to_scan(target, scan_target):
    """Clamp feedback-derived target to at most 1 level from the scan target.

    A 2-level jump (e.g. scan=narrow, feedback=wide) almost always means
    the fit issue is shoe-specific (toe form mismatch, unusual last geometry)
    rather than the foot actually needing 2 levels of adjustment.
    Returns (clamped_target, was_clamped).
    """
    if target is None:
        return scan_target, False
    diff = target - scan_target
    if abs(diff) <= 1:
        return target, False
    # Clamp to 1 level in the feedback direction
    clamped = scan_target + (1 if diff > 0 else -1)
    return clamped, True


# ── Count helpers ──────────────────────────────────────────────────────

def _count_word(n, total):
    """'both' for 2/2, 'all 3' for 3/3, 'N of your M' otherwise."""
    if n == total:
        if n == 2: return "both"
        return f"all {n}"
    return f"{n} of your {total}"


# ── Fit pattern helpers ────────────────────────────────────────────────

def _fit_issue_desc(ff, toes):
    """Describe a forefoot/toes issue accurately."""
    if ff in ("tight", "squeezed") and toes == "squeezed":
        return "feels tight in the forefoot with squeezed toes"
    if ff in ("tight", "squeezed"):
        return "feels tight in the forefoot"
    if toes == "squeezed":
        return "has squeezed toes"
    if ff in ("loose", "roomy") and toes == "roomy":
        return "feels loose in the forefoot with roomy toes"
    if ff in ("loose", "roomy"):
        return "feels loose in the forefoot"
    if toes == "roomy":
        return "has roomy toes"
    return None


# ── Paragraph builders ─────────────────────────────────────────────────

def _para_target_profile(profile, shoes):
    """P1: What width and heel volume we target, and why.

    Rewrites the previous mechanical structure into flowing prose.
    - Single shoe perfect fit: lead with the shoe as reference
    - Scan + feedback agree: one clean sentence
    - Divergence: explain cause and state adjusted target in one go
    """
    meas_fw = _meas_width_target(profile)
    meas_hv = _meas_heel_target(profile)

    fb_fw, fb_hv, _ = _feedback_targets(shoes)
    raw_target_fw = _avg_round(fb_fw) if fb_fw else meas_fw
    raw_target_hv = _avg_round(fb_hv) if fb_hv else meas_hv
    target_fw, fw_clamped = _clamp_to_scan(raw_target_fw, meas_fw)
    target_hv, hv_clamped = _clamp_to_scan(raw_target_hv, meas_hv)

    has_feedback = bool(fb_fw or fb_hv)
    fw_diverges = fb_fw and target_fw != meas_fw
    hv_diverges = fb_hv and target_hv != meas_hv

    meas_fw_label = _rank_label(meas_fw)
    meas_hv_label = _rank_label(meas_hv, _HV_LABELS)
    target_fw_label = _rank_label(target_fw)
    target_hv_label = _rank_label(target_hv, _HV_LABELS)
    n = len(shoes)

    if not has_feedback:
        return (
            f"Based on your scan, we target {meas_fw_label}-width shoes "
            f"with {meas_hv_label} heel volume. Without fit feedback from a current shoe, "
            "these targets come directly from your foot dimensions."
        )

    # ── Special: single shoe, both diverge via perfect fit ──
    if fw_diverges and hv_diverges and n == 1:
        s = shoes[0]
        fit = s.get("fit", {})
        ff_ok = fit.get("forefoot") == "perfect" and fit.get("toes") in ("perfect", "good", "")
        heel_ok = fit.get("heel") == "perfect"
        if ff_ok and heel_ok:
            sw = _rank_label(_width_rank(s.get("db_width")))
            shv = _rank_label(_heel_vol_rank(s.get("db_heel_volume")), _HV_LABELS)
            return (
                f"Your {s['brand']} {s['model']} ({sw} width, {shv} heel volume) "
                f"fits perfectly despite your scan suggesting {meas_fw_label} width "
                f"and {meas_hv_label} heel volume. We follow your shoe's proven fit "
                f"and target {target_fw_label} width with {target_hv_label} heel volume."
            )

    # ── No divergence: scan and feedback agree ──
    if not fw_diverges and not hv_diverges:
        # Find the best confirming shoe
        perfect_shoes = [s for s in shoes
                         if s.get("fit", {}).get("forefoot") == "perfect"
                         and s.get("fit", {}).get("heel") == "perfect"]
        if perfect_shoes:
            s = perfect_shoes[0]
            shoe_w = _rank_label(_width_rank(s.get("db_width")))
            if n == 1:
                return (
                    f"Your {s['brand']} {s['model']} ({shoe_w} width, "
                    f"{_rank_label(_heel_vol_rank(s.get('db_heel_volume')), _HV_LABELS)} "
                    f"heel volume) fits well across all dimensions. "
                    f"Your scan confirms this geometry, so we target "
                    f"{target_fw_label}-width shoes with {target_hv_label} heel volume."
                )
            return (
                f"Your scan and shoe fit feedback agree: we target "
                f"{target_fw_label}-width shoes with {target_hv_label} heel volume. "
                f"Your {s['brand']} {s['model']} ({shoe_w} width) confirms this."
            )
        return (
            f"Your scan and shoe fit feedback agree: we target "
            f"{target_fw_label}-width shoes with {target_hv_label} heel volume."
        )

    # ── Divergence: build the explanation ──
    parts = []

    # Width explanation
    fw_text = _explain_fw(shoes, meas_fw, target_fw, n, clamped=fw_clamped) if fw_diverges else None
    # Heel explanation
    hv_text = _explain_hv(shoes, meas_hv, target_hv, n, clamped=hv_clamped) if hv_diverges else None

    if fw_diverges and hv_diverges:
        # Both diverge: combine into flowing prose
        parts.append(
            f"Your scan points to {meas_fw_label}-width shoes with {meas_hv_label} "
            f"heel volume, but your shoe feedback adjusts both."
        )
        if fw_text: parts.append(fw_text)
        if hv_text: parts.append(hv_text)
        parts.append(
            f"Adjusted target: {target_fw_label} width, {target_hv_label} heel volume."
        )
    elif fw_diverges:
        parts.append(fw_text or "")
        # State the full target at the end
        parts.append(
            f"Combined with your scan-aligned {target_hv_label} heel volume, "
            f"we target {target_fw_label}-width shoes with {target_hv_label} heel volume."
        )
    else:
        parts.append(hv_text or "")
        parts.append(
            f"Combined with your scan-aligned {target_fw_label} width, "
            f"we target {target_fw_label}-width shoes with {target_hv_label} heel volume."
        )

    return " ".join(p for p in parts if p)


def _explain_fw(shoes, meas_fw, target_fw, n, clamped=False):
    """Compact width divergence explanation."""
    meas_label = _rank_label(meas_fw)
    target_label = _rank_label(target_fw)
    going_wider = target_fw > meas_fw

    tight_shoes = []
    loose_shoes = []
    perfect_divergent = []

    for s in shoes:
        fit = s.get("fit", {})
        ff, toes = fit.get("forefoot", ""), fit.get("toes", "")
        sw = _rank_label(_width_rank(s.get("db_width")))

        if ff in ("tight", "squeezed") or toes == "squeezed":
            tight_shoes.append((s, sw))
        elif ff in ("loose", "roomy") or toes == "roomy":
            loose_shoes.append((s, sw))
        elif ff == "perfect" and toes in ("perfect", "good", ""):
            if _width_rank(s.get("db_width")) != meas_fw:
                perfect_divergent.append((s, sw))

    if going_wider and tight_shoes:
        cnt = len(tight_shoes)
        if cnt >= 2:
            if clamped:
                return (
                    f"In {_count_word(cnt, n)} shoes the forefoot or toes feel too tight. "
                    f"This is likely shoe-specific (toe box shape mismatch) rather than "
                    f"your {meas_label} foot needing much wider shoes. "
                    f"We go one level wider to {target_label}."
                )
            return (
                f"In {_count_word(cnt, n)} shoes the forefoot or toes feel too tight, "
                f"pushing the width target from {meas_label} to {target_label}."
            )
        s, sw = tight_shoes[0]
        desc = _fit_issue_desc(
            s.get("fit", {}).get("forefoot", ""),
            s.get("fit", {}).get("toes", ""))
        if clamped:
            return (
                f"Your {s['brand']} {s['model']} ({sw} width) {desc}. "
                f"This is likely a shoe-specific fit issue (toe box shape or last geometry) "
                f"rather than your {meas_label} foot needing a much wider shoe. "
                f"We go one level wider to {target_label}."
            )
        return (
            f"Your {s['brand']} {s['model']} ({sw} width) {desc}, "
            f"pushing the width target from {meas_label} to {target_label}."
        )
    if going_wider and not tight_shoes and loose_shoes:
        # Shoe is wider than scan and loose -- target lands between scan and shoe
        s, sw = loose_shoes[0]
        return (
            f"Your {s['brand']} {s['model']} ({sw} width) feels loose in the forefoot, "
            f"confirming you don't need that much room. We target {target_label} width, "
            f"narrower than the shoe but wider than your scan's {meas_label} measurement."
        )
    if not going_wider and loose_shoes:
        cnt = len(loose_shoes)
        if cnt >= 2:
            if clamped:
                return (
                    f"In {_count_word(cnt, n)} shoes the forefoot feels loose. "
                    f"This is likely shoe-specific rather than your {meas_label} foot "
                    f"needing much narrower shoes. We go one level narrower to {target_label}."
                )
            return (
                f"In {_count_word(cnt, n)} shoes the forefoot feels loose, "
                f"pushing the width target from {meas_label} to {target_label}."
            )
        s, sw = loose_shoes[0]
        desc = _fit_issue_desc(
            s.get("fit", {}).get("forefoot", ""),
            s.get("fit", {}).get("toes", ""))
        if clamped:
            return (
                f"Your {s['brand']} {s['model']} ({sw} width) {desc}. "
                f"This is likely shoe-specific rather than your {meas_label} foot "
                f"needing much narrower shoes. We go one level narrower to {target_label}."
            )
        return (
            f"Your {s['brand']} {s['model']} ({sw} width) {desc}, "
            f"pushing the width target from {meas_label} to {target_label}."
        )
    if perfect_divergent:
        s, sw = perfect_divergent[0]
        direction = "snugger" if target_fw < meas_fw else "roomier"
        return (
            f"Your {s['brand']} {s['model']} ({sw} width) fits perfectly despite "
            f"your scan suggesting {meas_label}. You prefer a {direction} forefoot, "
            f"so we target {target_label} width."
        )
    return (
        f"Your shoe feedback shifts the width target "
        f"from {meas_label} to {target_label}."
    )


def _explain_hv(shoes, meas_hv, target_hv, n, clamped=False):
    """Compact heel volume divergence explanation."""
    meas_label = _rank_label(meas_hv, _HV_LABELS)
    target_label = _rank_label(target_hv, _HV_LABELS)

    empty_shoes = []
    tight_shoes = []
    perfect_divergent = []

    for s in shoes:
        heel = s.get("fit", {}).get("heel", "")
        shv = _rank_label(_heel_vol_rank(s.get("db_heel_volume")), _HV_LABELS)
        if heel in ("empty", "loose"):
            empty_shoes.append((s, shv))
        elif heel in ("tight", "squeezed"):
            tight_shoes.append((s, shv))
        elif heel == "perfect" and _heel_vol_rank(s.get("db_heel_volume")) != meas_hv:
            perfect_divergent.append((s, shv))

    if target_hv < meas_hv and empty_shoes:
        cnt = len(empty_shoes)
        if cnt >= 2:
            if clamped:
                return (
                    f"The heel feels empty in {_count_word(cnt, n)} shoes. "
                    f"This is likely shoe-specific (heel cup geometry) rather than your "
                    f"{meas_label} heel needing much tighter shoes. "
                    f"We go one level tighter to {target_label}."
                )
            return (
                f"The heel feels empty in {_count_word(cnt, n)} shoes, "
                f"so we tighten the heel target from {meas_label} to {target_label}."
            )
        s, shv = empty_shoes[0]
        if clamped:
            return (
                f"Your heel feels empty in the {s['brand']} {s['model']} ({shv} heel volume). "
                f"This is likely shoe-specific (heel cup geometry) rather than your "
                f"{meas_label} heel needing much tighter shoes. "
                f"We go one level tighter to {target_label}."
            )
        return (
            f"Your heel feels empty in the {s['brand']} {s['model']} ({shv} heel volume), "
            f"so we tighten the heel target from {meas_label} to {target_label}."
        )
    if target_hv > meas_hv and tight_shoes:
        cnt = len(tight_shoes)
        s, shv = tight_shoes[0]
        if clamped:
            return (
                f"Your heel feels tight in the {s['brand']} {s['model']} ({shv} heel volume). "
                f"This is likely shoe-specific rather than your {meas_label} heel "
                f"needing much more room. We go one level wider to {target_label}."
            )
        return (
            f"Your heel feels tight in the {s['brand']} {s['model']} ({shv} heel volume), "
            f"so we widen the heel target from {meas_label} to {target_label}."
        )
    if perfect_divergent:
        s, shv = perfect_divergent[0]
        return (
            f"Your heel fits perfectly in the {s['brand']} {s['model']} ({shv} heel volume) "
            f"despite your scan suggesting {meas_label}, "
            f"so we follow the feedback and target {target_label}."
        )
    return (
        f"Your shoe feedback shifts the heel target "
        f"from {meas_label} to {target_label}."
    )


def _para_stiffness_adjustment(profile, shoes):
    """Stiffness-dependent cross-tier adjustment.

    Key insight: the adjustment direction depends on WHY the target diverged.
    - Empty heel in soft shoe → stiffness HELPS (structured heel grips better)
    - Snug/perfect heel in soft narrow shoe → stiffness HURTS (can't yield)
    - Tight forefoot in stiff shoe → softness needs narrower
    - Loose forefoot in stiff shoe → softness gets sloppy
    """
    meas_fw = _meas_width_target(profile)
    meas_hv = _meas_heel_target(profile)
    fb_fw, fb_hv, _ = _feedback_targets(shoes)
    raw_fw = _avg_round(fb_fw) if fb_fw else meas_fw
    raw_hv = _avg_round(fb_hv) if fb_hv else meas_hv
    target_fw, _ = _clamp_to_scan(raw_fw, meas_fw)
    target_hv, _ = _clamp_to_scan(raw_hv, meas_hv)

    fw_diverges = fb_fw and target_fw != meas_fw
    hv_diverges = fb_hv and target_hv != meas_hv
    if not fw_diverges and not hv_diverges:
        return None

    # Detect what's DRIVING the heel divergence: empty vs snug-perfect
    heel_empty_count = sum(1 for s in shoes
                          if s.get("fit", {}).get("heel") in ("empty", "loose"))
    heel_total = sum(1 for s in shoes if s.get("fit", {}).get("heel"))
    heel_driven_by_empty = (hv_diverges and target_hv < meas_hv
                            and heel_empty_count > 0
                            and heel_empty_count >= heel_total * 0.5)

    # Find notable-stiffness shoes, prefer ones with best fit
    ref = None
    for s in shoes:
        stiff = s.get("db_stiffness")
        if stiff is None: continue
        tier = _stiffness_tier(stiff)
        if tier == "moderate": continue
        fit = s.get("fit", {})
        perfects = sum(1 for d in ("heel", "toes", "forefoot") if fit.get(d) == "perfect")
        if ref is None or perfects > ref[3]:
            ref = (s, stiff, tier, perfects)
    if ref is None:
        return None

    shoe, stiff_val, stiff_tier, _ = ref
    brand, model = shoe["brand"], shoe["model"]
    feel = _stiffness_label(stiff_val)

    if stiff_tier == "soft":
        if fw_diverges and target_fw < meas_fw:
            return (
                f"Keep in mind that your {brand} {model} is a {feel} shoe. "
                "Soft shoes stretch and mold to the foot, making a snug forefoot "
                "more forgiving than the same width in a stiff shoe. "
                "For the stiffer recommendations below, we compensate by "
                "targeting one level wider."
            )
        if hv_diverges and target_hv < meas_hv:
            if heel_driven_by_empty:
                # Empty heel in soft shoe: stiffness HELPS -- don't widen
                return (
                    f"Keep in mind that your {brand} {model} is a {feel} shoe. "
                    "Soft heel cups lack the structure to grip a shallow or narrow "
                    "heel, which contributes to the empty feel. Stiffer shoes "
                    "maintain their heel shape and hold the foot more securely, "
                    "so we keep the narrow heel target across all stiffness tiers."
                )
            else:
                # Snug-perfect in soft shoe: tighter-than-scan target works
                # because soft material conforms. Stiffer shoes won't yield.
                return (
                    f"Keep in mind that your {brand} {model} is a {feel} shoe. "
                    "Soft uppers conform around the heel, so a narrower heel "
                    "cup than your scan suggests still fits comfortably. In "
                    "stiffer shoes the same tight heel does not yield and can "
                    "cause pressure points, so for stiffer recommendations we "
                    "target one level wider heel volume."
                )
    elif stiff_tier == "stiff":
        if fw_diverges and target_fw > meas_fw:
            return (
                f"Keep in mind that your {brand} {model} is a {feel} shoe. "
                "Stiff shoes hold their shape even when not skin-tight, so a "
                "roomier forefoot still transfers force. In softer shoes that "
                "same extra volume turns sloppy, so for softer recommendations "
                "we target one level narrower."
            )
        if hv_diverges and target_hv > meas_hv:
            return (
                f"Keep in mind that your {brand} {model} is a {feel} shoe. "
                "Stiff heel cups hold shape even when slightly wider than your heel. "
                "In softer shoes a roomy heel cup collapses and your heel slips, "
                "so for softer recommendations we target one level narrower heel volume."
            )

    return None


def _para_preference(profile, shoes):
    """User's next-shoe preference and notes, with context from current shoes."""
    pref = (profile.get("next_shoe_preference") or "").lower()
    notes_raw = profile.get("next_shoe_notes")
    notes = (notes_raw or "").lower()

    if not pref and not notes:
        return None

    # Pre-check notes for stiffness keywords (used in multiple places)
    wants_softer = any(w in notes for w in ("soft", "softer"))
    wants_stiffer = any(w in notes for w in ("stiff", "stiffer"))

    # Gather current shoe context for richer text
    feels = [s.get("db_feel", "") for s in shoes if s.get("db_feel")]
    stiffnesses = [s.get("db_stiffness") for s in shoes if s.get("db_stiffness") is not None]
    skill_levels = set()
    for s in shoes:
        for sl in (s.get("db_skill_level") or []):
            skill_levels.add(sl)

    avg_stiff = sum(stiffnesses) / len(stiffnesses) if stiffnesses else 0.5
    avg_feel = _stiffness_label(avg_stiff)

    parts = []

    # Detect primary fit issue for contextualizing preference
    heel_empty = sum(1 for s in shoes
                     if s.get("fit", {}).get("heel") in ("empty", "loose"))
    ff_tight = sum(1 for s in shoes
                   if s.get("fit", {}).get("forefoot") in ("tight", "squeezed")
                   or s.get("fit", {}).get("toes") == "squeezed")
    primary_issue = None
    if heel_empty > 0 and heel_empty >= len(shoes) * 0.5:
        primary_issue = "empty_heel"
    elif ff_tight > 0 and ff_tight >= len(shoes) * 0.5:
        primary_issue = "tight_forefoot"

    if pref == "performance":
        if "advanced" in skill_levels or "elite" in skill_levels:
            if primary_issue == "empty_heel":
                parts.append(
                    "You are looking for a performance shoe, and your current shoes "
                    "already sit in the advanced/elite range. Your main fit issue "
                    ", the empty heel, directly impacts performance: a heel that "
                    "lifts off loses precision on heel hooks and stability on steep "
                    "terrain. We prioritize heel retention alongside aggressive "
                    "geometry, because a shoe that stays put outperforms one that slips."
                )
            elif primary_issue == "tight_forefoot":
                parts.append(
                    "You are looking for a performance shoe, and your current shoes "
                    "already sit in the advanced/elite range. While aggressive shoes "
                    "tend to run tight, your forefoot is already under pressure. "
                    "We look for shoes that deliver performance geometry without "
                    "compounding the squeeze, prioritizing fit precision over "
                    "maximum aggression."
                )
            else:
                parts.append(
                    "You are looking for a performance shoe, and your current shoes "
                    "already sit in the advanced/elite range. We focus on shoes with "
                    "aggressive downturn, strong asymmetry, and precise fit, "
                    "prioritizing power transfer and sensitivity over all-day comfort."
                )
        else:
            parts.append(
                "You are looking to step up to a performance shoe. "
                "Compared to your current shoes, this means more downturn, stronger "
                "asymmetry, and a tighter fit. Expect a break-in period and less comfort "
                "on longer routes."
            )
    elif pref == "comfort":
        if "advanced" in skill_levels or "elite" in skill_levels:
            parts.append(
                "You are looking for something more comfortable next. Your current shoes "
                "are performance-oriented, so we include options with less downturn, "
                "more supportive midsoles, and a less aggressive fit that you can wear "
                "for longer sessions without pain."
            )
        else:
            # Check if there are specific geometry issues to contextualise
            has_toe_squeeze = any(
                s.get("fit", {}).get("toes") == "squeezed" for s in shoes)
            has_ff_loose = any(
                s.get("fit", {}).get("forefoot") in ("loose", "roomy")
                for s in shoes)
            if has_toe_squeeze and has_ff_loose:
                parts.append(
                    "You are prioritizing comfort, and for your foot the biggest "
                    "comfort gain comes from solving the toe squeeze without "
                    "creating a sloppy forefoot. Getting the geometry right "
                    "matters more than simply sizing up. We focus on flatter "
                    "profiles and moderate stiffness with a toe box shape that "
                    "matches your foot."
                )
            elif has_toe_squeeze:
                parts.append(
                    "You are prioritizing comfort. With your toes currently "
                    "squeezed, the biggest comfort gain comes from matching the "
                    "toe box shape to your foot. We focus on flatter profiles "
                    "and moderate stiffness that work for longer sessions."
                )
            else:
                parts.append(
                    "You are prioritizing comfort. We focus on flatter profiles, "
                    "moderate stiffness, and roomier fits that work well for longer "
                    "sessions and all-around climbing."
                )
    elif pref == "same":
        if len(shoes) == 1:
            s = shoes[0]
            fit = s.get("fit", {})
            imperfect_count = sum(1 for d in ("heel", "toes", "forefoot")
                                 if fit.get(d, "perfect") != "perfect")
            if wants_softer:
                parts.append(
                    f"You want a shoe similar to your {s['brand']} {s['model']} "
                    f"but softer. We match the geometry and fit profile while "
                    "leaning toward lower stiffness across all tiers."
                )
            elif wants_stiffer:
                parts.append(
                    f"You want a shoe similar to your {s['brand']} {s['model']} "
                    f"but stiffer. We match the geometry and fit profile while "
                    "leaning toward higher stiffness across all tiers."
                )
            elif imperfect_count >= 2:
                feel = s.get('db_feel', 'moderate')
                parts.append(
                    f"You want a shoe similar to your {s['brand']} {s['model']}. "
                    f"We look for shoes with a similar feel ({feel}) and comparable "
                    "stiffness, but with better-fitting geometry where your current "
                    "shoe falls short."
                )
            else:
                parts.append(
                    f"You want a shoe similar to your {s['brand']} {s['model']}. "
                    f"We look for shoes with a similar feel ({s.get('db_feel', 'moderate')}), "
                    "comparable stiffness, and matching geometry so the transition is seamless."
                )
        elif shoes:
            parts.append(
                "You want to stay in a similar category. We match the stiffness range "
                f"and feel of your current shoes (around {avg_feel}) and prioritize "
                "shoes that address any fit issues without changing the overall character."
            )
    elif pref == "softer":
        parts.append(
            "You mentioned wanting a softer shoe. We weight softer-feeling shoes higher "
            f"and look below your current range (around {avg_feel})."
        )
    elif pref == "stiffer":
        parts.append(
            "You mentioned wanting a stiffer shoe. We weight stiffer shoes higher "
            f"and look above your current range (around {avg_feel})."
        )
    elif pref == "more aggressive":
        parts.append(
            "You want more aggression. We prioritize shoes with steeper downturn, "
            "stronger asymmetry, and a snugger fit."
        )
    elif pref == "less aggressive":
        parts.append(
            "You want less aggression. We prioritize flatter shoes with less "
            "asymmetry and a more relaxed fit."
        )

    if notes_raw and notes not in ("null", "none", ""):
        notes_lower = notes.lower()
        # Skip soft/stiff notes if already folded into the pref text above
        # (e.g. pref=same + notes=softer -> already merged into one sentence)
        already_handled = (pref == "same" and (wants_softer or wants_stiffer))
        if not already_handled and any(w in notes_lower for w in ("soft", "softer")):
            parts.append(
                "You also mentioned wanting something softer, so we lean toward "
                "lower stiffness within each tier."
            )
        elif not already_handled and any(w in notes_lower for w in ("stiff", "stiffer")):
            parts.append(
                "You also mentioned wanting something stiffer, so we lean toward "
                "higher stiffness within each tier."
            )
        elif not already_handled and "heel" in notes_lower:
            parts.append(
                "You flagged the heel specifically, so we give extra weight "
                "to heel cup fit in our scoring."
            )
        elif not already_handled:
            parts.append(
                f"You also noted: \"{notes_raw}\". We take this into account "
                "across all tiers."
            )

    return " ".join(parts) if parts else None


def _para_forefoot_paradox(profile, shoes):
    """When toes are squeezed but the forefoot is loose, the problem is volume
    DISTRIBUTION not total volume.  A long arch compounds this by shifting
    where the ball sits.  Advise on shape, not just width."""
    combo_shoes = [s for s in shoes
                   if s.get("fit", {}).get("toes") == "squeezed"
                   and s.get("fit", {}).get("forefoot") in ("loose", "roomy")]
    if not combo_shoes:
        return None

    s = combo_shoes[0]
    arch_cls = (profile.get("arch_length_class") or "").lower()
    toe_forms = [t.lower() for t in (s.get("db_toe_form") or [])]
    user_toe = (profile.get("toe_shape") or "").lower()
    _labels = {"greek": "Greek", "egyptian": "Egyptian", "roman": "Roman"}

    parts = []

    if "long" in arch_cls:
        parts.append(
            "Despite your wide scan measurement, the forefoot feels loose "
            f"in your {s['brand']} {s['model']}. Your long arch shifts the "
            "ball of your foot backward, so the widest part of your foot "
            "sits behind where the shoe expects it. This means a wider shoe "
            "is not the solution. You need one where the forefoot volume "
            "sits further back, matching your proportions."
        )
    elif toe_forms and user_toe and user_toe not in toe_forms:
        shoe_label = _labels.get(toe_forms[0], toe_forms[0])
        user_label = _labels.get(user_toe, user_toe)
        parts.append(
            f"The loose forefoot combined with squeezed toes suggests "
            f"the {shoe_label} toe form puts volume where your {user_label} "
            "foot does not need it. A shoe that matches your toe shape "
            "would concentrate room at the right place rather than "
            "spreading it where it goes unused."
        )
    else:
        parts.append(
            "The loose forefoot combined with squeezed toes means the shoe's "
            "volume is in the wrong place for your foot shape. Rather than "
            "going wider overall, look for shoes with a more compact, "
            "tapered forefoot zone that concentrates room at the toes."
        )

    return " ".join(parts) if parts else None


_TOE_SHAPE_LABELS = {"greek": "Greek", "egyptian": "Egyptian", "roman": "Roman"}


def _para_toe_form_guidance(profile, shoes):
    """Toe form guidance for recommendations.

    Two cases:
    1. MASKED mismatch: toe shape doesn't match but toes feel fine in a soft
       shoe. Warn that stiffer shoes need a matching toe form.
    2. EXPOSED mismatch: toe shape doesn't match AND toes are squeezed.
       Confirm the mismatch causes the squeeze, filter for compatible forms.
    """
    toe_shape = (profile.get("toe_shape") or "").lower()
    if not toe_shape or toe_shape not in ("greek", "egyptian", "roman"):
        return None

    user_label = _TOE_SHAPE_LABELS.get(toe_shape, toe_shape)

    mismatched_soft = []   # masked: toes fine despite mismatch in soft shoe
    mismatched_squeezed = []  # exposed: toes squeezed in mismatched shoe
    matched_ok = []  # shoes where toe form matches and toes are fine

    for s in shoes:
        toe_forms = [t.lower() for t in (s.get("db_toe_form") or [])]
        if not toe_forms:
            continue
        stiff = s.get("db_stiffness") or 0.5
        fit = s.get("fit", {})
        toes_fit = fit.get("toes", "")

        if toe_shape in toe_forms:
            if toes_fit in ("perfect", "good", ""):
                matched_ok.append(s)
        else:
            # Mismatch
            if toes_fit in ("perfect", "good", "") and stiff < 0.40:
                mismatched_soft.append((s, toe_forms))
            elif toes_fit == "squeezed":
                mismatched_squeezed.append((s, toe_forms))

    # Case 2 first (stronger signal): exposed mismatch
    if mismatched_squeezed:
        s, shoe_forms = mismatched_squeezed[0]
        shoe_label = _TOE_SHAPE_LABELS.get(shoe_forms[0], shoe_forms[0])
        stiff = s.get("db_stiffness") or 0.5
        stiff_note = ""
        if stiff >= 0.40:
            stiff_note = (
                " Softer shoes are more forgiving of this mismatch because "
                "the upper can flex around your toes, so among the "
                "recommendations, the softer options may feel more "
                "comfortable in the toe box."
            )
        # Even stronger if matched shoes fit fine
        if matched_ok:
            m = matched_ok[0]
            return (
                f"Your {s['brand']} {s['model']} has a {shoe_label} toe form "
                f"that squeezes your {user_label} toes, while your {user_label}-"
                f"compatible {m['brand']} {m['model']} fits fine. For all "
                f"recommendations, we filter for {user_label}-compatible toe "
                f"boxes.{stiff_note}"
            )
        return (
            f"Your {user_label} toes get squeezed in the {shoe_label}-lasted "
            f"{s['brand']} {s['model']}. For all recommendations, we filter for "
            f"{user_label}-compatible toe boxes to avoid this mismatch."
            f"{stiff_note}"
        )

    # Case 1: masked mismatch in soft shoe
    if mismatched_soft:
        s, shoe_forms = mismatched_soft[0]
        shoe_label = _TOE_SHAPE_LABELS.get(shoe_forms[0], shoe_forms[0])

        if toe_shape == "greek":
            return (
                f"Your {user_label} toes work in your soft {shoe_label}-lasted "
                f"{s['brand']} {s['model']}, but the toe form match becomes critical "
                f"in stiffer shoes where the upper cannot conform. For the stiffer "
                f"recommendations, we prioritize shoes with a {user_label}-compatible "
                f"toe box that gives your second toe room at the tip."
            )
        elif toe_shape == "egyptian" and shoe_forms[0] in ("greek", "roman"):
            return (
                f"Your {user_label} toes work in your soft {shoe_label}-lasted "
                f"{s['brand']} {s['model']}, but stiffer shoes with the same last "
                f"may leave dead space at the second toe. For stiffer recommendations, "
                f"we prefer shoes with an {user_label}-compatible, more asymmetric toe box."
            )

    return None


def _para_closure_hva(profile, shoes):
    """Closure guidance (instep-driven) + HVA toe box guidance.
    Only generated when there is something scan-specific to say.
    Generic toe shape advice is NOT repeated here -- Section 1 covers that."""
    hva = profile.get("hallux_valgus_class")
    instep_cls = profile.get("instep_height_class", "normal")
    toe_shape = profile.get("toe_shape", "egyptian")

    parts = []

    # HVA guidance -- keep brief, Section 1 already explains in detail.
    # Only state the practical recommendation filter.
    if hva and hva != "normal":
        if toe_shape == "egyptian":
            parts.append(
                f"For your {hva} hallux valgus, we avoid very asymmetric lasts "
                "and prefer moderately asymmetric or wider-tipped designs that "
                "help the big toe stay in contact with the shoe tip."
            )
        elif toe_shape == "greek":
            parts.append(
                f"For your {hva} hallux valgus, we prefer a slightly wider, "
                "less pointed toe box to compensate for the inward drift."
            )

    # Instep / closure (only when non-normal)
    instep_high = instep_cls in ("high instep", "high")
    instep_low = instep_cls in ("low instep", "low")

    if instep_high:
        parts.append(
            "With your high instep, lace-up closures are ideal because they open up "
            "over the midfoot without affecting heel or forefoot fit. "
            "Slippers and single-strap velcros tend to press on high insteps."
        )
    elif instep_low:
        parts.append(
            "With your low instep, slippers and velcro closures work well. "
            "Lace-ups also work if you cinch them down across the instep to avoid gapping."
        )

    return " ".join(parts) if parts else None


def _para_tradeoffs(profile, shoes):
    """Competing constraints -- only add genuinely NEW tradeoff information
    that is not already covered by the target profile, stiffness, preference,
    or closure/HVA paragraphs above.  Skip width/heel tension (covered in P1)
    and HVA toe box tension (covered in closure_hva paragraph)."""
    fw_cls = profile.get("forefoot_width_class", "normal")
    hw_cls = profile.get("heel_width_class", "normal")
    hva = profile.get("hallux_valgus_class")
    instep_cls = profile.get("instep_height_class", "normal")

    hw_narrow = hw_cls in ("narrow heel", "narrow")
    hw_wide = hw_cls in ("wide heel", "wide")
    instep_high = instep_cls in ("high instep", "high")

    tradeoffs = []

    # Width tension: only add if there's a PRIORITIZATION decision to state
    # that the target paragraph did not already make explicit
    if fw_cls == "wide" and hw_narrow:
        # Check if target already diverged (feedback adjusted one of them)
        fb_fw, fb_hv, _ = _feedback_targets(shoes)
        raw_fw = _avg_round(fb_fw) if fb_fw else _meas_width_target(profile)
        raw_hv = _avg_round(fb_hv) if fb_hv else _meas_heel_target(profile)
        target_fw, _ = _clamp_to_scan(raw_fw, _meas_width_target(profile))
        target_hv, _ = _clamp_to_scan(raw_hv, _meas_heel_target(profile))
        # Only mention if target paragraph did NOT already explain the tension
        if not fb_fw and not fb_hv:
            tradeoffs.append(
                "When the forefoot and heel need opposite things, we prioritize "
                "forefoot fit. A loose heel is manageable with technique, "
                "but a squeezed forefoot causes pain."
            )
    elif fw_cls == "narrow" and hw_wide:
        fb_fw, fb_hv, _ = _feedback_targets(shoes)
        if not fb_fw and not fb_hv:
            tradeoffs.append(
                "When the forefoot and heel need opposite things, we prioritize "
                "heel comfort. A narrow forefoot can tolerate slight extra room, "
                "but a squeezed heel digs in with every step."
            )

    # HVA: skip restating the tension -- closure_hva already covers it

    if instep_high:
        closures = [s.get("db_closure", "") for s in shoes if s.get("db_closure")]
        if "slipper" in closures:
            tradeoffs.append(
                "You wear a slipper despite a high instep. We include both lace-up "
                "alternatives and slipper options since you are accustomed to the style."
            )

    if len(shoes) >= 2:
        heel_fits = [s.get("fit", {}).get("heel", "perfect") for s in shoes]
        if "empty" in heel_fits and "tight" in heel_fits:
            tradeoffs.append(
                "Your heel feedback is contradictory (empty in some shoes, tight in others). "
                "This reflects different heel cup shapes rather than a universal issue. "
                "We aim for the middle ground, prioritizing shoes closest to where "
                "the heel fits best."
            )

    if not tradeoffs:
        return None
    return " ".join(tradeoffs[:2])


# ── Fit context fallback ──────────────────────────────────────────────

def _para_fit_context(profile, shoes):
    """Supplementary fit insight -- fires when other paragraphs are thin.
    Provides a second angle on the shoe data."""
    if not shoes:
        return None
    n = len(shoes)
    fits = [(s, s.get("fit", {})) for s in shoes]

    # Single shoe that fits well: Section 2 already establishes the anchor
    # role, and the target paragraph states what we target.  Repeating
    # "strong sizing reference" is redundant.  Skip for single-shoe cases.
    if n == 1:
        return None

    # Multi-shoe: look for consistent patterns
    empty_heels = [s for s, f in fits if f.get("heel") in ("empty", "loose")]
    tight_ff = [s for s, f in fits
                if f.get("forefoot") in ("tight", "squeezed")
                or f.get("toes") == "squeezed"]

    # Only call out consistent patterns when the target actually diverged
    meas_fw = _meas_width_target(profile)
    meas_hv = _meas_heel_target(profile)
    fb_fw, fb_hv, _ = _feedback_targets(shoes)
    raw_fw = _avg_round(fb_fw) if fb_fw else meas_fw
    raw_hv = _avg_round(fb_hv) if fb_hv else meas_hv
    target_fw, _ = _clamp_to_scan(raw_fw, meas_fw)
    target_hv, _ = _clamp_to_scan(raw_hv, meas_hv)

    # Consistent empty heel across multiple shoes/brands
    if len(empty_heels) >= 2 and target_hv < meas_hv:
        brands = len(set(s["brand"] for s in empty_heels))
        if brands >= 2:
            return (
                f"The empty heel persists across {brands} different brands, "
                f"confirming this is an anatomical fit need. "
                f"A snug, sculpted heel cup is essential regardless of brand."
            )
        return (
            f"The consistent empty heel across {_count_word(len(empty_heels), n)} shoes "
            f"is a strong signal. We prioritize shoes with narrow, sculpted heel cups."
        )

    # Consistent tight forefoot across multiple shoes/brands
    if len(tight_ff) >= 2 and target_fw > meas_fw:
        brands = len(set(s["brand"] for s in tight_ff))
        if brands >= 2:
            return (
                f"The tight forefoot spans {brands} different brands, "
                f"confirming you need more forefoot room than most shoes "
                f"in your current size provide."
            )
        return (
            f"The consistent forefoot tightness across "
            f"{_count_word(len(tight_ff), n)} shoes "
            f"confirms you need more room up front."
        )

    # One shoe clearly fits better than the rest
    scores = []
    for s, f in fits:
        sc = sum(1 for k in ("forefoot", "heel", "toes")
                 if f.get(k) in ("perfect", "good"))
        scores.append((sc, s))
    scores.sort(key=lambda x: -x[0])
    if scores[0][0] >= 2 and scores[0][0] > scores[-1][0]:
        best = scores[0][1]
        return (
            f"Among your shoes, the {best['brand']} {best['model']} provides "
            f"the best overall fit. We weight its geometry most heavily "
            f"in the recommendations."
        )

    # Multiple shoes, all fit reasonably well
    good_shoes = sum(1 for sc, _ in scores if sc >= 2)
    if good_shoes >= 2:
        return (
            "Your shoes fit well overall, so the recommendations refine around "
            "this proven baseline rather than correcting a major fit problem."
        )

    return None


# ── Shallow heel depth guidance ─────────────────────────────────────────

def _para_shallow_heel_guidance(profile, shoes):
    """When the scan shows a shallow heel, explain heel cup geometry.

    Two scenarios:
    1. Heels are empty: geometry matters more than volume label.
    2. Heels are perfect despite shallow scan: anchor recommendations to this
       shoe's proven geometry (the reverse insight).
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

    n = len(shoes)
    n_empty = len(empty_shoes)

    # ── Scenario 2: perfect heel despite shallow scan (reverse insight) ──
    if not empty_shoes and perfect_heel_shoes:
        heel_width_cls = (profile.get("heel_width_class") or "").lower()
        if "narrow" not in heel_width_cls:
            return None  # only fire for notably challenging heel profiles
        s = perfect_heel_shoes[0]
        hv = s.get("db_heel_volume", "medium")
        return (
            f"Your {s['brand']} {s['model']} ({hv} heel volume) fits your "
            f"shallow heel perfectly. We prioritize shoes with similarly "
            f"{hv} heel volume."
        )

    # ── Scenario 1: heels are empty ──
    if not empty_shoes:
        return None

    if n > 1 and n_empty < n * 0.5:
        return None

    parts = []

    # If an exception shoe exists, anchor the guidance to it
    if perfect_heel_shoes:
        s = perfect_heel_shoes[0]
        hv = s.get("db_heel_volume", "medium")
        parts.append(
            f"The heel feels empty in most of your shoes, yet your "
            f"{s['brand']} {s['model']} ({hv} heel volume) fits perfectly. "
            f"We prioritize shoes with similarly {hv} heel volume."
        )
    else:
        parts.append(
            "Your shallow heel profile means most heel cups feel empty "
            "because they are too deeply sculpted for your heel shape. "
            "We target narrow heel volume to minimize the gap."
        )

    return " ".join(parts) if parts else None


# ── Main generator ──────────────────────────────────────────────────────

def generate_what_to_look_for(profile, shoes=None):
    if shoes is None:
        shoes = profile.get("shoes", [])

    paragraphs = []

    # P1: Target profile synthesis (always)
    p1 = _para_target_profile(profile, shoes)
    if p1:
        paragraphs.append(p1)

    # P1b: Shallow heel depth guidance (conditional -- heel geometry insight)
    p_hd = _para_shallow_heel_guidance(profile, shoes)
    if p_hd:
        paragraphs.append(p_hd)

    # P1c: Forefoot paradox (toes squeezed + forefoot loose = wrong shape)
    p_fp = _para_forefoot_paradox(profile, shoes)
    if p_fp:
        paragraphs.append(p_fp)

    # P2: Stiffness cross-tier adjustment (conditional)
    p2 = _para_stiffness_adjustment(profile, shoes)
    if p2:
        paragraphs.append(p2)

    # P3: User preference (conditional -- performance/comfort/same/notes)
    p3 = _para_preference(profile, shoes)
    if p3:
        paragraphs.append(p3)

    # P3b: Toe form guidance for stiffer recs (conditional)
    p_tf = _para_toe_form_guidance(profile, shoes)
    if p_tf:
        paragraphs.append(p_tf)

    # P4: Closure + HVA guidance (conditional -- only when instep or HVA)
    p4 = _para_closure_hva(profile, shoes)
    if p4:
        paragraphs.append(p4)

    # P5: Tradeoffs (conditional -- competing constraints)
    p5 = _para_tradeoffs(profile, shoes)
    if p5:
        paragraphs.append(p5)

    # Fallback: if we only have 1 paragraph and have shoes, add fit context
    if len(paragraphs) <= 1 and shoes:
        ctx = _para_fit_context(profile, shoes)
        if ctx:
            paragraphs.append(ctx)

    return paragraphs


# ── CLI ─────────────────────────────────────────────────────────────────

def main():
    cases_path = Path(__file__).parent / "gold_standard_cases.json"
    with open(cases_path) as f:
        cases = json.load(f)

    print(f"Generating 'What to Look For' for {len(cases)} gold standard cases\n")

    for i, case in enumerate(cases):
        p = case["profile"]
        shoes = case.get("user_shoes", p.get("shoes", []))
        paras = generate_what_to_look_for(p, shoes)

        print(f"{'='*80}")
        print(f"CASE {i+1}: {case.get('description', case['scan_id'])}")
        fw = p.get("forefoot_width_class", "normal")
        hw = p.get("heel_width_class", "normal")
        pref = p.get("next_shoe_preference", "")
        notes = p.get("next_shoe_notes", "")
        print(f"  scan: fw={fw}, hw={hw}, toe={p.get('toe_shape')}, "
              f"instep={p.get('instep_height_class')}, hva={p.get('hallux_valgus_class')}")
        print(f"  pref={pref!r}, notes={notes!r}")
        for s in shoes:
            fit = s.get("fit", {})
            db_w = s.get("db_width", "?")
            db_hv = s.get("db_heel_volume", "?")
            stiff = s.get("db_stiffness")
            stiff_str = f"{stiff:.2f}" if stiff is not None else "?"
            print(f"  shoe: {s['brand']} {s['model']} w={db_w} hv={db_hv} "
                  f"stiff={stiff_str} feel={s.get('db_feel', '?')} "
                  f"fit={fit}")
        print(f"{'~'*80}")
        for j, para in enumerate(paras):
            print(f"  [P{j+1}] {para}")
        print()


if __name__ == "__main__":
    main()
