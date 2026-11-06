-- FILE: supabase/migrations/2026-11-06_team_level.sql
--
-- Team level (National / Regional / Local) for Coach → Comparisons → Groups.
-- Set on Coach → Teams → Edit. Null = not set yet.
-- Run in BOTH Supabase projects before merging. Safe to re-run.

alter table public.teams
  add column if not exists level text;

alter table public.teams
  drop constraint if exists teams_level_check;

alter table public.teams
  add constraint teams_level_check check (level is null or level in ('national', 'regional', 'local'));

notify pgrst, 'reload schema';
