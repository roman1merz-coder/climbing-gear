#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
  climbing-gear.com — Hero Image Validator
═══════════════════════════════════════════════════════════════════════

Validates ALL product images across all categories against the
platform image standards defined in image_standards.py.

Usage:
    python3 scripts/validate_images.py              # Check all categories
    python3 scripts/validate_images.py belays       # Check one category
    python3 scripts/validate_images.py --fix        # Auto-fix what we can

Exit code 0 = all pass, 1 = issues found.
"""
import sys, os, json
from pathlib import Path
from collections import defaultdict

# Add scripts dir to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent))
from image_standards import (
    CATEGORIES, TARGET_SIZE, BG_WHITE_THRESHOLD, MIN_FILL_PERCENT,
    MIN_FILE_SIZE_BYTES, MAX_FILE_SIZE_BYTES, CONTENT_DIFF_THRESHOLD,
    DUPLICATE_DIFF_THRESHOLD, BACKGROUND_COLOR, JPEG_QUALITY,
    get_image_dir, get_seed_path, PIPELINE,
)

try:
    from PIL import Image
    import numpy as np
except ImportError:
    print("ERROR: Requires Pillow and numpy. Install with:")
    print("  pip3 install Pillow numpy")
    sys.exit(1)


# ─── Validation checks ──────────────────────────────────────────────

def check_dimensions(img_path: Path) -> list:
    """Check image is exactly TARGET_SIZE."""
    issues = []
    img = Image.open(img_path)
    if img.size != TARGET_SIZE:
        issues.append(f"DIMENSIONS: {img.size[0]}×{img.size[1]} (expected {TARGET_SIZE[0]}×{TARGET_SIZE[1]})")
    return issues


def check_file_size(img_path: Path) -> list:
    """Check file size is within acceptable range."""
    issues = []
    sz = img_path.stat().st_size
    if sz < MIN_FILE_SIZE_BYTES:
        issues.append(f"FILE_TOO_SMALL: {sz} bytes (min {MIN_FILE_SIZE_BYTES})")
    if sz > MAX_FILE_SIZE_BYTES:
        issues.append(f"FILE_TOO_LARGE: {sz} bytes (max {MAX_FILE_SIZE_BYTES})")
    return issues


def check_background(img_path: Path) -> list:
    """Check corners are white (near 255,255,255)."""
    issues = []
    img = Image.open(img_path).convert("RGB")
    w, h = img.size
    arr = np.array(img)
    corners = [arr[3, 3], arr[3, w-4], arr[h-4, 3], arr[h-4, w-4]]
    avg_channel = np.mean([np.mean(c) for c in corners])
    if avg_channel < BG_WHITE_THRESHOLD:
        issues.append(f"DARK_BACKGROUND: corner avg={avg_channel:.0f} (min {BG_WHITE_THRESHOLD})")
    return issues


def check_fill(img_path: Path) -> list:
    """Check product fills enough of the frame."""
    issues = []
    img = Image.open(img_path).convert("RGB")
    w, h = img.size
    arr = np.array(img)
    corners = [arr[2, 2], arr[2, w-3], arr[h-3, 2], arr[h-3, w-3]]
    bg_color = np.mean(corners, axis=0)
    diff = np.abs(arr.astype(float) - bg_color).sum(axis=2)
    mask = diff > CONTENT_DIFF_THRESHOLD
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    if rows.any() and cols.any():
        rmin, rmax = np.where(rows)[0][[0, -1]]
        cmin, cmax = np.where(cols)[0][[0, -1]]
        fill_pct = ((cmax - cmin) * (rmax - rmin)) / (w * h) * 100
    else:
        fill_pct = 0
    if fill_pct < MIN_FILL_PERCENT:
        issues.append(f"UNDERFILLED: {fill_pct:.0f}% (min {MIN_FILL_PERCENT}%)")
    return issues


def check_format(img_path: Path) -> list:
    """Check file is JPEG."""
    issues = []
    if img_path.suffix.lower() not in [".jpg", ".jpeg"]:
        issues.append(f"WRONG_FORMAT: {img_path.suffix} (expected .jpg)")
    return issues


def find_duplicates(image_dir: Path) -> list:
    """Find images that are too similar (potential duplicates)."""
    issues = []
    files = sorted(image_dir.glob("*.jpg"))
    if len(files) < 2:
        return issues

    # Quick check: same file size
    by_size = defaultdict(list)
    for f in files:
        by_size[f.stat().st_size].append(f.stem)
    for sz, slugs in by_size.items():
        if len(slugs) > 1:
            issues.append(f"DUPLICATE_SIZE: {slugs} ({sz} bytes each)")

    # Deeper check: pixel similarity for same-size files
    for sz, slugs in by_size.items():
        if len(slugs) <= 1:
            continue
        arrays = {}
        for slug in slugs:
            img = Image.open(image_dir / f"{slug}.jpg").convert("RGB")
            arrays[slug] = np.array(img).astype(float)
        for i, s1 in enumerate(slugs):
            for s2 in slugs[i+1:]:
                diff = np.mean(np.abs(arrays[s1] - arrays[s2]))
                if diff < DUPLICATE_DIFF_THRESHOLD:
                    issues.append(f"DUPLICATE_PIXELS: {s1} ↔ {s2} (diff={diff:.1f})")
    return issues


def check_missing(category: str) -> list:
    """Check if any products in seed data are missing images."""
    issues = []
    seed_path = get_seed_path(category)
    image_dir = get_image_dir(category)
    if not seed_path.exists():
        return [f"SEED_NOT_FOUND: {seed_path}"]
    with open(seed_path) as f:
        products = json.load(f)
    for p in products:
        slug = p.get("slug", "unknown")
        img_path = image_dir / f"{slug}.jpg"
        if not img_path.exists():
            issues.append(f"MISSING: {slug}")
        elif img_path.stat().st_size < MIN_FILE_SIZE_BYTES:
            issues.append(f"PLACEHOLDER: {slug} ({img_path.stat().st_size} bytes)")
    return issues


# ─── Auto-fix: re-process to meet standards ──────────────────────────

def fix_image(img_path: Path) -> bool:
    """Attempt to auto-fix an image (crop, resize, white BG)."""
    try:
        img = Image.open(img_path).convert("RGB")
        w, h = img.size
        arr = np.array(img)

        # Find content bounding box
        corners = [arr[2, 2], arr[2, w-3], arr[h-3, 2], arr[h-3, w-3]]
        bg_color = np.mean(corners, axis=0)
        diff = np.abs(arr.astype(float) - bg_color).sum(axis=2)
        mask = diff > CONTENT_DIFF_THRESHOLD
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

        # Resize and center on white canvas
        img.thumbnail(TARGET_SIZE, Image.LANCZOS)
        bg = Image.new("RGB", TARGET_SIZE, BACKGROUND_COLOR)
        x = (TARGET_SIZE[0] - img.width) // 2
        y = (TARGET_SIZE[1] - img.height) // 2
        bg.paste(img, (x, y))
        bg.save(str(img_path), "JPEG", quality=JPEG_QUALITY)
        return True
    except Exception as e:
        print(f"    Fix failed: {e}")
        return False


# ─── Main ─────────────────────────────────────────────────────────────

def validate_category(category: str, fix: bool = False) -> dict:
    """Run all validation checks on a single category."""
    image_dir = get_image_dir(category)
    results = {"pass": 0, "fail": 0, "fixed": 0, "issues": []}

    if not image_dir.exists():
        results["issues"].append(("CATEGORY", f"Image dir not found: {image_dir}"))
        results["fail"] += 1
        return results

    files = sorted(image_dir.glob("*.jpg"))
    print(f"\n{'═'*60}")
    print(f"  {category.upper()} — {len(files)} images")
    print(f"  {image_dir}")
    print(f"{'═'*60}")

    # Per-file checks
    for img_path in files:
        file_issues = []
        file_issues.extend(check_dimensions(img_path))
        file_issues.extend(check_file_size(img_path))
        file_issues.extend(check_background(img_path))
        file_issues.extend(check_fill(img_path))
        file_issues.extend(check_format(img_path))

        if file_issues:
            if fix:
                # Try auto-fix for dimension/fill/bg issues
                fixable = any(i.startswith(("DIMENSIONS", "UNDERFILLED", "DARK_BACKGROUND"))
                              for i in file_issues)
                if fixable and fix_image(img_path):
                    # Re-check after fix
                    recheck = []
                    recheck.extend(check_dimensions(img_path))
                    recheck.extend(check_file_size(img_path))
                    recheck.extend(check_background(img_path))
                    recheck.extend(check_fill(img_path))
                    if not recheck:
                        print(f"  ✓ {img_path.stem} — FIXED")
                        results["fixed"] += 1
                        results["pass"] += 1
                        continue
                    file_issues = recheck

            results["fail"] += 1
            for issue in file_issues:
                results["issues"].append((img_path.stem, issue))
                print(f"  ✗ {img_path.stem}: {issue}")
        else:
            results["pass"] += 1

    # Category-wide checks
    dup_issues = find_duplicates(image_dir)
    for issue in dup_issues:
        results["issues"].append(("CATEGORY", issue))
        print(f"  ⚠ {issue}")

    missing_issues = check_missing(category)
    for issue in missing_issues:
        results["issues"].append(("CATEGORY", issue))
        if issue.startswith("MISSING"):
            print(f"  ⚠ {issue}")

    return results


def main():
    fix_mode = "--fix" in sys.argv
    categories = [a for a in sys.argv[1:] if not a.startswith("--")]

    if not categories:
        categories = list(CATEGORIES.keys())

    total_pass = total_fail = total_fixed = 0
    all_issues = []

    for cat in categories:
        if cat not in CATEGORIES:
            print(f"Unknown category: {cat}")
            print(f"Available: {', '.join(CATEGORIES.keys())}")
            sys.exit(1)
        results = validate_category(cat, fix=fix_mode)
        total_pass += results["pass"]
        total_fail += results["fail"]
        total_fixed += results["fixed"]
        all_issues.extend(results["issues"])

    # Summary
    print(f"\n{'━'*60}")
    print(f"  SUMMARY: {total_pass} pass, {total_fail} fail", end="")
    if total_fixed:
        print(f", {total_fixed} auto-fixed", end="")
    print()
    if all_issues:
        print(f"  {len(all_issues)} total issues found")
        if not fix_mode:
            print(f"  Run with --fix to auto-fix dimension/fill/bg issues")
    else:
        print(f"  ✅ All images meet platform standards!")
    print(f"{'━'*60}")

    sys.exit(1 if total_fail > 0 else 0)


if __name__ == "__main__":
    main()