// Generate sitemap.xml for climbing-gear.com
// Run: node scripts/generate-sitemap.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://www.climbing-gear.com';
const TODAY = new Date().toISOString().split('T')[0];

// Priority levels
const PRIORITY = {
  home: '1.0',
  category: '0.9',
  product: '0.8',
  static: '0.7',
};

// Change frequency
const FREQ = {
  home: 'daily',
  category: 'daily',
  product: 'weekly',
  static: 'monthly',
};

function loadJSON(filename) {
  const filepath = path.join(__dirname, '..', 'src', filename);
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function generateSitemap() {
  const urls = [];

  // Homepage
  urls.push({ loc: BASE_URL, lastmod: TODAY, changefreq: FREQ.home, priority: PRIORITY.home });

  // Category list pages (plural)
  for (const cat of ['/shoes', '/ropes', '/crashpads', '/belays', '/quickdraws']) {
    urls.push({ loc: `${BASE_URL}${cat}`, lastmod: TODAY, changefreq: FREQ.category, priority: PRIORITY.category });
  }

  // Product detail pages — SINGULAR route prefix must match React Router
  // /shoe/:slug, /rope/:slug, /belay/:slug, /crashpad/:slug, /quickdraw/:slug
  const datasets = [
    { file: 'seed_data.json',         prefix: '/shoe' },
    { file: 'rope_seed_data.json',    prefix: '/rope' },
    { file: 'crashpad_seed_data.json', prefix: '/crashpad' },
    { file: 'belay_seed_data.json',   prefix: '/belay' },
    { file: 'quickdraw_seed_data.json', prefix: '/quickdraw' },
  ];

  let productCount = 0;
  for (const { file, prefix } of datasets) {
    let items = loadJSON(file);
    // Exclude static ropes from sitemap (hidden from frontend for now)
    if (prefix === '/rope') items = items.filter(r => r.rope_type !== 'static');
    for (const item of items) {
      urls.push({
        loc: `${BASE_URL}${prefix}/${item.slug}`,
        lastmod: TODAY,
        changefreq: FREQ.product,
        priority: PRIORITY.product,
      });
      productCount++;
    }
  }

  // Static pages
  for (const page of [
    '/find',
    '/insights',
    '/insights/climbing-shoe-guide',
    '/insights/inflatable-crashpads',
    '/insights/rope-cost-vs-safety',
    '/news',
    '/methodology',
    '/about',
    '/impressum',
    '/privacy',
    '/terms',
  ]) {
    urls.push({ loc: `${BASE_URL}${page}`, lastmod: TODAY, changefreq: FREQ.static, priority: PRIORITY.static });
  }

  // Generate XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const url of urls) {
    xml += '  <url>\n';
    xml += `    <loc>${url.loc}</loc>\n`;
    xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
    xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
    xml += `    <priority>${url.priority}</priority>\n`;
    xml += '  </url>\n';
  }
  xml += '</urlset>';

  const outputPath = path.join(__dirname, '..', 'public', 'sitemap.xml');
  fs.writeFileSync(outputPath, xml, 'utf8');

  console.log(`✓ Generated sitemap with ${urls.length} URLs`);
  console.log(`  Products: ${productCount}`);
  console.log(`  Location: public/sitemap.xml`);
}

generateSitemap();
