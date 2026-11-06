-- FILE: supabase/migrations/2026-11-05_workout_credit.sql
--
-- Weight room credit: signing in isn't enough, she has to do the workout.
--
--   sessions.planned_sets          how many sets her workout asked for (her own
--                                  workout: team, modified, override, program or
--                                  self-guided, after skipped exercises), saved
--                                  each time the workout is opened. Combine Day:
--                                  how many tests. Attendance compares logged
--                                  sets (or tests done) with this.
--   health_reports.modified_template_id
--                                  a standing modified workout for an injured
--                                  player. While the report is open she gets it
--                                  on every one of her team's workout days
--                                  instead of the team workout (a date override
--                                  for that day still wins). Ends when the
--                                  report is cleared.
--   session_set_counts (view)      sets logged per session, so attendance can
--                                  count a whole season without loading
--                                  every set.
--   attendance_credit              an admin's decision on a workout day she
--                                  didn't fully finish: credit 0–100 (% of a
--                                  workout). No row = full credit when every
--                                  set is logged, otherwise her % done.
--
-- Safe to run more than once. Run in BOTH Supabase projects (Vortex and
-- Bruisers Lacrosse), in the SQL Editor, BEFORE the app update is merged.

alter table public.sessions
  add column if not exists planned_sets integer;

alter table public.health_reports
  add column if not exists modified_template_id uuid references public.workout_templates(id) on delete set null;

create table if not exists public.attendance_credit (
  "id" uuid default gen_random_uuid() not null primary key,
  "player_id" uuid not null references public.players(id) on delete cascade,
  "day" date not null,
  "credit" integer not null check (credit between 0 and 100),
  "note" text,
  "set_by" uuid references public.coaches(id) on delete set null,
  "set_by_name" text,
  "updated_at" timestamp with time zone default now() not null,
  unique (player_id, day)
);

create index if not exists idx_attendance_credit_player on public.attendance_credit (player_id, day);

-- Same as every other table: no public access, the server uses the
-- service-role key.
alter table public.attendance_credit enable row level security;

-- Sets logged per session (attendance reads this instead of every set)
create or replace view public.session_set_counts
with (security_invoker = true) as
select session_id, count(*) filter (where completed) as done
from public.set_logs
group by session_id;

revoke all on public.session_set_counts from anon, authenticated;
