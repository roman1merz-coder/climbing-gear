/**
 * Convert hero-mountain.jpg to WebP at build time.
 * Uses sharp (already in dependencies).
 * Run AFTER vite build: node scripts/optimize-hero.mjs
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');

const src = path.join(DIST, 'images', 'hero-mountain.jpg');
const dest = path.join(DIST, 'images', 'hero-mountain.webp');

if (!fs.existsSync(src)) {
  console.log('hero-mountain.jpg not found in dist, skipping WebP conversion');
  process.exit(0);
}

const before = fs.statSync(src).size;
await sharp(src).webp({ quality: 75, effort: 6 }).toFile(dest);
const after = fs.statSync(dest).size;

console.log(`Hero image converted: JPG ${(before / 1024).toFixed(0)} KiB → WebP ${(after / 1024).toFixed(0)} KiB (saved ${((1 - after / before) * 100).toFixed(0)}%)`);
