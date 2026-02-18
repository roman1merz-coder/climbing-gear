#!/usr/bin/env python3
"""Download product images for quickdraws via Bing image search.
Based on the existing download_images.py pattern."""
import json, os, re, time, sys
from pathlib import Path
import requests
from PIL import Image
from io import BytesIO

ROOT = Path(__file__).resolve().parent.parent
S = requests.Session()
S.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
})

def bing_images(query, count=8):
    """Search Bing Images and return image URLs."""
    url = "https://www.bing.com/images/search"
    params = {"q": query, "form": "HDRSC2", "first": 1}
    try:
        r = S.get(url, params=params, timeout=10)
        r.raise_for_status()
        # Extract image URLs from murl parameter
        urls = re.findall(r'murl&quot;:&quot;(https?://[^&]+?)&quot;', r.text)
        if not urls:
            urls = re.findall(r'"murl":"(https?://[^"]+?)"', r.text)
        # Filter for image extensions
        filtered = []
        for u in urls[:count*2]:
            if any(u.lower().endswith(e) or e in u.lower() for e in ['.jpg','.jpeg','.png','.webp']):
                filtered.append(u)
        return filtered[:count]
    except Exception as e:
        print(f"  Search error: {e}")
        return []

def download_and_save(url, dest, target_size=(400, 400)):
    """Download image, resize to consistent size, save as JPEG."""
    try:
        r = S.get(url, timeout=15, stream=True)
        r.raise_for_status()
        data = r.content
        if len(data) < 3000:
            return False
        img = Image.open(BytesIO(data))

        # Check if it looks like a product photo (not a logo/icon)
        if img.size[0] < 100 or img.size[1] < 100:
            return False

        img = img.convert("RGB")
        # Resize to fit within target while maintaining aspect ratio
        img.thumbnail(target_size, Image.LANCZOS)
        # Create white background and paste centered
        bg = Image.new("RGB", target_size, (255, 255, 255))
        x = (target_size[0] - img.width) // 2
        y = (target_size[1] - img.height) // 2
        bg.paste(img, (x, y))
        bg.save(str(dest), "JPEG", quality=85)

        # Verify the saved file is reasonable
        size = dest.stat().st_size
        if size < 5000:  # Too small = probably not a real product photo
            dest.unlink()
            return False
        return True
    except Exception as e:
        return False

def process_quickdraws():
    """Download images for all quickdraws."""
    seed_path = ROOT / "src" / "quickdraw_seed_data.json"
    out_dir = ROOT / "public" / "images" / "quickdraws"
    out_dir.mkdir(parents=True, exist_ok=True)

    with open(seed_path) as f:
        items = json.load(f)

    ok = skip = fail = 0
    failed_items = []

    for i, p in enumerate(items):
        slug, brand, model = p["slug"], p["brand"], p["model"]
        dest = out_dir / f"{slug}.jpg"

        # Skip if already have a real image (>5KB = not a placeholder)
        if dest.exists() and dest.stat().st_size > 5000:
            skip += 1
            continue

        print(f"  [{i+1}/{len(items)}] {brand} {model}", end=" ", flush=True)

        queries = [
            f"{brand} {model} quickdraw climbing product photo white background",
            f"{brand} {model} quickdraw product photo",
            f"{brand} {model} quickdraw",
            f"{brand} {model} express quickdraw climbing",
        ]

        done = False
        for q in queries:
            urls = bing_images(q)
            for u in urls:
                if download_and_save(u, dest):
                    print(f"✓ ({dest.stat().st_size} bytes)")
                    ok += 1
                    done = True
                    break
            if done:
                break
            time.sleep(0.5)

        if not done:
            print("✗")
            fail += 1
            failed_items.append({"slug": slug, "brand": brand, "model": model})

        time.sleep(1)

    print(f"\n=== RESULTS ===")
    print(f"  New: {ok}, Skipped: {skip}, Failed: {fail}")

    if failed_items:
        print(f"\nFailed items:")
        for f_item in failed_items:
            print(f"  - {f_item['brand']} {f_item['model']} ({f_item['slug']})")

    return failed_items

if __name__ == "__main__":
    print(f"\n=== QUICKDRAWS ===")
    failed = process_quickdraws()

    # Save failed items for manual retry
    if failed:
        with open(ROOT / "scripts" / "quickdraw_failed_images.json", "w") as f:
            json.dump(failed, f, indent=2)
