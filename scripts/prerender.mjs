/**
 * Pre-render static HTML for every route at build time.
 *
 * Reads the Vite-built dist/index.html as a template, then for each route:
 *  - Injects a unique <title> and <meta description>
 *  - Adds JSON-LD structured data (Product/ItemList schema)
 *  - Fetches live prices from Supabase and injects AggregateOffer into JSON-LD
 *  - Injects VISIBLE HTML content inside <div id="root"> for first-pass crawling
 *  - React replaces this content on hydration - no user sees raw HTML
 *  - Writes to dist/{route}/index.html
 *
 * SEO rationale: Google uses two-wave indexing. The first wave reads raw HTML
 * and only queues JS rendering if the page seems worth it. An empty <div id="root">
 * signals "thin content" and many pages never get rendered. By injecting real
 * visible content, Google indexes the page on the first pass.
 *
 * Price data in JSON-LD: Without AggregateOffer in the pre-rendered HTML,
 * Google cannot show price rich snippets and AI answer engines will cite
 * retailers directly instead of climbing-gear.com. Prices are fetched from
 * Supabase at build time so the static HTML includes full Offer schema.
 *
 * Run AFTER `vite build`: node scripts/prerender.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ARTICLE_BODIES } from './article-bodies.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'src');
const BASE = 'https://www.climbing-gear.com';

const TEMPLATE = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

// --- Supabase price fetching for AggregateOffer in JSON-LD ---------------
const SUPABASE_URL = 'https://wsjsuhvpgupalwgcjatp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjA3OTEsImV4cCI6MjA4NjEzNjc5MX0.QH3wFa14gSvRKOz8Q099sbKvKoSroGJfPerdZgPtbTI';

/**
 * Fetch all in-stock, high-confidence prices from a Supabase price table
 * and group by product_slug.
 * Returns a Map: slug -> [{ retailer, price, url }, ...]
 * Uses pagination (Supabase default limit = 1000) to fetch all rows.
 * Gracefully returns empty map on failure so the build never breaks.
 */
async function fetchPriceMap(table) {
  const priceMap = new Map();
  const pageSize = 1000;
  let offset = 0;
  let total = 0;

  try {
    while (true) {
      const url = `${SUPABASE_URL}/rest/v1/${table}?select=product_slug,retailer,price_eur,product_url&product_slug=not.is.null&in_stock=eq.true&match_confidence=eq.1&order=product_slug&offset=${offset}&limit=${pageSize}`;
      const res = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      if (!res.ok) {
        console.warn(`  Warning: Supabase ${table} fetch failed (${res.status}). Skipping.`);
        return new Map();
      }
      const rows = await res.json();
      for (const row of rows) {
        if (!row.product_slug || !row.price_eur) continue;
        if (!priceMap.has(row.product_slug)) priceMap.set(row.product_slug, []);
        priceMap.get(row.product_slug).push({
          retailer: row.retailer,
          price: row.price_eur,
          url: row.product_url,
        });
      }
      total += rows.length;
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
    console.log(`  ${table}: ${total} prices for ${priceMap.size} products`);
  } catch (err) {
    console.warn(`  Warning: Could not fetch ${table}: ${err.message}. Skipping.`);
    return new Map();
  }
  return priceMap;
}

/**
 * Build the AggregateOffer (or single Offer) schema fragment from a price list.
 * If no prices are available, returns an OutOfStock Offer pointing to the product
 * page so the parent Product schema still satisfies Google's
 * "offers/review/aggregateRating one-of" rule for Product rich results.
 *
 * @param {Array} prices - rows from the *_prices table for this product (may be empty)
 * @param {string} productUrl - canonical product page URL (used as fallback offer.url)
 */
function buildOfferSchema(prices, productUrl) {
  if (!prices || prices.length === 0) {
    if (!productUrl) return undefined;
    return {
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'EUR',
      // Google requires price/priceSpecification on every Offer (even OutOfStock).
      // 0 is the conventional value when the item is unavailable.
      price: 0,
      availability: 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: 'climbing-gear.com' },
    };
  }
  const allPrices = prices.map(p => p.price);
  const offers = prices.map(p => ({
    '@type': 'Offer',
    url: p.url,
    priceCurrency: 'EUR',
    price: p.price,
    availability: 'https://schema.org/InStock',
    seller: { '@type': 'Organization', name: p.retailer },
  }));
  if (offers.length === 1) return offers[0];
  return {
    '@type': 'AggregateOffer',
    lowPrice: Math.min(...allPrices),
    highPrice: Math.max(...allPrices),
    priceCurrency: 'EUR',
    offerCount: offers.length,
    offers,
  };
}

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cap(s) {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Generate an HTML page from the template with custom meta + SSR content.
 * ssrContent goes INSIDE <div id="root"> so Google sees it on first crawl.
 * React's createRoot will replace it when JS loads.
 */
// --- BreadcrumbList schema builder for Google breadcrumb rich snippets ---
function buildBreadcrumbSchema(crumbs) {
  // crumbs: [{ name, url }, ...] - ordered from root to current page
  if (!crumbs || crumbs.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

function renderPage(routePath, title, description, ssrContent, jsonLd, breadcrumbSchema, faqSchema) {
  const fullTitle = `${title} | climbing-gear.com`;
  const canonical = `${BASE}${routePath}`;

  let html = TEMPLATE;

  // Replace <title>
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escHtml(fullTitle)}</title>`
  );

  // Replace meta description
  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${escHtml(description)}"`
  );

  // Replace canonical
  html = html.replace(
    /<link rel="canonical" href="[^"]*"/,
    `<link rel="canonical" href="${canonical}"`
  );

  // Replace OG tags
  html = html.replace(/(<meta property="og:title" content=")[^"]*"/, `$1${escHtml(fullTitle)}"`);
  html = html.replace(/(<meta property="og:description" content=")[^"]*"/, `$1${escHtml(description)}"`);
  html = html.replace(/(<meta property="og:url" content=")[^"]*"/, `$1${canonical}"`);
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*"/, `$1${escHtml(fullTitle)}"`);
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*"/, `$1${escHtml(description)}"`);

  // Inject visible SSR content INSIDE <div id="root"> so crawlers see real content
  if (ssrContent) {
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root">${ssrContent}</div>`
    );
  }

  // Inject JSON-LD before </head> - use same id as useStructuredData.js so React can replace it
  if (jsonLd) {
    html = html.replace(
      '</head>',
      `<script type="application/ld+json" id="structured-data-jsonld">${JSON.stringify(jsonLd)}</script>\n</head>`
    );
  }

  // Inject BreadcrumbList JSON-LD as separate tag (not replaced by React)
  if (breadcrumbSchema) {
    html = html.replace(
      '</head>',
      `<script type="application/ld+json" id="structured-data-breadcrumb">${JSON.stringify(breadcrumbSchema)}</script>\n</head>`
    );
  }

  // Inject FAQPage JSON-LD as separate tag
  if (faqSchema) {
    html = html.replace(
      '</head>',
      `<script type="application/ld+json" id="structured-data-faq">${JSON.stringify(faqSchema)}</script>\n</head>`
    );
  }

  return html;
}

function writePage(routePath, html) {
  const dir = path.join(DIST, routePath.replace(/^\//, ''));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
}

// --- Spec row helper for product detail pages ---
function specRow(label, value) {
  if (!value && value !== 0) return '';
  return `<tr><td>${escHtml(label)}</td><td>${escHtml(String(value))}</td></tr>`;
}

function specTable(rows) {
  const filtered = rows.filter(Boolean);
  if (!filtered.length) return '';
  return `<table>${filtered.join('')}</table>`;
}

// --- Related products helper (cross-linking for SEO) -------------------
function ensureArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch {}
    return v.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function relatedLinksHtml(related, pathPrefix, sectionTitle) {
  if (!related.length) return '';
  let h = `<h2>${escHtml(sectionTitle)}</h2><ul>`;
  for (const r of related) {
    h += `<li><a href="${BASE}/${pathPrefix}/${r.slug}">${escHtml(r.brand)} ${escHtml(r.model || r.slug)}</a></li>`;
  }
  h += `</ul>`;
  return h;
}

// Shoe similarity: closure, feel, downturn, rubber type, different-brand bonus
function findRelatedShoes(target, all) {
  return all
    .filter(s => s.slug !== target.slug)
    .map(s => {
      let score = 0;
      if (s.closure && s.closure === target.closure) score += 15;
      if (s.feel && s.feel === target.feel) score += 20;
      if (s.downturn && s.downturn === target.downturn) score += 15;
      if (s.rubber_type && s.rubber_type === target.rubber_type) score += 10;
      if (s.asymmetry && s.asymmetry === target.asymmetry) score += 10;
      if (s.gender && s.gender === target.gender) score += 5;
      if (s.brand !== target.brand) score += 10;
      return { item: s, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(r => r.item);
}

// Rope similarity: type, diameter, weight, different-brand bonus
function findRelatedRopes(target, all) {
  return all
    .filter(r => r.slug !== target.slug)
    .map(r => {
      let score = 0;
      if (r.rope_type === target.rope_type) score += 25;
      if (r.diameter_mm && target.diameter_mm) {
        const diff = Math.abs(r.diameter_mm - target.diameter_mm);
        if (diff <= 0.2) score += 20;
        else if (diff <= 0.5) score += 12;
        else if (diff <= 1.0) score += 5;
      }
      if (r.weight_per_meter_g && target.weight_per_meter_g) {
        const diff = Math.abs(r.weight_per_meter_g - target.weight_per_meter_g);
        if (diff <= 3) score += 15;
        else if (diff <= 6) score += 8;
      }
      if (r.brand !== target.brand) score += 10;
      return { item: r, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(r => r.item);
}

// Crashpad similarity: size, thickness, weight, different-brand bonus
function findRelatedPads(target, all) {
  return all
    .filter(p => p.slug !== target.slug)
    .map(p => {
      let score = 0;
      if (p.pad_size_category && p.pad_size_category === target.pad_size_category) score += 20;
      if (p.thickness_cm && target.thickness_cm) {
        const diff = Math.abs(p.thickness_cm - target.thickness_cm);
        if (diff <= 1) score += 15;
        else if (diff <= 3) score += 8;
      }
      if (p.weight_kg && target.weight_kg) {
        const diff = Math.abs(p.weight_kg - target.weight_kg);
        if (diff <= 0.5) score += 15;
        else if (diff <= 1.5) score += 8;
      }
      if (p.fold_style && p.fold_style === target.fold_style) score += 5;
      if (p.brand !== target.brand) score += 10;
      return { item: p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(r => r.item);
}

// Belay similarity: type, weight, different-brand bonus
function findRelatedBelays(target, all) {
  return all
    .filter(b => b.slug !== target.slug)
    .map(b => {
      let score = 0;
      if (b.type && b.type === target.type) score += 25;
      if (b.weight_g && target.weight_g) {
        const diff = Math.abs(b.weight_g - target.weight_g);
        if (diff <= 20) score += 15;
        else if (diff <= 50) score += 8;
      }
      if (b.rope_diameter_max_mm && target.rope_diameter_max_mm) {
        const diff = Math.abs(b.rope_diameter_max_mm - target.rope_diameter_max_mm);
        if (diff <= 0.5) score += 10;
      }
      if (b.brand !== target.brand) score += 10;
      return { item: b, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(r => r.item);
}

// Quickdraw similarity: weight, type, different-brand bonus
function findRelatedQds(target, all) {
  return all
    .filter(q => q.slug !== target.slug)
    .map(q => {
      let score = 0;
      if (q.weight_g && target.weight_g) {
        const diff = Math.abs(q.weight_g - target.weight_g);
        if (diff <= 5) score += 20;
        else if (diff <= 15) score += 12;
        else if (diff <= 30) score += 5;
      }
      if (q.length_cm && target.length_cm) {
        const diff = Math.abs(q.length_cm - target.length_cm);
        if (diff <= 2) score += 15;
        else if (diff <= 5) score += 8;
      }
      const qUse = ensureArray(q.best_use_cases);
      const tUse = ensureArray(target.best_use_cases);
      const overlap = qUse.filter(u => tUse.includes(u)).length;
      if (overlap > 0) score += Math.min(15, overlap * 5);
      if (q.brand !== target.brand) score += 10;
      return { item: q, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(r => r.item);
}

// --- Price table helper for SSR content ----------------------------------
function priceTableHtml(prices) {
  if (!prices || prices.length === 0) return '';
  // Sort by price ascending, deduplicate by retailer (keep cheapest)
  const byRetailer = new Map();
  for (const p of prices) {
    const key = p.retailer;
    if (!byRetailer.has(key) || p.price < byRetailer.get(key).price) {
      byRetailer.set(key, p);
    }
  }
  const sorted = [...byRetailer.values()].sort((a, b) => a.price - b.price);
  // Show up to 10 retailers to keep HTML size reasonable
  const shown = sorted.slice(0, 10);
  let h = `<h2>Prices</h2><table><tr><th>Retailer</th><th>Price</th></tr>`;
  for (const p of shown) {
    h += `<tr><td>${escHtml(p.retailer)}</td><td>${p.price.toFixed(2)} EUR</td></tr>`;
  }
  if (sorted.length > 10) {
    h += `<tr><td colspan="2">+ ${sorted.length - 10} more retailers</td></tr>`;
  }
  h += `</table>`;
  return h;
}

// --- Shoe pages -------------------------------------------------------
function shoeTitle(s) { return `${s.brand} ${s.model || s.slug} - Specs, Scores & Prices`; }
function shoeDesc(s) {
  const parts = [`${s.brand} ${s.model || s.slug} climbing shoe`];
  if (s.feel) parts.push(`${cap(s.feel)} feel`);
  if (s.closure) parts.push(`${cap(s.closure)} closure`);
  if (s.rubber_type) parts.push(`${s.rubber_type} rubber`);
  if (s.weight_g) parts.push(`${s.weight_g}g`);
  parts.push('Compare specs, performance scores, and prices across retailers.');
  return parts.join('. ');
}
// Internal long-form reviews on climbing-gear.com - mirrored from
// src/ShoeDetail.jsx INTERNAL_REVIEWS so the "Our review" link appears in
// first-pass crawler HTML, not just after React hydration.
const INTERNAL_REVIEWS = {
  'scarpa-blackbird': {
    url: '/insights/scarpa-blackbird',
    title: 'Scarpa Blackbird Review: I Tested the Most Expensive Shoe on Sandstone Edges',
    blurb: 'Roman tested the carbon-midsole Blackbird on vertical sandstone micro-edges. Plus seven cheaper alternatives compared head-to-head.',
  },
};

function shoeSsr(s, allShoes, priceMap) {
  let h = `<article itemscope itemtype="https://schema.org/Product">`;
  h += `<nav><a href="${BASE}/">Home</a> / <a href="${BASE}/shoes">Climbing Shoes</a> / ${escHtml(s.brand)} ${escHtml(s.model || s.slug)}</nav>`;
  h += `<h1 itemprop="name">${escHtml(s.brand)} ${escHtml(s.model || s.slug)}</h1>`;
  h += `<p itemprop="brand" itemscope itemtype="https://schema.org/Brand"><span itemprop="name">${escHtml(s.brand)}</span></p>`;
  h += `<p itemprop="description">${escHtml(shoeDesc(s))}</p>`;
  const internalReview = INTERNAL_REVIEWS[s.slug];
  if (internalReview) {
    h += `<aside><p><strong>Our review:</strong> <a href="${BASE}${internalReview.url}">${escHtml(internalReview.title)}</a> - ${escHtml(internalReview.blurb)}</p></aside>`;
  }
  h += `<h2>Specifications</h2>`;
  h += specTable([
    specRow('Brand', s.brand),
    specRow('Model', s.model),
    specRow('Closure', cap(s.closure)),
    specRow('Feel', cap(s.feel)),
    specRow('Downturn', cap(s.downturn)),
    specRow('Asymmetry', cap(s.asymmetry)),
    specRow('Rubber', s.rubber_type),
    s.rubber_thickness_mm ? specRow('Rubber Thickness', `${s.rubber_thickness_mm}mm`) : '',
    s.weight_g ? specRow('Weight (pair)', `${s.weight_g}g`) : '',
    specRow('Vegan', s.vegan ? 'Yes' : 'No'),
    specRow('Kids', s.kids_friendly ? 'Yes' : 'No'),
  ]);
  h += priceTableHtml(priceMap?.get(s.slug));
  if (allShoes) h += relatedLinksHtml(findRelatedShoes(s, allShoes), 'shoe', 'Similar Climbing Shoes');
  h += `<p><a href="${BASE}/shoes">Browse all climbing shoes</a></p>`;
  h += `</article>`;
  return h;
}
function shoeJsonLd(s, shoePriceMap) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${s.brand} ${s.model || s.slug}`,
    brand: { '@type': 'Brand', name: s.brand },
    description: shoeDesc(s),
    category: 'Climbing Shoes',
    url: `${BASE}/shoe/${s.slug}`,
    image: s.image_url
      ? (s.image_url.startsWith('http') ? s.image_url : `${BASE}${s.image_url}`)
      : `${BASE}/images/shoes/${s.slug}.jpg`,
    additionalProperty: [
      s.weight_g && { '@type': 'PropertyValue', name: 'Weight', value: `${s.weight_g}g` },
      s.closure && { '@type': 'PropertyValue', name: 'Closure', value: s.closure },
      s.downturn && { '@type': 'PropertyValue', name: 'Downturn', value: s.downturn },
      s.asymmetry && { '@type': 'PropertyValue', name: 'Asymmetry', value: s.asymmetry },
      s.rubber_type && { '@type': 'PropertyValue', name: 'Rubber', value: s.rubber_type },
    ].filter(Boolean),
  };

  // Inject AggregateOffer from Supabase price data fetched at build time
  const offerSchema = buildOfferSchema(shoePriceMap?.get(s.slug), `${BASE}/shoe/${s.slug}`);
  if (offerSchema) schema.offers = offerSchema;

  return schema;
}

// --- Rope pages -------------------------------------------------------
function ropeTitle(r) { return `${r.brand} ${r.model || r.slug} - Rope Specs & Prices`; }
function ropeDesc(r) {
  const parts = [`${r.brand} ${r.model || r.slug} climbing rope`];
  if (r.diameter_mm) parts.push(`${r.diameter_mm}mm`);
  if (r.rope_type) parts.push(cap(r.rope_type));
  if (r.weight_per_meter_g) parts.push(`${r.weight_per_meter_g}g/m`);
  if (r.uiaa_falls) parts.push(`${r.uiaa_falls} UIAA falls`);
  parts.push('Compare specs and prices.');
  return parts.join('. ');
}
function ropeSsr(r, allRopes, priceMap) {
  let h = `<article>`;
  h += `<nav><a href="${BASE}/">Home</a> / <a href="${BASE}/ropes">Climbing Ropes</a> / ${escHtml(r.brand)} ${escHtml(r.model || r.slug)}</nav>`;
  h += `<h1>${escHtml(r.brand)} ${escHtml(r.model || r.slug)}</h1>`;
  h += `<p>${escHtml(ropeDesc(r))}</p>`;
  h += `<h2>Specifications</h2>`;
  h += specTable([
    specRow('Brand', r.brand),
    specRow('Model', r.model),
    r.diameter_mm ? specRow('Diameter', `${r.diameter_mm}mm`) : '',
    specRow('Type', cap(r.rope_type)),
    r.weight_per_meter_g ? specRow('Weight per Meter', `${r.weight_per_meter_g}g/m`) : '',
    r.uiaa_falls ? specRow('UIAA Falls', r.uiaa_falls) : '',
    r.dynamic_elongation_pct ? specRow('Dynamic Elongation', `${r.dynamic_elongation_pct}%`) : '',
    r.static_elongation_pct ? specRow('Static Elongation', `${r.static_elongation_pct}%`) : '',
    r.sheath_proportion_pct ? specRow('Sheath Proportion', `${r.sheath_proportion_pct}%`) : '',
    r.impact_force_kn ? specRow('Impact Force', `${r.impact_force_kn}kN`) : '',
    specRow('Dry Treatment', r.dry_treatment ? 'Yes' : 'No'),
  ]);
  h += priceTableHtml(priceMap?.get(r.slug));
  if (allRopes) h += relatedLinksHtml(findRelatedRopes(r, allRopes), 'rope', 'Similar Climbing Ropes');
  h += `<p><a href="${BASE}/ropes">Browse all climbing ropes</a></p>`;
  h += `</article>`;
  return h;
}
function ropeJsonLd(r, priceMap) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${r.brand} ${r.model || r.slug}`,
    brand: { '@type': 'Brand', name: r.brand },
    description: ropeDesc(r),
    category: 'Climbing Ropes',
    url: `${BASE}/rope/${r.slug}`,
  };
  const offerSchema = buildOfferSchema(priceMap?.get(r.slug), `${BASE}/rope/${r.slug}`);
  if (offerSchema) schema.offers = offerSchema;
  return schema;
}

// --- Crashpad pages ---------------------------------------------------
function padTitle(p) { return `${p.brand} ${p.model || p.slug} - Crashpad Specs & Prices`; }
function padDesc(p) {
  const parts = [`${p.brand} ${p.model || p.slug} bouldering crashpad`];
  if (p.length_cm && p.width_cm) parts.push(`${p.length_cm}x${p.width_cm}cm`);
  if (p.thickness_cm) parts.push(`${p.thickness_cm}cm thick`);
  if (p.weight_kg) parts.push(`${p.weight_kg}kg`);
  parts.push('Compare specs and prices.');
  return parts.join('. ');
}
function padSsr(p, allPads, priceMap) {
  let h = `<article>`;
  h += `<nav><a href="${BASE}/">Home</a> / <a href="${BASE}/crashpads">Crashpads</a> / ${escHtml(p.brand)} ${escHtml(p.model || p.slug)}</nav>`;
  h += `<h1>${escHtml(p.brand)} ${escHtml(p.model || p.slug)}</h1>`;
  h += `<p>${escHtml(padDesc(p))}</p>`;
  h += `<h2>Specifications</h2>`;
  h += specTable([
    specRow('Brand', p.brand),
    specRow('Model', p.model),
    p.length_cm && p.width_cm ? specRow('Size', `${p.length_cm} x ${p.width_cm}cm`) : '',
    p.thickness_cm ? specRow('Thickness', `${p.thickness_cm}cm`) : '',
    p.weight_kg ? specRow('Weight', `${p.weight_kg}kg`) : '',
    specRow('Fold Type', cap(p.fold_type)),
    specRow('Foam Type', cap(p.foam_type)),
  ]);
  h += priceTableHtml(priceMap?.get(p.slug));
  if (allPads) h += relatedLinksHtml(findRelatedPads(p, allPads), 'crashpad', 'Similar Crashpads');
  h += `<p><a href="${BASE}/crashpads">Browse all crashpads</a></p>`;
  h += `</article>`;
  return h;
}
function padJsonLd(p, priceMap) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${p.brand} ${p.model || p.slug}`,
    brand: { '@type': 'Brand', name: p.brand },
    description: padDesc(p),
    category: 'Bouldering Crashpads',
    url: `${BASE}/crashpad/${p.slug}`,
  };
  const offerSchema = buildOfferSchema(priceMap?.get(p.slug), `${BASE}/crashpad/${p.slug}`);
  if (offerSchema) schema.offers = offerSchema;
  return schema;
}

// --- Belay pages ------------------------------------------------------
function belayTitle(b) { return `${b.brand} ${b.model || b.slug} - Belay Device Specs & Prices`; }
function belayDesc(b) {
  const parts = [`${b.brand} ${b.model || b.slug} belay device`];
  if (b.type) parts.push(cap(b.type));
  if (b.weight_g) parts.push(`${b.weight_g}g`);
  parts.push('Compare specs and prices.');
  return parts.join('. ');
}
function belaySsr(b, allBelays, priceMap) {
  let h = `<article>`;
  h += `<nav><a href="${BASE}/">Home</a> / <a href="${BASE}/belays">Belay Devices</a> / ${escHtml(b.brand)} ${escHtml(b.model || b.slug)}</nav>`;
  h += `<h1>${escHtml(b.brand)} ${escHtml(b.model || b.slug)}</h1>`;
  h += `<p>${escHtml(belayDesc(b))}</p>`;
  h += `<h2>Specifications</h2>`;
  h += specTable([
    specRow('Brand', b.brand),
    specRow('Model', b.model),
    specRow('Type', cap(b.type)),
    b.weight_g ? specRow('Weight', `${b.weight_g}g`) : '',
    b.rope_diameter_min_mm ? specRow('Min Rope Diameter', `${b.rope_diameter_min_mm}mm`) : '',
    b.rope_diameter_max_mm ? specRow('Max Rope Diameter', `${b.rope_diameter_max_mm}mm`) : '',
  ]);
  h += priceTableHtml(priceMap?.get(b.slug));
  if (allBelays) h += relatedLinksHtml(findRelatedBelays(b, allBelays), 'belay', 'Similar Belay Devices');
  h += `<p><a href="${BASE}/belays">Browse all belay devices</a></p>`;
  h += `</article>`;
  return h;
}
function belayJsonLd(b, priceMap) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${b.brand} ${b.model || b.slug}`,
    brand: { '@type': 'Brand', name: b.brand },
    description: belayDesc(b),
    category: 'Belay Devices',
    url: `${BASE}/belay/${b.slug}`,
  };
  const offerSchema = buildOfferSchema(priceMap?.get(b.slug), `${BASE}/belay/${b.slug}`);
  if (offerSchema) schema.offers = offerSchema;
  return schema;
}

// --- Quickdraw pages --------------------------------------------------
function qdTitle(q) { return `${q.brand} ${q.model || q.slug} - Quickdraw Specs & Prices`; }
function qdDesc(q) {
  const parts = [`${q.brand} ${q.model || q.slug} quickdraw`];
  if (q.length_cm) parts.push(`${q.length_cm}cm`);
  if (q.weight_g) parts.push(`${q.weight_g}g`);
  parts.push('Compare specs and prices.');
  return parts.join('. ');
}
function qdSsr(q, allQds, priceMap) {
  let h = `<article>`;
  h += `<nav><a href="${BASE}/">Home</a> / <a href="${BASE}/quickdraws">Quickdraws</a> / ${escHtml(q.brand)} ${escHtml(q.model || q.slug)}</nav>`;
  h += `<h1>${escHtml(q.brand)} ${escHtml(q.model || q.slug)}</h1>`;
  h += `<p>${escHtml(qdDesc(q))}</p>`;
  h += `<h2>Specifications</h2>`;
  h += specTable([
    specRow('Brand', q.brand),
    specRow('Model', q.model),
    q.length_cm ? specRow('Length', `${q.length_cm}cm`) : '',
    q.weight_g ? specRow('Weight', `${q.weight_g}g`) : '',
  ]);
  h += priceTableHtml(priceMap?.get(q.slug));
  if (allQds) h += relatedLinksHtml(findRelatedQds(q, allQds), 'quickdraw', 'Similar Quickdraws');
  h += `<p><a href="${BASE}/quickdraws">Browse all quickdraws</a></p>`;
  h += `</article>`;
  return h;
}
function qdJsonLd(q, priceMap) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${q.brand} ${q.model || q.slug}`,
    brand: { '@type': 'Brand', name: q.brand },
    description: qdDesc(q),
    category: 'Quickdraws',
    url: `${BASE}/quickdraw/${q.slug}`,
  };
  const offerSchema = buildOfferSchema(priceMap?.get(q.slug), `${BASE}/quickdraw/${q.slug}`);
  if (offerSchema) schema.offers = offerSchema;
  return schema;
}

// --- Category list pages with product links ---------------------------
function categoryItemListJsonLd(items, category, pathPrefix) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Climbing ${category} Comparison`,
    description: `Compare ${items.length}+ climbing ${category.toLowerCase()} - specs, prices, and performance data.`,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 100).map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE}/${pathPrefix}/${item.slug}`,
      name: `${item.brand} ${item.model || item.slug}`,
    })),
  };
}

function categorySsr(title, desc, items, pathPrefix, categoryPath) {
  let h = `<article>`;
  h += `<nav><a href="${BASE}/">Home</a> / ${escHtml(title)}</nav>`;
  h += `<h1>${escHtml(title)}</h1>`;
  h += `<p>${escHtml(desc)}</p>`;
  // Internal links to every product - critical for Google discovery
  h += `<h2>All Products</h2><ul>`;
  for (const item of items) {
    h += `<li><a href="${BASE}/${pathPrefix}/${item.slug}">${escHtml(item.brand)} ${escHtml(item.model || item.slug)}</a></li>`;
  }
  h += `</ul>`;
  h += `<p><a href="${BASE}/">Back to homepage</a></p>`;
  h += `</article>`;
  return h;
}

// --- Category definitions ---------------------------------------------
const CATEGORIES = [
  { route: '/shoes', title: 'Climbing Shoes - Compare 750+ Models', desc: 'Find the perfect climbing shoe. Compare specs, performance scores, and prices across 750+ models from La Sportiva, Scarpa, Evolv, and more.', file: 'seed_data.json', prefix: 'shoe', key: 'shoes', breadcrumbName: 'Climbing Shoes' },
  { route: '/ropes', title: 'Climbing Ropes - Compare 190+ Models', desc: 'Compare dynamic, static, half, and twin ropes. Filter by diameter, weight, falls rated, and dry treatment.', file: 'rope_seed_data.json', prefix: 'rope', filterFn: items => items.filter(r => r.rope_type !== 'static'), breadcrumbName: 'Climbing Ropes' },
  { route: '/crashpads', title: 'Crashpads - Compare 110+ Models', desc: 'Compare bouldering crashpads by size, thickness, weight, foam type, and price.', file: 'crashpad_seed_data.json', prefix: 'crashpad', breadcrumbName: 'Crashpads' },
  { route: '/belays', title: 'Belay Devices - Compare 50+ Models', desc: 'Compare belay devices: assisted-braking, tube, and guide. Filter by weight, rope range, and safety features.', file: 'belay_seed_data.json', prefix: 'belay', breadcrumbName: 'Belay Devices' },
  { route: '/quickdraws', title: 'Quickdraws - Compare 40+ Models', desc: 'Compare quickdraws by weight, length, gate type, and price.', file: 'quickdraw_seed_data.json', prefix: 'quickdraw', breadcrumbName: 'Quickdraws' },
];

// Lookup: product prefix -> breadcrumb category name and route
const CATEGORY_BREADCRUMBS = Object.fromEntries(
  CATEGORIES.map(c => [c.prefix, { name: c.breadcrumbName, route: c.route }])
);

// --- Article JSON-LD builder for insight/news pages ----------------------
function buildArticleSchema(article, shoePriceMap) {
  // Image: prefer ImageObject with explicit dimensions when known (better for Google + AI engines)
  let imageNode;
  if (article.image) {
    if (article.imageWidth && article.imageHeight) {
      imageNode = {
        '@type': 'ImageObject',
        url: `${BASE}${article.image}`,
        width: article.imageWidth,
        height: article.imageHeight,
      };
    } else {
      imageNode = `${BASE}${article.image}`;
    }
  }
  // Author: use Person for first-person reviews to strengthen E-E-A-T; Organization for everything else
  const authorNode = article.authorPerson
    ? { '@type': 'Person', name: article.authorPerson, url: `${BASE}/about` }
    : { '@type': 'Organization', name: 'climbing-gear.com' };
  const base = {
    '@context': 'https://schema.org',
    '@type': article.isReview ? 'Review' : 'Article',
    headline: article.headline,
    description: article.desc,
    url: `${BASE}${article.route}`,
    datePublished: article.datePublished,
    dateModified: article.dateModified || article.datePublished,
    author: authorNode,
    publisher: {
      '@type': 'Organization',
      name: 'climbing-gear.com',
      url: BASE,
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE}${article.route}` },
    ...(imageNode && { image: imageNode }),
  };
  if (article.isReview && article.reviewedSlug && article.reviewedBrand && article.reviewedName) {
    const ratingValue = article.ratingValue || '6.5';
    const reviewedUrl = `${BASE}/shoe/${article.reviewedSlug}`;
    // Pull live offers from the same Supabase price map the shoe page uses,
    // so the Review's nested Product carries real InStock offers when available.
    const reviewedOffers = buildOfferSchema(shoePriceMap?.get(article.reviewedSlug), reviewedUrl);
    base.itemReviewed = {
      '@type': 'Product',
      name: `${article.reviewedBrand} ${article.reviewedName}`,
      brand: { '@type': 'Brand', name: article.reviewedBrand },
      category: 'Climbing Shoes',
      url: reviewedUrl,
      ...(article.image && { image: `${BASE}${article.image}` }),
      ...(reviewedOffers && { offers: reviewedOffers }),
      // aggregateRating kept as a fallback so SPA navigations (which lack the
      // server-side priceMap) still satisfy Google's one-of rule.
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue,
        bestRating: '10',
        worstRating: '1',
        ratingCount: 1,
        reviewCount: 1,
      },
    };
    // Subjective overall rating; honest 6.5/10 reflects the verdict
    base.reviewRating = {
      '@type': 'Rating',
      ratingValue,
      bestRating: '10',
      worstRating: '1',
    };
  }
  // Pros/cons: Google can render these in the SERP for Review snippets
  if (Array.isArray(article.positives) && article.positives.length) {
    base.positiveNotes = {
      '@type': 'ItemList',
      itemListElement: article.positives.map((text, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: text,
      })),
    };
  }
  if (Array.isArray(article.negatives) && article.negatives.length) {
    base.negativeNotes = {
      '@type': 'ItemList',
      itemListElement: article.negatives.map((text, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: text,
      })),
    };
  }
  return base;
}

// FAQPage JSON-LD — answers must mirror visible article content
function buildFaqSchema(faq) {
  if (!Array.isArray(faq) || faq.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

// --- Static pages -----------------------------------------------------
// Articles get Article JSON-LD schema for Google/AI engines
const ARTICLES = [
  { route: '/insights/climbing-shoe-guide', title: 'How to Choose Climbing Shoes: Data-Driven Guide', desc: 'A comprehensive guide to choosing climbing shoes, backed by data from 750+ models. Learn what specs actually matter.', headline: 'How to Choose Climbing Shoes: A Data-Driven Guide', datePublished: '2026-02-18', dateModified: '2026-04-09', image: '/images/insights/shoe-guide-hero.jpg' },
  { route: '/insights/inflatable-crashpads', title: 'Inflatable Crashpads: Are They Worth It?', desc: 'Data analysis of inflatable vs traditional crashpads. Compare weight, packability, protection, and value.', headline: 'Inflatable Crashpads: Game-Changer or Gimmick?', datePublished: '2026-02-18', dateModified: '2026-04-09', image: '/images/insights/inflatable-packed-size.jpg' },
  { route: '/insights/rope-cost-vs-safety', title: 'Rope Cost vs Safety: What the Data Says', desc: 'Analyzing whether expensive climbing ropes are actually safer. Data from 190+ ropes compared.', headline: 'Does Spending More Buy a Safer Rope?', datePublished: '2026-02-25', dateModified: '2026-04-09' },
  { route: '/insights/foot-scanner', title: 'How the Foot Scanner Works - Real Scan Walkthrough', desc: 'Two photos, seven measurements, 400+ shoes ranked. See a real scan walkthrough from photo to recommendation.', headline: 'How the Foot Scanner Works', datePublished: '2026-04-05', dateModified: '2026-04-09' },
  { route: '/insights/heel-fit', title: 'Climbing Shoe Heel Fit: Narrow vs. Shallow Heels (Data from 200 Scans)', desc: "Empty heel in your climbing shoe? It's usually one of two things: narrow heel width or shallow heel depth. We analysed 280 fit reports across 97 shoes to show which dimension drives the mismatch for the Skwama, Instinct VSR, Drago, Shaman, Mastia, Solution and more.", headline: 'Climbing Shoe Heel Fit: Why "Narrow Heel" Isn\'t Enough', datePublished: '2026-04-13', dateModified: '2026-04-14' },
  {
    route: '/insights/scarpa-blackbird',
    title: 'Scarpa Blackbird Review: I Tested the Most Expensive Shoe on Sandstone Edges',
    desc: "First-person review of Scarpa's first carbon-enhanced midsole shoe, tested on vertical sandstone micro-edges. What works, what does not, plus seven alternatives (Otaki, Katana Lace, Vapor V, Boostic, EB Strange, Up Beat, Geshido) compared head-to-head.",
    headline: 'Scarpa Blackbird Review: I Tested the Most Expensive Shoe on Sandstone Edges',
    datePublished: '2026-04-26', dateModified: '2026-05-04',
    image: '/images/insights/blackbird/hero.jpg',
    imageWidth: 1280,
    imageHeight: 960,
    isReview: true,
    reviewedSlug: 'scarpa-blackbird',
    reviewedBrand: 'Scarpa',
    reviewedName: 'Blackbird',
    authorPerson: 'Roman',
    positives: [
      'Carbon-enhanced 3D-molded midsole delivers genuinely precise toe placement on micro-edges',
      'Comfortable from day one with zero break-in period',
      'Real sensitivity at the toe tip despite the very stiff platform',
      'Concave forefoot well suited for vertical climbing on small edges',
    ],
    negatives: [
      'Heel cup feels loose and undermines stability when fully loading the toe',
      'Thin XS Grip 2 rubber expected to wear faster than typical edging compounds',
      'Premium price for a shoe that may need a resole sooner than peers',
      'Comparable edging performance available from the La Sportiva Otaki or Scarpa Vapor V at roughly half the price',
    ],
    faq: [
      {
        q: 'What is new about the Scarpa Blackbird?',
        a: "The headline feature is Scarpa's first carbon-enhanced 3D molded midsole. It is a deliberately polarising design choice: a very stiff carbon platform combined with thin and relatively soft XS Grip 2 rubber. The idea is that the carbon does the structural work (edging power, support) while the thin rubber retains sensitivity and friction.",
      },
      {
        q: 'How does the Scarpa Blackbird fit?',
        a: 'The last is strongly asymmetric with a moderate downturn. The forefoot is narrow to medium, while the heel is a touch wider than expected given Scarpa advertises the shoe as a narrow fit. Scarpa recommends sizing up by 0.5 from your usual Scarpa size.',
      },
      {
        q: 'Who should buy the Scarpa Blackbird?',
        a: 'If you seek maximum performance on the smallest edges but want to keep sensitivity and comfort, the price is not a blocker, and your foot has a wider heel than mine, the Blackbird might be a real step ahead. For everyone else, the Otaki, Up Beat or Vapor V will get you most of the way there at a fraction of the cost.',
      },
      {
        q: 'What are good alternatives to the Scarpa Blackbird?',
        a: 'Comparable edging shoes include the La Sportiva Otaki (most direct comparison at roughly half the price), La Sportiva Katana Lace (long-standing vertical edging benchmark), Scarpa Vapor V (versatile all-rounder), Scarpa Boostic (more downturned and aggressive), EB Strange, Unparallel Up Beat (better for non-Egyptian toe shapes), and Evolv Geshido.',
      },
    ],
  },
];

const STATIC = [
  { route: '/find', title: 'Climbing Shoe Finder - Find Your Perfect Shoe', desc: 'Answer a few questions and get personalized climbing shoe recommendations based on 750+ shoes and our scoring algorithms.' },
  { route: '/insights', title: 'Climbing Gear Insights - Data-Driven Articles', desc: 'Data-driven articles and guides about climbing gear: shoe selection, crashpad analysis, rope safety, and more.' },
  { route: '/news', title: 'Gear News - Latest Climbing Equipment Updates', desc: 'Latest climbing gear news: new product releases, industry trends, and equipment updates.' },
  { route: '/methodology', title: 'Methodology - How We Score Climbing Gear', desc: 'Our 10-axis performance model, data sources, and scoring algorithms explained.' },
  { route: '/about', title: 'About climbing-gear.com', desc: 'Our mission: help climbers find the right gear through data, not marketing.' },
  { route: '/feedback', title: 'Share Your Feedback - climbing-gear.com', desc: 'Share feedback, report bugs, suggest features, or flag data corrections. Every message is read by a real human.' },
  { route: '/petz-feedback', title: 'Feedback · PETZ Boulderhalle × climbing-gear.com', desc: 'Feedback zum Kletterschuh-Scanner Event in der PETZ Boulderhalle Neustadt.' },
  { route: '/impressum', title: 'Impressum', desc: 'Legal notice and contact information for climbing-gear.com.' },
  { route: '/privacy', title: 'Privacy Policy', desc: 'How climbing-gear.com handles your data.' },
  { route: '/terms', title: 'Terms of Service', desc: 'Terms and conditions for using climbing-gear.com.' },
];

// --- Homepage SSR content ---------------------------------------------
function homepageSsr() {
  let h = `<article>`;
  h += `<h1>climbing-gear.com - Scroll less. Climb more.</h1>`;
  h += `<p>Compare 750+ climbing products - shoes, ropes, belay devices, crashpads, and quickdraws. Every spec, every price, zero brand bias.</p>`;
  h += `<h2>Browse by Category</h2><ul>`;
  h += `<li><a href="${BASE}/shoes">Climbing Shoes - Compare 750+ models</a></li>`;
  h += `<li><a href="${BASE}/ropes">Climbing Ropes - Compare 190+ models</a></li>`;
  h += `<li><a href="${BASE}/crashpads">Crashpads - Compare 110+ models</a></li>`;
  h += `<li><a href="${BASE}/belays">Belay Devices - Compare 50+ models</a></li>`;
  h += `<li><a href="${BASE}/quickdraws">Quickdraws - Compare 40+ models</a></li>`;
  h += `</ul>`;
  h += `<h2>Tools & Resources</h2><ul>`;
  h += `<li><a href="${BASE}/find">Climbing Shoe Finder</a> - Get personalized recommendations</li>`;
  h += `<li><a href="${BASE}/insights">Gear Insights</a> - Data-driven articles and guides</li>`;
  h += `<li><a href="${BASE}/news">Gear News</a> - Latest climbing equipment updates</li>`;
  h += `<li><a href="${BASE}/methodology">Methodology</a> - How we score climbing gear</li>`;
  h += `</ul>`;
  h += `<h2>Latest Review</h2><ul>`;
  h += `<li><a href="${BASE}/insights/scarpa-blackbird">Scarpa Blackbird Review: I Tested the Most Expensive Shoe on Sandstone Edges</a> - First-person review of Scarpa's first carbon-midsole shoe, plus seven cheaper alternatives compared head-to-head.</li>`;
  h += `</ul>`;
  h += `</article>`;
  return h;
}

// --- Main -------------------------------------------------------------
async function main() {
  let count = 0;

  // Fetch live prices from Supabase for AggregateOffer in JSON-LD
  console.log('Fetching prices from Supabase for JSON-LD AggregateOffer...');
  const [shoePriceMap, ropePriceMap, crashpadPriceMap, belayPriceMap, quickdrawPriceMap] = await Promise.all([
    fetchPriceMap('shoe_prices'),
    fetchPriceMap('rope_prices'),
    fetchPriceMap('crashpad_prices'),
    fetchPriceMap('belay_prices'),
    fetchPriceMap('quickdraw_prices'),
  ]);

  // Homepage
  let homepageHtml = renderPage('/', 'climbing-gear.com - Scroll less. Climb more.', 'Compare 750+ climbing products - shoes, ropes, belay devices, and crashpads. Every spec, every price, zero brand bias.', homepageSsr(), {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'climbing-gear.com',
    url: BASE,
    description: 'Compare 750+ climbing products - shoes, ropes, belay devices, and crashpads. Every spec, every price, zero brand bias.',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${BASE}/shoes?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  });
  // Preload the hero image so browser discovers it before JS loads (LCP optimization)
  homepageHtml = homepageHtml.replace(
    '</head>',
    `<link rel="preload" as="image" href="/images/hero-mountain.webp" type="image/webp" fetchpriority="high">\n<link rel="preload" as="image" href="/images/hero-mountain.jpg" fetchpriority="high">\n</head>`
  );
  // Write homepage to dist/index.html (overwrite the Vite-generated one)
  fs.writeFileSync(path.join(DIST, 'index.html'), homepageHtml, 'utf8');
  count++;

  // Product detail pages - pass full items array to SSR for cross-linking
  // Price maps are passed to both jsonLd and SSR functions for structured data + visible price tables
  const datasets = [
    { file: 'seed_data.json', prefix: '/shoe', catPrefix: 'shoe', key: 'shoes', ssrFn: shoeSsr, titleFn: shoeTitle, descFn: shoeDesc, jsonLdFn: (item) => shoeJsonLd(item, shoePriceMap), priceMap: shoePriceMap },
    { file: 'rope_seed_data.json', prefix: '/rope', catPrefix: 'rope', ssrFn: ropeSsr, titleFn: ropeTitle, descFn: ropeDesc, jsonLdFn: (item) => ropeJsonLd(item, ropePriceMap), priceMap: ropePriceMap },
    { file: 'crashpad_seed_data.json', prefix: '/crashpad', catPrefix: 'crashpad', ssrFn: padSsr, titleFn: padTitle, descFn: padDesc, jsonLdFn: (item) => padJsonLd(item, crashpadPriceMap), priceMap: crashpadPriceMap },
    { file: 'belay_seed_data.json', prefix: '/belay', catPrefix: 'belay', ssrFn: belaySsr, titleFn: belayTitle, descFn: belayDesc, jsonLdFn: (item) => belayJsonLd(item, belayPriceMap), priceMap: belayPriceMap },
    { file: 'quickdraw_seed_data.json', prefix: '/quickdraw', catPrefix: 'quickdraw', ssrFn: qdSsr, titleFn: qdTitle, descFn: qdDesc, jsonLdFn: (item) => qdJsonLd(item, quickdrawPriceMap), priceMap: quickdrawPriceMap },
  ];

  for (const { file, prefix, catPrefix, key, ssrFn, titleFn, descFn, jsonLdFn, priceMap } of datasets) {
    let items = loadJSON(file);
    if (key && items[key]) items = items[key];
    const catInfo = CATEGORY_BREADCRUMBS[catPrefix];
    for (const item of items) {
      const route = `${prefix}/${item.slug}`;
      const productName = `${item.brand} ${item.model || item.slug}`;
      const breadcrumb = buildBreadcrumbSchema([
        { name: 'Home', url: BASE },
        { name: catInfo.name, url: `${BASE}${catInfo.route}` },
        { name: productName, url: `${BASE}${route}` },
      ]);
      const html = renderPage(route, titleFn(item), descFn(item), ssrFn(item, items, priceMap), jsonLdFn(item), breadcrumb);
      writePage(route, html);
      count++;
    }
  }

  // Category pages with full product link lists
  for (const cat of CATEGORIES) {
    let items = loadJSON(cat.file);
    if (cat.key && items[cat.key]) items = items[cat.key];
    if (cat.filterFn) items = cat.filterFn(items);
    const catName = cat.route.replace('/', '');
    const ssr = categorySsr(cat.title, cat.desc, items, cat.prefix, cat.route);
    const jsonLd = categoryItemListJsonLd(items, cap(catName), cat.prefix);
    const breadcrumb = buildBreadcrumbSchema([
      { name: 'Home', url: BASE },
      { name: cat.breadcrumbName, url: `${BASE}${cat.route}` },
    ]);
    const html = renderPage(cat.route, cat.title, cat.desc, ssr, jsonLd, breadcrumb);
    writePage(cat.route, html);
    count++;
  }

  // Article pages (insights) - with Article JSON-LD schema
  for (const art of ARTICLES) {
    const body = (ARTICLE_BODIES[art.route] || '').replaceAll('$BASE', BASE);
    const ssr = `<article><nav><a href="${BASE}/">Home</a> / <a href="${BASE}/insights">Insights</a> / ${escHtml(art.headline)}</nav><h1>${escHtml(art.headline)}</h1>${body}<p><a href="${BASE}/insights">All insights</a></p></article>`;
    const breadcrumb = buildBreadcrumbSchema([
      { name: 'Home', url: BASE },
      { name: 'Insights', url: `${BASE}/insights` },
      { name: art.headline, url: `${BASE}${art.route}` },
    ]);
    const articleSchema = buildArticleSchema(art, shoePriceMap);
    const faqSchema = buildFaqSchema(art.faq);
    const html = renderPage(art.route, art.title, art.desc, ssr, articleSchema, breadcrumb, faqSchema);
    writePage(art.route, html);
    count++;
  }

  // Static pages (non-article)
  for (const pg of STATIC) {
    const ssr = `<article><nav><a href="${BASE}/">Home</a> / ${escHtml(pg.title)}</nav><h1>${escHtml(pg.title)}</h1><p>${escHtml(pg.desc)}</p><p><a href="${BASE}/">Back to homepage</a></p></article>`;
    let breadcrumbCrumbs = [{ name: 'Home', url: BASE }];
    breadcrumbCrumbs.push({ name: pg.title, url: `${BASE}${pg.route}` });
    const breadcrumb = buildBreadcrumbSchema(breadcrumbCrumbs);
    const html = renderPage(pg.route, pg.title, pg.desc, ssr, null, breadcrumb);
    writePage(pg.route, html);
    count++;
  }

  console.log(`Done: pre-rendered ${count} pages into dist/`);
}

main().catch(err => {
  console.error('Prerender failed:', err);
  process.exit(1);
});

