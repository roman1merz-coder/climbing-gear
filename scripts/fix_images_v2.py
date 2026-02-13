#!/usr/bin/env python3
"""Download specific manufacturer product images for problematic belays."""
import sys, os
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

def download_and_save(url, dest, target_size=(400, 400)):
    try:
        r = S.get(url, timeout=20)
        r.raise_for_status()
        data = r.content
        if len(data) < 2000:
            print(f"    Too small ({len(data)} bytes)")
            return False
        img = Image.open(BytesIO(data))
        img = img.convert("RGB")
        img.thumbnail(target_size, Image.LANCZOS)
        bg = Image.new("RGB", target_size, (255, 255, 255))
        x = (target_size[0] - img.width) // 2
        y = (target_size[1] - img.height) // 2
        bg.paste(img, (x, y))
        bg.save(str(dest), "JPEG", quality=85)
        print(f"    Saved ({dest.stat().st_size} bytes)")
        return True
    except Exception as e:
        print(f"    Error: {e}")
        return False

# Direct manufacturer image URLs — multiple fallbacks per product
TARGETS = {
    "petzl-neox": [
        "https://www.petzl.com/sfc/servlet.shepherd/version/download/068Tx000009aXa1IAE",
        "https://www.petzl.com/sfc/servlet.shepherd/version/download/068Tx000002WjDzIAK",
        "https://www.petzl.com/sfc/servlet.shepherd/version/download/068Tx000002Wh0uIAC",
    ],
    "edelrid-giga-jul": [
        "https://shopapi.edelrid.com/v1/media/image/edelrid/24034/web-l",
        "https://shopapi.edelrid.com/v1/media/image/edelrid/24034/web-m",
        "https://shopapi.edelrid.com/v1/media/image/edelrid/24034/web-s",
        "https://shopapi.edelrid.com/v1/media/image/edelrid/37822/web-l",
        "https://shopapi.edelrid.com/v1/media/image/edelrid/37822/web-m",
    ],
    "wild-country-revo": [
        "https://oberalp.imgix.net/f445c136-7b01-49b6-ae1b-36f65a5784e0.png?auto=format&fit=clip&w=800",
        "https://oberalp.imgix.net/f445c136-7b01-49b6-ae1b-36f65a5784e0.png?auto=format&fit=clip&w=528",
    ],
    "black-diamond-atc": [
        "https://eu.blackdiamondequipment.com/cdn/shop/files/620073_BLAK_ATC_BLACK_01.jpg?v=1745427810",
        "https://eu.blackdiamondequipment.com/cdn/shop/files/620073_BLAK_ATC_BLACK_01_grande.jpg?v=1745427810",
    ],
    "grivel-master": [
        "https://grivel.com/cdn/shop/products/climbing_devices_master.png?v=1739990419&width=800",
        "https://grivel.com/cdn/shop/products/climbing_devices_master.png?v=1739990419",
    ],
    "grivel-shuttle": [
        "https://grivel.com/cdn/shop/products/climbing_devices_shuttle.png?v=1739990419&width=800",
        "https://grivel.com/cdn/shop/products/climbing_devices_shuttle.png?v=1739990419",
        "https://grivel.com/cdn/shop/files/climbing_devices_shuttle.png?width=800",
    ],
}

if __name__ == "__main__":
    ok = fail = 0
    for slug, urls in TARGETS.items():
        dest = OUT / f"{slug}.jpg"
        # Remove existing file to force re-download
        if dest.exists():
            dest.unlink()
        print(f"  {slug}:")
        done = False
        for url in urls:
            print(f"    Trying: {url[:80]}...")
            if download_and_save(url, dest):
                ok += 1; done = True; break
        if not done:
            print(f"    FAILED - no URL worked")
            fail += 1
    print(f"\nDone: {ok} downloaded, {fail} failed")