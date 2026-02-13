#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
  climbing-gear.com — Hero Image Downloader
═══════════════════════════════════════════════════════════════════════

Universal image download script that enforces platform standards.
Downloads product images for any category, validates quality,
and processes to the standard 400×400 white-BG format.

Usage:
    python3 scripts/download_hero_images.py belays          # Download missing belay images
    python3 scripts/download_hero_images.py shoes           # Download missing shoe images
    python3 scripts/download_hero_images.py --all           # All categories
    python3 scripts/download_hero_images.py belays --force  # Re-download ALL (even existing)
    python3 scripts/download_hero_images.py belays --slug petzl-grigri  # Single product
"""
import sys, os, json, re, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from image_standards import (
    CATEGORIES, SEARCH_QUERIES, TARGET_SIZE, BACKGROUND_COLOR,
    JPEG_QUALITY, MIN_FILE_SIZE_BYTES, BG_WHITE_THRESHOLD,
    TRUSTED_RETAILERS, get_image_dir, get_seed_path,
    PIPELINE,
)

try:
    import requests
    from PIL import Image
    from io import BytesIO
    import numpy as np
except ImportError:
    print("ERROR: Requires requests, Pillow, numpy. Install with:")
    print("  pip3 install requests Pillow numpy")
    sys.exit(1)

S = requests.Session()
S.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
})


# ─── Search ──────────────────────────────────────────────────────────

def bing_images(query: str, count: int = 10) -> list:
    """Search Bing Images and return image URLs."""
    url = "https://www.bing.com/images/search"
    params = {"q": query, "form": "HDRSC2", "first": 1}
    try:
        r = S.get(url, params=params, timeout=10)
        r.raise_for_status()
        urls = re.findall(r'murl&quot;:&quot;(https?://[^&]+?)&quot;', r.text)
        if not urls:
            urls = re.findall(r'"murl":"(https?://[^"]+?)"', r.text)
        filtered = []
        for u in urls[:count * 2]:
            if any(ext in u.lower() for ext in [".jpg", ".jpeg", ".png", ".webp"]):
                filtered.append(u)
        return filtered[:count]
    except Exception as e:
        return []


# ─── Download + validate ─────────────────────────────────────────────

def download_image(url: str) -> "Image|None":
    """Download an image and return PIL Image or None."""
    try:
        r = S.get(url, timeout=15)
        r.raise_for_status()
        data = r.content
        if len(data) < MIN_FILE_SIZE_BYTES:
            return None
        return Image.open(BytesIO(data))
    except:
        return None


def has_white_background(img: Image) -> bool:
    """Check if image has a white-ish background by sampling corners."""
    img_rgb = img.convert("RGB")
    w, h = img_rgb.size
    if w < 10 or h < 10:
        return False
    corners = []
    for cx, cy in [(3, 3), (w-4, 3), (3, h-4), (w-4, h-4)]:
        corners.append(img_rgb.getpixel((cx, cy)))
    avg = sum(sum(c) for c in corners) / (4 * 3)
    return avg > BG_WHITE_THRESHOLD


def is_from_trusted_source(url: str) -> bool:
    """Check if URL is from a trusted retailer/manufacturer."""
    return any(domain in url.lower() for domain in TRUSTED_RETAILERS)


# ─── Processing pipeline ─────────────────────────────────────────────

def process_image(img: Image, target_size: tuple = TARGET_SIZE) -> Image:
    """Apply the full processing pipeline to an image."""
    # Handle transparency
    if img.mode in ("RGBA", "LA", "P"):
        if img.mode == "P":
            img = img.convert("RGBA")
        bg = Image.new("RGBA", img.size, (*BACKGROUND_COLOR, 255))
        bg.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
        img = bg.convert("RGB")
    else:
        img = img.convert("RGB")

    w, h = img.size

    # Crop to content bounding box
    if PIPELINE.crop_to_content:
        arr = np.array(img)
        corners = [arr[2, 2], arr[2, w-3], arr[h-3, 2], arr[h-3, w-3]]
        bg_color = np.mean(corners, axis=0)
        diff = np.abs(arr.astype(float) - bg_color).sum(axis=2)
        mask = diff > 30
        rows = np.any(mask, axis=1)
        cols = np.any(mask, axis=0)
        if rows.any() and cols.any():
            rmin, rmax = np.where(rows)[0][[0, -1]]
            cmin, cmax = np.where(cols)[0][[0, -1]]
            content_w = cmax - cmin
            content_h = rmax - rmin
            pad = int(max(content_w, content_h) * PIPELINE.content_padding_pct)
            x1 = max(0, int(cmin - pad))
            y1 = max(0, int(rmin - pad))
            x2 = min(w, int(cmax + pad))
            y2 = min(h, int(rmax + pad))
            img = img.crop((x1, y1, x2, y2))

    # Resize to fit within target
    img.thumbnail(target_size, Image.LANCZOS)

    # Center on white canvas
    bg = Image.new("RGB", target_size, BACKGROUND_COLOR)
    x = (target_size[0] - img.width) // 2
    y = (target_size[1] - img.height) // 2
    bg.paste(img, (x, y))
    return bg


# ─── Main download logic ─────────────────────────────────────────────

def download_product_image(brand: str, model: str, slug: str,
                            category: str, dest: Path) -> bool:
    """Download, validate, and save a single product image."""
    queries = SEARCH_QUERIES.get(category, SEARCH_QUERIES["belays"])

    for query_template in queries:
        query = query_template.format(brand=brand, model=model)
        urls = bing_images(query)

        # Sort: trusted sources first
        urls.sort(key=lambda u: (0 if is_from_trusted_source(u) else 1))

        for url in urls:
            img = download_image(url)
            if img is None:
                continue

            # Prefer images with white backgrounds
            if has_white_background(img):
                result = process_image(img)
                result.save(str(dest), "JPEG", quality=JPEG_QUALITY)
                return True

        # Fallback: accept non-white BG if we can process it
        for url in urls:
            img = download_image(url)
            if img is None:
                continue
            w, h = img.size
            if w >= 150 and h >= 150:
                result = process_image(img)
                result.save(str(dest), "JPEG", quality=JPEG_QUALITY)
                return True

        time.sleep(0.5)

    return False


def process_category(category: str, force: bool = False,
                      target_slug: str = None):
    """Download images for all products in a category."""
    image_dir = get_image_dir(category)
    seed_path = get_seed_path(category)
    image_dir.mkdir(parents=True, exist_ok=True)

    if not seed_path.exists():
        print(f"  Seed file not found: {seed_path}")
        return 0, 0, 0

    with open(seed_path) as f:
        products = json.load(f)

    ok = skip = fail = 0
    for i, p in enumerate(products, 1):
        slug = p.get("slug", "")
        brand = p.get("brand", "")
        model = p.get("model", "")

        if target_slug and slug != target_slug:
            continue

        dest = image_dir / f"{slug}.jpg"

        if not force and dest.exists() and dest.stat().st_size > MIN_FILE_SIZE_BYTES:
            skip += 1
            continue

        print(f"  [{i}/{len(products)}] {brand} {model}", end=" ", flush=True)
        if download_product_image(brand, model, slug, category, dest):
            print("✓")
            ok += 1
        else:
            print("✗")
            fail += 1
        time.sleep(1)

    return ok, skip, fail


# ─── CLI ──────────────────────────────────────────────────────────────

def main():
    force = "--force" in sys.argv
    all_cats = "--all" in sys.argv

    # Parse --slug
    target_slug = None
    for i, arg in enumerate(sys.argv):
        if arg == "--slug" and i + 1 < len(sys.argv):
            target_slug = sys.argv[i + 1]

    categories = [a for a in sys.argv[1:]
                  if not a.startswith("--") and a in CATEGORIES]

    if all_cats:
        categories = list(CATEGORIES.keys())
    elif not categories:
        print("Usage: python3 scripts/download_hero_images.py <category> [options]")
        print(f"Categories: {', '.join(CATEGORIES.keys())}")
        print("Options:")
        print("  --all     Process all categories")
        print("  --force   Re-download even existing images")
        print("  --slug X  Only process a specific product slug")
        sys.exit(1)

    for cat in categories:
        print(f"\n{'═'*50}")
        print(f"  {cat.upper()}")
        print(f"{'═'*50}")
        ok, skip, fail = process_category(cat, force=force,
                                           target_slug=target_slug)
        print(f"  Done: {ok} new, {skip} skipped, {fail} failed")


if __name__ == "__main__":
    main()