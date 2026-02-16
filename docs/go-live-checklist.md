# climbing-gear.com — Soft Launch Checklist

> Created: Feb 16, 2026 | Status: Ready for soft launch

## Must Fix (Legal / Security) — ALL DONE

- [x] **Self-host Google Fonts** — Downloaded DM Sans, DM Mono, Instrument Sans, JetBrains Mono as woff2 to `/public/fonts/`. No more Google CDN GDPR risk.
- [x] **Fix privacy policy** — Removed AWIN reference, added localStorage disclosure, future-proofed affiliate section.
- [x] **Cookie consent banner** — CookieConsent.jsx ready. Shows on first visit, stores choice in localStorage. Exports `hasConsentFor("affiliate")` for conditional script loading later.
- [x] **Security headers** — X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, HSTS with preload, Permissions-Policy in `vercel.json`.

## Should Fix (SEO / Professionalism) — ALL DONE

- [x] **`robots.txt`** — Allows all crawlers, points to sitemap.
- [x] **`sitemap.xml`** — 669 URLs (10 static + 343 shoes + 156 ropes + 49 belays + 111 crashpads).
- [x] **Per-page `<title>` and `<meta description>`** — usePageMeta hook on all 16 routes. Dynamic titles on product detail pages.
- [x] **Open Graph + Twitter Card meta tags** — og:title, og:description, og:image, og:url on every page. Static fallbacks in index.html for crawlers.
- [x] **Proper favicon** — Mountain icon as SVG + ICO, replacing emoji.

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
