-- FILE: supabase/imports/2026-11-05_girls_attendance_fix.sql
--
-- Vortex Supabase only. Run 2026-11-05_girls_attendance_preview.sql first
-- and check its "will_fix = yes" rows. Safe to run again.
--
-- 1. Girls teams: workout days before Nov 1, 2026 no longer count for
--    attendance (counts_for_attendance = false, same as a make-up day). The
--    days stay on the schedule; anyone who came gets an Extra day.
-- 2. Girls teams: a player whose team date (player_teams.joined_at) is after
--    Nov 1 but whose account is from before Nov 1 gets her team date set back
--    to Nov 1, so every workout this season counts for her. (Her date was
--    reset when her team was re-saved.) Players added Nov 1 or later keep
--    their date.
--
-- Backups: team_schedule_backup_2026_11_05, player_teams_backup_2026_11_05.
-- Undo:
--   update team_schedule ts set counts_for_attendance = b.counts_for_attendance
--     from team_schedule_backup_2026_11_05 b where b.id = ts.id;
--   update player_teams pt set joined_at = b.joined_at
--     from player_teams_backup_2026_11_05 b where b.id = pt.id;

begin;

create temp table _girls on commit drop as
select t.id
from teams t
where t.is_active
  and not coalesce(t.is_open_gym, false)
  and t.name !~* 'boy' and coalesce(t.age_group, '') !~* 'boy';

-- Backups (first run only)
create table if not exists public.team_schedule_backup_2026_11_05 as
select ts.* from team_schedule ts
where ts.team_id in (select id from _girls) and ts.scheduled_date < '2026-11-01';

create table if not exists public.player_teams_backup_2026_11_05 as
select pt.* from player_teams pt
where pt.team_id in (select id from _girls);

-- 1. Old days stop counting
update team_schedule ts
set counts_for_attendance = false
where ts.team_id in (select id from _girls)
  and ts.scheduled_date >= '2026-08-01'
  and ts.scheduled_date < '2026-11-01'
  and ts.counts_for_attendance;

-- 2. Team dates reset by a re-save go back to Nov 1
update player_teams pt
set joined_at = '2026-11-01'
from players p
where p.id = pt.player_id
  and p.coach_id is null
  and pt.team_id in (select id from _girls)
  and pt.joined_at > '2026-11-01'
  and p.created_at < '2026-11-01';

-- What it did
select 'old days not counted' as what, count(*) from team_schedule
where team_id in (select id from _girls) and scheduled_date between '2026-08-01' and '2026-10-31'
  and not counts_for_attendance
union all
select 'girls-team players dated Nov 1', count(*) from player_teams
where team_id in (select id from _girls) and joined_at = '2026-11-01';

commit;
