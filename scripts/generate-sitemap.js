// Generate per-category sitemaps + sitemap index for climbing-gear.com
// Writes to BOTH dist/ (for current deploy) and public/ (for next build)
// Run AFTER vite build: node scripts/generate-sitemap.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://www.climbing-gear.com';
const TODAY = new Date().toISOString().split('T')[0];

function loadJSON(filename) {
  const filepath = path.join(__dirname, '..', 'src', filename);
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

function wrapUrlset(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>`;
}

function writeSitemap(filename, content) {
  // Write to dist/ (current deploy) and public/ (next build picks it up)
  const distPath = path.join(__dirname, '..', 'dist', filename);
  const publicPath = path.join(__dirname, '..', 'public', filename);
  fs.writeFileSync(distPath, content, 'utf8');
  fs.writeFileSync(publicPath, content, 'utf8');
}

function generateSitemaps() {
  const sitemapFiles = [];
  let totalUrls = 0;

  // 1. Core pages sitemap (homepage, categories, static pages)
  const coreEntries = [];
  coreEntries.push(urlEntry(BASE_URL, TODAY, 'daily', '1.0'));
  for (const cat of ['/shoes', '/ropes', '/crashpads', '/belays', '/quickdraws']) {
    coreEntries.push(urlEntry(`${BASE_URL}${cat}`, TODAY, 'daily', '0.9'));
  }
  for (const page of ['/find', '/scan']) {
    coreEntries.push(urlEntry(`${BASE_URL}${page}`, TODAY, 'weekly', '0.8'));
  }
  for (const page of [
    '/insights', '/insights/climbing-shoe-guide', '/insights/foot-scanner', '/insights/heel-fit',
    '/insights/inflatable-crashpads', '/insights/rope-cost-vs-safety', '/insights/scarpa-blackbird',
    '/news', '/methodology', '/about', '/feedback', '/impressum', '/privacy', '/terms',
  ]) {
    coreEntries.push(urlEntry(`${BASE_URL}${page}`, TODAY, 'monthly', '0.7'));
  }
  writeSitemap('sitemap-core.xml', wrapUrlset(coreEntries));
  sitemapFiles.push('sitemap-core.xml');
  totalUrls += coreEntries.length;

  // 2. Per-category product sitemaps
  const datasets = [
    { file: 'seed_data.json', prefix: '/shoe', name: 'shoes', key: 'shoes' },
    { file: 'rope_seed_data.json', prefix: '/rope', name: 'ropes' },
    { file: 'crashpad_seed_data.json', prefix: '/crashpad', name: 'crashpads' },
    { file: 'belay_seed_data.json', prefix: '/belay', name: 'belays' },
    { file: 'quickdraw_seed_data.json', prefix: '/quickdraw', name: 'quickdraws' },
  ];

  for (const { file, prefix, name, key } of datasets) {
    let items = loadJSON(file);
    // Some seed files wrap data in an object (e.g. { shoes: [...] })
    if (key && items[key]) items = items[key];
    if (!Array.isArray(items)) { console.warn(`Skipping ${file}: not an array`); continue; }
    // Exclude static ropes from sitemap (hidden from frontend)
    if (prefix === '/rope') items = items.filter(r => r.rope_type !== 'static');

    // Use per-product updated_at when present (YYYY-MM-DD); fall back to TODAY.
    // Accurate <lastmod> helps Google prioritize re-crawl of recently edited specs.
    const entries = items.map(item => {
      const updated = item.updated_at ? String(item.updated_at).split('T')[0] : TODAY;
      return urlEntry(`${BASE_URL}${prefix}/${item.slug}`, updated, 'weekly', '0.8');
    });

    const filename = `sitemap-${name}.xml`;
    writeSitemap(filename, wrapUrlset(entries));
    sitemapFiles.push(filename);
    totalUrls += entries.length;
  }

  // 3. Sitemap index
  let indexXml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  indexXml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const file of sitemapFiles) {
    indexXml += `  <sitemap>\n    <loc>${BASE_URL}/${file}</loc>\n    <lastmod>${TODAY}</lastmod>\n  </sitemap>\n`;
  }
  indexXml += '</sitemapindex>';

  writeSitemap('sitemap.xml', indexXml);

  console.log(`Done: generated sitemap index + ${sitemapFiles.length} sitemaps (${totalUrls} URLs total)`);
  console.log(`  Files: sitemap.xml, ${sitemapFiles.join(', ')}`);
}

generateSitemaps();
