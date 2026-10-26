-- FILE: supabase/imports/2026-10-26_local_teams_import.sql
--
-- STEP 2 of 2: IMPORT. Run the preview first and look it over.
--
-- Adds the LOCAL teams 13 and over to the Vortex weight room app, from the
-- club roster of Oct 21, 2026 (ClubwideRoster_Vortex_2026-10-21.xls).
-- VORTEX SUPABASE PROJECT ONLY, never Bruisers Lacrosse.
--
--   Teams     the 4 local teams 13 and over: 13 Revival (Ella), 13 Bellatrix
--             (Jesse), 14 Valor (Eric), 15 Attack (Chris). Made new unless the app
--             already has them. The 20 teams imported on Oct 21 aren't touched.
--   Players   matched to players already in the app first, so nobody is added
--             twice: same name, then same birthday + last name, then close
--             names (Abby / Abigail). Matches that aren't exact are listed under
--             "CHECK THESE MATCHES". Only players not found are added, PIN 1234.
--             A player on a roster team in the app but not on its roster is
--             taken off that team (the account and workout history stay).
--   Coaches   one team coach account each (role coach, not admin), named
--             "Coach First Last", PIN 9876, linked to their team(s). Steve is
--             skipped (he has the Admin account).
--
-- How to run: Supabase → Vortex project → SQL Editor → New query → paste this
-- whole file → Run.
--   1. 2026-10-26_local_teams_preview.sql   changes NOTHING; lists what would happen
--   2. 2026-10-26_local_teams_import.sql    makes the changes, then lists what it did
-- Both are safe to run again: a second run finds everyone and changes nothing.

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. The roster (from ClubwideRoster_Vortex_2026-10-21.xls)
-- ─────────────────────────────────────────────────────────────────────────
set client_min_messages = warning;
drop table if exists pg_temp._keep, pg_temp._ren, pg_temp._dup, pg_temp._alias, pg_temp._rt, pg_temp._rp, pg_temp._rc, pg_temp._p, pg_temp._cur, pg_temp._tcand,
  pg_temp._tm, pg_temp._rpx, pg_temp._pm, pg_temp._new, pg_temp._cm;

-- Whole last name match: "Mia Morgan" has last name Morgan, not Organ
create or replace function pg_temp.words(t text) returns text language sql immutable as $f$
  select trim(regexp_replace(regexp_replace(
    translate(lower(coalesce(t, '')), 'áàâäãåéèêëíìîïóòôöõúùûüñçý', 'aaaaaaeeeeiiiiooooouuuuncy'),
    '[^a-z ]', '', 'g'), ' +', ' ', 'g'))
$f$;
create or replace function pg_temp.same_last(name text, last text) returns boolean language sql immutable as $f$
  select pg_temp.words(last) <> '' and (' ' || pg_temp.words(name)) like ('% ' || pg_temp.words(last))
$f$;

create or replace function pg_temp.norm(t text) returns text language sql immutable as $f$
  select regexp_replace(
    translate(lower(coalesce(t, '')), 'áàâäãåéèêëíìîïóòôöõúùûüñçý', 'aaaaaaeeeeiiiiooooouuuuncy'),
    '[^a-z0-9]', '', 'g')
$f$;

-- Teams. include = false: 12s and local teams (Whitney, Jesse, Ella, Eric, Chris)
create temp table _rt (key int primary key, age int, nick text, name text, age_group text,
                       is_boys boolean, include boolean, left_out_because text, roster_coaches text);
insert into _rt values
(6, 13, 'Revival', '13 Revival', '13s', false, true, null, 'Ella Finnell'),
(7, 13, 'Bellatrix', '13 Bellatrix', '13s', false, true, null, 'Jesse Parsons'),
(12, 14, 'Valor', '14 Valor', '14s', false, true, null, 'Eric Bennett'),
(17, 15, 'Attack', '15 Attack', '15s', false, true, null, 'Christopher Sterl');

-- The app's current name for each team (named by coach, e.g. "16 - Phil & Annie")
create temp table _alias (key int, app_name text);
-- (none for these teams)

-- Players not on the website roster who stay on their team (practice players)
create temp table _keep (key int, pname text);
insert into _keep select key, n from (values
('18 Havoc Boys', 'Eli Richardson')
) v(tname, n) join _rt on _rt.name = v.tname;

-- App players whose name is changed to the roster name
create temp table _ren (first text, last text);
insert into _ren values
('Kynidie', 'Blackwell');

-- Players on the included teams
create temp table _rp (rid int primary key, team_key int, first text, last text, jersey text, dob date);
insert into _rp values
(1, 6, 'Riley', 'Clanton', '3', '2013-12-23'::date),
(2, 6, 'Brielle', 'DeMeyere', '13', '2013-08-14'::date),
(3, 6, 'Hallie', 'Dyer', '12', '2014-06-12'::date),
(4, 6, 'Callie', 'Millard', '16', '2013-10-30'::date),
(5, 6, 'Laurel', 'Mosher', '22', '2014-03-11'::date),
(6, 6, 'Cambrie', 'Parsons', '1', '2014-01-15'::date),
(7, 6, 'Brylie', 'Stokes', '25', '2013-11-25'::date),
(8, 6, 'Daelynn', 'Wallin', '14', '2014-06-10'::date),
(9, 6, 'Harper', 'Wilson', '9', '2013-09-08'::date),
(10, 7, 'Cameron', 'Blair', '3', '2013-11-13'::date),
(11, 7, 'Adelyn', 'Free', '83', '2013-07-08'::date),
(12, 7, 'Lillian', 'Hiers', '21', '2014-01-14'::date),
(13, 7, 'Lily', 'Lambert', '18', '2014-05-20'::date),
(14, 7, 'Amarely', 'Maciel', '19', '2014-11-29'::date),
(15, 7, 'Catherine', 'Pierce', '14', '2014-06-13'::date),
(16, 7, 'Harper', 'Summers', '4', '2014-03-10'::date),
(17, 12, 'Chrisette', 'Allison', '8', '2013-01-08'::date),
(18, 12, 'Olivia', 'Borhman', '3', '2012-10-30'::date),
(19, 12, 'Carlee', 'Cartwright', '4', '2013-03-18'::date),
(20, 12, 'Nevaeh', 'Chandler', '11', '2012-07-31'::date),
(21, 12, 'Lydia', 'Favela', '14', '2013-08-14'::date),
(22, 12, 'Nina', 'Forkan', '1', '2013-01-08'::date),
(23, 12, 'Abby', 'Leach', '27', '2012-12-10'::date),
(24, 12, 'Mackenzie', 'McClure', '7', '2013-06-13'::date),
(25, 12, 'Peyton', 'Organ', '23', '2012-11-14'::date),
(26, 12, 'Piper', 'Wooten', '10', '2013-06-26'::date),
(27, 17, 'Sofia', 'Delgado', '14', '2012-05-25'::date),
(28, 17, 'Denver', 'Haynes', '13', '2012-07-20'::date),
(29, 17, 'Sahasra', 'Koya', '16', '2012-02-16'::date),
(30, 17, 'Jessie', 'Shuler', '3', '2012-02-28'::date),
(31, 17, 'Kinsey', 'Tripp', '24', '2012-02-24'::date);

-- Coaches on the included teams. pin_hash = PIN 9876, scrambled the same
-- way the app does it (lib/coachAuth.ts hashPin), so the app reads it normally.
create temp table _rc (cname text, team_key int, pin_hash text);
insert into _rc values
('Coach Ella Finnell', 6, 'pbkdf2$100000$nqfhATlGHeeIf90S8x1Z7Q$UDXVgKC0yD-xD78_hBoKtIR0iraT_lmqEaLJljPNiQo'),
('Coach Jesse Parsons', 7, 'pbkdf2$100000$LmuBetLO2Snu1kriNcZSaw$i645ozQidG0vlcy2Br2nmfoqsEdS5UqC_CkRjCtR7FU'),
('Coach Eric Bennett', 12, 'pbkdf2$100000$p2nUqESbPKQKqqXlUPIkTA$LHacQrvsrRUrmUn3KBhXmGE2vWV6tvqW8yShkMgNsxo'),
('Coach Christopher Sterl', 17, 'pbkdf2$100000$EZdTF5eEM8_NbSm9ztdGqA$RRzYJCJiw1ST3LnL3ZPDgF83tRHSrSk0h2fgV4knpko');

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Match the roster to what's already in the app (changes nothing yet)
-- ─────────────────────────────────────────────────────────────────────────

-- Teams: an app team matches when it has the app's current name for that
-- team ("16 - Phil & Annie", always wins), or its name contains the team
-- nickname ("Pallavolo"), best if it's also active and has the age in its name
create temp table _tcand as
select rt.key, t.id as team_id, t.name, t.age_group, coalesce(t.is_active, false) as is_active,
       (case when exists (select 1 from _alias a where a.key = rt.key and pg_temp.norm(a.app_name) = pg_temp.norm(t.name)) then 10 else 0 end)
     + (case when coalesce(t.is_active, false) then 2 else 0 end)
     + (case when pg_temp.norm(t.name) like '%' || rt.age || '%' or pg_temp.norm(t.age_group) like '%' || rt.age || '%' then 1 else 0 end) as score
from _rt rt
join public.teams t
  on not coalesce(t.is_open_gym, false)
 and (pg_temp.norm(t.name) like '%' || pg_temp.norm(rt.nick) || '%'
      or exists (select 1 from _alias a where a.key = rt.key and pg_temp.norm(a.app_name) = pg_temp.norm(t.name)));

create temp table _tm (key int primary key, team_id uuid, old_name text, old_age_group text,
                       old_active boolean, status text);
insert into _tm
select rt.key,
       case when best.n_best = 1 then best.team_id when rt.include and best.key is null then gen_random_uuid() end,
       best.name, best.age_group, best.is_active,
       case when best.key is null then (case when rt.include then 'new' else 'not in app' end)
            when best.n_best > 1 or best.claimed > 1 then 'ambiguous'
            else 'matched' end
from _rt rt
left join lateral (
  select c.*,
         count(*) over (partition by c.score) as n_best,
         (select count(distinct c2.key) from _tcand c2 where c2.team_id = c.team_id and c2.score >= 10) as claimed
  from _tcand c where c.key = rt.key
  order by c.score desc limit 1
) best on true;

-- Copies of a roster team made by an earlier run of this import (same name
-- as the roster team, but not the team being kept): folded into the kept team
create temp table _dup as
select tm.key, t.id as dup_id, t.name as dup_name
from _tm tm join _rt rt using (key)
join public.teams t on pg_temp.norm(t.name) = pg_temp.norm(rt.name) and t.id <> tm.team_id
where tm.status = 'matched' and rt.include and not coalesce(t.is_open_gym, false);

-- Players already in the app
create temp table _p as
select id, name, pg_temp.norm(name) as n, date_of_birth as dob, jersey_number as jersey,
       coalesce(is_active, false) as is_active, gender, created_at
from public.players;

-- Their current team(s), not counting Open Gym
create temp table _cur as
select pt.player_id, pt.team_id, t.name as team_name
from public.player_teams pt
join public.teams t on t.id = pt.team_id
where not coalesce(t.is_open_gym, false);

-- Roster players with their target team
create temp table _rpx as
select r.*, pg_temp.norm(r.first || r.last) as rn, pg_temp.norm(r.first) as rf, pg_temp.norm(r.last) as rl,
       tm.team_id, rt.name as team_name, rt.is_boys
from _rp r join _tm tm on tm.key = r.team_key join _rt rt on rt.key = r.team_key;

create temp table _pm (rid int primary key, pid uuid unique, how text, needs_check boolean);

-- Match: same name
insert into _pm
select rid, pid, 'same name', false from (
  select r.rid, p.id as pid,
         count(*) over (partition by r.rid) as n_for_rid,
         row_number() over (partition by r.rid order by
           (exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)) desc,
           p.is_active desc, p.created_at asc) as pick,
         count(*) over (partition by p.id) as n_for_pid
  from _rpx r join _p p on p.n = r.rn and (p.dob is null or p.dob = r.dob)
  where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)
) c
where pick = 1 
  and pid not in (select pid from (
        select p.id as pid, r.rid from _rpx r join _p p on p.n = r.rn and (p.dob is null or p.dob = r.dob)
        where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)) x
      group by pid having count(*) > 1);

-- Match: same birthday and last name
insert into _pm
select rid, pid, 'same birthday and last name', false from (
  select r.rid, p.id as pid,
         count(*) over (partition by r.rid) as n_for_rid,
         row_number() over (partition by r.rid order by
           (exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)) desc,
           p.is_active desc, p.created_at asc) as pick,
         count(*) over (partition by p.id) as n_for_pid
  from _rpx r join _p p on p.dob = r.dob and pg_temp.same_last(p.name, r.last)
  where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)
) c
where pick = 1 and n_for_rid = 1
  and pid not in (select pid from (
        select p.id as pid, r.rid from _rpx r join _p p on p.dob = r.dob and pg_temp.same_last(p.name, r.last)
        where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)) x
      group by pid having count(*) > 1);

-- Match: same birthday and first name
insert into _pm
select rid, pid, 'same birthday and first name', true from (
  select r.rid, p.id as pid,
         count(*) over (partition by r.rid) as n_for_rid,
         row_number() over (partition by r.rid order by
           (exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)) desc,
           p.is_active desc, p.created_at asc) as pick,
         count(*) over (partition by p.id) as n_for_pid
  from _rpx r join _p p on p.dob = r.dob and left(p.n, length(r.rf)) = r.rf
  where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)
) c
where pick = 1 and n_for_rid = 1
  and pid not in (select pid from (
        select p.id as pid, r.rid from _rpx r join _p p on p.dob = r.dob and left(p.n, length(r.rf)) = r.rf
        where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)) x
      group by pid having count(*) > 1);

-- Match: similar first name, same last name
insert into _pm
select rid, pid, 'similar first name, same last name', true from (
  select r.rid, p.id as pid,
         count(*) over (partition by r.rid) as n_for_rid,
         row_number() over (partition by r.rid order by
           (exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)) desc,
           p.is_active desc, p.created_at asc) as pick,
         count(*) over (partition by p.id) as n_for_pid
  from _rpx r join _p p on pg_temp.same_last(p.name, r.last) and (p.dob is null or p.dob = r.dob)
       and least(length(r.rf), length(p.n) - length(r.rl)) >= 3
       and (left(p.n, length(p.n) - length(r.rl)) like r.rf || '%' or r.rf like left(p.n, length(p.n) - length(r.rl)) || '%')
  where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)
) c
where pick = 1 and n_for_rid = 1
  and pid not in (select pid from (
        select p.id as pid, r.rid from _rpx r join _p p on pg_temp.same_last(p.name, r.last) and (p.dob is null or p.dob = r.dob)
       and least(length(r.rf), length(p.n) - length(r.rl)) >= 3
       and (left(p.n, length(p.n) - length(r.rl)) like r.rf || '%' or r.rf like left(p.n, length(p.n) - length(r.rl)) || '%')
        where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)) x
      group by pid having count(*) > 1);

-- Match: same team, last name and first initial
insert into _pm
select rid, pid, 'same team, last name and first initial', true from (
  select r.rid, p.id as pid,
         count(*) over (partition by r.rid) as n_for_rid,
         row_number() over (partition by r.rid order by
           (exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)) desc,
           p.is_active desc, p.created_at asc) as pick,
         count(*) over (partition by p.id) as n_for_pid
  from _rpx r join _p p on pg_temp.same_last(p.name, r.last) and left(p.n, 1) = left(r.rf, 1)
       and (p.dob is null or p.dob = r.dob)
       and exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)
  where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)
) c
where pick = 1 and n_for_rid = 1
  and pid not in (select pid from (
        select p.id as pid, r.rid from _rpx r join _p p on pg_temp.same_last(p.name, r.last) and left(p.n, 1) = left(r.rf, 1)
       and (p.dob is null or p.dob = r.dob)
       and exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)
        where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)) x
      group by pid having count(*) > 1);

-- Match: same name, different birthday
insert into _pm
select rid, pid, 'same name, different birthday', true from (
  select r.rid, p.id as pid,
         count(*) over (partition by r.rid) as n_for_rid,
         row_number() over (partition by r.rid order by
           (exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)) desc,
           p.is_active desc, p.created_at asc) as pick,
         count(*) over (partition by p.id) as n_for_pid
  from _rpx r join _p p on p.n = r.rn
  where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)
) c
where pick = 1 
  and pid not in (select pid from (
        select p.id as pid, r.rid from _rpx r join _p p on p.n = r.rn
        where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)) x
      group by pid having count(*) > 1);

-- New players (not found in the app)
create temp table _new as
select r.rid, gen_random_uuid() as pid from _rpx r where r.rid not in (select rid from _pm);

-- Coaches: reuse an account that's already there (same name, with or without "Coach")
create temp table _cm as
select c.cname, c.pin_hash,
       coalesce((select co.id from public.coaches co
                 where pg_temp.norm(regexp_replace(co.name, '^\s*coach\s+', '', 'i')) = pg_temp.norm(substr(c.cname, 7))
                 order by co.created_at limit 1), gen_random_uuid()) as coach_id,
       exists (select 1 from public.coaches co
               where pg_temp.norm(regexp_replace(co.name, '^\s*coach\s+', '', 'i')) = pg_temp.norm(substr(c.cname, 7))) as already_there
from (select distinct cname, pin_hash from _rc) c;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Make the changes
-- ─────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from _tm where status = 'ambiguous') then
    raise exception 'Stopped, nothing changed: a roster team matches more than one app team. Run the preview to see which.';
  end if;
end $$;

-- Copies from an earlier run: coaches unlinked, turned off and marked
-- (players are moved off them below, like any other old team)
delete from public.coach_teams where team_id in (select dup_id from _dup);
update public.teams t
set is_active = false, name = d.dup_name || ' (duplicate)'
from _dup d where t.id = d.dup_id and t.name not like '%(duplicate)';

-- Teams: add missing ones, fix names / age groups, make sure they're on
insert into public.teams (id, name, age_group, is_active)
select tm.team_id, rt.name, rt.age_group, true
from _tm tm join _rt rt using (key) where tm.status = 'new';

update public.teams t
set name = rt.name, age_group = rt.age_group, is_active = true
from _tm tm join _rt rt using (key)
where tm.status = 'matched' and rt.include and t.id = tm.team_id;

-- 12s and local teams: turn off if they're in the app (history is kept)
update public.teams t
set is_active = false
from _tm tm join _rt rt using (key)
where tm.status = 'matched' and not rt.include and t.id = tm.team_id;

-- Players only on a 12s / local team: removed from the app like the Players
-- page Remove button does (is_active off, history kept)
update public.players p
set is_active = false
from _cur c join _tm tm on tm.team_id = c.team_id and tm.status = 'matched' join _rt rt on rt.key = tm.key and not rt.include
where p.id = c.player_id
  and p.id not in (select pid from _pm)
  and not exists (select 1 from _cur c2 join public.teams t2 on t2.id = c2.team_id
                  where c2.player_id = p.id and c2.team_id <> c.team_id and coalesce(t2.is_active, false)
                    and c2.team_id not in (select team_id from _tm tm2 join _rt rt2 using (key) where not rt2.include and tm2.team_id is not null));

-- Players already in the app: roster jersey, birthday if missing, boys set to Boy, active
update public.players p
set jersey_number = r.jersey,
    date_of_birth = r.dob,
    gender = case when r.is_boys then 'M' else p.gender end,
    is_active = true
from _pm m join _rpx r using (rid)
where p.id = m.pid;

-- Name changes (app name → roster name)
update public.players p
set name = r.first || ' ' || r.last
from _pm m join _rpx r using (rid) join _ren n on n.first = r.first and n.last = r.last
where p.id = m.pid;

-- New players (PIN 1234, same as everyone else right now)
insert into public.players (id, name, pin, jersey_number, date_of_birth, gender, is_active)
select n.pid, r.first || ' ' || r.last, '1234', r.jersey, r.dob, case when r.is_boys then 'M' else 'F' end, true
from _new n join _rpx r using (rid);

-- One team per player (same as Season Rollover). Open Gym is never touched.
--  a) players on the roster: off any other team
delete from public.player_teams pt
using (select m.pid, r.team_id from _pm m join _rpx r using (rid)) x, public.teams t
where pt.player_id = x.pid and pt.team_id <> x.team_id
  and t.id = pt.team_id and not coalesce(t.is_open_gym, false);

--  b) players who are on a roster team in the app but not on its roster: off that team (account kept)
delete from public.player_teams pt
using _tm tm join _rt rt using (key)
where tm.status = 'matched' and rt.include and pt.team_id = tm.team_id
  and pt.player_id not in (select pid from _pm)
  and not exists (select 1 from _keep k join public.players kp on pg_temp.norm(kp.name) = pg_temp.norm(k.pname)
                  where k.key = tm.key and kp.id = pt.player_id);

--  c) everyone onto their roster team
insert into public.player_teams (player_id, team_id, is_primary)
select x.pid, x.team_id, true
from (select m.pid, r.team_id from _pm m join _rpx r using (rid)
      union all
      select n.pid, r.team_id from _new n join _rpx r using (rid)) x
on conflict (player_id, team_id) do nothing;

-- Coaches: team coach accounts (not admin), PIN 9876, linked to their teams
insert into public.coaches (id, name, role, pin_hash, is_active)
select coach_id, cname, 'coach', pin_hash, true from _cm where not already_there;

insert into public.coach_teams (coach_id, team_id)
select cm.coach_id, tm.team_id
from _rc rc join _cm cm using (cname) join _tm tm on tm.key = rc.team_key
on conflict do nothing;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. What this does / did, one line per item
-- ─────────────────────────────────────────────────────────────────────────
select section, team, name, what_happens from (

  -- Totals
  select 0 as s, 1 as o, '0 SUMMARY' as section, '' as team, '' as name,
         (select count(*) from _rt where include) || ' teams in the app, '
      || (select count(*) from _pm) || ' players already in the app, '
      || (select count(*) from _new) || ' new players, '
      || (select count(*) from _cm where not already_there) || ' new coach accounts'
      || case when exists (select 1 from _tm where status = 'ambiguous')
              then '  ⚠ A TEAM MATCHES MORE THAN ONE APP TEAM: the import will stop, see TEAMS' else '' end
         as what_happens

  -- Teams on the roster
  union all
  select 1, rt.key, '1 TEAMS', rt.name, rt.roster_coaches,
         case
           when not rt.include and tm.status = 'matched' and tm.old_active then 'Left out (' || rt.left_out_because || '): app team "' || tm.old_name || '" will be turned off'
           when not rt.include then 'Left out (' || rt.left_out_because || ')'
           when tm.status = 'ambiguous' then '⚠ Matches more than one app team: ' || (select string_agg('"' || c.name || '"', ', ') from _tcand c where c.key = rt.key)
           when tm.status = 'new' then 'NEW team (not found in the app)'
           when tm.old_name is distinct from rt.name or tm.old_age_group is distinct from rt.age_group or not tm.old_active then
             'Was "' || tm.old_name || '" (' || coalesce(tm.old_age_group, 'no age group') || case when tm.old_active then '' else ', off' end || ') → "' || rt.name || '" (' || rt.age_group || ')'
           else 'Already in the app, no change'
         end
  from _rt rt join _tm tm using (key)

  -- (The teams already in the app aren't listed: this script doesn't touch them)

  -- Coaches
  union all
  select 3, 0, '3 COACHES', string_agg(rt.name, ', ' order by rt.key), cm.cname,
         case when cm.already_there then 'Already in the app: linked to team(s), PIN not changed'
              else 'NEW team coach (not admin), PIN 9876' end
  from _cm cm join _rc rc using (cname) join _rt rt on rt.key = rc.team_key
  group by cm.cname, cm.already_there

  -- Players already in the app
  union all
  select 4, r.team_key, case when m.needs_check then '4 PLAYERS: CHECK THESE MATCHES' else '5 PLAYERS ALREADY IN APP' end,
         r.team_name,
         p.name || case when p.n <> r.rn then '  (roster: ' || r.first || ' ' || r.last || ')' else '' end,
         coalesce(nullif(concat_ws('; ',
           case when m.needs_check then 'matched by ' || m.how end,
           (select 'name changes to ' || r.first || ' ' || r.last from _ren n
             where n.first = r.first and n.last = r.last and p.name <> r.first || ' ' || r.last),
           case when not p.is_active then 'was removed, will be turned back on' end,
           (select 'moves from ' || string_agg(c.team_name, ', ') from _cur c where c.player_id = p.id and c.team_id <> r.team_id),
           case when not exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)
                 and not exists (select 1 from _cur c where c.player_id = p.id) then 'added to team' end,
           case when p.jersey is distinct from r.jersey then 'jersey ' || coalesce(p.jersey, 'none') || ' → ' || r.jersey end,
           case when p.dob is null then 'birthday added' when p.dob <> r.dob then 'birthday ' || p.dob || ' → ' || r.dob end,
           case when r.is_boys and p.gender is distinct from 'M' then 'set to Boy' end,
           (select 'the app has ' || count(*) || ' other player(s) with this name: left alone, check'
                   from _p p2 where p2.n = r.rn and p2.id <> p.id having count(*) > 0)), ''), 'No change')
  from _pm m join _rpx r using (rid) join _p p on p.id = m.pid

  -- New players
  union all
  select 6, r.team_key, '6 NEW PLAYERS', r.team_name, r.first || ' ' || r.last,
         'Added: #' || r.jersey || ', born ' || r.dob || ', PIN 1234'
         || coalesce('  (app also has: ' || (select string_agg(p.name, ', ') from _p p
                     where pg_temp.same_last(p.name, r.last) and p.id not in (select pid from _pm)) || ', same last name, check)', '')
  from _new n join _rpx r using (rid)

  -- Taken off a team
  union all
  select 7, tm.key, '7 TAKEN OFF TEAM', rt.name, p.name,
         'Not on this roster: taken off the team. Account and history kept'
         || case when (select count(*) from _cur c2 where c2.player_id = p.id) = 1 then ' (now not on any team)' else '' end
  from _cur c join _tm tm on tm.team_id = c.team_id and tm.status = 'matched'
  join _rt rt on rt.key = tm.key and rt.include
  join _p p on p.id = c.player_id
  where c.player_id not in (select pid from _pm)
    and not exists (select 1 from _keep k where k.key = tm.key and pg_temp.norm(k.pname) = p.n)

  -- Practice players kept on their team
  union all
  select 7, tm.key, '7 KEPT ON TEAM', rt.name, p.name, 'Practice player (not on the website roster): stays on the team'
  from _cur c join _tm tm on tm.team_id = c.team_id and tm.status = 'matched'
  join _rt rt on rt.key = tm.key and rt.include
  join _p p on p.id = c.player_id
  join _keep k on k.key = tm.key and pg_temp.norm(k.pname) = p.n
  where c.player_id not in (select pid from _pm)

  -- Players on a team that is being turned off
  union all
  select 8, tm.key, '8 ON A LEFT-OUT TEAM', rt.name, p.name, 'Removed from the app (team left out), workout history kept'
  from _cur c join _tm tm on tm.team_id = c.team_id and tm.status = 'matched' and tm.old_active
  join _rt rt on rt.key = tm.key and not rt.include
  join _p p on p.id = c.player_id and p.is_active
  where c.player_id not in (select pid from _pm)

) report
order by s, o, team, name;
