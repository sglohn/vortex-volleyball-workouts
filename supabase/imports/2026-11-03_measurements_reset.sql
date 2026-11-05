-- FILE: supabase/imports/2026-11-03_measurements_reset.sql
--
-- Clears every combine / measurement number from before Aug 1, 2026, so
-- this week's Combine Day is everyone's starting point. Run
-- 2026-11-03_measurements_reset_preview.sql first to see what goes.
--
--   A. Rows dated before Aug 1, 2026 are deleted.
--   B. Old numbers copied forward into newer rows are cleared: a value in a
--      row from Aug 1 on that is exactly her number from before Aug 1, with
--      no combine try for that test that day. (When a player gets a new
--      number, the app starts her new row from her last numbers.)
--   C. Newer rows left with no numbers at all are deleted.
--
-- Combine tries (combine_attempts) aren't touched: they only exist from
-- Oct 26, 2026 on. Workouts, sets and everything else stay as they are.
--
-- BACKUP: the whole measurements table is copied to
-- public.measurements_backup_2026_11_03 first. To undo everything:
--   delete from public.measurements;
--   insert into public.measurements select * from public.measurements_backup_2026_11_03;
-- Once you're happy with it, the backup can be dropped:
--   drop table public.measurements_backup_2026_11_03;
--
-- VORTEX Supabase only. Run once (a second run finds nothing more to do,
-- but would overwrite the backup with the cleaned table, so don't).

begin;

-- 0. Backup
create table public.measurements_backup_2026_11_03 as
  select * from public.measurements;
alter table public.measurements_backup_2026_11_03 enable row level security;

-- B. Old numbers copied forward into newer rows
create temp table reset_carried on commit drop as
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
  select n.id, n.player_id, n.measured_at, v.col
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
select c.id, c.col
from cells c
where not exists (
  select 1 from tested x
  where x.player_id = c.player_id and x.metric = c.col and x.day = c.measured_at
);

update public.measurements m set height_in = null            from reset_carried c where c.id = m.id and c.col = 'height_in';
update public.measurements m set wingspan_in = null          from reset_carried c where c.id = m.id and c.col = 'wingspan_in';
update public.measurements m set standing_reach_in = null    from reset_carried c where c.id = m.id and c.col = 'standing_reach_in';
update public.measurements m set standing_vertical_in = null from reset_carried c where c.id = m.id and c.col = 'standing_vertical_in';
update public.measurements m set approach_vertical_in = null from reset_carried c where c.id = m.id and c.col = 'approach_vertical_in';
update public.measurements m set acceleration_sec = null     from reset_carried c where c.id = m.id and c.col = 'acceleration_sec';
update public.measurements m set pro_agility_sec = null      from reset_carried c where c.id = m.id and c.col = 'pro_agility_sec';
update public.measurements m set swing_velocity_mph = null   from reset_carried c where c.id = m.id and c.col = 'swing_velocity_mph';

-- A. Rows from before Aug 1
delete from public.measurements
where measured_at < date '2026-08-01';

-- C. Newer rows with nothing left in them
delete from public.measurements
where height_in is null and wingspan_in is null and standing_reach_in is null
  and standing_vertical_in is null and approach_vertical_in is null
  and acceleration_sec is null and pro_agility_sec is null and swing_velocity_mph is null;

commit;

-- Check: rows before Aug 1 (should be 0), rows left, and the backup
select
  (select count(*) from public.measurements where measured_at < date '2026-08-01') as rows_before_aug_left,
  (select count(*) from public.measurements) as rows_now,
  (select count(*) from public.measurements_backup_2026_11_03) as rows_in_backup;
