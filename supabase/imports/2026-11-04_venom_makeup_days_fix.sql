-- FILE: supabase/imports/2026-11-04_venom_makeup_days_fix.sql
--
-- Marks 18 Venom's October 2026 make-up days as not counting for attendance.
-- The workouts and the player's sets stay as they are; she shows them as
-- Extra days, and nobody else on the team shows them as Missed.
--
-- Run 2026-11-04_venom_makeup_days_preview.sql first and check it lists only
-- the two make-up days. Vortex Supabase only. Safe to run again.
-- Undo: the same update with counts_for_attendance = true.

update team_schedule ts
set counts_for_attendance = false
from teams t
where t.id = ts.team_id
  and t.name = '18 Venom'
  and ts.scheduled_date between '2026-10-01' and '2026-10-31';

-- Check
select ts.scheduled_date, ts.counts_for_attendance
from team_schedule ts join teams t on t.id = ts.team_id
where t.name = '18 Venom' and ts.scheduled_date between '2026-10-01' and '2026-10-31'
order by ts.scheduled_date;
