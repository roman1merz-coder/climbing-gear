# Code Patterns & Conventions

## Design System (tokens.js)

Earth-toned palette:
- Background: parchment `#f5f0e8`
- Accent green: forest `#3d7a52`
- Accent orange: warm `#c98a42`
- Text: dark earth tones

Typography:
- Body: DM Sans
- Headings: Playfair Display
- Code: JetBrains Mono

Border radius: 14px (cards), 10px (medium), 6px (small).

Brand colors defined per manufacturer (Scarpa red, La Sportiva gold, Unparallel blue, etc.).

## Data Sync Workflow (NON-NEGOTIABLE)

1. Edit data in Supabase via REST API (service_role key)
2. Regenerate seed JSON: fetch all rows, strip `id`/`created_at`/`updated_at` + generated columns, sort by slug
3. Write to `src/*_seed_data.json`
4. Commit + push

Never edit seed JSON files directly. The `regenerate_seeds.sh` script automates step 2.

## Supabase REST API Pattern

```js
// Read (anon key OK)
const data = await supabaseFetch('/rest/v1/shoes?select=*');

// Write (service_role key required)
curl -X PATCH "https://wsjsuhvpgupalwgcjatp.supabase.co/rest/v1/shoes?slug=eq.some-slug" \
  -H "apikey: SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}'
```

Internal columns (`admin_flags`, `data_confidence`) are stripped from public queries in main.jsx.

## Component Pattern

Each gear category follows the same structure:
- **{Category}App.jsx** - List view with filters, sorting, grid/list toggle
- **{Category}Detail.jsx** - Detail page with specs, pricing, scatter chart
- **{Category}ScatterChart.jsx** - Interactive scatter plot

All list components receive their data as props from main.jsx root. No direct Supabase calls from child components.

## Performance Scoring (utils/comfort.js)

8 metrics computed from shoe specs, each using weighted sub-factors with percentile normalization:
1. Stiffness - midsole (55%) + rubber hardness (20%) + thickness (15%) + rand (10%)
2. Smearing - conformability (72%) + shape (8%) + effective thickness (20%)
3. Edging - shape (45%) x rigidity (55%) with hard rubber bonus (12%)
4. Pockets - asymmetry (30%) + downturn (20%) + toe patch (25%) + closure (15%) + stiffness (10%)
5. Hooks - heel rubber (35%) + toe patch (35%) + flex (18%) + closure (12%)
6. Sensitivity - thin rubber (20%) + flexibility (48%) + soft rubber (10%) + midsole (12%) + weight (10%)
7. Crack/Crag - stiffness (25%) + flat profile (25%) + toe patch (15%) + ankle (10%) + heel rubber (10%) + lace (10%) + thickness (5%)
8. Support - stiffness (25%) + hard rubber (20%) + thickness (20%) + midsole (20%) + lace (15%)

Comfort label: Excellent (0.75+), Good (0.55+), Moderate (0.35+), Performance-focused (<0.35).

Manual edging overrides exist for specific shoes (e.g., la-sportiva-ondra-comp +0.15). Kids shoes excluded from percentile ranking.

## Best-Match Sort Algorithm (sorting.jsx)

Weighted score from: prices available (30pts) + discount % (20pts) + has image (5pts) + has reviews (5pts) + specs completeness (5pts) + has description (5pts) + recency (15pts) + retailer count (15pts).

## SEO / Prerendering

Every route is prerendered at build time (`scripts/prerender.mjs`). The build:
- Renders each route's visible HTML
- Injects JSON-LD structured data (Product, ItemList, WebSite schemas)
- Fetches live shoe prices from Supabase and injects AggregateOffer into Product JSON-LD (so Google/AI engines see prices without running JS)
- Embeds meta tags (title, description, OG, Twitter card, canonical)
- React hydrates over SSR content on load
- If Supabase is unreachable at build time, the build continues without price data (graceful fallback)

Schema builders live in `useStructuredData.js` (client-side, with live price data) and `prerender.mjs` (build-time, with Supabase snapshot). The client-side schemas replace the prerendered ones on hydration.

**Price data in JSON-LD:** All product pages include AggregateOffer with per-retailer Offer entries fetched from their respective `*_prices` tables at build time (filter: `product_slug IS NOT NULL`, `in_stock=true`, `match_confidence=1`). All five categories are fetched in parallel. Products without matched prices simply get no offers in the schema.

## Analytics (PostHog)

Cookieless/memory mode by default - no GDPR consent needed for base tracking. Session replays are opt-in via cookie consent banner.

Custom events:
- `$pageview` - on every route change (SPA-aware)
- `affiliate_click` - AWIN affiliate link clicks
- `outbound_click` - any external link click

PostHog proxied through `/ingest` path (ad-blocker resilient). Disabled in dev mode.

## Affiliate Links (AWIN)

`utils/affiliate.js` wraps retailer URLs through AWIN. Currently configured for Bergfreunde. Global click listener in `posthog.js` auto-tracks affiliate clicks.

## Price Crawling

44 retailer-specific crawlers in `crawlers/` directory. Each crawler:
- Extracts product URLs and metadata from retailer sites
- Scrapes prices (EUR) with size/variant info
- Normalizes brand/model/sizing
- Posts data to Supabase via REST API

Vercel cron job runs daily at 4 AM UTC: `/api/fetch-prices?limit=50`.

## Image Conventions

- All product images: static JPEGs at `public/images/{category}/{slug}.jpg`
- Never use external/third-party image URLs
- `assignLocalImages()` in main.jsx handles fallback chain: DB image_url -> slug-derived path -> SVG fallback
- Never programmatically generate/trace/draw images

## Insights & Articles

Charts in Insights pages must derive data from seed JSON programmatically - never hardcode fabricated data arrays. Always add a comment referencing source file and date.

## Writing Style

- Never use em dashes anywhere (code, comments, copy, JSON, HTML). Use regular hyphens.
- Commit messages: one descriptive sentence on what changed and why
