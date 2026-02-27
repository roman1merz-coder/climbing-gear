#!/usr/bin/env python3
"""
naturzeit.com crawler → per-category Supabase price tables.

naturzeit.com is a Shopware 6 shop with standard HTML product listings.
Product data is available on listing pages via:
  - URL: <a> with class="product-name" href="..."
  - Title: <a> class="product-name" title="..." (clean, no color/size in name)
  - Price: <div class="product-price"> with €
  - Brand: <span class="product-box-manufacturer">
  - Image: <img src="..." class="product-image is-standard">
  - Old price: <span class="list-price-price"> with UVP* and €

Pagination: ?p=1, ?p=2, etc. ~44 products per page.
Total product count shown as "N Produkte" on each page.

Usage:
    python3 crawl_naturzeit.py              # crawl all categories
    python3 crawl_naturzeit.py shoes        # crawl one category
    python3 crawl_naturzeit.py shoes ropes  # crawl multiple
"""

import sys, re, json, time, math, urllib.request, urllib.parse, html as htmlmod
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

# ── Config ──────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2MDc5MSwiZXhwIjoyMDg2MTM2NzkxfQ.6cYE1ElsvX7-BTc1DD15zoPJyr4L3bN0_QyKRQmp3M4"
ANON_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjA3OTEsImV4cCI6MjA4NjEzNjc5MX0.QH3wFa14gSvRKOz8Q099sbKvKoSroGJfPerdZgPtbTI"

RETAILER = "naturzeit.com"
COUNTRY  = "DE"
BASE_URL = "https://www.naturzeit.com"
PRODUCTS_PER_PAGE = 44  # naturzeit shows ~44 products per page

# Brand name normalization (naturzeit often appends " Schuhe" or similar)
BRAND_CLEAN = {
    "scarpa schuhe": "Scarpa",
    "scarpa": "Scarpa",
    "la sportiva": "La Sportiva",
    "la sportiva s.p.a.": "La Sportiva",
    "black diamond": "Black Diamond",
    "red chili": "Red Chili",
    "evolv": "Evolv",
    "ocun": "Ocun",
    "boreal": "Boreal",
    "edelrid": "Edelrid",
    "petzl": "Petzl",
    "mammut": "Mammut",
    "beal": "Beal",
    "camp": "Camp",
    "climbing technology": "Climbing Technology",
    "dmm": "DMM",
    "wild country": "Wild Country",
    "salewa": "Salewa",
    "kong": "Kong",
    "blue ice": "Blue Ice",
    "mad rock": "Mad Rock",
    "singing rock": "Singing Rock",
    "grivel": "Grivel",
    "tendon": "Tendon",
    "simond": "Simond",
    "austrialpin": "AustriAlpin",
    "butora": "Butora",
    "so ill": "So iLL",
    "unparallel": "Unparallel",
    "eb": "EB",
    "andrea boldrini": "Andrea Boldrini",
    "rock empire": "Rock Empire",
    "lacd": "LACD",
    "moon climbing": "Moon Climbing",
    "ferrino": "Ferrino",
    "lowa": "Lowa",
    "metolius": "Metolius",
    "fixe": "Fixe",
    "stubai": "Stubai",
}

# Category suffixes to strip from product names
CATEGORY_SUFFIXES = [
    'kletterschuhe', 'kletterschuh', 'climbing shoes', 'climbing shoe',
    'kletterseil', 'kletterseile', 'halbseil', 'zwillingsseil', 'einfachseil',
    'crashpad', 'crash pad', 'bouldermatte', 'boulderpad',
    'express-set', 'express set', 'expressset', 'expressen', 'expressschlinge', 'expresssets',
    'kletterhelm', 'kletterhelme',
    'klettergurt', 'klettergurte',
    'sicherungsgerät', 'sicherungsgeraet', 'abseilgerät', 'abseilgeraet',
    'belay device', 'belay kit',
    'karabiner', 'kletterkarabiner',
    'quickdraw', 'quickpack',
]

# Products to EXCLUDE by category
SHOE_EXCLUDE_KEYWORDS = [
    'sock', 'socks', 'shoe bag', 'schuhbeutel',
    'zubehör', 'resoling', 'besohlung',
    'approach', 'zustieg', 'wanderschuh', 'hiking',
    'climbing socks', 'kinder-',
]

# Brands that are NOT climbing gear — used to filter out random outdoor products
# naturzeit often mixes non-climbing products into climbing categories
NON_CLIMBING_BRANDS = {
    'basic nature', 'basicnature', 'esbit', 'gsi outdoors', 'gsi', 'hanwag',
    'leki', 'nalgene', 'ortlieb', 'patagonia', 'relags', 'tatonka',
    'deuter', 'primus', 'sea to summit', 'lowa', 'meindl', 'keen',
    'nikwax', 'fjällräven', 'fjallraven', 'vaude', 'jack wolfskin', 'exped',
    'therm-a-rest', 'thermarest', 'coghlans', 'cocoon', 'katadyn',
    'msr', 'optimus', 'trangia', 'jetboil', 'soto', 'snow peak',
    'gregory', 'osprey', 'marmot', 'mountain equipment',
}

BELAY_EXCLUDE_KEYWORDS = [
    'steigklemme', 'ascender', 'tibloc', 'bloquer',
    'ohm', 'bremsassistent',
    'pulley', 'seilrolle', 'traxion',
    'ropeman',
    'via ferrata', 'klettersteig',
    'achter', 'huit',  # figure-eight descenders, not modern belay devices
    'switch',  # Edelrid Switch is a personal anchor, not a belay
    'dual caving',  # Petzl Dual Caving is a specialty device
    'swivel', 'wirbel',  # Swivels/connectors, not belay devices
]

QUICKDRAW_EXCLUDE_KEYWORDS = [
    'schraubglied', 'maillon',
    'accessory carabiner', 'mini carabiner',
    'screwgate', 'screw gate', 'screw-lock', 'screw lock', 'ball-lock',
    'twist-lock', 'twist lock',
    'hms', 'verschluss',
    'klemmkeil', 'friend', 'cam',
    'be link', 'be quick', 'be lock',
    'corazon',  # Edelrid Corazon is a keychain carabiner
    'attache', 'ok ball', 'am\'d', 'ok srew',  # Single HMS/locking carabiners
    'reepschnur', 'bandschlinge', 'sling',
    'litewire carabiner',  # Single carabiner, not quickdraw
    'oval keylock',  # Single carabiner
    'heart carabiner',  # Salewa Heart = single carabiner
    'micro 3', 'pure screw',  # Edelrid single carabiners
    'kestrel (1',  # "Kestrel (1 Stk)" = single carabiner
    'falcon screw',  # Ocun Falcon Screw = single locking carabiner
    'sm\'d', 'smd',  # Petzl Sm'D = single carabiner
    'hot g3 wire',  # Salewa single carabiner
    'ok ovaler', 'ok srew',  # Petzl OK = single oval carabiner
    'wirbel', 'swivel',  # Swivels, not quickdraws
]

HELMET_EXCLUDE_KEYWORDS = [
    'helmet holder', 'helmhalter', 'helmbefestigung',
]

CRASHPAD_EXCLUDE_KEYWORDS = [
    'sitpad', 'sitcase',
]

CATEGORIES = {
    "shoes": {
        "urls": [
            f"{BASE_URL}/klettern-und-bergsteigen/kletterschuhe/",
        ],
        "price_table": "shoe_prices",
        "ref_table": "shoes",
        "exclude_keywords": SHOE_EXCLUDE_KEYWORDS,
    },
    "ropes": {
        "urls": [
            f"{BASE_URL}/klettern-und-bergsteigen/kletterseile-sicherung/kletterseile/",
        ],
        "price_table": "rope_prices",
        "ref_table": "ropes",
        "exclude_keywords": ['rope brush', 'seilbürste', 'seilsack', 'rope bag'],
    },
    "belays": {
        "urls": [
            f"{BASE_URL}/klettern-und-bergsteigen/kletterseile-sicherung/sicherungs-abseilgeraete/",
        ],
        "price_table": "belay_prices",
        "ref_table": "belay_devices",
        "exclude_keywords": BELAY_EXCLUDE_KEYWORDS,
    },
    "quickdraws": {
        "urls": [
            f"{BASE_URL}/klettern-und-bergsteigen/kletterseile-sicherung/karabiner-express-sets/",
        ],
        "price_table": "quickdraw_prices",
        "ref_table": "quickdraws",
        "exclude_keywords": QUICKDRAW_EXCLUDE_KEYWORDS,
    },
    "helmets": {
        "urls": [
            f"{BASE_URL}/klettern-und-bergsteigen/kletterausruestung/kletterhelme/",
        ],
        "price_table": "helmet_prices",
        "ref_table": None,
        "exclude_keywords": HELMET_EXCLUDE_KEYWORDS,
    },
    "harnesses": {
        "urls": [
            f"{BASE_URL}/klettern-und-bergsteigen/kletterausruestung/klettergurte/",
        ],
        "price_table": "harness_prices",
        "ref_table": None,
        "exclude_keywords": [],
    },
    "crashpads": {
        "urls": [
            f"{BASE_URL}/klettern-und-bergsteigen/kletterausruestung/crashpads-bouldermatten/",
        ],
        "price_table": "crashpad_prices",
        "ref_table": "crashpads",
        "exclude_keywords": CRASHPAD_EXCLUDE_KEYWORDS,
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


def fetch_html(url):
    """Fetch a URL and return decoded HTML."""
    req = urllib.request.Request(url, headers=HEADERS)
    resp = urllib.request.urlopen(req, timeout=30)
    return resp.read().decode("utf-8", errors="replace")


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
    s = re.sub(r"[''`®™]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s


def detect_gender(model_str):
    """Detect if a product name indicates women's or men's."""
    m = model_str.lower()
    if re.search(r"\b(women'?s?|w'?s|damen|lady|female|wmn|wmns|wms|woman)\b", m):
        return "womens"
    if re.search(r"\b((?<!wo)men'?s?|herren|(?<!wo)man|male)\b", m):
        return "mens"
    return None


def strip_category_suffix(name):
    """Strip category suffixes from product names."""
    m = name
    for suffix in CATEGORY_SUFFIXES:
        pattern = r'\s*-\s*' + re.escape(suffix) + r'(?:\s*-\s*(?:herren|damen|kinder|unisex))?$'
        m = re.sub(pattern, '', m, flags=re.I)
    for suffix in CATEGORY_SUFFIXES:
        m = re.sub(r'\s+' + re.escape(suffix) + r'\b.*$', '', m, flags=re.I)
    m = re.sub(r'\s*-\s*$', '', m)
    m = re.sub(r'\s+', ' ', m)
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
    m = re.sub(r'(\d)\s*mm\b', r'\1', m)
    # Convert Roman numerals
    roman_map = {'vi': '6', 'iv': '4', 'iii': '3', 'ii': '2'}
    for roman, arabic in roman_map.items():
        m = re.sub(r'\b' + roman + r'\b', arabic, m, flags=re.I)
    # Normalize common plural/variant forms
    m = re.sub(r'\blaces\b', 'lace', m, flags=re.I)
    # Normalize abbreviations
    m = re.sub(r'\bJr\.?\b', 'Junior', m, flags=re.I)
    # Version aliasing: "Spirit IV" (v4) is actually "Spirit VCR" renamed
    m = re.sub(r'\bSpirit\s+4\b', 'Spirit VCR', m, flags=re.I)
    # Strip stray periods
    m = re.sub(r'\.(?=\s|$)', '', m)
    # Strip closure/variant descriptors
    m = re.sub(r'\s+vcr\b', '', m, flags=re.I).strip()
    # Split concatenated model+version: "Jul2" → "Jul 2"
    m = re.sub(r'([a-zA-Z])(\d)', r'\1 \2', m)
    m = re.sub(r'\s+', ' ', m).strip()
    # Strip trailing descriptors
    m = re.sub(r'\s+(quickdraw|quickpack|belay device|belay package|belay kit|belay|kit|assorted)\b.*$', '', m, flags=re.I).strip()
    # Strip quickdraw pack/set descriptors
    m = re.sub(r'\s+quickpk\b.*$', '', m, flags=re.I).strip()
    m = re.sub(r'^pack\s+\d+\s+', '', m, flags=re.I).strip()
    m = re.sub(r'\s+pack\s+\d+\b.*$', '', m, flags=re.I).strip()
    m = re.sub(r'\s+\d+\s*pack\b.*$', '', m, flags=re.I).strip()
    m = re.sub(r'\s+qd\b.*$', '', m, flags=re.I).strip()
    # Strip trailing size "12 CM", "30cm", "16 cm"
    m = re.sub(r'\s+\d+\s*cm\s*$', '', m).strip()
    # Strip quickdraw color/material descriptors
    m = re.sub(r'\s+gerade\s+grau\b', '', m, flags=re.I).strip()
    m = re.sub(r'\s+silver\s*$', '', m, flags=re.I).strip()
    m = re.sub(r'\s+ny\s+\d+\s*cm\b.*$', '', m, flags=re.I).strip()
    m = re.sub(r'\s+ny\s*$', '', m, flags=re.I).strip()
    # Strip belay set suffixes
    m = re.sub(r'\s+set\s+hms\b.*$', '', m, flags=re.I).strip()
    m = re.sub(r'\s+autotuber\b', '', m, flags=re.I).strip()
    # AustriAlpin prefix stripping
    m = re.sub(r'^(?:gold|je)\s+', '', m, flags=re.I).strip()
    m = re.sub(r'\s+club\b', '', m, flags=re.I).strip()
    # Do NOT strip "2R"/"1R"/"3R" — these are part of rope model names
    m = re.sub(r'\b(\d+)\.0\b', r'\1', m)
    # Rope-specific compound word splits
    rope_compound_splits = {
        'iceline': 'ice line',
        'wallcruiser': 'wall cruiser',
    }
    m_lower = m.lower()
    for compound, split in rope_compound_splits.items():
        if compound in m_lower:
            m = re.sub(compound, split, m, flags=re.I)
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

    Uses multi-strategy matching:
    1. Exact (brand, model) → 1.0
    2. Gender-aware → 0.95
    3. Base model (no gender) → 0.9
    4. Normalized model → 0.9
    5. Word order reversal → 0.9
    6. Slug-based guessing → 0.85
    6b. Without trailing version → 0.85
    6c. Rope-specific (unicore, decimals) → 0.85
    6d. Rope treatment stripping → 0.85
    7. Subset match → 0.85
    8. Fuzzy word overlap → 0.55-0.7
    """
    if not ref_lookup:
        return None, 0.0

    b = normalize(brand)
    m = normalize(model)

    # Brand normalization
    brand_norm_map = {
        "c.a.m.p.": "camp",
        "camp": "camp",
        "ocún": "ocun",
        "ocun": "ocun",
        "climbing technology": "climbing technology",
        "adidas five ten": "five ten",
        "adidas": "five ten",
        "five ten": "five ten",
        "eb": "eb",
        "moon climbing": "moon",
    }
    b = brand_norm_map.get(b, b)

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
    m_clean = re.sub(r"\s*(women'?s?|w'?s|damen|herren|men'?s?|lady|woman|man|wmn|wmns|wms|female|male|unisex)\s*$", "", m).strip()
    m_clean = re.sub(r"^(damen|herren|kinder)\s+", "", m_clean).strip()
    m_clean_mid = re.sub(r"\s+(women'?s?|woman|wmn|wmns|wms|damen|herren|men'?s?|unisex)\s+", " ", m_clean).strip()
    if m_clean_mid != m_clean:
        m_clean = m_clean_mid

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

    # 6b2. Strip "LV" (Low Volume) and try matching base model
    m_no_lv = re.sub(r'\s+lv\b', '', m_norm, flags=re.I).strip()
    if m_no_lv != m_norm:
        if (b, m_no_lv) in ref_lookup:
            return ref_lookup[(b, m_no_lv)], 0.85
        m_no_lv_ver = re.sub(r'\s+\d+$', '', m_no_lv).strip()
        if m_no_lv_ver != m_no_lv and (b, m_no_lv_ver) in ref_lookup:
            return ref_lookup[(b, m_no_lv_ver)], 0.85
        if gender == "womens":
            for suffix in ["women's", "womens", "woman"]:
                if (b, f"{m_no_lv} {suffix}") in ref_lookup:
                    return ref_lookup[(b, f"{m_no_lv} {suffix}")], 0.85
                m_no_lv_ver2 = re.sub(r'\s+\d+$', '', m_no_lv).strip()
                if (b, f"{m_no_lv_ver2} {suffix}") in ref_lookup:
                    return ref_lookup[(b, f"{m_no_lv_ver2} {suffix}")], 0.85

    # 6c. Rope-specific: try with "unicore" inserted (Beal ref names include it)
    if b == "beal":
        m_with_unicore = re.sub(r'(\d+\.?\d*)\s+', r'\1 unicore ', m_norm, count=1).strip()
        m_with_unicore = re.sub(r'\s+', ' ', m_with_unicore)
        if (b, m_with_unicore) in ref_lookup:
            return ref_lookup[(b, m_with_unicore)], 0.85
    # Try adding ".0" to bare integer diameters
    m_with_decimal = re.sub(r'\b(\d+)\b(?!\.\d)', r'\1.0', m_norm)
    if m_with_decimal != m_norm and (b, m_with_decimal) in ref_lookup:
        return ref_lookup[(b, m_with_decimal)], 0.85
    if b == "beal":
        m_combo = re.sub(r'\b(\d+)\b(?!\.\d)', r'\1.0', m_with_unicore)
        m_combo = re.sub(r'\s+', ' ', m_combo)
        if (b, m_combo) in ref_lookup:
            return ref_lookup[(b, m_combo)], 0.85

    # 6d. Rope-specific: strip treatment descriptors from BOTH sides
    ROPE_TREATMENT_WORDS = {"unicore", "dry", "cover", "golden", "protect", "eco"}
    m_core = " ".join(w for w in m_norm.split() if w not in ROPE_TREATMENT_WORDS)
    m_core = re.sub(r"\s+", " ", m_core).strip()
    # Always try treatment-stripped matching (even if crawled model has no treatment words,
    # the ref model might have them — e.g., "Berlin 9.8" vs ref "Berlin 9.8 Unicore")
    for (rb, rm), rslug in ref_lookup.items():
        if rb != b:
            continue
        ref_core = " ".join(w for w in rm.split() if w not in ROPE_TREATMENT_WORDS)
        ref_core = re.sub(r"\s+", " ", ref_core).strip()
        if m_core == ref_core and (m_core != m_norm or ref_core != rm):
            return rslug, 0.85
    m_core_decimal = re.sub(r'\b(\d+)\b(?!\.\d)', r'\1.0', m_core)
    if m_core_decimal != m_core:
        for (rb, rm), rslug in ref_lookup.items():
            if rb != b:
                continue
            ref_core = " ".join(w for w in rm.split() if w not in ROPE_TREATMENT_WORDS)
            ref_core = re.sub(r"\s+", " ", ref_core).strip()
            if m_core_decimal == ref_core:
                return rslug, 0.85

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

    # 8. Fuzzy word overlap
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
        model_only = all_words - ref_words
        ref_only = ref_words - all_words
        contradiction_penalty = len(model_only) * len(ref_only) * 0.1
        adj_score = score - contradiction_penalty
        if n_overlap >= 2 and adj_score > best_score and adj_score >= 0.7:
            best_score = adj_score
            best_match = rslug

    if best_match and best_score * 0.8 >= 0.55:
        return best_match, round(best_score * 0.8, 2)

    return None, 0.0


# ── HTML parsing (naturzeit-specific) ──────────────────────────────────────

def clean_brand(raw_brand):
    """Normalize brand name from naturzeit's product-box-manufacturer text."""
    if not raw_brand:
        return None
    b = raw_brand.strip()
    b_lower = b.lower()
    # Try exact match first
    if b_lower in BRAND_CLEAN:
        return BRAND_CLEAN[b_lower]
    # Try stripping common suffixes
    for suffix in [' schuhe', ' shoes', ' seile', ' helme', ' gurte']:
        stripped = b_lower.rstrip().removesuffix(suffix)
        if stripped in BRAND_CLEAN:
            return BRAND_CLEAN[stripped]
    # Return as-is with title case
    return b


def strip_naturzeit_descriptors(title, brand):
    """Strip naturzeit-specific descriptor text from product titles.

    naturzeit.com often appends specs to the title:
    "Jul 2 Belay Kit Bulletproof Triple Einfachseile Durchmesser 8,9 - 11,0 mm Farbe icemint"
    "Crag Keylock 10 cm Indicator 6-Pack Quickdraws silver-ultramarine"
    "Half Dome Helmet Groesse S-M Farbe Slate"
    """
    m = title

    # Strip brand prefix (case-insensitive)
    if brand:
        brand_lower = brand.lower()
        m_lower = m.lower()
        if m_lower.startswith(brand_lower + ' '):
            m = m[len(brand):].strip()
        elif m_lower.startswith(brand_lower + '-'):
            m = m[len(brand)+1:].strip()
        # Also handle "Mammut Mammut Mini Carabiner" (brand in title twice)
        m_lower2 = m.lower()
        if m_lower2.startswith(brand_lower + ' '):
            m = m[len(brand):].strip()

    # Strip " Groesse ..." / " Größe ..." (size info)
    m = re.sub(r'\s+(?:Groesse|Größe|Gr\.?)\s+.*$', '', m, flags=re.I)

    # Strip " Farbe ..." (color info)
    m = re.sub(r'\s+Farbe\s+.*$', '', m, flags=re.I)

    # Strip " Länge ..." (length info)
    m = re.sub(r'\s+L(?:ä|ae?)nge\s+.*$', '', m, flags=re.I)

    # Strip " Verschluss ..." (closure info)
    m = re.sub(r'\s+Verschluss\s+.*$', '', m, flags=re.I)

    # Strip " für Seildurchmesser ..." / " Einfachseile Durchmesser ..."
    m = re.sub(r'\s+(?:für\s+)?(?:Einfach)?[Ss]eil(?:e|durchmesser)\s+.*$', '', m)

    # Strip " Zugfestigkeit ..."
    m = re.sub(r'\s+Zugfestigkeit\s+.*$', '', m, flags=re.I)

    # Strip rope length suffixes: "50 m", "60m", "70 m" at end
    m = re.sub(r'\s+\d+\s*m\s*$', '', m, flags=re.I)

    # Strip "Rope" suffix (Mammut ropes: "9.5 Crag Classic Rope")
    m = re.sub(r'\s+Rope\s*$', '', m, flags=re.I)

    # Strip trailing color for ropes: "orange", "dry orange", etc.
    m = re.sub(r'\s+(?:orange|blue|green|red|yellow|pink|turquoise|assorted\s+colours?)\s*$', '', m, flags=re.I)

    # Strip "assorted colours (900)" pattern
    m = re.sub(r',?\s*assorted\s+colours?\s*\(\d+\).*$', '', m, flags=re.I)

    # Strip "SE " prefix (Edelrid "SE Puffin" = Special Edition)
    m = re.sub(r'^SE\s+', '', m)

    # Convert comma decimals in rope diameters: "9,8" → "9.8"
    m = re.sub(r'(\d),(\d)', r'\1.\2', m)

    # Strip "x 60m" format (rope length with x)
    m = re.sub(r'\s+x\s+\d+\s*m\s*$', '', m, flags=re.I)

    # Strip trailing " Stk" (pieces count)
    m = re.sub(r'\s+\d+\s*(?:Stk|Stück)\b.*$', '', m, flags=re.I)

    # Strip "N cm" size (quickdraws: "10 cm", "17 cm", "12 cm")
    m = re.sub(r'\s+\d+\s*cm\b', '', m, flags=re.I)

    # Strip "N-Pack" / "N-er Pack" (multi-pack descriptors)
    m = re.sub(r'\s+\d+-(?:er\s+)?Pack\b.*$', '', m, flags=re.I)

    # Strip "PA 15/22 mm" (wire gauge descriptors)
    m = re.sub(r'\s+PA\s+\d+/\d+\s*mm\b', '', m, flags=re.I)

    # Strip "mm" diameter from model name (ropes: "9.8 mm", "9,8mm")
    m = re.sub(r'\s+mm\b', '', m)

    # Strip category suffixes
    m = strip_category_suffix(m)

    # Clean up
    m = re.sub(r'\s+', ' ', m).strip()
    m = re.sub(r'\s*-\s*$', '', m).strip()

    return m


def get_total_products(html):
    """Extract total product count from page."""
    match = re.search(r'(\d+)\s+Produkt', html)
    if match:
        return int(match.group(1))
    return 0


def extract_products_from_html(html):
    """Extract products from naturzeit.com listing page HTML.

    Returns list of product dicts with: url, title, brand, model, price, old_price, image_url
    """
    # Split by product box marker
    boxes = html.split('card product-box box-standard')[1:]  # Skip preamble
    products = []
    seen_urls = set()

    for box in boxes:
        # Product name and URL
        name_match = re.search(
            r'class="product-name"\s*(?:title="([^"]+)")?\s*(?:href="([^"]+)")?',
            box
        )
        if not name_match:
            # Try alternative order: href before title
            name_match = re.search(
                r'href="([^"]+)"[^>]*class="product-name"\s*title="([^"]+)"',
                box
            )
            if name_match:
                url = name_match.group(1)
                title = htmlmod.unescape(name_match.group(2).strip())
            else:
                continue
        else:
            title = htmlmod.unescape(name_match.group(1).strip()) if name_match.group(1) else None
            url = name_match.group(2)

        # Try getting URL from nearby href if not found
        if not url:
            url_match = re.search(r'href="(https://www\.naturzeit\.com/[^"]+)"[^>]*class="product-name"', box)
            if not url_match:
                url_match = re.search(r'class="product-name"[^>]*href="(https://www\.naturzeit\.com/[^"]+)"', box)
            if url_match:
                url = url_match.group(1)

        if not url or not title:
            continue

        # Deduplicate by URL
        if url in seen_urls:
            continue
        seen_urls.add(url)

        # Brand
        brand_match = re.search(r'product-box-manufacturer[^"]*"[^>]*>\s*([^<\s][^<]*?)\s*<', box, re.DOTALL)
        raw_brand = brand_match.group(1).strip() if brand_match else None
        brand = clean_brand(raw_brand)

        if not brand:
            continue

        # Price (current/discounted)
        # Try "product-price with-list-price" first (discounted items)
        price_match = re.search(
            r'class="product-price(?:\s+with-list-price)?"[^>]*>\s*([0-9.,]+)\s*€',
            box, re.DOTALL
        )
        if not price_match:
            # Broader: any text content with € inside price div
            price_match = re.search(
                r'class="product-price[^"]*"[^>]*>[^€]*?(\d[\d.,]*)\s*€',
                box, re.DOTALL
            )
        if not price_match:
            continue

        try:
            price = float(price_match.group(1).replace('.', '').replace(',', '.'))
        except (ValueError, TypeError):
            continue
        if price <= 0:
            continue

        # Old/list price (UVP)
        old_price_match = re.search(
            r'list-price-price[^>]*>[^0-9]*(\d[\d.,]*)\s*€',
            box, re.DOTALL
        )
        old_price = None
        if old_price_match:
            try:
                old_price = float(old_price_match.group(1).replace('.', '').replace(',', '.'))
            except (ValueError, TypeError):
                old_price = None
        if old_price and old_price == price:
            old_price = None

        # Product image (src comes before class on naturzeit)
        img_match = re.search(
            r'<img\s+src="([^"]+)"[^>]*class="product-image is-standard"',
            box
        )
        image_url = img_match.group(1) if img_match else None

        # Extract model from title
        model = strip_naturzeit_descriptors(title, brand)
        if not model:
            continue

        products.append({
            "brand": brand,
            "model": model,
            "product_name": f"{brand} {model}",
            "product_url": url,
            "price_eur": price,
            "original_price_eur": old_price,
            "image_url": image_url,
        })

    return products


def should_exclude(product, exclude_keywords):
    """Check if a product should be excluded based on keywords or non-climbing brand."""
    # Exclude non-climbing brands
    brand_lower = (product.get('brand') or '').lower()
    if brand_lower in NON_CLIMBING_BRANDS:
        return True

    if not exclude_keywords:
        return False
    text = f"{product['brand']} {product['model']} {product['product_url']}".lower()
    for kw in exclude_keywords:
        if kw.lower() in text:
            return True
    return False


# ── Main crawl logic ────────────────────────────────────────────────────────
# ── Per-size price extraction (Playwright headless) ────────────────────────

def _pw_extract_price(page):
    """Extract current price from a naturzeit product page (Playwright page)."""
    el = page.query_selector('.product-detail-price')
    if el:
        txt = el.inner_text()
        m = re.search(r'(\d[\d.,]*)\s*€', txt)
        if m:
            return float(m.group(1).replace('.', '').replace(',', '.'))
    return None


def _pw_extract_old_price(page):
    """Extract original/list price from a naturzeit product page."""
    el = page.query_selector('.list-price-price')
    if el:
        txt = el.inner_text()
        m = re.search(r'(\d[\d.,]*)\s*€', txt)
        if m:
            return float(m.group(1).replace('.', '').replace(',', '.'))
    return None


def fetch_persize_prices(url, browser_context):
    """Fetch per-size prices from a naturzeit product page using Playwright.

    Each size variant navigates to a different URL with its own price.
    Uses fresh-page-per-size approach for reliability: load the base URL,
    click the target size, wait for navigation, extract price.

    Returns list of dicts: [{size, price, old_price, variant_url, in_stock}, ...]
    Returns None if no sizes found.
    """
    results = []
    try:
        # First: load page once to get the list of sizes and their input IDs
        page = browser_context.new_page()
        page.set_default_timeout(15000)
        page.goto(url, wait_until="domcontentloaded", timeout=15000)
        time.sleep(2)
        page.evaluate("document.querySelector('.ccm-root')?.remove()")

        initial_price = _pw_extract_price(page)
        initial_old = _pw_extract_old_price(page)

        sizes = page.evaluate("""
            Array.from(document.querySelectorAll('label.product-detail-configurator-option-label')).filter(l =>
                /^\\d{2}[.,]?\\d?$/.test(l.textContent.trim())
            ).map(l => {
                const forId = l.getAttribute('for');
                const inp = forId ? document.getElementById(forId) : null;
                return {
                    size: l.textContent.trim().replace(',', '.'),
                    inputId: forId,
                    notSelectable: l.className.includes('not-selectable'),
                    checked: inp ? inp.checked : false,
                };
            })
        """)
        page.close()

        if not sizes:
            return None

        # Process each size: fresh page, click, read price
        for si in sizes:
            if si['notSelectable']:
                results.append({
                    "size": si['size'], "price": None, "old_price": None,
                    "variant_url": None, "in_stock": False,
                })
                continue

            pg = browser_context.new_page()
            pg.set_default_timeout(15000)  # Hard cap per operation
            try:
                pg.goto(url, wait_until="domcontentloaded", timeout=15000)
                time.sleep(1)
                pg.evaluate("document.querySelector('.ccm-root')?.remove()")

                if si['checked']:
                    results.append({
                        "size": si['size'], "price": initial_price,
                        "old_price": initial_old, "variant_url": pg.url,
                        "in_stock": True,
                    })
                    pg.close()
                    continue

                # Click the target size radio
                try:
                    with pg.expect_navigation(timeout=6000, wait_until="domcontentloaded"):
                        pg.evaluate(f'document.getElementById("{si["inputId"]}")?.click()')
                    time.sleep(0.5)

                    price = _pw_extract_price(pg)
                    old_p = _pw_extract_old_price(pg)
                    results.append({
                        "size": si['size'], "price": price, "old_price": old_p,
                        "variant_url": pg.url, "in_stock": True,
                    })
                except Exception:
                    results.append({
                        "size": si['size'], "price": None, "old_price": None,
                        "variant_url": None, "in_stock": False,
                    })
            except Exception:
                results.append({
                    "size": si['size'], "price": None, "old_price": None,
                    "variant_url": None, "in_stock": False,
                })
            finally:
                pg.close()

            time.sleep(0.3)

        return results if results else None

    except Exception as e:
        print(f"    ⚠ Could not fetch per-size prices from {url}: {e}")
        return None


def _create_browser_context():
    """Create a stealth Playwright browser context for naturzeit."""
    pw = sync_playwright().start()
    browser = pw.chromium.launch(
        headless=True,
        args=['--disable-blink-features=AutomationControlled'],
    )
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        viewport={"width": 1440, "height": 900},
        locale="de-DE",
        timezone_id="Europe/Berlin",
    )
    context.add_init_script(
        "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
        "window.chrome={runtime:{}};"
    )
    return pw, browser, context


def crawl_category(cat_name, cat_config):
    """Crawl one category (with pagination) and upsert to Supabase."""
    print(f"\n{'='*60}")
    print(f"  Crawling: {cat_name}")
    print(f"{'='*60}")

    ref_table = cat_config["ref_table"]
    print(f"  Loading reference slugs from '{ref_table}'..." if ref_table else "  No reference table (slugs will be NULL)")
    ref_lookup = load_reference_slugs(ref_table) if ref_table else {}
    if ref_lookup:
        print(f"  → {len(ref_lookup)} reference entries loaded")

    all_products = []
    exclude_kw = cat_config.get("exclude_keywords", [])

    for base_url in cat_config["urls"]:
        # Fetch page 1 to get total count
        print(f"  Fetching: {base_url}")
        try:
            html = fetch_html(base_url)
        except Exception as e:
            print(f"  ✗ Error fetching page: {e}")
            continue

        total = get_total_products(html)
        print(f"  → {total} total products reported")

        page_products = extract_products_from_html(html)
        all_products.extend(page_products)
        print(f"  → Page 1: {len(page_products)} products parsed")

        # Paginate if needed
        if total > PRODUCTS_PER_PAGE:
            num_pages = math.ceil(total / PRODUCTS_PER_PAGE)
            for page in range(2, num_pages + 1):
                sep = '&' if '?' in base_url else '?'
                page_url = f"{base_url}{sep}p={page}"
                print(f"  Fetching page {page}/{num_pages}: {page_url}")
                try:
                    time.sleep(0.5)  # Be polite
                    html = fetch_html(page_url)
                    page_products = extract_products_from_html(html)
                    all_products.extend(page_products)
                    print(f"  → Page {page}: {len(page_products)} products parsed")
                except Exception as e:
                    print(f"  ✗ Error fetching page {page}: {e}")

    # Deduplicate across pages
    seen_urls = set()
    deduped = []
    for p in all_products:
        if p["product_url"] not in seen_urls:
            seen_urls.add(p["product_url"])
            deduped.append(p)
    if len(deduped) < len(all_products):
        print(f"  ({len(all_products) - len(deduped)} duplicates removed)")
    all_products = deduped

    print(f"  → {len(all_products)} total products parsed across all pages")

    # Apply exclusion filters
    products = []
    excluded_count = 0
    for p in all_products:
        if should_exclude(p, exclude_kw):
            excluded_count += 1
            continue
        products.append(p)

    if excluded_count:
        print(f"  ({excluded_count} non-relevant products excluded by keyword filter)")
    print(f"  → {len(products)} products after filtering")

    if not products:
        return 0, 0

    # Fetch per-size prices from product detail pages (shoes only)
    if cat_name == "shoes":
        print(f"  Fetching per-size prices from {len(products)} product pages (headless)...")
        pw, browser, browser_ctx = _create_browser_context()
        try:
            for i, p in enumerate(products):
                persize = fetch_persize_prices(p["product_url"], browser_ctx)
                p["_persize"] = persize
                n_sizes = len(persize) if persize else 0
                n_priced = sum(1 for s in (persize or []) if s.get("price")) if persize else 0
                if (i + 1) % 10 == 0 or (i + 1) == len(products):
                    total_with = sum(1 for pp in products[:i+1] if pp.get("_persize"))
                    print(f"    {i+1}/{len(products)} products done ({total_with} with sizes)")
                elif n_sizes > 0:
                    print(f"    {p['product_name']}: {n_priced}/{n_sizes} sizes with prices")
                time.sleep(0.5)
        finally:
            browser.close()
            pw.stop()

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
                    continue  # Skip sizes without a price (out of stock)
                row = dict(base_row)
                row["product_url"] = sz.get("variant_url") or p["product_url"]
                row["price_eur"] = sz["price"]
                row["original_price_eur"] = sz.get("old_price")
                row["eur_size"] = float(sz["size"])
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

    # Print unmatched for debugging
    unmatched = [(p["brand"], p["model"]) for p in products
                 if match_slug(p["brand"], p["model"], ref_lookup)[0] is None]
    if unmatched and len(unmatched) <= 50:
        print(f"  Unmatched products:")
        for brand, model in sorted(set(unmatched)):
            print(f"    - {brand}: {model}")

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
    # For shoes and ropes: delete old rows first (variant URLs change, old rows become stale)
    if price_table in ("shoe_prices", "rope_prices"):
        print(f"  Deleting old {RETAILER} rows from {price_table}...")
        supabase_delete(price_table, RETAILER)

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

    print(f"naturzeit.com Crawler")
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

    print(f"\n{'='*60}")
    print(f"  All done! {grand_matched}/{grand_total} matched overall")

    # Record price history snapshot
    try:
        from snapshot_prices import snapshot_all
        snapshot_all()
    except Exception as e:
        print(f'  ⚠ Price snapshot failed: {e}')

    print(f"{'='*60}")
