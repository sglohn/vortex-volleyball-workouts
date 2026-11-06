-- FILE: supabase/migrations/2026-11-06_team_rank.sql
--
-- Team number within its age group (1 = the age group's top team, 2 = the
-- next, ...), from the USAV team code (G14VRTEX1SO = 14s team 1). Used on
-- Coach → Comparisons → Groups. Set on Coach → Teams → Edit. Null = not set.
-- Run in BOTH Supabase projects before merging. Safe to re-run.

alter table public.teams
  add column if not exists club_rank smallint;

alter table public.teams
  drop constraint if exists teams_club_rank_check;

alter table public.teams
  add constraint teams_club_rank_check check (club_rank is null or club_rank between 1 and 9);

notify pgrst, 'reload schema';
