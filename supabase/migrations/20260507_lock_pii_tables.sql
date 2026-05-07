-- 20260507_lock_pii_tables.sql
--
-- Audit on 2026-05-07 confirmed that the public anon key (shipped to every
-- visitor in src/supabase.js, scan-browse.html, etc.) could:
--   - SELECT all 349 rows of foot_scan_fits including the email column
--     (126 real user emails were retrievable in a single curl call)
--   - INSERT new rows
--   - UPDATE arbitrary rows (including overwriting other users' emails)
--   - DELETE arbitrary rows
--   - SELECT all rows of feedback, foot_scan_fits_archive, and the legacy
--     foot_scans table.
--
-- This migration locks all four tables down so the anon key can read only
-- non-PII columns of foot_scan_fits, and nothing from the others. Service-
-- role bypasses RLS so /api/scan/* and /api/admin/* keep working.
--
-- Apply via Supabase dashboard SQL editor.
-- Verification queries are at the bottom (run separately as anon to
-- confirm the lockdown took effect).

BEGIN;

-- ─── foot_scan_fits ──────────────────────────────────────────────
-- Anon needs SELECT on a single row by scan_id (results page) but never
-- on email/email_freq, and never INSERT/UPDATE/DELETE.
ALTER TABLE foot_scan_fits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full"  ON foot_scan_fits;
DROP POLICY IF EXISTS "anon select"        ON foot_scan_fits;
DROP POLICY IF EXISTS "anon insert"        ON foot_scan_fits;
DROP POLICY IF EXISTS "anon update"        ON foot_scan_fits;
DROP POLICY IF EXISTS "anon delete"        ON foot_scan_fits;
DROP POLICY IF EXISTS "Enable read access for all users" ON foot_scan_fits;
DROP POLICY IF EXISTS "Enable insert for anon"           ON foot_scan_fits;
DROP POLICY IF EXISTS "Enable update for anon"           ON foot_scan_fits;
DROP POLICY IF EXISTS "Enable delete for anon"           ON foot_scan_fits;

CREATE POLICY "service role full" ON foot_scan_fits
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "anon select" ON foot_scan_fits
  AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING (true);
-- No anon INSERT/UPDATE/DELETE policy = those operations are denied
-- by RLS (and by the GRANT revocation below as a second layer).

-- Column-level: anon may SELECT only non-PII columns. Postgres expands
-- `select=*` requests to the columns the role has SELECT privilege on,
-- so the SPA's existing `select=*` calls keep working but no longer
-- return email/email_freq.
REVOKE ALL ON foot_scan_fits FROM anon, authenticated;
GRANT SELECT (
  id, scan_id, created_at, generated_at, pipeline_started_at,
  sex, street_size_eu, shoes,
  next_shoe_preference, next_shoe_notes,
  toe_shape, toe_confidence, toe_delta_ratio,
  forefoot_width_ratio, forefoot_width_class,
  heel_width_ratio, heel_width_class,
  heel_depth_ratio, heel_depth_class,
  arch_length_ratio, arch_length_class,
  instep_height_ratio, instep_height_class,
  volume_class, hallux_valgus_class, hva_offset_ratio,
  confidence, notes,
  pipeline_stage, pipeline_error,
  recommendations, interpretation, landmarks, validation_results,
  browse_extended, status
) ON foot_scan_fits TO anon, authenticated;
-- email, email_freq, and any future PII columns are intentionally NOT
-- in the GRANT list. Anon attempts to read them return
-- "permission denied for column".

-- ─── foot_scan_fits_archive ──────────────────────────────────────
-- Service-role only. Admin reads via /api/admin/scans?op=archive.
ALTER TABLE foot_scan_fits_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full"               ON foot_scan_fits_archive;
DROP POLICY IF EXISTS "Enable read access for all users" ON foot_scan_fits_archive;
CREATE POLICY "service role full" ON foot_scan_fits_archive
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON foot_scan_fits_archive FROM anon, authenticated;

-- ─── feedback ────────────────────────────────────────────────────
-- /api/petz-feedback writes (service-role); /api/admin/feedback
-- reads/updates (service-role). Anon never touches this table directly.
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full"               ON feedback;
DROP POLICY IF EXISTS "Enable read access for all users" ON feedback;
DROP POLICY IF EXISTS "Enable insert for anon"           ON feedback;
CREATE POLICY "service role full" ON feedback
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON feedback FROM anon, authenticated;

-- ─── foot_scans (legacy, no longer populated) ────────────────────
-- Per CLAUDE-README this table is not written to anymore. Lock it
-- before someone mines it.
ALTER TABLE foot_scans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full"               ON foot_scans;
DROP POLICY IF EXISTS "Enable read access for all users" ON foot_scans;
CREATE POLICY "service role full" ON foot_scans
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON foot_scans FROM anon, authenticated;

COMMIT;

-- ─── Verification (run as anon role, not as the migration role) ──
-- Open Supabase dashboard -> SQL editor -> "Use role: anon" or test via
-- curl with the anon JWT. Each line below should produce the indicated
-- result.
--
--   SELECT email FROM foot_scan_fits LIMIT 1;
--     -> ERROR: permission denied for column email
--
--   SELECT scan_id, sex FROM foot_scan_fits LIMIT 1;
--     -> works, returns 1 row
--
--   INSERT INTO foot_scan_fits (scan_id) VALUES ('scan-2099-01-01T00-00-00');
--     -> ERROR: permission denied for table foot_scan_fits  (or 0 rows
--        affected on a row-level policy denial, depending on PostgREST
--        path; either is acceptable)
--
--   SELECT * FROM feedback LIMIT 1;
--     -> ERROR: permission denied for table feedback
--
--   SELECT * FROM foot_scan_fits_archive LIMIT 1;
--     -> ERROR: permission denied for table foot_scan_fits_archive
--
--   SELECT * FROM foot_scans LIMIT 1;
--     -> ERROR: permission denied for table foot_scans
--
-- And as service_role (e.g. via /api/admin/scans?op=list):
--   SELECT * FROM foot_scan_fits LIMIT 1;
--     -> works, returns full row including email/email_freq
