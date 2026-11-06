-- FILE: supabase/imports/2026-11-06_team_ranks.sql
--
-- VORTEX SUPABASE ONLY. Run after supabase/migrations/2026-11-06_team_rank.sql.
-- Sets each team's number within its age group from the USAV team codes
-- (Nov 6 list: G13VRTEX1SO = 13s team 1, B18VRTEX1SO = boys 18s team 1).
-- The 12s aren't in the app. Only touches the teams named here; safe to
-- re-run. Undo: set club_rank = null.

update public.teams t
set club_rank = v.club_rank
from (values
  ('13 Raptors',    1),
  ('13 Cyclone',    2),
  ('13 Revival',    3),
  ('13 Bellatrix',  4),
  ('14 Intensity',  1),
  ('14 Alpha',      2),
  ('14 Fury',       3),
  ('14 Eclipse',    4),
  ('14 Valor',      5),
  ('15 Ares',       1),
  ('15 Thunder',    2),
  ('15 Surge',      3),
  ('15 Valkyries',  4),
  ('15 Attack',     5),
  ('16 Pallavolo',  1),
  ('16 Americana',  2),
  ('16 Legacy',     3),
  ('17 Gladiators', 1),
  ('17 Hurricane',  2),
  ('17 Prime',      3),
  ('18 Venom',      1),
  ('18 Nova',       2),
  ('18 Storm Boys', 1),
  ('18 Havoc Boys', 2)
) as v(name, club_rank)
where t.name = v.name
  and t.is_active;

-- Check: every active team, its level and its number (none should be null)
select name, age_group, level, club_rank
from public.teams
where is_active and not is_open_gym
order by age_group, club_rank nulls first, name;
