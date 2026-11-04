-- FILE: supabase/imports/2026-11-03_bodycheck_dupes_fix.sql
--
-- Fixes body checks saved twice for the same workout and the health report
-- counts / descriptions they inflated. See
-- 2026-11-03_bodycheck_dupes_preview.sql for what it will change (run that
-- first). The app fix (one body check per workout, counted by day) is in the
-- matching PR, so this only needs running once. Safe to run again.
--
-- Run in the Vortex Supabase SQL Editor, all at once.
--
-- Backups (drop them once you're happy):
--   public.body_checks_backup_2026_11_03
--   public.health_reports_backup_2026_11_03
-- Undo:
--   delete from public.body_checks;
--   insert into public.body_checks select * from public.body_checks_backup_2026_11_03;
--   update public.health_reports r set report_count = b.report_count, report_type = b.report_type, description = b.description
--     from public.health_reports_backup_2026_11_03 b where b.id = r.id;

begin;

create table if not exists public.body_checks_backup_2026_11_03 as select * from public.body_checks;
create table if not exists public.health_reports_backup_2026_11_03 as select * from public.health_reports;

-- 1. Merge each workout's body checks into its newest one (every area kept,
--    "injured" beats "sore"), then delete the extra checks.
with ranked as (
  select id, session_id, row_number() over (partition by session_id order by checked_at desc, id) as rn
  from public.body_checks
  where session_id is not null
),
dupe_sessions as (
  select session_id from ranked group by session_id having count(*) > 1
),
areas as (
  -- Every area from every check of the workout; worst status per area
  select b.session_id, e.key,
         max(case e.value #>> '{}' when 'injured' then 2 when 'sore' then 1 else 0 end) as worst,
         max(e.value #>> '{}') as any_status
  from public.body_checks b
  join dupe_sessions d on d.session_id = b.session_id
  cross join lateral jsonb_each(b.regions) e
  group by b.session_id, e.key
),
merged as (
  select session_id,
         jsonb_object_agg(key, case worst when 2 then 'injured' when 1 then 'sore' else any_status end) as regions
  from areas
  group by session_id
)
update public.body_checks b
set regions = m.regions
from ranked r, merged m
where b.id = r.id and r.rn = 1 and m.session_id = r.session_id;

delete from public.body_checks b
using (
  select id, row_number() over (partition by session_id order by checked_at desc, id) as rn
  from public.body_checks where session_id is not null
) r
where b.id = r.id and r.rn > 1;

-- 2. Recount open player reports by DAY, and fix the "flagged N×" text and
--    any joint soreness wrongly upgraded to Nagging Pain.
with zone_of as (
  select r.id, r.player_id, r.reported_at, r.report_type, r.description,
    case when r.body_part = 'General (no area marked)' then 'general'
         else replace(regexp_replace(regexp_replace(lower(r.body_part), '^right ', 'r_'), '^left ', 'l_'), ' ', '_')
    end as zone
  from public.health_reports r
  where r.status in ('active', 'monitoring') and r.reported_by = 'player'
),
days as (
  select z.*,
    greatest(1, (select count(distinct (b.checked_at at time zone 'America/New_York')::date)
       from public.body_checks b
      where b.player_id = z.player_id
        and b.checked_at >= z.reported_at - interval '1 minute'
        and b.regions ->> z.zone in ('sore', 'injured'))) as real_count,
    (select count(distinct (b.checked_at at time zone 'America/New_York')::date)
       from public.body_checks b
      where b.player_id = z.player_id
        and b.checked_at >= now() - interval '30 days'
        and b.regions ->> z.zone in ('sore', 'injured')) as days_30
  from zone_of z
)
update public.health_reports r
set report_count = least(r.report_count, d.real_count),
    report_type = case
      when r.report_type = 'nagging_pain' and r.description like 'Recurring joint soreness%' and d.days_30 < 2 then 'soreness'
      else r.report_type end,
    description = case
      when r.description like 'Recurring joint soreness%' and d.days_30 < 2
        then 'Player reported soreness on pre-workout body check'
      when r.description like 'Recurring joint soreness%'
        then 'Recurring joint soreness — flagged on ' || d.days_30 || ' days in the last 30 days'
      when r.description ~ 'flagged [0-9]+×' and d.days_30 <= 1
        then 'Player reported soreness on pre-workout body check'
      when r.description ~ 'flagged [0-9]+×'
        then regexp_replace(r.description, 'flagged [0-9]+× in the last 30 days', 'flagged on ' || d.days_30 || ' days in the last 30 days')
      else r.description end
from days d
where r.id = d.id
  and (r.report_count > d.real_count
       or (r.description ~ 'flagged [0-9]+×')
       or (r.report_type = 'nagging_pain' and r.description like 'Recurring joint soreness%' and d.days_30 < 2));

commit;

-- What's left: should be no rows
select session_id, count(*) from public.body_checks where session_id is not null group by session_id having count(*) > 1;
