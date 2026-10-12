-- FILE: supabase/migrations/2026-10-12_player_gender.sql
--
-- Girl / Boy setting on each player.
--
-- Until now the app guessed boys and girls from the team name ("boy"
-- anywhere in it = boys). Now each player has their own setting:
--
--   players.gender   'F' = girl (the default for every player), 'M' = boy
--
-- The coach changes it with the Girl / Boy switch on the Edit Player
-- window (Players page). The leaderboard, the players page filter and the
-- comparisons page all go by this setting.
--
-- When the column is first added, everyone currently on a team with "boy"
-- in its name is set to Boy. Running the script again does nothing, so it
-- never undoes a change made on the Edit Player window.
--
-- Run once in BOTH Supabase projects (Vortex and Bruisers Lacrosse), in the
-- SQL Editor, BEFORE the app update is merged. Bruisers Lacrosse has no
-- boys teams, so there every player simply stays Girl.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'gender'
  ) then
    alter table public.players
      add column gender text default 'F' not null
      constraint players_gender_check check (gender in ('F', 'M'));

    update public.players p
    set gender = 'M'
    where exists (
      select 1
      from public.player_teams pt
      join public.teams t on t.id = pt.team_id
      where pt.player_id = p.id
        and t.name ilike '%boy%'
    );
  end if;
end $$;

-- Check: how many girls and boys there are now
select gender, count(*) as players from public.players where is_active group by gender order by gender;
