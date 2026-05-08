#!/usr/bin/env python3
"""
SANDBOX - V2 combinations top-5 explorer.

NOT WIRED INTO PRODUCTION. Generates every (discipline, environment, rock,
aggressiveness) combination and prints the top 5 shoes scored against the
proposed v2 lookup tables (discipline+env+rock-driven stiffness, agg-driven
downturn/asymmetry, discipline-driven closure, conditional ankle weight).

Use to sanity-check the lookup tables before committing them to the live
interp engines / matrix scorer.

Run:
    python3 scanner/explore_v2/combinations_top5.py

Output:
    stdout = formatted table (one combination per line, top 5 shoes appended)
    scanner/explore_v2/results.txt = same content for easy review
"""

import os
import sys
import json
import requests
from itertools import product
from pathlib import Path

# ── Supabase (read-only) ──────────────────────────────────────────────
SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SB_KEY = os.environ.get(
    "SUPABASE_SERVICE_KEY",
    "MUST_BE_SET_VIA_ENV")
HEADERS = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}

# ══════════════════════════════════════════════════════════════════════
# PROPOSED LOOKUP TABLES (the values being validated)
# ══════════════════════════════════════════════════════════════════════

# Discipline -> stiffness (center, lo, hi) on 0..1 scale
DISCIPLINE_STIFF = {
    "boulder":         (0.30, 0.15, 0.45),
    "sport":           (0.50, 0.35, 0.65),
    "trad_multipitch": (0.72, 0.55, 0.90),
}

# Environment -> stiffness shift added to center
ENV_SHIFT = {
    "indoor":  -0.05,
    "outdoor": +0.05,
    "both":     0.00,
}

# Per-(discipline, env) overrides. Falls back to ENV_SHIFT when missing.
# sport-indoor wants softer baseline (~0.40) than the global indoor shift gives.
ENV_SHIFT_BY_DISC = {
    ("sport", "indoor"): -0.10,
}

# Rock type -> stiffness shift (only when env != indoor)
ROCK_SHIFT = {
    "granite":   +0.10,
    "limestone":  0.0,
    "sandstone": -0.05,
    "mixed":      0.0,
    None:         0.0,
}

# Aggressiveness -> (downturn, asymmetry) targets
AGGRESSIVENESS = {
    "comfort":    ("flat",       "none"),
    "balanced":   ("slight",     "slight"),
    "moderate":   ("moderate",   "moderate"),
    "aggressive": ("aggressive", "strong"),
}

# (discipline, env) -> (preferred, acceptable, penalised) closure types
# env key "*" is a fallback when no env-specific entry exists.
CLOSURE_PREFS = {
    ("boulder", "*"):         (["slipper", "velcro"], ["lace"],    []),
    ("sport",   "indoor"):    (["velcro",  "lace"],   ["slipper"], []),
    ("sport",   "*"):         (["velcro",  "lace"],   [],          ["slipper"]),
    ("trad_multipitch", "*"): (["lace"],              ["velcro"],  ["slipper"]),
}


def closure_prefs_for(discipline, env):
    """Lookup env-specific closure prefs with "*" fallback."""
    return CLOSURE_PREFS.get((discipline, env)) \
        or CLOSURE_PREFS.get((discipline, "*"))

# Discipline -> use_cases aliases for the hard filter
DISCIPLINE_USE_CASES = {
    "boulder":         ["boulder", "bouldering"],
    "sport":           ["sport", "sport_climbing"],
    "trad_multipitch": ["trad", "trad_multipitch", "multipitch", "multi_pitch", "crack"],
}

# Rock type -> aliases used in shoes.best_rock_types
ROCK_ALIASES = {
    "granite":   ["granite", "gneiss", "basalt"],
    "limestone": ["limestone", "tufa"],
    "sandstone": ["sandstone", "slate"],
}

DOWNTURN_ORDER = ["flat", "slight", "moderate", "aggressive"]
ASYM_ORDER     = ["none", "slight", "moderate", "strong"]


def needs_ankle_protection(discipline, rock):
    """Per Roman: trad/multipitch always; granite + sport OR trad. NOT for boulder."""
    if discipline == "trad_multipitch":
        return True
    if rock == "granite" and discipline in ("sport", "trad_multipitch"):
        return True
    return False


def compute_target(discipline, env, rock, aggressiveness):
    center, lo, hi = DISCIPLINE_STIFF[discipline]
    env_s  = ENV_SHIFT_BY_DISC.get((discipline, env),
                                   ENV_SHIFT.get(env, 0.0))
    rock_s = ROCK_SHIFT.get(rock, 0.0) if env != "indoor" else 0.0

    target_stiff = max(0.0, min(1.0, center + env_s + rock_s))
    # Widen window by 0.05 per active modifier
    pad = 0.0
    if env_s  != 0: pad += 0.05
    if rock_s != 0: pad += 0.05
    target_lo = max(0.0, lo + env_s + rock_s - pad)
    target_hi = min(1.0, hi + env_s + rock_s + pad)

    dt, asym = AGGRESSIVENESS[aggressiveness]
    pref_cl, ok_cl, bad_cl = closure_prefs_for(discipline, env)

    return {
        "stiff_target":   target_stiff,
        "stiff_lo":       target_lo,
        "stiff_hi":       target_hi,
        "downturn":       dt,
        "asymmetry":      asym,
        "closure_pref":   pref_cl,
        "closure_ok":     ok_cl,
        "closure_bad":    bad_cl,
        "ankle_required": needs_ankle_protection(discipline, rock),
        "rock":           rock,
    }


# ══════════════════════════════════════════════════════════════════════
# SCORER (synthetic - no foot scan, no fit feedback)
# ══════════════════════════════════════════════════════════════════════

def _as_list(v):
    if isinstance(v, list): return v
    if isinstance(v, str):
        try: return json.loads(v)
        except: return []
    return []


def score_shoe(shoe, target, discipline):
    """Score one shoe against a use-case target. Returns score or None if filtered out."""
    score = 0

    # Hard filter: kids
    if shoe.get("kids_friendly"):
        return None

    # Hard filter: discipline use_cases must overlap
    use_cases = [u.lower().replace("-", "_") for u in _as_list(shoe.get("use_cases"))]
    aliases = [a.lower().replace("-", "_") for a in DISCIPLINE_USE_CASES[discipline]]
    if not any(a == uc or a in uc or uc in a for a in aliases for uc in use_cases):
        return None

    # 1. Stiffness vs target window
    cs = shoe.get("computed_stiffness")
    if cs is None:
        score -= 5
    else:
        center = target["stiff_target"]
        if target["stiff_lo"] <= cs <= target["stiff_hi"]:
            dist = abs(cs - center)
            # 20 at center, decays linearly to ~12 at window edge (~0.20 wide)
            score += int(round(20 - 40 * dist))
        else:
            edge_dist = min(abs(cs - target["stiff_lo"]),
                            abs(cs - target["stiff_hi"]))
            score -= int(round(20 + 60 * edge_dist))

    # 2. Downturn vs target
    shoe_dt = (shoe.get("downturn") or "").lower()
    if shoe_dt in DOWNTURN_ORDER:
        d = abs(DOWNTURN_ORDER.index(target["downturn"]) - DOWNTURN_ORDER.index(shoe_dt))
        score += {0: 15, 1: 8, 2: -5, 3: -15}[d]

    # 3. Asymmetry vs target
    shoe_as = (shoe.get("asymmetry") or "").lower()
    if shoe_as in ASYM_ORDER:
        d = abs(ASYM_ORDER.index(target["asymmetry"]) - ASYM_ORDER.index(shoe_as))
        score += {0: 10, 1: 5, 2: -3, 3: -10}[d]

    # 4. Closure preference  (10 / 0 / -10)
    shoe_cl = (shoe.get("closure") or "").lower()
    if shoe_cl in target["closure_pref"]:
        score += 10
    elif shoe_cl in target["closure_ok"]:
        score += 0
    elif shoe_cl in target["closure_bad"]:
        score -= 10

    # 5. Ankle protection (only when discipline+rock combo demands it)
    if target["ankle_required"]:
        ap = (shoe.get("ankle_protection") or "").strip().lower()
        if ap and ap not in ("none", "no", "minimal", "low"):
            score += 8

    # 6. Rock type bonus (only outdoor/both with specific rock)
    if target["rock"] and target["rock"] != "mixed":
        best_rock = [r.lower() for r in _as_list(shoe.get("best_rock_types"))]
        aliases = ROCK_ALIASES.get(target["rock"], [])
        if any(a == r or a in r or r in a for a in aliases for r in best_rock):
            score += 8

    return score


# ══════════════════════════════════════════════════════════════════════
# DRIVER
# ══════════════════════════════════════════════════════════════════════

def load_shoes():
    resp = requests.get(
        f"{SB_URL}/rest/v1/shoes",
        headers=HEADERS,
        params={
            "select": ("slug,brand,model,closure,downturn,asymmetry,"
                       "computed_stiffness,use_cases,best_rock_types,"
                       "kids_friendly,ankle_protection"),
            "limit": 1000,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def main():
    print("# Loading shoes from Supabase...", file=sys.stderr)
    shoes = load_shoes()
    print(f"# {len(shoes)} shoes loaded\n", file=sys.stderr)

    disciplines     = ["boulder", "sport", "trad_multipitch"]
    envs            = ["indoor", "outdoor", "both"]
    rocks_outdoor   = ["granite", "limestone", "sandstone", "mixed"]
    aggressivenesses = ["comfort", "balanced", "moderate", "aggressive"]

    combos = []
    for disc, env, agg in product(disciplines, envs, aggressivenesses):
        if env == "indoor":
            combos.append((disc, env, None, agg))
        else:
            for rock in rocks_outdoor:
                combos.append((disc, env, rock, agg))

    out_lines = []
    out_lines.append(
        "# V2 combination explorer - sandbox sanity check\n"
        f"# {len(shoes)} shoes scored across {len(combos)} combinations\n"
        "# Format: <disc> | <env> | <rock> | <agg> || target_stiff[lo-hi] dt/asym closure {ankle?} :: top5 shoes (score)\n"
    )

    last_disc = None
    for disc, env, rock, agg in combos:
        if disc != last_disc:
            out_lines.append(f"\n### {disc.upper()} ###")
            last_disc = disc

        t = compute_target(disc, env, rock, agg)

        scored = []
        for s in shoes:
            sc = score_shoe(s, t, disc)
            if sc is not None:
                scored.append((sc, s))
        scored.sort(key=lambda x: -x[0])
        # Enforce: max 2 shoes per brand in the top 5
        top5 = []
        brand_count = {}
        for sc, s in scored:
            b = (s.get("brand") or "").strip()
            if brand_count.get(b, 0) >= 2:
                continue
            top5.append((sc, s))
            brand_count[b] = brand_count.get(b, 0) + 1
            if len(top5) == 5:
                break

        rock_label = rock or "-"
        ankle_tag = "+ankle" if t["ankle_required"] else ""
        target_str = (
            f"stiff={t['stiff_target']:.2f}[{t['stiff_lo']:.2f}-{t['stiff_hi']:.2f}] "
            f"dt={t['downturn']:<10} asym={t['asymmetry']:<8} "
            f"closure={'/'.join(t['closure_pref']):<14} {ankle_tag}"
        )

        if top5:
            top5_str = ", ".join(
                f"{s['brand']} {s['model']} ({sc})" for sc, s in top5
            )
        else:
            top5_str = "(no shoes match discipline filter)"

        line = (
            f"{disc:<16} | {env:<7} | {rock_label:<10} | {agg:<10} || "
            f"{target_str} :: {top5_str}"
        )
        out_lines.append(line)

    output = "\n".join(out_lines)
    print(output)

    # Also save to file alongside the script
    out_path = Path(__file__).parent / "results.txt"
    out_path.write_text(output + "\n")
    print(f"\n# Saved to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
