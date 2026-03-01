#!/usr/bin/env node
/**
 * Pre-build script: fetch crashpad data from Supabase and write seed JSON files.
 * Run before `npm run build` to ensure seed data is fresh.
 * Supabase is the single source of truth.
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');

const SUPABASE_URL = 'https://wsjsuhvpgupalwgcjatp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjA3OTEsImV4cCI6MjA4NjEzNjc5MX0.kScYBMzBOA2VFiGJjJIGc51jfCfOBeUkNpq-zo3gyU4';

const GENERATED_COLS = ['id', 'created_at', 'updated_at', 'volume_l', 'landing_area_sqm', 'kg_per_area', 'kg_per_liter', 'eur_per_area', 'eur_per_liter'];

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
    if (!res.ok) throw new Error(`Supabase error: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    all = all.concat(rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

function stripGenerated(rows) {
  return rows.map(r => {
    const clean = {};
    for (const [k, v] of Object.entries(r)) {
      if (!GENERATED_COLS.includes(k)) clean[k] = v;
    }
    return clean;
  });
}

async function main() {
  console.log('Fetching crashpad data from Supabase...');
  const crashpads = await fetchAll('crashpads');
  console.log(`  \u2192 ${crashpads.length} crashpads fetched`);
  
  const cleaned = stripGenerated(crashpads);
  const json = JSON.stringify(cleaned, null, 2);
  
  // Write both seed files (they're the same content)
  writeFileSync(join(SRC, 'crashpad_seed_data.json'), json + '\n');
  writeFileSync(join(SRC, 'crashpads_seed_data.json'), json + '\n');
  console.log(`  \u2192 Wrote crashpad_seed_data.json (${(json.length/1024).toFixed(1)}KB)`);
  console.log(`  \u2192 Wrote crashpads_seed_data.json (${(json.length/1024).toFixed(1)}KB)`);
}

main().catch(e => {
  console.error('Seed generation failed:', e.message);
  console.log('Build will continue with existing seed files.');
});
