-- FILE: supabase/migrations/2026-10-21_coach_accounts.sql
--
-- Coach and admin accounts (both sites).
--
-- Before this, everyone used one shared coach PIN (COACH_PIN in Vercel) and
-- saw the whole club. Now each coach or admin has their own name and 4-digit
-- PIN:
--
--   coaches          one row per person (or shared account, like
--                    "Athletic Training Staff")
--     role           'coach'  sees only the teams in coach_teams: their
--                             players, health board, workout logs and
--                             exercise change requests. Can approve requests
--                             and add injuries / health notes for their
--                             players. Can't change workouts, schedules, the
--                             week plan, teams, rosters or the exercise library.
--                    'admin'  sees and changes everything
--     pin_hash       the PIN, scrambled (PBKDF2), never stored as typed
--     session_version  goes up when the PIN is changed or the account is
--                    turned off, which signs that person out everywhere
--   coach_teams      which teams a coach is on (any number)
--
-- Coaches sign in from the main screen: team → their name (tagged "Coach")
-- → PIN. Admins use the small "Admin" link at the bottom of the main screen.
--
-- First-time setup: until at least one active admin exists, the old shared
-- COACH_PIN still opens the coach side (as an admin), so the first admin
-- accounts can be added on Coach → Coaches. Once an admin account exists,
-- the shared PIN stops working.
--
-- Safe to run more than once. Run in BOTH Supabase projects (Vortex and
-- Bruisers Lacrosse), in the SQL Editor, BEFORE the app update is merged.

create table if not exists public.coaches (
  "id" uuid primary key default gen_random_uuid(),
  "name" text not null,
  "role" text not null default 'coach' check (role in ('coach', 'admin')),
  "pin_hash" text not null,
  "is_active" boolean not null default true,
  "session_version" integer not null default 1,
  "last_signin_at" timestamp with time zone,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now()
);

create table if not exists public.coach_teams (
  "coach_id" uuid not null references public.coaches(id) on delete cascade,
  "team_id" uuid not null references public.teams(id) on delete cascade,
  primary key (coach_id, team_id)
);

create index if not exists idx_coach_teams_team on public.coach_teams (team_id);

-- Same as every other table: no public access, only the server (service role)
alter table public.coaches enable row level security;
alter table public.coach_teams enable row level security;
grant all on table public.coaches to service_role;
grant all on table public.coach_teams to service_role;
