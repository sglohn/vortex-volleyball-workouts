-- FILE: supabase/migrations/2026-10-08_session_rating.sql
--
-- Stores the player's end-of-workout rating (Easy / Medium / Hard) and
-- optional note on the session, so coaches can see it in Workout Logs.
--
-- Run once in BOTH Supabase projects (Vortex and Bruiser Lacrosse), in the
-- SQL Editor, before the app update is merged. Safe to run again.

alter table public.sessions add column if not exists rating text;
alter table public.sessions add column if not exists rating_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_rating_check') then
    alter table public.sessions
      add constraint sessions_rating_check check (rating is null or rating in ('easy', 'medium', 'hard'));
  end if;
end $$;
