#!/usr/bin/env python3
"""
bergzeit.de crawler → per-category Supabase price tables.

bergzeit uses a Vue.js SPA with server-rendered initial state.
Product data is embedded in window.__initialAppState → productsListPage.elementsList
as JSON. Pagination is via ?p=2, ?p=3, etc. (48 products per page).

Usage:
    python3 crawl_bergzeit.py              # crawl all categories
    python3 crawl_bergzeit.py shoes        # crawl one category
    python3 crawl_bergzeit.py shoes ropes  # crawl multiple
"""

import sys, re, json, time, urllib.request, urllib.parse, html as htmlmod
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

# ── Config ──────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2MDc5MSwiZXhwIjoyMDg2MTM2NzkxfQ.6cYE1ElsvX7-BTc1DD15zoPJyr4L3bN0_QyKRQmp3M4"
ANON_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjA3OTEsImV4cCI6MjA4NjEzNjc5MX0.QH3wFa14gSvRKOz8Q099sbKvKoSroGJfPerdZgPtbTI"

RETAILER = "bergzeit.de"
COUNTRY  = "DE"
BASE_URL = "https://www.bergzeit.de"

# Category suffixes that bergzeit appends to product names
CATEGORY_SUFFIXES = [
    'kletterschuhe', 'kletterschuh', 'climbing schuhe', 'schuhe',
    'kletterseil', 'kletterseile',
    'crashpad', 'boulderpad', 'bouldermatte',
    'expressset', 'expressen', 'express-set', 'express set',
    'quickdraw expressen', 'quickdraw', 'expresse',
    'kletterhelm', 'kletterhelme', 'klettergurt', 'klettergurte',
    'klettersteigset', 'sicherungsgerät', 'sicherungsgeraet',
]

# Products to EXCLUDE from ropes category (not actual ropes)
ROPE_EXCLUDE_KEYWORDS = [
    'schlinge', 'sling', 'runner', 'bandschlinge', 'schlauchband',
    'reepschnur', 'cord', 'prusik', 'leash', 'connect', 'adjust',
    'seilsack', 'rope bag', 'burrito', 'seilrolle', 'pulley', 'tandem',
    'rope clean', 'rope brush', 'rope mark', 'rope end', 'seilklemme',
    'schlingenset', 'tape', 'standplatz', 'seilschutz',
]

# Products to EXCLUDE from belay category
BELAY_EXCLUDE_KEYWORDS = [
    'steigklemme', 'ascender', 'tibloc', 'bloquer', 'pantin',
    'fußsteigklemme', 'fusssteigklemme',
    'nutbuster', 'nut tool', 'nut set',
    'dragon cam', 'dragonfly', 'micro cam', 'friend',
    'stopperset', 'wallnut', 'peenut', 'alloy offset', 'torque nut',
    'seilrolle', 'pulley', 'traxion',
    'ropeman', 'betastick', 'längenversteller',
    'klemmkeil', 'nut', 'cam', 'klettersteig',
    'prusik', 'reepschnur', 'bandschlinge',
]

# Products to EXCLUDE from quickdraws/express-sets (usually all express sets, but filter anyway)
QUICKDRAW_EXCLUDE_KEYWORDS = [
    'schraubglied', 'materialkarabiner', 'accessory carabiner',
    'betastick', 'tape', 'chalk', 'sling',
]

CATEGORIES = {
    "shoes": {
        "paths": ["/schuhe/kletterschuhe/"],
        "price_table": "shoe_prices",
        "ref_table": "shoes",
        "exclude_keywords": ['sock', 'socks', 'schuhbeutel', 'shoe bag',
                             'zubehör', 'resoling', 'besohlung'],
    },
    "ropes": {
        "paths": ["/ausruestung/kletterausruestung-boulderausruestung/kletterseile/"],
        "price_table": "rope_prices",
        "ref_table": "ropes",
        "exclude_keywords": ROPE_EXCLUDE_KEYWORDS,
    },
    "crashpads": {
        "paths": ["/ausruestung/kletterausruestung-boulderausruestung/crashpads-bouldermatten/"],
        "price_table": "crashpad_prices",
        "ref_table": "crashpads",
        "exclude_keywords": ['chalk', 'tape', 'bürste', 'brush', 'buch', 'book'],
    },
    "belays": {
        "paths": ["/ausruestung/kletterausruestung-boulderausruestung/sicherungsgeraete/"],
        "price_table": "belay_prices",
        "ref_table": "belay_devices",
        "exclude_keywords": BELAY_EXCLUDE_KEYWORDS,
    },
    "quickdraws": {
        "paths": ["/ausruestung/kletterausruestung-boulderausruestung/express-sets/"],
        "price_table": "quickdraw_prices",
        "ref_table": "quickdraws",
        "exclude_keywords": QUICKDRAW_EXCLUDE_KEYWORDS,
    },
    "helmets": {
        "paths": ["/ausruestung/kletterausruestung-boulderausruestung/kletterhelme/"],
        "price_table": "helmet_prices",
        "ref_table": None,
        "exclude_keywords": [],
    },
    "harnesses": {
        "paths": ["/ausruestung/kletterausruestung-boulderausruestung/klettergurte/"],
        "price_table": "harness_prices",
        "ref_table": None,
        "exclude_keywords": [],
    },
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


# ── HTTP helpers ────────────────────────────────────────────────────────────

def extract_rope_specs(text):
    """Extract diameter_mm and length_m from product name/model string."""
    diameter, length = None, None
    dm = re.search(r'(\d{1,2}[.,]\d)\s*(?:mm)?\b', text or "")
    if dm:
        d = float(dm.group(1).replace(',', '.'))
        if 5.0 <= d <= 13.0:
            diameter = d
    lm = re.search(r'\b(\d{2,3})[\s-]*m\b', text or "")
    if lm:
        l = int(lm.group(1))
        if 15 <= l <= 200:
            length = l
    return diameter, length


def _create_browser():
    """Create a stealth Playwright browser for bergzeit (Python 3.9 SSL can't connect)."""
    pw = sync_playwright().start()
    browser = pw.chromium.launch(
        headless=True,
        args=['--disable-blink-features=AutomationControlled'],
    )
    ctx = browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        locale="de-DE", timezone_id="Europe/Berlin",
    )
    ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
    return pw, browser, ctx


# Global browser instance (initialized on first use, shared across all fetches)
_pw_instance = None
_browser_instance = None
_browser_ctx = None
_browser_page = None


def _get_browser_page():
    """Get or create a shared Playwright page for fetching."""
    global _pw_instance, _browser_instance, _browser_ctx, _browser_page
    if _browser_page is None:
        _pw_instance, _browser_instance, _browser_ctx = _create_browser()
        _browser_page = _browser_ctx.new_page()
        _browser_page.set_default_timeout(20000)
    return _browser_page


def _close_browser():
    """Close the shared browser."""
    global _pw_instance, _browser_instance, _browser_ctx, _browser_page
    if _browser_instance:
        _browser_instance.close()
    if _pw_instance:
        _pw_instance.stop()
    _pw_instance = _browser_instance = _browser_ctx = _browser_page = None


def fetch_html(url):
    """Fetch a URL via Playwright and return HTML string."""
    page = _get_browser_page()
    page.goto(url, wait_until='domcontentloaded', timeout=20000)
    return page.content()


def supabase_get(table, params=""):
    """GET from Supabase REST API (anon read)."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers={
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {ANON_KEY}",
    })
    resp = urllib.request.urlopen(req, timeout=15)
    return json.loads(resp.read().decode())


def supabase_upsert(table, rows):
    """POST upsert to Supabase REST API (service_role write)."""
    if not rows:
        return 0
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict=retailer,product_url"
    data = json.dumps(rows).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    })
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return len(rows)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  ✗ Upsert error ({e.code}): {body[:300]}")
        return 0


def supabase_delete(table, retailer):
    """DELETE all rows for a given retailer from a Supabase table."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?retailer=eq.{urllib.parse.quote(retailer)}"
    req = urllib.request.Request(url, method="DELETE", headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Prefer": "return=minimal",
    })
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return True
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  ✗ Delete error ({e.code}): {body[:300]}")
        return False


# ── Reference table loader ──────────────────────────────────────────────────
def load_reference_slugs(ref_table):
    """Load all slugs + brand + model from a reference table for matching."""
    if not ref_table:
        return {}
    rows = supabase_get(ref_table, "select=slug,brand,model&limit=1000")
    lookup = {}
    for r in rows:
        slug = r["slug"]
        brand = (r.get("brand") or "").lower().strip()
        model = (r.get("model") or "").lower().strip()
        if brand and model:
            lookup[(brand, model)] = slug
            # Apostrophe-stripped
            norm_model = re.sub(r"[''`]", "", model)
            norm_model = re.sub(r"\s+", " ", norm_model).strip()
            lookup[(brand, norm_model)] = slug
            # Plus-normalized (GriGri+ → grigri plus)
            plus_model = re.sub(r"\+", " plus", model)
            plus_model = re.sub(r"\s+", " ", plus_model).strip()
            if plus_model != model:
                lookup[(brand, plus_model)] = slug
            # Hyphen-to-space variant (ATC-Guide → atc guide)
            if "-" in model:
                hyphen_model = model.replace("-", " ")
                hyphen_model = re.sub(r"\s+", " ", hyphen_model).strip()
                lookup[(brand, hyphen_model)] = slug
                hyphen_norm = re.sub(r"[''`]", "", hyphen_model)
                hyphen_norm = re.sub(r"\s+", " ", hyphen_norm).strip()
                lookup[(brand, hyphen_norm)] = slug
    return lookup


# ── Slug matching ───────────────────────────────────────────────────────────
def normalize(s):
    """Lowercase, strip, remove special chars, decode HTML entities."""
    s = htmlmod.unescape(s)
    s = s.lower().strip()
    s = re.sub(r"[''`]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s


def detect_gender(model_str):
    """Detect if a product name indicates women's or men's."""
    m = model_str.lower()
    if re.search(r"\b(women'?s?|w'?s|damen|lady|female|wmn)\b", m):
        return "womens"
    if re.search(r"\b(men'?s?|herren|man|male)\b", m):
        return "mens"
    return None


def strip_category_suffix(name):
    """Strip bergzeit category suffixes from product names.

    bergzeit appends the category to every product name:
    'Furia Air Kletterschuhe' → 'Furia Air'
    'Hotforge Hybrid Expressset 12 cm 6er Pack' → 'Hotforge Hybrid'
    """
    m = name
    for suffix in CATEGORY_SUFFIXES:
        m = re.sub(r'\s+' + re.escape(suffix) + r'\b.*$', '', m, flags=re.I)
    # Also strip trailing pack sizes like "6er Pack", "5er Pack", "12 cm 6er Pack"
    m = re.sub(r'\s+\d+\s*er\s+pack\b.*$', '', m, flags=re.I)
    # Strip trailing length specs like "12 cm", "17cm"
    m = re.sub(r'\s+\d+\s*cm\b.*$', '', m, flags=re.I)
    # Strip trailing length specs like "50m", "60m", "70m" (rope lengths)
    m = re.sub(r'\s+\d+m\b.*$', '', m, flags=re.I)
    return m.strip()


def normalize_model_name(model_str):
    """Apply product-name normalization rules for German retailers."""
    m = model_str
    # Strip German category prefixes
    m = re.sub(r"^(seil|kletterseil|kletterschuh|kletter|expressset|expressschlinge|karabiner|hms)\s+",
               "", m, flags=re.I).strip()
    # Replace hyphens with spaces
    m = m.replace("-", " ")
    m = re.sub(r"\s+", " ", m).strip()
    # Convert comma decimals to dots
    m = re.sub(r'(\d),(\d)', r'\1.\2', m)
    # Strip "mm" suffix
    m = re.sub(r'(\d)mm\b', r'\1', m)
    # Convert Roman numerals
    roman_map = {'vi': '6', 'iv': '4', 'iii': '3', 'ii': '2'}
    for roman, arabic in roman_map.items():
        m = re.sub(r'\b' + roman + r'\b', arabic, m, flags=re.I)
    # Normalize common plural/variant forms
    m = re.sub(r'\blaces\b', 'lace', m, flags=re.I)
    # Strip trailing descriptors
    m = re.sub(r'\s+(quickdraw|quickpack|belay device|assorted)\b.*$', '', m, flags=re.I).strip()
    m = re.sub(r'\s+\d+\s*cm\s*$', '', m).strip()
    m = re.sub(r'\s+2r\b', '', m, flags=re.I).strip()
    m = re.sub(r'\b(\d+)\.0\b', r'\1', m)
    # Strip "Crash Pad" / "Crashpad" suffix
    m = re.sub(r'\s+Crash\s*Pad\s*$', '', m, flags=re.I).strip()
    # Strip trailing "Pad" suffix (e.g., "Duo Pad" → "Duo", "Sundance Pad" → "Sundance")
    m = re.sub(r'\s+Pad\s*$', '', m, flags=re.I).strip()
    # Strip trailing "Pad" suffix (e.g., "Duo Pad" → "Duo", "Sundance Pad" → "Sundance")
    m = re.sub(r's+Pads*$', '', m, flags=re.I).strip()
    # Strip trailing color words commonly found in crashpad names
    m = re.sub(r'\s+(?:Lagoon|Envy|Rust\s+Orange|Pewter|Dark|Black|Green|Blue|Red|White|Grey|Gray|Orange|Yellow|Purple|Pink|Brown|Turquoise|Teal)\s*$', '', m, flags=re.I).strip()
    return m


def try_word_order_variants(brand, model, ref_lookup):
    """Try word order permutations for matching."""
    words = model.split()
    if len(words) < 2:
        return None
    variant = " ".join([words[1], words[0]] + words[2:])
    if (brand, variant) in ref_lookup:
        return ref_lookup[(brand, variant)], 0.9
    if len(words) == 3:
        from itertools import permutations
        for perm in permutations(words):
            v = " ".join(perm)
            if v != model and (brand, v) in ref_lookup:
                return ref_lookup[(brand, v)], 0.9
    if len(words) == 4:
        v2 = " ".join([words[0], words[2], words[1], words[3]])
        if (brand, v2) in ref_lookup:
            return ref_lookup[(brand, v2)], 0.9
        v3 = " ".join([words[0], words[1], words[3], words[2]])
        if (brand, v3) in ref_lookup:
            return ref_lookup[(brand, v3)], 0.9
    return None


def match_slug(brand, model, ref_lookup):
    """Try to match a crawled product to a reference slug.

    Uses the same multi-strategy matching as crawl_tapir.py:
    1. Exact (brand, model) → 1.0
    2. Gender-aware → 0.95
    3. Base model (no gender) → 0.9
    4. Normalized model → 0.9
    5. Word order reversal → 0.9
    6. Slug-based guessing → 0.85
    6b. Without trailing version → 0.85
    7. Subset match → 0.85
    8. Fuzzy word overlap → 0.55-0.7
    """
    if not ref_lookup:
        return None, 0.0

    b = normalize(brand)
    m = normalize(model)

    # Brand normalization
    brand_map = {
        "c.a.m.p.": "camp",
        "ocún": "ocun",
        "ocun": "ocun",
        "climbing technology": "climbing technology",
        "adidas five ten": "five ten",
        "adidas": "five ten",  # bergzeit sometimes uses just "adidas" for Five Ten
        "moon climbing": "moon",
    }
    b = brand_map.get(b, b)

    # Normalize "+" to "plus"
    m_plus = re.sub(r'\s*\+\s*$', ' plus', m).strip()
    m_plus = re.sub(r'\s*\+\s*', ' plus ', m_plus).strip()

    # Ocun crashpads: try both with and without "Paddy" prefix
    paddy_variants = []
    if b == "ocun":
        m_nopad = re.sub(r"\s+pad\s*$", "", m).strip()
        for base in sorted(set([m, m_nopad])):
            if base.startswith("paddy "):
                paddy_variants.append(base[6:])  # without paddy
            else:
                paddy_variants.append("paddy " + base)  # with paddy

    # 1. Exact match
    for try_m in [m, m_plus] + paddy_variants:
        if (b, try_m) in ref_lookup:
            return ref_lookup[(b, try_m)], 1.0

    # Gender detection
    gender = detect_gender(m)
    # Strip gender words from END (English style: "Katana Women's")
    m_clean = re.sub(r"\s*(women'?s?|w'?s|damen|herren|men'?s?|lady|man|wmn|female|male)\s*$", "", m).strip()
    # Strip gender words from START (German style: "Damen Katana", "Herren Miura VS")
    m_clean = re.sub(r"^(damen|herren|kinder)\s+", "", m_clean).strip()

    # 2. Gender-aware matching
    if gender == "womens":
        for suffix in ["women's", "womens", "woman"]:
            if (b, f"{m_clean} {suffix}") in ref_lookup:
                return ref_lookup[(b, f"{m_clean} {suffix}")], 0.95
    elif gender == "mens":
        for suffix in ["men's", "mens"]:
            if (b, f"{m_clean} {suffix}") in ref_lookup:
                return ref_lookup[(b, f"{m_clean} {suffix}")], 0.95

    # 3. Base model
    if m_clean != m and (b, m_clean) in ref_lookup:
        base_slug = ref_lookup[(b, m_clean)]
        if gender == "womens":
            for (rb, rm), rs in ref_lookup.items():
                if rb == b and m_clean in rm and ("women" in rm or "woman" in rm):
                    return rs, 0.95
        return base_slug, 0.9

    # 4. Normalize model name
    m_norm = normalize_model_name(m_clean).lower().strip()
    m_norm = re.sub(r"\s+", " ", m_norm)
    if m_norm != m_clean:
        # Gender-aware FIRST (higher priority than base)
        if gender == "womens":
            for suffix in ["women's", "womens", "woman"]:
                if (b, f"{m_norm} {suffix}") in ref_lookup:
                    return ref_lookup[(b, f"{m_norm} {suffix}")], 0.9
        elif gender == "mens":
            for suffix in ["men's", "mens"]:
                if (b, f"{m_norm} {suffix}") in ref_lookup:
                    return ref_lookup[(b, f"{m_norm} {suffix}")], 0.9
        if (b, m_norm) in ref_lookup:
            slug = ref_lookup[(b, m_norm)]
            # For gendered products, prefer gendered ref if base maps to specific gender
            if gender == "womens":
                for (rb, rm), rs in ref_lookup.items():
                    if rb == b and m_norm in rm and ("women" in rm or "woman" in rm):
                        return rs, 0.9
            return slug, 0.9

    # 5. Word order reversal
    for base in [m_norm, m_clean]:
        result = try_word_order_variants(b, base, ref_lookup)
        if result:
            return result

    # Plus-normalized + model-normalized
    m_norm_plus = normalize_model_name(m_plus).lower().strip()
    m_norm_plus = re.sub(r"\s+", " ", m_norm_plus)
    if m_norm_plus != m_norm and (b, m_norm_plus) in ref_lookup:
        return ref_lookup[(b, m_norm_plus)], 0.9

    # 6. Slug-based guessing
    for base in [m_norm, m_clean]:
        slug_guess = f"{b}-{base}".replace(" ", "-")
        slug_guess = re.sub(r"[^a-z0-9.-]", "", slug_guess)
        slug_guess_nodot = slug_guess.replace(".", "-")
        for ref_slug in set(ref_lookup.values()):
            if ref_slug == slug_guess or ref_slug == slug_guess_nodot:
                return ref_slug, 0.85
            if gender == "womens" and (ref_slug == f"{slug_guess}-womens" or ref_slug == f"{slug_guess_nodot}-womens"):
                return ref_slug, 0.85
            if gender == "mens" and (ref_slug == f"{slug_guess}-mens" or ref_slug == f"{slug_guess_nodot}-mens"):
                return ref_slug, 0.85
            if not gender:
                if ref_slug == f"{slug_guess}-mens" or ref_slug == f"{slug_guess_nodot}-mens":
                    return ref_slug, 0.8

    # 6b. Without trailing version numbers
    m_no_version = re.sub(r'\s+\d+$', '', m_norm).strip()
    if m_no_version != m_norm and (b, m_no_version) in ref_lookup:
        return ref_lookup[(b, m_no_version)], 0.85

    # 7. Subset match
    model_words = set(m_norm.split())
    model_words -= {"the", "and", "mit", "für", "with", "+", "set"}
    model_words = {w for w in model_words if len(w) > 1 or w.isdigit()}

    if model_words:
        best_subset = None
        best_subset_len = 999
        for (rb, rm), rslug in ref_lookup.items():
            if rb != b:
                continue
            ref_model_words = set(rm.split())
            ref_model_words = {w for w in ref_model_words if len(w) > 1 or w.isdigit()}
            if model_words.issubset(ref_model_words) and len(model_words) >= 2:
                # Require model covers ≥75% of ref words to avoid partial matches
                # e.g. "zenist lv" (2) vs "zenist pro lv" (3) → 0.67 → rejected
                coverage = len(model_words) / len(ref_model_words) if ref_model_words else 0
                if coverage >= 0.75 and len(ref_model_words) < best_subset_len:
                    best_subset = rslug
                    best_subset_len = len(ref_model_words)
            if len(model_words) == 1:
                input_word = list(model_words)[0]
                ref_model_list = rm.split()
                if ref_model_list and ref_model_list[0] == input_word and len(ref_model_list) <= 3:
                    if len(ref_model_words) < best_subset_len:
                        best_subset = rslug
                        best_subset_len = len(ref_model_words)
        if best_subset:
            return best_subset, 0.85

    # 8. Fuzzy word overlap — brand-mandatory
    all_words = model_words
    best_match = None
    best_score = 0
    for (rb, rm), rslug in ref_lookup.items():
        if rb != b:
            continue
        ref_words = set(rm.split())
        ref_words = {w for w in ref_words if len(w) > 1 or w.isdigit()}
        overlap = all_words & ref_words
        n_overlap = len(overlap)
        total = max(len(all_words), len(ref_words))
        score = n_overlap / total if total > 0 else 0
        # Also check that no model word directly contradicts a ref word
        # (e.g. "classic" vs "dry" in same position = different product)
        model_only = all_words - ref_words
        ref_only = ref_words - all_words
        # If both sides have unique words, more likely different products
        contradiction_penalty = len(model_only) * len(ref_only) * 0.1
        adj_score = score - contradiction_penalty
        if n_overlap >= 2 and adj_score > best_score and adj_score >= 0.7:
            best_score = adj_score
            best_match = rslug

    if best_match and best_score * 0.8 >= 0.55:
        return best_match, round(best_score * 0.8, 2)

    return None, 0.0


# ── HTML/JSON parsing ──────────────────────────────────────────────────────
def extract_products_from_html(html):
    """Extract products from bergzeit.de page by parsing __initialAppState.

    bergzeit embeds all product data in a Vue.js initial state object.
    Products are in: productsListPage.elementsList
    """
    state_match = re.search(
        r'window\.__initialAppState\s*=\s*(\{.*?\});?\s*</script>', html, re.S
    )
    if not state_match:
        return [], 0

    state_str = state_match.group(1)

    # Extract resultCount
    rc_match = re.search(r'resultCount:\s*(\d+)', state_str)
    result_count = int(rc_match.group(1)) if rc_match else 0

    # Extract elementsList JSON
    idx = state_str.find('elementsList: [')
    if idx < 0:
        return [], result_count

    start = idx + len('elementsList: ')
    depth = 0
    end = start
    for i, c in enumerate(state_str[start:], start):
        if c == '[':
            depth += 1
        elif c == ']':
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    try:
        elements = json.loads(state_str[start:end])
    except json.JSONDecodeError:
        return [], result_count

    products = []
    for el in elements:
        d = el.get('data', el)

        brand_obj = d.get('brand', {})
        brand = brand_obj.get('name', '') if isinstance(brand_obj, dict) else str(brand_obj)
        full_name = d.get('name', '')

        # Strip bergzeit category suffix from name to get model
        model = strip_category_suffix(full_name)

        # Price extraction
        price_obj = d.get('price', {})
        price = None
        if isinstance(price_obj, dict):
            schema_price = price_obj.get('priceForSchemaOrgOffer')
            if schema_price:
                try:
                    price = float(str(schema_price).replace(',', '.'))
                except ValueError:
                    pass
            if not price:
                current_str = price_obj.get('current', '')
                if current_str:
                    m_price = re.search(r'([\d.,]+)', str(current_str).replace('.', '').replace(',', '.'))
                    if m_price:
                        try:
                            price = float(m_price.group(1))
                        except ValueError:
                            pass

        # Original/old price
        original_price = None
        if isinstance(price_obj, dict):
            old_str = price_obj.get('previous', '') or price_obj.get('old', '')
            if old_str and old_str != '0,00 €':
                m_old = re.search(r'([\d.,]+)', str(old_str).replace('.', '').replace(',', '.'))
                if m_old:
                    try:
                        original_price = float(m_old.group(1))
                    except ValueError:
                        pass

        # Product URL
        product_url = d.get('url', '')
        if product_url:
            # Clean URL: remove fragment (#itemId=...)
            product_url = re.sub(r'#.*$', '', product_url).rstrip('/')
            if product_url.startswith('/'):
                product_url = BASE_URL + product_url

        # Image URL
        images = d.get('images', [])
        image_url = images[0].get('src', '') if images else None

        if brand and model and price and price > 0 and product_url:
            products.append({
                "brand": brand,
                "model": model,
                "product_name": f"{brand} {model}",
                "product_url": product_url,
                "price_eur": price,
                "original_price_eur": original_price if original_price and original_price != price else None,
                "image_url": image_url,
            })

    return products, result_count


# ── Per-size price extraction (product detail pages) ───────────────────────
def _parse_bergzeit_price(price_str):
    """Parse a bergzeit price string like '152,30 €' → 152.30"""
    if not price_str:
        return None
    m = re.search(r'(\d[\d.,]*)', price_str)
    if m:
        return float(m.group(1).replace('.', '').replace(',', '.'))
    return None


def _extract_variations_from_html(html):
    """Extract variations array from bergzeit __initialAppState."""
    state_match = re.search(
        r'window\.__initialAppState\s*=\s*(\{.*?\});?\s*</script>', html, re.S
    )
    if not state_match:
        return None
    state_str = state_match.group(1)
    idx = state_str.find('"variations":[')
    if idx < 0:
        return None
    start = idx + len('"variations":')
    depth = 0
    end = start
    for i, c in enumerate(state_str[start:], start):
        if c == '[':
            depth += 1
        elif c == ']':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    return json.loads(state_str[start:end])


def fetch_persize_prices(url, page):
    """Fetch bergzeit product page and extract per-size prices.

    bergzeit embeds __initialAppState with variations data. Each size option
    has 'price' (original/list), 'confPrice' (configured/sale price),
    'stock', and 'isAvailable'. Prices often differ per size.

    Returns list of dicts: [{size, price, old_price, in_stock}, ...]
    """
    try:
        page.goto(url, wait_until='domcontentloaded', timeout=15000)
        html = page.content()
        variations = _extract_variations_from_html(html)
        if not variations:
            return None

        results = []
        for v in variations:
            if v.get("colorVariation"):
                continue  # Skip color variations, only process size variations
            for opt in v.get("options", []):
                label = opt.get("label", "")
                if not label or not re.match(r'^\d', label):
                    continue
                conf_price = _parse_bergzeit_price(opt.get("confPrice"))
                list_price = _parse_bergzeit_price(opt.get("price"))
                in_stock = opt.get("isAvailable", False) or (opt.get("stock", 0) > 0)
                if not conf_price and not list_price:
                    continue
                # confPrice is the actual selling price; price is the original/list price
                # If confPrice < price, it's on sale; otherwise they may be the same
                actual_price = conf_price or list_price
                original_price = list_price if list_price and list_price > actual_price else None
                results.append({
                    "size": label,
                    "price": actual_price,
                    "old_price": original_price,
                    "in_stock": in_stock,
                })

        if not results:
            return None
        results.sort(key=lambda x: float(x["size"]) if x["size"].replace('.', '').isdigit() else 999)
        return results
    except Exception as e:
        print(f"    ⚠ Could not fetch per-size prices from {url}: {e}")
        return None


def fetch_product_sizes(url, page=None):
    """Backward-compatible: extract just the size labels (for non-shoe categories if needed)."""
    persize = fetch_persize_prices(url, page) if page else None
    if persize:
        return [s["size"] for s in persize]
    return None


def should_exclude(product, exclude_keywords):
    """Check if a product should be excluded based on keywords."""
    if not exclude_keywords:
        return False
    text = f"{product['brand']} {product['model']} {product['product_url']}".lower()
    for kw in exclude_keywords:
        if kw.lower() in text:
            return True
    return False


def crawl_category_pages(paths, exclude_keywords=None):
    """Crawl all pages for a category, return deduplicated products."""
    all_products = {}
    excluded_count = 0

    for path in paths:
        page = 1
        result_count = None

        while True:
            url = f"{BASE_URL}{path}" if page == 1 else f"{BASE_URL}{path}?p={page}"
            print(f"    Fetching page {page}: {url}")

            try:
                html = fetch_html(url)
            except Exception as e:
                err_str = str(e)
                if "404" in err_str or "ERR_HTTP_RESPONSE_CODE_FAILURE" in err_str:
                    break
                print(f"    ✗ Error fetching page {page}: {e}")
                break

            products, rc = extract_products_from_html(html)
            if result_count is None:
                result_count = rc
                pages_needed = (rc + 47) // 48 if rc else 1
                print(f"    → {rc} total products advertised, ~{pages_needed} pages")

            if not products:
                break

            new_count = 0
            for p in products:
                key = p["product_url"]
                if key in all_products:
                    continue
                if should_exclude(p, exclude_keywords):
                    excluded_count += 1
                    continue
                all_products[key] = p
                new_count += 1

            print(f"    → {len(products)} products on page, {new_count} new unique (total: {len(all_products)})")

            # Check if more pages needed
            if page * 48 >= result_count:
                break

            page += 1
            time.sleep(0.5)

    if excluded_count:
        print(f"    ({excluded_count} non-relevant products excluded by keyword filter)")

    return list(all_products.values())


# ── Main crawl logic ────────────────────────────────────────────────────────
def crawl_category(cat_name, cat_config):
    """Crawl one category and upsert to Supabase."""
    print(f"\n{'='*60}")
    print(f"  Crawling: {cat_name}")
    print(f"{'='*60}")

    ref_table = cat_config["ref_table"]
    print(f"  Loading reference slugs from '{ref_table}'..." if ref_table else "  No reference table (slugs will be NULL)")
    ref_lookup = load_reference_slugs(ref_table) if ref_table else {}
    if ref_lookup:
        print(f"  → {len(ref_lookup)} reference entries loaded")

    print(f"  Crawling listing pages...")
    products = crawl_category_pages(
        cat_config["paths"],
        cat_config.get("exclude_keywords", [])
    )
    print(f"  → {len(products)} total products crawled")

    if not products:
        return 0, 0

    # Fetch per-size prices from product detail pages (shoes only)
    if cat_name == "shoes":
        print(f"  Fetching per-size prices from {len(products)} product pages...")
        page = _get_browser_page()
        for i, p in enumerate(products):
            p["_persize"] = fetch_persize_prices(p["product_url"], page)
            if (i + 1) % 10 == 0 or (i + 1) == len(products):
                with_sizes = sum(1 for pp in products[:i+1] if pp.get("_persize"))
                print(f"    {i+1}/{len(products)} products done ({with_sizes} with per-size prices)")
            time.sleep(0.3)

    now = datetime.now(timezone.utc).isoformat()
    matched = 0
    rows = []

    for p in products:
        slug, confidence = match_slug(p["brand"], p["model"], ref_lookup)
        if slug:
            matched += 1

        base_row = {
            "product_slug": slug,
            "retailer": RETAILER,
            "country": COUNTRY,
            "product_name": p["product_name"],
            "brand": p["brand"],
            "model": p["model"],
            "image_url": p["image_url"],
            "match_confidence": confidence if slug else None,
            "currency": "EUR",
            "last_crawled_at": now,
            "updated_at": now,
        }

        # For shoes with per-size data: create one row per size
        persize = p.get("_persize")
        if persize:
            for sz in persize:
                if not sz.get("price"):
                    continue
                # Parse size to float; skip non-numeric sizes like "27|28"
                try:
                    eur_size = float(sz["size"])
                except (ValueError, TypeError):
                    continue
                row = dict(base_row)
                # Append size fragment to make URL unique per size (same product_url for all sizes)
                row["product_url"] = f"{p['product_url']}#size={sz['size']}"
                row["price_eur"] = sz["price"]
                row["original_price_eur"] = sz.get("old_price")
                row["eur_size"] = eur_size
                row["in_stock"] = sz.get("in_stock", True)
                rows.append(row)
        else:
            # No per-size data — single row with listing price
            row = dict(base_row)
            row["product_url"] = p["product_url"]
            row["price_eur"] = p["price_eur"]
            row["original_price_eur"] = p["original_price_eur"]
            row["eur_size"] = None
            row["in_stock"] = True
            rows.append(row)

    print(f"  Matched: {matched}/{len(products)} ({100*matched//len(products) if products else 0}%)")

    price_table = cat_config["price_table"]

    # Add rope-specific fields (length & diameter)
    if price_table == "rope_prices":
        for row in rows:
            raw_text = row.get("product_name") or row.get("model") or ""
            _diam, _len = extract_rope_specs(raw_text)
            if not _len:
                # Fallback: try extracting length from URL (many retailers encode length in URL)
                _diam2, _len2 = extract_rope_specs(row.get("product_url") or "")
                if _len2:
                    _len = _len2
                if not _diam and _diam2:
                    _diam = _diam2
            row["diameter_mm"] = _diam
            row["length_m"] = _len
    # For shoes and ropes: delete old rows first (per-size rows / length variants change)
    if price_table in ("shoe_prices", "rope_prices"):
        print(f"  Deleting old {RETAILER} rows from {price_table}...")
        supabase_delete(price_table, RETAILER)

    # Deduplicate rows by product_url (same size can appear in multiple variation groups)
    seen_urls = set()
    deduped_rows = []
    for row in rows:
        if row["product_url"] not in seen_urls:
            seen_urls.add(row["product_url"])
            deduped_rows.append(row)
    if len(deduped_rows) < len(rows):
        print(f"  Deduplicated: {len(rows)} → {len(deduped_rows)} rows ({len(rows) - len(deduped_rows)} duplicates removed)")
    rows = deduped_rows

    print(f"  Upserting to '{price_table}'...")
    total_upserted = 0
    batch_size = 50
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        n = supabase_upsert(price_table, batch)
        total_upserted += n
        if n:
            print(f"    ✓ Batch {i//batch_size + 1}: {n} rows")

    print(f"  ✓ Done: {total_upserted} rows upserted to {price_table}")
    print(f"    Matched to reference: {matched}, Unmatched: {len(products) - matched}")

    return len(products), matched


# ── Entry point ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    cats = sys.argv[1:] if len(sys.argv) > 1 else list(CATEGORIES.keys())

    print(f"bergzeit.de Crawler")
    print(f"Categories: {', '.join(cats)}")
    print(f"Target: {SUPABASE_URL}")

    grand_total = 0
    grand_matched = 0
    for cat in cats:
        if cat not in CATEGORIES:
            print(f"\n✗ Unknown category: {cat}")
            print(f"  Available: {', '.join(CATEGORIES.keys())}")
            continue
        total, matched = crawl_category(cat, CATEGORIES[cat])
        grand_total += total
        grand_matched += matched

    _close_browser()

    print(f"\n{'='*60}")
    print(f"  All done! {grand_matched}/{grand_total} matched overall")
    print(f"{'='*60}")
