-- ══════════════════════════════════════════════════════════
-- Prices table — stores per-retailer prices for each shoe
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ══════════════════════════════════════════════════════════

create table if not exists prices (
  id            uuid default gen_random_uuid() primary key,
  shoe_slug     text not null,
  retailer      text not null,
  price_eur     numeric(8,2),
  old_price_eur numeric(8,2),
  currency      text default 'EUR',
  product_url   text,
  thumbnail_url text,
  in_stock      boolean default true,
  delivery      text,
  source        text default 'serpapi',   -- 'serpapi' | 'awin' | 'scraped'
  fetched_at    timestamptz default now(),

  -- One row per shoe+retailer; upsert on refresh
  unique (shoe_slug, retailer)
);

-- Index for fast lookups by shoe
create index if not exists idx_prices_slug on prices (shoe_slug);

-- Price history — append-only log for trend charts
create table if not exists price_history (
  id         uuid default gen_random_uuid() primary key,
  shoe_slug  text not null,
  retailer   text not null,
  price_eur  numeric(8,2) not null,
  recorded_at timestamptz default now()
);

create index if not exists idx_price_history_slug on price_history (shoe_slug, recorded_at);

-- ── RLS policies ──
-- Allow anon (frontend) to READ prices
alter table prices enable row level security;
create policy "Anyone can read prices"
  on prices for select using (true);

alter table price_history enable row level security;
create policy "Anyone can read price history"
  on price_history for select using (true);

-- Allow service_role to INSERT/UPDATE (used by the cron function)
-- service_role bypasses RLS by default, so no explicit policy needed.

-- ══════════════════════════════════════════════════════════
-- Done! After running this, add your SUPABASE_SERVICE_KEY
-- to Vercel environment variables so the cron function can
-- write to these tables.
-- ══════════════════════════════════════════════════════════
