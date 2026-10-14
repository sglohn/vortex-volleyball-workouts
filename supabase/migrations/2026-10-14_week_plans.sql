-- FILE: supabase/migrations/2026-10-14_week_plans.sql
--
-- Weekly workout plans (Bruisers Lacrosse).
--
-- Lacrosse players don't have set weight room days. Each week the team has
-- an ordered list of workouts (Day 1, Day 2, ... up to 7) that players do in
-- order, one per day, whenever they can that week. Weeks run Monday to
-- Sunday (club time). See lib/weekPlan.ts.
--
--   week_plans            one row per team per week (week_start = the Monday).
--                         A week with no row uses the most recent earlier
--                         week that has workouts (the plan rolls forward).
--                         A row with no slots = an off week.
--   week_plan_slots       the workouts in a plan, in order (slot 1, 2, 3...)
--   sessions.template_id  the workout this session is for (week plan sessions)
--   sessions.week_start   the week the session counts toward
--   sessions.week_slot    which Day of that week (1, 2, 3...)
--
-- Vortex never writes to any of these, so nothing changes there. The table
-- and columns just sit unused.
--
-- Safe to run more than once. Run in BOTH Supabase projects (Vortex and
-- Bruisers Lacrosse), in the SQL Editor, BEFORE the app update is merged.

create table if not exists public.week_plans (
  "id" uuid default gen_random_uuid() not null primary key,
  "team_id" uuid not null references public.teams(id) on delete cascade,
  "week_start" date not null,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  constraint week_plans_team_week_key unique (team_id, week_start),
  -- week_start is always a Monday (ISO day 1)
  constraint week_plans_monday_check check (extract(isodow from week_start) = 1)
);

create table if not exists public.week_plan_slots (
  "id" uuid default gen_random_uuid() not null primary key,
  "plan_id" uuid not null references public.week_plans(id) on delete cascade,
  "slot" integer not null,
  -- Deleting a workout leaves the slot empty; the app skips empty slots
  "template_id" uuid references public.workout_templates(id) on delete set null,
  constraint week_plan_slots_plan_slot_key unique (plan_id, slot),
  constraint week_plan_slots_slot_check check (slot between 1 and 7)
);

alter table public.sessions
  add column if not exists template_id uuid references public.workout_templates(id) on delete set null;
alter table public.sessions
  add column if not exists week_start date;
alter table public.sessions
  add column if not exists week_slot integer;

-- One session per player per Day per week. Keeps a double-tap on sign-in
-- from making two Day 2 sessions, and means an unfinished Day 2 is always
-- picked back up rather than started over.
create unique index if not exists sessions_player_week_slot_key
  on public.sessions (player_id, week_start, week_slot)
  where week_slot is not null;

create index if not exists idx_week_plans_team_week
  on public.week_plans (team_id, week_start desc);

-- Same lock-down as every other table: the app reaches these only through
-- its server (service role), never straight from the browser.
alter table public.week_plans enable row level security;
alter table public.week_plan_slots enable row level security;
