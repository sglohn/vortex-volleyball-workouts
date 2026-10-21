-- FILE: supabase/migrations/2026-10-21_coach_workouts.sql
--
-- Coaches can join in on their team's workout.
--
-- After a team coach signs in (team → their "Coach …" name → PIN) they can
-- pick "Join today's workout" and do it on their phone just like a player.
-- Their sets are saved on their own workout profile:
--
--   players.coach_id   set on a coach's workout profile (one per coach),
--                      empty for every real player
--
-- The profile is made the first time the coach joins in. It's never on a
-- team roster, so it stays out of team lists, the Players page, player
-- search, comparisons and coach team scoping. The leaderboard / TV show the
-- coach with the team whose workout they joined. Coaches skip the body check.
--
-- Run once in BOTH Supabase projects (Vortex and Bruisers Lacrosse), in the
-- SQL Editor, BEFORE the app update is merged. Safe to run more than once.

alter table public.players
  add column if not exists coach_id uuid references public.coaches(id) on delete set null;

create unique index if not exists players_coach_id_key on public.players (coach_id) where coach_id is not null;
