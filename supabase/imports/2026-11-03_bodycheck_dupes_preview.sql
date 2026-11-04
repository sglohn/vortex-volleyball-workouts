-- FILE: supabase/imports/2026-11-03_bodycheck_dupes_preview.sql
--
-- PREVIEW ONLY: changes nothing. Shows what
-- 2026-11-03_bodycheck_dupes_fix.sql would fix.
--
-- The problem: signing in again to a workout already started (phone closed,
-- kiosk, Team Mode) showed the body check again and saved a second check,
-- so one sore day read as "flagged 2× in the last 30 days" and pushed the
-- report's count up.
--
-- Run in the Vortex Supabase SQL Editor. Each SELECT is its own result.

-- 1. Workouts with more than one body check (these get merged into one)
select p.name as player, s.checked_in_at::date as day, count(*) as checks
from public.body_checks b
join public.sessions s on s.id = b.session_id
join public.players p on p.id = b.player_id
group by p.name, s.id, s.checked_in_at
having count(*) > 1
order by s.checked_in_at desc, p.name;

-- 2. Open player reports whose count or "flagged N×" text is higher than the
--    number of different days the area was really flagged
with zone_of as (
  select r.*,
    case when r.body_part = 'General (no area marked)' then 'general'
         else replace(regexp_replace(regexp_replace(lower(r.body_part), '^right ', 'r_'), '^left ', 'l_'), ' ', '_')
    end as zone
  from public.health_reports r
  where r.status in ('active', 'monitoring') and r.reported_by = 'player'
),
days as (
  select z.id,
    (select count(distinct (b.checked_at at time zone 'America/New_York')::date)
       from public.body_checks b
      where b.player_id = z.player_id
        and b.checked_at >= z.reported_at - interval '1 minute'
        and b.regions ->> z.zone in ('sore', 'injured')) as days_since_reported,
    (select count(distinct (b.checked_at at time zone 'America/New_York')::date)
       from public.body_checks b
      where b.player_id = z.player_id
        and b.checked_at >= now() - interval '30 days'
        and b.regions ->> z.zone in ('sore', 'injured')) as days_last_30
  from zone_of z
)
select p.name as player, z.body_part, z.report_type, z.report_count,
       greatest(d.days_since_reported, 1) as real_count, d.days_last_30, z.description
from zone_of z
join days d on d.id = z.id
join public.players p on p.id = z.player_id
where z.report_count > greatest(d.days_since_reported, 1)
   or (z.description ~ 'flagged [0-9]+×' and d.days_last_30 <= 1)
   or (z.report_type = 'nagging_pain' and z.description like 'Recurring joint soreness%' and d.days_last_30 < 2)
order by p.name, z.body_part;
