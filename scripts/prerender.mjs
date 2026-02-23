/**
 * Pre-render static HTML for every route at build time.
 *
 * Reads the Vite-built dist/index.html as a template, then for each route:
 *  - Injects a unique <title> and <meta description>
 *  - Adds JSON-LD structured data (Product schema)
 *  - Adds a <noscript> block with basic visible content for crawlers
 *  - Writes to dist/{route}/index.html
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
const BASE = 'https://climbing-gear.com';

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

/** Generate an HTML page from the template with custom meta + content */
function renderPage(routePath, title, description, noscriptContent, jsonLd) {
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

  // Inject JSON-LD + noscript content before </body>
  const inject = [
    jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : '',
    noscriptContent ? `<noscript><div style="padding:40px;font-family:sans-serif;max-width:800px;margin:0 auto">${noscriptContent}</div></noscript>` : '',
  ].filter(Boolean).join('\n');

  html = html.replace('</body>', `${inject}\n</body>`);

  return html;
}

function writePage(routePath, html) {
  const dir = path.join(DIST, routePath.replace(/^\//, ''));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
}

// ─── Shoe pages ──────────────────────────────────────────────
function shoeTitle(s) { return `${s.model || s.slug} — Specs, Scores & Prices`; }
function shoeDesc(s) {
  const parts = [`${s.model || s.slug} by ${s.brand}`];
  if (s.feel) parts.push(`${cap(s.feel)} feel`);
  if (s.closure) parts.push(`${cap(s.closure)} closure`);
  if (s.rubber_type) parts.push(`${s.rubber_type} rubber`);
  parts.push('Compare specs, performance scores, and prices across retailers.');
  return parts.join('. ');
}
function shoeNoscript(s) {
  let h = `<h1>${escHtml(s.model || s.slug)}</h1>`;
  h += `<p><strong>Brand:</strong> ${escHtml(s.brand)}</p>`;
  if (s.feel) h += `<p><strong>Feel:</strong> ${escHtml(cap(s.feel))}</p>`;
  if (s.closure) h += `<p><strong>Closure:</strong> ${escHtml(cap(s.closure))}</p>`;
  if (s.downturn) h += `<p><strong>Downturn:</strong> ${escHtml(cap(s.downturn))}</p>`;
  if (s.asymmetry) h += `<p><strong>Asymmetry:</strong> ${escHtml(cap(s.asymmetry))}</p>`;
  if (s.rubber_type) h += `<p><strong>Rubber:</strong> ${escHtml(s.rubber_type)}</p>`;
  if (s.weight_g) h += `<p><strong>Weight:</strong> ${s.weight_g}g</p>`;
  h += `<p><a href="${BASE}/shoes">← All climbing shoes</a></p>`;
  return h;
}
function shoeJsonLd(s) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: s.model || s.slug,
    brand: { '@type': 'Brand', name: s.brand },
    category: 'Climbing Shoes',
    url: `${BASE}/shoe/${s.slug}`,
    ...(s.image_url ? { image: s.image_url.startsWith('http') ? s.image_url : `${BASE}${s.image_url || `/images/shoes/${s.slug}.jpg`}` } : { image: `${BASE}/images/shoes/${s.slug}.jpg` }),
  };
}

// ─── Rope pages ──────────────────────────────────────────────
function ropeTitle(r) { return `${r.model || r.slug} — Rope Specs & Prices`; }
function ropeDesc(r) {
  const parts = [`${r.model || r.slug} by ${r.brand}`];
  if (r.diameter_mm) parts.push(`${r.diameter_mm}mm`);
  if (r.type) parts.push(cap(r.type));
  if (r.weight_g_per_m) parts.push(`${r.weight_g_per_m}g/m`);
  parts.push('Compare specs and prices.');
  return parts.join('. ');
}
function ropeNoscript(r) {
  let h = `<h1>${escHtml(r.model || r.slug)}</h1>`;
  h += `<p><strong>Brand:</strong> ${escHtml(r.brand)}</p>`;
  if (r.diameter_mm) h += `<p><strong>Diameter:</strong> ${r.diameter_mm}mm</p>`;
  if (r.type) h += `<p><strong>Type:</strong> ${escHtml(cap(r.type))}</p>`;
  if (r.uiaa_falls) h += `<p><strong>UIAA Falls:</strong> ${r.uiaa_falls}</p>`;
  if (r.weight_g_per_m) h += `<p><strong>Weight:</strong> ${r.weight_g_per_m}g/m</p>`;
  h += `<p><a href="${BASE}/ropes">← All ropes</a></p>`;
  return h;
}

// ─── Crashpad pages ──────────────────────────────────────────
function padTitle(p) { return `${p.model || p.slug} — Crashpad Specs & Prices`; }
function padDesc(p) {
  const parts = [`${p.model || p.slug} by ${p.brand}`];
  if (p.length_cm && p.width_cm) parts.push(`${p.length_cm}×${p.width_cm}cm`);
  if (p.thickness_cm) parts.push(`${p.thickness_cm}cm thick`);
  if (p.weight_kg) parts.push(`${p.weight_kg}kg`);
  parts.push('Compare specs and prices.');
  return parts.join('. ');
}
function padNoscript(p) {
  let h = `<h1>${escHtml(p.model || p.slug)}</h1>`;
  h += `<p><strong>Brand:</strong> ${escHtml(p.brand)}</p>`;
  if (p.length_cm && p.width_cm) h += `<p><strong>Size:</strong> ${p.length_cm}×${p.width_cm}cm</p>`;
  if (p.thickness_cm) h += `<p><strong>Thickness:</strong> ${p.thickness_cm}cm</p>`;
  if (p.weight_kg) h += `<p><strong>Weight:</strong> ${p.weight_kg}kg</p>`;
  h += `<p><a href="${BASE}/crashpads">← All crashpads</a></p>`;
  return h;
}

// ─── Belay pages ─────────────────────────────────────────────
function belayTitle(b) { return `${b.model || b.slug} — Belay Device Specs & Prices`; }
function belayDesc(b) {
  const parts = [`${b.model || b.slug} by ${b.brand}`];
  if (b.type) parts.push(cap(b.type));
  if (b.weight_g) parts.push(`${b.weight_g}g`);
  parts.push('Compare specs and prices.');
  return parts.join('. ');
}
function belayNoscript(b) {
  let h = `<h1>${escHtml(b.model || b.slug)}</h1>`;
  h += `<p><strong>Brand:</strong> ${escHtml(b.brand)}</p>`;
  if (b.type) h += `<p><strong>Type:</strong> ${escHtml(cap(b.type))}</p>`;
  if (b.weight_g) h += `<p><strong>Weight:</strong> ${b.weight_g}g</p>`;
  h += `<p><a href="${BASE}/belays">← All belay devices</a></p>`;
  return h;
}

// ─── Quickdraw pages ─────────────────────────────────────────
function qdTitle(q) { return `${q.model || q.slug} — Quickdraw Specs`; }
function qdDesc(q) {
  const parts = [`${q.model || q.slug} by ${q.brand}`];
  if (q.length_cm) parts.push(`${q.length_cm}cm`);
  if (q.weight_g) parts.push(`${q.weight_g}g`);
  parts.push('Compare specs and prices.');
  return parts.join('. ');
}
function qdNoscript(q) {
  let h = `<h1>${escHtml(q.model || q.slug)}</h1>`;
  h += `<p><strong>Brand:</strong> ${escHtml(q.brand)}</p>`;
  if (q.length_cm) h += `<p><strong>Length:</strong> ${q.length_cm}cm</p>`;
  if (q.weight_g) h += `<p><strong>Weight:</strong> ${q.weight_g}g</p>`;
  h += `<p><a href="${BASE}/quickdraws">← All quickdraws</a></p>`;
  return h;
}

// ─── Category list pages ─────────────────────────────────────
const CATEGORIES = [
  { route: '/shoes', title: 'Climbing Shoes — Compare 750+ Models', desc: 'Find the perfect climbing shoe. Compare specs, performance scores, and prices across 750+ models from La Sportiva, Scarpa, Evolv, and more.' },
  { route: '/ropes', title: 'Climbing Ropes — Compare 190+ Models', desc: 'Compare dynamic, static, half, and twin ropes. Filter by diameter, weight, falls rated, and dry treatment.' },
  { route: '/crashpads', title: 'Crashpads — Compare 110+ Models', desc: 'Compare bouldering crashpads by size, thickness, weight, foam type, and price.' },
  { route: '/belays', title: 'Belay Devices — Compare 50+ Models', desc: 'Compare belay devices: assisted-braking, tube, and guide. Filter by weight, rope range, and safety features.' },
  { route: '/quickdraws', title: 'Quickdraws — Compare 40+ Models', desc: 'Compare quickdraws by weight, length, gate type, and price.' },
];

// ─── Static pages ────────────────────────────────────────────
const STATIC = [
  { route: '/find', title: 'Climbing Shoe Finder — Find Your Perfect Shoe', desc: 'Answer a few questions and get personalized climbing shoe recommendations based on 750+ shoes and our scoring algorithms.' },
  { route: '/insights', title: 'Climbing Gear Insights — Data-Driven Articles', desc: 'Data-driven articles and guides about climbing gear: shoe selection, crashpad analysis, rope safety, and more.' },
  { route: '/insights/climbing-shoe-guide', title: 'How to Choose Climbing Shoes: Data-Driven Guide', desc: 'A comprehensive guide to choosing climbing shoes, backed by data from 750+ models. Learn what specs actually matter.' },
  { route: '/insights/inflatable-crashpads', title: 'Inflatable Crashpads: Are They Worth It?', desc: 'Data analysis of inflatable vs traditional crashpads. Compare weight, packability, protection, and value.' },
  { route: '/insights/rope-cost-vs-safety', title: 'Rope Cost vs Safety: What the Data Says', desc: 'Analyzing whether expensive climbing ropes are actually safer. Data from 190+ ropes compared.' },
  { route: '/news', title: 'Gear News — Latest Climbing Equipment Updates', desc: 'Latest climbing gear news: new product releases, industry trends, and equipment updates.' },
  { route: '/methodology', title: 'Methodology — How We Score Climbing Gear', desc: 'Our 10-axis performance model, data sources, and scoring algorithms explained.' },
  { route: '/about', title: 'About climbing-gear.com', desc: 'Our mission: help climbers find the right gear through data, not marketing.' },
  { route: '/impressum', title: 'Impressum', desc: 'Legal notice and contact information for climbing-gear.com.' },
  { route: '/privacy', title: 'Privacy Policy', desc: 'How climbing-gear.com handles your data.' },
  { route: '/terms', title: 'Terms of Service', desc: 'Terms and conditions for using climbing-gear.com.' },
];

// ─── Main ────────────────────────────────────────────────────
function main() {
  let count = 0;

  // Product detail pages
  const datasets = [
    { file: 'seed_data.json', prefix: '/shoe', titleFn: shoeTitle, descFn: shoeDesc, noscriptFn: shoeNoscript, jsonLdFn: shoeJsonLd },
    { file: 'rope_seed_data.json', prefix: '/rope', titleFn: ropeTitle, descFn: ropeDesc, noscriptFn: ropeNoscript, jsonLdFn: null },
    { file: 'crashpad_seed_data.json', prefix: '/crashpad', titleFn: padTitle, descFn: padDesc, noscriptFn: padNoscript, jsonLdFn: null },
    { file: 'belay_seed_data.json', prefix: '/belay', titleFn: belayTitle, descFn: belayDesc, noscriptFn: belayNoscript, jsonLdFn: null },
    { file: 'quickdraw_seed_data.json', prefix: '/quickdraw', titleFn: qdTitle, descFn: qdDesc, noscriptFn: qdNoscript, jsonLdFn: null },
  ];

  for (const { file, prefix, titleFn, descFn, noscriptFn, jsonLdFn } of datasets) {
    const items = loadJSON(file);
    for (const item of items) {
      const route = `${prefix}/${item.slug}`;
      const html = renderPage(route, titleFn(item), descFn(item), noscriptFn(item), jsonLdFn ? jsonLdFn(item) : null);
      writePage(route, html);
      count++;
    }
  }

  // Category pages
  for (const cat of CATEGORIES) {
    const html = renderPage(cat.route, cat.title, cat.desc, `<h1>${escHtml(cat.title)}</h1><p>${escHtml(cat.desc)}</p>`, null);
    writePage(cat.route, html);
    count++;
  }

  // Static pages
  for (const pg of STATIC) {
    const html = renderPage(pg.route, pg.title, pg.desc, `<h1>${escHtml(pg.title)}</h1><p>${escHtml(pg.desc)}</p>`, null);
    writePage(pg.route, html);
    count++;
  }

  console.log(`✓ Pre-rendered ${count} pages into dist/`);
}

main();
