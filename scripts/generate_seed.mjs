#!/usr/bin/env node
/**
 * Pre-build script: fetch product data from Supabase and write seed JSON files.
 * Runs automatically before `npm run build` via the `prebuild` script.
 * Supabase is the single source of truth for all product specs.
 *
 * For each product table we strip:
 *  - DB-internal columns (id, created_at)
 *  - Generated/computed columns (e.g. crashpad volume_l, shoes computed_stiffness)
 *
 * We KEEP `updated_at` so generate-sitemap.js can emit accurate <lastmod> values.
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');

const SUPABASE_URL = 'https://wsjsuhvpgupalwgcjatp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dG9yKzuhsr2DtSHIh9-cXg_DhZbfYkr';

// Always-stripped DB-internal columns
const ALWAYS_STRIP = ['id', 'created_at'];

// Per-table generated/computed columns to also strip.
// Anything front-end code or prerender doesn't read should be stripped to keep bundle small.
const TABLE_CONFIG = {
  shoes: {
    outFiles: ['seed_data.json'],
    extraStrip: [
      // computed_stiffness is a Postgres GENERATED column derived from
      // midsole/rand/rubber_thickness/closure/upper. Not consumed by the
      // front-end (verified via grep) so safe to drop from bundle.
      'computed_stiffness',
    ],
  },
  ropes: {
    outFiles: ['rope_seed_data.json', 'ropes_seed_data.json'],
    extraStrip: [],
  },
  belay_devices: {
    outFiles: ['belay_seed_data.json'],
    extraStrip: [],
  },
  crashpads: {
    outFiles: ['crashpad_seed_data.json', 'crashpads_seed_data.json'],
    extraStrip: [
      // computed at scoring time; front-end recomputes if needed
      'volume_l', 'landing_area_sqm',
      'kg_per_area', 'kg_per_liter',
      'eur_per_area', 'eur_per_liter',
    ],
  },
  quickdraws: {
    outFiles: ['quickdraw_seed_data.json'],
    extraStrip: [],
  },
};

async function fetchAll(table) {
  const PAGE = 1000;
  let all = [];
  let offset = 0;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?order=slug&offset=${offset}&limit=${PAGE}`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      }
    });
    if (!res.ok) throw new Error(`Supabase error fetching ${table}: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    all = all.concat(rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

function stripCols(rows, cols) {
  const set = new Set(cols);
  return rows.map(r => {
    const clean = {};
    for (const [k, v] of Object.entries(r)) {
      if (!set.has(k)) clean[k] = v;
    }
    return clean;
  });
}

async function generateForTable(table, cfg) {
  console.log(`\nFetching ${table} from Supabase...`);
  const rows = await fetchAll(table);
  console.log(`  \u2192 ${rows.length} rows fetched`);

  const cleaned = stripCols(rows, [...ALWAYS_STRIP, ...cfg.extraStrip]);
  const json = JSON.stringify(cleaned, null, 2);

  for (const file of cfg.outFiles) {
    writeFileSync(join(SRC, file), json + '\n');
    console.log(`  \u2192 Wrote ${file} (${(json.length / 1024).toFixed(1)} KB)`);
  }
  return rows.length;
}

async function main() {
  const start = Date.now();
  let total = 0;
  for (const [table, cfg] of Object.entries(TABLE_CONFIG)) {
    total += await generateForTable(table, cfg);
  }
  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\u2705 Seed generation complete: ${total} products across ${Object.keys(TABLE_CONFIG).length} tables in ${seconds}s`);
}

main().catch(e => {
  console.error('\u274C Seed generation failed:', e.message);
  console.error('Build will continue with existing seed files.');
  // Do NOT exit non-zero - we want the build to fall back to last-known-good seeds
  // rather than fail outright if Supabase is briefly unreachable.
});
