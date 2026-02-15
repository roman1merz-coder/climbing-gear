# 🧗 climbing-gear.com

AI-powered climbing gear comparison engine — shoes, ropes, belay devices, and crashpads.

## Local Development

```bash
npm install
npm run dev
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import the GitHub repo
4. Vercel auto-detects Vite — just click **Deploy**
5. Done! Your site is live.

## Architecture

- **Frontend:** React 18 + Vite 6 (static SPA), React Router 7
- **Backend:** Supabase (Postgres + RPC functions)
- **Scoring:** Client-side JS mirrors the `search_shoes` SQL RPC
- **Deployment:** Vercel (auto-deploys from `main` on push)
- **Data:** Seed JSON files are the primary data source (see below)

---

## ⚠️ Data Source Strategy (IMPORTANT — Read Before Making Changes)

### The Problem This Solves

The app has two data layers — **seed JSON files** bundled with the frontend and a **Supabase database** used for live queries. In the past, confusion between these caused bugs: Supabase held only a subset of the data (e.g. 28 ropes), while the seed files contained the full dataset (141 ropes). Hardcoded chart data in components diverged from both.

### Golden Rule

> **The seed JSON files in `src/` are the single source of truth for product data.**
> Supabase is a supplementary layer for live pricing and dynamic queries.
> Any hardcoded data arrays in components (charts, articles) MUST be derived from seed data, never fabricated.

### Data Flow

```
src/*_seed_data.json          ← CANONICAL source of truth (checked into git)
        │
        ├──► main.jsx imports at build time (Vite bundles JSON natively)
        │       │
        │       ├──► mergeDataset(supabaseRows, seedArr, seedMap)
        │       │       • Supabase rows win for non-null fields
        │       │       • Seed-only items are kept as extras
        │       │       • Result: FULL dataset (seed ∪ supabase)
        │       │
        │       └──► Passed to all page components via props
        │
        └──► Supabase (partial mirror — may lag behind seed files)
                • Only a subset may be inserted at any time
                • Used primarily for: live prices, user queries, RPC scoring
                • NEVER assume Supabase has the full dataset
```

### Seed Files (Source of Truth)

| File | Contents | Count |
|------|----------|-------|
| `src/seed_data.json` | Climbing shoes | ~335 |
| `src/rope_seed_data.json` | Ropes (single, half, twin, static) | 156 (106 single, 28 half, 3 twin, 19 static) |
| `src/belay_seed_data.json` | Belay devices | ~49 |
| `src/crashpad_seed_data.json` | Crashpads | 112 (23 brands, verified against manufacturer sites) |

### Rules for Developers and AI Agents

1. **When querying product counts:** Read from the seed JSON files, NOT from Supabase `select count(*)`. Supabase may have fewer rows.

2. **When building charts or articles:** Parse the seed JSON to compute real statistics. Never hardcode fabricated data arrays — always derive from the actual seed data programmatically or verify by cross-referencing the seed file.

3. **When adding new products:** Add to the seed JSON file FIRST, then optionally upsert into Supabase. The seed file is the git-tracked, versioned, canonical copy.

4. **When checking data integrity:** Compare `seed_data.json` counts against Supabase counts. If they differ, the seed file is correct.

5. **Rope-specific notes:**
   - UIAA fall tests use different weights: **80kg for single ropes**, **55kg for half/twin ropes**
   - Never mix rope types when computing UIAA fall averages or comparisons
   - Filter by `rope_type === "single"` for any single-rope analysis
   - The `triple_rated` field indicates ropes certified for single + half + twin use

6. **When updating Insights.jsx or GearNews.jsx chart data:** Always verify against the seed files. Add a comment referencing the seed file and the date the data was derived:
   ```js
   // Derived from rope_seed_data.json (141 ropes, 106 singles) — 2025-02-13
   const ROPE_DIAMETER = [ ... ];
   ```

### Similar Products Logic

Each detail page shows "Similar" or "You May Also Like" products at the bottom. The matching logic varies by product type:

| Product | Logic | Max shown |
|---------|-------|-----------|
| **Shoes** | Same `skill_level` (any overlap) OR same `downturn` | 4 |
| **Ropes** | Same `rope_type` AND overlapping `best_use_cases` | 3 |
| **Belay devices** | Same `device_type` | 3 |
| **Crashpads** | Same `pad_size_category` OR overlapping `best_use` | 3 |

No scoring or ranking is applied — the first N matches from the dataset are shown. The current product is always excluded.

### Amazon Search Links

Every product detail page includes an Amazon.de search link (with affiliate tag `climbinggear0e-21`). The search query includes the product type for better results:
- Shoes: `climbing shoe {brand} {model}`
- Ropes: `climbing rope {brand} {model}`
- Belays: `belay device {brand} {model}`
- Crashpads: `crash pad {brand} {model}`

When no real retailer price data exists (only Amazon search), the "in stock" status is hidden to avoid misleading users.

### Crashpad Subjective Score Algorithms

The 8 subjective scores for crashpads are calculated algorithmically from objective specs:

| Score | Algorithm basis | Possible values |
|-------|----------------|-----------------|
| `pad_size_category` | Area (L×W) thresholds + thickness | sit_start, small, medium, large, oversized, slider |
| `impact_protection` | Weighted: thickness 60% + foam layers 20% + area 20% | low, moderate, high, very_high |
| `carry_comfort` | Carry features (straps/belt) minus weight penalty; inflatables & light pads (≤3kg) → excellent | basic, good, excellent |
| `durability` | Shell denier + bottom coating composite | moderate, high |
| `foam_firmness` | Foam type composition (closed=firm, open=soft, mixed by layers) | soft, moderate, firm |
| `gear_storage` | Fold style + area + carry system; thin pads & inflatables → none | none, minimal, moderate, generous |
| `approach_suitability` | Weight class × carry system quality matrix | roadside, moderate, long |
| `best_use` | Thickness × area thresholds; drop lowball if ≥12cm+≥1.5m² | lowball, midrange, highball, traverse |

Full algorithm documentation with formulas and justifications is in `crashpad_verification.xlsx` → "Algorithm Documentation" sheet.

### React Key Strategy

The card grid uses `slug` as the React key (not `id`) to ensure stable reconciliation when data transitions from seed → Supabase-merged. Using `id` caused orphaned DOM nodes because Supabase IDs differ from seed IDs. The grid container also has a `key={grid-${shoes.length}}` to force a clean remount on data transitions.

StrictMode was removed because React 18's concurrent rendering combined with data-loading state transitions caused orphaned DOM elements that weren't properly cleaned up.

### Supabase

The app connects to Supabase using the anon key (public, read-only).
Supabase contains a partial mirror of the seed data plus live pricing data.
**Do not treat Supabase row counts as authoritative for total product counts.**
