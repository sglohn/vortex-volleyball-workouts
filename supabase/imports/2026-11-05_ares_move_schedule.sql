-- FILE: supabase/imports/2026-11-05_ares_move_schedule.sql
--
-- 15 Ares' season weight room days (31 Thursdays, Combine Day Nov 5 first)
-- and its "Season plan - …" phases were loaded onto the turned-off team
-- "15 Ares (duplicate)" instead of the real "15 Ares" that has the players.
-- This moves them (and any week plans / coach links on the duplicate) to the
-- real team. The duplicate team itself is left alone, just emptier.
--
-- Vortex Supabase only. Safe to run again (second run moves nothing).
-- Undo: swap the two ids below and run again.

do $$
declare
  v_real constant uuid := '43b7fdca-2810-4797-be5b-5dd0698c8051';  -- 15 Ares
  v_dup  constant uuid := '275e13e7-a4c3-4bc3-a002-b07892fac641';  -- 15 Ares (duplicate)
begin
  if (select name from teams where id = v_real) is distinct from '15 Ares'
     or (select name from teams where id = v_dup) is distinct from '15 Ares (duplicate)' then
    raise exception 'Team ids do not match 15 Ares / 15 Ares (duplicate). Nothing changed.';
  end if;

  -- Schedule days (skip any date the real team already has)
  update team_schedule ts set team_id = v_real
  where ts.team_id = v_dup
    and not exists (select 1 from team_schedule r
                    where r.team_id = v_real and r.scheduled_date = ts.scheduled_date);

  -- Phases
  update training_phases set team_id = v_real where team_id = v_dup;

  -- Week plans, if any (skip weeks the real team already has)
  update week_plans wp set team_id = v_real
  where wp.team_id = v_dup
    and not exists (select 1 from week_plans r
                    where r.team_id = v_real and r.week_start = wp.week_start);

  -- Coach links: any coach on the duplicate is also put on the real team
  insert into coach_teams (coach_id, team_id)
  select ct.coach_id, v_real from coach_teams ct where ct.team_id = v_dup
  on conflict do nothing;
end $$;

-- Check: real 15 Ares should show 31 days from 2026-11-05; duplicate 0
select t.name,
       (select count(*) from team_schedule ts where ts.team_id = t.id and ts.scheduled_date >= '2026-08-01') as schedule_days,
       (select min(ts.scheduled_date) from team_schedule ts where ts.team_id = t.id and ts.scheduled_date >= '2026-08-01') as first_day,
       (select count(*) from training_phases tp where tp.team_id = t.id) as phases,
       (select string_agg(c.name, ', ') from coach_teams ct join coaches c on c.id = ct.coach_id where ct.team_id = t.id) as coaches
from teams t
where t.id in ('43b7fdca-2810-4797-be5b-5dd0698c8051', '275e13e7-a4c3-4bc3-a002-b07892fac641');
