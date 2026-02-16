# climbing-gear.com — Soft Launch Checklist

> Created: Feb 16, 2026 | Status: **All items complete — ready for soft launch**

## Must Fix (Legal / Security) — ALL DONE

- [x] **Self-host Google Fonts** — Downloaded DM Sans, DM Mono, Instrument Sans, JetBrains Mono as woff2 to `/public/fonts/`. No more Google CDN GDPR risk.
- [x] **Fix privacy policy** — Removed AWIN reference, added localStorage disclosure, future-proofed affiliate section.
- [x] **Cookie consent banner** — CookieConsent.jsx ready. Shows on first visit, stores choice in localStorage. Exports `hasConsentFor("affiliate")` for conditional script loading later.
- [x] **Security headers** — X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, HSTS with preload, Permissions-Policy in `vercel.json`.

## Should Fix (SEO / Professionalism) — ALL DONE

- [x] **`robots.txt`** — Allows all crawlers, points to sitemap.
- [x] **`sitemap.xml`** — 670 URLs (11 static + 343 shoes + 156 ropes + 49 belays + 111 crashpads).
- [x] **Per-page `<title>` and `<meta description>`** — usePageMeta hook on all 17 routes. Dynamic titles on product detail pages.
- [x] **Open Graph + Twitter Card meta tags** — og:title, og:description, og:image, og:url on every page. Static fallbacks in index.html for crawlers.
- [x] **Proper favicon** — Mountain icon as SVG + ICO, replacing emoji.

## Legal Hardening — ALL DONE

- [x] **Nutzungsbedingungen (Terms of Service)** — New `/terms` page with limitation of liability, no-warranty for safety-critical gear data, scoring disclaimer, IP notice. Linked in footer + sitemap.
- [x] **Safety disclaimers on all detail pages** — Category-specific disclaimers on ShoeDetail, RopeDetail ("life-safety equipment"), BelayDetail ("proper training essential"), CrashpadDetail ("reduces but doesn't eliminate injury risk").
- [x] **General safety notice in footer** — Site-wide notice: climbing is inherently dangerous, data is for informational comparison only, does not replace training/fitting/manufacturer instructions.
- [x] **Narrowed Supabase queries** — `admin_flags` and `data_confidence` stripped from client responses. Prices and price history use explicit field selects. All queries go through centralized `supabaseFetch()`.

## Nice to Have — ALL DONE

- [x] **Vercel Analytics** — Cookie-free, privacy-friendly. `@vercel/analytics` injected in main.jsx.
- [x] **OG image** — 1200x630 og-image.png with site branding.
- [x] **Error monitoring (Sentry)** — `@sentry/react` installed, `sentry.js` module + ErrorBoundary wired into main.jsx. Activates when `VITE_SENTRY_DSN` env var is set in Vercel.
- [x] **Centralize Supabase config** — New `src/supabase.js` exports URL, anon key, and `supabaseFetch()` helper. Removed duplicates from main.jsx, Landing.jsx, About.jsx.
- [x] **Input validation on `api/fetch-prices.js`** — `limit` capped at 500, `offset` clamped to shoe count, `NaN` values handled gracefully.

## Affiliate Roadmap

| Step | Action | Status |
|------|--------|--------|
| 1 | Apply for Amazon Associates (DE) | Pending |
| 2 | Apply for Skimlinks | Pending |
| 3 | Once approved: add Amazon tag to all outbound links | — |
| 4 | Once approved: load Skimlinks script conditionally via `hasConsentFor("affiliate")` + update privacy policy | — |
| 5 | Once traffic justifies: replace Skimlinks with direct Amazon for better margins | — |

**Image licensing:** Amazon Associates allows use of product images via their API once approved. This covers the majority of products. For brands not on Amazon, request press kit images directly from manufacturers.
