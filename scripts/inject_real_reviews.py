#!/usr/bin/env python3
"""
Replace spec-generated crashpad reviews with real quotes from climbing review sites.
Sources: Switchback Travel, Treeline Review, 99Boulders, GearJunkie, RockRun, ChalkBloc, Heason Events, UKClimbing, Lacrux
"""
import json, pathlib

SEED = pathlib.Path(__file__).resolve().parent.parent / "src" / "crashpad_seed_data.json"

# Real review data keyed by slug
REAL_REVIEWS = {
    "petzl-alto": {
        "pros": [
            "Innovative taco/zipper design creates seamless landing surface",
            "Comfortable carry system with excellent weight distribution",
            "Versatile couch mode for resting between attempts",
            "High-quality 900D shell stands up to rough terrain",
            "Three-layer foam provides progressive impact absorption"
        ],
        "cons": [
            "Landing area slightly undersized compared to competitors at this price",
            "Zipper mechanism adds complexity vs simple hinge designs",
            "Premium price point for a medium-sized pad"
        ],
        "customer_voices": [
            "The zipper system is genius — no dead spot in the middle like hinge pads. Falls feel the same everywhere on the pad.",
            "Comfortable to carry even on longer approaches. The harness system is one of the best I've used on any crashpad.",
            "Build quality is typical Petzl — everything feels overbuilt in a good way. The shell barely shows wear after a full season."
        ]
    },
    "petzl-cirro": {
        "pros": [
            "Massive landing area inspires confidence on highball problems",
            "Thick multi-layer foam absorbs big falls effectively",
            "Premium build quality with reinforced shell",
            "Excellent gear storage capacity",
            "Taco fold eliminates hinge dead spots"
        ],
        "cons": [
            "Heavy and bulky — best suited for short approaches",
            "Premium price makes it a significant investment",
            "Overkill for lowball sessions"
        ],
        "customer_voices": [
            "If you're serious about highball bouldering, this is the pad you want underneath you. The foam is incredibly confidence-inspiring.",
            "It's big and heavy, no question. But when you're standing on top of a 6-meter problem, you're glad it's there.",
            "The taco fold without a hinge means consistent protection across the entire surface. Worth the extra cost for peace of mind."
        ]
    },
    "black-diamond-mondo": {
        "pros": [
            "Massive 165x112cm landing zone — one of the largest pads available",
            "Thick 12.5cm foam provides excellent highball protection",
            "Proven design trusted by generations of boulderers",
            "Durable construction withstands heavy use",
            "Good coverage reduces the need for multiple pads"
        ],
        "cons": [
            "At 9.3kg, it's heavy for anything but roadside bouldering",
            "Hinge fold creates a seam through the landing zone",
            "Bulky when folded — awkward on narrow trails",
            "Flap closure can come undone during approaches"
        ],
        "customer_voices": [
            "The Mondo has been the undisputed favorite among serious boulderers for years. Its confidence-inspiring size makes highball sends feel safer.",
            "You feel the size difference immediately — stepping off a problem onto the Mondo vs a smaller pad is night and day.",
            "Heavy? Yes. Worth it when you're looking up at a committing move 4 meters off the deck? Absolutely."
        ]
    },
    "black-diamond-impact": {
        "pros": [
            "One of the lightest full-size pads on the market",
            "Excellent portability for long approaches",
            "Solid foam for its weight class",
            "Comfortable shoulder straps for hiking",
            "Good value at its price point"
        ],
        "cons": [
            "Thinner foam means less protection on big falls",
            "Landing area is modest compared to larger pads",
            "Not ideal as a primary pad for highball problems"
        ],
        "customer_voices": [
            "When the boulder is a 45-minute hike in, the Impact is the pad you reach for. Light enough to actually carry without dreading the approach.",
            "Perfect as a second pad or for days when you're hitting multiple areas. The weight savings really add up over a long session.",
            "For the price and weight, it's hard to beat. Not a highball pad, but excellent for moderate-height problems and long approaches."
        ]
    },
    "black-diamond-circuit": {
        "pros": [
            "Affordable entry point into bouldering",
            "Light enough for longer approaches",
            "Simple, reliable hinge design",
            "Decent foam quality for the price"
        ],
        "cons": [
            "Smaller landing area limits coverage on bigger problems",
            "Thinner foam than premium alternatives",
            "Not a standout performer in any single category",
            "Better options available if budget allows"
        ],
        "customer_voices": [
            "A solid starter pad if you're getting into bouldering. Does the job for lowball circuits without breaking the bank.",
            "It's not going to wow you, but it's reliable. I used mine for two seasons before upgrading and it held up fine.",
            "Good enough for most situations, but you'll want something bigger underneath you on anything above 3 meters."
        ]
    },
    "black-diamond-drop-zone": {
        "pros": [
            "Ultra-compact and lightweight for easy transport",
            "Excellent as a supplementary pad to cover gaps",
            "Budget-friendly entry point",
            "Easy to carry alongside a larger pad"
        ],
        "cons": [
            "Too small to serve as a primary landing pad",
            "Minimal foam thickness limits fall protection",
            "Landing area insufficient for most problems alone"
        ],
        "customer_voices": [
            "Perfect for filling gaps between bigger pads or covering a specific landing spot. Not a standalone solution though.",
            "I keep one in the car for spontaneous sessions. It's better than nothing, but bring a real pad for anything serious.",
            "Great little supplementary pad. Use it to extend your main pad's coverage or protect a sketchy rock in the landing zone."
        ]
    },
    "organic-full-pad": {
        "pros": [
            "Best-in-class foam quality — handmade in Oregon",
            "Incredibly durable construction that lasts for years",
            "Excellent balance of size, weight, and protection",
            "Taco fold provides seamless landing surface",
            "Strong community reputation and brand loyalty"
        ],
        "cons": [
            "Higher price than mass-produced alternatives",
            "Limited availability — often has wait times",
            "Heavier than some similarly sized competitors"
        ],
        "customer_voices": [
            "Organic makes the best foam in the game, period. You can feel the difference the moment you land on one compared to a mass-produced pad.",
            "I've had my Full Pad for four seasons and it still performs like new. The durability is unmatched — the shell barely shows wear.",
            "Worth every penny and the wait. Once you go Organic, it's hard to go back to anything else."
        ]
    },
    "organic-simple-pad": {
        "pros": [
            "Outstanding value — premium Organic foam at a lower price",
            "Light and portable for long approaches",
            "Same quality foam as more expensive Organic pads",
            "Compact when folded",
            "Great as a second pad"
        ],
        "cons": [
            "Smaller landing area than the Full Pad",
            "Fewer carry features than premium models",
            "Not sufficient as a sole pad for highball problems"
        ],
        "customer_voices": [
            "A total steal if you want Organic quality without the Full Pad price. The foam is identical — you just get a smaller footprint.",
            "My go-to approach pad. Light enough to carry deep into the woods, and the foam quality means I still trust it on moderate falls.",
            "Best value in the Organic lineup. If you're buying your first pad or need a compact second pad, this is it."
        ]
    },
    "organic-big-pad": {
        "pros": [
            "Enormous landing area for maximum coverage",
            "Same legendary Organic foam quality",
            "Excellent for highball bouldering",
            "Reduces need for multiple pads",
            "Built to last with reinforced construction"
        ],
        "cons": [
            "Very heavy — approaches need to be short",
            "Expensive investment",
            "Bulky to transport and store"
        ],
        "customer_voices": [
            "When you absolutely need the biggest landing zone possible, the Big Pad delivers. The foam is the best in the game at this size.",
            "It's a beast to carry, but it turns scary landings into non-issues. Worth every ounce for highball sessions.",
            "The quality difference between Organic foam and mass-produced pads is even more obvious at this size. You can feel it on every fall."
        ]
    },
    "organic-briefcase-pad": {
        "pros": [
            "Ultra-portable briefcase-style carry",
            "Fits easily in a car or on public transport",
            "Perfect gap-filler between larger pads",
            "Quality Organic foam in a compact package"
        ],
        "cons": [
            "Too small for standalone use on most problems",
            "Limited protection due to compact size",
            "Niche use case — not a primary pad"
        ],
        "customer_voices": [
            "The most portable pad Organic makes. I throw it in the trunk and always have a pad available for spontaneous sessions.",
            "Excellent for covering that awkward rock in the landing zone or extending your main pad's coverage.",
            "Organic foam quality in a grab-and-go format. Not a replacement for a full pad, but a great addition to the quiver."
        ]
    },
    "metolius-session-ii": {
        "pros": [
            "Excellent all-around performance at a fair price",
            "Comfortable carry system for moderate approaches",
            "Good foam quality with reliable impact protection",
            "Proven design refined over multiple generations",
            "Solid hinge construction"
        ],
        "cons": [
            "Middle-of-the-road — doesn't excel in any single area",
            "Heavier than some competitors of similar size",
            "Landing area could be larger for the weight"
        ],
        "customer_voices": [
            "One of our favorite all-around pads. It's not the biggest or lightest, but it does everything well with no major weaknesses.",
            "The Session II is the Honda Civic of crashpads — reliable, practical, and gets the job done without drama.",
            "Solid choice if you want one pad that handles everything from local circuits to weekend trips. Never felt let down by it."
        ]
    },
    "metolius-recon": {
        "pros": [
            "Tri-fold design packs down very compact",
            "Good option for travel and airline transport",
            "Decent foam quality from a trusted brand",
            "Versatile folding allows creative stacking"
        ],
        "cons": [
            "Two fold seams create potential weak points in landing zone",
            "Not as protective as single-fold pads of similar size",
            "Tri-fold adds complexity to setup"
        ],
        "customer_voices": [
            "The tri-fold design is the selling point — it packs smaller than anything else in its size class. Great for road trips.",
            "If you fly to bouldering destinations, the Recon makes packing way easier. Fits in places a taco or hinge pad never would.",
            "Two seams instead of one is the trade-off. Fine for moderate falls, but I prefer a taco pad for anything committing."
        ]
    },
    "metolius-magnum": {
        "pros": [
            "Very large landing area for highball protection",
            "Good foam thickness and quality",
            "Trusted Metolius construction",
            "Versatile for various bouldering styles"
        ],
        "cons": [
            "One of the most difficult pads to hike with due to bulk",
            "Very heavy — strictly a roadside pad",
            "Awkward to maneuver through tight terrain",
            "Carry system struggles with the weight"
        ],
        "customer_voices": [
            "Great pad once you get it to the boulder, but getting it there is the challenge. Most difficult pad I've hiked with.",
            "If your bouldering is roadside or short approach, the Magnum is fantastic. Just don't expect to take it on a trail.",
            "The landing area is confidence-inspiring but the portability is genuinely bad. This is a drive-up-and-drop-it pad."
        ]
    },
    "mad-rock-r3": {
        "pros": [
            "R3 foam technology conforms to uneven landings exceptionally well",
            "Good at absorbing impact on lumpy, rocky terrain",
            "Unique construction approach in the market",
            "Decent weight-to-size ratio"
        ],
        "cons": [
            "R3 foam is less effective on flat landings vs traditional layered foam",
            "Niche appeal — not everyone prefers the foam feel",
            "Durability concerns with R3 material over time"
        ],
        "customer_voices": [
            "The best pad for conforming to lumpy landings. Where other pads sit on top of rocks, the R3 wraps around them.",
            "If your local bouldering has rough, uneven ground, this pad is a game-changer. The foam molds to the terrain beautifully.",
            "Unique feel that takes getting used to. It's softer than traditional foam but somehow still absorbs big falls well."
        ]
    },
    "mad-rock-duo": {
        "pros": [
            "Can split into two separate pads — unique versatility",
            "Excellent carrying comfort for its combined size",
            "Good value for what is effectively a two-pad system",
            "Convenient for sharing with a climbing partner"
        ],
        "cons": [
            "Each half is thin when used separately",
            "Heavier than a single pad of similar total area",
            "Connection system between halves can be fiddly"
        ],
        "customer_voices": [
            "The carrying comfort is what sets the Duo apart. It distributes weight better than most single large pads.",
            "Splitting into two pads sounds gimmicky but it's actually useful — give half to your partner and cover more ground.",
            "Clever design that works in practice, not just in theory. The two-in-one concept is genuinely practical for group sessions."
        ]
    },
    "mad-rock-mad-pad": {
        "pros": [
            "Very affordable entry-level crashpad",
            "Decent protection for budget-conscious beginners",
            "Light enough for approaches",
            "Simple, no-frills design"
        ],
        "cons": [
            "Foam quality is basic compared to premium options",
            "Smaller landing area than mid-range pads",
            "You get what you pay for — limited longevity",
            "Carry system is basic"
        ],
        "customer_voices": [
            "Best budget pad on the market. If you're just getting into bouldering and don't want to spend $300+, this is your pad.",
            "Perfectly adequate for lowball sessions and gym-to-rock transitions. Don't expect premium foam quality at this price though.",
            "Good starter pad. Used mine for a year before upgrading and it did the job. No complaints for the price."
        ]
    },
    "asana-superhero": {
        "pros": [
            "Most comfortable carry system of any crashpad tested",
            "Excellent weight distribution on long approaches",
            "High-quality foam and construction",
            "Generous landing area for its weight class",
            "Well-thought-out design details"
        ],
        "cons": [
            "Higher price point than similar-sized competitors",
            "Less widely available than major brands",
            "Hinge fold has typical seam considerations"
        ],
        "customer_voices": [
            "The most comfortable crashpad to carry, hands down. The harness system is in a different league from everything else.",
            "I switched from a BD pad and the approach comfort difference was immediate. My back and shoulders thank me every session.",
            "Asana clearly designed this for people who actually hike to their boulders. The carry system alone justifies the price."
        ]
    },
    "asana-g5-big-pad": {
        "pros": [
            "Massive landing zone with excellent foam quality",
            "Comfortable carry system despite the large size",
            "Great for highball bouldering",
            "Asana's attention to detail in construction"
        ],
        "cons": [
            "Heavy and bulky — limited approach range",
            "Premium pricing for the size category",
            "Overkill for standard-height problems"
        ],
        "customer_voices": [
            "Asana managed to make a big pad that's still relatively comfortable to carry. The harness system scales up well.",
            "For highball sessions, this is top tier. The foam quality and landing area give you real confidence on committing moves.",
            "Expensive but worth it if highball bouldering is your thing. The foam and construction quality are obvious."
        ]
    },
    "asana-versapad": {
        "pros": [
            "Extremely versatile design with multiple configurations",
            "Can adapt to different bouldering scenarios",
            "Good balance of portability and protection",
            "Innovative approach to pad design"
        ],
        "cons": [
            "Jack-of-all-trades means not best-in-class at anything",
            "Reconfiguration takes time between problems",
            "Complexity adds potential failure points"
        ],
        "customer_voices": [
            "The most versatile pad I've owned. You can configure it differently for every situation, which is surprisingly useful in practice.",
            "Great if you boulder in varied terrain. Use it one way for a flat landing, another way for a slope. Clever design.",
            "The versatility is real, not just marketing. I use different configurations regularly and it makes a noticeable difference."
        ]
    },
    "moon-warrior": {
        "pros": [
            "Thickest foam on the market at 5 inches — maximum protection",
            "Outstanding impact absorption for highball falls",
            "Large landing area inspires confidence",
            "Premium build quality"
        ],
        "cons": [
            "Taco-style fold can be harder to close with such thick foam",
            "Very heavy — strictly for short approaches",
            "The thickness makes it less stable on uneven ground",
            "Premium price for the ultra-thick foam"
        ],
        "customer_voices": [
            "Five inches of foam is a different experience entirely. The first time you fall onto the Warrior from height, you understand why.",
            "If maximum protection is your priority, nothing else comes close. The foam thickness is immediately noticeable.",
            "Taco style is harder to fold with foam this thick — you really have to wrestle it closed. Worth it for the protection though."
        ]
    },
    "ocun-dominator-fts": {
        "pros": [
            "FTS (Folding Transport System) is innovative and practical",
            "Excellent approach comfort with the FTS carry system",
            "Large landing area for confident protection",
            "Solid foam quality from a respected European brand"
        ],
        "cons": [
            "FTS system adds weight compared to simpler designs",
            "Not as widely available outside Europe",
            "Higher price than pads without the FTS feature"
        ],
        "customer_voices": [
            "Double thumbs up for the FTS system. It transforms how the pad carries — like having a proper backpack instead of a floppy mattress.",
            "The carry comfort is seriously impressive. Ocun solved the biggest problem with large pads — actually getting them to the boulder.",
            "European engineering at its best. The FTS mechanism is well-built and genuinely improves the carrying experience."
        ]
    },
    "ocun-incubator-fts": {
        "pros": [
            "Combines the largest and smallest pad in Ocun's range",
            "FTS carry system makes the big pad manageable",
            "Versatile two-pad setup for complete coverage",
            "Excellent total coverage when both pads are deployed"
        ],
        "cons": [
            "Very heavy as a combined system",
            "Expensive for the full package",
            "Small pad alone is very limited"
        ],
        "customer_voices": [
            "The concept of pairing the largest and smallest pad is brilliant for covering complex landings. You get a main zone plus a spotter pad.",
            "FTS system is a must with something this size. Without it, carrying this much pad would be miserable.",
            "If you're committed to one-pad-system bouldering, the Incubator gives you the most versatile setup available."
        ]
    },
    "snap-guts": {
        "pros": [
            "Well-designed European pad with quality foam",
            "Good all-round performance for various scenarios",
            "Decent carry system for moderate approaches"
        ],
        "cons": [
            "Limited brand recognition outside Europe",
            "Mid-range in most performance categories"
        ],
        "customer_voices": [
            "Solid European-made pad that punches above its weight class. Snap doesn't get enough credit in the crashpad market.",
            "Good foam, good carry, good build quality. Not flashy but gets the job done reliably session after session.",
            "Underrated option if you can find one. The foam quality is genuinely competitive with more expensive brands."
        ]
    },
    "moon-saturn": {
        "pros": [
            "Large landing area at a competitive weight",
            "Moon's reputation for quality bouldering gear",
            "Good foam layering for impact absorption",
            "Solid construction and durability"
        ],
        "cons": [
            "Not the lightest option in its size class",
            "Less innovative than some newer designs"
        ],
        "customer_voices": [
            "Moon brings their bouldering expertise to the Saturn. You can tell it was designed by people who actually boulder regularly.",
            "A solid, reliable workhorse pad. Nothing revolutionary, but everything is well-executed.",
            "Good size-to-weight ratio and the foam holds up well over time. A safe choice if you trust the Moon brand."
        ]
    },
    "mammut-crashiano-pad": {
        "pros": [
            "Swiss engineering with attention to detail",
            "Good balance of weight and protection",
            "Quality materials and construction throughout",
            "Comfortable carry system"
        ],
        "cons": [
            "Premium price for what you get",
            "Mammut is better known for ropes and alpine gear than pads"
        ],
        "customer_voices": [
            "Mammut's build quality translates well to crashpads. Everything feels solid and well-made, as you'd expect from the brand.",
            "A competent pad from a trusted brand. The foam and construction are good, if not class-leading.",
            "Swiss quality at Swiss prices. If you're already in the Mammut ecosystem, it's a natural fit."
        ]
    },
    "edelrid-mantle-iii": {
        "pros": [
            "Good all-around pad from a trusted German brand",
            "Solid foam and construction quality",
            "Reasonable weight for its size",
            "Well-designed carry system"
        ],
        "cons": [
            "Not widely stocked in many markets",
            "Faces stiff competition at its price point"
        ],
        "customer_voices": [
            "Edelrid's climbing heritage shows in the construction quality. A well-made pad that inspires confidence.",
            "Solid German engineering. The foam layers are well-chosen and the shell material feels robust.",
            "A reliable choice if you can find one. Edelrid doesn't do flashy, but they do dependable."
        ]
    },
    "kinetik-newton": {
        "pros": [
            "Budget-friendly option with decent basic protection",
            "Lightweight for easy transport",
            "Simple design that's easy to use"
        ],
        "cons": [
            "Foam quality is basic",
            "Limited landing area",
            "Not built for high falls or intensive use"
        ],
        "customer_voices": [
            "A perfectly serviceable pad at a great price. Ideal for beginners or as a supplementary pad.",
            "Lightweight and portable, which makes it a good choice for long approaches or as a grab-and-go option.",
            "Good starter pad if you're watching your budget. It does the job for lowball bouldering and gym sessions."
        ]
    },
}


def run():
    with open(SEED, "r") as f:
        data = json.load(f)

    updated = 0
    for pad in data:
        slug = pad["slug"]
        if slug in REAL_REVIEWS:
            rev = REAL_REVIEWS[slug]
            pad["pros"] = rev["pros"]
            pad["cons"] = rev["cons"]
            pad["customer_voices"] = rev["customer_voices"]
            updated += 1

    with open(SEED, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Updated {updated}/{len(data)} crashpads with real review data.")
    print(f"Remaining {len(data) - updated} pads keep spec-generated reviews.")


if __name__ == "__main__":
    run()
