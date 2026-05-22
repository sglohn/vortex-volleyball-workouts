-- ============================================================
-- VORTEX VOLLEYBALL WORKOUT TRACKER — SUPABASE SCHEMA
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- PLAYERS table
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin text not null,                  -- 4-digit PIN, stored as text
  jersey_number text,
  position text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ATHLETE MEASUREMENTS (height, wingspan, reach, verticals)
-- Stored as dated snapshots so changes are tracked over time
create table if not exists measurements (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  measured_at date not null default current_date,
  height_in numeric(5,2),             -- height in inches (e.g. 72.5)
  wingspan_in numeric(5,2),
  standing_reach_in numeric(5,2),
  standing_vertical_in numeric(5,2),
  approach_vertical_in numeric(5,2),
  notes text,
  created_at timestamptz default now()
);

-- WORKOUTS — coach-created workout templates
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  is_active boolean default true,     -- only one workout is "active" at a time
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- EXERCISES within a workout
create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid references workouts(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  sets integer not null default 3,
  reps integer not null default 10,
  rest_seconds integer default 90,
  notes text                          -- coaching cues, e.g. "keep chest up"
);

-- SESSIONS — each time a player checks in
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  workout_id uuid references workouts(id) on delete set null,
  checked_in_at timestamptz default now(),
  completed_at timestamptz,           -- null until they finish
  notes text
);

-- SET LOGS — weight and reps logged per set per exercise per session
create table if not exists set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  exercise_id uuid references exercises(id) on delete cascade,
  set_number integer not null,        -- 1, 2, 3...
  reps_completed integer,
  weight_lbs numeric(6,2),
  completed boolean default false,
  logged_at timestamptz default now()
);

-- ============================================================
-- INDEXES for fast queries
-- ============================================================
create index if not exists idx_sessions_player on sessions(player_id);
create index if not exists idx_sessions_workout on sessions(workout_id);
create index if not exists idx_set_logs_session on set_logs(session_id);
create index if not exists idx_set_logs_exercise on set_logs(exercise_id);
create index if not exists idx_measurements_player on measurements(player_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- Enable RLS so players can only read/write their own data.
-- The coach uses the service_role key (server-side only).
-- ============================================================
alter table players enable row level security;
alter table measurements enable row level security;
alter table workouts enable row level security;
alter table exercises enable row level security;
alter table sessions enable row level security;
alter table set_logs enable row level security;

-- Allow all reads/writes via the service_role (used in API routes)
-- Public anon key gets read-only on workouts/exercises (for displaying the workout)
create policy "anon can read active workouts" on workouts
  for select using (is_active = true);

create policy "anon can read exercises" on exercises
  for select using (true);

-- Service role bypasses RLS automatically, so API routes work fine.

-- ============================================================
-- SEED — optional sample workout to get you started
-- ============================================================
insert into workouts (title, description, is_active) values
  ('Week 1 — Strength Foundation', 'Focus on form. Lower weight, higher reps.', true)
on conflict do nothing;

-- You can add sample exercises after noting the workout id, or use the coach dashboard.
