# CLAUDE-README — Project-Specific Rules for AI Agents

This file contains rules discovered and validated during data work sessions.
These rules are NON-NEGOTIABLE and must always be followed.

---

## Rubber Thickness Rule (NON-NEGOTIABLE)

`rubber_thickness_mm` = **sole/outsole/front rubber thickness ONLY**.
- Use the "Rubber front" field from manufacturer specs
- NEVER use "Rubber rand" thickness as sole thickness
- If a model has no "Rubber front" data, leave `rubber_thickness_mm` as NULL
- Rand thickness is typically 1.5–2.0mm and is NOT the sole

## Rubber Hardness Rule (NON-NEGOTIABLE)

`rubber_hardness` = **sole rubber compound hardness ONLY**.
- Determined by the SOLE rubber compound, not rand or heel
- If sole compound is unknown, check the product page "Rubber" field (not just the spec table)
- The "Rubber" field on Red Chili product pages = sole rubber
- Store as JSON array, e.g. `["medium"]`

### Red Chili Rubber Compound → Hardness Mapping (softest → hardest)

| Compound | DB value | Shore | Notes |
|----------|----------|-------|-------|
| Vibram XS Grip | `soft` | ~45° | Stickiest, performance, high-end models |
| RX-1 ALLROUND | `medium` | 50° | Balanced friction/edge/durability |
| RX-2 TECHGRIP | `medium_hard` | ~55° | Edge stability, more rigid |
| RX-3 ENDURANCE | `hard` | ~60°+ | Max durability, rental/gym shoes |

## Closure Rule (NON-NEGOTIABLE)

Closure classification is based on **user experience**, not marketing names:
- **velcro**: If you can quickly open and close it (straps, VCR, speed-lace + velcro combos)
- **lace**: If you have to knot laces
- **slipper**: If there is no closure mechanism at all

Examples:
- "Slipper Single VCR" = **velcro** (has a VCR strap)
- "VCR / Technora Lace" = **velcro** (speed-lace secured by velcro, no knotting)
- "Lace / VCR" = **velcro** (fast-lace with velcro, no knotting)
- "Asymmetrical Lace" = **lace** (traditional lacing, must knot)
- "Double VCR" = **velcro**

## Downturn & Asymmetry Enums (4 levels each)

**`downturn`** — 4-value enum (low → high):
`flat` → `slight` → `moderate` → `aggressive`

**`asymmetry`** — 4-value enum (low → high):
`none` → `slight` → `moderate` → `strong`

## Vegan Determination (NON-NEGOTIABLE)

Must check ALL materials, not just upper:
- Upper, Lining, Footbed, Tongue — if ANY contain leather/suede → NOT vegan
- "Suede leather footbed" = NOT vegan (even if upper is synthetic)

## Weight Convention

- Manufacturer specs list **single shoe** weight
- Database stores **pair** weight (multiply by 2)
