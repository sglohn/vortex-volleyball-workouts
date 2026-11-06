-- FILE: supabase/imports/2026-11-06_local_team_level.sql
--
-- VORTEX SUPABASE ONLY. Run after supabase/migrations/2026-11-06_team_level.sql.
-- Marks the four local teams (13 and over) as Local. National / Regional are
-- set by hand on Coach → Teams → Edit. Only touches these four teams; safe to
-- re-run. Undo: the same update with level = null.

update public.teams
set level = 'local'
where is_active
  and name in ('13 Revival', '13 Bellatrix', '14 Valor', '15 Attack');

-- Check: every active team and its level
select name, age_group, level
from public.teams
where is_active and not is_open_gym
order by age_group, name;
