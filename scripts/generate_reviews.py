#!/usr/bin/env python3
"""
Generate customer_voices for ropes/belays/crashpads and pros/cons for crashpads.
Based on actual product specs — honest, direct, no marketing BS.
"""
import json, random, os

random.seed(42)  # reproducible

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load(name):
    with open(os.path.join(BASE, "src", name)) as f:
        return json.load(f)

def save(name, data):
    with open(os.path.join(BASE, "src", name), "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def pick(lst, n=3):
    """Pick n random items from list, or fewer if list is short."""
    return random.sample(lst, min(n, len(lst)))

# ═══════════════════════════════════════════════════════════════
# ROPE CUSTOMER VOICES
# ═══════════════════════════════════════════════════════════════

def rope_voices(r):
    voices = []
    d = r.get("diameter_mm", 9.8)
    w = r.get("weight_per_meter_g", 60)
    falls = r.get("uiaa_falls")
    impact = r.get("impact_force_kn")
    handling = r.get("handling_feel", "")
    durability = r.get("durability_rating", "")
    dry = r.get("dry_treatment", "none")
    rope_type = r.get("rope_type", "single")
    uses = r.get("best_use_cases", [])
    if isinstance(uses, str): uses = [uses]
    brand = r.get("brand", "")
    model = r.get("model", "")
    sheath_pct = r.get("sheath_percentage")
    dyn_elong = r.get("dynamic_elongation_pct")
    stat_elong = r.get("static_elongation_pct")
    lengths = r.get("available_lengths_m", [])
    is_static = rope_type == "static"

    # Voice pool — each is a function that returns a voice string or None
    pool = []

    # Diameter/weight impressions
    if d <= 8.5:
        pool.append(f"At {d}mm this thing is skinny. Clips beautifully and saves weight on long routes, but you feel every fall more than with a fatter cord.")
        pool.append(f"Used the {d}mm on multi-pitch all season. The weight savings over 60m are real — noticeably lighter in the pack.")
    elif d <= 9.2:
        pool.append(f"The {d}mm diameter is a nice sweet spot — light enough for long routes but doesn't feel sketchy on lead. {w}g/m is reasonable.")
        pool.append(f"Clipping at {d}mm feels great through quickdraws. Lighter than my old 9.8 and I haven't noticed any durability issues yet.")
    elif d <= 9.8:
        pool.append(f"Solid all-rounder at {d}mm. Not the lightest but handles well and inspires confidence. The {w}g/m is fine for single-pitch days.")
        pool.append(f"This {d}mm has been my go-to for sport climbing. Feeds smoothly through my GriGri and the handling is {handling.replace('_',' ') if handling else 'good'}.")
    else:
        pool.append(f"It's a tank at {d}mm — not for redpoint attempts, but for projecting and taking repeated falls this thing is bombproof.")
        pool.append(f"The {d}mm diameter means it'll outlast thinner ropes by a wide margin. Perfect workhorse if weight isn't your priority.")

    # Fall rating
    if falls and not is_static:
        if falls >= 10:
            pool.append(f"{falls} UIAA falls is impressive. Took some big whippers sport climbing and the rope still looks fresh after a full season.")
        elif falls >= 7:
            pool.append(f"{falls} UIAA falls is solid for this class. Not the highest rating out there but more than enough for most sport climbers.")
        elif falls >= 5:
            pool.append(f"Only {falls} UIAA falls — keep that in mind if you're a frequent faller. I reserve this one for onsight attempts and alpine days where weight matters more.")
        else:
            pool.append(f"{falls} UIAA falls is on the low side. Definitely an alpine/weight-saving rope, not a projecting cord.")

    # Impact force
    if impact and not is_static:
        if impact <= 7.5:
            pool.append(f"Impact force of {impact}kN means softer catches. My belayer noticed the difference — less jarring for both of us on longer falls.")
        elif impact >= 9.0:
            pool.append(f"Impact force at {impact}kN is on the higher side. Falls feel a bit sharper compared to softer ropes, something to be aware of.")

    # Handling
    if handling:
        h = handling.replace("_", " ")
        if "supple" in h or "soft" in h:
            pool.append(f"The {h} feel makes clipping and belaying effortless. One of the nicest-handling ropes I've used.")
        elif "stiff" in h:
            pool.append(f"Handling is on the {h} side out of the box. Loosened up after a few sessions but it's never going to be a butter rope.")

    # Dry treatment
    if dry and dry != "none":
        if "core_and_sheath" in dry:
            pool.append("Full dry treatment on core and sheath — used it in the rain and it barely gained weight. Worth the premium for alpine use.")
        elif "core" in dry:
            pool.append("Core-only dry treatment. Helps in damp conditions but the sheath still absorbs some water. Fine for sport, not ideal for ice.")
        elif "sheath" in dry:
            pool.append("Sheath-only dry treatment keeps it reasonably clean. Won't soak up mud and grit as fast as untreated ropes.")
    else:
        if not is_static:
            pool.append("No dry treatment, so keep it away from wet rock. For dry sport crags it's fine, and you save some money vs treated versions.")

    # Durability
    if durability:
        dur = durability.replace("_", " ")
        if "high" in dur or "excellent" in dur:
            pool.append(f"Durability has been {dur}. Still looking good after 6 months of regular use. The sheath holds up well to sharp edges.")
        elif "low" in dur:
            pool.append(f"Durability is {dur} — the sheath fuzzed up faster than expected. You're trading longevity for light weight here.")

    # Sheath percentage
    if sheath_pct:
        if sheath_pct >= 42:
            pool.append(f"{sheath_pct}% sheath proportion means this rope can take a beating. Great for gym and top-rope where abrasion is constant.")
        elif sheath_pct <= 33:
            pool.append(f"Only {sheath_pct}% sheath — keeps it light but it will show wear faster than thicker-sheathed ropes. Handle with care on sharp edges.")

    # Dynamic elongation
    if dyn_elong and not is_static:
        if dyn_elong >= 35:
            pool.append(f"Dynamic elongation at {dyn_elong}% — pretty stretchy. Soft catches but you'll want extra slack management on shorter routes.")
        elif dyn_elong <= 28:
            pool.append(f"Low dynamic elongation ({dyn_elong}%) means less rope stretch. Good for precision but catches feel a bit harder.")

    # Use cases
    if "alpine" in uses or "mountaineering" in uses:
        pool.append("Took this on a week in the Dolomites. Light enough for the approach, handles well enough for the climbing. Alpine workhorse.")
    if "sport" in uses and "trad" in uses:
        pool.append("Versatile enough for both sport and trad days. I only own one rope and this covers everything I need.")
    if "gym" in uses or "indoor" in uses:
        pool.append("Mainly use it indoors. Takes the abuse of gym climbing well — rough walls, frequent falls, constant friction from auto-belays.")
    if "ice" in uses or "mixed" in uses:
        pool.append("Used it for ice climbing all winter. The dry treatment kept it from freezing up even in wet conditions. Stiff when cold but manageable.")
    if "big_wall" in uses or "multi_pitch" in uses:
        pool.append("Multi-pitch tested over several long routes. Weight adds up but the handling and durability make it worth hauling.")
    if "top_rope" in uses:
        pool.append("Top-rope days destroy ropes fast. This one has held up better than expected — the sheath still looks decent after months of gym TR.")

    # Rope type specific
    if rope_type == "half":
        pool.append("As half ropes go, the handling is solid. Running two strands takes practice but the fall protection on wandering trad routes is worth it.")
        pool.append("Bought a pair for UK trad. The lighter weight per strand makes a real difference on long mountain routes.")
    elif rope_type == "twin":
        pool.append("Twin rope setup works great for alpine. Ultralight for the grade of protection, though you need proper twin technique.")
    elif rope_type == "static":
        pool.append(f"Solid static line for hauling and fixing. {r.get('breaking_strength_kn','Good breaking strength')}kN breaking strength gives plenty of margin." if r.get('breaking_strength_kn') else "Reliable static line. Does exactly what you need for hauling and rigging without any fuss.")
        pool.append("Used it for setting up top-ropes and some caving work. Minimal stretch keeps everything tight and predictable.")

    # Triple rated
    if r.get("triple_rated"):
        pool.append("Triple-rated is genuinely useful — I use it as single for sport, then switch to half-rope technique when the trad gets spicy. Maximum versatility.")

    # Eco
    if r.get("bluesign"):
        pool.append("Bluesign certified, which matters to me. Good to know the production process isn't trashing the environment.")
    if r.get("pfc_free"):
        pool.append("PFC-free dry treatment — performance is comparable to PFC versions and I feel better about the environmental impact.")

    # Select 3 varied voices
    random.shuffle(pool)
    return pool[:3] if len(pool) >= 3 else pool + [f"Solid {rope_type} rope from {brand}. The {model} does what it's supposed to without any surprises."][:3-len(pool)]


# ═══════════════════════════════════════════════════════════════
# BELAY DEVICE CUSTOMER VOICES
# ═══════════════════════════════════════════════════════════════

def belay_voices(d):
    voices = []
    dtype = d.get("device_type", "tube")
    weight = d.get("weight_g")
    rope_min = d.get("rope_diameter_min_mm")
    rope_max = d.get("rope_diameter_max_mm")
    rope_slots = d.get("rope_slots", 1)
    guide_mode = d.get("guide_mode", False)
    anti_panic = d.get("anti_panic", False)
    lead_switch = d.get("lead_top_switch", False)
    braking = d.get("braking_type", "")
    material = d.get("material", "")
    brand = d.get("brand", "")
    model = d.get("model", "")
    uses = d.get("best_use_cases", [])
    if isinstance(uses, str): uses = [uses]
    skills = d.get("skill_level", [])
    if isinstance(skills, str): skills = [skills]
    mech_adv = d.get("mechanical_advantage")
    rappel_double = d.get("rappel_double_strand", False)
    rappel_single = d.get("rappel_single_strand", False)

    pool = []

    # Device type impressions
    if dtype == "active_assisted":
        pool.append(f"The cam-assisted braking on the {model} gives real peace of mind. Locks up reliably on falls — exactly what you want belaying a projecting partner.")
        pool.append("Active braking means I can focus on my climber instead of death-gripping the brake strand. After switching from a tube, I'd never go back for sport.")
        if anti_panic:
            pool.append("The anti-panic function is a genuine safety feature, not just marketing. When I accidentally grabbed the handle too hard lowering, it locked instead of running. Smart design.")
        if lead_switch:
            pool.append("Lead/top-rope switch is convenient — just flip it and go. No more threading the rope differently for each mode.")
    elif dtype == "passive_assisted":
        pool.append(f"Passive assisted braking without a cam mechanism — lighter and simpler than active devices. The {model} still locks reliably but takes a bit more technique.")
        pool.append("It's not as automatic as a GriGri but it's lighter and works on double strands. Good middle ground between a tube and full cam device.")
    elif dtype == "tube_guide":
        pool.append(f"Guide mode is essential for multi-pitch. Being able to belay the second hands-free from the top is a game-changer. The {model} does it well.")
        pool.append("Tube with guide mode — the most versatile option out there. Works for everything from gym sessions to alpine multi-pitch.")
    else:  # tube
        pool.append(f"Simple tube, no bells and whistles. At {weight}g it's the lightest option for alpine where every gram counts." if weight and weight < 80 else f"Classic tube device. Nothing fancy but it works with every rope and every situation. The {model} is my backup for any trip.")
        pool.append("I keep a tube device as my backup and for teaching beginners. You learn proper brake hand technique, which makes you a better belayer overall.")

    # Weight
    if weight:
        if weight <= 60:
            pool.append(f"Only {weight}g — barely notice it on my harness. For alpine and multi-pitch where weight matters, this is a big plus.")
        elif weight >= 200:
            pool.append(f"At {weight}g it's not light, but the features justify the weight. Wouldn't take it on a big alpine route though.")
        else:
            pool.append(f"{weight}g is a reasonable weight. Not ultralight but not a brick either — right in the sweet spot for an everyday device.")

    # Rope compatibility
    if rope_min and rope_max:
        range_str = f"{rope_min}–{rope_max}mm"
        if rope_min <= 8.5:
            pool.append(f"Handles thin ropes down to {rope_min}mm, which is increasingly important as ropes get skinnier. Tested with my 8.9mm and it feeds smoothly.")
        if rope_max >= 11:
            pool.append(f"Works with ropes up to {rope_max}mm — good compatibility if you own ropes of different diameters.")
        pool.append(f"Rope range of {range_str} covers pretty much everything on the market. No compatibility worries.")

    # Rope slots
    if rope_slots == 2:
        pool.append("Two rope slots means I can belay on half ropes for trad. Also makes regular rappels on doubled rope straightforward.")
    elif rope_slots == 1 and dtype in ("active_assisted",):
        pool.append("Single rope only — the one real limitation. Can't use it with halves or for standard double-strand rappels. Carry a backup tube for that.")

    # Guide mode
    if guide_mode and dtype != "tube_guide":
        pool.append("The guide mode is a welcome addition. Belaying from above on multi-pitch without tying off to the anchor is so much cleaner.")

    # Rappel
    if rappel_double:
        pool.append("Double-strand rappel works fine. Smooth descent with good speed control — doesn't heat up the way some devices do.")
    if rappel_single and dtype == "active_assisted":
        pool.append("Single-strand rappel with the cam is a nice feature for long multi-pitch descents. Saves having to pull through double strand.")

    # Mechanical advantage
    if mech_adv:
        pool.append(f"{mech_adv} mechanical advantage for lowering — makes a real difference when lowering a heavier climber. Your forearms thank you after a full day of belaying.")

    # Use cases
    if "sport" in uses:
        pool.append("My go-to for sport climbing. Quick belay transitions at the crag, reliable catching, smooth lowering. Does exactly what I need.")
    if "trad" in uses or "multi_pitch" in uses:
        pool.append("Used this for a full trad season. Works great for everything from single pitch to long mountain routes.")
    if "gym" in uses or "indoor" in uses:
        pool.append("Indoor workhorse — I use it 3-4 times a week at the gym and it still works perfectly after a year of constant use.")
    if "ice" in uses:
        pool.append("Took it ice climbing. Works fine with icy ropes though the mechanism can be sluggish when things freeze up. Keep it warm inside your jacket.")
    if "top_rope" in uses:
        pool.append("Perfect for top-rope sessions. The assisted braking takes the strain out of long belaying stints when teaching beginners.")

    # Material
    if material:
        if "stainless" in material.lower():
            pool.append("Stainless steel construction — heavier but incredibly durable. This thing will outlast me.")
        if "aluminum" in material.lower() or "aluminium" in material.lower():
            pool.append("Aluminum body keeps it light. Some wear marks after a season but nothing structural — purely cosmetic.")

    # Eco
    if d.get("eco_design"):
        pool.append("Like that they're making an effort with eco-friendly design. The performance isn't compromised, so it's a win-win.")

    random.shuffle(pool)
    return pool[:3] if len(pool) >= 3 else pool + [f"Reliable device from {brand}. Does the job without drama."][:3-len(pool)]


# ═══════════════════════════════════════════════════════════════
# CRASHPAD PROS/CONS + CUSTOMER VOICES
# ═══════════════════════════════════════════════════════════════

def crashpad_pros(p):
    pros = []
    area = (p.get("length_open_cm", 100) * p.get("width_open_cm", 100)) / 10000
    thick = p.get("thickness_cm", 10)
    weight = p.get("weight_kg", 7)
    impact = p.get("impact_protection", "")
    foam_firmness = p.get("foam_firmness", "")
    foam_layers = p.get("foam_layers", 1)
    carry_comfort = p.get("carry_comfort", "")
    fold_style = p.get("fold_style", "")
    approach = p.get("approach_suitability", "")
    hinge_prot = p.get("has_hinge_protection", False)
    shoulder = p.get("shoulder_straps", False)
    waist = p.get("waist_belt", False)
    chest = p.get("chest_strap", False)
    shoe_wipe = p.get("shoe_wipe", False)
    couch_mode = p.get("couch_mode", False)
    closure = p.get("closure_system", "")
    shell_d = p.get("shell_denier", 0)
    bottom = p.get("bottom_coating", "")
    reconfig = p.get("reconfigurable", False)
    durability = p.get("durability", "")
    bluesign = p.get("bluesign", False)
    recycled = p.get("recycled_materials", "none")
    gear_storage = p.get("gear_storage", "")
    handles = p.get("carry_handles", 0)
    size_cat = p.get("pad_size_category", "")
    bandolier = p.get("bandolier_strap", False)

    # Landing area
    if area >= 1.5:
        pros.append(f"Massive {area:.1f}m² landing zone covers most boulder problem landings")
    elif area >= 1.1:
        pros.append(f"Generous {area:.1f}m² landing area — good coverage for most problems")
    elif area >= 0.8:
        pros.append(f"Decent {area:.1f}m² landing area for the size category")

    # Thickness
    if thick >= 12:
        pros.append(f"{thick}cm thick foam absorbs hard impacts from highball problems")
    elif thick >= 10:
        pros.append(f"Solid {thick}cm foam thickness provides reliable fall protection")

    # Weight-to-area ratio
    if area > 0 and weight / area < 5.5:
        pros.append(f"Efficient weight-to-area ratio ({weight}kg for {area:.1f}m²)")
    elif weight <= 5:
        pros.append(f"Light at {weight}kg — easy to carry on longer approaches")

    # Impact protection
    if impact in ("high", "very_high"):
        pros.append(f"{'Excellent' if impact == 'very_high' else 'High'} impact protection rating")

    # Foam
    if foam_layers >= 3:
        pros.append(f"{foam_layers}-layer foam system for progressive impact absorption")
    if foam_firmness in ("medium", "medium_firm"):
        pros.append("Well-balanced foam firmness — not too hard on low falls, not too soft on big ones")

    # Carry system
    if carry_comfort in ("good", "excellent"):
        pros.append(f"{'Excellent' if carry_comfort == 'excellent' else 'Good'} carry comfort for approaches")
    if waist and chest:
        pros.append("Full harness system (waist + chest straps) distributes weight well on long hikes")
    elif waist:
        pros.append("Waist belt helps stabilize the pad on longer approaches")

    # Features
    if hinge_prot:
        pros.append("Hinge protection prevents ground-strike through the fold")
    if shoe_wipe:
        pros.append("Built-in shoe wipe keeps rubber clean between attempts")
    if couch_mode:
        pros.append("Couch mode for comfortable resting between sessions")
    if reconfig:
        pros.append("Reconfigurable design — can be used in multiple configurations")
    if gear_storage and gear_storage not in ("none", "minimal"):
        pros.append("Useful gear storage for shoes, chalk, and accessories")

    # Construction
    if shell_d >= 1000:
        pros.append(f"{shell_d}D shell fabric is seriously tough — resists tears and abrasion")
    elif shell_d >= 600:
        pros.append(f"Durable {shell_d}D shell fabric holds up well to rough ground")

    # Fold style
    if fold_style == "taco":
        pros.append("Taco fold is simple and reliable — no hinge gap to worry about")
    elif fold_style == "hinge":
        pros.append("Hinge fold creates a flat, even landing surface when open")

    # Eco
    if bluesign:
        pros.append("Bluesign certified materials")
    if recycled and recycled not in ("none",):
        pros.append(f"Made with {recycled.replace('_', ' ')} recycled materials")

    return pros[:5]  # max 5 pros


def crashpad_cons(p):
    cons = []
    area = (p.get("length_open_cm", 100) * p.get("width_open_cm", 100)) / 10000
    thick = p.get("thickness_cm", 10)
    weight = p.get("weight_kg", 7)
    carry_comfort = p.get("carry_comfort", "")
    hinge_prot = p.get("has_hinge_protection", False)
    fold_style = p.get("fold_style", "")
    approach = p.get("approach_suitability", "")
    waist = p.get("waist_belt", False)
    chest = p.get("chest_strap", False)
    shoe_wipe = p.get("shoe_wipe", False)
    gear_storage = p.get("gear_storage", "")
    shell_d = p.get("shell_denier", 0)
    foam_layers = p.get("foam_layers", 1)
    durability = p.get("durability", "")
    impact = p.get("impact_protection", "")
    handles = p.get("carry_handles", 0)
    size_cat = p.get("pad_size_category", "")
    foam_firmness = p.get("foam_firmness", "")
    bandolier = p.get("bandolier_strap", False)

    # Weight
    if weight >= 9:
        cons.append(f"Heavy at {weight}kg — long approaches become a workout")
    elif weight >= 7 and area < 1.2:
        cons.append(f"{weight}kg is heavy for the landing area you get")

    # Thin foam
    if thick <= 8:
        cons.append(f"Only {thick}cm thick — limited protection on higher problems")

    # Small area
    if area < 0.7:
        cons.append(f"Small {area:.1f}m² landing area — best as a supplemental pad, not a primary")
    elif area < 0.9 and size_cat not in ("sit_start", "slider"):
        cons.append(f"Landing area of {area:.1f}m² can feel tight on problems with dynamic movement")

    # No hinge protection
    if not hinge_prot and fold_style in ("hinge", "tri_fold"):
        cons.append("No hinge protection — watch out for the fold gap on ground strikes")

    # Poor carry
    if carry_comfort == "basic":
        cons.append("Basic carry system — uncomfortable on approaches over 15 minutes")
    if not waist and not chest and weight >= 6:
        cons.append("No waist or chest straps — the pad bounces around on steep trails")

    # Approach
    if approach == "roadside":
        cons.append("Bulky and not great for longer approaches — best for roadside boulders")

    # Missing features
    if not shoe_wipe:
        cons.append("No shoe wipe — bring a towel")
    if gear_storage in ("none", "minimal", ""):
        cons.append("Minimal gear storage — you'll need a separate bag for shoes and chalk")

    # Durability
    if durability in ("low", "moderate") and shell_d < 500:
        cons.append(f"{'Low' if durability == 'low' else 'Moderate'} durability — the shell may not survive rough terrain long-term")

    # Impact
    if impact in ("low", "moderate"):
        cons.append(f"{'Limited' if impact == 'low' else 'Moderate'} impact protection — not recommended for highball problems")

    # Foam
    if foam_firmness == "soft":
        cons.append("Soft foam can bottom out on hard falls from height")
    elif foam_firmness == "firm":
        cons.append("Firm foam is harder on low-height falls — less forgiving on ankles")

    # Foam layers
    if foam_layers <= 1:
        cons.append("Single foam layer provides less progressive absorption than multi-layer designs")

    return cons[:4]  # max 4 cons


def crashpad_voices(p):
    voices = []
    area = (p.get("length_open_cm", 100) * p.get("width_open_cm", 100)) / 10000
    thick = p.get("thickness_cm", 10)
    weight = p.get("weight_kg", 7)
    brand = p.get("brand", "")
    model = p.get("model", "")
    carry_comfort = p.get("carry_comfort", "")
    fold_style = p.get("fold_style", "")
    impact = p.get("impact_protection", "")
    size_cat = p.get("pad_size_category", "")
    uses = p.get("best_use", [])
    if isinstance(uses, str): uses = [uses]
    hinge_prot = p.get("has_hinge_protection", False)
    shoe_wipe = p.get("shoe_wipe", False)
    couch_mode = p.get("couch_mode", False)
    foam_layers = p.get("foam_layers", 1)

    pool = []

    # Size impressions
    if size_cat == "oversized" or area >= 1.5:
        pool.append(f"This thing is massive — {area:.1f}m² means I rarely miss the pad even on dynamic topouts. Worth every centimeter if you boulder alone.")
        pool.append(f"The {model} covers so much ground that I feel safe on problems where I'd normally stack two pads. Absolute confidence booster for highballs.")
    elif size_cat == "large" or area >= 1.1:
        pool.append(f"Great size for a primary pad. {area:.1f}m² covers most landings and the {thick}cm foam handles falls well up to about 4 meters.")
        pool.append(f"Big enough to be your main pad, portable enough to actually carry. The {brand} got the size right with this one.")
    elif size_cat == "medium":
        pool.append(f"Good medium pad — {area:.1f}m² is enough for most sport problems. Pair it with a friend's pad for anything higher.")
        pool.append(f"Sweet spot size for the solo boulderer who doesn't want to carry a monster pad. Does the job on 90% of problems.")
    elif size_cat in ("small", "slider", "sit_start"):
        pool.append(f"Compact at {area:.1f}m² — obviously not a standalone pad for big problems, but perfect for filling gaps or covering sit starts.")
        pool.append(f"Lightweight supplemental pad. I throw it in on top of my main pad for tricky landings or bring it for easy traverses.")

    # Weight
    if weight <= 4:
        pool.append(f"At {weight}kg I barely notice it on the approach. Game-changer for remote bouldering spots.")
    elif weight >= 9:
        pool.append(f"{weight}kg is a lot to haul up a trail. The protection is worth it but my shoulders disagree on the walk in.")
    else:
        pool.append(f"{weight}kg — totally manageable weight for the size. Done 30-minute approaches without issues.")

    # Carry
    if carry_comfort == "excellent":
        pool.append("Best carry system I've used on a crashpad. Stays put on steep trails, straps don't dig in. Actually comfortable.")
    elif carry_comfort == "good":
        pool.append("Carry system is solid — nothing to complain about. Straps are comfortable enough for 20-minute approaches.")
    elif carry_comfort == "basic":
        pool.append("The carry system is basic — gets the job done for short walks but I wouldn't want to hike far with it.")

    # Foam/impact
    if impact in ("high", "very_high"):
        pool.append(f"Took some nasty falls on this and it absorbed everything. The {foam_layers}-layer foam really works — {'never felt the ground' if impact == 'very_high' else 'feels safe even from height'}.")
    elif impact == "moderate":
        pool.append(f"Impact absorption is decent for its thickness. Fine for moderate-height problems but I wouldn't trust it alone on anything over 3.5m.")
    if foam_layers >= 3:
        pool.append(f"{foam_layers} foam layers give it that progressive feel — soft on small falls, firms up when you really need it.")

    # Fold
    if fold_style == "taco":
        pool.append("Taco fold means no dead spot in the middle. Simple design that just works.")
    elif fold_style == "hinge":
        if hinge_prot:
            pool.append("Hinge fold with protection — lies perfectly flat and the hinge gap is well covered. No worries about landing on the fold.")
        else:
            pool.append("Hinge fold lies flat which is nice, but watch out for the fold line on ground-level landings. I put my slider pad over it.")
    elif fold_style == "tri_fold":
        pool.append("Tri-fold packs down smaller than other designs. Slightly annoying seams when open but worth it for the packability.")

    # Features
    if shoe_wipe:
        pool.append("The shoe wipe is such a small feature but I use it constantly. Saves bringing a separate towel.")
    if couch_mode:
        pool.append("Couch mode is genuinely useful — set it up between burns and sit comfortably instead of squatting on rocks.")

    # Use cases
    if "highball" in uses:
        pool.append("Bought it specifically for highball sessions. The extra padding and coverage give me the confidence to commit up high.")
    if "travel" in uses:
        pool.append("Great travel pad — packs down small enough to check on a flight or fit in a rental car without drama.")
    if "approach" in uses or "remote" in uses:
        pool.append("Designed for long approaches and it shows — the carry system is better than most and the weight is reasonable for the size.")

    # Durability
    dur = p.get("durability", "")
    if dur in ("high", "excellent"):
        pool.append("Built like a tank. Used it all season on sharp granite and the shell barely shows any wear.")
    elif dur == "low":
        pool.append("The fabric picked up some damage faster than I'd like. Not the most durable shell, especially on rough terrain.")

    random.shuffle(pool)
    return pool[:3] if len(pool) >= 3 else pool + [f"Does the job. The {model} from {brand} is a solid pad for the money."][:3-len(pool)]


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    # --- Ropes ---
    ropes = load("rope_seed_data.json")
    updated_r = 0
    for r in ropes:
        if not r.get("customer_voices"):
            r["customer_voices"] = rope_voices(r)
            updated_r += 1
    save("rope_seed_data.json", ropes)
    print(f"Ropes: {updated_r}/{len(ropes)} updated with customer_voices")

    # --- Belays ---
    belays = load("belay_seed_data.json")
    updated_b = 0
    for b in belays:
        if not b.get("customer_voices"):
            b["customer_voices"] = belay_voices(b)
            updated_b += 1
    save("belay_seed_data.json", belays)
    print(f"Belays: {updated_b}/{len(belays)} updated with customer_voices")

    # --- Crashpads ---
    pads = load("crashpad_seed_data.json")
    updated_p = 0
    for p in pads:
        if not p.get("pros"):
            p["pros"] = crashpad_pros(p)
        if not p.get("cons"):
            p["cons"] = crashpad_cons(p)
        if not p.get("customer_voices"):
            p["customer_voices"] = crashpad_voices(p)
            updated_p += 1
    save("crashpad_seed_data.json", pads)
    print(f"Crashpads: {updated_p}/{len(pads)} updated with pros/cons/customer_voices")

    print("Done!")
