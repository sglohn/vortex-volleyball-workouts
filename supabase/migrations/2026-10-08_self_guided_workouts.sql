-- FILE: supabase/migrations/2026-10-08_self_guided_workouts.sql
--
-- Self-guided players (former players, coaches) who aren't on a team.
-- When a self-guided player checks in, the app builds a fresh four-block
-- workout (A Quad, B Hamstring, C Push, D Pull — each a main lift plus a
-- secondary exercise) and saves it on that session. See lib/fullBodyWorkout.ts.
--
--   players.self_guided               switch on the coach's player page
--   sessions.generated_workout        the workout built for that session (JSON);
--                                     null for normal team/template sessions
--   exercise_library.self_guided_roles which spots an exercise can fill, set on
--                                     the Exercise Library page, e.g.
--                                     {quad_main, push_secondary, hamstring_easier}
--
-- Safe to run more than once. Run in the Supabase SQL Editor BEFORE
-- putting the new app files in place.

alter table public.players
  add column if not exists self_guided boolean default false not null;

alter table public.sessions
  add column if not exists generated_workout jsonb;

alter table public.exercise_library
  add column if not exists self_guided_roles text[] default '{}'::text[] not null;

-- Looking up a player's recent generated workouts (for variety)
create index if not exists idx_sessions_player_generated
  on public.sessions (player_id, checked_in_at desc)
  where generated_workout is not null;
