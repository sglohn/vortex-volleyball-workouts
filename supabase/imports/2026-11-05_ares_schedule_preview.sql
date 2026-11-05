-- FILE: supabase/imports/2026-11-05_ares_schedule_preview.sql
--
-- CHANGES NOTHING. Run this first, then 2026-11-05_ares_schedule_fix.sql.
-- Vortex Supabase only.
--
-- 15 Ares has no weight room days in the app: the Oct 29 season plan import
-- skipped them. This shows what the fix will find and add.
-- Check:
--   1. "Team" shows exactly one row, the real 15 Ares.
--   2. "Workouts" shows all 7 Season workouts with an id (none blank).
--   3. "Days to add" lists 31 Thursdays, Nov 5 2026 - Jun 24 2027,
--      "already there" empty for all of them.

-- 1. Team
select id, name, age_group, is_active
from teams
where lower(name) like '%ares%';

-- 2. Workouts
select n.name as season_workout, wt.id, wt.is_active
from (values
  ('Season - Combine Day'), ('Season - Build A'), ('Season - Build B'),
  ('Season - Tournament Week'), ('Season - Recovery'),
  ('Season - Recovery + Speed Primer'), ('Season - Return to Strength')
) n(name)
left join workout_templates wt on wt.name = n.name;

-- 3. Days to add (from the season plan, Thursdays 7-8 PM)
with plan(d, workout, why) as (values
  ('2026-11-05'::date, 'Season - Combine Day', ''),
  ('2026-11-12', 'Season - Build A', ''),
  ('2026-11-19', 'Season - Build B', ''),
  ('2026-12-03', 'Season - Build A', ''),
  ('2026-12-10', 'Season - Build B', ''),
  ('2026-12-17', 'Season - Build A', ''),
  ('2027-01-07', 'Season - Tournament Week', 'SVT Southern Showdown in 2 day(s)'),
  ('2027-01-14', 'Season - Return to Strength', '4 day(s) after SVT Southern Showdown'),
  ('2027-01-21', 'Season - Build B', ''),
  ('2027-01-28', 'Season - Tournament Week', 'Nike Music City Championships in 1 day(s)'),
  ('2027-02-04', 'Season - Return to Strength', '4 day(s) after Nike Music City Championships'),
  ('2027-02-11', 'Season - Tournament Week', 'Presidents Day Invitational in 2 day(s)'),
  ('2027-02-18', 'Season - Return to Strength', '3 day(s) after Presidents Day Invitational'),
  ('2027-02-25', 'Season - Build A', ''),
  ('2027-03-04', 'Season - Tournament Week', 'UA Bluegrass in 1 day(s)'),
  ('2027-03-11', 'Season - Return to Strength', '4 day(s) after UA Bluegrass'),
  ('2027-03-18', 'Season - Tournament Week', 'Battleground in 2 day(s)'),
  ('2027-03-25', 'Season - Tournament Week', '4 day(s) after Battleground; Big South National Qualifier in 1 day(s)'),
  ('2027-04-01', 'Season - Return to Strength', '4 day(s) after Big South National Qualifier'),
  ('2027-04-08', 'Season - Tournament Week', 'JVA World Challenge in 1 day(s)'),
  ('2027-04-15', 'Season - Return to Strength', '4 day(s) after JVA World Challenge'),
  ('2027-04-22', 'Season - Tournament Week', 'Showdown in the Smokies in 2 day(s)'),
  ('2027-04-29', 'Season - Tournament Week', '4 day(s) after Showdown in the Smokies; SRVA Regionals in 2 day(s)'),
  ('2027-05-06', 'Season - Return to Strength', '4 day(s) after SRVA Regionals'),
  ('2027-05-13', 'Season - Build B', ''),
  ('2027-05-20', 'Season - Build A', ''),
  ('2027-05-27', 'Season - Tournament Week', 'JVA Summerfest in 2 day(s)'),
  ('2027-06-03', 'Season - Return to Strength', '3 day(s) after JVA Summerfest'),
  ('2027-06-10', 'Season - Build B', ''),
  ('2027-06-17', 'Season - Build A', ''),
  ('2027-06-24', 'Season - Build B', '')
)
select p.d as date, to_char(p.d, 'Dy') as day, p.workout, p.why,
       wt.id is not null as workout_found,
       existing.name as already_there
from plan p
left join workout_templates wt on wt.name = p.workout
left join lateral (
  select t2.name
  from team_schedule ts
  join teams t on t.id = ts.team_id
  left join workout_templates t2 on t2.id = ts.template_id
  where lower(t.name) like '%ares%' and ts.scheduled_date = p.d
) existing on true
order by p.d;

-- 4. Anything already on 15 Ares' schedule or phases this season
select 'schedule' as what, ts.scheduled_date as starts, null::date as ends, wt.name
from team_schedule ts join teams t on t.id = ts.team_id
left join workout_templates wt on wt.id = ts.template_id
where lower(t.name) like '%ares%' and ts.scheduled_date >= '2026-08-01'
union all
select 'phase', tp.starts_on, tp.ends_on, tp.name
from training_phases tp join teams t on t.id = tp.team_id
where lower(t.name) like '%ares%' and tp.ends_on >= '2026-08-01'
order by 2;
