/**
 * Pre-render static HTML for every route at build time.
 *
 * Reads the Vite-built dist/index.html as a template, then for each route:
 *  - Injects a unique <title> and <meta description>
 *  - Adds JSON-LD structured data (Product/ItemList schema)
 *  - Injects VISIBLE HTML content inside <div id="root"> for first-pass crawling
 *  - React replaces this content on hydration - no user sees raw HTML
 *  - Writes to dist/{route}/index.html
 *
 * SEO rationale: Google uses two-wave indexing. The first wave reads raw HTML
 * and only queues JS rendering if the page seems worth it. An empty <div id="root">
 * signals "thin content" and many pages never get rendered. By injecting real
 * visible content, Google indexes the page on the first pass.
 *
 * Run AFTER `vite build`: node scripts/prerender.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'src');
const BASE = 'https://www.climbing-gear.com';

const TEMPLATE = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

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
function renderPage(routePath, title, description, ssrContent, jsonLd) {
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
function shoeSsr(s, allShoes) {
  let h = `<article itemscope itemtype="https://schema.org/Product">`;
  h += `<nav><a href="${BASE}/">Home</a> / <a href="${BASE}/shoes">Climbing Shoes</a> / ${escHtml(s.brand)} ${escHtml(s.model || s.slug)}</nav>`;
  h += `<h1 itemprop="name">${escHtml(s.brand)} ${escHtml(s.model || s.slug)}</h1>`;
  h += `<p itemprop="brand" itemscope itemtype="https://schema.org/Brand"><span itemprop="name">${escHtml(s.brand)}</span></p>`;
  h += `<p itemprop="description">${escHtml(shoeDesc(s))}</p>`;
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
  if (allShoes) h += relatedLinksHtml(findRelatedShoes(s, allShoes), 'shoe', 'Similar Climbing Shoes');
  h += `<p><a href="${BASE}/shoes">Browse all climbing shoes</a></p>`;
  h += `</article>`;
  return h;
}
function shoeJsonLd(s) {
  return {
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
function ropeSsr(r, allRopes) {
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
  if (allRopes) h += relatedLinksHtml(findRelatedRopes(r, allRopes), 'rope', 'Similar Climbing Ropes');
  h += `<p><a href="${BASE}/ropes">Browse all climbing ropes</a></p>`;
  h += `</article>`;
  return h;
}
function ropeJsonLd(r) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${r.brand} ${r.model || r.slug}`,
    brand: { '@type': 'Brand', name: r.brand },
    description: ropeDesc(r),
    category: 'Climbing Ropes',
    url: `${BASE}/rope/${r.slug}`,
  };
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
function padSsr(p, allPads) {
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
  if (allPads) h += relatedLinksHtml(findRelatedPads(p, allPads), 'crashpad', 'Similar Crashpads');
  h += `<p><a href="${BASE}/crashpads">Browse all crashpads</a></p>`;
  h += `</article>`;
  return h;
}
function padJsonLd(p) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${p.brand} ${p.model || p.slug}`,
    brand: { '@type': 'Brand', name: p.brand },
    description: padDesc(p),
    category: 'Bouldering Crashpads',
    url: `${BASE}/crashpad/${p.slug}`,
  };
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
function belaySsr(b, allBelays) {
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
  if (allBelays) h += relatedLinksHtml(findRelatedBelays(b, allBelays), 'belay', 'Similar Belay Devices');
  h += `<p><a href="${BASE}/belays">Browse all belay devices</a></p>`;
  h += `</article>`;
  return h;
}
function belayJsonLd(b) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${b.brand} ${b.model || b.slug}`,
    brand: { '@type': 'Brand', name: b.brand },
    description: belayDesc(b),
    category: 'Belay Devices',
    url: `${BASE}/belay/${b.slug}`,
  };
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
function qdSsr(q, allQds) {
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
  if (allQds) h += relatedLinksHtml(findRelatedQds(q, allQds), 'quickdraw', 'Similar Quickdraws');
  h += `<p><a href="${BASE}/quickdraws">Browse all quickdraws</a></p>`;
  h += `</article>`;
  return h;
}
function qdJsonLd(q) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${q.brand} ${q.model || q.slug}`,
    brand: { '@type': 'Brand', name: q.brand },
    description: qdDesc(q),
    category: 'Quickdraws',
    url: `${BASE}/quickdraw/${q.slug}`,
  };
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
  { route: '/shoes', title: 'Climbing Shoes - Compare 750+ Models', desc: 'Find the perfect climbing shoe. Compare specs, performance scores, and prices across 750+ models from La Sportiva, Scarpa, Evolv, and more.', file: 'seed_data.json', prefix: 'shoe' },
  { route: '/ropes', title: 'Climbing Ropes - Compare 190+ Models', desc: 'Compare dynamic, static, half, and twin ropes. Filter by diameter, weight, falls rated, and dry treatment.', file: 'rope_seed_data.json', prefix: 'rope', filterFn: items => items.filter(r => r.rope_type !== 'static') },
  { route: '/crashpads', title: 'Crashpads - Compare 110+ Models', desc: 'Compare bouldering crashpads by size, thickness, weight, foam type, and price.', file: 'crashpad_seed_data.json', prefix: 'crashpad' },
  { route: '/belays', title: 'Belay Devices - Compare 50+ Models', desc: 'Compare belay devices: assisted-braking, tube, and guide. Filter by weight, rope range, and safety features.', file: 'belay_seed_data.json', prefix: 'belay' },
  { route: '/quickdraws', title: 'Quickdraws - Compare 40+ Models', desc: 'Compare quickdraws by weight, length, gate type, and price.', file: 'quickdraw_seed_data.json', prefix: 'quickdraw' },
];

// --- Static pages -----------------------------------------------------
const STATIC = [
  { route: '/find', title: 'Climbing Shoe Finder - Find Your Perfect Shoe', desc: 'Answer a few questions and get personalized climbing shoe recommendations based on 750+ shoes and our scoring algorithms.' },
  { route: '/insights', title: 'Climbing Gear Insights - Data-Driven Articles', desc: 'Data-driven articles and guides about climbing gear: shoe selection, crashpad analysis, rope safety, and more.' },
  { route: '/insights/climbing-shoe-guide', title: 'How to Choose Climbing Shoes: Data-Driven Guide', desc: 'A comprehensive guide to choosing climbing shoes, backed by data from 750+ models. Learn what specs actually matter.' },
  { route: '/insights/inflatable-crashpads', title: 'Inflatable Crashpads: Are They Worth It?', desc: 'Data analysis of inflatable vs traditional crashpads. Compare weight, packability, protection, and value.' },
  { route: '/insights/rope-cost-vs-safety', title: 'Rope Cost vs Safety: What the Data Says', desc: 'Analyzing whether expensive climbing ropes are actually safer. Data from 190+ ropes compared.' },
  { route: '/news', title: 'Gear News - Latest Climbing Equipment Updates', desc: 'Latest climbing gear news: new product releases, industry trends, and equipment updates.' },
  { route: '/methodology', title: 'Methodology - How We Score Climbing Gear', desc: 'Our 10-axis performance model, data sources, and scoring algorithms explained.' },
  { route: '/about', title: 'About climbing-gear.com', desc: 'Our mission: help climbers find the right gear through data, not marketing.' },
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
  h += `</article>`;
  return h;
}

// --- Main -------------------------------------------------------------
function main() {
  let count = 0;

  // Homepage
  let homepageHtml = renderPage('/', 'climbing-gear.com - Scroll less. Climb more.', 'Compare 750+ climbing products - shoes, ropes, belay devices, and crashpads. Every spec, every price, zero brand bias.', homepageSsr(), {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'climbing-gear.com',
    url: BASE,
    description: 'Compare 750+ climbing products - shoes, ropes, belay devices, and crashpads. Every spec, every price, zero brand bias.',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${BASE}/shoes?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  });
  // Preload the hero image so browser discovers it before JS loads (LCP optimization)
  homepageHtml = homepageHtml.replace(
    '</head>',
    `<link rel="preload" as="image" href="/images/hero-mountain.jpg" fetchpriority="high">\n</head>`
  );
  // Write homepage to dist/index.html (overwrite the Vite-generated one)
  fs.writeFileSync(path.join(DIST, 'index.html'), homepageHtml, 'utf8');
  count++;

  // Product detail pages - pass full items array to SSR for cross-linking
  const datasets = [
    { file: 'seed_data.json', prefix: '/shoe', ssrFn: shoeSsr, titleFn: shoeTitle, descFn: shoeDesc, jsonLdFn: shoeJsonLd },
    { file: 'rope_seed_data.json', prefix: '/rope', ssrFn: ropeSsr, titleFn: ropeTitle, descFn: ropeDesc, jsonLdFn: ropeJsonLd },
    { file: 'crashpad_seed_data.json', prefix: '/crashpad', ssrFn: padSsr, titleFn: padTitle, descFn: padDesc, jsonLdFn: padJsonLd },
    { file: 'belay_seed_data.json', prefix: '/belay', ssrFn: belaySsr, titleFn: belayTitle, descFn: belayDesc, jsonLdFn: belayJsonLd },
    { file: 'quickdraw_seed_data.json', prefix: '/quickdraw', ssrFn: qdSsr, titleFn: qdTitle, descFn: qdDesc, jsonLdFn: qdJsonLd },
  ];

  for (const { file, prefix, ssrFn, titleFn, descFn, jsonLdFn } of datasets) {
    const items = loadJSON(file);
    for (const item of items) {
      const route = `${prefix}/${item.slug}`;
      const html = renderPage(route, titleFn(item), descFn(item), ssrFn(item, items), jsonLdFn(item));
      writePage(route, html);
      count++;
    }
  }

  // Category pages with full product link lists
  for (const cat of CATEGORIES) {
    let items = loadJSON(cat.file);
    if (cat.filterFn) items = cat.filterFn(items);
    const catName = cat.route.replace('/', '');
    const ssr = categorySsr(cat.title, cat.desc, items, cat.prefix, cat.route);
    const jsonLd = categoryItemListJsonLd(items, cap(catName), cat.prefix);
    const html = renderPage(cat.route, cat.title, cat.desc, ssr, jsonLd);
    writePage(cat.route, html);
    count++;
  }

  // Static pages
  for (const pg of STATIC) {
    const ssr = `<article><nav><a href="${BASE}/">Home</a> / ${escHtml(pg.title)}</nav><h1>${escHtml(pg.title)}</h1><p>${escHtml(pg.desc)}</p><p><a href="${BASE}/">Back to homepage</a></p></article>`;
    const html = renderPage(pg.route, pg.title, pg.desc, ssr, null);
    writePage(pg.route, html);
    count++;
  }

  console.log(`Done: pre-rendered ${count} pages into dist/`);
}

main();
