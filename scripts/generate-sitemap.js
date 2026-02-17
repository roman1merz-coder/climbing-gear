// Generate sitemap.xml for climbing-gear.com
// Run: node scripts/generate-sitemap.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://climbing-gear.vercel.app';
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

  // Add homepage
  urls.push({
    loc: BASE_URL,
    lastmod: TODAY,
    changefreq: FREQ.home,
    priority: PRIORITY.home,
  });

  // Add category pages
  const categories = [
    { path: '/shoes', name: 'Climbing Shoes' },
    { path: '/ropes', name: 'Ropes' },
    { path: '/crashpads', name: 'Crash Pads' },
    { path: '/belays', name: 'Belay Devices' },
  ];

  categories.forEach(cat => {
    urls.push({
      loc: `${BASE_URL}${cat.path}`,
      lastmod: TODAY,
      changefreq: FREQ.category,
      priority: PRIORITY.category,
    });
  });

  // Add all product detail pages
  const shoes = loadJSON('seed_data.json');
  shoes.forEach(shoe => {
    urls.push({
      loc: `${BASE_URL}/shoes/${shoe.slug}`,
      lastmod: TODAY,
      changefreq: FREQ.product,
      priority: PRIORITY.product,
    });
  });

  const ropes = loadJSON('rope_seed_data.json');
  ropes.forEach(rope => {
    urls.push({
      loc: `${BASE_URL}/ropes/${rope.slug}`,
      lastmod: TODAY,
      changefreq: FREQ.product,
      priority: PRIORITY.product,
    });
  });

  const crashpads = loadJSON('crashpad_seed_data.json');
  crashpads.forEach(pad => {
    urls.push({
      loc: `${BASE_URL}/crashpads/${pad.slug}`,
      lastmod: TODAY,
      changefreq: FREQ.product,
      priority: PRIORITY.product,
    });
  });

  const belays = loadJSON('belay_seed_data.json');
  belays.forEach(belay => {
    urls.push({
      loc: `${BASE_URL}/belays/${belay.slug}`,
      lastmod: TODAY,
      changefreq: FREQ.product,
      priority: PRIORITY.product,
    });
  });

  // Add static pages
  const staticPages = [
    '/about',
    '/methodology',
    '/insights',
    '/gear-news',
    '/legal',
    '/wishlist',
  ];

  staticPages.forEach(page => {
    urls.push({
      loc: `${BASE_URL}${page}`,
      lastmod: TODAY,
      changefreq: FREQ.static,
      priority: PRIORITY.static,
    });
  });

  // Generate XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  urls.forEach(url => {
    xml += '  <url>\n';
    xml += `    <loc>${url.loc}</loc>\n`;
    xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
    xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
    xml += `    <priority>${url.priority}</priority>\n`;
    xml += '  </url>\n';
  });

  xml += '</urlset>';

  // Write to public folder
  const outputPath = path.join(__dirname, '..', 'public', 'sitemap.xml');
  fs.writeFileSync(outputPath, xml, 'utf8');

  console.log(`✓ Generated sitemap with ${urls.length} URLs`);
  console.log(`  Location: public/sitemap.xml`);
  console.log(`  Products: ${shoes.length} shoes, ${ropes.length} ropes, ${crashpads.length} crashpads, ${belays.length} belays`);
}

generateSitemap();
