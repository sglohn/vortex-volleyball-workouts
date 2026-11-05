-- FILE: supabase/imports/2026-11-05_soreness_review_fix.sql
--
-- Moves plain soreness that is waiting in Needs Review over to Aches & Pains
-- (confirmed_by_coach = true), to match the new rule in
-- app/api/player/bodycheck/route.ts. Run the preview
-- (2026-11-05_soreness_review_preview.sql) first.
--
-- Only touches open, player-reported reports of type soreness that have come
-- up on fewer days than the review count (2 for joints, low back and "no area
-- marked"; 3 for muscles). Injuries, nagging pain and repeats stay in Needs
-- Review. Nothing is deleted. Safe to run again.
--
-- Vortex Supabase only (run in the SQL Editor).
--
-- Undo:
--   update public.health_reports r set confirmed_by_coach = false
--   from public.health_reports_backup_2026_11_05 b where b.id = r.id;

create table if not exists public.health_reports_backup_2026_11_05 as
select * from public.health_reports where false;

insert into public.health_reports_backup_2026_11_05
select r.* from public.health_reports r
where r.status in ('active', 'monitoring')
  and r.reported_by = 'player'
  and r.confirmed_by_coach = false
  and r.report_type = 'soreness'
  and coalesce(r.report_count, 1) < case
        when r.body_part in ('General (no area marked)', 'Lower Back', 'Head', 'Neck')
          or r.body_part ~* '(knee|ankle|shoulder|hip|elbow|wrist)$' then 2
        else 3 end
  and not exists (select 1 from public.health_reports_backup_2026_11_05 b where b.id = r.id);

update public.health_reports r
set confirmed_by_coach = true
where r.status in ('active', 'monitoring')
  and r.reported_by = 'player'
  and r.confirmed_by_coach = false
  and r.report_type = 'soreness'
  and coalesce(r.report_count, 1) < case
        when r.body_part in ('General (no area marked)', 'Lower Back', 'Head', 'Neck')
          or r.body_part ~* '(knee|ankle|shoulder|hip|elbow|wrist)$' then 2
        else 3 end;

-- What's left in Needs Review
select p.name as player, r.body_part, r.report_type, coalesce(r.report_count, 1) as days_reported
from public.health_reports r
join public.players p on p.id = r.player_id
where r.status in ('active', 'monitoring') and r.confirmed_by_coach = false
order by p.name, r.body_part;
