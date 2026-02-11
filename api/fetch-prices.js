// api/fetch-prices.js — Vercel Serverless Function (Cron)
// Fetches climbing shoe prices from Google Shopping via SerpApi
// and upserts them into Supabase.
//
// Env vars needed (set in Vercel dashboard):
//   SERPAPI_KEY         — from serpapi.com (free = 100 searches/mo)
//   SUPABASE_URL        — your Supabase project URL
//   SUPABASE_SERVICE_KEY — service_role key (NOT the anon key)
//
// Cron: configured in vercel.json to run daily at 04:00 UTC

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SERPAPI_KEY = process.env.SERPAPI_KEY;

// ── Supabase helpers ──
async function supabaseUpsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",  // upsert on unique constraint
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${table} upsert failed: ${res.status} ${err}`);
  }
  return res.json();
}

async function supabaseInsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${table} insert failed: ${res.status} ${err}`);
  }
}

// ── SerpApi Google Shopping search ──
async function searchGoogleShopping(query) {
  const params = new URLSearchParams({
    api_key: SERPAPI_KEY,
    engine: "google_shopping",
    q: query,
    gl: "de",       // Germany
    hl: "de",       // German language
    google_domain: "google.de",
    num: "20",      // up to 20 results
  });

  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SerpApi failed: ${res.status} ${err}`);
  }
  return res.json();
}

// ── Extract retailer prices from SerpApi response ──
function extractPrices(data, shoeSlug) {
  const results = data.shopping_results || [];
  const prices = [];
  const seen = new Set();

  for (const r of results) {
    const retailer = (r.source || "").trim();
    if (!retailer || seen.has(retailer.toLowerCase())) continue;
    seen.add(retailer.toLowerCase());

    // Only include results with a price
    const price = r.extracted_price;
    if (!price || price <= 0) continue;

    prices.push({
      shoe_slug: shoeSlug,
      retailer,
      price_eur: price,
      old_price_eur: r.extracted_old_price || null,
      currency: "EUR",
      product_url: r.link || r.product_link || null,
      thumbnail_url: r.thumbnail || null,
      in_stock: true,  // Google Shopping generally shows in-stock items
      delivery: r.delivery || null,
      source: "serpapi",
      fetched_at: new Date().toISOString(),
    });
  }

  return prices;
}

// ── Get shoe list from Supabase ──
async function getShoeList() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/shoes?select=slug,brand,model&order=slug`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  if (!res.ok) throw new Error("Failed to fetch shoe list");
  return res.json();
}

// ── Main handler ──
export default async function handler(req, res) {
  // Security: only allow GET and verify cron secret in production
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Optional: verify Vercel cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!SERPAPI_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Missing env vars" });
  }

  try {
    // Get all shoes
    const shoes = await getShoeList();

    // Optionally limit batch size (free tier = 100/month)
    // Use ?limit=N query param to control batch size
    const limit = parseInt(req.query.limit) || shoes.length;
    const offset = parseInt(req.query.offset) || 0;
    const batch = shoes.slice(offset, offset + limit);

    const stats = { searched: 0, prices_found: 0, errors: [] };

    for (const shoe of batch) {
      try {
        const query = `${shoe.brand} ${shoe.model} Kletterschuh kaufen`;
        const data = await searchGoogleShopping(query);
        const prices = extractPrices(data, shoe.slug);

        if (prices.length > 0) {
          // Upsert current prices
          await supabaseUpsert("prices", prices);

          // Append to price history (only the cheapest per shoe)
          const cheapest = prices.reduce((a, b) => a.price_eur < b.price_eur ? a : b);
          await supabaseInsert("price_history", [{
            shoe_slug: shoe.slug,
            retailer: cheapest.retailer,
            price_eur: cheapest.price_eur,
          }]);

          stats.prices_found += prices.length;
        }

        stats.searched++;

        // Rate limit: SerpApi allows ~1 req/sec on free tier
        await new Promise(r => setTimeout(r, 1200));
      } catch (err) {
        stats.errors.push({ slug: shoe.slug, error: err.message });
      }
    }

    return res.status(200).json({
      ok: true,
      batch: `${offset}–${offset + batch.length} of ${shoes.length}`,
      ...stats,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
