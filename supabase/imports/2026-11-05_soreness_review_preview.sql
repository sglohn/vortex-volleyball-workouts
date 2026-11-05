-- FILE: supabase/imports/2026-11-05_soreness_review_preview.sql
--
-- PREVIEW ONLY: changes nothing. Shows what
-- 2026-11-05_soreness_review_fix.sql would move out of Needs Review.
--
-- New rule (app/api/player/bodycheck/route.ts): a body-check report only
-- needs a coach's review when the player marked it injured, wrote a note,
-- or the same area has come up on 2+ days (joints, low back, no area marked)
-- or 3+ days (muscles). Everyday soreness goes straight to Aches & Pains.
--
-- This finds open player reports waiting for review that are plain
-- soreness below that count. They stay on the board (Aches & Pains) and
-- keep counting toward repeats; they just stop waiting for review.
--
-- Run in the Vortex Supabase SQL Editor.

select p.name as player, r.body_part, r.report_type, coalesce(r.report_count, 1) as days_reported,
       r.reported_at::date as first_reported, r.last_reported_at::date as last_reported, r.description
from public.health_reports r
join public.players p on p.id = r.player_id
where r.status in ('active', 'monitoring')
  and r.reported_by = 'player'
  and r.confirmed_by_coach = false
  and r.report_type = 'soreness'
  and coalesce(r.report_count, 1) < case
        when r.body_part in ('General (no area marked)', 'Lower Back', 'Head', 'Neck')
          or r.body_part ~* '(knee|ankle|shoulder|hip|elbow|wrist)$' then 2
        else 3 end
order by p.name, r.body_part;

-- Stays in Needs Review (for comparison): injuries, nagging pain, repeats
select p.name as player, r.body_part, r.report_type, coalesce(r.report_count, 1) as days_reported
from public.health_reports r
join public.players p on p.id = r.player_id
where r.status in ('active', 'monitoring')
  and r.confirmed_by_coach = false
  and not (
    r.reported_by = 'player'
    and r.report_type = 'soreness'
    and coalesce(r.report_count, 1) < case
          when r.body_part in ('General (no area marked)', 'Lower Back', 'Head', 'Neck')
            or r.body_part ~* '(knee|ankle|shoulder|hip|elbow|wrist)$' then 2
          else 3 end
  )
order by p.name, r.body_part;
