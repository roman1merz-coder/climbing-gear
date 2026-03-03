# CLAUDE-README — Project-Specific Rules for AI Agents

This file contains rules discovered and validated during data work sessions.
These rules are NON-NEGOTIABLE and must always be followed.

---

## Analytics (PostHog)

| Field | Value |
|-------|-------|
| Service | PostHog (US cloud) |
| Dashboard | https://us.posthog.com/project/sTMFPsFhdP1Ssg |
| API Key | `phc_OkrxqJzUXVGEdKKvbuAMZ5jdZ2R9Vp9GItLNYW9UIWe` |
| Host | `https://us.i.posthog.com` |
| Config file | `src/posthog.js` |

**How it works:**
- Base analytics (pageviews, autocapture, custom events) runs in **cookieless/memory mode** — no GDPR consent needed
- Session replays are **opt-in** via the cookie consent banner (analytics category)
- Disabled in dev mode (`import.meta.env.DEV`), respects Do Not Track
- SPA pageviews tracked via `PostHogPageView` component in `main.jsx` (fires on every route change)
- Affiliate link clicks auto-tracked via global click listener (AWIN URLs)

**Custom events tracked:**
- `$pageview` — on every route change (SPA-aware)
- `affiliate_click` — when user clicks an AWIN affiliate link (properties: retailer, product_slug, destination_url, page_path)
- `outbound_click` — when user clicks any external link (properties: url, page_path)
- Autocapture covers all other clicks, form submits, etc.

**Adding new custom events:**
```js
import { trackEvent } from "./posthog.js";
trackEvent("event_name", { key: "value" });
```

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
| RX-1 ALLROUND | `soft` | 50° | Balanced friction/edge/durability — soft in industry context |
| RX-2 TECHGRIP | `medium` | ~55° | Edge stability, more rigid |
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

`vegan` does **NOT** depend only on upper material. ALL components matter:
- Upper, Lining, Footbed, Tongue, Glues, Insole, Rand materials
- If ANY component contains leather/suede/animal-derived material → NOT vegan
- "Suede leather footbed" = NOT vegan (even if upper is synthetic)
- A synthetic/microfiber upper alone does NOT make a shoe vegan
- Only mark `vegan = true` if manufacturer explicitly markets it as vegan or ALL components confirmed animal-free
- When in doubt, leave `vegan = false`

## Shoe Weight Rule (NON-NEGOTIABLE)

`weight_g` in the `shoes` table is **ALWAYS pair weight** (both shoes combined).
- The site displays pair weight everywhere — never single shoe weight
- Manufacturers often list single-shoe weight in specs — ALWAYS multiply by 2 before storing
- Any adult (non-kids) shoe under ~300g pair weight is suspicious and must be verified
- When sourcing weight from retailer pages, check whether they state "per shoe" or "per pair"
