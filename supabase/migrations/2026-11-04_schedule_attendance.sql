-- FILE: supabase/migrations/2026-11-04_schedule_attendance.sql
--
-- Schedule days that don't count for attendance.
--
-- A coach sometimes puts a team on the schedule so one or two players can
-- come in for a make-up workout. Those days shouldn't show every other
-- player on the team as Missed. Coach → Schedule now has a
-- "Counts for attendance" switch on each day:
--
--   counts_for_attendance  true (default) = a normal team workout day.
--                          false = the workout still runs for anyone who
--                          checks in, but nobody is marked missing; a player
--                          who came shows it as an Extra day.
--
-- Safe to run more than once. Run in BOTH Supabase projects (Vortex and
-- Bruisers Lacrosse), in the SQL Editor, BEFORE the app update is merged.

alter table public.team_schedule
  add column if not exists counts_for_attendance boolean not null default true;
