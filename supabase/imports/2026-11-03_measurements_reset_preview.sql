-- FILE: supabase/imports/2026-11-03_measurements_reset_preview.sql
--
-- PREVIEW ONLY. Changes nothing.
--
-- Shows what supabase/imports/2026-11-03_measurements_reset.sql would remove:
-- every combine / measurement number from before Aug 1, 2026, so this week's
-- Combine Day is everyone's starting point (TV leaderboard, Club Top 5,
-- New Bests, Comparisons, the athleticism score, player profiles).
--
-- Two kinds of old numbers:
--   A. Rows dated before Aug 1, 2026: deleted.
--   B. Old numbers copied forward into a newer row. When a player gets a
--      new number, the app starts her new row from her last numbers
--      (lib/combineEntry.ts, app/api/player/measurements), so a Combine Day
--      row this week can still hold last year's block touch if she hasn't
--      done that test yet. A value in a row from Aug 1 on is treated as
--      copied forward when it's exactly her number from before Aug 1 and
--      she has no combine try for that test that day. Those are cleared.
--
-- VORTEX Supabase only. Run each query and look at the results.

-- 1. Rows from before Aug 1, by team (these get deleted).
--    Check the boys teams: if their tryout numbers are in this list, the
--    tryout was before Aug 1 and the cut-off date needs changing.
select coalesce(t.name, '(no team)') as team,
       count(*) as rows_before_aug,
       count(distinct m.player_id) as players,
       min(m.measured_at) as earliest,
       max(m.measured_at) as latest
from public.measurements m
left join public.player_teams pt on pt.player_id = m.player_id and pt.is_primary = true
left join public.teams t on t.id = pt.team_id
where m.measured_at < date '2026-08-01'
group by t.name
order by t.name;

-- 2. Old numbers copied forward into newer rows (these get cleared)
with old as (
  select distinct on (player_id) *
  from public.measurements
  where measured_at < date '2026-08-01'
  order by player_id, measured_at desc, created_at desc
),
tested as (
  select distinct a.player_id, a.metric, (s.checked_in_at at time zone 'America/New_York')::date as day
  from public.combine_attempts a
  join public.sessions s on s.id = a.session_id
),
cells as (
  select n.id, n.player_id, n.measured_at, v.col, v.val
  from public.measurements n
  join old o on o.player_id = n.player_id
  cross join lateral (values
    ('height_in',            n.height_in::numeric,            o.height_in::numeric),
    ('wingspan_in',          n.wingspan_in::numeric,          o.wingspan_in::numeric),
    ('standing_reach_in',    n.standing_reach_in::numeric,    o.standing_reach_in::numeric),
    ('standing_vertical_in', n.standing_vertical_in::numeric, o.standing_vertical_in::numeric),
    ('approach_vertical_in', n.approach_vertical_in::numeric, o.approach_vertical_in::numeric),
    ('acceleration_sec',     n.acceleration_sec::numeric,     o.acceleration_sec::numeric),
    ('pro_agility_sec',      n.pro_agility_sec::numeric,      o.pro_agility_sec::numeric),
    ('swing_velocity_mph',   n.swing_velocity_mph::numeric,   o.swing_velocity_mph::numeric)
  ) as v(col, val, oldval)
  where n.measured_at >= date '2026-08-01'
    and v.val is not null
    and v.val = v.oldval
)
select p.name as player, coalesce(t.name, '(no team)') as team, c.measured_at, c.col as test, c.val as value
from cells c
join public.players p on p.id = c.player_id
left join public.player_teams pt on pt.player_id = c.player_id and pt.is_primary = true
left join public.teams t on t.id = pt.team_id
where not exists (
  select 1 from tested x
  where x.player_id = c.player_id and x.metric = c.col and x.day = c.measured_at
)
order by team, player, c.measured_at, c.col;

-- 3. Players who will have no numbers at all afterwards (only old numbers)
select p.name as player, coalesce(t.name, '(no team)') as team, max(m.measured_at) as last_measured
from public.measurements m
join public.players p on p.id = m.player_id
left join public.player_teams pt on pt.player_id = m.player_id and pt.is_primary = true
left join public.teams t on t.id = pt.team_id
group by p.name, t.name, m.player_id
having max(m.measured_at) < date '2026-08-01'
order by team, player;
