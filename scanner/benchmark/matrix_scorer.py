#!/usr/bin/env python3
"""
Matrix-based shoe scorer implementing the correlation matrix rules.
This is the EVALUATOR (truth-checker), separate from scan_recommender's score_shoe().

Scores each candidate shoe against a user profile using the 69 rules
from scan_vs_shoe_matrix.xlsx. Returns a per-shoe fit score.

Usage:
    python benchmark/matrix_scorer.py
    -> Loads 20 gold standard cases, scores all shoes, shows top 3 baseline per case.
"""
import json, os, sys, time, requests

# --- Supabase config ---
SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SB_KEY = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
if not SB_KEY:
    raise RuntimeError("SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_KEY) must be set")
HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}


def load_shoes():
    resp = requests.get(f"{SB_URL}/rest/v1/shoes", headers=HEADERS,
        params={"select": "slug,brand,model,width,heel_volume,toe_form,forefoot_volume,"
                "closure,downturn,asymmetry,feel,kids_friendly,gender,"
                "skill_level,use_cases,description,no_edge,"
                "computed_stiffness,midsole,midsole_stiffness,rand,rubber_type,rubber_thickness_mm,upper_material,special_fit_notes",
                "limit": 600})
    resp.raise_for_status()
    return resp.json()


def load_brand_sizing():
    resp = requests.get(f"{SB_URL}/rest/v1/brand_sizing", headers=HEADERS,
        params={"select": "brand,typical_downsize_mid"})
    resp.raise_for_status()
    return {r["brand"]: r["typical_downsize_mid"] for r in resp.json()}


def load_best_prices():
    """Load best (lowest) in-stock price per shoe slug."""
    all_rows = []
    offset = 0
    while True:
        resp = requests.get(f"{SB_URL}/rest/v1/shoe_prices", headers=HEADERS,
            params={"select": "product_slug,price_eur",
                    "in_stock": "eq.true", "price_eur": "not.is.null",
                    "limit": 1000, "offset": offset})
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        all_rows.extend(batch)
        offset += 1000

    best = {}
    for row in all_rows:
        slug = row.get("product_slug")
        price = row.get("price_eur")
        if slug and price is not None:
            price = float(price)
            if slug not in best or price < best[slug]:
                best[slug] = price
    return best


def load_size_availability():
    # Paginate through all in-stock rows (Supabase default limit is 1000)
    all_rows = []
    offset = 0
    while True:
        resp = requests.get(f"{SB_URL}/rest/v1/shoe_prices", headers=HEADERS,
            params={"select": "product_slug,sizes_available", "in_stock": "eq.true",
                    "limit": 1000, "offset": offset})
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        all_rows.extend(batch)
        offset += 1000

    avail = {}
    for row in all_rows:
        slug = row.get("product_slug")
        sizes_raw = row.get("sizes_available") or []
        if isinstance(sizes_raw, str):
            try: sizes_raw = json.loads(sizes_raw)
            except: sizes_raw = []
        if slug and sizes_raw:
            if slug not in avail:
                avail[slug] = set()
            for s in sizes_raw:
                try: avail[slug].add(float(s))
                except: pass
    return avail


# --- Helpers ---

_TIER_ORDER = ["hobby", "intermediate", "advanced", "elite"]
_DOWNTURN_ORDER = ["flat", "slight", "moderate", "aggressive"]
_FEEL_ORDER = ["soft", "moderate-soft", "moderate", "stiff-moderate", "stiff"]

def _heel_vol_rank(v):
    v = (v or "").lower().strip()
    if v in ("low", "narrow"): return 0
    if v in ("standard", "medium"): return 1
    if v in ("high", "wide"): return 2
    return 1

def _width_rank(w):
    w = (w or "").lower().strip()
    if w == "narrow": return 0
    if w == "medium": return 1
    if w == "wide": return 2
    return 1

def _fv_rank(fv):
    fv = (fv or "").lower().strip()
    if fv in ("low",): return 0
    if fv in ("standard", "medium", ""): return 1
    if fv in ("high",): return 2
    return 1

def _dt_rank(dt):
    dt = (dt or "").lower().strip()
    try: return _DOWNTURN_ORDER.index(dt)
    except ValueError: return 1

def _feel_rank(f):
    f = (f or "").lower().strip()
    try: return _FEEL_ORDER.index(f)
    except ValueError: return 2  # default moderate

def _asym_rank(a):
    a = (a or "").lower().strip()
    if a in ("none",): return 0
    if a in ("slight",): return 1
    if a in ("moderate",): return 2
    if a in ("strong",): return 3
    return 1

def _tier_rank(levels):
    if not levels: return 1
    ranks = []
    for l in levels:
        try: ranks.append(_TIER_ORDER.index(l))
        except ValueError: pass
    return max(ranks) if ranks else 1


def _lookup_user_shoes(profile, shoes_db):
    """Look up user's current shoes in DB. Returns list of (user_shoe_entry, db_shoe)."""
    shoe_by_key = {}
    for s in shoes_db:
        key = f"{s['brand']} {s['model']}".lower()
        shoe_by_key[key] = s

    results = []
    for us in profile.get("shoes") or []:
        brand = us.get("brand", "")
        model = us.get("model", "")
        key = f"{brand} {model}".lower()
        db_shoe = shoe_by_key.get(key)
        if not db_shoe:
            for db_key, s in shoe_by_key.items():
                if key in db_key or db_key in key:
                    db_shoe = s
                    break
        results.append((us, db_shoe))
    return results


# --- Matrix Scoring ---

def matrix_score(shoe, profile, shoes_db):
    """Score a shoe against a profile using the matrix rules.

    KEY PRINCIPLE: Fit feedback from current shoes is the STRONGEST signal.
    When a user says a shoe fits "perfect", the properties of that shoe become
    the target. Measurements are secondary -- they set the baseline only when
    no fit feedback exists.

    Returns (total_score, breakdown_dict) for analysis.
    """
    score = 0
    breakdown = {}

    # Candidate shoe properties
    c_width = _width_rank(shoe.get("width"))
    c_heel = _heel_vol_rank(shoe.get("heel_volume"))
    c_fv = _fv_rank(shoe.get("forefoot_volume"))
    c_dt = _dt_rank(shoe.get("downturn"))
    c_stiff = shoe.get("computed_stiffness") or 0.5
    c_skills = shoe.get("skill_level") or []
    c_no_edge = shoe.get("no_edge") or False
    c_kids = shoe.get("kids_friendly") or False
    c_closure = (shoe.get("closure") or "").lower()
    c_feel = _feel_rank(shoe.get("feel"))

    # Candidate toe_form -- keep full list for multi-form shoes
    tf_raw = shoe.get("toe_form") or ""
    if isinstance(tf_raw, list):
        c_toe_forms = [t.lower() for t in tf_raw] if tf_raw else []
    else:
        c_toe_forms = [str(tf_raw).lower()] if tf_raw else []
    c_toe_form = c_toe_forms[0] if c_toe_forms else ""

    # Candidate asymmetry
    c_asym = _asym_rank(shoe.get("asymmetry"))

    # User profile data
    # Tertile-calibrated defaults (2026-04-14). Medians from scanner/foot_measure.py POP.
    fw_ratio = profile.get("forefoot_width_ratio") or 0.355
    hw_ratio = profile.get("heel_width_ratio") or 0.238
    arch_ratio = profile.get("arch_length_ratio") or 0.725
    instep_ratio = profile.get("instep_height_ratio") or 0.264
    heel_depth = profile.get("heel_depth_ratio") or 0.034
    toe_shape = (profile.get("toe_shape") or "").lower()
    toe_conf = profile.get("toe_confidence")
    hva_ratio = profile.get("hva_offset_ratio")
    sex = profile.get("sex", "")
    street_size = profile.get("street_size_eu") or 42
    pref = (profile.get("next_shoe_preference") or "").lower()
    notes = (profile.get("next_shoe_notes") or "").lower()

    # Null preference defaults to "same" when we have current shoe data
    effective_pref = pref if pref else "same"

    # Look up user's current shoes in DB
    user_shoes = _lookup_user_shoes(profile, shoes_db)
    owned_keys = set()
    user_stiffnesses = []
    user_skill_ranks = []
    user_downturns = []
    user_feels = []
    user_closures = []
    user_asymmetries = []

    for us, db in user_shoes:
        key = f"{us.get('brand','')} {us.get('model','')}".lower()
        owned_keys.add(key)
        if db:
            user_stiffnesses.append(db.get("computed_stiffness") or 0.5)
            for sl in (db.get("skill_level") or []):
                if sl in _TIER_ORDER:
                    user_skill_ranks.append(_TIER_ORDER.index(sl))
            if db.get("downturn"):
                user_downturns.append(db["downturn"])
            if db.get("feel"):
                user_feels.append(db["feel"])
            if db.get("closure"):
                user_closures.append(db["closure"].lower())
            if db.get("asymmetry"):
                user_asymmetries.append(db["asymmetry"])

    # ---------------------------------------------------------------
    # COMPUTE TARGETS: fit feedback overrides measurement baselines
    # ---------------------------------------------------------------
    # Collect fit-feedback-derived targets from current shoes
    fb_fw_targets = []  # width targets from fit feedback
    fb_hv_targets = []  # heel vol targets from fit feedback
    fb_fv_targets = []  # forefoot vol targets from fit feedback

    for us, db in user_shoes:
        fit = us.get("fit") or {}
        if not db:
            continue
        cur_w = _width_rank(db.get("width"))
        cur_hv = _heel_vol_rank(db.get("heel_volume"))
        cur_fv = _fv_rank(db.get("forefoot_volume"))

        # Width target from forefoot + toes feedback
        ff = fit.get("forefoot", "")
        toes = fit.get("toes", "")
        if ff == "perfect" and toes in ("perfect", "good", ""):
            fb_fw_targets.append(cur_w)  # perfect -> keep same width
        elif ff == "perfect" and toes == "squeezed":
            # Forefoot fits but toes squeeze: this is a length / toe-form
            # problem (long arch + mismatched toe box), NOT a width problem.
            # Going wider introduces slop across a well-fitting forefoot.
            fb_fw_targets.append(cur_w)
        elif ff in ("tight", "squeezed") or toes == "squeezed":
            fb_fw_targets.append(min(2, cur_w + 1))  # go wider
        elif ff in ("loose", "roomy") or toes == "roomy":
            fb_fw_targets.append(max(0, cur_w - 1))  # go narrower

        # Heel volume target from heel feedback
        heel_fit = fit.get("heel", "")
        if heel_fit == "perfect":
            fb_hv_targets.append(cur_hv)  # keep same
        elif heel_fit in ("empty", "loose"):
            fb_hv_targets.append(max(0, cur_hv - 1))  # go narrower
        elif heel_fit in ("tight", "squeezed"):
            fb_hv_targets.append(min(2, cur_hv + 1))  # go wider

        # Forefoot volume target from forefoot feedback
        if ff == "perfect":
            fb_fv_targets.append(cur_fv)
        elif ff == "tight":
            fb_fv_targets.append(min(2, cur_fv + 1))
        elif ff == "loose":
            fb_fv_targets.append(max(0, cur_fv - 1))

    # Measurement-based targets (fallback). Tertile-calibrated boundaries
    # from scanner/foot_measure.py POP (lo/hi = 33rd/67th percentile).
    # forefoot: lo 0.344, hi 0.367 -> narrow < 0.344, wide > 0.367
    # heel:     lo 0.228, hi 0.245 -> narrow < 0.228, wide > 0.245
    if fw_ratio < 0.344:
        meas_fw = 0
    elif fw_ratio <= 0.367:
        meas_fw = 1
    else:
        meas_fw = 2

    if hw_ratio < 0.228:
        meas_hv = 0
    elif hw_ratio <= 0.245:
        meas_hv = 1
    else:
        meas_hv = 2

    meas_fv = meas_fw  # forefoot volume follows width measurement

    # Final targets: fit feedback wins, measurement is fallback
    if fb_fw_targets:
        target_fw = round(sum(fb_fw_targets) / len(fb_fw_targets))
    else:
        target_fw = meas_fw

    if fb_hv_targets:
        target_hv = round(sum(fb_hv_targets) / len(fb_hv_targets))
    else:
        target_hv = meas_hv

    # Shallow-heel override: a very shallow heel (heel_depth_ratio below the
    # -1 std boundary, i.e. clearly in the "shallow" class) needs an
    # unsculpted narrow cup regardless of what the one-step feedback shift
    # suggests. Without this, a user whose current shoe is wide-heel gets
    # target_hv=medium on empty-heel feedback, which still under-targets
    # the shallow-heel anatomy. Force narrow.
    # Tertile-calibrated: shallow boundary = 33rd percentile = 0.028.
    if heel_depth < 0.028:
        target_hv = 0

    if fb_fv_targets:
        target_fv = round(sum(fb_fv_targets) / len(fb_fv_targets))
    else:
        target_fv = meas_fv

    # Plumb final targets into breakdown so the text generator can compare
    # P3 tradeoffs against the adjusted target instead of the raw scan class.
    # Underscore prefix marks these as metadata, not scored rules.
    breakdown["_target_fw"] = target_fw
    breakdown["_target_hv"] = target_hv
    breakdown["_target_fv"] = target_fv

    # ====================================================================
    # PENALTY: Missing critical shoe data
    # ====================================================================
    missing_count = sum(1 for field in ("width", "heel_volume", "toe_form", "downturn")
                        if not shoe.get(field))
    if missing_count:
        s = -3 * missing_count
        breakdown["missing_data"] = s
        score += s

    # ====================================================================
    # SECTION 1: FOREFOOT WIDTH (rules 1-1, 1-3, 1-15, 1-16)
    # ====================================================================

    # 1-1: width vs target (from fit feedback or measurement)
    fw_dist = abs(c_width - target_fw)
    if fw_dist == 0:
        s = 6
    elif fw_dist == 1:
        s = 2
    else:
        s = -6
    # Bonus: when target comes from "perfect" fit feedback, exact match is stronger
    if fb_fw_targets and fw_dist == 0:
        s = 10
    breakdown["1-1_fw_baseline"] = s
    score += s

    # 1-3: arch length modifier (long arch boundary: tertile hi = 0.734)
    if arch_ratio > 0.734 and c_width <= target_fw:
        s = -3
        breakdown["1-3_long_arch"] = s
        score += s

    # 1-15: additional toe feedback penalty/bonus (on top of target shift)
    for us, db in user_shoes:
        fit = us.get("fit") or {}
        toes = fit.get("toes", "")
        if not db:
            continue
        current_fw_rank = _width_rank(db.get("width"))

        if toes == "squeezed":
            if current_fw_rank >= 2:
                s = 0  # already widest
            elif arch_ratio > 0.734:
                if c_width > current_fw_rank:
                    s = 2
                elif c_width == current_fw_rank:
                    s = -1
                else:
                    s = -2
            elif c_width > current_fw_rank:
                s = 3
            else:
                s = -4
            breakdown["1-15_toes_squeezed"] = s
            score += s
        elif toes == "roomy":
            if current_fw_rank <= 0:
                s = 0
            elif c_width < current_fw_rank:
                s = 2
            else:
                s = -2
            breakdown["1-15_toes_roomy"] = s
            score += s

    # 1-16: forefoot feedback penalty/bonus
    for us, db in user_shoes:
        fit = us.get("fit") or {}
        ff = fit.get("forefoot", "")
        if not db:
            continue
        current_fw_rank = _width_rank(db.get("width"))

        if ff == "tight":
            if current_fw_rank >= 2:
                s = 0
            elif c_width > current_fw_rank:
                s = 3
            else:
                s = -4
            breakdown["1-16_ff_tight"] = s
            score += s
        elif ff == "loose":
            if current_fw_rank <= 0:
                s = 0
            elif c_width < current_fw_rank:
                s = 2
            else:
                s = -2
            breakdown["1-16_ff_loose"] = s
            score += s

    # 1-8: hallux valgus widens the foot at the MTP joint (bunion).
    # Reward shoes that sit one level WIDER than the measurement-based
    # target to accommodate the bump without constraining the big toe.
    # This does NOT shift the target (Part 1 output stays clean); it
    # adds a secondary bonus on top of baseline width scoring.
    if hva_ratio and hva_ratio > 0.35:
        if c_width >= target_fw + 1:
            s = 2
            breakdown["1-8_hva_wider_ff"] = s
            score += s
    elif hva_ratio and hva_ratio >= 0.25:
        if c_width >= target_fw + 1:
            s = 1
            breakdown["1-8_hva_wider_ff"] = s
            score += s

    # ====================================================================
    # SECTION 2: HEEL VOLUME (rules 2-2, 2-5, 2-17, 2-18)
    # ====================================================================

    # 2-2: heel volume vs target (from fit feedback or measurement)
    hv_dist = abs(c_heel - target_hv)
    if hv_dist == 0:
        s = 6
    elif hv_dist == 1:
        s = 2
    else:
        s = -6
    if fb_hv_targets and hv_dist == 0:
        s = 10  # bonus for feedback-derived exact match
    breakdown["2-2_hv_baseline"] = s
    score += s

    # 2-5: heel depth modifier. Tertile-calibrated boundaries
    # (median 0.034): shallow < 0.028, deep > 0.041.
    if heel_depth < 0.028:
        if c_heel == 0:
            s = 3
        elif c_heel == 1:
            s = 0
        else:
            s = -4
        breakdown["2-5_shallow_heel"] = s
        score += s
    elif heel_depth > 0.041:
        if c_heel >= 2:
            s = 3
        elif c_heel == 1:
            s = 0
        else:
            s = -4
        breakdown["2-5_deep_heel"] = s
        score += s

    # 2-17: heel fit feedback (direct scoring, stacks with target-based 2-2)
    for us, db in user_shoes:
        fit = us.get("fit") or {}
        heel_fit = fit.get("heel", "")
        if not db or not heel_fit:
            continue
        current_hv_rank = _heel_vol_rank(db.get("heel_volume"))

        if heel_fit == "empty":
            # Strictly narrower heels earn the "tighter heel" credit.
            # Same-rank heels are neutral - not a fix for the empty-heel
            # complaint. The text generator keys on score >= 3 to emit the
            # "tighter heel" P2 phrase, so a same-rank candidate must score
            # below 3 to avoid false "tighter heel" claims.
            if c_heel < current_hv_rank:
                s = 4  # strictly narrower - good
            elif c_heel == current_hv_rank:
                s = 0  # same rank - neutral, not a fix
            else:
                s = -100  # wider - HARD VIOLATION
            breakdown["2-17_heel_empty"] = s
            score += s
        elif heel_fit in ("tight", "squeezed"):
            if c_heel > current_hv_rank:
                s = 4
            else:
                s = -3
            breakdown["2-17_heel_tight"] = s
            score += s
        elif heel_fit == "perfect":
            dist = abs(c_heel - current_hv_rank)
            s = 4 - (3 * dist)
            breakdown["2-17_heel_perfect"] = s
            score += s

    # 2-18: cross-brand empty heel signal. When the heel feels empty in
    # shoes from 2+ different brands, it's an anatomical fit need rather
    # than brand-specific. Boost narrow-heel candidates beyond what the
    # single-shoe 2-17 signals would give.
    empty_brands = set()
    for us, db in user_shoes:
        if us.get("fit", {}).get("heel") in ("empty", "loose") and db:
            b = (db.get("brand") or "").lower().strip()
            if b:
                empty_brands.add(b)
    if len(empty_brands) >= 2 and c_heel == 0:
        s = 3
        breakdown["2-18_cross_brand_empty_heel"] = s
        score += s

    # ====================================================================
    # SECTION 3: FOREFOOT VOLUME (rules 3-1, 3-16)
    # ====================================================================

    # 3-1: forefoot volume vs target (from fit feedback or measurement)
    fv_dist = abs(c_fv - target_fv)
    if fv_dist == 0:
        s = 3
    else:
        s = -3
    if fb_fv_targets and fv_dist == 0:
        s = 6  # bonus for feedback-derived match
    breakdown["3-1_fv_baseline"] = s
    score += s

    # 3-16: forefoot feedback penalty/bonus
    for us, db in user_shoes:
        fit = us.get("fit") or {}
        ff = fit.get("forefoot", "")
        if not db:
            continue
        current_fv = _fv_rank(db.get("forefoot_volume"))

        if ff == "tight":
            if c_fv > current_fv:
                s = 3
            else:
                s = -3
            breakdown["3-16_fv_tight"] = s
            score += s
        elif ff == "loose":
            if c_fv < current_fv:
                s = 3
            else:
                s = -3
            breakdown["3-16_fv_loose"] = s
            score += s

    # ====================================================================
    # SECTION 4: TOE FORM (rules 4-6, 4-8, 4-15, 4-7)
    # ====================================================================
    toe_score = 0

    # 4-6: toe shape match
    # Check ALL of the shoe's toe forms -- a shoe that supports the user's
    # toe shape should never get the -10 opposite-form penalty.
    # Opposite toe form is a strong mismatch -- penalty must outweigh other dimensions
    # so the #1 pick doesn't have the wrong toe form.
    if toe_shape == "egyptian":
        if "egyptian" in c_toe_forms:
            s = 6
        elif "roman" in c_toe_forms:
            s = 3
        elif "greek" in c_toe_forms:
            s = -10
        else:
            s = 0
        toe_score += s
        breakdown["4-6_toe_match"] = s
    elif toe_shape == "greek":
        if "greek" in c_toe_forms:
            s = 6
        elif "roman" in c_toe_forms:
            s = 3
        elif "egyptian" in c_toe_forms:
            s = -10
        else:
            s = 0
        toe_score += s
        breakdown["4-6_toe_match"] = s
    elif toe_shape == "roman":
        # Roman = 1st and 2nd toe near-equal length. Roman-specific shoes
        # are rare, but Egyptian and Greek shoes BOTH fit well: Egyptian
        # tapers toward a big toe that is at most marginally longer than
        # the 2nd toe (so the 2nd-toe side of the taper is not aggressive
        # for this user), and Greek shoes give extra room to a 2nd toe
        # that is at worst marginally shorter. No "opposite" form exists
        # for Roman users -- we never want to exclude Egyptian/Greek shoes
        # from the candidate pool just because the scan read as Roman.
        if "roman" in c_toe_forms:
            s = 6
        elif "egyptian" in c_toe_forms or "greek" in c_toe_forms:
            s = 4
        else:
            s = 0
        toe_score += s
        breakdown["4-6_toe_match"] = s

    # 4-8: HVA modifier on toe form
    if hva_ratio and hva_ratio > 0.35:
        if c_toe_form in ("egyptian",) and c_asym >= 3:
            s = -3
            toe_score += s
            breakdown["4-8_hva_extreme_toe"] = s
        elif c_toe_form in ("greek",) and c_asym <= 0:
            s = -3
            toe_score += s
            breakdown["4-8_hva_extreme_toe"] = s
        if c_stiff > 0.7 and c_toe_form in ("egyptian", "greek"):
            s = -2
            toe_score += s
            breakdown["4-8_hva_stiff_toe"] = s

    # 4-15: squeezed toes at correct size hint at toe_form mismatch
    for us, db in user_shoes:
        fit = us.get("fit") or {}
        if fit.get("toes") == "squeezed" and db:
            db_tf = db.get("toe_form") or ""
            if isinstance(db_tf, list):
                db_tf = db_tf[0] if db_tf else ""
            if db_tf.lower() == toe_shape:
                s = -2
                toe_score += s
                breakdown["4-15_toe_mismatch_hint"] = s

    # 4-7: smooth toe confidence multiplier. toe_conf encodes how clearly the
    # scan's toe shape reads as Greek/Egyptian (it already factors in
    # |toe_delta|). A shoe-toe-form decision based on a marginal read should
    # get less weight; a clear read gets full weight. 0.9 is the cutoff above
    # which we consider the shape "clear".
    if toe_conf is not None:
        weight = min(max(toe_conf, 0.0) / 0.9, 1.0)
        toe_score = int(round(toe_score * weight))
        breakdown["4-7_toe_confidence"] = f"x{weight:.2f}"

    score += toe_score

    # ====================================================================
    # SECTION 5: CLOSURE (rules 5-4)
    # ====================================================================

    # 5-4a: high-instep closure preference. Tertile-calibrated: "high instep"
    # boundary = 67th percentile = 0.273. Lace-up closures let you open the
    # shoe over a tall midfoot, velcro works, slippers press.
    if instep_ratio >= 0.273:
        if "lace" in c_closure:
            s = 3
        elif "velcro" in c_closure:
            s = 1
        elif "slipper" in c_closure:
            s = -4
        else:
            s = 0
        breakdown["5-4_closure"] = s
        score += s

    # 5-4b: match current shoe closure type (new)
    if user_closures:
        user_cl = user_closures[0]
        if user_cl in c_closure or c_closure in user_cl:
            s = 2
        else:
            s = 0
        if s != 0:
            breakdown["5-4b_closure_match"] = s
            score += s

    # 5-5: low instep closure preference. Low-instep feet leave dead space in
    # slippers (no way to cinch the midfoot) and need a closure that can
    # actively reduce volume. Lace is ideal (adjustable along the full
    # midfoot), velcro is acceptable, slipper is a bad fit.
    # Tertile-calibrated: "low instep" = 33rd percentile = 0.255.
    # NOTE: velcro is treated uniformly for now. Double-velcro vs single-strap
    # velcro matters here but we do not have the data -- see FUTURE_FEATURES.md.
    if instep_ratio < 0.255:
        if "lace" in c_closure:
            s = 3
        elif "velcro" in c_closure:
            s = 2
        elif "slipper" in c_closure:
            s = -3
        else:
            s = 0
        if s != 0:
            breakdown["5-5_low_instep_closure"] = s
            score += s

    # ====================================================================
    # SECTION 6: DOWNTURN (rules 6-11, 6-12)
    # ====================================================================

    if effective_pref == "performance":
        if c_dt >= 3:
            s = 4
        elif c_dt == 2:
            s = 3
        elif c_dt == 1:
            s = 0
        else:
            s = -4
        breakdown["6-11_downturn_perf"] = s
        score += s
    elif effective_pref == "comfort":
        if c_dt <= 0:
            s = 4
        elif c_dt == 1:
            s = 3
        elif c_dt == 2:
            s = 0
        else:
            s = -4
        breakdown["6-11_downturn_comfort"] = s
        score += s
    elif effective_pref == "same" and user_downturns:
        # Average downturn of current shoes -- keep as float so e.g. 1.5
        # gives equal score to both slight(1) and moderate(2)
        avg_dt = sum(_dt_rank(d) for d in user_downturns) / len(user_downturns)
        dist = abs(c_dt - avg_dt)
        if dist <= 0.5:
            s = 6
        elif dist <= 1.5:
            s = 0
        else:
            s = -6
        breakdown["6-11_downturn_same"] = s
        score += s

    # 6-12: notes keywords (climbing style only -- stiffness is independent!)
    if notes:
        if any(w in notes for w in ("overhang", "steep", "cave", "roof")):
            if c_dt >= 2:
                s = 2
            else:
                s = -2
            breakdown["6-12_notes_downturn"] = s
            score += s
        elif any(w in notes for w in ("slab", "vertical", "beginner", "easy")):
            if c_dt <= 1:
                s = 2
            else:
                s = -3
            breakdown["6-12_notes_downturn"] = s
            score += s

    # ====================================================================
    # SECTION 7: ASYMMETRY (rules 7-8, 7-11, 7-15)
    # ====================================================================

    # NOTE (2026-04-14): rule 7-6 (toe-shape asymmetry baseline) was removed.
    # Last asymmetry is a performance/last-shape dimension; it is NOT a fit
    # consequence of Greek vs. Egyptian toe shape. Conflating the two caused
    # a Greek-toed foot to be penalized for any asymmetric shoe even when
    # toe form matched. Asymmetry preference is now driven purely by
    # performance/comfort/same (rule 7-11) and by HVA (rule 7-8).

    # 7-8: HVA + strong asymmetry on Egyptian.
    # Phase 2 change: split mild vs pronounced HVA. Mild HVA (>=0.25) applies
    # a -2 penalty to strong asymmetry so the text promise ("avoid very
    # asymmetric lasts") is honored. Pronounced HVA (>0.35) keeps the
    # stronger -4 penalty from before.
    if hva_ratio and toe_shape == "egyptian" and c_asym >= 3:
        if hva_ratio > 0.35:
            s = -4
        elif hva_ratio >= 0.25:
            s = -2
        else:
            s = 0
        if s:
            breakdown["7-8_hva_asym"] = s
            score += s

    # 7-11: asymmetry preference-based scoring
    # Performance -> more asymmetry, comfort -> less, same -> match current shoes
    if effective_pref == "performance":
        if c_asym >= 3:
            s = 4
        elif c_asym == 2:
            s = 3
        elif c_asym == 1:
            s = 0
        else:
            s = -4
        breakdown["7-11_asym_perf"] = s
        score += s
    elif effective_pref == "comfort":
        if c_asym <= 0:
            s = 4
        elif c_asym == 1:
            s = 3
        elif c_asym == 2:
            s = 0
        else:
            s = -4
        breakdown["7-11_asym_comfort"] = s
        score += s
    elif user_asymmetries and effective_pref == "same":
        # Match what user currently wears (float avg, no rounding)
        avg_asym = sum(_asym_rank(a) for a in user_asymmetries) / len(user_asymmetries)
        dist = abs(c_asym - avg_asym)
        if dist <= 0.5:
            s = 4
        elif dist <= 1.5:
            s = 1
        else:
            s = -3
        breakdown["7-11_asym_same"] = s
        score += s

    # 7-15: squeezed toes with correct toe_form -> asymmetry hint
    for us, db in user_shoes:
        fit = us.get("fit") or {}
        if fit.get("toes") == "squeezed" and db:
            db_tf = db.get("toe_form") or ""
            if isinstance(db_tf, list):
                db_tf = db_tf[0] if db_tf else ""
            if db_tf.lower() == toe_shape:
                s = -1
                breakdown["7-15_asym_hint"] = s
                score += s

    # ====================================================================
    # SECTION 8: COMPUTED STIFFNESS (rules 8-13, 8-4, 8-11, 8-12)
    # ====================================================================

    if user_stiffnesses:
        target_stiff = sum(user_stiffnesses) / len(user_stiffnesses)

        # 8-11: stiffness is INDEPENDENT of performance/comfort preference
        # (a shoe can be aggressive yet soft, or flat yet stiff)
        # Preference only affects downturn/aggressiveness, not rubber stiffness.

        # 8-12: notes override
        notes_stiff_override = False
        if notes:
            if any(w in notes for w in ("soft", "sensitive", "smear", "softer")):
                target_stiff = min(target_stiff, 0.3)
                notes_stiff_override = True
            elif any(w in notes for w in ("stiff", "support", "edging", "rigid")):
                target_stiff = max(target_stiff, 0.7)
                notes_stiff_override = True

        # 8-13: score vs target
        dist = abs(c_stiff - target_stiff)
        if dist <= 0.1:
            s = 5
        elif dist <= 0.2:
            s = 2
        elif dist <= 0.3:
            s = -2
        else:
            s = -5
        breakdown["8-13_stiffness"] = s
        score += s

        # 8-12b: extra penalty when notes explicitly request soft/stiff
        # Stacks with 8-13 -- user explicitly asked for this, so enforce it harder
        if notes_stiff_override and dist > 0.1:
            if dist > 0.25:
                s2 = -5
            elif dist > 0.15:
                s2 = -3
            else:
                s2 = -1
            breakdown["8-12b_notes_stiff_extra"] = s2
            score += s2

    # NOTE (2026-04-14): rule 8-4 (high instep + aggressive downturn bonus)
    # was removed. Aggressive downturn doesn't relieve instep pressure -- the
    # relationship was fiction. Instep is handled purely by 8c (volume match)
    # and 5-5 (closure type).

    # 8-14: stiff shoes feel tighter at the same width grade. When the user's
    # softer shoes already fit "perfect" at the forefoot, a stiff recommendation
    # at the same width grade will feel constrictive because the upper doesn't
    # stretch to accommodate the foot the same way a soft shoe does.
    # Trigger: candidate is mid-to-stiff AND user has a softer shoe (delta > 0.15)
    # where forefoot fit was "perfect" at the current width grade.
    if c_stiff >= 0.6:
        for us, db in user_shoes:
            if not db:
                continue
            fit = us.get("fit") or {}
            if fit.get("forefoot") != "perfect":
                continue
            us_stiff = db.get("computed_stiffness")
            if us_stiff is None or (c_stiff - us_stiff) < 0.15:
                continue
            current_fw_rank = _width_rank(db.get("width"))
            if c_width > current_fw_rank:
                s = 2
                breakdown["8-14_stiff_needs_wider"] = s
                score += s
            elif c_width == current_fw_rank:
                s = -1
                breakdown["8-14_stiff_same_width_tight"] = s
                score += s
            break  # only apply once per candidate

    # 8-15: soft shoes forgive one width grade narrower. When the candidate is
    # clearly soft, stretch/upper conformity compensates for a width grade below
    # the measurement target.
    if c_stiff < 0.3 and target_fw is not None and c_width == target_fw - 1:
        s = 1
        breakdown["8-15_soft_forgives_narrow"] = s
        score += s

    # ====================================================================
    # SECTION 8b: FEEL (new)
    # ====================================================================

    if user_feels:
        # Keep as float so e.g. avg 1.5 gives equal score to both soft(0) and moderate(2)
        avg_feel = sum(_feel_rank(f) for f in user_feels) / len(user_feels)
        # Feel (rubber softness) is INDEPENDENT of performance/comfort preference.
        # A climber wanting "performance" shoes doesn't necessarily want stiffer rubber.

        dist = abs(c_feel - avg_feel)
        if dist <= 0.5:
            s = 4
        elif dist <= 1.5:
            s = 1
        else:
            s = -3
        breakdown["8b_feel"] = s
        score += s

    # ====================================================================
    # SECTION 8c: INSTEP HEIGHT baseline (new)
    # ====================================================================
    # High instep -> penalize very low-volume shoes, bonus for lace/high volume
    # Low instep -> penalize high-volume shoes
    # Tertile-calibrated boundaries: high >= 0.273, low < 0.255.
    if instep_ratio >= 0.273:
        # High instep
        if c_fv == 0:
            s = -3  # low volume shoe + high instep = bad
        elif c_fv >= 2:
            s = 2   # high volume accommodates instep
        else:
            s = 0
        breakdown["8c_instep"] = s
        score += s
    elif instep_ratio < 0.255:
        # Low instep
        if c_fv >= 2:
            s = -2  # too much volume for low instep
        else:
            s = 0
        if s != 0:
            breakdown["8c_instep"] = s
            score += s

    # ====================================================================
    # SECTION 9: SKILL LEVEL (rule 9-13)
    # ====================================================================

    if user_skill_ranks and c_skills:
        user_max_tier = max(user_skill_ranks)
        shoe_max_tier = _tier_rank(c_skills)
        dist = abs(user_max_tier - shoe_max_tier)
        if dist <= 1:
            s = 0
        else:
            s = -100
        breakdown["9-13_skill"] = s
        score += s

    # ====================================================================
    # SECTION 10: NO EDGE (rule 10-11) - per-shoe penalty
    # ====================================================================

    # No-edge: no scoring penalty (it's a valid shoe property, not a flaw).
    # Instead, max 1 no-edge per top-3 is enforced in run_case() dedup.

    # ====================================================================
    # SECTION 11: GENDER (rule 11-9) - no score impact
    # ====================================================================

    # ====================================================================
    # SECTION 12: KIDS FRIENDLY (rule 12-10)
    # ====================================================================

    if c_kids and street_size >= 36:
        s = -100
        breakdown["12-10_kids"] = s
        score += s

    # ====================================================================
    # SECTION 15: OUTPUT CONSTRAINTS (rules 15-13, 15-*)
    # ====================================================================

    shoe_key = f"{shoe.get('brand','')} {shoe.get('model','')}".lower()
    if shoe_key in owned_keys:
        s = -100
        breakdown["15-13_owned"] = s
        score += s

    return score, breakdown


# --- Runner ---

def check_size_available(slug, recommended_size, size_avail):
    available = size_avail.get(slug)
    if not available:
        return True
    for size in available:
        if abs(size - recommended_size) <= 0.5:
            return True
    return False


def calc_recommended_size(anchor_size, anchor_brand, target_brand, brand_sizing, street_size=None):
    if anchor_size is None:
        if street_size:
            target_ds = brand_sizing.get(target_brand, 1.0)
            return round(street_size - target_ds, 1)
        return None
    anchor_ds = brand_sizing.get(anchor_brand, 1.0)
    target_ds = brand_sizing.get(target_brand, 1.0)
    return round(anchor_size + (anchor_ds - target_ds), 1)


def _model_key(s):
    """Normalize model name for dedup (strip variant suffixes)."""
    raw = f"{s['brand']}_{s['model']}".lower()
    for strip in ("women's", "men's", " laces", " velcro", " strap",
                   " invernal", " xhard", " eco"):
        raw = raw.replace(strip, "")
    return raw.strip()


def _shoe_tf(s):
    """Get first toe form of a shoe (lowercase)."""
    tf = s.get("toe_form")
    if isinstance(tf, list):
        return tf[0].lower() if tf else ""
    return (tf or "").lower()


# --- Stiffness tier helpers ---

_STIFF_TIERS = [
    (0.00, 0.25),   # very sensitive
    (0.25, 0.40),   # sensitive
    (0.40, 0.60),   # balanced
    (0.60, 0.75),   # supportive
    (0.75, 1.01),   # very supportive
]


def _stiff_tier_index(stiffness):
    """Return the tier index (0=very sensitive .. 4=very supportive)."""
    if stiffness is None:
        return 2  # default to balanced
    for i, (lo, hi) in enumerate(_STIFF_TIERS):
        if lo <= stiffness < hi:
            return i
    return 4  # >=1.0 -> very supportive


def score_all_shoes(case, shoes_db, brand_sizing, size_avail):
    """Score all shoes for a case. Returns (profile, scored_list).

    The scored list is sorted by score descending. Each entry has:
    slug, brand, model, score, breakdown, width, heel_volume, toe_form,
    closure, downturn, stiffness, no_edge, rec_size, feel, asymmetry.
    """
    profile = case["profile"]
    scored = []

    for shoe in shoes_db:
        # Hard filter: kids
        if shoe.get("kids_friendly") and (profile.get("street_size_eu") or 42) >= 36:
            continue

        total, breakdown = matrix_score(shoe, profile, shoes_db)

        # Size availability penalty
        user_shoes = profile.get("shoes") or []
        slug = shoe["slug"]
        has_any_stock = slug in size_avail
        if user_shoes:
            anchor = user_shoes[0]
            rec_size = calc_recommended_size(
                anchor.get("size_eu"), anchor.get("brand", ""),
                shoe["brand"], brand_sizing,
                street_size=profile.get("street_size_eu"))
            if rec_size and has_any_stock and not check_size_available(slug, rec_size, size_avail):
                total -= 100  # -100 hard constraint: size not available
                breakdown["13_size_unavail"] = -100
            elif not has_any_stock:
                total -= 10  # -10 penalty: no availability data at all
                breakdown["13_no_stock_data"] = -10
        else:
            rec_size = None
            if not has_any_stock:
                total -= 10  # -10 penalty: no availability data at all
                breakdown["13_no_stock_data"] = -10

        scored.append({
            "slug": shoe["slug"],
            "brand": shoe["brand"],
            "model": shoe["model"],
            "score": total,
            "breakdown": breakdown,
            "width": shoe.get("width"),
            "heel_volume": shoe.get("heel_volume"),
            "toe_form": shoe.get("toe_form"),
            "closure": shoe.get("closure"),
            "downturn": shoe.get("downturn"),
            "stiffness": shoe.get("computed_stiffness"),
            "no_edge": shoe.get("no_edge"),
            "feel": shoe.get("feel"),
            "asymmetry": shoe.get("asymmetry"),
            "rec_size": rec_size,
        })

    scored.sort(key=lambda x: -x["score"])
    return profile, scored


def _has_hard_violation(s):
    """Check if a shoe has any hard violation (score <= -100) in its breakdown."""
    for k, v in (s.get("breakdown") or {}).items():
        if isinstance(v, (int, float)) and v <= -100:
            return True
    return False


def _dedup_picks(scored, profile, count=3, exclude_slugs=None,
                 stiffness_filter=None, brand_overlap_ok=False,
                 min_score=None):
    """Select top N picks from scored list with dedup rules.

    Args:
        scored: list sorted by score descending
        profile: user profile dict
        count: how many picks to return
        exclude_slugs: set of slugs already picked (e.g. baseline picks)
        stiffness_filter: optional (lo, hi) tuple -- only consider shoes in range
        brand_overlap_ok: if True, allow brands that appear in exclude_slugs
        min_score: if set, skip shoes with score below this value
    """
    exclude_slugs = exclude_slugs or set()
    user_toe = (profile.get("toe_shape") or "").lower()
    opposite_toe = {"egyptian": "greek", "greek": "egyptian"}.get(user_toe)

    seen_models = set()
    seen_brands = set()
    no_edge_count = 0
    deduped = []

    # Pass 1: Pick #1 (skip opposite toe form for slot 0 only)
    for s in scored:
        if s["slug"] in exclude_slugs:
            continue
        if _has_hard_violation(s):
            continue
        if min_score is not None and s["score"] < min_score:
            continue
        if stiffness_filter:
            st = s.get("stiffness") or 0.5
            if st < stiffness_filter[0] or st >= stiffness_filter[1]:
                continue
        model_key = _model_key(s)
        brand = s["brand"].lower()
        if model_key in seen_models:
            continue
        if brand in seen_brands:
            continue
        if s.get("no_edge") and no_edge_count >= 1:
            continue
        if opposite_toe and _shoe_tf(s) == opposite_toe:
            continue

        seen_models.add(model_key)
        seen_brands.add(brand)
        if s.get("no_edge"):
            no_edge_count += 1
        deduped.append(s)
        break

    # Pass 2: Fill remaining slots (opposite toe allowed)
    for s in scored:
        if len(deduped) >= count:
            break
        if s["slug"] in exclude_slugs:
            continue
        if _has_hard_violation(s):
            continue
        if min_score is not None and s["score"] < min_score:
            continue
        if stiffness_filter:
            st = s.get("stiffness") or 0.5
            if st < stiffness_filter[0] or st >= stiffness_filter[1]:
                continue
        model_key = _model_key(s)
        brand = s["brand"].lower()
        if model_key in seen_models:
            continue
        if brand in seen_brands:
            continue
        if s.get("no_edge") and no_edge_count >= 1:
            continue

        seen_models.add(model_key)
        seen_brands.add(brand)
        if s.get("no_edge"):
            no_edge_count += 1
        deduped.append(s)

    return deduped


def select_baseline(scored, profile):
    """Select top 3 baseline picks with standard dedup rules."""
    return _dedup_picks(scored, profile, count=3)


def _penalize_softer(scored, hard_hi):
    """Return scored list re-sorted by softer-penalty-adjusted score.

    D9 (scoring penalty, not hard filter): shoes whose stiffness sits
    ABOVE the softer-tier ceiling take a significant score penalty that
    grows with distance from the boundary, but they remain eligible as
    fallbacks when the correct band is starved. The user direction
    (2026-04): "significantly increase the scoring weight / penalty".

    Penalty curve (base + ramp):
        over = stiffness - hard_hi   (>0 means wrong direction)
        penalty = -50 - 200 * over

    At boundary:  -50  (a great 60-score out-of-band shoe lands at 10,
                       below most correct-band picks but still eligible
                       if correct band has only ~5-score near-misses).
    over=0.10:    -70
    over=0.25:   -100
    over=0.40:   -130
    """
    rescored = []
    for s in scored:
        st = s.get("stiffness")
        if st is None:
            st = 0.5
        if st <= hard_hi:
            eff = s["score"]
        else:
            over = st - hard_hi
            eff = s["score"] - 50 - 200 * over
        rescored.append((eff, s))
    rescored.sort(key=lambda x: -x[0])
    return [s for _, s in rescored]


def _penalize_stiffer(scored, hard_lo):
    """Return scored list re-sorted by stiffer-penalty-adjusted score.

    Mirror of _penalize_softer: shoes whose stiffness sits BELOW the
    stiffer-tier floor take a significant penalty growing with
    distance, but remain eligible as graceful fallback.
    """
    rescored = []
    for s in scored:
        st = s.get("stiffness")
        if st is None:
            st = 0.5
        if st >= hard_lo:
            eff = s["score"]
        else:
            under = hard_lo - st
            eff = s["score"] - 50 - 200 * under
        rescored.append((eff, s))
    rescored.sort(key=lambda x: -x[0])
    return [s for _, s in rescored]


def select_softer(scored, baseline_picks, profile):
    """Select 3 shoes strictly softer than the softest baseline pick.

    Tier discipline rule (AUDIT_SPEC D9): max(softer) < min(baseline).
    We derive the ceiling from MIN baseline stiffness (not the average)
    with a small hysteresis margin to prevent oscillation when
    computed_stiffness is recomputed by the DB trigger.

    D9 implementation (2026-04): use a scoring PENALTY rather than a
    hard filter. Shoes above the ceiling stay eligible but take a
    significant hit so a good correct-band pick almost always wins.
    When the correct band is starved, the least-penalized out-of-band
    shoe surfaces instead of returning fewer than 3 picks.
    """
    baseline_stiffs = [p.get("stiffness") or 0.5 for p in baseline_picks]
    min_stiff = min(baseline_stiffs) if baseline_stiffs else 0.5

    _D9_MARGIN = 0.02
    hard_hi = max(0.0, min_stiff - _D9_MARGIN)

    baseline_slugs = {p["slug"] for p in baseline_picks}
    rescored = _penalize_softer(scored, hard_hi)
    return _dedup_picks(rescored, profile, count=3,
                        exclude_slugs=baseline_slugs)


def select_stiffer(scored, baseline_picks, profile):
    """Select 3 shoes strictly stiffer than the stiffest baseline pick.

    Tier discipline rule (AUDIT_SPEC D9): max(baseline) < min(stiffer).
    Floor is derived from MAX baseline stiffness with hysteresis margin.

    D9 implementation (2026-04): use a scoring PENALTY rather than a
    hard filter -- see select_softer for the rationale.
    """
    baseline_stiffs = [p.get("stiffness") or 0.5 for p in baseline_picks]
    max_stiff = max(baseline_stiffs) if baseline_stiffs else 0.5

    _D9_MARGIN = 0.02
    hard_lo = min(1.01, max_stiff + _D9_MARGIN)

    baseline_slugs = {p["slug"] for p in baseline_picks}
    rescored = _penalize_stiffer(scored, hard_lo)
    return _dedup_picks(rescored, profile, count=3,
                        exclude_slugs=baseline_slugs)


def select_budget(scored, baseline_picks, softer_picks, stiffer_picks, profile,
                  best_prices=None):
    """Select 3 budget-friendly shoes with good fit at the best price.

    Approach: re-rank scored list by (fit_score + price_bonus) where the price
    bonus rewards cheaper shoes. Excludes shoes already in other tiers.
    Only considers shoes with known prices.

    Price bonus scale (EUR):
        < 60:  +25
       60-80:  +20
      80-100:  +15
     100-120:  +10
     120-140:  +5
        140+:  +0
    """
    if not best_prices:
        return []

    exclude_slugs = set()
    for picks in (baseline_picks, softer_picks, stiffer_picks):
        for p in picks:
            exclude_slugs.add(p["slug"])

    # D10: the budget tier must not recycle the user's current shoe line.
    # The promise of the budget tier is "a different cheaper option", not
    # "a relabelled variant of what you already own". Build a set of
    # (brand, root_model) pairs from the user's shoes and reject any
    # candidate whose brand+root_model matches.
    def _model_root(model):
        # First word of the model, stripped and lowercased -- the stem
        # that identifies the family (e.g. "tarantula" from
        # "Tarantula Boulder Women's").
        m = (model or "").strip().lower()
        return m.split()[0] if m else ""

    user_shoe_families = set()
    for us in profile.get("shoes") or []:
        b = (us.get("brand") or "").strip().lower()
        r = _model_root(us.get("model") or "")
        if b and r:
            user_shoe_families.add((b, r))

    # Compute the baseline-tier median price so the budget tier can enforce
    # a meaningful discount. Without this, a 139 EUR shoe could land in budget
    # alongside a 139 EUR baseline pick and save the user nothing.
    baseline_prices = [best_prices.get(p["slug"]) for p in baseline_picks
                       if best_prices.get(p["slug"]) is not None]
    if baseline_prices:
        sorted_bp = sorted(baseline_prices)
        mid = len(sorted_bp) // 2
        baseline_median_price = (sorted_bp[mid] if len(sorted_bp) % 2
                                 else (sorted_bp[mid - 1] + sorted_bp[mid]) / 2)
        # Require budget picks to cost at most 80% of the baseline median
        _BUDGET_DISCOUNT_CEILING = baseline_median_price * 0.80
    else:
        _BUDGET_DISCOUNT_CEILING = None  # no priced baseline, skip the rule

    def _price_bonus(slug):
        price = best_prices.get(slug)
        if price is None:
            return -999  # no price data -> exclude
        if price < 60:
            return 25
        elif price < 80:
            return 20
        elif price < 100:
            return 15
        elif price < 120:
            return 10
        elif price < 140:
            return 5
        return 0

    # Build budget-scored list: only shoes with prices and no hard violations
    budget_scored = []
    for s in scored:
        if s["slug"] in exclude_slugs:
            continue
        if _has_hard_violation(s):
            continue
        # D10: reject same-model-line as the user's current shoe.
        cand_brand = (s.get("brand") or "").strip().lower()
        cand_root = _model_root(s.get("model") or "")
        if cand_brand and cand_root and (cand_brand, cand_root) in user_shoe_families:
            continue
        bonus = _price_bonus(s["slug"])
        if bonus <= -999:
            continue  # no price data
        price = best_prices.get(s["slug"])
        # Enforce discount discipline: a budget pick must undercut the
        # baseline tier by at least 20%. If no baseline price is available,
        # the rule is skipped to avoid starving the budget tier.
        if (_BUDGET_DISCOUNT_CEILING is not None
                and price is not None
                and price > _BUDGET_DISCOUNT_CEILING):
            continue
        budget_scored.append({
            **s,
            "budget_score": s["score"] + bonus,
            "best_price": price,
        })

    # Sort by budget_score descending
    budget_scored.sort(key=lambda x: -x["budget_score"])

    # Apply standard dedup (no duplicate model/brand, max 1 no-edge)
    picks = _dedup_picks(budget_scored, profile, count=3)

    # If any slot is below score threshold, backfill with best-fit non-priced
    # shoes (flagged as not_in_stock so the frontend can mention it).
    _MIN_BUDGET_SCORE = 25
    if len(picks) < 3 or any(p["score"] < _MIN_BUDGET_SCORE for p in picks):
        # Collect non-priced candidates
        picked_slugs = exclude_slugs | {p["slug"] for p in picks}
        non_priced = []
        for s in scored:
            if s["slug"] in picked_slugs:
                continue
            if _has_hard_violation(s):
                continue
            if best_prices.get(s["slug"]) is not None:
                continue  # already in priced pool
            non_priced.append({**s, "not_in_stock": True, "best_price": None})
        non_priced.sort(key=lambda x: -x["score"])

        # Replace low-score picks or fill empty slots
        # Remove picks below threshold
        good_picks = [p for p in picks if p["score"] >= _MIN_BUDGET_SCORE]
        needed = 3 - len(good_picks)
        if needed > 0:
            backfill = _dedup_picks(non_priced, profile, count=needed,
                                    exclude_slugs={p["slug"] for p in good_picks})
            picks = good_picks + backfill

    return picks


def run_case(case, shoes_db, brand_sizing, size_avail):
    """Run scoring for one test case. Returns top 3 baseline picks.

    Backward-compatible wrapper around score_all_shoes + select_baseline.
    """
    profile, scored = score_all_shoes(case, shoes_db, brand_sizing, size_avail)
    return select_baseline(scored, profile)


def _enforce_asymmetry_diversity(tier_picks, scored, profile, all_tier_slugs,
                                 tier_name, stiffness_filter=None):
    """Phase 2 diversity nudge for mild-or-worse HVA + Egyptian users.

    Section 1 and Section 3 promise that such users will see "moderately
    asymmetric or wider-tipped" options. The per-shoe scoring tightening in
    rules 7-6 and 7-8 is not enough when strong-asymmetry shoes correlate
    strongly with the other properties the profile wants. This helper swaps
    the lowest-scoring pick with the best-scoring moderate-asymmetry shoe
    that is otherwise compatible, provided such a shoe exists with a score
    above 60% of the top pick in the tier.

    Only runs when all three conditions hold:
      - profile.hallux_valgus_class is set and != "normal"
      - profile.toe_shape == "egyptian"
      - no existing pick in the tier has asymmetry="moderate"

    The swap-in must be in the same stiffness band and not violate the
    one-no-edge-per-tier rule or existing brand/model dedup.
    """
    if not tier_picks:
        return tier_picks

    hva = (profile.get("hallux_valgus_class") or "").lower()
    toe_shape = (profile.get("toe_shape") or "").lower()
    if not hva or hva == "normal" or toe_shape != "egyptian":
        return tier_picks

    has_moderate = any(
        (p.get("asymmetry") or "").lower() == "moderate"
        for p in tier_picks
    )
    if has_moderate:
        return tier_picks

    top_score = tier_picks[0].get("score", 0)
    if top_score <= 0:
        return tier_picks
    score_floor = top_score * 0.6

    seen_models_existing = set()
    seen_brands_existing = set()
    no_edge_count = 0
    for p in tier_picks:
        seen_models_existing.add(_model_key(p))
        seen_brands_existing.add((p.get("brand") or "").lower())
        if p.get("no_edge"):
            no_edge_count += 1

    # Find the best moderate-asymmetry candidate that fits the tier.
    for cand in scored:
        if (cand.get("asymmetry") or "").lower() != "moderate":
            continue
        if cand["slug"] in all_tier_slugs:
            continue
        if _has_hard_violation(cand):
            continue
        if cand.get("score", 0) < score_floor:
            break  # scored is sorted descending -- no better candidate remains
        if stiffness_filter:
            st = cand.get("stiffness") or 0.5
            if st < stiffness_filter[0] or st >= stiffness_filter[1]:
                continue
        if cand.get("no_edge") and no_edge_count >= 1:
            continue
        if _model_key(cand) in seen_models_existing:
            continue
        if (cand.get("brand") or "").lower() in seen_brands_existing:
            continue
        # Viable swap-in. Replace the lowest-scoring pick (last in list).
        dropped = tier_picks[-1]
        new_picks = tier_picks[:-1] + [cand]
        # Update all_tier_slugs so other tiers don't re-pick the swap-in
        all_tier_slugs.discard(dropped["slug"])
        all_tier_slugs.add(cand["slug"])
        return new_picks

    return tier_picks


def _tier_stiffness_filter(tier_name, baseline_picks):
    """Return the stiffness band used by the tier, for diversity swap compatibility."""
    baseline_stiffs = [p.get("stiffness") or 0.5 for p in baseline_picks]
    avg_stiff = sum(baseline_stiffs) / len(baseline_stiffs) if baseline_stiffs else 0.5
    baseline_tier = _stiff_tier_index(avg_stiff)
    max_tier = len(_STIFF_TIERS) - 1

    if tier_name == "baseline":
        return None
    if tier_name == "softer":
        if baseline_tier > 0:
            return _STIFF_TIERS[baseline_tier - 1]
        return (0.0, avg_stiff)
    if tier_name == "stiffer":
        if baseline_tier < max_tier:
            return _STIFF_TIERS[baseline_tier + 1]
        return (avg_stiff, 1.01)
    return None


def run_case_full(case, shoes_db, brand_sizing, size_avail, best_prices=None):
    """Run scoring and return all tier picks: baseline + softer + stiffer + budget.

    Returns dict with keys: 'baseline', 'softer', 'stiffer', 'budget', and the
    full 'scored' list.
    """
    profile, scored = score_all_shoes(case, shoes_db, brand_sizing, size_avail)
    baseline = select_baseline(scored, profile)
    softer = select_softer(scored, baseline, profile)
    stiffer = select_stiffer(scored, baseline, profile)
    budget = select_budget(scored, baseline, softer, stiffer, profile,
                           best_prices=best_prices)

    # Phase 2: asymmetry diversity nudge for mild-or-worse HVA + Egyptian.
    # Runs after tier selection so we can swap without disturbing the
    # stiffness-tier discipline that select_softer / select_stiffer already
    # enforced. Each tier swap is independent and picks the best available
    # moderate-asymmetry shoe that fits the tier's stiffness band.
    all_slugs = set()
    for picks in (baseline, softer, stiffer, budget):
        for p in picks:
            all_slugs.add(p["slug"])

    baseline = _enforce_asymmetry_diversity(
        baseline, scored, profile, all_slugs, "baseline",
        stiffness_filter=_tier_stiffness_filter("baseline", baseline))
    softer = _enforce_asymmetry_diversity(
        softer, scored, profile, all_slugs, "softer",
        stiffness_filter=_tier_stiffness_filter("softer", baseline))
    stiffer = _enforce_asymmetry_diversity(
        stiffer, scored, profile, all_slugs, "stiffer",
        stiffness_filter=_tier_stiffness_filter("stiffer", baseline))
    budget = _enforce_asymmetry_diversity(
        budget, scored, profile, all_slugs, "budget",
        stiffness_filter=None)

    # D8: cap brand concentration across the full 12-shoe matrix. No
    # single brand should own more than _MATRIX_BRAND_CAP slots. This
    # runs after tier selection so we never violate tier discipline --
    # we only swap within the same tier, preserving the stiffness band.
    tier_map = {
        "baseline": baseline,
        "softer": softer,
        "stiffer": stiffer,
        "budget": budget,
    }
    tier_filters = {
        "baseline": _tier_stiffness_filter("baseline", baseline),
        "softer": _tier_stiffness_filter("softer", baseline),
        "stiffer": _tier_stiffness_filter("stiffer", baseline),
        "budget": None,
    }
    tier_map = _enforce_brand_cap(tier_map, scored, profile, tier_filters)

    return {
        "baseline": tier_map["baseline"],
        "softer": tier_map["softer"],
        "stiffer": tier_map["stiffer"],
        "budget": tier_map["budget"],
        "scored": scored,
    }


_MATRIX_BRAND_CAP = 3


def _enforce_brand_cap(tier_map, scored, profile, tier_filters):
    """Post-pass that caps brand concentration across the full matrix.

    Rule: no brand may hold more than _MATRIX_BRAND_CAP slots across the
    12-shoe matrix (baseline + softer + stiffer + budget). When a brand
    exceeds the cap, the lowest-scoring over-cap pick is replaced with
    the best alternative candidate from the SAME tier that (a) fits the
    tier's stiffness band, (b) isn't already in the matrix, and (c)
    belongs to a brand that is still under the cap after the swap.

    We prefer swapping budget tier first, then stiffer/softer, then
    baseline, so the baseline tier's fit-quality is disturbed last.
    Returns a fresh tier_map dict with swapped picks applied.
    """
    order = ("budget", "stiffer", "softer", "baseline")
    tier_map = {k: list(v) for k, v in tier_map.items()}

    def _brand_counts():
        counts = {}
        for picks in tier_map.values():
            for p in picks:
                b = (p.get("brand") or "").lower()
                counts[b] = counts.get(b, 0) + 1
        return counts

    def _all_slugs():
        s = set()
        for picks in tier_map.values():
            for p in picks:
                s.add(p["slug"])
        return s

    # Iterate: each loop resolves at most one over-cap slot. Bounded at
    # 12 iterations so we cannot loop forever even under pathological
    # input.
    for _ in range(12):
        counts = _brand_counts()
        over_cap = {b: c for b, c in counts.items() if c > _MATRIX_BRAND_CAP}
        if not over_cap:
            break

        # Pick the brand with the biggest overflow (ties broken by name).
        offending_brand = max(over_cap.keys(), key=lambda b: (over_cap[b], b))

        # Find the lowest-scoring offending pick, preferring cheaper tiers
        # so we disturb the baseline last.
        best_swap = None  # (tier_name, idx, new_pick)
        for tier_name in order:
            picks = tier_map[tier_name]
            # Among offending picks in this tier, pick the one with the
            # lowest score.
            cand_idxs = [i for i, p in enumerate(picks)
                         if (p.get("brand") or "").lower() == offending_brand]
            if not cand_idxs:
                continue
            cand_idxs.sort(key=lambda i: picks[i].get("score", 0))
            # Try to find a replacement from the same tier.
            stiff_filter = tier_filters.get(tier_name)
            exclude = _all_slugs()
            # Temporarily consider the offending pick removed so its
            # slot is available for the replacement check.
            for idx in cand_idxs:
                offending_slug = picks[idx]["slug"]
                ex2 = exclude - {offending_slug}
                replacement = None
                for s in scored:
                    if s["slug"] in ex2:
                        continue
                    if _has_hard_violation(s):
                        continue
                    if stiff_filter:
                        st = s.get("stiffness") or 0.5
                        if st < stiff_filter[0] or st >= stiff_filter[1]:
                            continue
                    # Candidate brand must be under cap *after* the swap.
                    cand_brand = (s.get("brand") or "").lower()
                    projected = counts.get(cand_brand, 0) + (0 if cand_brand == offending_brand else 1)
                    if projected > _MATRIX_BRAND_CAP:
                        continue
                    if cand_brand == offending_brand:
                        continue  # doesn't reduce concentration
                    # Don't duplicate a model line already in the matrix.
                    cand_model_key = f"{cand_brand}|{_model_root(s.get('model') or '')}"
                    existing_model_keys = set()
                    for picks2 in tier_map.values():
                        for p2 in picks2:
                            existing_model_keys.add(
                                f"{(p2.get('brand') or '').lower()}|{_model_root(p2.get('model') or '')}")
                    if cand_model_key in existing_model_keys:
                        continue
                    replacement = s
                    break
                if replacement:
                    best_swap = (tier_name, idx, replacement)
                    break
            if best_swap:
                break

        if not best_swap:
            # No legal replacement anywhere; the cap can't be enforced
            # given the current candidate pool. Leave the matrix as-is.
            break

        tier_name, idx, new_pick = best_swap
        tier_map[tier_name][idx] = new_pick

    return tier_map


def _model_root(model):
    """First word of model name, lowercased. Used by brand-cap and
    budget-same-family checks to identify variants of the same line."""
    m = (model or "").strip().lower()
    return m.split()[0] if m else ""


def main():
    print("Loading data from Supabase...")
    shoes_db = load_shoes()
    brand_sizing = load_brand_sizing()
    size_avail = load_size_availability()
    print(f"Loaded {len(shoes_db)} shoes, {len(brand_sizing)} brands, {len(size_avail)} size entries")

    # Load gold standard cases
    cases_path = os.path.join(os.path.dirname(__file__), "gold_standard_cases.json")
    with open(cases_path) as f:
        cases = json.load(f)
    print(f"Loaded {len(cases)} test cases\n")

    total_score = 0
    violations = 0

    for i, case in enumerate(cases):
        top3 = run_case(case, shoes_db, brand_sizing, size_avail)
        case_score = sum(p["score"] for p in top3)
        total_score += case_score

        # Check for hard violations in top 3
        case_violations = []
        for p in top3:
            for k, v in p["breakdown"].items():
                if isinstance(v, (int, float)) and v <= -100:
                    case_violations.append(f"{p['slug']}: {k}={v}")

        has_violation = len(case_violations) > 0
        if has_violation:
            violations += 1

        flag = " *** VIOLATION ***" if has_violation else ""
        print(f"Case {i+1:2d}: {case['description'][:60]:<60s} | score={case_score:4d}{flag}")
        for j, p in enumerate(top3):
            print(f"  #{j+1} {p['brand']} {p['model']:<25s} "
                  f"score={p['score']:3d} | w={p['width']}, hv={p['heel_volume']}, "
                  f"tf={p['toe_form']}, dt={p['downturn']}, "
                  f"stiff={p['stiffness']:.2f}, ne={p['no_edge']}")
            # Show top scoring rules
            top_rules = sorted(
                [(k,v) for k,v in p["breakdown"].items() if isinstance(v, (int, float))],
                key=lambda x: abs(x[1]), reverse=True)[:5]
            rule_str = ", ".join(f"{k}={v:+d}" for k,v in top_rules)
            print(f"       top rules: {rule_str}")

        if case_violations:
            for cv in case_violations:
                print(f"  !! {cv}")
        print()

    print("=" * 80)
    print(f"TOTAL SCORE: {total_score} across {len(cases)} cases")
    print(f"AVERAGE per case: {total_score/len(cases):.1f}")
    print(f"Cases with violations: {violations}/{len(cases)}")


if __name__ == "__main__":
    main()
