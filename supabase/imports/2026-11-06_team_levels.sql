-- FILE: supabase/imports/2026-11-06_team_levels.sql
--
-- VORTEX SUPABASE ONLY. Run after supabase/migrations/2026-11-06_team_level.sql.
-- Sets every app team's level from Steve's Nov 6 team list (17 Prime and
-- 18 Storm Boys confirmed Regional). The 12s aren't in the app.
-- Only touches the teams named here; safe to re-run. Undo: set level = null.

update public.teams t
set level = v.level
from (values
  ('13 Raptors',    'national'),
  ('13 Cyclone',    'regional'),
  ('13 Revival',    'local'),
  ('13 Bellatrix',  'local'),
  ('14 Intensity',  'national'),
  ('14 Alpha',      'national'),
  ('14 Fury',       'national'),
  ('14 Eclipse',    'regional'),
  ('14 Valor',      'local'),
  ('15 Ares',       'national'),
  ('15 Thunder',    'national'),
  ('15 Surge',      'national'),
  ('15 Valkyries',  'regional'),
  ('15 Attack',     'local'),
  ('16 Pallavolo',  'national'),
  ('16 Americana',  'national'),
  ('16 Legacy',     'regional'),
  ('17 Gladiators', 'national'),
  ('17 Hurricane',  'regional'),
  ('17 Prime',      'regional'),
  ('18 Venom',      'regional'),
  ('18 Nova',       'regional'),
  ('18 Storm Boys', 'regional'),
  ('18 Havoc Boys', 'regional')
) as v(name, level)
where t.name = v.name
  and t.is_active;

-- Check: every active team and its level (none should be null)
select name, age_group, level
from public.teams
where is_active and not is_open_gym
order by level nulls first, age_group, name;
