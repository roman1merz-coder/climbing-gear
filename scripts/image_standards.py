#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
  climbing-gear.com — Hero Image Standards
═══════════════════════════════════════════════════════════════════════

Central configuration for all product hero images across the platform.
Every product category (shoes, belays, ropes, crashpads, and future
categories) MUST conform to these standards.

Usage:
    from image_standards import STANDARDS, validate_image, process_image
"""
from dataclasses import dataclass, field
from typing import Tuple, List
from pathlib import Path

# ─── Platform-wide image specifications ──────────────────────────────

TARGET_SIZE: Tuple[int, int] = (400, 400)      # px, square canvas
JPEG_QUALITY: int = 85                          # JPEG compression quality
BACKGROUND_COLOR: Tuple[int, int, int] = (255, 255, 255)  # Pure white
FILE_FORMAT: str = "JPEG"
FILE_EXTENSION: str = ".jpg"

# ─── Validation thresholds ───────────────────────────────────────────

MIN_FILE_SIZE_BYTES: int = 3_000       # Skip placeholders / corrupt files
MAX_FILE_SIZE_BYTES: int = 200_000     # Flag oversized images
BG_WHITE_THRESHOLD: float = 230.0      # Avg corner channel value must be above this
MIN_FILL_PERCENT: float = 25.0         # Product must fill at least 25% of the canvas
CONTENT_DIFF_THRESHOLD: float = 30.0   # Pixel diff from BG to count as "content"
DUPLICATE_DIFF_THRESHOLD: float = 10.0 # Images with mean pixel diff below this are duplicates

# ─── Content rules (what the image MUST / MUST NOT contain) ──────────

@dataclass
class ContentRules:
    """Defines what is acceptable in a hero image."""
    # MUST
    product_only: bool = True          # Only the product itself
    white_background: bool = True      # Pure white or near-white background
    fill_frame: bool = True            # Product should fill 25–85% of canvas
    consistent_size: bool = True       # All images same dimensions (400×400)

    # MUST NOT
    no_hands_or_people: bool = True    # No human body parts
    no_rope_threaded: bool = True      # No rope loaded through the device
    no_carabiners: bool = True         # Unless sold as a kit (see exceptions)
    no_outdoor_backgrounds: bool = True # No rock, dirt, sky, gym walls
    no_watermarks: bool = True         # No retailer/photographer watermarks
    no_annotations: bool = True        # No text overlays, arrows, labels
    no_action_shots: bool = True       # No in-use demonstration photos

    # EXCEPTIONS
    kit_products_allow_carabiner: bool = True  # e.g., Salewa Ergo (sold with biner)
    cable_loop_is_part_of_product: bool = True # Wire gates on tubular devices = OK

CONTENT_RULES = ContentRules()

# ─── Image sourcing priority ─────────────────────────────────────────

SOURCING_PRIORITY: List[str] = [
    "manufacturer_website",     # 1st: Official brand product pages
    "bergfreunde",              # 2nd: bfgcdn.com — consistently clean white-BG shots
    "weighmyrack",              # 3rd: weighmyrack.com — clean product-only shots
    "retailer_product_page",    # 4th: REI, CampSaver, Snowleader, etc.
    "bing_image_search",        # 5th: Bing with quality filters (last resort)
]

# ─── Search query templates per category ─────────────────────────────

SEARCH_QUERIES = {
    "belays": [
        "{brand} {model} climbing belay device product photo white background",
        "{brand} {model} belay device product photo",
        "{brand} {model} belay device",
    ],
    "shoes": [
        "{brand} {model} climbing shoe product photo white background",
        "{brand} {model} climbing shoe product",
        "{brand} {model} climbing shoe",
    ],
    "ropes": [
        "{brand} {model} climbing rope product photo white background",
        "{brand} {model} climbing rope product",
        "{brand} {model} dynamic rope",
    ],
    "crashpads": [
        "{brand} {model} crashpad bouldering pad product photo white background",
        "{brand} {model} crashpad bouldering pad product",
        "{brand} {model} bouldering pad",
    ],
}

# ─── Category → seed file + image dir mapping ────────────────────────

CATEGORIES = {
    "belays":    {"seed": "belay_seed_data.json",    "image_dir": "belays"},
    "shoes":     {"seed": "shoe_seed_data.json",     "image_dir": "shoes"},
    "ropes":     {"seed": "rope_seed_data.json",     "image_dir": "ropes"},
    "crashpads": {"seed": "crashpad_seed_data.json", "image_dir": "crashpads"},
}

# ─── Processing pipeline ─────────────────────────────────────────────

@dataclass
class ProcessingPipeline:
    """Steps applied to every downloaded image before saving."""
    convert_to_rgb: bool = True        # Convert RGBA/P/L → RGB
    remove_alpha: bool = True          # Flatten transparency onto white
    crop_to_content: bool = True       # Auto-detect product bounding box
    content_padding_pct: float = 0.08  # 8% padding around product after crop
    resize_method: str = "LANCZOS"     # High-quality downscaling
    center_on_canvas: bool = True      # Center product on white 400×400 canvas
    save_format: str = "JPEG"
    save_quality: int = 85

PIPELINE = ProcessingPipeline()

# ─── Manufacturer site patterns (for source prioritization) ──────────

MANUFACTURER_DOMAINS = {
    "petzl":               ["petzl.com"],
    "edelrid":             ["edelrid.com", "shopapi.edelrid.com"],
    "black diamond":       ["blackdiamondequipment.com", "eu.blackdiamondequipment.com"],
    "mammut":              ["mammut.com"],
    "wild country":        ["wildcountry.com"],
    "climbing technology": ["climbingtechnology.com"],
    "camp":                ["camp.it", "campusa.com"],
    "dmm":                 ["dmmwales.com", "dmmclimbing.com"],
    "grivel":              ["grivel.com"],
    "beal":                ["bfrope.com", "bfropes.com"],
    "trango":              ["trango.com"],
    "la sportiva":         ["lasportiva.com"],
    "scarpa":              ["scarpa.com"],
    "evolv":               ["evolvsports.com"],
    "tenaya":              ["tenaya.net"],
    "ocun":                ["ocun.com"],
    "boreal":              ["e-boreal.com"],
    "unparallel":          ["unparallelsports.com"],
    "so ill":              ["soill.com"],
    "butora":              ["butora.com"],
    "madrock":             ["madrockclimbing.com"],
    "moon":                ["moonclimbing.com"],
    "metolius":            ["metoliusclimbing.com"],
    "organic":             ["organicclimbing.com"],
    "moon":                ["moonclimbing.com"],
    "flashed":             ["flashedclimbing.com"],
    "snap":                ["snap-climbing.com"],
}

TRUSTED_RETAILERS = [
    "bfgcdn.com",           # Bergfreunde — best white-BG product shots
    "weighmyrack.com",      # WeighMyRack — clean product-only images
    "snowleader.com",       # Snowleader — good product photos
    "absolute-snow.co.uk",  # Absolute Snow
    "rei.com",              # REI
    "backcountry.com",      # Backcountry
    "campsaver.com",        # CampSaver
]


# ─── Helper: get repo root ───────────────────────────────────────────

def get_repo_root() -> Path:
    """Find the repository root (parent of scripts/)."""
    return Path(__file__).resolve().parent.parent

def get_image_dir(category: str) -> Path:
    """Get the image directory for a category."""
    return get_repo_root() / "public" / "images" / CATEGORIES[category]["image_dir"]

def get_seed_path(category: str) -> Path:
    """Get the seed data file path for a category."""
    return get_repo_root() / "src" / CATEGORIES[category]["seed"]
