#!/usr/bin/env python3
"""
Shoe candidate pre-filtering for the foot scan pipeline.

Loads shoes from Supabase once at startup, then scores/filters candidates
based on a foot profile. Produces a shortlist for the LLM to pick from.
"""
import json, os, time
from typing import Optional

import requests

SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SB_KEY = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
if not SB_KEY:
    raise RuntimeError("SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_KEY) must be set")

HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}

# --- Knowledge Base (baked in from Fit_Knowledge_Base.xlsx) ---

INSIGHTS = [
    # Thresholds tertile-calibrated 2026-04-14. See scanner/foot_measure.py POP.
    # Class boundaries (33rd/67th percentile on ~200 scans):
    #   forefoot: narrow < 0.344, wide > 0.367
    #   heel:     narrow < 0.228, wide > 0.245
    #   instep:   low    < 0.255, high > 0.273
    #   heel_dep: shallow< 0.028, deep > 0.041
    #   arch:     short  < 0.712, long > 0.734
    {
        "id": 1,
        "title": "Phantom Toe Squeeze (Long Arch + Narrow Forefoot)",
        "trigger": {"arch_length_ratio": ">=0.734", "forefoot_width_ratio": "<0.344"},
        "insight": "When the arch ratio is high and the forefoot is narrow, the ball of the foot sits far back, leaving a long but narrow toe zone. Shoes with compact toe boxes crush the toes even though the foot IS narrow.",
        "consequence": "Recommend shoes with shorter, more compact toe boxes or downturn designs that curve naturally into the toe zone. Avoid very aggressive toe boxes built for short toes.",
    },
    {
        "id": 2,
        "title": "LV Shoes Fail with Narrow Forefoot + High Instep",
        "trigger": {"instep_height_ratio": ">=0.273", "forefoot_width_ratio": "<0.344"},
        "insight": "A narrow forefoot with a high instep creates a foot that is slim from the front but tall through the midfoot. LV shoes compress the midfoot painfully.",
        "consequence": "Recommend closure systems (laces or dual Velcro) that can cinch width independently of volume. Avoid pure LV models without adjustable closure.",
    },
    {
        "id": 3,
        "title": "Normal Width + High Instep -> LV is Wrong",
        "trigger": {"instep_height_ratio": ">=0.273", "forefoot_width_ratio": "0.344-0.367"},
        "insight": "When forefoot width is normal but instep is high, LV models compress the forefoot too much. The foot needs standard volume with adjustable closures.",
        "consequence": "Recommend standard-volume shoes with adjustable closures. Do not recommend LV.",
    },
    {
        "id": 4,
        "title": "Greek Toe + Narrow Heel = Hardest Fit",
        "trigger": {"toe_shape": "greek", "heel_width_ratio": "<0.228"},
        "insight": "Most shoes with narrow heels also have narrow, pointed toe boxes optimised for Egyptian toes. Greek toes need width at the second toe but narrowness everywhere else.",
        "consequence": "Recommend from the short list of narrow heel + Greek-compatible shoes: Unparallel Flagship, Regulus, La Sportiva Skwama, Mad Rock D2.ONE HV, Tenaya Oasi.",
    },
    {
        "id": 5,
        "title": "Wide Heel + Shallow Depth -> Narrow Cup Fits Well",
        "trigger": {"heel_depth_ratio": "<0.028", "heel_width_ratio": ">=0.245"},
        "insight": "A heel that is proportionally wide but very shallow in depth doesn't protrude much backward. Narrow heel cups still fit because the heel lacks the backward projection that creates slippage.",
        "consequence": "Don't rule out narrow heel cups just because heel width is classified as 'wide'. Shallow heels are forgiving.",
    },
    {
        "id": 6,
        "title": "Shallow Heel Profile -> Empty Heel in Standard Shoes",
        "trigger": {"heel_depth_ratio": "<0.020"},
        "insight": "When heel depth ratio is very low, the heel doesn't project backward enough to engage the heel cup. Standard shoes will feel empty.",
        "consequence": "Recommend shoes with sculpted, three-dimensional heel pockets (e.g. La Sportiva Miura, Solution). Avoid flat heel designs.",
    },
    {
        "id": 7,
        "title": "High Instep -> Aggressive Downturn is Comfortable",
        "trigger": {"instep_height_ratio": ">=0.273"},
        "insight": "A high arch/instep naturally conforms to a downturned last. The foot's shape already matches the curve.",
        "consequence": "Note that aggressive shoes may be more comfortable than expected. Lace closure is ideal for fine-tuning over the instep.",
    },
    {
        "id": 8,
        "title": "Low Instep + Narrow Forefoot = Ideal LV Candidate",
        "trigger": {"instep_height_ratio": "<0.255", "forefoot_width_ratio": "<0.344"},
        "insight": "When both instep and forefoot are narrow/low, LV shoes are the perfect match.",
        "consequence": "Prioritise LV variants whenever available.",
    },
    {
        "id": 9,
        "title": "Cross-Gender Shoe Recommendations for Outlier Volume",
        "trigger": {},
        "insight": "Men with low-volume, narrow feet (especially at smaller street sizes <= EU 42) should try women's models. Women with wide, high-volume feet should try men's models.",
        "consequence": "Always include at least one cross-gender recommendation when trigger conditions match.",
    },
]

# --- Shoe cache ---

_shoes_cache: list = []
_shoes_loaded_at: float = 0.0
_brand_sizing_cache: dict = {}  # brand -> typical_downsize_mid
_size_avail_cache: dict = {}  # slug -> set of available EU sizes (from shoe_prices)
_best_price_cache: dict = {}  # slug -> lowest price_eur across all retailers
_proven_slugs_cache: set = set()  # slugs that appear in approved fit_cases
_caches_loaded_at: float = 0.0
CACHE_TTL = 3600  # refresh every hour


def _load_shoes():
    """Fetch all shoes from Supabase and cache them."""
    global _shoes_cache, _shoes_loaded_at
    if _shoes_cache and (time.time() - _shoes_loaded_at) < CACHE_TTL:
        return _shoes_cache

    print(f"[scan_recommender] Loading shoes from Supabase...")
    t0 = time.time()
    resp = requests.get(
        f"{SB_URL}/rest/v1/shoes",
        headers=HEADERS,
        params={
            "select": "slug,brand,model,width,heel_volume,toe_form,forefoot_volume,"
                      "closure,downturn,asymmetry,feel,kids_friendly,gender,"
                      "skill_level,use_cases,description,"
                      "midsole,midsole_stiffness,rand,rubber_type,"
                      "rubber_hardness,rubber_thickness_mm,upper_material,no_edge,"
                      "computed_stiffness",
            "limit": 600,
        },
    )
    resp.raise_for_status()
    _shoes_cache = resp.json()
    _shoes_loaded_at = time.time()
    print(f"[scan_recommender] Loaded {len(_shoes_cache)} shoes in {time.time()-t0:.1f}s")
    return _shoes_cache


def _load_brand_sizing():
    """Load brand sizing patterns (typical downsize from street size)."""
    global _brand_sizing_cache, _caches_loaded_at
    if _brand_sizing_cache and (time.time() - _caches_loaded_at) < CACHE_TTL:
        return _brand_sizing_cache

    resp = requests.get(
        f"{SB_URL}/rest/v1/brand_sizing",
        headers=HEADERS,
        params={"select": "brand,typical_downsize_mid"},
    )
    resp.raise_for_status()
    _brand_sizing_cache = {r["brand"]: r["typical_downsize_mid"] for r in resp.json()}
    _caches_loaded_at = time.time()
    return _brand_sizing_cache


def _load_proven_slugs():
    """Load shoe slugs that appear in approved fit_cases recommendations.

    Shoes that have been successfully recommended and approved get a
    small boost in scoring - they're proven to work for real users.
    """
    global _proven_slugs_cache
    if _proven_slugs_cache and (time.time() - _caches_loaded_at) < CACHE_TTL:
        return _proven_slugs_cache

    try:
        resp = requests.get(
            f"{SB_URL}/rest/v1/fit_cases",
            headers=HEADERS,
            params={"select": "recommended_slugs"},
        )
        resp.raise_for_status()
        slugs = set()
        for row in resp.json():
            for slug in (row.get("recommended_slugs") or []):
                slugs.add(slug)
        _proven_slugs_cache = slugs
        print(f"[scan_recommender] Loaded {len(slugs)} proven shoe slugs from fit_cases")
    except Exception as e:
        print(f"[scan_recommender] Warning: could not load fit_cases: {e}")
        _proven_slugs_cache = set()

    return _proven_slugs_cache


def _load_size_availability():
    """Load available sizes per shoe slug from shoe_prices (in-stock only).

    Builds a dict: slug -> set of EU sizes available at any retailer.
    Only loads once per CACHE_TTL.
    """
    global _size_avail_cache
    if _size_avail_cache and (time.time() - _caches_loaded_at) < CACHE_TTL:
        return _size_avail_cache

    t0 = time.time()
    resp = requests.get(
        f"{SB_URL}/rest/v1/shoe_prices",
        headers=HEADERS,
        params={
            "select": "product_slug,sizes_available",
            "in_stock": "eq.true",
            "limit": 10000,
        },
    )
    resp.raise_for_status()

    avail = {}
    for row in resp.json():
        slug = row.get("product_slug")
        sizes_raw = row.get("sizes_available") or []
        if isinstance(sizes_raw, str):
            try:
                sizes_raw = json.loads(sizes_raw)
            except (json.JSONDecodeError, TypeError):
                sizes_raw = []
        if slug and sizes_raw:
            if slug not in avail:
                avail[slug] = set()
            for s in sizes_raw:
                try:
                    avail[slug].add(float(s))
                except (ValueError, TypeError):
                    pass

    _size_avail_cache = avail
    print(f"[scan_recommender] Size availability loaded for {len(avail)} shoes in {time.time()-t0:.1f}s")
    return _size_avail_cache


def _load_best_prices():
    """Load cheapest available price per shoe slug per size from shoe_prices.

    Builds a dict: slug -> {size_eu: lowest_price_eur}.
    Used for the budget recommendation category - we only show prices
    that are actually available in the user's recommended size.
    """
    global _best_price_cache
    if _best_price_cache and (time.time() - _caches_loaded_at) < CACHE_TTL:
        return _best_price_cache

    t0 = time.time()
    resp = requests.get(
        f"{SB_URL}/rest/v1/shoe_prices",
        headers=HEADERS,
        params={
            "select": "product_slug,price_eur,sizes_available",
            "in_stock": "eq.true",
            "limit": 10000,
        },
    )
    resp.raise_for_status()

    # prices[slug][size] = lowest price
    prices = {}
    for row in resp.json():
        slug = row.get("product_slug")
        price = row.get("price_eur")
        sizes_raw = row.get("sizes_available") or []
        if isinstance(sizes_raw, str):
            try:
                sizes_raw = json.loads(sizes_raw)
            except (json.JSONDecodeError, TypeError):
                sizes_raw = []
        if not slug or price is None:
            continue
        try:
            p = float(price)
        except (ValueError, TypeError):
            continue
        if slug not in prices:
            prices[slug] = {}
        for s in sizes_raw:
            try:
                sz = float(s)
                if sz not in prices[slug] or p < prices[slug][sz]:
                    prices[slug][sz] = p
            except (ValueError, TypeError):
                pass

    _best_price_cache = prices
    print(f"[scan_recommender] Best prices loaded for {len(prices)} shoes in {time.time()-t0:.1f}s")
    return _best_price_cache


def _get_best_price_for_size(slug: str, recommended_size: float,
                              prices: dict) -> Optional[float]:
    """Get the cheapest price for a shoe within 0.5 EU of the recommended size.

    Uses range matching (abs diff <= 0.5) instead of exact key lookups,
    so non-standard recommended sizes (e.g. 42.2) still match standard
    size ladder values (e.g. 42.0, 42.5).
    """
    slug_prices = prices.get(slug)
    if not slug_prices:
        return None
    best = None
    for sz, p in slug_prices.items():
        if abs(sz - recommended_size) <= 0.5:
            if best is None or p < best:
                best = p
    return best


def _calc_recommended_size(user_anchor_size: float, anchor_brand: str,
                           target_brand: str, brand_sizing: dict,
                           street_size: float = None,
                           preference: str = None) -> float:
    """Calculate recommended EU size using the sizing formula.

    Base formula:
        anchor_based = anchor_size + (anchor_downsize - target_downsize)

    This preserves the user's personal tightness from their anchor shoe.
    However, for comfort-preference users this can over-downsize when
    the anchor shoe is already tighter than the brand's typical fit.

    Fix: blend with street-size-based calculation for comfort users.
        street_based = street_size - target_downsize
        comfort result = max(anchor_based, street_based)

    For performance users, the anchor-based result is used directly
    (they chose that tightness deliberately).
    """
    anchor_ds = brand_sizing.get(anchor_brand, 1.0)
    target_ds = brand_sizing.get(target_brand, 1.0)
    anchor_based = round(user_anchor_size + (anchor_ds - target_ds), 1)

    # For comfort preference: don't propagate over-downsizing from anchor
    if preference in ("comfort", None) and street_size is not None:
        street_based = round(street_size - target_ds, 1)
        # Use the larger (less aggressive) of the two calculations
        return max(anchor_based, street_based)

    return anchor_based


def _check_size_available(slug: str, recommended_size: float,
                          size_avail: dict) -> bool:
    """Check if a shoe is available within half a size of the recommended size.

    Uses a range check instead of exact matches so brands with non-standard
    size increments (e.g. Five Ten uses 1/3 EU steps like 42.67, 43.33)
    are not incorrectly penalized.

    Returns True if available, or if we have no size data for this shoe.
    """
    available = size_avail.get(slug)
    if not available:
        return True  # no data = assume available (no penalty)

    # Check if any available size is within +/- 0.5 of the recommended size
    for size in available:
        if abs(size - recommended_size) <= 0.5:
            return True
    return False


def _trigger_matches(trigger: dict, profile: dict) -> bool:
    """Check if an insight trigger matches a foot profile."""
    if not trigger:
        return False
    for key, condition in trigger.items():
        val = profile.get(key)
        if val is None:
            return False
        if isinstance(condition, str) and condition.startswith(">="):
            if isinstance(val, str):
                return val == condition  # string equality for toe_shape etc
            if float(val) < float(condition[2:]):
                return False
        elif isinstance(condition, str) and condition.startswith("<"):
            if isinstance(val, str):
                return False
            if float(val) >= float(condition[1:]):
                return False
        elif isinstance(condition, str) and "-" in condition and not condition.startswith("-"):
            lo, hi = condition.split("-")
            if float(val) < float(lo) or float(val) > float(hi):
                return False
        elif str(val) != str(condition):
            return False
    return True


def get_applicable_insights(profile: dict) -> list:
    """Return insights whose triggers match this foot profile."""
    result = []
    for ins in INSIGHTS:
        if _trigger_matches(ins["trigger"], profile):
            result.append(ins)
    return result


def _extract_user_shoe_profile(profile: dict) -> dict:
    """Extract stiffness and skill level from the user's current shoes.

    Looks up each shoe in the DB to compute stiffness and get skill_level.
    Returns {"stiffnesses": list[float], "skill_levels": set, "owned_models": set}.
    """
    shoes = _load_shoes()
    shoe_by_brand_model = {}
    for s in shoes:
        key = f"{s['brand']} {s['model']}".lower()
        shoe_by_brand_model[key] = s

    user_shoes = profile.get("shoes") or []
    stiffnesses = []
    skill_levels = set()
    owned_models = set()

    for us in user_shoes:
        brand = us.get("brand", "")
        model = us.get("model", "")
        key = f"{brand} {model}".lower()
        owned_models.add(key)

        # Try exact match, then partial (e.g. "Instinct VSR" -> "Instinct VSR Men's")
        db_shoe = shoe_by_brand_model.get(key)
        if not db_shoe:
            for db_key, s in shoe_by_brand_model.items():
                if key in db_key or db_key in key:
                    db_shoe = s
                    break

        if db_shoe:
            stiffnesses.append(get_stiffness(db_shoe))
            for sl in (db_shoe.get("skill_level") or []):
                skill_levels.add(sl)

    return {"stiffnesses": stiffnesses, "skill_levels": skill_levels, "owned_models": owned_models}


# --- Stiffness: read from DB (single source of truth) ---
# The shoes table has a computed_stiffness column (0-1, higher = stiffer).
# It is computed by the website (src/utils/comfort.js computeStiffness())
# and stored in Supabase. The scanner never computes stiffness itself.


def get_stiffness(shoe: dict) -> float:
    """Read pre-computed stiffness from shoe data. Falls back to 0.5 if missing."""
    return shoe.get("computed_stiffness") or 0.5


def _stiffness_distance(stiffness_a: float, stiffness_b: float) -> float:
    """Absolute distance between two stiffness values (0-1 scale)."""
    return abs(stiffness_a - stiffness_b)


_FEEL_ORDER = ["soft", "moderate-soft", "moderate", "stiff-moderate", "stiff"]
_TIER_ORDER = ["hobby", "intermediate", "advanced", "elite"]

def _parse_feel_preference(profile: dict) -> Optional[str]:
    """Extract a feel preference from next_shoe_notes or next_shoe_preference.

    Looks for keywords like 'soft', 'stiff', 'sensitive' (= soft),
    'supportive' / 'edging' (= stiff). Returns the closest _FEEL_ORDER
    value, or None if no feel preference is expressed.
    """
    notes = (profile.get("next_shoe_notes") or "").lower()
    pref = (profile.get("next_shoe_preference") or "").lower()
    text = f"{notes} {pref}"

    # Map keywords to feel values
    if any(w in text for w in ("soft", "sensitive", "smear")):
        return "soft"
    if any(w in text for w in ("stiff", "support", "edging", "rigid")):
        return "stiff"
    if "moderate" in text:
        return "moderate"
    return None


def _user_current_shoe_widths(profile: dict, shoes_db: list) -> dict:
    """Look up the width and heel_volume of the user's current shoes in the DB.

    Returns {
        "widths": set,
        "heel_volumes": set,
        "forefoot_fits": set,
        "heel_fit_signals": list of {"heel_fit": str, "shoe_heel_volume": str},
    }.
    Used to temper width scoring when the user's measured width class
    is borderline but their current shoe width already fits well.
    heel_fit_signals pairs each shoe's user-reported heel fit with
    the shoe's actual heel_volume from the DB, so scoring can reason
    about what heel volume the user actually needs.
    """
    shoe_by_key = {}
    for s in shoes_db:
        key = f"{s['brand']} {s['model']}".lower()
        shoe_by_key[key] = s

    widths = set()
    heel_volumes = set()
    forefoot_fits = set()
    heel_fit_signals = []

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
        if db_shoe:
            widths.add(str(db_shoe.get("width") or ""))
            heel_volumes.add(str(db_shoe.get("heel_volume") or ""))
            # Pair heel fit feedback with the shoe's actual heel_volume
            fit = us.get("fit") or {}
            heel_fit = fit.get("heel", "")
            if heel_fit:
                heel_fit_signals.append({
                    "heel_fit": heel_fit,
                    "shoe_heel_volume": str(db_shoe.get("heel_volume") or ""),
                })
        # Collect forefoot fit ratings from user's shoe assessments
        fit = us.get("fit") or {}
        if fit.get("forefoot"):
            forefoot_fits.add(fit["forefoot"])

    return {
        "widths": widths,
        "heel_volumes": heel_volumes,
        "forefoot_fits": forefoot_fits,
        "heel_fit_signals": heel_fit_signals,
    }


def score_shoe(shoe: dict, profile: dict, user_shoe_profile: dict = None,
               current_shoe_widths: dict = None) -> int:
    """Score a shoe against a foot profile. Higher = better match.

    Scoring priorities:
    1. Fit geometry (heel, width, toe shape) - most important
    2. Preference match (performance/comfort/allround via downturn)
    3. Feel/stiffness match to user's current shoes
    4. Skill level match
    No gender filtering - fit and performance matter, not gender.
    Penalties: shoes user already owns
    """
    score = 0
    w = str(shoe.get("width") or "")
    hv = str(shoe.get("heel_volume") or "")
    fv = str(shoe.get("forefoot_volume") or "")
    dt = str(shoe.get("downturn") or "")
    shoe_feel = str(shoe.get("feel") or "")
    shoe_skills = shoe.get("skill_level") or []

    # Extract toe_form (can be list or string)
    tf_raw = shoe.get("toe_form") or ""
    if isinstance(tf_raw, list):
        tf = tf_raw[0] if tf_raw else ""
    else:
        tf = str(tf_raw)

    user_toe = profile.get("toe_shape", "")
    user_width = profile.get("forefoot_width_class", "")
    user_heel = profile.get("heel_width_class", "")
    user_pref = profile.get("next_shoe_preference", "")

    # Check if user's current shoe width is wider than their measured class
    # and forefoot fit is good. If so, medium-width shoes are proven to work.
    current_widths = current_shoe_widths or {}
    medium_proven = (
        "medium" in current_widths.get("widths", set())
        and "perfect" in current_widths.get("forefoot_fits", set())
    )

    # ── Derive target heel volume from fit feedback (strongest signal) ──
    # If user reports "empty" in a narrow-heel shoe, they need narrow or
    # narrower - NOT medium. If "empty" in medium, they need narrow.
    # If "squeezed" in narrow, they need medium. Etc.
    # This overrides scan-based heel_width_class when feedback exists.
    _HEEL_VOL_ORDER = ["narrow", "low", "medium", "standard", "high", "wide"]

    def _heel_vol_rank(v):
        """Return rank (lower = narrower). Treat synonyms."""
        v = v.lower().strip() if v else ""
        # Normalize synonyms
        if v in ("low", "narrow"):
            return 0
        if v in ("standard", "medium"):
            return 1
        if v in ("high", "wide"):
            return 2
        return 1  # default to medium if unknown

    heel_fit_signals = current_widths.get("heel_fit_signals", [])
    target_heel_rank = None  # None = no fit feedback, use scan-based logic

    for sig in heel_fit_signals:
        shoe_hv_rank = _heel_vol_rank(sig["shoe_heel_volume"])
        if sig["heel_fit"] in ("empty",):
            # Heel is empty - need same or narrower, not wider
            target_heel_rank = shoe_hv_rank  # stay at this level or go narrower
        elif sig["heel_fit"] in ("squeezed", "tight"):
            # Heel is squeezed - need one step wider
            target_heel_rank = shoe_hv_rank + 1
        elif sig["heel_fit"] == "perfect":
            # Perfect - target same volume
            target_heel_rank = shoe_hv_rank

    # ── Priority 1: Fit geometry (up to +10) ──────────────────────────

    # Heel match - use fit-feedback-derived target if available,
    # otherwise fall back to scan-based heel_width_class.
    candidate_hv_rank = _heel_vol_rank(hv)

    if target_heel_rank is not None:
        # Fit feedback is the strongest signal
        dist = candidate_hv_rank - target_heel_rank
        if dist == 0:
            score += 4   # exact match to target
        elif dist == -1:
            score += 2   # one step narrower than target - acceptable
        elif dist == 1:
            score -= 4   # one step wider than what's already empty/tight
        elif dist >= 2:
            score -= 6   # much wider - actively harmful
        else:
            score += 0   # much narrower - unusual but not penalized
    elif "narrow" in user_heel:
        if hv in ("low", "narrow"):
            score += 4
        elif hv in ("standard", "medium"):
            score += 0
        elif hv in ("high", "wide"):
            score -= 3
    elif "wide" in user_heel:
        if hv in ("high", "wide"):
            score += 3
        elif hv in ("standard", "medium"):
            score += 1
    else:
        if hv in ("standard", "medium"):
            score += 2

    # Heel depth scoring - shallow heels don't project backward enough
    # to engage standard heel cups, so narrow heel volume is better.
    user_heel_depth = profile.get("heel_depth_class", "")
    if "shallow" in user_heel_depth:
        if candidate_hv_rank == 0:  # narrow/low
            score += 3  # shallow heel fits better in a tight heel cup
        elif candidate_hv_rank == 1:  # medium/standard
            score -= 1  # standard heel cups will feel loose
        elif candidate_hv_rank >= 2:  # wide/high
            score -= 3  # big heel cup + shallow heel = cavernous

    # Forefoot width match
    # When the user is classified "narrow" but their current medium-width
    # shoe fits perfectly, treat both narrow AND medium as good options.
    # Going all-narrow is risky for borderline users.
    if "narrow" in user_width:
        if medium_proven:
            # Borderline narrow - medium is proven, narrow also good
            if w == "narrow":
                score += 2
            elif w == "medium":
                score += 2  # proven to work - same as narrow
            elif w == "wide":
                score -= 2
        else:
            # Clearly narrow - standard logic
            if w == "narrow":
                score += 3
            elif w == "medium":
                score += 1
            elif w == "wide":
                score -= 2
    elif "wide" in user_width:
        if w == "wide":
            score += 3
        elif w == "medium":
            score += 1
        elif w == "narrow":
            score -= 2
    else:  # normal
        if w == "medium":
            score += 2
        elif w in ("narrow", "wide"):
            score += 1

    # Forefoot volume match
    if "narrow" in user_width:
        if medium_proven:
            # Borderline - don't give extra bonus to low volume
            pass
        elif fv == "low":
            score += 1
    elif "wide" in user_width:
        if fv in ("high", "wide"):
            score += 1

    # Toe form match
    # Greek and Egyptian are fundamentally different shapes - mismatching
    # means the longest toe hits the wrong part of the toe box.
    if user_toe and tf:
        if tf == user_toe:
            score += 3  # exact match
        elif user_toe == "greek" and tf == "egyptian":
            score -= 3  # pointy Egyptian box compresses Greek 2nd toe
        elif user_toe == "egyptian" and tf == "greek":
            score -= 2  # Greek box wastes space at big toe tip
        elif tf == "roman":
            score += 0  # Roman is broadly compatible
    elif tf == "roman":
        score -= 1  # slight penalty when no user toe data

    # ── Priority 2: User preference (up to +3) ───────────────────────

    if user_pref == "performance":
        if dt == "aggressive":
            score += 3
        elif dt == "moderate":
            score += 1
        elif dt == "flat":
            score -= 2
    elif user_pref == "comfort":
        if dt in ("flat", "slight"):
            score += 3
        elif dt == "moderate":
            score += 1
        elif dt == "aggressive":
            score -= 1
    elif user_pref == "allround":
        if dt == "moderate":
            score += 2
        elif dt in ("slight", "aggressive"):
            score += 1

    # ── Priority 3: Stiffness matching (up to +4) ────────────────────
    # Uses computed structural stiffness (0-1) from shoe construction,
    # not the subjective "feel" field. Ported from climbing-gear.com.

    if user_shoe_profile and user_shoe_profile.get("stiffnesses"):
        shoe_stiff = get_stiffness(shoe)
        # Compare to average stiffness of user's current shoes
        user_avg_stiff = sum(user_shoe_profile["stiffnesses"]) / len(user_shoe_profile["stiffnesses"])
        dist = _stiffness_distance(shoe_stiff, user_avg_stiff)
        if dist < 0.05:
            score += 4  # very close stiffness
        elif dist < 0.12:
            score += 2  # similar range
        elif dist < 0.20:
            score += 0  # neutral
        elif dist < 0.30:
            score -= 2  # noticeably different
        else:
            score -= 4  # very different stiffness

    # ── Priority 3b: Feel preference match (up to +3 / down to -3) ────
    # If the user explicitly asked for a feel (soft/stiff/etc), score
    # shoes by how close their feel is. Works both directions.

    user_feel_pref = _parse_feel_preference(profile)
    if user_feel_pref and shoe_feel:
        if user_feel_pref in _FEEL_ORDER and shoe_feel in _FEEL_ORDER:
            pref_idx = _FEEL_ORDER.index(user_feel_pref)
            shoe_idx = _FEEL_ORDER.index(shoe_feel)
            feel_dist = abs(pref_idx - shoe_idx)
            if feel_dist == 0:
                score += 3   # exact match
            elif feel_dist == 1:
                score += 1   # adjacent - acceptable
            elif feel_dist >= 3:
                score -= 3   # opposite end - bad match
            # feel_dist == 2 is neutral (no bonus, no penalty)

    # ── Priority 4: Skill level match (up to +4 / down to -6) ─────────
    # Distance-based: the further a shoe is from the user's tier, the
    # harder the penalty. Works symmetrically - elite user penalized
    # for beginner shoes AND beginner penalized for elite shoes.

    if user_shoe_profile and user_shoe_profile.get("skill_levels") and shoe_skills:
        user_max = max(
            (_TIER_ORDER.index(s)
             for s in user_shoe_profile["skill_levels"]
             if s in _TIER_ORDER),
            default=1,
        )
        shoe_max = max(
            (_TIER_ORDER.index(s)
             for s in shoe_skills
             if s in _TIER_ORDER),
            default=1,
        )
        tier_dist = abs(user_max - shoe_max)
        if tier_dist == 0:
            score += 4   # same tier - strong match
        elif tier_dist == 1:
            score += 1   # adjacent tier - acceptable
        elif tier_dist == 2:
            score -= 4   # two tiers away - bad match
        else:
            score -= 6   # three tiers away - never recommend

    # (No gender scoring - fit and performance matter, not gender)

    # ── Bonus: proven shoes from approved recommendations ────────────
    # Shoes that have been successfully recommended in past approved
    # scans get a small boost. Works for any tier - beginner shoes
    # proven for beginners, elite shoes proven for elite climbers.

    proven = _load_proven_slugs()
    if shoe.get("slug") in proven:
        score += 2

    # ── Penalty: shoes user already owns ─────────────────────────────
    # Use exact match on normalized base model name. Previously used
    # substring matching which incorrectly penalized variants like
    # "Instinct VSR LV" when the user owns "Instinct VSR".

    if user_shoe_profile and user_shoe_profile.get("owned_models"):
        shoe_key = f"{shoe.get('brand', '')} {shoe.get('model', '')}".lower()
        for owned in user_shoe_profile["owned_models"]:
            if owned == shoe_key:
                score -= 10  # hard penalty - never recommend what they already have
                break

    return score


def get_shoe_candidates(profile: dict, top_n: int = 30) -> list:
    """Return top_n shoe candidates scored for this profile.

    Filters out kids shoes, scores by fit geometry/feel/skill, then applies
    a size availability penalty for shoes not stocked in the user's size.
    Returns list of dicts with shoe data + _score.
    """
    shoes = _load_shoes()
    user_shoe_profile = _extract_user_shoe_profile(profile)
    current_shoe_widths = _user_current_shoe_widths(profile, shoes)
    brand_sizing = _load_brand_sizing()
    size_avail = _load_size_availability()

    # Determine user's anchor size and brand for sizing formula
    user_shoes = profile.get("shoes") or []
    anchor_size = None
    anchor_brand = None
    if user_shoes:
        anchor_size = user_shoes[0].get("size_eu")
        anchor_brand = user_shoes[0].get("brand")

    street_size = profile.get("street_size_eu")
    preference = profile.get("next_shoe_preference")

    candidates = []

    for s in shoes:
        # Hard filters (kids only - no gender filter, fit matters not gender)
        if s.get("kids_friendly"):
            continue

        s_copy = dict(s)
        s_copy["_score"] = score_shoe(s, profile, user_shoe_profile, current_shoe_widths)
        s_copy["_computed_stiffness"] = get_stiffness(s)

        # Size availability penalty
        if anchor_size and anchor_brand:
            rec_size = _calc_recommended_size(
                anchor_size, anchor_brand, s["brand"], brand_sizing,
                street_size=street_size, preference=preference
            )
            s_copy["_recommended_size_eu"] = rec_size
            if not _check_size_available(s["slug"], rec_size, size_avail):
                s_copy["_score"] -= 8  # strong penalty: size not in stock
                s_copy["_size_unavailable"] = True

        candidates.append(s_copy)

    candidates.sort(key=lambda x: -x["_score"])

    # Deduplicate: no two shoes from same brand+model base
    seen = set()
    deduped = []
    for c in candidates:
        key = f"{c['brand']}_{c['model']}".lower().replace("women's", "").replace("men's", "").strip()
        if key not in seen:
            seen.add(key)
            deduped.append(c)
        if len(deduped) >= top_n:
            break

    return deduped


def stiffness_label(val: float) -> str:
    """Convert stiffness 0-1 to human-readable label."""
    if val < 0.25:
        return "soft"
    if val < 0.40:
        return "medium-soft"
    if val < 0.55:
        return "balanced"
    if val < 0.70:
        return "medium-supportive"
    return "supportive"


def performance_label(downturn: str) -> str:
    """Convert downturn to performance label."""
    mapping = {
        "flat": "comfortable",
        "slight": "semi-comfortable",
        "moderate": "balanced",
        "aggressive": "semi-aggressive",
        "extreme": "aggressive",
    }
    return mapping.get(downturn, "balanced")


def get_categorized_candidates(profile: dict) -> dict:
    """Return top 50 shoe candidates for the LLM to pick from freely.

    No pre-categorization - Sonnet decides which shoes go into which
    category (baseline/softer/stiffer/budget) based on stiffness distance
    and price. We just provide the data it needs to make those decisions.

    Returns dict with:
    - categories: {all: [...]}  (flat list of all candidates)
    - user_avg_stiffness: float
    - user_stiffness_label: str
    - user_performance_label: str
    """
    all_candidates = get_shoe_candidates(profile, top_n=50)
    best_prices = _load_best_prices()
    user_shoe_profile = _extract_user_shoe_profile(profile)

    # Compute user's baseline stiffness
    avg_stiffness = 0.5  # default if no shoe data
    if user_shoe_profile.get("stiffnesses"):
        avg_stiffness = sum(user_shoe_profile["stiffnesses"]) / len(user_shoe_profile["stiffnesses"])

    # Compute user's average performance level from their shoes
    shoes_db = _load_shoes()
    shoe_by_key = {}
    for s in shoes_db:
        key = f"{s['brand']} {s['model']}".lower()
        shoe_by_key[key] = s

    user_downturns = []
    for us in profile.get("shoes") or []:
        key = f"{us.get('brand', '')} {us.get('model', '')}".lower()
        db_shoe = shoe_by_key.get(key)
        if not db_shoe:
            for db_key, s in shoe_by_key.items():
                if key in db_key or db_key in key:
                    db_shoe = s
                    break
        if db_shoe and db_shoe.get("downturn"):
            user_downturns.append(db_shoe["downturn"])

    avg_perf_label = "balanced"
    if user_downturns:
        dt_scores = {"flat": 0, "slight": 1, "moderate": 2, "aggressive": 3, "extreme": 4}
        avg_dt = sum(dt_scores.get(d, 2) for d in user_downturns) / len(user_downturns)
        if avg_dt < 0.75:
            avg_perf_label = "comfortable"
        elif avg_dt < 1.5:
            avg_perf_label = "semi-comfortable"
        elif avg_dt < 2.5:
            avg_perf_label = "balanced"
        elif avg_dt < 3.5:
            avg_perf_label = "semi-aggressive"
        else:
            avg_perf_label = "aggressive"

    # Attach best price for the recommended size to each candidate
    for c in all_candidates:
        rec_size = c.get("_recommended_size_eu")
        if rec_size is not None:
            c["_best_price_eur"] = _get_best_price_for_size(c["slug"], rec_size, best_prices)
        else:
            c["_best_price_eur"] = None

    n_priced = sum(1 for c in all_candidates if c.get("_best_price_eur") is not None)
    print(f"[scan_recommender] Sending {len(all_candidates)} candidates to Sonnet "
          f"({n_priced} with prices, avg stiffness {avg_stiffness:.3f})")

    return {
        "categories": {
            "all": all_candidates,
        },
        "user_avg_stiffness": round(avg_stiffness, 3),
        "user_stiffness_label": stiffness_label(avg_stiffness),
        "user_performance_label": avg_perf_label,
    }


def verify_slug(slug: str) -> bool:
    """Verify a shoe slug exists in the DB. Uses cached shoes."""
    shoes = _load_shoes()
    return any(s["slug"] == slug for s in shoes)


def fetch_scan_data(scan_id: str) -> Optional[dict]:
    """Fetch the foot_scan_fits row for a scan_id."""
    resp = requests.get(
        f"{SB_URL}/rest/v1/foot_scan_fits",
        headers=HEADERS,
        params={"scan_id": f"eq.{scan_id}", "select": "*"},
    )
    resp.raise_for_status()
    rows = resp.json()
    return rows[0] if rows else None


def update_scan(scan_id: str, data: dict) -> dict:
    """Upsert the foot_scan_fits row for a scan_id.

    Tries PATCH first (row exists from shoe-fit questionnaire).
    If PATCH returns empty (no row matched), falls back to INSERT.
    """
    resp = requests.patch(
        f"{SB_URL}/rest/v1/foot_scan_fits",
        headers={**HEADERS, "Content-Type": "application/json", "Prefer": "return=representation"},
        params={"scan_id": f"eq.{scan_id}"},
        json=data,
    )
    resp.raise_for_status()
    rows = resp.json()
    if rows:
        return rows[0]

    # No existing row - INSERT instead
    print(f"[scan_recommender] No existing row for {scan_id}, inserting new row")
    insert_data = {**data, "scan_id": scan_id}
    resp = requests.post(
        f"{SB_URL}/rest/v1/foot_scan_fits",
        headers={**HEADERS, "Content-Type": "application/json", "Prefer": "return=representation"},
        json=insert_data,
    )
    resp.raise_for_status()
    rows = resp.json()
    return rows[0] if rows else {}


def upload_overlay(scan_id: str, suffix: str, file_path: str):
    """Upload an overlay PNG to Supabase storage."""
    filename = f"{scan_id}-{suffix}"
    with open(file_path, "rb") as f:
        resp = requests.post(
            f"{SB_URL}/storage/v1/object/foot-scans/scans/{filename}",
            headers={"Authorization": f"Bearer {SB_KEY}", "Content-Type": "image/png", "x-upsert": "true"},
            data=f.read(),
        )
    resp.raise_for_status()
    return resp.json()
