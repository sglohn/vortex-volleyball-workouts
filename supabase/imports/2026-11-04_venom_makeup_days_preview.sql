-- FILE: supabase/imports/2026-11-04_venom_makeup_days_preview.sql
--
-- Changes nothing. Lists 18 Venom's scheduled days in October 2026 and who
-- checked in on each, so you can check these are the two make-up days
-- before running 2026-11-04_venom_makeup_days_fix.sql.
--
-- Vortex Supabase only. Run after 2026-11-04_schedule_attendance.sql.

select
  ts.scheduled_date,
  wt.name as workout,
  ts.counts_for_attendance,
  coalesce(string_agg(distinct p.name, ', '), '(nobody)') as checked_in
from team_schedule ts
join teams t on t.id = ts.team_id
left join workout_templates wt on wt.id = ts.template_id
left join player_teams pt on pt.team_id = t.id
left join players p on p.id = pt.player_id and p.coach_id is null
  and exists (
    select 1 from sessions s
    where s.player_id = p.id
      and (s.checked_in_at at time zone 'America/New_York')::date = ts.scheduled_date
  )
where t.name = '18 Venom'
  and ts.scheduled_date between '2026-10-01' and '2026-10-31'
group by ts.scheduled_date, wt.name, ts.counts_for_attendance
order by ts.scheduled_date;
