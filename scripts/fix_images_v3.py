#!/usr/bin/env python3
"""Fix belay images: replace dark backgrounds with white, upscale small products."""
import re, time, sys, os
from pathlib import Path
import requests
from PIL import Image, ImageFilter
from io import BytesIO
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "images" / "belays"
S = requests.Session()
S.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
})

def bing_images(query, count=10):
    url = "https://www.bing.com/images/search"
    params = {"q": query, "form": "HDRSC2", "first": 1}
    try:
        r = S.get(url, params=params, timeout=10)
        r.raise_for_status()
        urls = re.findall(r'murl&quot;:&quot;(https?://[^&]+?)&quot;', r.text)
        if not urls:
            urls = re.findall(r'"murl":"(https?://[^"]+?)"', r.text)
        filtered = []
        for u in urls[:count*2]:
            if any(u.lower().endswith(e) or e in u.lower() for e in ['.jpg','.jpeg','.png','.webp']):
                filtered.append(u)
        return filtered[:count]
    except Exception as e:
        print(f"    Search error: {e}")
        return []

def download_image(url, timeout=20):
    """Download an image and return PIL Image or None."""
    try:
        r = S.get(url, timeout=timeout)
        r.raise_for_status()
        data = r.content
        if len(data) < 2000:
            return None
        return Image.open(BytesIO(data)).convert("RGB")
    except:
        return None

def check_white_bg(img):
    """Check if image has a white-ish background by sampling corners."""
    w, h = img.size
    corners = []
    for cx, cy in [(5,5), (w-5,5), (5,h-5), (w-5,h-5)]:
        r,g,b = img.getpixel((cx,cy))
        corners.append((r,g,b))
    avg = sum(sum(c) for c in corners) / (4*3)
    return avg > 230  # Average channel value > 230 means white-ish

def get_content_bbox(img, bg_threshold=30):
    """Find bounding box of non-background content."""
    arr = np.array(img)
    w, h = img.size
    # Sample corners to get background color
    corners = [arr[2,2], arr[2,w-3], arr[h-3,2], arr[h-3,w-3]]
    bg_color = np.mean(corners, axis=0)
    # Find pixels that differ from background
    diff = np.abs(arr.astype(float) - bg_color.astype(float)).sum(axis=2)
    mask = diff > bg_threshold
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    if not rows.any() or not cols.any():
        return (0, 0, w, h)
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    return (int(cmin), int(rmin), int(cmax), int(rmax))

def remove_dark_bg(img):
    """Replace dark background with white using flood-fill approach."""
    arr = np.array(img).astype(float)
    h, w, _ = arr.shape
    # Sample corners to get background color
    corners = [arr[2,2], arr[2,w-3], arr[h-3,2], arr[h-3,w-3]]
    bg_color = np.mean(corners, axis=0)
    # If background is already light, skip
    if bg_color.mean() > 200:
        return img
    # Create mask: pixels close to background color
    diff = np.sqrt(((arr - bg_color)**2).sum(axis=2))
    bg_mask = diff < 60  # pixels within distance 60 of bg color
    # Expand mask slightly to catch edges
    from scipy import ndimage
    bg_mask = ndimage.binary_dilation(bg_mask, iterations=1)
    # But don't mask the product area (use connected components from corners)
    # Simple approach: flood fill from corners
    from scipy.ndimage import label
    labeled, num = label(bg_mask)
    corner_labels = set()
    for cy, cx in [(0,0), (0,w-1), (h-1,0), (h-1,w-1)]:
        if bg_mask[cy, cx]:
            corner_labels.add(labeled[cy, cx])
    # Only remove pixels connected to corners
    final_mask = np.zeros_like(bg_mask)
    for lbl in corner_labels:
        if lbl > 0:
            final_mask |= (labeled == lbl)
    # Replace background with white
    result = arr.copy()
    result[final_mask] = [255, 255, 255]
    return Image.fromarray(result.astype(np.uint8))

def process_to_400(img, target_size=(400, 400), padding_pct=0.08):
    """Crop to content, add padding, resize to target with white bg."""
    bbox = get_content_bbox(img)
    x1, y1, x2, y2 = bbox
    # Add padding
    content_w = x2 - x1
    content_h = y2 - y1
    pad = int(max(content_w, content_h) * padding_pct)
    x1 = max(0, x1 - pad)
    y1 = max(0, y1 - pad)
    x2 = min(img.width, x2 + pad)
    y2 = min(img.height, y2 + pad)
    cropped = img.crop((x1, y1, x2, y2))
    # Resize to fit within target
    cropped.thumbnail(target_size, Image.LANCZOS)
    # Center on white background
    bg = Image.new("RGB", target_size, (255, 255, 255))
    x = (target_size[0] - cropped.width) // 2
    y = (target_size[1] - cropped.height) // 2
    bg.paste(cropped, (x, y))
    return bg

# Images that need dark BG replacement + re-download attempt
DARK_BG = [
    {"slug": "climbing-technology-click-up-plus",
     "queries": ["Climbing Technology Click Up Plus belay product white background",
                 "Climbing Technology Click Up Plus belay device official product"]},
    {"slug": "climbing-technology-click-up",
     "queries": ["Climbing Technology Click Up belay device product white background NOT plus",
                 "Climbing Technology Click Up belay official product green"]},
    {"slug": "edelrid-jul-2",
     "queries": ["Edelrid Jul 2 belay device product white background",
                 "Edelrid Jul2 belay product official photo"]},
    {"slug": "edelrid-giga-jul",
     "queries": ["Edelrid Giga Jul belay device white background product",
                 "Edelrid Giga Jul belay product official isolated"]},
    {"slug": "wild-country-revo",
     "queries": ["Wild Country Revo belay device white background product photo",
                 "Wild Country Revo belay isolated product"]},
    {"slug": "grivel-master",
     "queries": ["Grivel Master belay device product white background NOT pro",
                 "Grivel Master tube belay product photo"]},
]

# Images that are too small in the frame
SMALL = ["grivel-scream", "black-diamond-super-8", "grivel-master"]

if __name__ == "__main__":
    # Step 1: Try to re-download dark BG images with white BG versions
    print("=== PHASE 1: Re-download dark BG images ===")
    redownloaded = set()
    for item in DARK_BG:
        slug = item["slug"]
        dest = OUT / f"{slug}.jpg"
        print(f"  {slug}:", flush=True)
        found = False
        for q in item["queries"]:
            urls = bing_images(q)
            for url in urls:
                img = download_image(url)
                if img and check_white_bg(img):
                    # Good white BG image found!
                    img = process_to_400(img)
                    img.save(str(dest), "JPEG", quality=85)
                    print(f"    ✓ Re-downloaded with white BG ({url[:60]}...)")
                    redownloaded.add(slug)
                    found = True
                    break
            if found:
                break
            time.sleep(0.5)
        if not found:
            print(f"    → No white-BG version found, will process existing")
        time.sleep(1)

    # Step 2: Programmatically fix remaining dark BG images
    print("\n=== PHASE 2: Fix remaining dark backgrounds ===")
    for item in DARK_BG:
        slug = item["slug"]
        if slug in redownloaded:
            continue
        dest = OUT / f"{slug}.jpg"
        if not dest.exists():
            print(f"  {slug}: file not found, skipping")
            continue
        print(f"  {slug}: removing dark background...", end=" ", flush=True)
        try:
            img = Image.open(dest).convert("RGB")
            img = remove_dark_bg(img)
            img = process_to_400(img)
            img.save(str(dest), "JPEG", quality=85)
            print("✓")
        except Exception as e:
            print(f"Error: {e}")

    # Step 3: Fix small images
    print("\n=== PHASE 3: Fix small/undersized images ===")
    for slug in SMALL:
        if slug in redownloaded:
            continue  # Already fixed in phase 1
        dest = OUT / f"{slug}.jpg"
        if not dest.exists():
            print(f"  {slug}: file not found, skipping")
            continue
        print(f"  {slug}: re-cropping and upscaling...", end=" ", flush=True)
        try:
            img = Image.open(dest).convert("RGB")
            img = process_to_400(img, padding_pct=0.05)
            img.save(str(dest), "JPEG", quality=85)
            print("✓")
        except Exception as e:
            print(f"Error: {e}")

    print("\nDone!")