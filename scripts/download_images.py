#!/usr/bin/env python3
"""Download product images for ropes and belays via Bing image search."""
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

def bing_images(query, count=5):
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
        img = img.convert("RGB")
        # Resize to fit within target while maintaining aspect ratio
        img.thumbnail(target_size, Image.LANCZOS)
        # Create white background and paste centered
        bg = Image.new("RGB", target_size, (255, 255, 255))
        x = (target_size[0] - img.width) // 2
        y = (target_size[1] - img.height) // 2
        bg.paste(img, (x, y))
        bg.save(str(dest), "JPEG", quality=85)
        return True
    except Exception as e:
        return False

def process(products, category, out_dir):
    ok = skip = fail = 0
    for i, p in enumerate(products):
        slug, brand, model = p["slug"], p["brand"], p["model"]
        dest = out_dir / f"{slug}.jpg"
        if dest.exists() and dest.stat().st_size > 3000:
            skip += 1; continue
        print(f"  [{i+1}/{len(products)}] {brand} {model}", end=" ", flush=True)
        queries = [
            f"{brand} {model} climbing {category} product photo",
            f"{brand} {model} {category}",
        ]
        done = False
        for q in queries:
            urls = bing_images(q)
            for u in urls:
                if download_and_save(u, dest):
                    print("✓"); ok += 1; done = True; break
            if done: break
            time.sleep(0.5)
        if not done:
            print("✗"); fail += 1
        time.sleep(1)
    return ok, skip, fail

if __name__ == "__main__":
    for cat, fname, dirname in [
        ("belay device", "belay_seed_data.json", "belays"),
        ("rope", "rope_seed_data.json", "ropes"),
    ]:
        with open(ROOT / "src" / fname) as f:
            items = json.load(f)
        out = ROOT / "public" / "images" / dirname
        out.mkdir(parents=True, exist_ok=True)
        print(f"\n=== {dirname.upper()} ({len(items)}) ===")
        ok, sk, fl = process(items, cat, out)
        print(f"  Done: {ok} new, {sk} skipped, {fl} failed")
