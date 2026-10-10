-- FILE: supabase/migrations/2026-10-10_exercise_levels_and_change_requests.sql
--
-- 1. EXERCISE LEVELS (easier / harder versions of the same movement)
--    Exercises that are versions of one movement share a family name and
--    each gets a level, 1 = easiest. Each one is still its own exercise
--    with its own clip, logs and PRs. Example:
--
--      Bulgarian Split Squat   level 1  Bodyweight Bulgarian Split Squat
--                              level 2  DB Bulgarian Split Squat
--                              level 3  Barbell Bulgarian Split Squat
--
--    exercise_library.variation_family   family name (blank = not in a family)
--    exercise_library.variation_level    1 = easiest
--    exercise_library.backup_exercise_id the recommended backup exercise
--                                        (a different movement for the same area)
--
-- 2. EXERCISE CHANGE REQUESTS
--    Players on team workouts can't change an exercise themselves. They send
--    a request (why: sore / painful / too easy / …, where, how much it hurts)
--    and the coach approves it with an easier or harder level, the backup,
--    or any other exercise (e.g. a rehab/prehab exercise), for today only or
--    until the coach ends it. Approving adds a normal player replacement
--    (player_exercise_skips), the same thing the coach can add on a
--    player's page. (This also fixes "Replace with…" on the player's page,
--    which the database was rejecting.)
--    Self-guided players still pick their own easier option; each swap is
--    saved here too (kind = 'self_guided_swap') so the coach sees it.
--
-- Run once in BOTH Supabase projects (Vortex and Bruisers Lacrosse), in the
-- SQL Editor, before the app update is merged. Safe to run again.

alter table public.exercise_library add column if not exists variation_family text;
alter table public.exercise_library add column if not exists variation_level integer;
alter table public.exercise_library add column if not exists backup_exercise_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exercise_library_variation_level_check') then
    alter table public.exercise_library
      add constraint exercise_library_variation_level_check
      check (variation_level is null or variation_level between 1 and 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exercise_library_backup_exercise_id_fkey') then
    alter table public.exercise_library
      add constraint exercise_library_backup_exercise_id_fkey
      foreign key (backup_exercise_id) references public.exercise_library(id) on delete set null;
  end if;
end $$;

create index if not exists idx_exercise_library_variation_family
  on public.exercise_library (lower(variation_family))
  where variation_family is not null;

-- Player replacements: allow skip_type 'replace'. The player page's
-- "Replace with…" option and approved change requests both use it; before
-- this only 'avoid' and 'rehab' were allowed, so saving a replacement failed.
alter table public.player_exercise_skips drop constraint if exists player_exercise_skips_skip_type_check;
alter table public.player_exercise_skips
  add constraint player_exercise_skips_skip_type_check
  check (skip_type = any (array['avoid', 'rehab', 'replace']));

create table if not exists public.exercise_change_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  slot text,                                       -- which spot in the workout
  template_id uuid,
  exercise_id uuid references public.exercise_library(id) on delete set null,          -- what the player was shown
  original_exercise_id uuid references public.exercise_library(id) on delete set null, -- what the workout calls for
  kind text not null default 'request' check (kind in ('request', 'self_guided_swap')),
  wants text check (wants in ('easier', 'harder', 'different')),
  reason text check (reason in ('sore', 'painful', 'too_easy', 'too_hard', 'equipment', 'other')),
  body_part text,
  pain_level integer check (pain_level is null or pain_level between 0 and 10),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'noted', 'cancelled')),
  replacement_exercise_id uuid references public.exercise_library(id) on delete set null,
  applies text check (applies in ('today', 'ongoing')),
  skip_id uuid references public.player_exercise_skips(id) on delete set null,
  coach_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  coach_seen_at timestamptz
);

create index if not exists idx_change_requests_open
  on public.exercise_change_requests (created_at desc)
  where status = 'pending' or coach_seen_at is null;
create index if not exists idx_change_requests_player
  on public.exercise_change_requests (player_id, created_at desc);
create index if not exists idx_change_requests_session
  on public.exercise_change_requests (session_id);

-- Same as every other table: no public access, the app's server reads and writes it
alter table public.exercise_change_requests enable row level security;
grant all on table public.exercise_change_requests to service_role;
