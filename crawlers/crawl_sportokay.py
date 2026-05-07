#!/usr/bin/env python3
"""
sportokay.com crawler → per-category Supabase price tables.

sportokay.com is a Magento-based shop (Austrian retailer, German locale).
Product data is available on listing pages via:
  - Name: <span itemprop="name">Brand Model Kletterschuhe</span>
  - URL: <a href="..." data-url-type="product-view">
  - Price: <meta itemprop="price" content="149.9900" />
  - Old price: data-settings JSON → configurable.basePrice / oldPrice
  - Image: <img class="b_catalog-product-list-item__product-image" src="...">
  - Brand: extracted from product name (first word(s) before model)

Products are in <article class="b_catalog-product-list-item">.
Pagination: ?p=1, ?p=2, etc. 60 products per page.
Total count shown as "X-Y of Z" on each page.

Usage:
    python3 crawl_sportokay.py              # crawl all categories
    python3 crawl_sportokay.py shoes        # crawl one category
    python3 crawl_sportokay.py shoes ropes  # crawl multiple
"""

import sys, re, json, time, math, urllib.request, urllib.parse, html as htmlmod
from datetime import datetime, timezone

# ── Config ──────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SECRET_KEY"]  # set in ~/.cgkeys, not committed
ANON_KEY    = "sb_publishable_dG9yKzuhsr2DtSHIh9-cXg_DhZbfYkr"

RETAILER = "sportokay.com"
COUNTRY  = "AT"
BASE_URL = "https://www.sportokay.com"
PRODUCTS_PER_PAGE = 60

# Known brand prefixes in sportokay product names.
# sportokay names follow: "Brand Model CategorySuffix" e.g. "Scarpa Drago LV Kletterschuhe"
# The brand must be detected from the product name.
KNOWN_BRANDS = [
    # Multi-word brands (check first to avoid partial matches)
    "La Sportiva", "Black Diamond", "Red Chili", "Climbing Technology",
    "Wild Country", "Blue Ice", "Mad Rock", "Singing Rock", "So iLL",
    "Rock Empire", "Moon Climbing", "Five Ten", "Andrea Boldrini",
    # Single-word brands
    "Scarpa", "Evolv", "Ocun", "Boreal", "Edelrid", "Petzl", "Mammut",
    "Beal", "Camp", "DMM", "Salewa", "Kong", "Grivel", "Tendon", "Simond",
    "AustriAlpin", "Butora", "Unparallel", "EB", "LACD", "Ferrino",
    "Lowa", "Metolius", "Fixe", "Stubai", "Tenaya",
]

# Brand name normalization
BRAND_CLEAN = {
    "scarpa": "Scarpa",
    "la sportiva": "La Sportiva",
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
    "five ten": "Five Ten",
    "tenaya": "Tenaya",
}

# Category suffixes to strip from product names (German)
CATEGORY_SUFFIXES = [
    'kletterschuhe', 'kletterschuh', 'climbing shoes', 'climbing shoe',
    'kletterseil', 'kletterseile', 'halbseil', 'zwillingsseil', 'einfachseil',
    'crashpad', 'crash pad', 'bouldermatte', 'boulderpad',
    'express-set', 'express set', 'expressset', 'expressen', 'expressschlinge', 'expressschlingen', 'expresssets',
    'kletterhelm', 'kletterhelme',
    'klettergurt', 'klettergurte',
    'sicherungsgerät', 'sicherungsgeraet', 'abseilgerät', 'abseilgeraet',
    'sicherungsgerät', 'belay device', 'belay kit',
    'karabiner', 'kletterkarabiner',
    'quickdraw', 'quickpack',
]

# Products to EXCLUDE by category
SHOE_EXCLUDE_KEYWORDS = [
    'sock', 'socks', 'shoe bag', 'schuhbeutel',
    'zubehör', 'resoling', 'besohlung',
    'approach', 'zustieg', 'wanderschuh', 'hiking',
    # sportokay mixes mountain/trekking/ice boots into climbing shoes
    'bergschuhe', 'bergschuh', 'trekkingschuhe', 'trekkingschuh',
    'eiskletterschuhe', 'eiskletterschuh',
    'gore-tex', 'gtx',
    'mojito',  # Scarpa Mojito = casual/approach shoe, not climbing
    'invernal',  # Winter/ice climbing variants
]

BELAY_EXCLUDE_KEYWORDS = [
    'steigklemme', 'ascender', 'tibloc', 'bloquer',
    'ohm', 'bremsassistent',
    'pulley', 'seilrolle', 'traxion',
    'ropeman',
    'via ferrata', 'klettersteig',
    'achter', 'huit',
    'dual caving',
    'swivel', 'wirbel',
    'standplatzschlinge', 'selbstsicherungsschlinge',  # Personal anchors
    'connect adjust', 'dual connect',  # Petzl personal anchors
    'switch double',  # Edelrid personal anchor
    'escaper',  # Beal Escaper = emergency rappel device
    'pirana',  # Petzl Pirana = canyoning device
]

QUICKDRAW_EXCLUDE_KEYWORDS = [
    'schraubglied', 'maillon',
    'accessory carabiner', 'mini carabiner',
    'screwgate', 'screw gate', 'screw-lock', 'screw lock', 'ball-lock',
    'twist-lock', 'twist lock',
    'hms', 'verschluss',
    'klemmkeil', 'friend', 'cam',
    'reepschnur', 'bandschlinge', 'sling',
    'oval keylock',
    'heart carabiner',
    # Single carabiners (sportokay-specific)
    'ok ball lock', 'pure screw', 'falcon screw',
    'bulletproof screw', 'attache',
    'schnappkarabiner',  # Snap carabiner set ≠ quickdraw
    'klettersteig',  # Via ferrata
    # Single locking carabiners (not quickdraws)
    'schraubkarabiner',  # German: screw-gate carabiner
    'karabiner',  # Single carabiners with "Karabiner" suffix
    # Non-quickdraw gear in the category
    'materialkarabiner',  # Accessory/gear carabiners
    'bigwall-schlinge', 'bigwall', 'daisy chain', 'daisychain',
    'standplatzschlinge',  # Belay stations / personal anchors
    'schließring', 'schliesring',  # Maillon rapide
    'chalk',  # Chalk products (Metolius chalk in quickdraw category)
]

HELMET_EXCLUDE_KEYWORDS = [
    'helmet holder', 'helmhalter', 'helmbefestigung',
]

# For crashpads, sportokay's "bouldering" category has mostly non-crashpad items.
# Use a WHITELIST approach: only include products with crashpad-like keywords.
CRASHPAD_INCLUDE_KEYWORDS = [
    'crashpad', 'crash pad', 'bouldermatte', 'boulderpad',
    'boulder pad', 'pad',
]
CRASHPAD_EXCLUDE_KEYWORDS = []  # Not needed with whitelist approach

CATEGORIES = {
    "shoes": {
        "urls": [
            f"{BASE_URL}/de_de/alle/klettern/kletterschuhe.html",
        ],
        "price_table": "shoe_prices",
        "ref_table": "shoes",
        "exclude_keywords": SHOE_EXCLUDE_KEYWORDS,
        "cat_suffix": "Kletterschuhe",
    },
    "ropes": {
        "urls": [
            f"{BASE_URL}/de_de/alle/klettern/kletterseile-reepschnuere.html",
        ],
        "price_table": "rope_prices",
        "ref_table": "ropes",
        "exclude_keywords": ['rope brush', 'seilbürste', 'seilsack', 'rope bag',
                             'reepschnur', 'reepschnüre', 'cordelette', 'prusik',
                             'bandschlinge', 'seilrucksack', 'steigeisenzubehör',
                             'cord tec', 'alpine classic', 'alpine dry'],
        "cat_suffix": "Kletterseil",
    },
    "belays": {
        "urls": [
            f"{BASE_URL}/de_de/alle/klettern/sicherungs-und-abseilgeraete.html",
        ],
        "price_table": "belay_prices",
        "ref_table": "belay_devices",
        "exclude_keywords": BELAY_EXCLUDE_KEYWORDS,
        "cat_suffix": "Sicherungsgerät",
    },
    "quickdraws": {
        "urls": [
            f"{BASE_URL}/de_de/alle/klettern/express-sets-karabiner-schlingen.html",
        ],
        "price_table": "quickdraw_prices",
        "ref_table": "quickdraws",
        "exclude_keywords": QUICKDRAW_EXCLUDE_KEYWORDS,
        "cat_suffix": "Express Set",
    },
    "helmets": {
        "urls": [
            f"{BASE_URL}/de_de/alle/klettern/kletterhelme.html",
        ],
        "price_table": "helmet_prices",
        "ref_table": None,
        "exclude_keywords": HELMET_EXCLUDE_KEYWORDS,
        "cat_suffix": "Kletterhelm",
    },
    "harnesses": {
        "urls": [
            f"{BASE_URL}/de_de/alle/klettern/klettergurte.html",
        ],
        "price_table": "harness_prices",
        "ref_table": None,
        "exclude_keywords": [],
        "cat_suffix": "Klettergurt",
    },
    "crashpads": {
        "urls": [
            f"{BASE_URL}/de_de/alle/klettern/kletterzubehoer-bouldern.html",
        ],
        "price_table": "crashpad_prices",
        "ref_table": "crashpads",
        "exclude_keywords": CRASHPAD_EXCLUDE_KEYWORDS,
        "include_keywords": CRASHPAD_INCLUDE_KEYWORDS,
        "cat_suffix": "Crashpad",
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


def supabase_mark_all_out_of_stock(table, retailer):
    """Mark all rows for a retailer as out-of-stock BEFORE crawling.
    Products found during the crawl will be set back to in_stock=true by the upsert."""
    url = (
        f"{SUPABASE_URL}/rest/v1/{table}"
        f"?retailer=eq.{urllib.parse.quote(retailer)}&in_stock=eq.true"
    )
    body = json.dumps({"in_stock": False}).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    })
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return True
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"  ✗ Mark-out-of-stock error ({e.code}): {err_body[:300]}")
        return False

def supabase_count_rows(table, retailer):
    """Count existing in-stock rows for a retailer in a price table."""
    url = (
        f"{SUPABASE_URL}/rest/v1/{table}"
        f"?retailer=eq.{urllib.parse.quote(retailer)}&in_stock=eq.true"
        f"&select=id"
    )
    req = urllib.request.Request(url, method="HEAD", headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Prefer": "count=exact",
    })
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        # Supabase returns count in Content-Range header: "0-N/total"
        cr = resp.getheader("Content-Range", "")
        if "/" in cr:
            return int(cr.split("/")[-1])
    except Exception:
        pass
    return 0


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
            # normalize_model_name variant (Roman numerals, "express set", etc.)
            nm = normalize_model_name(model).lower().strip()
            nm = re.sub(r"\s+", " ", nm)
            if nm != model:
                lookup[(brand, nm)] = slug
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
    m = re.sub(r'\s+(quickdraw|quickpack|express set|belay device|belay package|belay kit|belay|kit|assorted)\b.*$', '', m, flags=re.I).strip()
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
    ROPE_TREATMENT_WORDS = {"unicore", "uc", "dry", "cover", "golden", "protect", "eco", "pro", "gym"}
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

    # 6e. Rope diameter position swap: "Crag Sender Dry 9.0" ↔ "9.0 Crag Sender Dry"
    # Mammut ropes often have diameter first in ref but last in crawled (or vice versa)
    diameter_match = re.match(r'^(\d+\.?\d*)\s+(.+)$', m_core)
    if diameter_match:
        # Diameter is first, try it last
        swapped = f"{diameter_match.group(2)} {diameter_match.group(1)}"
        for (rb, rm), rslug in ref_lookup.items():
            if rb != b:
                continue
            ref_core = " ".join(w for w in rm.split() if w not in ROPE_TREATMENT_WORDS)
            ref_core = re.sub(r"\s+", " ", ref_core).strip()
            if swapped == ref_core:
                return rslug, 0.85
    diameter_match_end = re.search(r'^(.+?)\s+(\d+\.?\d*)$', m_core)
    if diameter_match_end:
        # Diameter is last, try it first
        swapped = f"{diameter_match_end.group(2)} {diameter_match_end.group(1)}"
        for (rb, rm), rslug in ref_lookup.items():
            if rb != b:
                continue
            ref_core = " ".join(w for w in rm.split() if w not in ROPE_TREATMENT_WORDS)
            ref_core = re.sub(r"\s+", " ", ref_core).strip()
            if swapped == ref_core:
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


# ── HTML parsing (sportokay-specific) ──────────────────────────────────────

def detect_brand(product_name):
    """Detect brand from sportokay product name.

    sportokay product names follow: "Brand Model CategorySuffix"
    e.g. "Scarpa Drago LV Kletterschuhe"
    """
    name_lower = product_name.lower()
    # Try multi-word brands first (longer matches first)
    for brand in sorted(KNOWN_BRANDS, key=len, reverse=True):
        if name_lower.startswith(brand.lower() + " "):
            return BRAND_CLEAN.get(brand.lower(), brand)
    return None


def strip_sportokay_descriptors(title, brand):
    """Strip sportokay-specific descriptor text from product titles.

    sportokay names: "Brand Model Kletterschuhe" or "Brand Model Herren Kletterschuhe"
    """
    m = title

    # Strip brand prefix
    if brand:
        brand_lower = brand.lower()
        m_lower = m.lower()
        if m_lower.startswith(brand_lower + ' '):
            m = m[len(brand):].strip()
        elif m_lower.startswith(brand_lower + '-'):
            m = m[len(brand)+1:].strip()

    # ── Pack/set suffixes (BEFORE category suffix stripping) ──
    # Strip "6er Expressschlingen-Set", "5er Expressschlingen-Set" etc.
    m = re.sub(r'\s+\d+er\s+[\w-]*[Ss]et\b.*$', '', m, flags=re.I)
    # Strip "Schnappkarabiner-Set" suffix
    m = re.sub(r'\s+Schnappkarabiner[- ]?Set\b.*$', '', m, flags=re.I)
    # Strip "N-Pack" / "N-er Pack" (multi-pack descriptors)
    m = re.sub(r'\s+\d+-(?:er\s+)?Pack\b.*$', '', m, flags=re.I)

    # ── Category suffix (Kletterschuhe, Kletterseil, Expressschlinge etc.) ──
    m = strip_category_suffix(m)

    # ── Rope-specific stripping ──
    # Strip rope length suffixes: "50 m", "60m", "70 m" at end
    m = re.sub(r'\s+\d+\s*m\s*$', '', m, flags=re.I)
    # Strip "x 60m" format (rope length with x)
    m = re.sub(r'\s+x\s+\d+\s*m\s*$', '', m, flags=re.I)
    # Strip "Rope" suffix (Mammut ropes: "9.5 Crag Classic Rope", "Crag Sender Dry Rope")
    m = re.sub(r'\s+Rope\b', '', m, flags=re.I)
    # Strip "Duodess" suffix (Mammut rope pattern name)
    m = re.sub(r'\s+Duodess\b', '', m, flags=re.I)
    # Convert comma decimals in rope diameters: "9,8" → "9.8"
    m = re.sub(r'(\d),(\d)', r'\1.\2', m)
    # Strip "mm" from model name (ropes: "9.8 mm" or "9.8mm")
    m = re.sub(r'(\d)\s*mm\b', r'\1', m)

    # ── Quickdraw-specific stripping ──
    # Strip "N cm" size (quickdraws)
    m = re.sub(r'\s+\d+\s*cm\b', '', m, flags=re.I)
    # Strip "Set" from quickdraw "Rockit Set" style names only if followed by cm (already stripped)
    # NOTE: Do NOT strip trailing "Set" generically — it's part of model names like "Pure Set", "Pure Wire Set"
    # Strip Salewa "Dyn " prefix (dynamic designation)
    m = re.sub(r'^Dyn\s+', '', m, flags=re.I)
    # Strip orientation descriptors: "Straight/ Bent", "Wire/ Wire", "STR/BNT"
    m = re.sub(r'\s+(?:Straight|STR|Wire|Bent|BNT)[/\s]*(?:Straight|STR|Wire|Bent|BNT)?\s*$', '', m, flags=re.I)
    # Strip "Pack" suffix (Petzl: "Dijnn Axess Pack")
    m = re.sub(r'\s+Pack\s*$', '', m, flags=re.I)
    # Strip "Long Draws" + length (Metolius: "Bravo II Long Draws 30,5cm")
    m = re.sub(r'\s+Long\s+Draws?\b.*$', '', m, flags=re.I)

    # ── Belay-specific stripping ──
    # Strip "Belay Set" prefix (Ocun: "Belay Set Condor")
    m = re.sub(r'^Belay\s+Set\s+', '', m, flags=re.I)

    # ── General stripping ──
    # Strip trailing color descriptors
    m = re.sub(r'\s+(?:orange|blue|green|red|yellow|pink|turquoise|black|white|grey|gray|purple)\s*$', '', m, flags=re.I)
    # Strip "Standplatzschlinge" (personal anchor)
    m = re.sub(r'\s+Standplatzschlinge\b', '', m, flags=re.I)
    m = re.sub(r'\s+Selbstsicherungsschlinge\b', '', m, flags=re.I)
    # Strip "Kletterzubehör" (climbing accessory)
    m = re.sub(r'\s+Kletterzubehör\b', '', m, flags=re.I)
    # Strip "Chalkbag", "Chalk" suffixes
    m = re.sub(r'\s+Chalkbag\b', '', m, flags=re.I)
    m = re.sub(r'\s+Chalk\b', '', m, flags=re.I)
    # Strip weight/volume: "56g", "200ml", "300g", "200g"
    m = re.sub(r'\s+\d+\s*(?:g|ml|l)\b', '', m, flags=re.I)

    # Clean up
    m = re.sub(r'\s+', ' ', m).strip()
    m = re.sub(r'\s*-\s*$', '', m).strip()

    return m


def get_total_products(html):
    """Extract total product count from page.
    Format: "1-60 of 337" or "60 of 337"
    """
    match = re.search(r'(\d+)\s+of\s+(\d+)', html)
    if match:
        return int(match.group(2))
    return 0


def extract_products_from_html(html):
    """Extract products from sportokay.com listing page HTML.

    Returns list of product dicts with: url, title, brand, model, price, old_price, image_url
    """
    # Split by <article class="b_catalog-product-list-item
    items = re.split(r'(?=<article\s+class="b_catalog-product-list-item[\s"])', html)
    items = [i for i in items if i.startswith('<article')]

    products = []
    seen_urls = set()

    for card in items:
        # Product name from itemprop="name"
        name_m = re.search(r'itemprop="name"[^>]*>\s*([^<]+)', card)
        if not name_m:
            continue
        title = htmlmod.unescape(name_m.group(1).strip())

        # URL from <a href="..." data-url-type="product-view">
        url_m = re.search(
            r'<a\s+href="(https://www\.sportokay\.com/de_de/[^"]+\.html)(?:#[^"]*)?"[^>]*data-url-type="product-view"',
            card
        )
        if not url_m:
            continue
        url = url_m.group(1)

        # Deduplicate by URL
        if url in seen_urls:
            continue
        seen_urls.add(url)

        # Detect brand from product name
        brand = detect_brand(title)
        if not brand:
            continue

        # Price from schema.org microdata
        price_m = re.search(r'itemprop="price"\s+content="([^"]+)"', card)
        if not price_m:
            continue
        try:
            price = float(price_m.group(1))
        except (ValueError, TypeError):
            continue
        if price <= 0:
            continue

        # Old price from data-settings JSON (basePrice vs oldPrice)
        bp_m = re.search(r'&quot;basePrice&quot;:&quot;([^&]+)&quot;', card)
        op_m = re.search(r'&quot;oldPrice&quot;:&quot;([^&]+)&quot;', card)
        old_price = None
        if bp_m and op_m:
            try:
                base_p = float(bp_m.group(1))
                old_p = float(op_m.group(1))
                if old_p > base_p + 0.01:
                    old_price = old_p
            except (ValueError, TypeError):
                pass

        # Fallback: old price from HTML
        if not old_price:
            old_price_html = re.search(
                r'old-price[^>]*>.*?class="price"[^>]*>\s*([0-9.,]+)\s*€',
                card, re.DOTALL
            )
            if old_price_html:
                try:
                    op = float(old_price_html.group(1).replace('.', '').replace(',', '.'))
                    if op > price + 0.01:
                        old_price = op
                except (ValueError, TypeError):
                    pass

        # Image URL
        img_m = re.search(
            r'class="b_catalog-product-list-item__product-image"[^>]*\bsrc="([^"]+)"',
            card
        )
        if not img_m:
            img_m = re.search(
                r'src="(https://cdn[^"]+)"[^>]*class="b_catalog-product-list-item__product-image"',
                card
            )
        image_url = img_m.group(1) if img_m else None

        # Extract model from title (strip brand and category suffix)
        model = strip_sportokay_descriptors(title, brand)
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
            "_original_title": title,  # Keep for exclusion filtering
        })

    return products


def should_exclude(product, exclude_keywords, include_keywords=None):
    """Check if a product should be excluded based on keywords.

    If include_keywords is provided, the product must match at least one
    include keyword (whitelist mode), otherwise it's excluded.
    """
    # Check against the original title and model (not URL, which may contain category words)
    text = f"{product['brand']} {product['model']} {product.get('_original_title', '')}".lower()

    # Whitelist mode: must match at least one include keyword
    if include_keywords:
        if not any(kw.lower() in text for kw in include_keywords):
            return True

    # Blacklist mode: exclude if any keyword matches
    if not exclude_keywords:
        return False
    for kw in exclude_keywords:
        if kw.lower() in text:
            return True
    return False


# ── Main crawl logic ────────────────────────────────────────────────────────
# ── Size extraction (product detail pages) ─────────────────────────────────
def fetch_product_sizes(url):
    """Fetch product detail page and extract available EU sizes.
    
    Sportokay: Parse spConfigData JS variable.
    Labels are EU sizes with comma decimals (e.g. "36,5" = 36.5).
    """
    try:
        html = fetch_html(url)
        sizes = set()
        
        # Extract spConfigData variable
        config_match = re.search(r'spConfigData\s*=\s*({.*?});', html, re.DOTALL)
        if not config_match:
            return None
        
        try:
            config_data = json.loads(config_match.group(1))
            # Find the size attribute
            attributes = config_data.get('attributes', {})
            for attr_id, attr_info in attributes.items():
                if attr_info.get('code') == 'size':
                    options = attr_info.get('options', [])
                    for opt in options:
                        label = opt.get('label', '').strip()
                        # Labels are EU sizes with comma decimal: "36,5" -> "36.5"
                        eu_size_str = label.replace(',', '.')
                        try:
                            eu_val = float(eu_size_str)
                            # Valid EU climbing shoe sizes: 28-50
                            if 28 <= eu_val <= 50:
                                sizes.add(str(eu_val) if eu_val != int(eu_val) else str(int(eu_val)))
                        except ValueError:
                            continue
        except (json.JSONDecodeError, KeyError, AttributeError):
            return None
        
        if not sizes:
            return None
        
        def size_sort_key(s):
            try:
                return float(s)
            except ValueError:
                return 999
        
        return sorted(sizes, key=size_sort_key)
    except Exception as e:
        print(f"    ⚠ Could not fetch sizes from {url}: {e}")
        return None
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
                    time.sleep(1.0)  # Be polite
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
    include_kw = cat_config.get("include_keywords", None)
    products = []
    excluded_count = 0
    for p in all_products:
        if should_exclude(p, exclude_kw, include_kw):
            excluded_count += 1
            continue
        products.append(p)

    if excluded_count:
        print(f"  ({excluded_count} non-relevant products excluded by keyword filter)")
    print(f"  → {len(products)} products after filtering")

    if not products:
        return 0, 0

    # Fetch sizes from product detail pages (shoes only)
    if cat_name == "shoes":
        print(f"  Fetching sizes from {len(products)} product pages...")
        for i, p in enumerate(products):
            sizes = fetch_product_sizes(p["product_url"])
            p["sizes_available"] = sizes
            if (i + 1) % 25 == 0 or (i + 1) == len(products):
                with_sizes = sum(1 for pp in products[:i+1] if pp.get("sizes_available"))
                print(f"    {i+1}/{len(products)} pages fetched ({with_sizes} with sizes)")
            time.sleep(1.0)


    now = datetime.now(timezone.utc).isoformat()
    matched = 0
    rows = []

    for p in products:
        slug, confidence = match_slug(p["brand"], p["model"], ref_lookup)
        if slug:
            matched += 1

        row = {
            "product_slug": slug,
            "retailer": RETAILER,
            "country": COUNTRY,
            "product_url": p["product_url"],
            "product_name": p["product_name"],
            "brand": p["brand"],
            "model": p["model"],
            "image_url": p["image_url"],
            "match_confidence": confidence if slug else None,
            "price_eur": p["price_eur"],
            "original_price_eur": p["original_price_eur"],
            "currency": "EUR",
            "sizes_available": json.dumps(p["sizes_available"]) if p.get("sizes_available") else None,
            "in_stock": True,  # listing presence = available (no out-of-stock detection)
            "last_crawled_at": now,
            "updated_at": now,
        }
        rows.append(row)

    print(f"  Matched: {matched}/{len(products)} ({100*matched//len(products) if products else 0}%)")

    # Print unmatched for debugging
    unmatched = [(p["brand"], p["model"]) for p, r in zip(products, rows) if r["product_slug"] is None]
    if unmatched and len(unmatched) <= 50:
        print(f"  Unmatched products:")
        for brand, model in sorted(unmatched):
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
    # Remove shoe-only field for non-shoe tables
    if price_table != "shoe_prices":
        for row in rows:
            row.pop("sizes_available", None)
    # For ropes: delete old rows first (length variants change URLs, so old rows become stale)
    if price_table == "rope_prices":
        print(f"  Deleting old {RETAILER} rows from {price_table}...")
        supabase_delete(price_table, RETAILER)
    # For non-rope tables, mark stale products before upsert
    else:
        existing = supabase_count_rows(price_table, RETAILER)
        if existing > 0 and len(rows) < existing * 0.5:
            print(f"  ⚠ Safety skip: found {len(rows)} rows but {existing} exist "
                  f"in {price_table} — not marking out-of-stock (threshold: 50%)")
        else:
            print(f"  Marking stale {RETAILER} rows as out-of-stock...")
            supabase_mark_all_out_of_stock(price_table, RETAILER)

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

    print(f"sportokay.com Crawler")
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
    print(f"{'='*60}")
