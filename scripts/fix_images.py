#!/usr/bin/env python3
"""Targeted re-download of problematic belay images with manufacturer-focused queries."""
import re, time, sys
from pathlib import Path
import requests
from PIL import Image
from io import BytesIO

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "images" / "belays"
S = requests.Session()
S.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
})

# Targeted queries per device — prioritize manufacturer product images
TARGETS = [
    # Action shots that need clean product replacements
    {"slug": "petzl-grigri", "queries": [
        "Petzl GriGri belay device product official white background",
        "Petzl GriGri D164 belay device product photo",
        "Petzl GriGri climbing belay device isolated",
    ]},
    {"slug": "petzl-neox", "queries": [
        "Petzl Neox belay device product official",
        "Petzl Neox D064 belay product photo white",
        "Petzl Neox climbing belay isolated product",
    ]},
    {"slug": "edelrid-mega-jul", "queries": [
        "Edelrid Mega Jul belay device product official",
        "Edelrid Mega Jul belay product photo white background",
        "Edelrid Mega Jul climbing product isolated",
    ]},
    {"slug": "edelrid-giga-jul", "queries": [
        "Edelrid Giga Jul belay device product official",
        "Edelrid Giga Jul belay product photo white background",
        "Edelrid Giga Jul product isolated",
    ]},
    {"slug": "edelrid-nano-jul", "queries": [
        "Edelrid Nano Jul belay device product official",
        "Edelrid Nano Jul belay product photo white",
        "Edelrid Nano Jul climbing product isolated",
    ]},
    {"slug": "wild-country-revo", "queries": [
        "Wild Country Revo belay device product official",
        "Wild Country Revo belay product photo white background",
        "Wild Country Revo climbing belay isolated",
    ]},
    {"slug": "climbing-technology-alpine-up", "queries": [
        "Climbing Technology Alpine Up belay device product official",
        "Climbing Technology Alpine Up product photo white background",
        "Climbing Technology Alpine Up belay isolated product",
    ]},
    # Duplicates that need their own unique product images
    {"slug": "black-diamond-atc", "queries": [
        "Black Diamond ATC belay device product NOT guide NOT pilot NOT xp",
        "Black Diamond ATC basic tubular belay product photo",
        "Black Diamond ATC belay device blue product",
    ]},
    {"slug": "climbing-technology-click-up", "queries": [
        "Climbing Technology Click Up belay device product NOT plus",
        "Climbing Technology Click Up belay product photo white",
        "Climbing Technology Click Up green belay product",
    ]},
    {"slug": "grivel-master", "queries": [
        "Grivel Master belay device product NOT pro",
        "Grivel Master belay tube product photo",
        "Grivel Master climbing belay device isolated",
    ]},
    {"slug": "grivel-shuttle", "queries": [
        "Grivel Shuttle belay device product photo",
        "Grivel Shuttle climbing belay product",
        "Grivel Shuttle belay tube isolated",
    ]},
]

def bing_images(query, count=8):
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

def download_and_save(url, dest, target_size=(400, 400)):
    try:
        r = S.get(url, timeout=15, stream=True)
        r.raise_for_status()
        data = r.content
        if len(data) < 3000:
            return False
        img = Image.open(BytesIO(data))
        img = img.convert("RGB")
        img.thumbnail(target_size, Image.LANCZOS)
        bg = Image.new("RGB", target_size, (255, 255, 255))
        x = (target_size[0] - img.width) // 2
        y = (target_size[1] - img.height) // 2
        bg.paste(img, (x, y))
        bg.save(str(dest), "JPEG", quality=85)
        return True
    except Exception as e:
        return False

if __name__ == "__main__":
    ok = fail = 0
    for t in TARGETS:
        slug = t["slug"]
        dest = OUT / f"{slug}.jpg"
        if dest.exists() and dest.stat().st_size > 3000:
            print(f"  {slug}: already exists, skipping")
            continue
        print(f"  {slug}:", end=" ", flush=True)
        done = False
        for q in t["queries"]:
            urls = bing_images(q)
            for u in urls:
                if download_and_save(u, dest):
                    print(f"✓ ({u[:60]}...)")
                    ok += 1; done = True; break
            if done: break
            time.sleep(0.8)
        if not done:
            print("✗ FAILED")
            fail += 1
        time.sleep(1.2)
    print(f"\nDone: {ok} downloaded, {fail} failed")