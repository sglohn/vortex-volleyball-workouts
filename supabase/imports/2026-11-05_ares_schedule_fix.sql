-- FILE: supabase/imports/2026-11-05_ares_schedule_fix.sql
--
-- Puts 15 Ares' 2026-27 weight room days into the app (Thursdays 7-8 PM),
-- following the season plan (claude/vortex-season-workout-plan-2026-27.md).
-- The Oct 29 season plan import skipped this team.
--
-- Run 2026-11-05_ares_schedule_preview.sql first. Vortex Supabase only.
-- Safe to run again: days already on the schedule with a workout are left
-- alone, and phases are only added where 15 Ares has none starting that day.
--
-- What it adds:
--   * 31 team_schedule days, Nov 5 2026 (Combine Day, tonight) - Jun 24 2027,
--     all counting for attendance.
--   * training_phases so weight suggestions match the workout: Build A/B ->
--     Build, Tournament Week -> Pre-Tournament. Each phase runs from that
--     Thursday to the Wednesday before the next one. Combine Day and Return to
--     Strength use the default (General), so they get no phase.
--
-- The app schedules by date only; the 7-8 PM time isn't stored anywhere.
--
-- Undo (only rows this script added are tagged 'ares-fix-2026-11-05'):
--   delete from team_schedule where notes like '%[ares-fix-2026-11-05]%';
--   delete from training_phases where description like '%[ares-fix-2026-11-05]%';

do $$
declare
  v_team uuid;
  v_teams int;
  v_missing text;
begin
  select count(*) into v_teams from teams where lower(name) like '%ares%';
  if v_teams <> 1 then
    raise exception 'Expected exactly one team named like "Ares", found %. Nothing changed.', v_teams;
  end if;
  select id into v_team from teams where lower(name) like '%ares%';

  create temp table ares_plan(d date, workout text, why text) on commit drop;
  insert into ares_plan values
    ('2026-11-05', 'Season - Combine Day', ''),
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
    ('2027-06-24', 'Season - Build B', '');

  select string_agg(distinct p.workout, ', ') into v_missing
  from ares_plan p
  where not exists (select 1 from workout_templates wt where wt.name = p.workout);
  if v_missing is not null then
    raise exception 'Workouts not found: %. Nothing changed.', v_missing;
  end if;

  -- Schedule days (fill a day that exists with no workout; leave others alone)
  insert into team_schedule (team_id, template_id, scheduled_date, notes)
  select v_team,
         (select wt.id from workout_templates wt where wt.name = p.workout
          order by wt.is_active desc, wt.created_at desc limit 1),
         p.d,
         trim(both ' ' from coalesce(nullif(p.why, ''), '') || ' [ares-fix-2026-11-05]')
  from ares_plan p
  on conflict (team_id, scheduled_date) do update
    set template_id = excluded.template_id,
        notes = excluded.notes
    where team_schedule.template_id is null;

  -- Phases: Build / Pre-Tournament / Recovery, each until the next workout day
  insert into training_phases (team_id, phase_type, name, description, starts_on, ends_on)
  select v_team, x.phase_type, x.phase_name,
         x.workout || coalesce(': ' || nullif(x.why, ''), '') || ' [ares-fix-2026-11-05]',
         x.d,
         coalesce(x.next_d - 1, '2027-07-31'::date)
  from (
    select p.*,
           lead(p.d) over (order by p.d) as next_d,
           case
             when p.workout in ('Season - Build A', 'Season - Build B') then 'build'
             when p.workout = 'Season - Tournament Week' then 'pre_tournament'
             when p.workout in ('Season - Recovery', 'Season - Recovery + Speed Primer') then 'recovery'
           end as phase_type,
           case
             when p.workout in ('Season - Build A', 'Season - Build B') then 'Build'
             when p.workout = 'Season - Tournament Week' then 'Pre-Tournament'
             when p.workout in ('Season - Recovery', 'Season - Recovery + Speed Primer') then 'Recovery'
           end as phase_name
    from ares_plan p
  ) x
  where x.phase_type is not null
    and not exists (
      select 1 from training_phases tp
      where tp.team_id = v_team and tp.starts_on = x.d
    );
end $$;

-- Check: 31 days, Combine Day tonight first
select ts.scheduled_date, to_char(ts.scheduled_date, 'Dy') as day, wt.name as workout,
       ts.counts_for_attendance, tp.name as phase
from team_schedule ts
join teams t on t.id = ts.team_id
left join workout_templates wt on wt.id = ts.template_id
left join training_phases tp on tp.team_id = t.id
  and ts.scheduled_date between tp.starts_on and tp.ends_on
where lower(t.name) like '%ares%' and ts.scheduled_date >= '2026-11-01'
order by ts.scheduled_date;
