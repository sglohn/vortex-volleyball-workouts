-- FILE: supabase/migrations/2026-10-08_self_guided_workouts.sql
--
-- Self-guided players (former players, coaches) who aren't on a team.
-- When a self-guided player checks in, the app builds a fresh full-body
-- workout (quads, hamstrings, hips, shoulders, core) from the exercise
-- library and saves it on that session.
--
--   players.self_guided        switch on the coach's player page
--   sessions.generated_workout the workout built for that session (JSON);
--                              null for normal team/template sessions
--
-- Safe to run more than once. Run in the Supabase SQL Editor.

alter table public.players
  add column if not exists self_guided boolean default false not null;

alter table public.sessions
  add column if not exists generated_workout jsonb;

-- Looking up a player's recent generated workouts (for variety)
create index if not exists idx_sessions_player_generated
  on public.sessions (player_id, checked_in_at desc)
  where generated_workout is not null;
