#!/usr/bin/env python3
"""Add missing crashpad models to seed data."""
import json, pathlib

SEED = pathlib.Path(__file__).resolve().parent.parent / "src" / "crashpad_seed_data.json"

NEW_PADS = [
    # ── Black Diamond Erratic ──
    {
        "brand": "Black Diamond", "model": "Erratic", "slug": "black-diamond-erratic",
        "year_released": 2024, "pad_size_category": "large", "fold_style": "hinge",
        "best_use": ["midrange", "highball"],
        "approach_suitability": "long", "length_open_cm": 122, "width_open_cm": 102,
        "thickness_cm": 11, "weight_kg": 5.6, "impact_protection": "high",
        "foam_firmness": "moderate", "foam_layers": 3,
        "foam_types": ["open_cell", "closed_cell"],
        "has_hinge_protection": True, "durability": "high", "shell_denier": 840,
        "bottom_coating": "tpu_coated", "closure_system": "flap",
        "reconfigurable": False, "carry_comfort": "excellent",
        "shoulder_straps": True, "waist_belt": True, "chest_strap": True,
        "carry_handles": 3, "bandolier_strap": False, "gear_storage": "moderate",
        "shoe_wipe": False, "couch_mode": False,
        "price_uvp_eur": 420, "current_price_eur": 399,
        "recycled_materials": "none", "hic_certified": False, "bluesign": False,
        "image_url": "/images/crashpads/black-diamond-erratic.jpg",
        "pros": [
            "Outstanding weight-to-size ratio for long approaches",
            "Premium Dynex grid fabric with TPU water-resistant coating",
            "Highly adjustable backpack carry system designed for heavy loads",
            "Reinforced corners withstand abrasion on rough terrain",
            "Sandwiched foam construction enhances water resistance"
        ],
        "cons": [
            "Premium price point for a single pad",
            "Discontinued at some retailers — limited availability",
            "Hinge fold creates a seam in the landing zone"
        ],
        "customer_voices": [
            "The most comfortable and well-thought-out backcountry bouldering pad on the market. The carry system is in a league of its own.",
            "Dragged it across limestone and sandstone all season — the ripstop Dynex fabric barely shows wear. Seriously durable.",
            "If your bouldering involves actual hiking, this is the pad. Light enough for real approaches without sacrificing landing area."
        ]
    },
    # ── La Sportiva Laspo ──
    {
        "brand": "La Sportiva", "model": "Laspo", "slug": "la-sportiva-laspo",
        "year_released": 2022, "pad_size_category": "medium", "fold_style": "hinge",
        "best_use": ["lowball", "midrange"],
        "approach_suitability": "moderate", "length_open_cm": 115, "width_open_cm": 100,
        "thickness_cm": 10, "weight_kg": 6.0, "impact_protection": "high",
        "foam_firmness": "moderate", "foam_layers": 2,
        "foam_types": ["open_cell", "closed_cell"],
        "has_hinge_protection": True, "durability": "high", "shell_denier": 1000,
        "bottom_coating": "standard", "closure_system": "flap",
        "reconfigurable": False, "carry_comfort": "good",
        "shoulder_straps": True, "waist_belt": True, "chest_strap": False,
        "carry_handles": 2, "bandolier_strap": False, "gear_storage": "moderate",
        "shoe_wipe": False, "couch_mode": False,
        "price_uvp_eur": 250, "current_price_eur": 219,
        "recycled_materials": "none", "hic_certified": False, "bluesign": False,
        "image_url": "/images/crashpads/la-sportiva-laspo.jpg",
        "pros": [
            "Innovative 45-degree hinge reduces accidental fold-overs at the crag",
            "Dual-density PE/PU foam provides solid impact protection",
            "Waterproof inner cover keeps foam dry in wet conditions",
            "Compatible with La Sportiva Alpagota and Sittone for expanded coverage"
        ],
        "cons": [
            "Modest landing area compared to similarly priced competitors",
            "Basic carry system — no chest strap",
            "Limited brand presence in the crashpad market"
        ],
        "customer_voices": [
            "The 45-degree hinge is a clever touch — the pad stays flat where other hinged pads tend to fold up during falls.",
            "Solid all-rounder from a brand better known for shoes. The foam quality is genuinely good.",
            "Pairs well with La Sportiva's smaller pads for full coverage. Good primary pad for moderate-height bouldering."
        ]
    },
    # ── La Sportiva Maipo ──
    {
        "brand": "La Sportiva", "model": "Maipo", "slug": "la-sportiva-maipo",
        "year_released": 2023, "pad_size_category": "medium", "fold_style": "taco",
        "best_use": ["lowball", "midrange"],
        "approach_suitability": "moderate", "length_open_cm": 120, "width_open_cm": 100,
        "thickness_cm": 10.5, "weight_kg": 6.2, "impact_protection": "high",
        "foam_firmness": "moderate", "foam_layers": 3,
        "foam_types": ["open_cell", "closed_cell"],
        "has_hinge_protection": False, "durability": "high", "shell_denier": 1200,
        "bottom_coating": "standard", "closure_system": "flap",
        "reconfigurable": False, "carry_comfort": "good",
        "shoulder_straps": True, "waist_belt": True, "chest_strap": True,
        "carry_handles": 2, "bandolier_strap": False, "gear_storage": "moderate",
        "shoe_wipe": False, "couch_mode": False,
        "price_uvp_eur": 269, "current_price_eur": 239,
        "recycled_materials": "partial", "hic_certified": False, "bluesign": False,
        "image_url": "/images/crashpads/la-sportiva-maipo.jpg",
        "pros": [
            "Three-density foam system — closed-cell impact layer, PU cushion, recycled polyamide base",
            "1200D nylon exterior for excellent durability",
            "Taco fold provides seamless landing surface",
            "Recycled polyamide base layer adapts to uneven terrain"
        ],
        "cons": [
            "Slightly heavier than the Laspo for similar landing area",
            "Limited availability outside Europe"
        ],
        "customer_voices": [
            "The three-density foam system works noticeably well — the closed-cell layer on top takes the initial hit while the PU underneath cushions you.",
            "La Sportiva's climbing expertise shows in the design details. The 1200D shell is built to last.",
            "A strong alternative to the established brands. The recycled base layer is a nice sustainability touch."
        ]
    },
    # ── Send Climbing 4x4 Pro ──
    {
        "brand": "Send Climbing", "model": "4x4 Pro", "slug": "send-4x4-pro",
        "year_released": 2022, "pad_size_category": "oversized", "fold_style": "hinge",
        "best_use": ["midrange", "highball"],
        "approach_suitability": "roadside", "length_open_cm": 122, "width_open_cm": 122,
        "thickness_cm": 9.5, "weight_kg": 7.5, "impact_protection": "high",
        "foam_firmness": "firm", "foam_layers": 4,
        "foam_types": ["open_cell", "closed_cell"],
        "has_hinge_protection": True, "durability": "high", "shell_denier": 1000,
        "bottom_coating": "standard", "closure_system": "flap",
        "reconfigurable": True, "carry_comfort": "excellent",
        "shoulder_straps": True, "waist_belt": True, "chest_strap": True,
        "carry_handles": 4, "bandolier_strap": False, "gear_storage": "moderate",
        "shoe_wipe": False, "couch_mode": False,
        "price_uvp_eur": 499, "current_price_eur": 499,
        "recycled_materials": "none", "hic_certified": False, "bluesign": False,
        "image_url": "/images/crashpads/send-4x4-pro.jpg",
        "pros": [
            "Massive 1.49m² square landing zone — one of the largest available",
            "Patented DistribuFrame spreads impact across a wider area",
            "4-layer dual-density foam system for superior deceleration",
            "PadLink system lets you tether multiple Send pads together",
            "Expandable to 4x6 feet with optional Add-A-Pad"
        ],
        "cons": [
            "Heavy and bulky — strictly for short approaches",
            "Premium price at $525 USD",
            "Square shape can be awkward to carry on trails"
        ],
        "customer_voices": [
            "The DistribuFrame technology genuinely changes how falls feel — impacts spread out instead of bottoming through.",
            "A square pad this size covers most landings solo. The PadLink system is brilliant for group sessions.",
            "Premium price for premium engineering. The 4-layer foam system is the most advanced I've used."
        ]
    },
    # ── Send Climbing 3x4 Essential ──
    {
        "brand": "Send Climbing", "model": "3x4 Essential", "slug": "send-3x4-essential",
        "year_released": 2023, "pad_size_category": "medium", "fold_style": "hinge",
        "best_use": ["lowball", "midrange"],
        "approach_suitability": "moderate", "length_open_cm": 122, "width_open_cm": 91,
        "thickness_cm": 9.5, "weight_kg": 5.4, "impact_protection": "high",
        "foam_firmness": "moderate", "foam_layers": 4,
        "foam_types": ["open_cell", "closed_cell"],
        "has_hinge_protection": True, "durability": "high", "shell_denier": 1000,
        "bottom_coating": "standard", "closure_system": "flap",
        "reconfigurable": True, "carry_comfort": "good",
        "shoulder_straps": True, "waist_belt": True, "chest_strap": True,
        "carry_handles": 3, "bandolier_strap": False, "gear_storage": "moderate",
        "shoe_wipe": False, "couch_mode": False,
        "price_uvp_eur": 329, "current_price_eur": 329,
        "recycled_materials": "none", "hic_certified": False, "bluesign": False,
        "image_url": "/images/crashpads/send-3x4-essential.jpg",
        "pros": [
            "Same DistribuFrame and foam system as the Pro in a lighter package",
            "Great all-around size for everyday bouldering",
            "PadLink compatible for multi-pad setups",
            "More portable than the 4x4 for moderate approaches"
        ],
        "cons": [
            "Lighter build than Pro — less heavy-duty for alpine use",
            "Still expensive compared to mainstream brands"
        ],
        "customer_voices": [
            "All the Send technology in a more portable format. This is my daily driver for local bouldering.",
            "The Essential strips the Pro down to the essentials without losing the foam quality. Smart option.",
            "PadLink compatibility means I can combine it with my buddy's 4x4 for full coverage on bigger projects."
        ]
    },
    # ── Send Climbing 4x4 Essential ──
    {
        "brand": "Send Climbing", "model": "4x4 Essential", "slug": "send-4x4-essential",
        "year_released": 2023, "pad_size_category": "oversized", "fold_style": "hinge",
        "best_use": ["midrange", "highball"],
        "approach_suitability": "roadside", "length_open_cm": 122, "width_open_cm": 122,
        "thickness_cm": 9.5, "weight_kg": 6.8, "impact_protection": "high",
        "foam_firmness": "moderate", "foam_layers": 4,
        "foam_types": ["open_cell", "closed_cell"],
        "has_hinge_protection": True, "durability": "high", "shell_denier": 1000,
        "bottom_coating": "standard", "closure_system": "flap",
        "reconfigurable": True, "carry_comfort": "good",
        "shoulder_straps": True, "waist_belt": True, "chest_strap": True,
        "carry_handles": 4, "bandolier_strap": False, "gear_storage": "moderate",
        "shoe_wipe": False, "couch_mode": False,
        "price_uvp_eur": 449, "current_price_eur": 449,
        "recycled_materials": "none", "hic_certified": False, "bluesign": False,
        "image_url": "/images/crashpads/send-4x4-essential.jpg",
        "pros": [
            "Massive square landing zone at a lighter weight than the Pro",
            "DistribuFrame technology for superior impact distribution",
            "PadLink system for seamless multi-pad coverage",
            "More accessible price point than the 4x4 Pro"
        ],
        "cons": [
            "Large and bulky for transport",
            "Square shape less ergonomic to carry than rectangular pads"
        ],
        "customer_voices": [
            "The sweet spot between the Pro's features and a more manageable weight. Massive coverage without the premium price.",
            "Square pads make so much sense for bouldering — you don't have to think about which way to orient it under the problem.",
            "The DistribuFrame works just as well in the Essential as the Pro. Smart engineering that transfers across the lineup."
        ]
    },
    # ── Send Climbing 4x4 Pro Highball ──
    {
        "brand": "Send Climbing", "model": "4x4 Pro Highball", "slug": "send-4x4-pro-highball",
        "year_released": 2023, "pad_size_category": "oversized", "fold_style": "hinge",
        "best_use": ["highball"],
        "approach_suitability": "roadside", "length_open_cm": 122, "width_open_cm": 122,
        "thickness_cm": 13, "weight_kg": 9.0, "impact_protection": "very_high",
        "foam_firmness": "firm", "foam_layers": 4,
        "foam_types": ["open_cell", "closed_cell"],
        "has_hinge_protection": True, "durability": "high", "shell_denier": 1000,
        "bottom_coating": "standard", "closure_system": "flap",
        "reconfigurable": True, "carry_comfort": "good",
        "shoulder_straps": True, "waist_belt": True, "chest_strap": True,
        "carry_handles": 4, "bandolier_strap": False, "gear_storage": "moderate",
        "shoe_wipe": False, "couch_mode": False,
        "price_uvp_eur": 599, "current_price_eur": 599,
        "recycled_materials": "none", "hic_certified": False, "bluesign": False,
        "image_url": "/images/crashpads/send-4x4-pro-highball.jpg",
        "pros": [
            "13cm of DistribuFrame-backed foam — maximum fall protection",
            "Largest and thickest pad in the Send system",
            "PadLink compatible for building out massive landing zones",
            "Designed specifically for highball sends"
        ],
        "cons": [
            "Very heavy at 9kg — roadside only",
            "Highest price in the lineup",
            "Overkill for moderate-height bouldering"
        ],
        "customer_voices": [
            "When you're looking up at a 7-meter problem, this is the pad you want. The extra thickness is immediately noticeable.",
            "The highball version takes everything good about the 4x4 Pro and adds the foam depth you need for serious sends.",
            "Expensive, heavy, and worth every gram when you're committed to highball bouldering."
        ]
    },
    # ── Kinetik Newton 4.0 ──
    {
        "brand": "Kinetik", "model": "Newton 4.0", "slug": "kinetik-newton-4",
        "year_released": 2019, "pad_size_category": "medium", "fold_style": "hinge",
        "best_use": ["lowball", "midrange", "highball"],
        "approach_suitability": "long", "length_open_cm": 122, "width_open_cm": 91,
        "thickness_cm": 10, "weight_kg": 5.9, "impact_protection": "high",
        "foam_firmness": "moderate", "foam_layers": 3,
        "foam_types": ["open_cell", "closed_cell"],
        "has_hinge_protection": True, "durability": "high", "shell_denier": 1680,
        "bottom_coating": "standard", "closure_system": "flap",
        "reconfigurable": False, "carry_comfort": "excellent",
        "shoulder_straps": True, "waist_belt": True, "chest_strap": True,
        "carry_handles": 2, "bandolier_strap": False, "gear_storage": "moderate",
        "shoe_wipe": False, "couch_mode": False,
        "price_uvp_eur": 349, "current_price_eur": 329,
        "recycled_materials": "none", "hic_certified": False, "bluesign": False,
        "image_url": "/images/crashpads/kinetik-newton-4.jpg",
        "pros": [
            "Ultra-tough 1680D ballistic nylon shell — built for alpine abuse",
            "Omni-flap closure protects straps from snow and mud",
            "Comfortable carry system designed for heavy loads and long approaches",
            "Made in Colorado for high-alpine bouldering conditions"
        ],
        "cons": [
            "Heavier than some competitors at this size due to burly shell",
            "Limited availability outside the US",
            "Premium price for the build quality"
        ],
        "customer_voices": [
            "Built like a tank. The 1680D shell has survived granite, sandstone, and alpine talus without showing significant wear.",
            "The Omni-flap is a small detail that makes a big difference — no more muddy straps after a wet session.",
            "Designed by people who actually boulder in the mountains. The alpine carry system handles heavy loads better than any pad I've used."
        ]
    },
    # ── Escape Climbing Zone Plus ──
    {
        "brand": "Escape Climbing", "model": "Zone Plus", "slug": "escape-zone-plus",
        "year_released": 2025, "pad_size_category": "medium", "fold_style": "hinge",
        "best_use": ["lowball", "midrange", "highball"],
        "approach_suitability": "moderate", "length_open_cm": 122, "width_open_cm": 91,
        "thickness_cm": 12.7, "weight_kg": 6.4, "impact_protection": "high",
        "foam_firmness": "firm", "foam_layers": 2,
        "foam_types": ["open_cell", "closed_cell"],
        "has_hinge_protection": True, "durability": "high", "shell_denier": 1000,
        "bottom_coating": "standard", "closure_system": "flap",
        "reconfigurable": False, "carry_comfort": "good",
        "shoulder_straps": True, "waist_belt": True, "chest_strap": False,
        "carry_handles": 3, "bandolier_strap": False, "gear_storage": "moderate",
        "shoe_wipe": True, "couch_mode": False,
        "price_uvp_eur": 299, "current_price_eur": 279,
        "recycled_materials": "none", "hic_certified": False, "bluesign": False,
        "image_url": "/images/crashpads/escape-zone-plus.jpg",
        "pros": [
            "Extra-thick 5-inch dual-density foam for superior cushioning",
            "Includes a bonus blubber pad for sit-starts and rock protection",
            "Updated 2026 design with stronger straps and more comfortable hip pads",
            "Great value for the thickness and included accessories"
        ],
        "cons": [
            "Newer brand with less track record",
            "Basic carry system without chest strap"
        ],
        "customer_voices": [
            "Five inches of foam at this price point is hard to beat. The included blubber pad is a nice bonus for sit-starts.",
            "Escape Climbing is a newer name but the quality is legit. The 2026 update improved the strap comfort noticeably.",
            "The extra thickness gives you real confidence on higher problems. Solid choice if you want maximum cushion per dollar."
        ]
    },
    # ── Escape Climbing XL Zone Plus ──
    {
        "brand": "Escape Climbing", "model": "XL Zone Plus", "slug": "escape-xl-zone-plus",
        "year_released": 2025, "pad_size_category": "large", "fold_style": "hinge",
        "best_use": ["midrange", "highball"],
        "approach_suitability": "roadside", "length_open_cm": 132, "width_open_cm": 117,
        "thickness_cm": 12.7, "weight_kg": 8.2, "impact_protection": "very_high",
        "foam_firmness": "firm", "foam_layers": 2,
        "foam_types": ["open_cell", "closed_cell"],
        "has_hinge_protection": True, "durability": "high", "shell_denier": 1000,
        "bottom_coating": "standard", "closure_system": "flap",
        "reconfigurable": False, "carry_comfort": "good",
        "shoulder_straps": True, "waist_belt": True, "chest_strap": True,
        "carry_handles": 4, "bandolier_strap": False, "gear_storage": "generous",
        "shoe_wipe": True, "couch_mode": False,
        "price_uvp_eur": 389, "current_price_eur": 369,
        "recycled_materials": "none", "hic_certified": False, "bluesign": False,
        "image_url": "/images/crashpads/escape-xl-zone-plus.jpg",
        "pros": [
            "Extra-large landing area with 5 inches of foam",
            "Includes blubber pad for additional coverage",
            "Durable ripstop nylon construction",
            "Premium shoulder and hip strap system"
        ],
        "cons": [
            "Heavy — best for roadside or short approaches",
            "Newer brand without established repair/warranty reputation"
        ],
        "customer_voices": [
            "The XL version takes everything good about the Zone Plus and supersizes it. Massive coverage with that same thick foam.",
            "For the price, the coverage and foam thickness are exceptional. Competes with pads costing $100+ more.",
            "If you want a big, thick pad without paying Organic or BD Mondo prices, this is the move."
        ]
    },
    # ── ZIGZAG Single LINK ──
    {
        "brand": "ZIGZAG", "model": "Single LINK", "slug": "zigzag-single-link",
        "year_released": 2024, "pad_size_category": "small", "fold_style": "taco",
        "best_use": ["lowball", "traverse"],
        "approach_suitability": "long", "length_open_cm": 91, "width_open_cm": 61,
        "thickness_cm": 10, "weight_kg": 1.8, "impact_protection": "moderate",
        "foam_firmness": "moderate", "foam_layers": 5,
        "foam_types": ["open_cell", "closed_cell"],
        "has_hinge_protection": False, "durability": "high", "shell_denier": 840,
        "bottom_coating": "standard", "closure_system": "strap",
        "reconfigurable": True, "carry_comfort": "good",
        "shoulder_straps": True, "waist_belt": False, "chest_strap": False,
        "carry_handles": 2, "bandolier_strap": False, "gear_storage": "minimal",
        "shoe_wipe": False, "couch_mode": False,
        "price_uvp_eur": 149, "current_price_eur": 149,
        "recycled_materials": "full", "hic_certified": False, "bluesign": False,
        "image_url": "/images/crashpads/zigzag-single-link.jpg",
        "pros": [
            "Patented 360 modularity — connect any side to any other LINK pad",
            "100% recycled REPREVE body fabric made from plastic bottles",
            "Ultra-light at 1.8kg — easily portable",
            "5-layer symmetrical foam with recyclable IVEX PE core",
            "Connection strength over 680kg between linked pads"
        ],
        "cons": [
            "Too small for standalone use on most problems",
            "Requires multiple LINK pads for adequate coverage",
            "Modular system is an investment to build out"
        ],
        "customer_voices": [
            "The modular concept is brilliant — connect with friends and build exactly the coverage you need for each problem.",
            "Love the sustainability angle. Fully recycled materials without compromising on foam quality.",
            "Light enough to throw in a pack alongside other gear. The linking system is genuinely innovative."
        ]
    },
    # ── ZIGZAG Double LINK Set ──
    {
        "brand": "ZIGZAG", "model": "Double LINK Set", "slug": "zigzag-double-link",
        "year_released": 2024, "pad_size_category": "medium", "fold_style": "taco",
        "best_use": ["lowball", "midrange", "traverse"],
        "approach_suitability": "moderate", "length_open_cm": 122, "width_open_cm": 61,
        "thickness_cm": 10, "weight_kg": 3.6, "impact_protection": "high",
        "foam_firmness": "moderate", "foam_layers": 5,
        "foam_types": ["open_cell", "closed_cell"],
        "has_hinge_protection": False, "durability": "high", "shell_denier": 840,
        "bottom_coating": "standard", "closure_system": "strap",
        "reconfigurable": True, "carry_comfort": "good",
        "shoulder_straps": True, "waist_belt": True, "chest_strap": False,
        "carry_handles": 4, "bandolier_strap": False, "gear_storage": "minimal",
        "shoe_wipe": False, "couch_mode": False,
        "price_uvp_eur": 269, "current_price_eur": 269,
        "recycled_materials": "full", "hic_certified": False, "bluesign": False,
        "image_url": "/images/crashpads/zigzag-double-link.jpg",
        "pros": [
            "Two modular pads that link together for flexible configurations",
            "Split and share with a climbing partner",
            "100% recycled materials throughout",
            "Lightweight system at 3.6kg total"
        ],
        "cons": [
            "Combined area smaller than a traditional single pad",
            "System approach means higher total investment for full coverage"
        ],
        "customer_voices": [
            "Buy one set, your partner buys one — now you have four linkable pads that configure for any landing zone.",
            "The eco-friendly construction is genuine, not greenwashing. Recycled fabric, recyclable foam core.",
            "Innovative approach to a traditional product. The linking mechanism is robust and intuitive."
        ]
    },
    # ── ZIGZAG Triple LINK Set ──
    {
        "brand": "ZIGZAG", "model": "Triple LINK Set", "slug": "zigzag-triple-link",
        "year_released": 2024, "pad_size_category": "large", "fold_style": "taco",
        "best_use": ["lowball", "midrange", "highball", "traverse"],
        "approach_suitability": "moderate", "length_open_cm": 183, "width_open_cm": 61,
        "thickness_cm": 10, "weight_kg": 5.4, "impact_protection": "high",
        "foam_firmness": "moderate", "foam_layers": 5,
        "foam_types": ["open_cell", "closed_cell"],
        "has_hinge_protection": False, "durability": "high", "shell_denier": 840,
        "bottom_coating": "standard", "closure_system": "strap",
        "reconfigurable": True, "carry_comfort": "good",
        "shoulder_straps": True, "waist_belt": True, "chest_strap": True,
        "carry_handles": 6, "bandolier_strap": False, "gear_storage": "minimal",
        "shoe_wipe": False, "couch_mode": False,
        "price_uvp_eur": 379, "current_price_eur": 379,
        "recycled_materials": "full", "hic_certified": False, "bluesign": False,
        "image_url": "/images/crashpads/zigzag-triple-link.jpg",
        "pros": [
            "Three modular pads for maximum configuration flexibility",
            "1.7m² total coverage when linked in a row",
            "Fully recycled construction with 680kg+ connection strength",
            "Configurable for any landing zone shape"
        ],
        "cons": [
            "Narrow width when configured linearly",
            "Premium price for the full triple system",
            "Complex setup compared to a single traditional pad"
        ],
        "customer_voices": [
            "Three pads give you incredible versatility — line them up for traverses, cluster for highballs, or split with friends.",
            "The triple set is the sweet spot for the LINK system. Enough pads to cover most scenarios with room to configure.",
            "ZIGZAG's modular approach is the future of crashpads. The recycled materials make it even better."
        ]
    },
    # ── Mammut Sender Crashpad ──
    {
        "brand": "Mammut", "model": "Sender Crashpad", "slug": "mammut-sender-crashpad",
        "year_released": 2023, "pad_size_category": "medium", "fold_style": "hinge",
        "best_use": ["lowball", "midrange"],
        "approach_suitability": "moderate", "length_open_cm": 120, "width_open_cm": 100,
        "thickness_cm": 10, "weight_kg": 5.8, "impact_protection": "high",
        "foam_firmness": "moderate", "foam_layers": 2,
        "foam_types": ["open_cell", "closed_cell"],
        "has_hinge_protection": True, "durability": "high", "shell_denier": 600,
        "bottom_coating": "standard", "closure_system": "flap",
        "reconfigurable": False, "carry_comfort": "good",
        "shoulder_straps": True, "waist_belt": True, "chest_strap": False,
        "carry_handles": 2, "bandolier_strap": False, "gear_storage": "moderate",
        "shoe_wipe": True, "couch_mode": False,
        "price_uvp_eur": 259, "current_price_eur": 229,
        "recycled_materials": "partial", "hic_certified": False, "bluesign": True,
        "image_url": "/images/crashpads/mammut-sender-crashpad.jpg",
        "pros": [
            "Bluesign-certified materials for eco-conscious climbers",
            "Good all-around size and weight balance",
            "Integrated shoe wipe for clean rubber",
            "Mammut's trusted Swiss quality standards"
        ],
        "cons": [
            "600D shell less durable than higher-denier competitors",
            "Basic carry system without chest strap"
        ],
        "customer_voices": [
            "The Bluesign certification is a nice touch — good to see Mammut walking the sustainability talk.",
            "Swiss quality in a well-balanced package. Not the flashiest pad but reliable and well-made.",
            "The shoe wipe is a small feature that you end up using constantly. Appreciated addition."
        ]
    },
    # ── Kailas Inflatable Bouldering Pad ──
    {
        "brand": "Kailas", "model": "Inflatable Boulder Pad", "slug": "kailas-inflatable",
        "year_released": 2024, "pad_size_category": "medium", "fold_style": "inflatable",
        "best_use": ["lowball", "midrange"],
        "approach_suitability": "long", "length_open_cm": 120, "width_open_cm": 100,
        "thickness_cm": 10, "weight_kg": 2.5, "impact_protection": "moderate",
        "foam_firmness": "soft", "foam_layers": 1,
        "foam_types": ["air_chamber"],
        "has_hinge_protection": False, "durability": "moderate", "shell_denier": 420,
        "bottom_coating": "tpu_coated", "closure_system": "valve",
        "reconfigurable": False, "carry_comfort": "excellent",
        "shoulder_straps": True, "waist_belt": False, "chest_strap": False,
        "carry_handles": 2, "bandolier_strap": False, "gear_storage": "none",
        "shoe_wipe": False, "couch_mode": False,
        "price_uvp_eur": 269, "current_price_eur": 249,
        "recycled_materials": "none", "hic_certified": False, "bluesign": False,
        "image_url": "/images/crashpads/kailas-inflatable.jpg",
        "pros": [
            "Ultra-light at 2.5kg — packs down smaller than a sleeping bag",
            "Perfect for remote bouldering with long approaches",
            "Quick inflation with included pump",
            "Innovative alternative to traditional foam pads"
        ],
        "cons": [
            "Puncture risk from sharp rocks and rough terrain",
            "Less predictable impact absorption vs layered foam",
            "Requires inflation time before each session",
            "Not suitable for highball bouldering"
        ],
        "customer_voices": [
            "Game-changer for alpine bouldering where every gram counts. Hikes in like a sleeping pad, protects like a crashpad.",
            "The weight savings are dramatic but the protection trade-off is real. Best for moderate-height problems.",
            "An inflatable pad sounds gimmicky until you're three hours into an approach. Then it makes perfect sense."
        ]
    },
]


def run():
    with open(SEED, "r") as f:
        data = json.load(f)
    existing = {p["slug"] for p in data}
    added = 0
    for pad in NEW_PADS:
        if pad["slug"] not in existing:
            data.append(pad)
            added += 1
            print(f"  + {pad['brand']} {pad['model']}")
        else:
            print(f"  ~ {pad['brand']} {pad['model']} (already exists)")
    with open(SEED, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"\nAdded {added} new pads. Total: {len(data)}")


if __name__ == "__main__":
    run()
