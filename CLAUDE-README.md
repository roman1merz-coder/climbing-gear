# CLAUDE-README - Project-Specific Rules for AI Agents

This file contains rules discovered and validated during data work sessions.
These rules are NON-NEGOTIABLE and must always be followed.

---

## No Em Dashes (NON-NEGOTIABLE)

**Never use em dashes (—) anywhere in this project** - not in code, comments, copy, JSON, HTML, or any file.
- Always use a regular hyphen/dash (-) instead
- Users perceive em dashes as a telltale sign of AI-generated text
- This applies to all user-facing text, code comments, commit messages, and data

---

## Graphics Rule (NON-NEGOTIABLE)

**NEVER attempt to programmatically draw, trace, or generate images/overlays.**
- Do NOT use edge detection, thresholding, or any image-processing trick to "trace" outlines from photos
- Do NOT generate PNGs from pixel data or try to create silhouettes from reference images
- If a graphic asset (SVG, PNG, overlay) already exists, use it as-is - transform it with CSS (rotate, scale, translate) instead of recreating it
- If a new graphic is genuinely needed, ask Roman to provide it

---

## Analytics (PostHog)

| Field | Value |
|-------|-------|
| Service | PostHog (EU cloud) |
| Dashboard | https://eu.posthog.com/project/135032/ |
| API Key | `phc_OkrxqJzUXVGEdKKvbuAMZ5jdZ2R9Vp9GItLNYW9UIWe` |
| Host | `https://eu.i.posthog.com` |
| Config file | `src/posthog.js` |

**How it works:**
- Base analytics (pageviews, autocapture, custom events) runs in **cookieless/memory mode** - no GDPR consent needed
- Session replays are **opt-in** via the cookie consent banner (analytics category)
- Disabled in dev mode (`import.meta.env.DEV`), respects Do Not Track
- SPA pageviews tracked via `PostHogPageView` component in `main.jsx` (fires on every route change)
- Affiliate link clicks auto-tracked via global click listener (AWIN URLs)

**Custom events tracked:**
- `$pageview` - on every route change (SPA-aware)
- `affiliate_click` - when user clicks an AWIN affiliate link (properties: retailer, product_slug, destination_url, page_path)
- `outbound_click` - when user clicks any external link (properties: url, page_path)
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
| RX-1 ALLROUND | `soft` | 50° | Balanced friction/edge/durability - soft in industry context |
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

**`downturn`** - 4-value enum (low → high):
`flat` → `slight` → `moderate` → `aggressive`

**`asymmetry`** - 4-value enum (low → high):
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
- The site displays pair weight everywhere - never single shoe weight
- Manufacturers often list single-shoe weight in specs - ALWAYS multiply by 2 before storing
- Any adult (non-kids) shoe under ~300g pair weight is suspicious and must be verified
- When sourcing weight from retailer pages, check whether they state "per shoe" or "per pair"


## Foot Scanner

The foot scanner lives at `climbing-gear.com/scanner-test.html` (static HTML, not part of the React SPA).

### Flow
1. User takes 2 photos: **sole** and **side** (no other views)
2. Photos upload to Supabase Storage bucket `foot-scans` under `scans/{scanId}-sole.jpg` and `scans/{scanId}-side.jpg`
3. User fills in shoe fit questionnaire: sex, street shoe size (EU), climbing shoes (brand, model, EU size, fit ratings for toes/forefoot/heel)
4. User optionally enters email, then hits Done
5. Shoe fit data saves to `foot_scan_fits` table

### Supabase Tables
- **`foot_scan_fits`** -- one row per completed scan session
  - `scan_id` (text) -- matches the photo filenames, e.g. `scan-2026-03-05T13-35-21`
  - `sex` (text) -- male/female
  - `street_size_eu` (numeric) -- EU street shoe size
  - `shoes` (jsonb) -- array of `{ brand, model, size_eu, fit: { toes, forefoot, heel } }`
  - `email` (text) -- optional user email
  - `created_at` (timestamptz)
- **`foot_scans`** -- legacy table from old 3-photo analyze-foot API (no longer populated, kept for reference)

### Storage
- Bucket: `foot-scans` (public)
- Path: `scans/{scanId}-sole.jpg`, `scans/{scanId}-side.jpg`
- Instruction images also in `scans/instruction-sole.jpg`, `scans/instruction-side.jpg`

### Admin
- `climbing-gear.com/scan-admin.html` -- dashboard showing all scans with photos, shoe data, and emails. Auto-refreshes every 30s.

### Static HTML Pages
These pages are excluded from the Vercel SPA rewrite in `vercel.json`: `scanner-test.html`, `scan-admin.html`, `shoe-fit-v2.html`. The scanner uses the **service-role key** (embedded in the HTML) for both storage uploads and table inserts.
