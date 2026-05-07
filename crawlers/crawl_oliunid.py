#!/usr/bin/env python3
"""
oliunid.de crawler → per-category Supabase price tables.

oliunid.de is a Magento 2 shop (Italian climbing retailer, German locale).
Product data on listing pages:
  - Name: <a class="product-item-link" href="URL">Brand Model Suffix</a>
  - Price: <span data-price-amount="159.9" data-price-type="finalPrice">
  - Old price: <span data-price-amount="200" data-price-type="oldPrice">
  - Product ID: data-product-id="69053"

Brand is embedded in product name with quirky prefixes:
  "BD Black Diamond" → Black Diamond
  "5.10 Five Ten" → Five Ten
  "CT Climbing Technology" → Climbing Technology

Pagination: ?p=1, ?p=2, etc. ~36 products per page.

Usage:
    python3 crawl_oliunid.py              # crawl all categories
    python3 crawl_oliunid.py shoes        # crawl one category
    python3 crawl_oliunid.py shoes ropes  # crawl multiple
"""

import sys, re, json, time, math, urllib.request, urllib.parse, html as htmlmod
from datetime import datetime, timezone

# ── Config ──────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SECRET_KEY"]  # set in ~/.cgkeys, not committed
ANON_KEY    = "sb_publishable_dG9yKzuhsr2DtSHIh9-cXg_DhZbfYkr"

RETAILER = "oliunid.de"
COUNTRY  = "DE"
BASE_URL = "https://www.oliunid.de"
PRODUCTS_PER_PAGE = 36

# Known brand prefixes in oliunid product names.
# oliunid uses quirky brand prefixes like "BD Black Diamond", "5.10 Five Ten"
KNOWN_BRANDS = [
    # Multi-word brands with oliunid-specific prefixes (check first)
    "BD Black Diamond", "5.10 Five Ten", "CT Climbing Technology",
    # Standard multi-word brands
    "La Sportiva", "Black Diamond", "Red Chili", "Climbing Technology",
    "Wild Country", "Blue Ice", "Mad Rock", "Singing Rock", "So iLL",
    "Rock Empire", "Moon Climbing", "Five Ten", "Andrea Boldrini",
    "Wild Climb",
    # Single-word brands
    "Scarpa", "Evolv", "Ocun", "Boreal", "Edelrid", "Petzl", "Mammut",
    "Beal", "Camp", "DMM", "Salewa", "Kong", "Grivel", "Tendon", "Simond",
    "AustriAlpin", "Butora", "Unparallel", "EB", "LACD", "Ferrino",
    "Lowa", "Metolius", "Fixe", "Stubai", "Tenaya", "Edelweiss",
    "Snap", "Brazz", "Ocún",
]

# Brand name normalization (oliunid name → canonical)
BRAND_CLEAN = {
    "bd black diamond": "Black Diamond",
    "5.10 five ten": "Five Ten",
    "ct climbing technology": "Climbing Technology",
    "scarpa": "Scarpa",
    "la sportiva": "La Sportiva",
    "black diamond": "Black Diamond",
    "red chili": "Red Chili",
    "evolv": "Evolv",
    "ocun": "Ocun",
    "ocún": "Ocun",
    "boreal": "Boreal",
    "edelrid": "Edelrid",
    "petzl": "Petzl",
    "mammut": "Mammut",
    "beal": "Beal",
    "camp": "Camp",
    "climbing technology": "Climbing Technology",
    "dmm": "DMM",
    "wild country": "Wild Country",
    "wild climb": "Wild Climb",
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
    "edelweiss": "Edelweiss",
    "snap": "Snap",
    "brazz": "Brazz",
}

# Category suffixes to strip from product names (German + English)
CATEGORY_SUFFIXES = [
    'kletterschuhe', 'kletterschuh', 'climbing shoes', 'climbing shoe',
    'kletterseil', 'kletterseile', 'halbseil', 'zwillingsseil', 'einfachseil',
    'halbe seil klettern', 'halbe kletterseil',
    'crashpad', 'crash pad', 'bouldermatte', 'boulderpad',
    'express-set', 'express set', 'expressset', 'expressen', 'expressschlinge', 'expressschlingen', 'expresssets',
    'kletterhelm', 'kletterhelme',
    'klettergurt', 'klettergurte',
    'sicherungsgerät', 'sicherungsgeraet', 'abseilgerät', 'abseilgeraet',
    'belay device', 'belay kit',
    'karabiner', 'kletterkarabiner', 'klettersteig karabiner', 'klettersteigkarabiner',
    'quickdraw', 'quickpack',
    'klettersteig sicherung', 'klettersteig sicherungen',
    'schnellzugriff klettersteig',
]

# ── Exclusion keywords per category ──
SHOE_EXCLUDE = [
    'sock', 'socks', 'shoe bag', 'schuhbeutel',
    'zubehör', 'resoling', 'besohlung',
    'approach', 'zustieg', 'wanderschuh', 'hiking',
    'bergschuhe', 'bergschuh', 'trekkingschuhe', 'trekkingschuh',
    'eiskletterschuhe', 'eiskletterschuh',
    'gore-tex', 'gtx',
    'mojito',
]

ROPE_EXCLUDE = [
    'rope brush', 'seilbürste', 'seilsack', 'rope bag',
    'reepschnur', 'reepschnüre', 'cordelette', 'prusik',
    'bandschlinge', 'seilrucksack',
    'pro meter', 'nach meter', 'per meter', 'per metre',
    'semi-static', 'semi static', 'statik', 'statische', 'statisches',
    'halb-statische', 'halbstatisch', 'semistatische',
    'cord tec', 'industrie', 'spelenium', 'auxiliary',
    'messer', 'knife', 'rope cleaner',
    'seilmarker', 'rope marker', 'seilschutz',
    'seiltrageplane', 'seilplane', 'rope tarp',
    'kit seil', 'kit ', 'oliunìd',
    'höhlenforschung', 'speleo',
    'gletscherseil', 'glacier',
]

BELAY_EXCLUDE = [
    'steigklemme', 'ascender', 'tibloc', 'bloquer',
    'ohm', 'bremsassistent',
    'pulley', 'seilrolle', 'traxion',
    'ropeman',
    'via ferrata', 'klettersteig',
    'achter', 'huit', 'super 8',
    'swivel', 'wirbel',
    'standplatzschlinge', 'selbstsicherungsschlinge',
    'connect adjust', 'dual connect',
    'switch double',
    'escaper', 'pirana',
    'blockierende handgriff', 'index',
    'package', 'paket',
    'arbeiten in der höhe', 'arbeit', 'höhenrettung',
    'höhlenforschung', 'speleo', 'speleologie',
    'flaschenzug', 'fußblockierer', 'brustblockierer',
    'blockierer', 'blockierend', 'blockierende',
    'rettungskit', 'rettungsrolle',
    'otto', 'figure 8', 'big 8',
    'gurtenschoner', 'seilschutz', 'seilregler',
    'rolle ', 'einfache rolle', 'doppelte rolle',
    'umlenkrolle', 'prusikrolle', 'knotenauslass',
    'ersatzrolle', 'notfallrolle',
    'pantin', 'fettuccia', 'lever für',
    'tapehalter',
    'hand cruiser', 'mago 8', 'rescue 8',
]

QUICKDRAW_EXCLUDE = [
    'klettersteigset', 'klettersteig set', 'via ferrata set',
    'schlinge', 'runner', 'sling', 'bandschlinge',
    'schraubglied', 'maillon',
    'schnappkarabiner',
    'reepschnur', 'dogbone',
    'materialkarabiner',
    'daisy chain', 'daisychain',
    'chalk',
    'clipstick', 'teleskopstock',
    'gurtenschoner', 'rope protector',
    'fettuccia da rinvio',
    'cable',
]

HELMET_EXCLUDE = [
    'helmhalter', 'helmbefestigung', 'helmclip',
    'höhenarbeit', 'hohenarbeit', 'work',
]

CRASHPAD_EXCLUDE = [
    'piggyback', 'tragesystem', 'carrying',
    'sitstarter', 'sit start', 'sitstart',
    'zubehör', 'accessory',
    'tasche', 'bag', 'beutel',
    'tarp',
]

CATEGORIES = {
    "shoes": {
        "urls": [f"{BASE_URL}/schuhe/kletterschuhe"],
        "price_table": "shoe_prices",
        "ref_table": "shoes",
        "exclude_keywords": SHOE_EXCLUDE,
    },
    "ropes": {
        "urls": [f"{BASE_URL}/klettern/kletterseile"],
        "price_table": "rope_prices",
        "ref_table": "ropes",
        "exclude_keywords": ROPE_EXCLUDE,
    },
    "belays": {
        "urls": [f"{BASE_URL}/ausrustung/kletterhardware/sicherungs-und-abseilgerate"],
        "price_table": "belay_prices",
        "ref_table": "belay_devices",
        "exclude_keywords": BELAY_EXCLUDE,
    },
    "quickdraws": {
        "urls": [f"{BASE_URL}/ausrustung/kletterhardware/kletter-expresssets"],
        "price_table": "quickdraw_prices",
        "ref_table": "quickdraws",
        "exclude_keywords": QUICKDRAW_EXCLUDE,
    },
    "helmets": {
        "urls": [f"{BASE_URL}/klettern/kletterhelme"],
        "price_table": "helmet_prices",
        "ref_table": None,
        "exclude_keywords": HELMET_EXCLUDE,
    },
    "harnesses": {
        "urls": [f"{BASE_URL}/klettern/sitzgurte"],
        "price_table": "harness_prices",
        "ref_table": None,
        "exclude_keywords": [],
    },
    "crashpads": {
        "urls": [f"{BASE_URL}/klettern/crash-pad-boulder"],
        "price_table": "crashpad_prices",
        "ref_table": "crashpads",
        "exclude_keywords": CRASHPAD_EXCLUDE,
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
        urllib.request.urlopen(req, timeout=30)
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
            # Hyphen-to-space variant
            if "-" in model:
                hyphen_model = model.replace("-", " ")
                hyphen_model = re.sub(r"\s+", " ", hyphen_model).strip()
                lookup[(brand, hyphen_model)] = slug
            # normalize_model_name variant
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
    """Strip German/English category suffixes from product names."""
    m = name
    # Strip long German suffixes first
    m = re.sub(r'\s+(?:für das|für die|für|zum|mit becher für)\s+klettern\b.*$', '', m, flags=re.I)
    m = re.sub(r'\s+klettertechnik\b.*$', '', m, flags=re.I)
    m = re.sub(r'\s+boulder\s+(?:klettern|zubehör)\b.*$', '', m, flags=re.I)
    m = re.sub(r'\s+(?:schlingen\s+für\s+das\s+klettern)\b.*$', '', m, flags=re.I)
    # Strip crashpad brand prefixes/suffixes
    m = re.sub(r'\bSnapclimbing\s+', '', m, flags=re.I)
    m = re.sub(r'\s+BrazzPad\b', '', m, flags=re.I)
    # Strip "Kletterteppich" (climbing carpet)
    m = re.sub(r'\s+Kletterteppich\b', '', m, flags=re.I)
    # Strip "Klettersteig" suffix (oliunid appends this to quickdraw names)
    m = re.sub(r'\s+Klettersteig\b', '', m, flags=re.I)
    # Strip trailing "kletter" (oliunid generic climbing suffix)
    m = re.sub(r'\s+kletter\s*$', '', m, flags=re.I)
    # Strip trailing "climbing"
    m = re.sub(r'\s+climbing\s*$', '', m, flags=re.I)
    # Then standard category suffixes
    for suffix in CATEGORY_SUFFIXES:
        pattern = r'\s*-?\s*' + re.escape(suffix) + r'(?:\s*-?\s*(?:herren|damen|kinder|unisex))?$'
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
    # Normalize common forms
    m = re.sub(r'\blaces\b', 'lace', m, flags=re.I)
    m = re.sub(r'\bJr\.?\b', 'Junior', m, flags=re.I)
    m = re.sub(r'\bSpirit\s+4\b', 'Spirit VCR', m, flags=re.I)
    # Strip stray periods
    m = re.sub(r'\.(?=\s|$)', '', m)
    m = re.sub(r'\s+vcr\b', '', m, flags=re.I).strip()
    # Split concatenated model+version: "Jul2" → "Jul 2"
    m = re.sub(r'([a-zA-Z])(\d)', r'\1 \2', m)
    m = re.sub(r'\s+', ' ', m).strip()
    # Strip trailing descriptors
    m = re.sub(r'\s+(quickdraw|quickpack|express set|belay device|belay package|belay kit|belay|kit|assorted)\b.*$', '', m, flags=re.I).strip()
    m = re.sub(r'\s+quickpk\b.*$', '', m, flags=re.I).strip()
    m = re.sub(r'^pack\s+\d+\s+', '', m, flags=re.I).strip()
    m = re.sub(r'\s+pack\s+\d+\b.*$', '', m, flags=re.I).strip()
    m = re.sub(r'\s+\d+\s*pack\b.*$', '', m, flags=re.I).strip()
    m = re.sub(r'\s+qd\b.*$', '', m, flags=re.I).strip()
    m = re.sub(r'\s+\d+\s*cm\s*$', '', m).strip()
    # Strip trailing length like "100 m", "80 m" but not diameter like "9.5 mm"
    m = re.sub(r'\s+\d+\s*m\s*$', '', m)
    # Strip "halbe" (German for "half rope") trailing context
    m = re.sub(r'\s+halbe\b.*$', '', m, flags=re.I)
    # Strip German rope type descriptors
    m = re.sub(r'\s+(?:doppelseil|einfachseil|zwillingsseil|schwarze|klassische)\b.*$', '', m, flags=re.I)
    # Strip "Rope" suffix (Mammut uses "9.5 Crag Classic Rope")
    m = re.sub(r'\s+Rope\s*$', '', m, flags=re.I)
    # Strip "SC" (Safe Control abbreviation) but keep "Safe Control" for ref match
    m = re.sub(r'\s+SC\b(?!\s)', '', m)
    # Rope compound splits
    rope_compound_splits = {
        'iceline': 'ice line',
        'wallcruiser': 'wall cruiser',
    }
    m_lower = m.lower()
    for compound, split in rope_compound_splits.items():
        if compound in m_lower:
            m = re.sub(compound, split, m, flags=re.I)
    m = re.sub(r'\s+', ' ', m).strip()
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
    return None


def match_slug(brand, model, ref_lookup):
    """Try to match a crawled product to a reference slug.

    Multi-strategy matching with confidence scores.
    """
    if not ref_lookup:
        return None, 0.0

    b = normalize(brand)
    m = normalize(model)

    # Brand normalization
    brand_norm_map = {
        "c.a.m.p.": "camp", "camp": "camp",
        "ocún": "ocun", "ocun": "ocun",
        "climbing technology": "climbing technology",
        "adidas five ten": "five ten", "adidas": "five ten",
        "five ten": "five ten", "eb": "eb",
        "bd black diamond": "black diamond",
        "5.10 five ten": "five ten",
        "ct climbing technology": "climbing technology",
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

    # 6b2. Strip generation numbers after model name (e.g., "Booster 3" → "Booster", "Stinger 3" → "Stinger")
    # This handles oliunid's "III" → "3" conversion when ref doesn't have the generation
    m_no_gen = re.sub(r'^(\S+)\s+\d\b', r'\1', m_norm).strip()
    if m_no_gen != m_norm:
        # Try full match without generation
        rest = m_norm[len(m_norm.split()[0]):].strip()
        rest = re.sub(r'^\d+\s*', '', rest).strip()
        m_try = f"{m_norm.split()[0]} {rest}".strip() if rest else m_norm.split()[0]
        if (b, m_try) in ref_lookup:
            return ref_lookup[(b, m_try)], 0.85

    # 6c. Rope-specific: progressively strip rope treatments, checking after each
    rope_strip_patterns = [
        r'\s+unicore\b',
        r'\s+golden\s+dry\b',
        r'\s+dry\s+cover\b',
        r'\s+safe\s+control\b',
        r'\s+complete\s+shield\b',
        r'\s+eco\s+dry\b',
        r'\s+protect\s+pro\s+dry\b',
        r'\s+classic\b',
        r'\s+xeros\b',
        r'\s+supereverdry\b',
        r'\s+everdry\b',
        r'\s+duodess\b',
        r'\s+endurance\b',
        r'\s+ts\b',
    ]
    m_rope = m_norm
    for pat in rope_strip_patterns:
        m_rope_new = re.sub(pat, '', m_rope, flags=re.I).strip()
        m_rope_new = re.sub(r'\s+', ' ', m_rope_new).strip()
        if m_rope_new != m_rope:
            m_rope = m_rope_new
            if (b, m_rope) in ref_lookup:
                return ref_lookup[(b, m_rope)], 0.85

    # 7. Subset matching: check if any ref model is a subset of our model or vice versa
    for (rb, rm), rs in ref_lookup.items():
        if rb != b:
            continue
        if len(rm) > 3 and rm in m_norm:
            return rs, 0.85
        if len(m_norm) > 3 and m_norm in rm:
            return rs, 0.85

    # 7b. Word-set overlap: check if all words in shorter model appear in longer
    m_words = set(m_norm.split())
    for base in [m_norm, m_rope if 'm_rope' in dir() else m_norm]:
        b_words = set(base.split())
        for (rb, rm), rs in ref_lookup.items():
            if rb != b:
                continue
            r_words = set(rm.split())
            # If all words of the shorter are in the longer, good match
            if len(b_words) >= 2 and b_words.issubset(r_words):
                return rs, 0.8
            if len(r_words) >= 2 and r_words.issubset(m_words):
                return rs, 0.8
        break  # only try first base

    # 7c. Space-collapsed matching (e.g., "ion r" vs "ionr")
    m_nospace = re.sub(r'\s+', '', m_norm)
    for (rb, rm), rs in ref_lookup.items():
        if rb != b:
            continue
        rm_nospace = re.sub(r'\s+', '', rm)
        if m_nospace == rm_nospace:
            return rs, 0.85

    return None, 0.0


# ── HTML parsing ────────────────────────────────────────────────────────────
def detect_brand(title):
    """Detect brand from product title using known brand list."""
    title_lower = title.lower()
    for brand in KNOWN_BRANDS:
        if title_lower.startswith(brand.lower() + " "):
            canonical = BRAND_CLEAN.get(brand.lower(), brand)
            return canonical, title[len(brand):].strip()
    # Fallback: first word
    parts = title.split(None, 1)
    if len(parts) == 2:
        brand_guess = parts[0]
        canonical = BRAND_CLEAN.get(brand_guess.lower(), brand_guess)
        return canonical, parts[1]
    return title, ""


def extract_products_from_html(html):
    """Extract products from oliunid listing page HTML.

    Returns list of product dicts with: url, title, brand, model, price, old_price
    """
    products = []

    # Find all product-item-info blocks by splitting on them
    # Each product card has: product-item-link (name+URL), data-price-amount (prices)
    blocks = re.split(r'(?=<div\s+class="product-item-info[\s"])', html)

    for block in blocks:
        if 'product-item-link' not in block:
            continue

        # Extract product URL and title
        link_match = re.search(
            r'<a\s+class="product-item-link"\s+href="([^"]+)"[^>]*>(.*?)</a>',
            block, re.S
        )
        if not link_match:
            continue

        url = link_match.group(1).strip()
        title = re.sub(r'\s+', ' ', link_match.group(2)).strip()
        title = htmlmod.unescape(title)

        if not url or not title:
            continue

        # Extract current price
        price_match = re.search(
            r'data-price-amount="([^"]+)"\s*data-price-type="finalPrice"',
            block
        )
        price = float(price_match.group(1)) if price_match else None

        # Extract old price
        old_price_match = re.search(
            r'data-price-amount="([^"]+)"\s*data-price-type="oldPrice"',
            block
        )
        old_price = float(old_price_match.group(1)) if old_price_match else None

        # Skip if old_price equals price (no real discount)
        if old_price and price and old_price == price:
            old_price = None

        # Detect brand and model
        brand, model_raw = detect_brand(title)
        model = strip_category_suffix(model_raw)

        # Clean up model
        model = re.sub(r'\s+', ' ', model).strip()
        if not model:
            model = model_raw

        products.append({
            "url": url,
            "title": title,
            "brand": brand,
            "model": model,
            "price": price,
            "old_price": old_price,
        })

    return products


# ── Size extraction (product detail pages) ─────────────────────────────────
def fetch_product_sizes(url):
    """Fetch oliunid product detail page and extract available EU sizes.

    oliunid uses Magento 2 with jsonConfig embedded in a <script> tag.
    Sizes are in: jsonConfig.attributes.*.options[*].label
    The attribute code is typically 'taglia_scapette' (shoe size).

    Out-of-stock sizes are excluded using the jsonConfig 'unavailable' array,
    which lists product IDs that are not currently salable.
    """
    try:
        html = fetch_html(url)

        def _parse_jsonconfig(jc):
            """Extract in-stock sizes from a parsed jsonConfig dict.

            Uses the 'unavailable' array to filter out out-of-stock sizes.
            Each size option has a 'products' list of variant IDs — if ALL
            of a size's product IDs are in 'unavailable', that size is OOS.
            """
            unavailable = set(str(x) for x in jc.get('unavailable', []))
            attrs = jc.get('attributes', {})
            for aid, ainfo in attrs.items():
                code = ainfo.get('code', '')
                if any(x in code.lower() for x in ['taglia', 'size', 'groesse', 'schuh']):
                    sizes = []
                    for opt in ainfo.get('options', []):
                        label = opt.get('label', '')
                        if not label or not re.match(r'^\d', label):
                            continue
                        # Check stock: skip if ALL product IDs are unavailable
                        product_ids = [str(p) for p in opt.get('products', [])]
                        if product_ids and all(pid in unavailable for pid in product_ids):
                            continue  # This size is out of stock
                        label = re.sub(r'\s*\u00bd', '.5', label).replace(',', '.').strip()
                        label = re.sub(r'\s+\u2154', '.67', label)  # ⅔
                        label = re.sub(r'\s+\u2153', '.33', label)  # ⅓
                        label = re.sub(r'\s+2/3', '.67', label)
                        label = re.sub(r'\s+1/3', '.33', label)
                        label = re.sub(r'\s+1/2', '.5', label)
                        label = re.sub(r'\s+', '', label)  # Remove any remaining spaces
                        sizes.append(label)
                    if sizes:
                        def size_sort_key(s):
                            try: return float(s)
                            except ValueError: return 999
                        return sorted(sizes, key=size_sort_key)
            return None

        # Strategy 1: jsonConfig in <script> tags (oliunid's actual pattern)
        for m in re.finditer(r'<script[^>]*>(.*?)</script>', html, re.DOTALL):
            script = m.group(1)
            if '"jsonConfig"' not in script:
                continue
            jc_match = re.search(r'"jsonConfig"\s*:\s*(\{)', script)
            if not jc_match:
                continue
            idx = jc_match.end() - 1
            depth = 0
            end = idx
            for i in range(idx, min(idx + 100000, len(script))):
                if script[i] == '{': depth += 1
                elif script[i] == '}':
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            try:
                jc = json.loads(script[idx:end])
                result = _parse_jsonconfig(jc)
                if result:
                    return result
            except (json.JSONDecodeError, KeyError):
                continue

        # Strategy 2: data-mage-init attribute (fallback)
        inits = re.findall(r"data-mage-init='(\{[^']+\})'", html)
        for init in inits:
            if 'jsonConfig' not in init:
                continue
            try:
                d = json.loads(init)
                for key in d:
                    if 'swatch' not in key.lower() and 'configurable' not in key.lower():
                        continue
                    config = d[key]
                    jc = config.get('jsonConfig', {})
                    if isinstance(jc, str):
                        jc = json.loads(jc)
                    result = _parse_jsonconfig(jc)
                    if result:
                        return result
            except (json.JSONDecodeError, KeyError):
                continue

        return None
    except Exception as e:
        print(f"    ⚠ Could not fetch sizes from {url}: {e}")
        return None


def fetch_rope_lengths(url):
    """Fetch oliunid product detail page and extract rope length variants with prices.

    Uses Magento 2 jsonConfig: attribute 'lunghezza' (length) has options like "60 m", "70 m"
    with product IDs. optionPrices maps product IDs to prices.
    Returns list of dicts: {length_m, price_eur, original_price_eur, in_stock}
    """
    try:
        html = fetch_html(url)

        def _extract_jsonconfig(html_content):
            """Extract the jsonConfig dict from Magento page HTML."""
            # Strategy 1: text/x-magento-init script tags
            for m in re.finditer(r'<script\s+type="text/x-magento-init"[^>]*>(.*?)</script>', html_content, re.DOTALL):
                script = m.group(1)
                if 'jsonConfig' not in script:
                    continue
                try:
                    data = json.loads(script)
                    for selector, config in data.items():
                        for component, cfg in config.items():
                            if isinstance(cfg, dict) and 'jsonConfig' in cfg:
                                jc = cfg['jsonConfig']
                                if isinstance(jc, str):
                                    jc = json.loads(jc)
                                return jc
                except (json.JSONDecodeError, TypeError, AttributeError):
                    continue

            # Strategy 2: jsonConfig in regular script tags
            for m in re.finditer(r'<script[^>]*>(.*?)</script>', html_content, re.DOTALL):
                script = m.group(1)
                if '"jsonConfig"' not in script:
                    continue
                jc_match = re.search(r'"jsonConfig"\s*:\s*(\{)', script)
                if not jc_match:
                    continue
                idx = jc_match.end() - 1
                depth = 0
                end = idx
                for i in range(idx, min(idx + 100000, len(script))):
                    if script[i] == '{': depth += 1
                    elif script[i] == '}':
                        depth -= 1
                        if depth == 0:
                            end = i + 1
                            break
                try:
                    return json.loads(script[idx:end])
                except json.JSONDecodeError:
                    continue
            return None

        jc = _extract_jsonconfig(html)
        if not jc:
            return None

        attrs = jc.get('attributes', {})
        opt_prices = jc.get('optionPrices', {})

        # Find length attribute (lunghezza, length, laenge, etc.)
        length_attr = None
        for aid, ainfo in attrs.items():
            code = ainfo.get('code', '').lower()
            label = ainfo.get('label', '').lower()
            if any(x in code for x in ['lunghezza', 'length', 'laenge', 'rope_length']):
                length_attr = ainfo
                break
            if any(x in label for x in ['länge', 'length', 'lunghezza', 'longitud']):
                length_attr = ainfo
                break

        if not length_attr:
            return None

        results = []
        for opt in length_attr.get('options', []):
            label = opt.get('label', '').strip()
            products = opt.get('products', [])
            if not label or not products:
                continue

            # Parse length from label: "60 m" → 60
            lm = re.match(r'(\d+)\s*m', label)
            if not lm:
                continue
            length_m = int(lm.group(1))
            if length_m < 15 or length_m > 200:
                continue

            # Get price from first product with a valid price
            best_price = None
            best_old = None
            for pid in products:
                price_data = opt_prices.get(str(pid), {})
                final = price_data.get('finalPrice', {}).get('amount')
                old = price_data.get('oldPrice', {}).get('amount')
                if final:
                    if best_price is None or final < best_price:
                        best_price = final
                        best_old = old if old and old != final else None

            if best_price:
                results.append({
                    "length_m": length_m,
                    "price_eur": round(best_price, 2),
                    "original_price_eur": round(best_old, 2) if best_old else None,
                    "in_stock": True,  # Magento only shows available options
                })

        return results if results else None

    except Exception as e:
        print(f"    ⚠ Could not fetch rope lengths from {url}: {e}")
        return None


# ── Crawl + upsert ──────────────────────────────────────────────────────────
def crawl_category(cat_key):
    """Crawl one category and upsert to Supabase."""
    cat = CATEGORIES[cat_key]
    print(f"\n{'='*60}")
    print(f"  Crawling: {cat_key}")
    print(f"{'='*60}")

    ref_lookup = load_reference_slugs(cat.get("ref_table"))
    if ref_lookup:
        print(f"  → {len(ref_lookup)} reference entries loaded")
    else:
        print(f"  → No reference table")

    exclude_kw = [kw.lower() for kw in cat.get("exclude_keywords", [])]
    all_products = []

    for base_url in cat["urls"]:
        page = 1
        consecutive_empty = 0

        while True:
            url = f"{base_url}?p={page}" if page > 1 else base_url
            print(f"  Page {page}: {url}")

            try:
                html = fetch_html(url)
            except urllib.error.HTTPError as e:
                print(f"    HTTP {e.code} – stopping")
                break
            except Exception as e:
                print(f"    Error: {e} – stopping")
                break

            products = extract_products_from_html(html)
            if not products:
                consecutive_empty += 1
                if consecutive_empty >= 2:
                    break
                page += 1
                continue

            consecutive_empty = 0

            # Filter excluded products
            kept = 0
            for p in products:
                title_lower = p["title"].lower()
                if any(kw in title_lower for kw in exclude_kw):
                    continue

                # Match slug
                slug, confidence = match_slug(p["brand"], p["model"], ref_lookup)

                row = {
                    "retailer": RETAILER,
                    "product_url": p["url"],
                    "brand": p["brand"],
                    "model": p["model"],
                    "price_eur": p["price"],
                    "original_price_eur": p["old_price"],
                    "country": COUNTRY,
                    "product_slug": slug,
                    "match_confidence": confidence if slug else None,
                    "in_stock": True,
                    "last_crawled_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                all_products.append(row)
                kept += 1

            print(f"    → {kept} products kept (of {len(products)} found)")

            # Check if more pages exist
            max_page_in_html = max(
                [int(x) for x in re.findall(r'\?p=(\d+)', html)] or [1]
            )
            if page >= max_page_in_html:
                break

            page += 1
            time.sleep(1.5)

    # Deduplicate by URL
    seen_urls = set()
    unique_products = []
    for p in all_products:
        if p["product_url"] not in seen_urls:
            seen_urls.add(p["product_url"])
            unique_products.append(p)

    # Fetch sizes from product detail pages (shoes only)
    if cat_key == "shoes":
        print(f"\n  Fetching sizes from {len(unique_products)} product pages...")
        for i, p in enumerate(unique_products):
            sizes = fetch_product_sizes(p["product_url"])
            p["sizes_available"] = json.dumps(sizes) if sizes else None
            if (i + 1) % 25 == 0 or (i + 1) == len(unique_products):
                with_sizes = sum(1 for pp in unique_products[:i+1] if pp.get("sizes_available"))
                print(f"    {i+1}/{len(unique_products)} pages fetched ({with_sizes} with sizes)")
            time.sleep(1.5)

    # Fetch rope lengths from product detail pages
    if cat_key == "ropes":
        print(f"\n  Fetching rope lengths from {len(unique_products)} product pages...")
        for i, p in enumerate(unique_products):
            p["rope_lengths"] = fetch_rope_lengths(p["product_url"])
            if (i + 1) % 25 == 0 or (i + 1) == len(unique_products):
                with_lengths = sum(1 for pp in unique_products[:i+1] if pp.get("rope_lengths"))
                print(f"    {i+1}/{len(unique_products)} pages fetched ({with_lengths} with lengths)")
            time.sleep(1.5)

    # Count matches
    matched = sum(1 for p in unique_products if p["product_slug"])
    total = len(unique_products)
    print(f"\n  Total: {total} unique products")
    print(f"  Matched: {matched}/{total} ({matched*100//total if total else 0}%)")

    # Show unmatched
    unmatched = [p for p in unique_products if not p["product_slug"]]
    if unmatched:
        print(f"  Unmatched products:")
        for p in sorted(unmatched, key=lambda x: (x["brand"], x["model"])):
            print(f"    - {p['brand']}: {p['model']}")

    # Build final rows for upsert
    price_table = cat['price_table']
    upsert_rows = []

    if cat_key == "ropes":
        # Expand rope products into per-length rows
        now = datetime.now(timezone.utc).isoformat()
        for p in unique_products:
            raw_text = f"{p.get('brand','')} {p.get('model','')}"
            diameter, fallback_len = extract_rope_specs(raw_text)

            base = {
                "retailer": p.get("retailer", RETAILER),
                "product_url": p["product_url"],
                "brand": p.get("brand"),
                "model": p.get("model"),
                "product_name": p.get("product_name") or f"{p.get('brand','')} {p.get('model','')}".strip(),
                "image_url": p.get("image_url"),
                "country": p.get("country", COUNTRY),
                "product_slug": p.get("product_slug"),
                "match_confidence": p.get("match_confidence"),
                "currency": "EUR",
                "last_crawled_at": now,
                "updated_at": now,
            }

            if p.get("rope_lengths"):
                for lv in p["rope_lengths"]:
                    row = dict(base)
                    row["product_url"] = p["product_url"] + f"#length_{lv['length_m']}m"
                    row["price_eur"] = lv["price_eur"]
                    row["original_price_eur"] = lv["original_price_eur"]
                    row["length_m"] = lv["length_m"]
                    row["diameter_mm"] = diameter
                    row["in_stock"] = lv["in_stock"]
                    upsert_rows.append(row)
            else:
                row = dict(base)
                row["price_eur"] = p.get("price_eur")
                row["original_price_eur"] = p.get("original_price_eur")
                row["length_m"] = fallback_len
                row["diameter_mm"] = diameter
                row["in_stock"] = True  # listing presence = available (Magento shows only available options)
                upsert_rows.append(row)

        ropes_with_lengths = sum(1 for p in unique_products if p.get("rope_lengths"))
        total_length_rows = sum(len(p["rope_lengths"]) for p in unique_products if p.get("rope_lengths"))
        print(f"  Rope lengths: {ropes_with_lengths}/{len(unique_products)} products with length data → {total_length_rows} length rows")
    else:
        upsert_rows = unique_products
        # Remove shoe-only field for non-shoe tables
        if price_table != "shoe_prices":
            for row in upsert_rows:
                row.pop("sizes_available", None)

    # For ropes: delete old rows first (length variants change URLs, so old rows become stale)
    if price_table == "rope_prices":
        print(f"  Deleting old {RETAILER} rows from {price_table}...")
        supabase_delete(price_table, RETAILER)
    # For non-rope tables, mark stale products before upsert
    else:
        existing = supabase_count_rows(price_table, RETAILER)
        if existing > 0 and len(upsert_rows) < existing * 0.5:
            print(f"  ⚠ Safety skip: found {len(upsert_rows)} rows but {existing} exist "
                  f"in {price_table} — not marking out-of-stock (threshold: 50%)")
        else:
            print(f"  Marking stale {RETAILER} rows as out-of-stock...")
            supabase_mark_all_out_of_stock(price_table, RETAILER)

    if upsert_rows:
        print(f"\n  Upserting to {price_table}...")
        batch_size = 50
        total_upserted = 0
        for i in range(0, len(upsert_rows), batch_size):
            batch = upsert_rows[i:i+batch_size]
            n = supabase_upsert(price_table, batch)
            total_upserted += n
        print(f"  ✓ Upserted {total_upserted} rows")

    return total, matched


# ── Entry point ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    cats_to_run = sys.argv[1:] if len(sys.argv) > 1 else list(CATEGORIES.keys())

    invalid = [c for c in cats_to_run if c not in CATEGORIES]
    if invalid:
        print(f"Unknown categories: {invalid}")
        print(f"Valid: {list(CATEGORIES.keys())}")
        sys.exit(1)

    print(f"oliunid.de Crawler")
    print(f"Categories: {', '.join(cats_to_run)}")

    grand_total = 0
    grand_matched = 0
    for cat_key in cats_to_run:
        total, matched = crawl_category(cat_key)
        grand_total += total
        grand_matched += matched
        if len(cats_to_run) > 1:
            time.sleep(3)

    print(f"\n{'='*60}")
    print(f"  All done! {grand_matched}/{grand_total} matched overall")
    print(f"{'='*60}")
