-- FILE: supabase/migrations/2026-10-30_health_watch.sql
--
-- Health Board → Watch tab (lib/healthPatterns.ts, lib/healthWatch.ts).
-- The patterns themselves are worked out from body checks, health reports
-- and workout ratings each time the tab opens; nothing new is stored for
-- them. This table only remembers which flags a coach has marked "Seen",
-- with an optional note on what was done.
--
--   key        which flag, e.g. player:<id>:recurring:r_knee, team:<id>:area:knee, club:rate
--   evidence   how big the pattern was when it was marked seen. The flag comes
--              back out of Seen when it gets bigger, or after 14 days.
--
-- Safe to run more than once. Run in BOTH Supabase projects (Vortex and
-- Bruisers Lacrosse), in the SQL Editor, BEFORE the app update is merged.

create table if not exists public.health_watch_seen (
  "id" uuid default gen_random_uuid() not null primary key,
  "key" text not null,
  "evidence" integer default 0 not null,
  "note" text,
  "coach_id" uuid references public.coaches(id) on delete set null,
  "coach_name" text,
  "seen_at" timestamp with time zone default now() not null
);

create index if not exists idx_health_watch_seen_key
  on public.health_watch_seen (key, seen_at desc);

create index if not exists idx_health_watch_seen_at
  on public.health_watch_seen (seen_at desc);

-- For the Watch tab's look-back queries
create index if not exists idx_body_checks_checked_at
  on public.body_checks (checked_at);

create index if not exists idx_sessions_checked_in_at
  on public.sessions (checked_in_at);

-- Same as every other table: no public access, the server uses the
-- service-role key.
alter table public.health_watch_seen enable row level security;
