-- FILE: supabase/imports/2026-11-02_roster_repair.sql
--
-- Fixes what the FIRST version of 2026-11-02_roster_import.sql did wrong.
-- VORTEX SUPABASE PROJECT ONLY. Run it once, after that import. It's safe
-- to run again: anything already fixed is skipped.
--
--   1. 15 Ares. The first version matched the old turned-off "15 - Nick"
--      team instead of the real 15 Ares. It renamed the real team
--      "15 Ares (duplicate)", turned it off, and moved the players and Coach
--      Nick Tovar onto the old team. The real team still has the season
--      schedule, week plans and phases. This puts everything back on the real
--      team and turns "15 - Nick" off again. It only does this if the
--      "(duplicate)" team has at least as many scheduled days as the other one.
--      Otherwise it changes nothing and says so.
--   2. Coaches. The first version made new accounts "Coach Michael DeMeo"
--      and "Coach Lauren Cox" because Steve had renamed theirs. A new account
--      is deleted only if a renamed account is still linked to the same team
--      and the new one has never been used to sign in.
--   3. Zoey Warren (18 Venom) and Lillee Mathis (18 Nova) joined late and
--      aren't on the website roster yet. They were taken off their teams, so
--      this puts them back on.
--   4. Two names the roster had typed wrong: "Audrey Land Land" becomes
--      Audrey Land, and "Mila Fernandez Fernande" becomes Mila Fernandez.
--
-- How to run: Supabase → Vortex project → SQL Editor → New query → paste this
-- whole file → Run. Then run 2026-11-02_roster_preview.sql again. The only
-- lines that should say anything other than "No change" are the two renamed
-- coaches ("name kept"), the two wrong roster birthdays, and Eli, Zoey and
-- Lillee staying on their teams.

begin;
set client_min_messages = warning;
drop table if exists pg_temp._log, pg_temp._ares, pg_temp._cfix, pg_temp._late, pg_temp._names;

create or replace function pg_temp.norm(t text) returns text language sql immutable as $f$
  select regexp_replace(
    translate(lower(coalesce(t, '')), 'áàâäãåéèêëíìîïóòôöõúùûüñçý', 'aaaaaaeeeeiiiiooooouuuuncy'),
    '[^a-z0-9]', '', 'g')
$f$;

create temp table _log (n serial, section text, team text, name text, what text);

-- ─────────────────────────────────────────────────────────────────────────
-- 1. 15 Ares
-- ─────────────────────────────────────────────────────────────────────────
create temp table _ares as
select r.id as real_id, w.id as wrong_id,
       (select count(*) from public.team_schedule s where s.team_id = r.id) as real_days,
       (select count(*) from public.team_schedule s where s.team_id = w.id) as wrong_days,
       (select count(*) from public.player_teams pt where pt.team_id = w.id) as wrong_players
from (select id from public.teams where name = '15 Ares (duplicate)'
      order by (select count(*) from public.team_schedule s where s.team_id = teams.id) desc, created_at
      limit 1) r
cross join (select id from public.teams where name = '15 Ares' and coalesce(is_active, false)
            order by created_at limit 1) w;

insert into _log (section, team, name, what)
select '1 15 ARES', '15 Ares', '',
       case when not exists (select 1 from _ares) then 'Nothing to fix (no "15 Ares (duplicate)" team)'
            when real_days < wrong_days then '⚠ Not changed: the "(duplicate)" team has fewer scheduled days ('
                 || real_days || ' vs ' || wrong_days || '). Send Steve''s Claude this result.'
            else 'Real team back on: ' || wrong_players || ' players and its coach moved back, '
                 || real_days || ' scheduled days kept; old "15 - Nick" turned off again' end
from (select 1) x left join _ares on true;

-- players and coaches back to the real team
insert into public.player_teams (player_id, team_id, is_primary)
select pt.player_id, a.real_id, true
from _ares a join public.player_teams pt on pt.team_id = a.wrong_id
where a.real_days >= a.wrong_days
on conflict (player_id, team_id) do nothing;

delete from public.player_teams pt using _ares a
where pt.team_id = a.wrong_id and a.real_days >= a.wrong_days;

insert into public.coach_teams (coach_id, team_id)
select ct.coach_id, a.real_id
from _ares a join public.coach_teams ct on ct.team_id = a.wrong_id
where a.real_days >= a.wrong_days
on conflict do nothing;

delete from public.coach_teams ct using _ares a
where ct.team_id = a.wrong_id and a.real_days >= a.wrong_days;

-- any workout started today on the wrong team goes with the real team
update public.sessions s set team_id = a.real_id
from _ares a
where s.team_id = a.wrong_id and a.real_days >= a.wrong_days
  and s.checked_in_at >= '2026-11-02'::date;

update public.teams t set name = '15 - Nick', is_active = false
from _ares a where t.id = a.wrong_id and a.real_days >= a.wrong_days;

update public.teams t set name = '15 Ares', age_group = '15s', is_active = true
from _ares a where t.id = a.real_id and a.real_days >= a.wrong_days;

-- any other team the first version marked as a duplicate (none expected)
insert into _log (section, team, name, what)
select '1 15 ARES', t.name, '', '⚠ Also marked "(duplicate)" and left alone: check this team'
from public.teams t
where t.name like '%(duplicate)' and t.name <> '15 Ares (duplicate)';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Extra coach accounts (the renamed account is the one kept)
-- ─────────────────────────────────────────────────────────────────────────
create temp table _cfix as
select v.new_name, v.team_name, nw.id as new_id, nw.last_signin_at, keep.id as keep_id, keep.name as keep_name
from (values ('Coach Michael DeMeo', '17 Hurricane', 'Michael', 'DeMeo'),
             ('Coach Lauren Cox', '17 Prime', 'Lauren', 'Cox')) v(new_name, team_name, first, last)
join public.teams t on t.name = v.team_name
left join lateral (select co.id, co.last_signin_at from public.coaches co
                   where co.name = v.new_name order by co.created_at desc limit 1) nw on true
left join lateral (select co.id, co.name from public.coaches co
                   join public.coach_teams ct on ct.coach_id = co.id and ct.team_id = t.id
                   where co.id is distinct from nw.id
                     and (pg_temp.norm(regexp_replace(co.name, '^\s*coach\s+', '', 'i')) like pg_temp.norm(v.first) || '%'
                          or pg_temp.norm(co.name) like '%' || pg_temp.norm(v.last))
                   order by co.created_at limit 1) keep on true;

insert into _log (section, team, name, what)
select '2 COACHES', team_name, new_name,
       case when new_id is null then 'Nothing to fix (no extra account)'
            when keep_id is null then '⚠ Not changed: no renamed account is linked to ' || team_name
                 || '. Tell Steve''s Claude what the coach''s account is called now.'
            when last_signin_at is not null then '⚠ Not changed: the new account has been used to sign in. Remove it on Coach → Coaches if not needed.'
            else 'Extra account deleted. "' || keep_name || '" stays, linked to the team' end
from _cfix;

delete from public.coaches co using _cfix f
where co.id = f.new_id and f.keep_id is not null and f.last_signin_at is null;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Joined late: back on their teams
-- ─────────────────────────────────────────────────────────────────────────
create temp table _late as
select v.pname, v.team_name, p.id as pid, t.id as team_id
from (values ('Zoey Warren', '18 Venom'), ('Lillee Mathis', '18 Nova')) v(pname, team_name)
left join public.teams t on t.name = v.team_name and coalesce(t.is_active, false)
left join lateral (select id from public.players p
                   where pg_temp.norm(p.name) = pg_temp.norm(v.pname) and p.coach_id is null
                   order by p.is_active desc, p.created_at limit 1) p on true;

insert into _log (section, team, name, what)
select '3 JOINED LATE', team_name, pname,
       case when pid is null then '⚠ Not found in the app'
            when team_id is null then '⚠ Team not found'
            when exists (select 1 from public.player_teams pt where pt.player_id = pid and pt.team_id = _late.team_id)
              then 'Already on the team'
            else 'Put back on the team' end
from _late;

update public.players p set is_active = true
from _late l where p.id = l.pid and l.team_id is not null;

insert into public.player_teams (player_id, team_id, is_primary)
select pid, team_id, true from _late where pid is not null and team_id is not null
on conflict (player_id, team_id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Name typos from the roster
-- ─────────────────────────────────────────────────────────────────────────
create temp table _names as
select v.old_name, v.new_name, (select count(*) from public.players p where p.name = v.old_name) as n
from (values ('Audrey Land Land', 'Audrey Land'), ('Mila Fernandez Fernande', 'Mila Fernandez')) v(old_name, new_name);

insert into _log (section, team, name, what)
select '4 NAMES', '13 Bellatrix', old_name,
       case when n = 0 then 'Nothing to fix' else 'Renamed to ' || new_name end
from _names;

update public.players p set name = n.new_name
from _names n where p.name = n.old_name;

commit;

select section, team, name, what from _log order by n;
