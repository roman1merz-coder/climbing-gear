-- ══════════════════════════════════════════════════════════
-- Petz event feedback table (2026-04-24 scanner demo event)
-- Run this in: Supabase Dashboard -> SQL Editor -> New query
-- Optional: the form also works without this table by writing
-- into the existing `feedback` table with type='petz-event'.
-- ══════════════════════════════════════════════════════════

create table if not exists petz_feedback (
  id            bigserial primary key,
  created_at    timestamptz default now(),
  scan_helpful  int,                -- 1-5 rating
  desired_features text,            -- free text
  try_at_petz   text,               -- Ja / Vielleicht / Nein / Kein Interesse
  pay_premium   text,               -- Ja / Vielleicht / Nein
  model_to_try  text,               -- free text (model name)
  general_comment text,             -- free text
  email         text,               -- optional
  user_agent    text,
  event_label   text default 'petz-neustadt-2026-04-24'
);

alter table petz_feedback enable row level security;

drop policy if exists "Anyone can insert petz_feedback" on petz_feedback;
create policy "Anyone can insert petz_feedback"
  on petz_feedback for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Service role can read petz_feedback" on petz_feedback;
create policy "Service role can read petz_feedback"
  on petz_feedback for select
  to service_role
  using (true);

create index if not exists idx_petz_feedback_created on petz_feedback (created_at desc);
