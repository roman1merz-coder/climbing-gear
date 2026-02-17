# Analytics & SEO Setup Guide

## 📊 Current Analytics Stack

### 1. Vercel Analytics (Integrated ✓)
- **Type**: Cookie-free, privacy-friendly
- **Location**: Vercel Dashboard → climbing-gear → Analytics
- **Tracks**: Page views, visitors, countries, devices, referrers

### 2. Custom Event Tracking (NEW ✓)
File: `src/analytics.js`

**Available events**:
- `product_view` - User views product detail page
- `price_click` - User clicks retailer price link
- `wishlist` - User adds/removes from wishlist
- `compare` - User adds/removes from compare
- `filter_use` - User applies filters
- `amazon_search` - User clicks Amazon search
- `navigation` - Page-to-page navigation
- `sort` - User changes sort order

**Usage example**:
```javascript
import { trackProductView, trackPriceClick } from './analytics.js';

// In ShoeDetail.jsx
trackProductView('shoes', shoe.slug, shoe.brand, shoe.model);

// When user clicks price
trackPriceClick('Bergfreunde', 149.95, shoe.slug);
```

### 3. Sentry Error Monitoring (Optional)
- Set `VITE_SENTRY_DSN` environment variable to enable
- Tracks JavaScript errors and performance

---

## 🔍 SEO Setup

### Sitemap Generated ✓
- **URL**: https://climbing-gear.vercel.app/sitemap.xml
- **URLs**: 666 total (340 shoes, 155 ropes, 111 crashpads, 49 belays + pages)
- **Auto-regenerate**: Run `npm run sitemap` after adding products

### Robots.txt Created ✓
- **URL**: https://climbing-gear.vercel.app/robots.txt
- Allows all bots, points to sitemap

### Google Search Console (TODO)
See: `public/google-search-console-setup.md` for step-by-step instructions

**Quick steps**:
1. Go to https://search.google.com/search-console
2. Add property: `climbing-gear.vercel.app`
3. Verify ownership (HTML file or meta tag)
4. Submit sitemap: `https://climbing-gear.vercel.app/sitemap.xml`

---

## 📈 Expected Traffic Timeline

| Week | Milestone |
|------|-----------|
| 1-2  | Google Search Console verified, sitemap submitted |
| 2-4  | Initial indexing begins (homepage + main pages) |
| 4-8  | Full product catalog indexed (666 URLs) |
| 8-12 | Rankings improve for long-tail keywords |
| 12+  | Consistent organic traffic for product searches |

---

## 🎯 Key Metrics to Track

### In Vercel Analytics:
- **Page views** - Total site visits
- **Unique visitors** - Individual users
- **Top pages** - Most viewed products/categories
- **Referrers** - Where traffic comes from
- **Conversion funnel**: Landing → Category → Product → Price Click

### In Google Search Console (after setup):
- **Impressions** - How often site appears in search
- **Clicks** - How often users click through
- **CTR** - Click-through rate
- **Position** - Average ranking position
- **Top queries** - What people search for

---

## 🚀 Next Steps

1. **Deploy current changes** (sitemap + analytics)
2. **Set up Google Search Console** (15 minutes)
3. **Wait 1-2 weeks** for initial indexing
4. **Monitor Vercel Analytics** daily
5. **Check Search Console** weekly for indexing progress

---

## 📝 Maintenance

### Weekly
- Check Vercel Analytics for traffic trends
- Monitor Search Console for errors

### Monthly
- Review top-performing products
- Check which filters/features users engage with most
- Regenerate sitemap: `npm run sitemap`

### Quarterly
- Analyze seasonal trends
- Review analytics events for UX improvements
- Update SEO metadata based on search queries
