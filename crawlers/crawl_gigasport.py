#!/usr/bin/env python3
"""
Gigasport.at AWIN product-feed crawler -> Supabase price tables.

Downloads the Gigasport CSV data feed from AWIN's product data API (gzipped),
filters for climbing product categories, matches to reference slugs, and
upserts to the per-category price tables in Supabase.

For shoes: writes per-size rows with eur_size set (exact per-size pricing).
For gear (ropes, belays, quickdraws): writes one row per product (no per-size).

The AWIN deep link already contains the affiliate publisher ID (2786122),
so we store it directly as product_url - no frontend wrapping needed.

Usage:
    python3 crawl_gigasport.py                # crawl all categories
    python3 crawl_gigasport.py shoes          # crawl one category
    python3 crawl_gigasport.py shoes ropes    # crawl multiple
"""

import sys, re, csv, io, gzip, json, urllib.request, urllib.parse, os
from datetime import datetime, timezone

# -- Config ------------------------------------------------------------------
SUPABASE_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2MDc5MSwiZXhwIjoyMDg2MTM2NzkxfQ.6cYE1ElsvX7-BTc1DD15zoPJyr4L3bN0_QyKRQmp3M4"
ANON_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjA3OTEsImV4cCI6MjA4NjEzNjc5MX0.QH3wFa14gSvRKOz8Q099sbKvKoSroGJfPerdZgPtbTI"

RETAILER = "gigasport.at"
COUNTRY  = "AT"

# AWIN product data API URL for Gigasport (feed ID 32161, merchant 14464)
# Auto-updated daily by AWIN. Downloaded as gzipped CSV.
AWIN_FEED_URL = (
    "https://productdata.awin.com/datafeed/download/"
    "apikey/a7376aeb32d1cb9a5cba5300f7e26784/"
    "fid/32161/format/csv/language/de/"
    "delimiter/%2C/compression/gzip/"
    "columns/aw_deep_link%2Cproduct_name%2Caw_product_id%2C"
    "merchant_product_id%2Cmerchant_image_url%2Cdescription%2C"
    "merchant_category%2Csearch_price%2Cmerchant_name%2Cmerchant_id%2C"
    "category_name%2Cmerchant_deep_link%2Ccurrency%2C"
    "brand_name%2Ccolour%2Cproduct_short_description%2C"
    "specifications%2Ccondition%2Cmerchant_product_category_path%2C"
    "rrp_price%2Csavings_percent%2Cproduct_price_old%2C"
    "in_stock%2Cstock_status%2Clarge_image%2C"
    "ean%2Cmpn%2Cparent_product_id%2C"
    "Fashion%3Asuitable_for%2CFashion%3Asize%2CFashion%3Amaterial"
)

# -- Category configuration --------------------------------------------------
# Each category maps feed rows to a Supabase price table and reference table.
# "path_contains": match rows where merchant_product_category_path contains this
# "positive_keywords": if set, product name must contain at least one of these
# "exclude_keywords": skip products matching any of these
# "per_size": if True, write per-size rows (shoes); if False, one row per product (gear)

CATEGORIES = {
    "shoes": {
        "path_contains": ["Kletterschuhe"],
        "price_table": "shoe_prices",
        "ref_table": "shoes",
        "per_size": True,
        "exclude_keywords": [
            'sock', 'socks', 'shoe bag', 'schuhbeutel',
            'zubehor', 'resoling', 'besohlung',
            'approach', 'zustieg', 'wanderschuh', 'hiking',
            'traillaufschuhe', 'trailrunning', 'laufschuhe',
            'bergschuhe', 'bergschuh', 'trekkingschuhe', 'trekkingschuh',
            'eiskletterschuhe', 'eiskletterschuh',
            'gore-tex', 'gtx',
        ],
        "positive_keywords": None,
        "category_suffixes": [
            'kletterschuhe', 'kletterschuh', 'climbing shoes', 'climbing shoe',
        ],
    },
    "ropes": {
        "path_contains": ["Seile & Sicherungsgeräte"],
        "price_table": "rope_prices",
        "ref_table": "ropes",
        "per_size": False,
        "exclude_keywords": [
            # Belay devices
            'sicherungsgerät', 'sicherungsassistent', 'autotuber',
            'abseilgerät', 'grigri', 'atc', 'reverso', 'mega jul',
            'giga jul', 'pinch', 'ohm', 'neox', 'fish',
            # Trad gear (cams, nuts, ice screws)
            'eisschraube', 'ice screw', 'klemmgerät', 'friend', 'camalot',
            'klemmkeil', 'stopper', 'nut tool', 'klemmkeilentferner',
            # Pulleys, ascenders, clamps
            'seilrolle', 'umlenkrolle', 'rolle', 'pulley',
            'seilklemme', 'tibloc', 'ascender', 'traxion',
        ],
        "positive_keywords": [
            'seil', 'bergseil', 'einfachseil', 'halbseil', 'zwillingsseil',
            'rope', 'single rope', 'half rope', 'twin rope',
        ],
        "category_suffixes": [
            'bergseil', 'einfachseil', 'halbseil', 'zwillingsseil',
            'kletterseil', 'rope',
        ],
    },
    "belays": {
        "path_contains": ["Seile & Sicherungsgeräte"],
        "price_table": "belay_prices",
        "ref_table": "belay_devices",
        "per_size": False,
        "exclude_keywords": [
            # Ropes
            'seil', 'bergseil', 'einfachseil', 'halbseil', 'zwillingsseil',
            'rope',
            # Trad gear
            'eisschraube', 'ice screw',
            'klemmgerät', 'friend', 'camalot', 'cam ',
            'klemmkeil', 'stopper', 'nut tool', 'klemmkeilentferner',
            # Carabiners, accessories, bundles
            'karabiner', 'brille', 'glasses', 'handschuh', 'glove',
            'package', 'paket', 'set inkl',
            # Pulleys, ascenders, clamps
            'seilrolle', 'umlenkrolle', 'rolle', 'pulley',
            'seilklemme', 'tibloc', 'ascender', 'traxion',
        ],
        "positive_keywords": [
            'sicherungsgerät', 'sicherungsassistent', 'belay', 'abseilgerät',
            'grigri', 'atc', 'mega jul', 'giga jul', 'reverso', 'click up',
            'clickup', 'cinch', 'pivot', 'vergo', 'revo', 'matik', 'neox',
            'fish', 'pinch', 'ohm', 'tube', 'autotuber',
        ],
        "category_suffixes": [
            'sicherungsgerät', 'sicherungsassistent', 'sicherungs- und abseilgerät',
            'sicherungsassistent', 'belay device',
        ],
    },
    "quickdraws": {
        "path_contains": ["Expressen & Karabiner"],
        "price_table": "quickdraw_prices",
        "ref_table": "quickdraws",
        "per_size": False,
        "exclude_keywords": [
            'schraubglied', 'maillon', 'sling', 'bandschlinge',
            'chalk', 'tape', 'magnesium',
            # Exclude standalone carabiners - DB is for express sets + quickdraws
            'schraubkarabiner',
            # Exclude multi-packs: prices are for the pack, not per unit
            '6er pack', '5er pack', '5er set', '6er set',
            '4er pack', '3er pack', '10er',
        ],
        "positive_keywords": [
            # Only match actual quickdraw/express sets and carabiners in our DB
            'express', 'quickdraw', 'expressset', 'karabiner', 'carabiner',
        ],
        "category_suffixes": [
            'expressset', 'express set', 'quickdraw', 'karabiner',
        ],
    },
}

# Brand name normalization (shared across categories)
BRAND_CLEAN = {
    "la sportiva": "La Sportiva",
    "scarpa": "Scarpa",
    "tenaya": "Tenaya",
    "evolv": "Evolv",
    "ocun": "Ocun",
    "boreal": "Boreal",
    "red chili": "Red Chili",
    "black diamond": "Black Diamond",
    "mad rock": "Mad Rock",
    "butora": "Butora",
    "unparallel": "Unparallel",
    "so ill": "So iLL",
    "five ten": "Five Ten",
    "eb": "EB",
    "andrea boldrini": "Andrea Boldrini",
    "lowa": "Lowa",
    "simond": "Simond",
    "petzl": "Petzl",
    "edelrid": "Edelrid",
    "mammut": "Mammut",
    "beal": "Beal",
    "camp": "CAMP",
    "climbing technology": "Climbing Technology",
    "dmm": "DMM",
    "grivel": "Grivel",
    "kong": "Kong",
    "austrialpin": "AustriAlpin",
    "singing rock": "Singing Rock",
    "wild country": "Wild Country",
    "fixe": "Fixe",
}


# -- Supabase helpers --------------------------------------------------------

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
        print(f"  x Upsert error ({e.code}): {body[:300]}")
        return 0


def supabase_mark_all_out_of_stock(table, retailer):
    """Mark all rows for a retailer as out-of-stock BEFORE crawling.
    Products found during the crawl will be set back to in_stock=true."""
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
        urllib.request.urlopen(req, timeout=30)
        return True
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"  x Mark-out-of-stock error ({e.code}): {err_body[:300]}")
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
        cr = resp.getheader("Content-Range", "")
        if "/" in cr:
            return int(cr.split("/")[-1])
    except Exception:
        pass
    return 0


# -- Reference slug loader ---------------------------------------------------

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
            # Apostrophe-stripped variant
            norm_model = re.sub(r"['\u2019`]", "", model)
            norm_model = re.sub(r"\s+", " ", norm_model).strip()
            lookup[(brand, norm_model)] = slug
            # Hyphen-to-space variant
            if "-" in model:
                hyphen_model = model.replace("-", " ")
                hyphen_model = re.sub(r"\s+", " ", hyphen_model).strip()
                lookup[(brand, hyphen_model)] = slug
    return lookup


# -- Text normalization & slug matching --------------------------------------

def normalize(s):
    """Lowercase, strip, remove special chars."""
    s = s.lower().strip()
    s = re.sub(r"['\u2019`\u00ae\u2122]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s


def normalize_model_name(model_str):
    """Apply product-name normalization rules for German retailers."""
    m = model_str
    m = m.replace("-", " ")
    m = re.sub(r"\s+", " ", m).strip()
    # Convert comma decimals to dots
    m = re.sub(r'(\d),(\d)', r'\1.\2', m)
    # Scarpa naming: "Vapor V LV" -> "Vapor LV" (DB uses "Vapor LV", Gigasport adds extra "V")
    m = re.sub(r'\bVapor\s+V\s+LV\b', 'Vapor LV', m, flags=re.I)
    # Rope diameter: bare integer to .0 format ("Rumba 8" -> "Rumba 8.0")
    # Only for numbers that look like rope diameters (7-11 range at end of string)
    # Negative lookbehind ensures we don't match "9.8" -> "9.8.0"
    m = re.sub(r'(?<!\.)(?<!\d)\b([7-9]|1[0-1])$', r'\1.0', m)
    # Also handle "Seil 9.5 Alpine..." -> "Alpine... 9.5" (Mammut word order)
    seil_match = re.match(r'^Seil\s+(\d+\.?\d*)\s+(.+)$', m, re.I)
    if seil_match:
        m = f"{seil_match.group(2)} {seil_match.group(1)}"
    # Roman numeral conversion
    roman_map = {'vi': '6', 'iv': '4', 'iii': '3', 'ii': '2'}
    for roman, arabic in roman_map.items():
        m = re.sub(r'\b' + roman + r'\b', arabic, m, flags=re.I)
    return m


def detect_gender(text):
    """Detect gender from product name. Returns 'womens', 'mens', or None."""
    t = text.lower()
    if re.search(r'\b(damen|women|woman|wmn|wmns|wms|female|lady)\b', t):
        return "womens"
    if re.search(r'\b(herren|(?<!wo)men(?!t)|(?<!wo)man|male)\b', t):
        return "mens"
    if re.search(r'\bkinder\b', t):
        return "kids"
    return None


def extract_model_from_name(product_name, brand, category_suffixes=None):
    """Extract model name from Gigasport feed product_name.

    Gigasport format: "BRAND [Gender] CategoryWord Model color | SIZE"
    Examples:
      "LA SPORTIVA Kletterschuhe Ondra Comp schwarz | 40"
      "SCARPA Damen Kletterschuhe Veloce Wmn grau | 38 1/2"
      "EDELRID Bergseil Boa 9,8 mm blau | 60M"
      "PETZL Expressset Djinn Axess 11cm lila"
    """
    # Strip size suffix: " | 40" or " | 38 1/2" or " | 60M" or " | 11CM"
    name = re.sub(r'\s*\|\s*\S.*$', '', product_name).strip()

    # Strip brand prefix (case-insensitive)
    if brand:
        pattern = re.escape(brand)
        name = re.sub(r'^' + pattern + r'\s+', '', name, flags=re.I).strip()

    # Strip gender prefix
    name = re.sub(r'^(Damen|Herren|Kinder)\s+', '', name, flags=re.I).strip()

    # Strip category keywords
    suffixes = category_suffixes or []
    for suffix in suffixes:
        name = re.sub(r'^' + re.escape(suffix) + r'\s+', '', name, flags=re.I).strip()
        name = re.sub(r'\s+' + re.escape(suffix) + r'.*$', '', name, flags=re.I).strip()

    # Strip trailing color word(s) - Gigasport appends color at the end
    color_pattern = (
        r'\s+(?:schwarz|weiss|wei(?:ss|s)|grau|blau|rot|gelb|gr[uü]n|gruen|'
        r'braun|beige|pink|rosa|lila|mint|orange|t[uü]rkis|tuerkis|'
        r'bunt|beere|koralle|silber|keine farbe|dunkelblau)\s*$'
    )
    name = re.sub(color_pattern, '', name, flags=re.I).strip()

    # Strip trailing length specs like "60M", "11cm", "17cm"
    name = re.sub(r'\s+\d+\s*(?:cm|m)\s*$', '', name, flags=re.I).strip()

    # Strip "mm" unit from rope diameters: "9.2mm" -> "9.2", "9,8 mm" -> "9.8"
    name = re.sub(r'(\d)\s*mm\b', r'\1', name)

    # Strip registered trademark symbol
    name = name.replace('®', '').strip()

    # Normalize "6er Pack" / "5er Set" phrasing: "6er Pack Crag..." -> "Crag..."
    name = re.sub(r'^\d+er\s+(?:Pack|Set)\s+', '', name, flags=re.I).strip()

    # Clean up "GRIGRI +" -> "GriGri+"
    name = re.sub(r'\bGRIGRI\s*\+', 'GriGri+', name, flags=re.I)

    # Normalize comma decimals to dots: "9,8" -> "9.8"
    name = re.sub(r'(\d),(\d)', r'\1.\2', name)

    # Clean up double spaces
    name = re.sub(r'\s{2,}', ' ', name).strip()

    return name


def match_slug(brand, model, ref_lookup):
    """Try to match a crawled product to a reference slug.

    Multi-strategy matching:
    1. Exact (brand, model) -> 1.0
    2. Gender-aware (strip/add gender suffix) -> 0.95
    3. Normalized model -> 0.9
    4. Slug-based guessing -> 0.85
    5. Fuzzy word overlap -> 0.55-0.7
    """
    if not ref_lookup:
        return None, 0.0

    b = normalize(brand)
    m = normalize(model)

    # Brand normalization
    brand_map = {
        "c.a.m.p.": "camp",
        "ocun": "ocun",
        "climbing technology": "climbing technology",
        "adidas five ten": "five ten",
        "adidas": "five ten",
        "five ten": "five ten",
        "moon climbing": "moon",
        "austrialpin": "austrialpin",
    }
    b = brand_map.get(b, b)

    # 1. Exact match
    if (b, m) in ref_lookup:
        return ref_lookup[(b, m)], 1.0

    # 2. Gender-aware matching
    # Detect if the feed product is women's
    is_womens = bool(re.search(
        r"\b(women'?s?|w'?s|damen|lady|wmn|wmns|wms|woman)\b", m, re.I
    ))
    is_mens = bool(re.search(
        r"\b(men'?s?|herren|man)\b", m, re.I
    )) and not is_womens

    m_clean = re.sub(
        r"\s*(women'?s?|w'?s|damen|herren|men'?s?|lady|wmn|wmns|wms|woman|man)\s*$",
        "", m
    ).strip()
    m_clean = re.sub(r"^(damen|herren|kinder)\s+", "", m_clean).strip()
    # Also strip mid-word gender
    m_clean_mid = re.sub(
        r"\s+(women'?s?|woman|wmn|wmns|wms|damen|herren|men'?s?|unisex)\s+",
        " ", m_clean
    ).strip()

    # Try gendered version FIRST (e.g. "veloce women's" before "veloce")
    if is_womens:
        for suffix in ["women's", "womens"]:
            for try_base in [m_clean, m_clean_mid]:
                gendered = f"{try_base} {suffix}"
                if (b, gendered) in ref_lookup:
                    return ref_lookup[(b, gendered)], 0.98
    elif is_mens:
        for try_base in [m_clean, m_clean_mid]:
            if (b, try_base) in ref_lookup:
                return ref_lookup[(b, try_base)], 0.95

    # Then try stripped (gender-neutral) version
    for try_m in [m_clean, m_clean_mid]:
        if try_m != m and (b, try_m) in ref_lookup:
            return ref_lookup[(b, try_m)], 0.95

    # 3. Normalized model name
    nm = normalize_model_name(m).lower().strip()
    nm = re.sub(r"\s+", " ", nm)
    if nm != m and (b, nm) in ref_lookup:
        return ref_lookup[(b, nm)], 0.9
    nm_clean = normalize_model_name(m_clean).lower().strip()
    nm_clean = re.sub(r"\s+", " ", nm_clean)
    if nm_clean != m_clean and (b, nm_clean) in ref_lookup:
        return ref_lookup[(b, nm_clean)], 0.9

    # 4. Slug-based guessing
    slug_guess = f"{b}-{m_clean}".replace(" ", "-")
    slug_guess = re.sub(r"[^a-z0-9-]", "", slug_guess)
    for ref_slug in ref_lookup.values():
        if ref_slug == slug_guess:
            return ref_slug, 0.85
        if ref_slug == f"{slug_guess}-mens" or ref_slug == f"{slug_guess}-womens":
            return ref_slug, 0.8

    # 5. Fuzzy word overlap
    # Require high overlap (>= 0.8) to avoid false positives like
    # "Boa 9.8" matching "Boa Eco 9.8" or "Alpine Core Protect Dry" matching "Alpine Core Protect"
    words = set(b.split() + m_clean.split())
    words.discard("the")
    best_match, best_score = None, 0
    for (rb, rm), rslug in ref_lookup.items():
        if rb != b:
            continue  # Only match within same brand
        ref_words = set(rm.split())
        overlap = len(words & ref_words)
        total = max(len(words), len(ref_words))
        score = overlap / total if total > 0 else 0
        if score > best_score and score >= 0.8:
            best_score = score
            best_match = rslug
    if best_match:
        return best_match, round(best_score * 0.8, 2)

    return None, 0.0


# -- Feed parsing ------------------------------------------------------------

def parse_eu_size(size_str):
    """Parse Gigasport size string to numeric EU size.

    Examples: "40" -> 40.0, "38 1/2" -> 38.5, "36 1/4" -> 36.25,
              "40 3/4" -> 40.75, "26/27" -> None (kids double-size)
    """
    if not size_str or not size_str.strip():
        return None

    s = size_str.strip()

    # Skip kids double-sizes like "26/27", "28/29"
    if re.match(r'^\d{2}/\d{2}$', s):
        return None

    # Fraction format: "38 1/2", "36 1/4", "40 3/4"
    m = re.match(r'^(\d{2,3})\s+(\d)/(\d)$', s)
    if m:
        base = int(m.group(1))
        frac = int(m.group(2)) / int(m.group(3))
        return base + frac

    # Plain integer: "40", "38"
    m = re.match(r'^(\d{2,3})$', s)
    if m:
        return float(m.group(1))

    return None


def download_feed():
    """Download the AWIN product feed (gzipped CSV) and return all rows."""
    print(f"  Downloading AWIN feed...")
    req = urllib.request.Request(AWIN_FEED_URL, headers={
        "User-Agent": "Mozilla/5.0 climbing-gear-crawler/1.0",
    })
    resp = urllib.request.urlopen(req, timeout=120)
    raw = resp.read()
    print(f"  -> Downloaded {len(raw) / 1024 / 1024:.1f} MB (compressed)")

    decompressed = gzip.decompress(raw)
    text = decompressed.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    all_rows = list(reader)
    print(f"  -> Parsed {len(all_rows)} total rows from feed")
    return all_rows


def filter_feed_rows(all_rows, cat_config):
    """Filter feed rows for a category using path, positive/exclude keywords."""
    # Step 1: match by category path
    path_matches = []
    for row in all_rows:
        cat_path = row.get("merchant_product_category_path", "")
        if any(p in cat_path for p in cat_config["path_contains"]):
            path_matches.append(row)

    # Step 2: apply positive keywords (must match at least one, if set)
    pos_kws = cat_config.get("positive_keywords")
    if pos_kws:
        filtered = []
        for row in path_matches:
            name_lower = row.get("product_name", "").lower()
            desc_lower = row.get("description", "").lower()
            text = name_lower + " " + desc_lower
            if any(kw in text for kw in pos_kws):
                filtered.append(row)
        path_matches = filtered

    # Step 3: apply exclude keywords
    exc_kws = cat_config.get("exclude_keywords", [])
    if exc_kws:
        result = []
        for row in path_matches:
            name_lower = row.get("product_name", "").lower()
            if not any(kw in name_lower for kw in exc_kws):
                result.append(row)
        return result

    return path_matches


# -- Main crawl logic --------------------------------------------------------

def crawl_category(cat_name, cat_config, all_feed_rows):
    """Process a single product category and upsert to Supabase."""
    price_table = cat_config["price_table"]
    ref_table = cat_config["ref_table"]
    per_size = cat_config.get("per_size", False)
    category_suffixes = cat_config.get("category_suffixes", [])

    print(f"\n{'=' * 60}")
    print(f"  Gigasport.at - {cat_name}")
    print(f"{'=' * 60}")

    # Load reference slugs
    print(f"  Loading reference slugs from '{ref_table}'...")
    ref_lookup = load_reference_slugs(ref_table)
    print(f"  -> {len(ref_lookup)} reference entries loaded")

    # Filter feed rows
    feed_rows = filter_feed_rows(all_feed_rows, cat_config)
    print(f"  -> {len(feed_rows)} rows after filtering")

    if not feed_rows:
        print(f"  ! No rows found for {cat_name}")
        return 0, 0

    # Process rows
    now = datetime.now(timezone.utc).isoformat()
    matched = 0
    skipped_size = 0
    skipped_price = 0
    rows = []
    # For gear (non-per-size), deduplicate by product to keep cheapest
    seen_products = {}  # (brand, model) -> row with lowest price

    for r in feed_rows:
        product_name = r.get('product_name', '').strip()
        if not product_name:
            continue

        # Parse price
        try:
            price = float(r.get('search_price', '0'))
        except (ValueError, TypeError):
            price = 0
        if price <= 0:
            skipped_price += 1
            continue

        # For shoes: require parseable EU size
        eur_size = None
        if per_size:
            size_str = r.get('Fashion:size', '').strip()
            eur_size = parse_eu_size(size_str)
            if eur_size is None:
                skipped_size += 1
                continue

        # Extract brand and model
        brand_raw = r.get('brand_name', '').strip()
        brand = BRAND_CLEAN.get(brand_raw.lower(), brand_raw)
        model = extract_model_from_name(product_name, brand_raw, category_suffixes)

        # Original/old price
        original_price = None
        try:
            old_p = float(r.get('product_price_old') or r.get('rrp_price') or '0')
            if old_p > price:
                original_price = old_p
        except (ValueError, TypeError):
            pass

        # In-stock
        in_stock = r.get('in_stock', '0') == '1'

        # AWIN deep link
        product_url = r.get('aw_deep_link', '').strip()
        if not product_url:
            product_url = r.get('merchant_deep_link', '').strip()
        if not product_url:
            continue

        # Match to reference slug
        norm_model = normalize_model_name(normalize(model))
        gender = detect_gender(product_name)
        slug, confidence = match_slug(brand, norm_model, ref_lookup)

        # Gender suffix fallback
        if not slug and gender and gender != "kids":
            slug_with_gender = f"{normalize(brand)}-{norm_model}-{gender}".replace(" ", "-")
            slug_with_gender = re.sub(r"[^a-z0-9-]", "", slug_with_gender)
            for ref_slug in ref_lookup.values():
                if ref_slug == slug_with_gender:
                    slug = ref_slug
                    confidence = 0.85
                    break

        row = {
            "product_slug": slug,
            "retailer": RETAILER,
            "country": COUNTRY,
            "product_url": product_url,
            "product_name": f"{brand} {model}",
            "brand": brand,
            "model": model,
            "image_url": r.get('merchant_image_url') or None,
            "match_confidence": confidence if slug else None,
            "price_eur": round(price, 2),
            "original_price_eur": round(original_price, 2) if original_price else None,
            "currency": "EUR",
            "in_stock": in_stock,
            "last_crawled_at": now,
            "updated_at": now,
        }

        if per_size:
            # Shoes: one row per size variant
            row["eur_size"] = eur_size
            if slug:
                matched += 1
            rows.append(row)
        else:
            # Gear: deduplicate by product, keep cheapest
            key = (brand.lower(), model.lower())
            if key not in seen_products or price < seen_products[key]["price_eur"]:
                seen_products[key] = row
                if slug:
                    # Only count match once per unique product
                    if key not in {(r["brand"].lower(), r["model"].lower()) for r in rows if r.get("product_slug")}:
                        matched += 1

    if not per_size:
        rows = list(seen_products.values())
        matched = sum(1 for r in rows if r.get("product_slug"))

    print(f"\n  Processed: {len(rows)} rows")
    if skipped_size:
        print(f"  Skipped: {skipped_size} (unparseable size)")
    if skipped_price:
        print(f"  Skipped: {skipped_price} (no price)")
    print(f"  Matched to reference: {matched}/{len(rows)} "
          f"({100 * matched // len(rows) if rows else 0}%)")

    if not rows:
        print(f"  ! No rows to upsert")
        return 0, 0

    # Safety check
    existing = supabase_count_rows(price_table, RETAILER)
    if existing > 0 and len(rows) < existing * 0.5:
        print(f"  ! Safety skip: found {len(rows)} rows but {existing} exist "
              f"in {price_table} - not marking out-of-stock (threshold: 50%)")
    else:
        print(f"  Marking stale {RETAILER} rows as out-of-stock...")
        supabase_mark_all_out_of_stock(price_table, RETAILER)

    # Upsert in batches
    print(f"  Upserting to '{price_table}'...")
    total_upserted = 0
    batch_size = 50
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        n = supabase_upsert(price_table, batch)
        total_upserted += n
        if (i // batch_size + 1) % 5 == 0 or (i + batch_size) >= len(rows):
            print(f"    -> {total_upserted}/{len(rows)} rows upserted")

    print(f"\n  Done: {total_upserted} rows upserted to {price_table}")
    print(f"  Matched: {matched}, Unmatched: {len(rows) - matched}")

    return len(rows), matched


# -- Entry point -------------------------------------------------------------

if __name__ == "__main__":
    print(f"Gigasport.at Feed Crawler")
    print(f"Target: {SUPABASE_URL}")

    # Determine which categories to crawl
    requested = sys.argv[1:] if len(sys.argv) > 1 else list(CATEGORIES.keys())
    cats_to_crawl = []
    for name in requested:
        if name in CATEGORIES:
            cats_to_crawl.append(name)
        else:
            print(f"  ! Unknown category: {name}")
            print(f"  Available: {', '.join(CATEGORIES.keys())}")
            sys.exit(1)

    # Download feed once (shared across all categories)
    all_feed_rows = download_feed()

    # Crawl each category
    grand_total = 0
    grand_matched = 0
    for cat_name in cats_to_crawl:
        total, matched = crawl_category(cat_name, CATEGORIES[cat_name], all_feed_rows)
        grand_total += total
        grand_matched += matched

    print(f"\n{'=' * 60}")
    print(f"  All done! {grand_matched}/{grand_total} matched across {len(cats_to_crawl)} categories")
    print(f"{'=' * 60}")
