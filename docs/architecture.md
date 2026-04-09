# Architecture

## Tech Stack

React 18 + Vite 6 frontend, Supabase backend (Postgres DB + Storage + Auth), Vercel hosting (auto-deploy from `main`), PostHog analytics (cookieless), AWIN affiliate links, Sentry error monitoring.

## Product Categories

Five gear types, each following the same pattern: list app, detail page, scatter chart, seed JSON, price table.

| Category | List Component | Detail Component | Chart | Seed File | Price Table |
|----------|---------------|-----------------|-------|-----------|-------------|
| Shoes | App.jsx | ShoeDetail.jsx | ShoeScatterChart.jsx | seed_data.json + shoes_seed_data.json | shoe_prices |
| Ropes | RopeApp.jsx | RopeDetail.jsx | RopeScatterChart.jsx | rope_seed_data.json + ropes_seed_data.json | rope_prices |
| Belays | BelayApp.jsx | BelayDetail.jsx | BelayScatterChart.jsx | belay_seed_data.json | belay_prices |
| Crashpads | CrashpadApp.jsx | CrashpadDetail.jsx | CrashpadScatterChart.jsx | crashpad_seed_data.json + crashpads_seed_data.json | crashpad_prices |
| Quickdraws | QuickdrawApp.jsx | QuickdrawDetail.jsx | QuickdrawScatterChart.jsx | quickdraw_seed_data.json | quickdraw_prices |

## Routing (main.jsx)

| Route | Component | Notes |
|-------|-----------|-------|
| `/` | Landing | Marketing homepage with featured gear |
| `/shoes` | App | Shoe list with filters/sorting |
| `/shoe/:slug` | ShoeDetail | Individual shoe detail |
| `/ropes` | RopeApp | Rope list |
| `/rope/:slug` | RopeDetail | Rope detail |
| `/belays` | BelayApp | Belay device list |
| `/belay/:slug` | BelayDetail | Belay detail |
| `/crashpads` | CrashpadApp | Crashpad list |
| `/crashpad/:slug` | CrashpadDetail | Crashpad detail |
| `/quickdraws` | QuickdrawApp | Hidden from nav |
| `/quickdraw/:slug` | QuickdrawDetail | Quickdraw detail |
| `/compare` | Compare | Multi-shoe comparison |
| `/compare-ropes` | CompareGeneric | Multi-rope comparison |
| `/compare-belays` | CompareGeneric | Multi-belay comparison |
| `/compare-pads` | CompareGeneric | Multi-crashpad comparison |
| `/compare-quickdraws` | CompareGeneric | Multi-quickdraw comparison |
| `/find` | ShoeFinder | Shoe finder wizard |
| `/scan/:scanId` | ScanResult | Foot scanner results |
| `/wishlist` | Wishlist | Saved items |
| `/insights` | Insights | Educational content hub |
| `/insights/shoes` | InsightShoes | Shoe market analysis |
| `/insights/crashpads` | InsightCrashpads | Crashpad analysis |
| `/insights/ropes` | InsightRopes | Rope analysis |
| `/insights/scanner` | InsightScanner | Scanner explainer |
| `/news` | GearNews | Gear news |
| `/methodology` | Methodology | How data is compiled |
| `/about` | About | Company info |
| `/legal`, `/privacy`, `/impressum` | Legal | Legal pages |

## Data Flow

```
Supabase DB (source of truth)
    |
    v
main.jsx fetches via supabaseFetch() on mount
    |
    v
mergeWithSeed() -- Supabase wins for non-null fields, seed fills gaps
    |
    v
normalizeShoeFields() -- maps legacy columns (volume->forefoot_volume, heel->heel_volume)
    |
    v
assignLocalImages() -- DB image_url -> /images/{category}/{slug}.jpg -> SVG fallback
    |
    v
Root state: shoes, ropes, belays, crashpads, quickdraws, priceData, reviewData
    |
    v
Props drilling to child components
```

Live prices fetched in parallel from 5 price tables (shoe_prices, rope_prices, etc.). Max 1000 rows per request with pagination. Legacy `prices` table used as fallback for older data.

## State Management

No Redux or Zustand. Root component owns all data, passes via props. Three context providers wrap routes:

- **CompareProvider** (CompareContext.jsx) - max 10 items per type, persists in component state
- **WishlistProvider** (WishlistContext.jsx) - localStorage-backed, `cg_wishlist` key
- **PriceAlertProvider** (PriceAlertContext.jsx) - localStorage-backed price alerts

## Build Process

```
npm run build
  1. prebuild: node scripts/generate_seed.mjs  (fetch from Supabase -> seed JSONs)
  2. vite build                                  (bundle React app)
  3. node scripts/optimize-hero.mjs              (Sharp image optimization)
  4. node scripts/generate-sitemap.js            (sitemap.xml)
  5. node scripts/prerender.mjs                  (SSR HTML for every route - SEO)
```

Prerendering injects visible HTML + JSON-LD structured data into each route's `index.html`. React hydrates over it on load.

## Vercel Config (vercel.json)

Key rewrites:
- `/scan` -> `/scan.html` (static scanner page, not SPA)
- `/ingest/*` -> PostHog proxy (ad-blocker resilient)
- All SPA routes -> `/index.html`
- Cron: `/api/fetch-prices?limit=50` daily at 4 AM UTC

Security headers: X-Frame-Options DENY, HSTS, nosniff, Referrer-Policy. Scanner routes allow camera in Permissions-Policy.

## Dependencies

Core: react, react-dom, react-router-dom, framer-motion, posthog-js, @sentry/react, @vercel/analytics, sharp (build only), pg (build only).

Dev: vite, @vitejs/plugin-react.

## Static Pages (not SPA)

These live in `public/` and are excluded from the Vite SPA rewrite:
- `scan.html` - foot scanner upload UI
- `scan-admin.html` - admin dashboard for scans
- `shoe-fit-v2.html` - shoe fit questionnaire
- `content-editor.html` - content editing tool
- `suggestion-admin.html` - suggestion management

## Custom Hooks

| Hook | File | Purpose |
|------|------|---------|
| useIsMobile | useIsMobile.js | matchMedia responsive breakpoint (default 768px) |
| usePageMeta | usePageMeta.js | Sets document.title, meta, OG tags, canonical per route |
| usePriceAlerts | usePriceAlerts.js | localStorage price alert CRUD |
| useWishlist | useWishlist.js | localStorage wishlist toggle/has/clear |
| useStructuredData | useStructuredData.js | Injects/removes JSON-LD in head per route |

## Key Shared Modules

| File | Purpose |
|------|---------|
| tokens.js | Design system: colors, fonts, spacing, brand palette, global CSS |
| supabase.js | REST API wrapper with anon key auth |
| posthog.js | Analytics init, pageview tracking, affiliate click tracking, session replay |
| sorting.jsx | Sort logic (8 options for shoes, 7 for generics), best-match scoring algorithm |
| ChartShared.jsx | Reusable chart components for scatter plots |
| utils/affiliate.js | AWIN URL wrapping (Bergfreunde configured) |
| utils/format.js | Text formatting: fmt(), cap(), ensureArray() |
| utils/comfort.js | 8 performance metrics with percentile normalization (stiffness, smearing, edging, pockets, hooks, sensitivity, crack/crag, support) |
| utils/stretch.js | Stretch expectation utilities |
