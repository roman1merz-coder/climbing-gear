-- 20260511_enable_rls_on_catalog.sql
--
-- Supabase's security advisor flags every public-schema table without
-- Row Level Security as `rls_disabled_in_public`. After the
-- 2026-05-07 migration we had RLS on foot_scan_fits, foot_scan_fits_archive,
-- feedback, and foot_scans, but every other table (catalog data, price
-- tables, historical price tables, reviews, brand sizing, fit cases)
-- was still unflagged: anon could read AND was implicitly trusted by
-- the absence of RLS. The advisor's complaint is that "no RLS"
-- removes the default-deny safety net even when GRANTs are correct.
--
-- This migration:
--   1. Enables RLS on every catalog/price/history table.
--   2. Adds an explicit SELECT-for-anon policy so the website keeps
--      reading these tables exactly as before.
--   3. Leaves no INSERT/UPDATE/DELETE policy for anon, so RLS denies
--      all writes by default.
--   4. Adds a service-role bypass policy (cosmetic - service_role
--      bypasses RLS automatically - but explicit policy makes the
--      intent obvious to a future reader).
--
-- After this, the advisor's `rls_disabled_in_public` warning should
-- clear on the next scan. Crawlers continue to write because they
-- authenticate as service-role.
--
-- Apply via Supabase dashboard SQL editor.

BEGIN;

-- Helper: lock down one table with a SELECT-for-anon policy and a
-- service-role-full policy. Catalogue/price tables only - never call
-- this for PII tables (those were locked down 2026-05-07 with stricter
-- column-level grants).

DO $$
DECLARE
  tbl TEXT;
  catalog_tables TEXT[] := ARRAY[
    -- product catalogues
    'shoes', 'ropes', 'belay_devices', 'crashpads', 'quickdraws',
    -- current price tables
    'shoe_prices', 'rope_prices', 'belay_prices', 'crashpad_prices',
    'quickdraw_prices', 'helmet_prices', 'harness_prices', 'jacket_prices',
    -- legacy unified price table
    'prices',
    -- price history tables
    'price_history', 'rope_price_history', 'crashpad_price_history',
    'quickdraw_price_history', 'belay_price_history',
    'helmet_price_history', 'harness_price_history', 'jacket_price_history',
    -- shoe-specific reference data
    'brand_sizing', 'fit_cases', 'shoe_reviews'
  ];
BEGIN
  FOREACH tbl IN ARRAY catalog_tables LOOP
    -- Skip tables that don't exist (e.g. legacy renames).
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' AND c.relname = tbl AND c.relkind = 'r'
    ) THEN
      RAISE NOTICE 'Skipping %: table not found', tbl;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- Drop any pre-existing policies of these names so the migration
    -- is idempotent.
    EXECUTE format('DROP POLICY IF EXISTS "anon select" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "service role full" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Enable read access for all users" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Enable insert for anon" ON public.%I', tbl);

    -- Public read, regardless of column-level grants.
    EXECUTE format(
      'CREATE POLICY "anon select" ON public.%I AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true)',
      tbl
    );

    -- Service-role gets full access. (It bypasses RLS anyway, but
    -- explicit is friendlier to read.)
    EXECUTE format(
      'CREATE POLICY "service role full" ON public.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;

COMMIT;

-- ─── Verification (run as anon role) ─────────────────────────────
-- All of these should return 200 / data (catalog/price reads still
-- work after RLS is enabled):
--
--   SELECT count(*) FROM shoes;
--   SELECT count(*) FROM shoe_prices;
--   SELECT count(*) FROM brand_sizing;
--
-- All of these should return permission denied (anon writes blocked
-- by absence of INSERT/UPDATE/DELETE policy):
--
--   INSERT INTO shoe_prices (shoe_slug, retailer, price_eur)
--     VALUES ('fake', 'fake', 1.0);
--   DELETE FROM shoes WHERE slug = 'la-sportiva-skwama';
--
-- The PII tables locked down on 2026-05-07 are unaffected by this
-- migration:
--
--   SELECT email FROM foot_scan_fits LIMIT 1;       -- still 401
--   SELECT * FROM feedback LIMIT 1;                 -- still 401
