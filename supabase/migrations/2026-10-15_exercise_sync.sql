-- FILE: supabase/migrations/2026-10-15_exercise_sync.sql
--
-- Exercise library Sync (Bruisers Lacrosse).
--
-- The Sync button on the coach Exercise Library page brings in new and
-- changed exercises from the source site's exercise feed
-- (app/api/exercise-feed/route.ts). This table remembers, for each source
-- exercise, which exercise here it became:
--
--   source_id     the exercise's id on the source site
--   exercise_id   the exercise here. Empty (null) = not wanted here: either
--                 the coach tapped "Not for this team", or the exercise was
--                 deleted here. Either way Sync won't offer it again.
--   synced_hash   fingerprint of the exercise here right after the last sync.
--                 If the exercise here no longer matches it, it was edited
--                 here, and Sync leaves it alone. Empty = never synced (it
--                 was already here and differed), also left alone.
--   synced_at     last time Sync touched it
--
-- Only the Bruisers Lacrosse site writes to this table. Vortex never does,
-- so it just sits empty there.
--
-- Safe to run more than once. Run in BOTH Supabase projects (Vortex and
-- Bruisers Lacrosse), in the SQL Editor, BEFORE the app update is merged.

create table if not exists public.exercise_sync (
  "source_id" uuid not null primary key,
  "exercise_id" uuid references public.exercise_library(id) on delete set null,
  "synced_hash" text,
  "synced_at" timestamp with time zone default now()
);

-- One source exercise per exercise here
create unique index if not exists exercise_sync_exercise_id_key
  on public.exercise_sync (exercise_id) where exercise_id is not null;

-- Same as every other table: no public access, only the server (service role)
alter table public.exercise_sync enable row level security;
