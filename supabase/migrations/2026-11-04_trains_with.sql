-- FILE: supabase/migrations/2026-11-04_trains_with.sql
--
-- A player who comes in with another team (volleyball).
--
-- Some players can't make their own team's weight room night and come in
-- with another team instead. She stays on her own team: she signs in under
-- it, and her workouts, numbers, leaderboard team and attendance stay with
-- it. Set on Coach → Players → her page → Trains With.
--
--   players.trains_with_team_id  the team she comes in with. Empty = only her
--                                own team.
--
-- What it changes (lib/checkin.ts, lib/attendanceLoad.ts, /api/team,
-- /api/leaderboard):
--   - Sign-in: her own team's workout when it has one today, otherwise that
--     team's workout. The session stays on her own team and remembers the
--     workout (sessions.template_id).
--   - Attendance: her workout days are that team's days (counted on her own
--     team). Check-ins on her own team's nights show as Extra.
--   - Team Mode for that team lists her too, tagged with her own team.
--
-- Safe to run more than once. Run in BOTH Supabase projects (Vortex and
-- Bruisers Lacrosse), in the SQL Editor, BEFORE the app update is merged.

alter table public.players
  add column if not exists trains_with_team_id uuid references public.teams(id) on delete set null;
