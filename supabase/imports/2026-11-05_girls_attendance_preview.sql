-- FILE: supabase/imports/2026-11-05_girls_attendance_preview.sql
--
-- Changes nothing. Vortex Supabase only. Checks girls teams' weight room
-- attendance (Coach → Teams) against how it should be counted:
--   * only workouts from the week of Nov 1, 2026 on should count
--   * every player on the roster should be counted for her team's first workout
--
-- One list. Each row is one thing the attendance page is doing that may be wrong:
--
--   1 OLD DAY COUNTS     a workout day before Nov 1 that still counts for
--                        attendance. 2026-11-05_girls_attendance_fix.sql turns
--                        these off (they stay on the schedule; anyone who came
--                        gets an Extra day).
--   2 JOINED LATE        a player whose team date (player_teams.joined_at) is
--                        after a workout day, so that day isn't counted for her.
--                        Happens when her team was re-saved on Coach → Players
--                        or Season Rollover (that used to reset the date).
--                        "will_fix" = yes when her account is from before Nov 1,
--                        so the fix script sets her team date back to Nov 1.
--                        "no" = account made Nov 1 or later (a real late add);
--                        left alone.
--   3 SIGNED IN, NOTHING a check-in on a workout day with no sets and no combine
--                        tries logged. Counted as "came". Before Nov 5 (PR #81)
--                        just signing in on a phone made a check-in, so a player
--                        who wasn't there but opened the app shows as came.
--   4 TODAY, NOT IN      no check-in on today's workout. The page leaves today
--                        out until tomorrow, so it's not a miss yet.
--   5 ACCOUNT OFF        a turned-off player still on a girls team: left out
--                        of attendance altogether.
--   6 TRAINS WITH        player follows another team's days (FYI).

with girls_teams as (
  select t.id, t.name
  from teams t
  where t.is_active
    and not coalesce(t.is_open_gym, false)
    and t.name !~* 'boy' and coalesce(t.age_group, '') !~* 'boy'
),
today as (select (now() at time zone 'America/New_York')::date as d),
days as (
  select ts.team_id, ts.scheduled_date as d, wt.name as workout
  from team_schedule ts
  join girls_teams g on g.id = ts.team_id
  left join workout_templates wt on wt.id = ts.template_id
  where ts.template_id is not null
    and ts.counts_for_attendance
    and ts.scheduled_date >= '2026-08-01'
    and ts.scheduled_date <= (select d from today)
),
roster as (
  select pt.team_id, pt.player_id, pt.joined_at, p.name, p.is_active, p.created_at,
         p.trains_with_team_id
  from player_teams pt
  join girls_teams g on g.id = pt.team_id
  join players p on p.id = pt.player_id and p.coach_id is null
),
-- Each player's check-ins this season by club date, with what she logged
checkins as (
  select s.player_id,
         (s.checked_in_at at time zone 'America/New_York')::date as d,
         min(s.checked_in_at at time zone 'America/New_York') as first_in,
         count(distinct sl.id) as sets,
         count(distinct ca.id) as tries
  from sessions s
  left join set_logs sl on sl.session_id = s.id
  left join combine_attempts ca on ca.session_id = s.id
  where s.checked_in_at >= '2026-08-01'
  group by 1, 2
)
select * from (
  -- 1 OLD DAY COUNTS
  select g.name as team, '1 OLD DAY COUNTS' as issue, d.d as date, d.workout as detail,
         null::text as player,
         (select count(*) from roster r join checkins c on c.player_id = r.player_id and c.d = d.d
          where r.team_id = d.team_id)::text || ' of the roster checked in' as note,
         'yes' as will_fix
  from days d join girls_teams g on g.id = d.team_id
  where d.d < '2026-11-01'

  union all
  -- 2 JOINED LATE (a counted workout day from Nov 1 on before her team date)
  select g.name, '2 JOINED LATE', d.d, d.workout, r.name,
         'team date ' || r.joined_at || ', account made ' ||
           (r.created_at at time zone 'America/New_York')::date ||
           case when c.d is null then ', did NOT check in' else ', checked in' end,
         case when r.created_at < '2026-11-01' then 'yes' else 'no' end
  from roster r
  join girls_teams g on g.id = r.team_id
  join days d on d.team_id = coalesce(r.trains_with_team_id, r.team_id)
  left join checkins c on c.player_id = r.player_id and c.d = d.d
  where r.is_active and d.d >= '2026-11-01' and r.joined_at > d.d

  union all
  -- 3 SIGNED IN, NOTHING LOGGED
  select g.name, '3 SIGNED IN, NOTHING', d.d, d.workout, r.name,
         'checked in at ' || to_char(c.first_in, 'HH12:MI AM') || ', 0 sets, 0 combine tries',
         'no (check)'
  from roster r
  join girls_teams g on g.id = r.team_id
  join days d on d.team_id = coalesce(r.trains_with_team_id, r.team_id)
  join checkins c on c.player_id = r.player_id and c.d = d.d
  where r.is_active and d.d >= '2026-11-01' and c.sets = 0 and c.tries = 0

  union all
  -- 4 TODAY, NOT IN
  select g.name, '4 TODAY, NOT IN', d.d, d.workout, r.name,
         'counts as a miss from tomorrow', 'no (automatic)'
  from roster r
  join girls_teams g on g.id = r.team_id
  join days d on d.team_id = coalesce(r.trains_with_team_id, r.team_id)
  left join checkins c on c.player_id = r.player_id and c.d = d.d
  where r.is_active and d.d = (select d from today) and c.d is null
    and (r.joined_at is null or r.joined_at <= d.d)

  union all
  -- 5 ACCOUNT OFF
  select g.name, '5 ACCOUNT OFF', null, null, r.name,
         'turned off: not on the attendance page at all', 'no (check)'
  from roster r join girls_teams g on g.id = r.team_id
  where not r.is_active

  union all
  -- 6 TRAINS WITH
  select g.name, '6 TRAINS WITH', null, null, r.name,
         'follows ' || coalesce(o.name, '?') || ' workout days', 'no'
  from roster r
  join girls_teams g on g.id = r.team_id
  left join teams o on o.id = r.trains_with_team_id
  where r.is_active and r.trains_with_team_id is not null
) x
order by issue, team, date nulls first, player;
