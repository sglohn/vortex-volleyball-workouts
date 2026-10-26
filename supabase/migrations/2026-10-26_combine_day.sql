-- FILE: supabase/migrations/2026-10-26_combine_day.sql
--
-- Combine Day (lib/combine.ts).
--
-- A workout template can be marked as a Combine Day. When a team has one on
-- the schedule, players don't lift: their phone shows the Volleyball
-- Performance Index tests (height, wingspan, standing reach, block touch,
-- approach touch, acceleration, pro-agility, swing velocity) and they enter
-- their own numbers, in any order. The live combine leaderboard on the TVs
-- reads the same tries (lib/combineLeaderboard.ts, app/api/leaderboard).
--
--   workout_templates.is_combine       true = Combine Day
--   workout_templates.combine_metrics  which tests this combine includes
--                                      (null = all of them)
--   combine_attempts                   every try a player enters. Her best try
--                                      for each test is written to today's
--                                      measurements row, the same row a coach
--                                      edits on the player page, so the
--                                      athleticism score, Comparisons and the
--                                      player Profile pick it up as usual.
--
-- Bruisers Lacrosse never writes to any of these (measurements are
-- volleyball only, lib/features.ts); they just sit unused there.
--
-- Safe to run more than once. Run in BOTH Supabase projects (Vortex and
-- Bruisers Lacrosse), in the SQL Editor, BEFORE the app update is merged.

alter table public.workout_templates
  add column if not exists is_combine boolean default false not null;
alter table public.workout_templates
  add column if not exists combine_metrics text[];

create table if not exists public.combine_attempts (
  "id" uuid default gen_random_uuid() not null primary key,
  "session_id" uuid not null references public.sessions(id) on delete cascade,
  "player_id" uuid not null references public.players(id) on delete cascade,
  "metric" text not null,
  "value" numeric not null,
  "created_at" timestamp with time zone default now() not null,
  constraint combine_attempts_metric_check check (metric in (
    'height_in', 'wingspan_in', 'standing_reach_in', 'standing_vertical_in', 'approach_vertical_in',
    'acceleration_sec', 'pro_agility_sec', 'swing_velocity_mph'
  )),
  constraint combine_attempts_value_check check (value > 0)
);

create index if not exists idx_combine_attempts_session
  on public.combine_attempts (session_id, metric, created_at);

-- Same lock-down as every other table: the app reaches it only through its
-- server (service role), never straight from the browser.
alter table public.combine_attempts enable row level security;
