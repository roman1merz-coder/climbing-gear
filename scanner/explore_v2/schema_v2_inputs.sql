-- V2 scanner inputs: schema draft (sandbox only, NOT applied)
-- Locked decisions 2026-04-24:
--   * Column type:    TEXT + CHECK constraint (matches existing schema convention)
--   * Naming:         spelled-out (aggressiveness, environment, not agg/env)
--   * Nullability:    all four columns NULL-able
--   * Backfill:       NONE. Existing 272 rows stay NULL.
--                     They were scored under v1 logic that derived
--                     aggressiveness/stiffness from current-shoe inputs.
--                     Do not invent values for old rows.
--
-- Allowed enum values come from sandbox lookup tables in
--   scanner/explore_v2/combinations_top5.py
--
-- WHEN we eventually apply this:
--   * Wrap in BEGIN; ... COMMIT; for atomicity
--   * Take a backup snapshot of foot_scan_fits first
--   * Frontend (scan.html) and scan_worker.py must be updated in the
--     same release so new scans actually populate these fields

-- ───────────────────────────────────────────────────────────
-- 1. Discipline  (what the user climbs)
-- ───────────────────────────────────────────────────────────
ALTER TABLE foot_scan_fits
    ADD COLUMN discipline TEXT NULL
        CHECK (discipline IN (
            'boulder',
            'sport',
            'trad_multipitch'
        ));

-- ───────────────────────────────────────────────────────────
-- 2. Environment  (where they climb most)
-- ───────────────────────────────────────────────────────────
ALTER TABLE foot_scan_fits
    ADD COLUMN environment TEXT NULL
        CHECK (environment IN (
            'indoor',
            'outdoor',
            'both'
        ));

-- ───────────────────────────────────────────────────────────
-- 3. Rock type  (STRICT: only when environment = 'outdoor')
--    Frontend flow:
--      a) user picks discipline  (boulder | sport | trad_multipitch)
--      b) user picks environment (indoor | outdoor | both)
--      b.2) ONLY if environment = 'outdoor': user picks rock_type
--    "both" users do NOT get a rock_type field — they're treated as
--    indoor-dominant for v2 scoring.
--    Cross-field invariant is enforced in the DB (table-level CHECK)
--    so the frontend can never desync from the rule.
-- ───────────────────────────────────────────────────────────
ALTER TABLE foot_scan_fits
    ADD COLUMN rock_type TEXT NULL
        CHECK (rock_type IN (
            'granite',
            'limestone',
            'sandstone',
            'mixed'
        ));

ALTER TABLE foot_scan_fits
    ADD CONSTRAINT foot_scan_fits_rock_type_requires_outdoor
        CHECK (
            rock_type IS NULL
            OR environment = 'outdoor'
        );

-- ───────────────────────────────────────────────────────────
-- 4. Aggressiveness  (comfort .. aggressive ladder)
--    Drives baseline target_asym + target_dt in target_resolver v2.
-- ───────────────────────────────────────────────────────────
ALTER TABLE foot_scan_fits
    ADD COLUMN aggressiveness TEXT NULL
        CHECK (aggressiveness IN (
            'comfort',
            'balanced',
            'moderate',
            'aggressive'
        ));

-- ───────────────────────────────────────────────────────────
-- Verification queries (read-only, safe to run anytime)
-- ───────────────────────────────────────────────────────────
-- Confirm the columns landed:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'foot_scan_fits'
--     AND column_name IN ('discipline','environment','rock_type','aggressiveness');
--
-- Confirm CHECK constraints:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'foot_scan_fits'::regclass
--     AND contype = 'c'
--     AND conname ILIKE '%discipline%'
--      OR conname ILIKE '%environment%'
--      OR conname ILIKE '%rock_type%'
--      OR conname ILIKE '%aggressiveness%';
--
-- Distribution after rollout (should start at 100% NULL, then shift):
--   SELECT
--     COUNT(*) FILTER (WHERE discipline    IS NULL) AS null_disc,
--     COUNT(*) FILTER (WHERE environment   IS NULL) AS null_env,
--     COUNT(*) FILTER (WHERE rock_type     IS NULL) AS null_rock,
--     COUNT(*) FILTER (WHERE aggressiveness IS NULL) AS null_agg,
--     COUNT(*) AS total
--   FROM foot_scan_fits;
--
-- Cross-field invariant (must always return 0):
--   SELECT COUNT(*)
--   FROM foot_scan_fits
--   WHERE rock_type IS NOT NULL
--     AND (environment IS NULL OR environment <> 'outdoor');
