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
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2MDc5MSwiZXhwIjoyMDg2MTM2NzkxfQ.6cYE1ElsvX7-BTc1DD15zoPJyr4L3bN0_QyKRQmp3M4")

HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}

# --- Knowledge Base (baked in from Fit_Knowledge_Base.xlsx) ---

INSIGHTS = [
    {
        "id": 1,
        "title": "Phantom Toe Squeeze (Long Arch + Narrow Forefoot)",
        "trigger": {"arch_length_ratio": ">=0.735", "forefoot_width_ratio": "<0.362"},
        "insight": "When the arch ratio is high and the forefoot is narrow, the ball of the foot sits far back, leaving a long but narrow toe zone. Shoes with compact toe boxes crush the toes even though the foot IS narrow.",
        "consequence": "Recommend shoes with shorter, more compact toe boxes or downturn designs that curve naturally into the toe zone. Avoid very aggressive toe boxes built for short toes.",
    },
    {
        "id": 2,
        "title": "LV Shoes Fail with Narrow Forefoot + High Instep",
        "trigger": {"instep_height_ratio": ">=0.280", "forefoot_width_ratio": "<0.362"},
        "insight": "A narrow forefoot with a high instep creates a foot that is slim from the front but tall through the midfoot. LV shoes compress the midfoot painfully.",
        "consequence": "Recommend closure systems (laces or dual Velcro) that can cinch width independently of volume. Avoid pure LV models without adjustable closure.",
    },
    {
        "id": 3,
        "title": "Normal Width + High Instep -> LV is Wrong",
        "trigger": {"instep_height_ratio": ">=0.280", "forefoot_width_ratio": "0.362-0.404"},
        "insight": "When forefoot width is normal but instep is high, LV models compress the forefoot too much. The foot needs standard volume with adjustable closures.",
        "consequence": "Recommend standard-volume shoes with adjustable closures. Do not recommend LV.",
    },
    {
        "id": 4,
        "title": "Greek Toe + Narrow Heel = Hardest Fit",
        "trigger": {"toe_shape": "greek", "heel_width_ratio": "<0.233"},
        "insight": "Most shoes with narrow heels also have narrow, pointed toe boxes optimised for Egyptian toes. Greek toes need width at the second toe but narrowness everywhere else.",
        "consequence": "Recommend from the short list of narrow heel + Greek-compatible shoes: Unparallel Flagship, Regulus, La Sportiva Skwama, Mad Rock D2.ONE HV, Tenaya Oasi.",
    },
    {
        "id": 5,
        "title": "Wide Heel + Shallow Depth -> Narrow Cup Fits Well",
        "trigger": {"heel_depth_ratio": "<0.045", "heel_width_ratio": ">=0.269"},
        "insight": "A heel that is proportionally wide but very shallow in depth doesn't protrude much backward. Narrow heel cups still fit because the heel lacks the backward projection that creates slippage.",
        "consequence": "Don't rule out narrow heel cups just because heel width is classified as 'wide'. Shallow heels are forgiving.",
    },
    {
        "id": 6,
        "title": "Shallow Heel Profile -> Empty Heel in Standard Shoes",
        "trigger": {"heel_depth_ratio": "<0.035"},
        "insight": "When heel depth ratio is very low, the heel doesn't project backward enough to engage the heel cup. Standard shoes will feel empty.",
        "consequence": "Recommend shoes with sculpted, three-dimensional heel pockets (e.g. La Sportiva Miura, Solution). Avoid flat heel designs.",
    },
    {
        "id": 7,
        "title": "High Instep -> Aggressive Downturn is Comfortable",
        "trigger": {"instep_height_ratio": ">=0.290"},
        "insight": "A high arch/instep naturally conforms to a downturned last. The foot's shape already matches the curve.",
        "consequence": "Note that aggressive shoes may be more comfortable than expected. Lace closure is ideal for fine-tuning over the instep.",
    },
    {
        "id": 8,
        "title": "Low Instep + Narrow Forefoot = Ideal LV Candidate",
        "trigger": {"instep_height_ratio": "<0.250", "forefoot_width_ratio": "<0.362"},
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
                      "midsole,rand,rubber_thickness_mm,upper_material,no_edge,"
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
    """Get the cheapest price for a shoe in the recommended size (+/- 0.5).

    Returns None if no price found for that size range.
    """
    slug_prices = prices.get(slug)
    if not slug_prices:
        return None
    best = None
    for offset in (0, 0.5, -0.5):
        sz = round(recommended_size + offset, 1)
        p = slug_prices.get(sz)
        if p is not None and (best is None or p < best):
            best = p
    return best


def _calc_recommended_size(user_anchor_size: float, anchor_brand: str,
                           target_brand: str, brand_sizing: dict) -> float:
    """Calculate recommended EU size using the sizing formula.

    recommended_size = anchor_size + (anchor_downsize - target_downsize)
    """
    anchor_ds = brand_sizing.get(anchor_brand, 1.0)
    target_ds = brand_sizing.get(target_brand, 1.0)
    return round(user_anchor_size + (anchor_ds - target_ds), 1)


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

    Returns {"widths": set, "heel_volumes": set, "forefoot_fits": set}.
    Used to temper width scoring when the user's measured width class
    is borderline but their current shoe width already fits well.
    """
    shoe_by_key = {}
    for s in shoes_db:
        key = f"{s['brand']} {s['model']}".lower()
        shoe_by_key[key] = s

    widths = set()
    heel_volumes = set()
    forefoot_fits = set()

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
        # Collect forefoot fit ratings from user's shoe assessments
        fit = us.get("fit") or {}
        if fit.get("forefoot"):
            forefoot_fits.add(fit["forefoot"])

    return {"widths": widths, "heel_volumes": heel_volumes, "forefoot_fits": forefoot_fits}


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

    # Check if user has an explicit heel fit problem (empty or squeezed)
    # from their current shoe data. If so, heel match is critical.
    heel_problem = False
    for us in profile.get("shoes") or []:
        heel_fit = (us.get("fit") or {}).get("heel", "")
        if heel_fit in ("empty", "squeezed", "tight"):
            heel_problem = True
            break

    # ── Priority 1: Fit geometry (up to +10) ──────────────────────────

    # Heel match (most important for narrow-heel users)
    if "narrow" in user_heel:
        if hv in ("low", "narrow"):
            score += 4  # strong match
        elif hv in ("standard", "medium"):
            # If user has an explicit heel problem (empty/squeezed),
            # medium heel is NOT neutral - it won't fix the issue.
            score += -3 if heel_problem else 0
        elif hv in ("high", "wide"):
            score -= 3  # actively bad
    elif "wide" in user_heel:
        if hv in ("high", "wide"):
            score += 3
        elif hv in ("standard", "medium"):
            score += 1
    else:
        if hv in ("standard", "medium"):
            score += 2

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
    if user_toe and tf == user_toe:
        score += 2
    elif tf == "roman":
        score -= 1

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
                anchor_size, anchor_brand, s["brand"], brand_sizing
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
    """Return shoe candidates organized into 4 categories for the LLM.

    Categories (3 shoes each, 12 total):
    - baseline: similar stiffness to user's current shoe average
    - softer: noticeably softer than current average
    - stiffer: noticeably stiffer than current average
    - budget: cheapest available options that still address fit issues

    All candidates must address the user's fit issues (priority 1).
    Within each category, shoes are sorted by overall score.

    Returns dict with:
    - categories: {baseline: [...], softer: [...], stiffer: [...], budget: [...]}
    - user_avg_stiffness: float
    - user_stiffness_label: str
    - user_performance_label: str
    """
    # Get a broad pool of fit-scored candidates (top 50 for more category coverage)
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

    # Minimum fit score threshold: only consider candidates with positive fit scores
    # (we want all 9 shoes to actually address fit issues)
    MIN_SCORE = 0
    fit_candidates = [c for c in all_candidates if c["_score"] >= MIN_SCORE]

    # If too few candidates pass the threshold, relax it
    if len(fit_candidates) < 15:
        fit_candidates = all_candidates[:30]

    # Attach best price for the recommended size to each candidate
    for c in fit_candidates:
        rec_size = c.get("_recommended_size_eu")
        if rec_size is not None:
            c["_best_price_eur"] = _get_best_price_for_size(c["slug"], rec_size, best_prices)
        else:
            c["_best_price_eur"] = None

    # Classify by stiffness distance from user average
    STIFF_NEAR = 0.08   # within this = baseline
    STIFF_FAR = 0.08    # beyond this = softer/stiffer

    baseline = []
    softer = []
    stiffer = []

    for c in fit_candidates:
        cs = c["_computed_stiffness"]
        diff = cs - avg_stiffness
        if abs(diff) <= STIFF_NEAR:
            baseline.append(c)
        elif diff < -STIFF_FAR:
            softer.append(c)
        elif diff > STIFF_FAR:
            stiffer.append(c)

    # Budget: fit candidates sorted by price, with guardrails:
    # 1. Stiffness: max 0.25 distance from user average
    # 2. Minimum score threshold (75% of weakest baseline pick)
    # 3. Hard heel constraint: if user has empty/squeezed heel, budget
    #    shoes MUST have matching heel volume - cheap shoes that don't
    #    fix the primary issue are useless recommendations.
    BUDGET_STIFF_MAX_DIST = 0.25
    baseline_scores = [c["_score"] for c in baseline] if baseline else [0]
    budget_min_score = max(5, min(baseline_scores) * 3 // 4)

    # Determine hard heel constraint from user's shoe fit data
    user_heel_problem = None  # None = no constraint
    for us in profile.get("shoes") or []:
        heel_fit = (us.get("fit") or {}).get("heel", "")
        if heel_fit in ("empty", "squeezed", "tight"):
            user_heel_problem = heel_fit
            break

    def _budget_heel_ok(candidate: dict) -> bool:
        """Check if a budget candidate's heel volume addresses the user's heel problem."""
        if user_heel_problem is None:
            return True  # no heel problem = no constraint
        hv = str(candidate.get("heel_volume") or "")
        user_heel = profile.get("heel_width_class", "")
        if "narrow" in user_heel and user_heel_problem == "empty":
            # User needs narrow heel - medium/wide won't fix it
            return hv in ("low", "narrow")
        if "wide" in user_heel and user_heel_problem in ("squeezed", "tight"):
            return hv in ("high", "wide")
        return True

    priced = [
        c for c in fit_candidates
        if c.get("_best_price_eur") is not None
        and abs(c["_computed_stiffness"] - avg_stiffness) <= BUDGET_STIFF_MAX_DIST
        and c["_score"] >= budget_min_score
        and _budget_heel_ok(c)
    ]
    priced.sort(key=lambda x: x["_best_price_eur"])

    # Pick top N from each category, ensuring no slug overlap
    used_slugs = set()

    def pick(pool, n):
        picked = []
        for c in pool:
            if c["slug"] not in used_slugs:
                picked.append(c)
                used_slugs.add(c["slug"])
                if len(picked) >= n:
                    break
        return picked

    # Pick 3 per category (12 total). Baseline first, then softer/stiffer, then budget.
    baseline_picks = pick(baseline, 3)
    softer_picks = pick(softer, 3)
    stiffer_picks = pick(stiffer, 3)
    budget_picks = pick(priced, 3)

    # If any category is underfilled, don't force it - return what we have
    total = len(baseline_picks) + len(softer_picks) + len(stiffer_picks) + len(budget_picks)
    print(f"[scan_recommender] Categorized: {len(baseline_picks)} baseline, "
          f"{len(softer_picks)} softer, {len(stiffer_picks)} stiffer, "
          f"{len(budget_picks)} budget = {total} total")

    return {
        "categories": {
            "baseline": baseline_picks,
            "softer": softer_picks,
            "stiffer": stiffer_picks,
            "budget": budget_picks,
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
