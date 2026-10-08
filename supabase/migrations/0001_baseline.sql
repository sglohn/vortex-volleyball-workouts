-- FILE: supabase/migrations/0001_baseline.sql
--
-- Full database structure, taken from the live Vortex database on
-- Oct 8, 2026 (after the auth_attempts and close_public_access changes).
-- Replaces the out-of-date supabase/schema.sql for building a new database.
--
-- Use it to set up a NEW, EMPTY Supabase project (the Bruiser Lacrosse
-- database). Run once in that project's SQL Editor. It creates tables only;
-- no data. Run it once only (a second run stops at "already exists").
-- Do not run it on the Vortex database.
--
-- Access: row level security is on for every table with no public
-- policies, so only the app's server (service role key) can read or write.
-- The "exercise-media" storage bucket is public for viewing photos only.

create extension if not exists pgcrypto;

-- auth_attempts
create table if not exists public.auth_attempts (
  "key" text not null,
  "failed_count" integer default 0 not null,
  "locked_until" timestamp with time zone,
  "updated_at" timestamp with time zone default now() not null
);

-- body_checks
create table if not exists public.body_checks (
  "id" uuid default gen_random_uuid() not null,
  "session_id" uuid,
  "player_id" uuid,
  "regions" jsonb default '{}'::jsonb not null,
  "checked_at" timestamp with time zone default now()
);

-- coach_accounts
create table if not exists public.coach_accounts (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "pin" text not null,
  "role" text default 'assistant'::text,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now()
);

-- exercise_anchor_ratios
create table if not exists public.exercise_anchor_ratios (
  "id" uuid default gen_random_uuid() not null,
  "exercise_id" uuid,
  "anchor_exercise_id" uuid not null,
  "ratio" numeric(5,3) not null,
  "confidence" text default 'medium'::text not null,
  "notes" text,
  "created_at" timestamp with time zone default now() not null
);

-- exercise_library
create table if not exists public.exercise_library (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "category" text,
  "default_sets" integer default 3,
  "default_reps" text,
  "logs_weight" boolean default false,
  "logs_velocity" boolean default false,
  "coaching_notes" text,
  "demo_url" text,
  "demo_image_url" text,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "start_image_url" text,
  "end_image_url" text,
  "start_image_position" text default '50% 50%'::text,
  "end_image_position" text default '50% 50%'::text,
  "equipment" text
);

-- exercises
create table if not exists public.exercises (
  "id" uuid default gen_random_uuid() not null,
  "workout_id" uuid,
  "name" text not null,
  "sort_order" integer default 0 not null,
  "sets" integer default 3 not null,
  "reps" integer default 10 not null,
  "rest_seconds" integer default 90,
  "notes" text
);

-- health_reports
create table if not exists public.health_reports (
  "id" uuid default gen_random_uuid() not null,
  "player_id" uuid,
  "report_type" text not null,
  "body_part" text not null,
  "description" text,
  "pain_level" integer,
  "reported_at" timestamp with time zone default now(),
  "reported_by" text default 'player'::text,
  "confirmed_by_coach" boolean default false,
  "coach_notes" text,
  "expected_return" date,
  "status" text default 'active'::text,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone default now(),
  "injury_type" text,
  "severity" text,
  "coach_created" boolean default false not null,
  "last_reported_at" timestamp with time zone default now(),
  "report_count" integer default 1 not null
);

-- measurements
create table if not exists public.measurements (
  "id" uuid default gen_random_uuid() not null,
  "player_id" uuid,
  "measured_at" date default CURRENT_DATE not null,
  "height_in" numeric(5,2),
  "wingspan_in" numeric(5,2),
  "standing_reach_in" numeric(5,2),
  "standing_vertical_in" numeric(5,2),
  "approach_vertical_in" numeric(5,2),
  "notes" text,
  "created_at" timestamp with time zone default now(),
  "acceleration_sec" numeric,
  "pro_agility_sec" numeric,
  "swing_velocity_mph" numeric
);

-- ovr_logs
create table if not exists public.ovr_logs (
  "id" uuid default gen_random_uuid() not null,
  "player_id" uuid,
  "session_id" uuid,
  "exercise_id" uuid,
  "log_type" text not null,
  "value" numeric(8,3) not null,
  "weight_lbs" numeric(6,2),
  "notes" text,
  "logged_at" timestamp with time zone default now()
);

-- player_exercise_skips
create table if not exists public.player_exercise_skips (
  "id" uuid default gen_random_uuid() not null,
  "player_id" uuid,
  "exercise_id" uuid,
  "reason" text,
  "starts_on" date default CURRENT_DATE not null,
  "ends_on" date,
  "created_by" text default 'coach'::text,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "replacement_exercise_id" uuid,
  "skip_type" text default 'avoid'::text
);

-- player_overrides
create table if not exists public.player_overrides (
  "id" uuid default gen_random_uuid() not null,
  "player_id" uuid,
  "template_id" uuid,
  "override_date" date not null,
  "reason" text,
  "created_at" timestamp with time zone default now()
);

-- player_programs
create table if not exists public.player_programs (
  "id" uuid default gen_random_uuid() not null,
  "player_id" uuid,
  "name" text not null,
  "template_sequence" jsonb default '[]'::jsonb not null,
  "periodization_mode" text default 'auto'::text,
  "phase_cycle" jsonb default '[{"phase": "build", "weeks": 4}, {"phase": "pre_tournament", "weeks": 2}, {"phase": "recovery", "weeks": 1}]'::jsonb,
  "manual_phases" jsonb default '[]'::jsonb,
  "started_on" date default CURRENT_DATE,
  "ended_on" date,
  "is_active" boolean default true,
  "notes" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);

-- player_teams
create table if not exists public.player_teams (
  "id" uuid default gen_random_uuid() not null,
  "player_id" uuid,
  "team_id" uuid,
  "is_primary" boolean default true,
  "joined_at" date default CURRENT_DATE
);

-- players
create table if not exists public.players (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "pin" text not null,
  "jersey_number" text,
  "position" text,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "date_of_birth" date
);

-- schedule_exercise_overrides
create table if not exists public.schedule_exercise_overrides (
  "id" uuid default gen_random_uuid() not null,
  "schedule_id" uuid,
  "original_block_exercise_id" uuid,
  "replacement_exercise_id" uuid,
  "custom_reps" text,
  "custom_notes" text,
  "created_at" timestamp with time zone default now()
);

-- session_blocks
create table if not exists public.session_blocks (
  "id" uuid default gen_random_uuid() not null,
  "session_id" uuid,
  "block_label" text not null,
  "started_at" timestamp with time zone default now(),
  "completed_at" timestamp with time zone,
  "sort_order" integer default 0
);

-- sessions
create table if not exists public.sessions (
  "id" uuid default gen_random_uuid() not null,
  "player_id" uuid,
  "workout_id" uuid,
  "checked_in_at" timestamp with time zone default now(),
  "completed_at" timestamp with time zone,
  "notes" text,
  "team_id" uuid
);

-- set_logs
create table if not exists public.set_logs (
  "id" uuid default gen_random_uuid() not null,
  "session_id" uuid,
  "exercise_id" uuid,
  "set_number" integer not null,
  "reps_completed" integer,
  "weight_lbs" numeric(6,2),
  "completed" boolean default false,
  "logged_at" timestamp with time zone default now(),
  "block_id" text,
  "velocity_ms" numeric
);

-- team_schedule
create table if not exists public.team_schedule (
  "id" uuid default gen_random_uuid() not null,
  "team_id" uuid,
  "template_id" uuid,
  "scheduled_date" date not null,
  "notes" text,
  "created_at" timestamp with time zone default now()
);

-- teams
create table if not exists public.teams (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "age_group" text,
  "color" text default '#4ade80'::text,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "is_open_gym" boolean default false not null
);

-- template_block_exercises
create table if not exists public.template_block_exercises (
  "id" uuid default gen_random_uuid() not null,
  "block_id" uuid,
  "exercise_id" uuid,
  "custom_reps" text,
  "custom_notes" text,
  "sort_order" integer default 0 not null,
  "target_velocity_min" numeric,
  "target_velocity_max" numeric
);

-- template_blocks
create table if not exists public.template_blocks (
  "id" uuid default gen_random_uuid() not null,
  "template_id" uuid,
  "block_label" text not null,
  "sets" integer default 3 not null,
  "sort_order" integer default 0 not null
);

-- training_phases
create table if not exists public.training_phases (
  "id" uuid default gen_random_uuid() not null,
  "team_id" uuid,
  "phase_type" text not null,
  "name" text not null,
  "description" text,
  "intensity_target" text,
  "starts_on" date not null,
  "ends_on" date not null,
  "created_at" timestamp with time zone default now()
);

-- vbt_anchor_exercises
create table if not exists public.vbt_anchor_exercises (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "slug" text not null,
  "category" text not null,
  "mvt_default" numeric(4,3) not null,
  "mvt_label" text not null,
  "typical_load_min_pct" integer default 40 not null,
  "typical_load_max_pct" integer default 85 not null,
  "notes" text,
  "sort_order" integer default 0 not null
);

-- vbt_data_points
create table if not exists public.vbt_data_points (
  "id" uuid default gen_random_uuid() not null,
  "test_id" uuid not null,
  "load_lbs" numeric(6,1) not null,
  "reps_performed" integer default 3 not null,
  "best_velocity_ms" numeric(5,3) not null,
  "notes" text,
  "created_at" timestamp with time zone default now() not null
);

-- vbt_profiles
create table if not exists public.vbt_profiles (
  "id" uuid default gen_random_uuid() not null,
  "player_id" uuid not null,
  "anchor_exercise_id" uuid,
  "estimated_1rm_lbs" numeric(6,1),
  "mvt_used" numeric(4,3),
  "velocity_at_light" numeric(5,3),
  "velocity_at_heavy" numeric(5,3),
  "load_light_lbs" numeric(6,1),
  "load_heavy_lbs" numeric(6,1),
  "r_squared" numeric(4,3),
  "source_test_id" uuid,
  "calculated_at" timestamp with time zone default now() not null,
  "exercise_id" uuid,
  "slope" numeric,
  "v_intercept" numeric
);

-- vbt_tests
create table if not exists public.vbt_tests (
  "id" uuid default gen_random_uuid() not null,
  "player_id" uuid not null,
  "anchor_exercise_id" uuid,
  "tested_at" date default CURRENT_DATE not null,
  "mvt_override" numeric(4,3),
  "notes" text,
  "created_by_coach" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "exercise_id" uuid
);

-- workout_templates
create table if not exists public.workout_templates (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "description" text,
  "phase_type" text,
  "warmup_notes" text,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);

-- workouts
create table if not exists public.workouts (
  "id" uuid default gen_random_uuid() not null,
  "title" text not null,
  "description" text,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);

-- Primary keys, unique and check rules
alter table public.auth_attempts add constraint "auth_attempts_pkey" PRIMARY KEY (key);
alter table public.body_checks add constraint "body_checks_pkey" PRIMARY KEY (id);
alter table public.coach_accounts add constraint "coach_accounts_pkey" PRIMARY KEY (id);
alter table public.exercise_anchor_ratios add constraint "exercise_anchor_ratios_pkey" PRIMARY KEY (id);
alter table public.exercise_anchor_ratios add constraint "exercise_anchor_ratios_exercise_id_anchor_exercise_id_key" UNIQUE (exercise_id, anchor_exercise_id);
alter table public.exercise_library add constraint "exercise_library_category_check" CHECK ((category = ANY (ARRAY['Upper - Push'::text, 'Upper - Pull'::text, 'Lower - Quad'::text, 'Lower - Hamstring'::text, 'Lower - Hip/Glute'::text, 'Core'::text, 'Power'::text, 'Conditioning'::text, 'Mobility'::text, 'Other'::text])));
alter table public.exercise_library add constraint "exercise_library_equipment_check" CHECK (((equipment IS NULL) OR (equipment = ANY (ARRAY['barbell'::text, 'dumbbell_1'::text, 'dumbbell_2'::text, 'landmine'::text, 'other'::text]))));
alter table public.exercise_library add constraint "exercise_library_pkey" PRIMARY KEY (id);
alter table public.exercise_library add constraint "exercise_library_name_key" UNIQUE (name);
alter table public.exercises add constraint "exercises_pkey" PRIMARY KEY (id);
alter table public.health_reports add constraint "health_reports_report_type_check" CHECK ((report_type = ANY (ARRAY['major_injury'::text, 'nagging_pain'::text, 'soreness'::text])));
alter table public.health_reports add constraint "health_reports_severity_check" CHECK ((severity = ANY (ARRAY['mild'::text, 'moderate'::text, 'severe'::text])));
alter table public.health_reports add constraint "health_reports_pkey" PRIMARY KEY (id);
alter table public.measurements add constraint "measurements_pkey" PRIMARY KEY (id);
alter table public.ovr_logs add constraint "ovr_logs_pkey" PRIMARY KEY (id);
alter table public.player_exercise_skips add constraint "player_exercise_skips_skip_type_check" CHECK ((skip_type = ANY (ARRAY['avoid'::text, 'rehab'::text])));
alter table public.player_exercise_skips add constraint "player_exercise_skips_pkey" PRIMARY KEY (id);
alter table public.player_overrides add constraint "player_overrides_pkey" PRIMARY KEY (id);
alter table public.player_overrides add constraint "player_overrides_player_id_override_date_key" UNIQUE (player_id, override_date);
alter table public.player_programs add constraint "player_programs_periodization_mode_check" CHECK ((periodization_mode = ANY (ARRAY['auto'::text, 'manual'::text])));
alter table public.player_programs add constraint "player_programs_pkey" PRIMARY KEY (id);
alter table public.player_teams add constraint "player_teams_pkey" PRIMARY KEY (id);
alter table public.player_teams add constraint "player_teams_player_id_team_id_key" UNIQUE (player_id, team_id);
alter table public.players add constraint "players_pkey" PRIMARY KEY (id);
alter table public.schedule_exercise_overrides add constraint "schedule_exercise_overrides_pkey" PRIMARY KEY (id);
alter table public.schedule_exercise_overrides add constraint "schedule_exercise_overrides_schedule_id_original_block_exer_key" UNIQUE (schedule_id, original_block_exercise_id);
alter table public.session_blocks add constraint "session_blocks_pkey" PRIMARY KEY (id);
alter table public.sessions add constraint "sessions_pkey" PRIMARY KEY (id);
alter table public.set_logs add constraint "set_logs_pkey" PRIMARY KEY (id);
alter table public.team_schedule add constraint "team_schedule_pkey" PRIMARY KEY (id);
alter table public.team_schedule add constraint "team_schedule_team_id_scheduled_date_key" UNIQUE (team_id, scheduled_date);
alter table public.teams add constraint "teams_pkey" PRIMARY KEY (id);
alter table public.template_block_exercises add constraint "template_block_exercises_pkey" PRIMARY KEY (id);
alter table public.template_blocks add constraint "template_blocks_pkey" PRIMARY KEY (id);
alter table public.training_phases add constraint "training_phases_pkey" PRIMARY KEY (id);
alter table public.vbt_anchor_exercises add constraint "vbt_anchor_exercises_pkey" PRIMARY KEY (id);
alter table public.vbt_anchor_exercises add constraint "vbt_anchor_exercises_slug_key" UNIQUE (slug);
alter table public.vbt_data_points add constraint "vbt_data_points_pkey" PRIMARY KEY (id);
alter table public.vbt_profiles add constraint "vbt_profiles_pkey" PRIMARY KEY (id);
alter table public.vbt_profiles add constraint "vbt_profiles_player_id_anchor_exercise_id_key" UNIQUE (player_id, anchor_exercise_id);
alter table public.vbt_tests add constraint "vbt_tests_pkey" PRIMARY KEY (id);
alter table public.workout_templates add constraint "workout_templates_pkey" PRIMARY KEY (id);
alter table public.workouts add constraint "workouts_pkey" PRIMARY KEY (id);

-- Links between tables
alter table public.body_checks add constraint "body_checks_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;
alter table public.body_checks add constraint "body_checks_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;
alter table public.exercise_anchor_ratios add constraint "exercise_anchor_ratios_anchor_exercise_id_fkey" FOREIGN KEY (anchor_exercise_id) REFERENCES public.vbt_anchor_exercises(id) ON DELETE RESTRICT;
alter table public.exercise_anchor_ratios add constraint "exercise_anchor_ratios_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;
alter table public.exercises add constraint "exercises_workout_id_fkey" FOREIGN KEY (workout_id) REFERENCES public.workouts(id) ON DELETE CASCADE;
alter table public.health_reports add constraint "health_reports_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;
alter table public.measurements add constraint "measurements_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;
alter table public.ovr_logs add constraint "ovr_logs_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercise_library(id) ON DELETE SET NULL;
alter table public.ovr_logs add constraint "ovr_logs_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;
alter table public.ovr_logs add constraint "ovr_logs_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;
alter table public.player_exercise_skips add constraint "player_exercise_skips_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercise_library(id) ON DELETE CASCADE;
alter table public.player_exercise_skips add constraint "player_exercise_skips_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;
alter table public.player_exercise_skips add constraint "player_exercise_skips_replacement_exercise_id_fkey" FOREIGN KEY (replacement_exercise_id) REFERENCES public.exercise_library(id) ON DELETE SET NULL;
alter table public.player_overrides add constraint "player_overrides_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;
alter table public.player_overrides add constraint "player_overrides_template_id_fkey" FOREIGN KEY (template_id) REFERENCES public.workout_templates(id) ON DELETE SET NULL;
alter table public.player_programs add constraint "player_programs_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;
alter table public.player_teams add constraint "player_teams_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;
alter table public.player_teams add constraint "player_teams_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
alter table public.schedule_exercise_overrides add constraint "schedule_exercise_overrides_original_block_exercise_id_fkey" FOREIGN KEY (original_block_exercise_id) REFERENCES public.template_block_exercises(id) ON DELETE CASCADE;
alter table public.schedule_exercise_overrides add constraint "schedule_exercise_overrides_replacement_exercise_id_fkey" FOREIGN KEY (replacement_exercise_id) REFERENCES public.exercise_library(id) ON DELETE SET NULL;
alter table public.schedule_exercise_overrides add constraint "schedule_exercise_overrides_schedule_id_fkey" FOREIGN KEY (schedule_id) REFERENCES public.team_schedule(id) ON DELETE CASCADE;
alter table public.session_blocks add constraint "session_blocks_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;
alter table public.sessions add constraint "sessions_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;
alter table public.sessions add constraint "sessions_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
alter table public.sessions add constraint "sessions_workout_id_fkey" FOREIGN KEY (workout_id) REFERENCES public.workouts(id) ON DELETE SET NULL;
alter table public.set_logs add constraint "set_logs_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;
alter table public.team_schedule add constraint "team_schedule_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
alter table public.team_schedule add constraint "team_schedule_template_id_fkey" FOREIGN KEY (template_id) REFERENCES public.workout_templates(id) ON DELETE SET NULL;
alter table public.template_block_exercises add constraint "template_block_exercises_block_id_fkey" FOREIGN KEY (block_id) REFERENCES public.template_blocks(id) ON DELETE CASCADE;
alter table public.template_block_exercises add constraint "template_block_exercises_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercise_library(id) ON DELETE CASCADE;
alter table public.template_blocks add constraint "template_blocks_template_id_fkey" FOREIGN KEY (template_id) REFERENCES public.workout_templates(id) ON DELETE CASCADE;
alter table public.training_phases add constraint "training_phases_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
alter table public.vbt_data_points add constraint "vbt_data_points_test_id_fkey" FOREIGN KEY (test_id) REFERENCES public.vbt_tests(id) ON DELETE CASCADE;
alter table public.vbt_profiles add constraint "vbt_profiles_anchor_exercise_id_fkey" FOREIGN KEY (anchor_exercise_id) REFERENCES public.vbt_anchor_exercises(id) ON DELETE RESTRICT;
alter table public.vbt_profiles add constraint "vbt_profiles_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercise_library(id) ON DELETE CASCADE;
alter table public.vbt_profiles add constraint "vbt_profiles_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;
alter table public.vbt_profiles add constraint "vbt_profiles_source_test_id_fkey" FOREIGN KEY (source_test_id) REFERENCES public.vbt_tests(id) ON DELETE SET NULL;
alter table public.vbt_tests add constraint "vbt_tests_anchor_exercise_id_fkey" FOREIGN KEY (anchor_exercise_id) REFERENCES public.vbt_anchor_exercises(id) ON DELETE RESTRICT;
alter table public.vbt_tests add constraint "vbt_tests_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercise_library(id) ON DELETE CASCADE;
alter table public.vbt_tests add constraint "vbt_tests_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_body_checks_player ON public.body_checks USING btree (player_id);
CREATE INDEX IF NOT EXISTS idx_body_checks_session ON public.body_checks USING btree (session_id);
CREATE INDEX IF NOT EXISTS exercise_anchor_ratios_exercise_id_idx ON public.exercise_anchor_ratios USING btree (exercise_id);
CREATE INDEX IF NOT EXISTS health_reports_player_part_open_idx ON public.health_reports USING btree (player_id, body_part) WHERE (status = ANY (ARRAY['active'::text, 'monitoring'::text]));
CREATE INDEX IF NOT EXISTS idx_health_reports_player ON public.health_reports USING btree (player_id);
CREATE INDEX IF NOT EXISTS idx_health_reports_reported_at ON public.health_reports USING btree (reported_at);
CREATE INDEX IF NOT EXISTS idx_health_reports_status ON public.health_reports USING btree (status);
CREATE INDEX IF NOT EXISTS idx_measurements_player ON public.measurements USING btree (player_id);
CREATE INDEX IF NOT EXISTS idx_ovr_logs_player ON public.ovr_logs USING btree (player_id);
CREATE INDEX IF NOT EXISTS idx_player_overrides_player_date ON public.player_overrides USING btree (player_id, override_date);
CREATE INDEX IF NOT EXISTS player_programs_player_id ON public.player_programs USING btree (player_id);
CREATE INDEX IF NOT EXISTS idx_player_teams_player ON public.player_teams USING btree (player_id);
CREATE INDEX IF NOT EXISTS idx_player_teams_team ON public.player_teams USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_session_blocks_session ON public.session_blocks USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_player ON public.sessions USING btree (player_id);
CREATE INDEX IF NOT EXISTS idx_sessions_workout ON public.sessions USING btree (workout_id);
CREATE INDEX IF NOT EXISTS idx_set_logs_exercise ON public.set_logs USING btree (exercise_id);
CREATE INDEX IF NOT EXISTS idx_set_logs_session ON public.set_logs USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_team_schedule_team_date ON public.team_schedule USING btree (team_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_block_exercises_block ON public.template_block_exercises USING btree (block_id);
CREATE INDEX IF NOT EXISTS idx_template_blocks_template ON public.template_blocks USING btree (template_id);
CREATE INDEX IF NOT EXISTS idx_training_phases_team ON public.training_phases USING btree (team_id);
CREATE INDEX IF NOT EXISTS vbt_data_points_test_id_idx ON public.vbt_data_points USING btree (test_id);
CREATE UNIQUE INDEX IF NOT EXISTS vbt_profiles_player_exercise_key ON public.vbt_profiles USING btree (player_id, exercise_id);
CREATE INDEX IF NOT EXISTS vbt_profiles_player_id_idx ON public.vbt_profiles USING btree (player_id);
CREATE INDEX IF NOT EXISTS vbt_tests_anchor_idx ON public.vbt_tests USING btree (anchor_exercise_id);
CREATE INDEX IF NOT EXISTS vbt_tests_player_id_idx ON public.vbt_tests USING btree (player_id);

-- Row level security on, no public policies
alter table public.auth_attempts enable row level security;
alter table public.body_checks enable row level security;
alter table public.coach_accounts enable row level security;
alter table public.exercise_anchor_ratios enable row level security;
alter table public.exercise_library enable row level security;
alter table public.exercises enable row level security;
alter table public.health_reports enable row level security;
alter table public.measurements enable row level security;
alter table public.ovr_logs enable row level security;
alter table public.player_exercise_skips enable row level security;
alter table public.player_overrides enable row level security;
alter table public.player_programs enable row level security;
alter table public.player_teams enable row level security;
alter table public.players enable row level security;
alter table public.schedule_exercise_overrides enable row level security;
alter table public.session_blocks enable row level security;
alter table public.sessions enable row level security;
alter table public.set_logs enable row level security;
alter table public.team_schedule enable row level security;
alter table public.teams enable row level security;
alter table public.template_block_exercises enable row level security;
alter table public.template_blocks enable row level security;
alter table public.training_phases enable row level security;
alter table public.vbt_anchor_exercises enable row level security;
alter table public.vbt_data_points enable row level security;
alter table public.vbt_profiles enable row level security;
alter table public.vbt_tests enable row level security;
alter table public.workout_templates enable row level security;
alter table public.workouts enable row level security;

-- Exercise photo storage: public for viewing; only the server uploads
insert into storage.buckets (id, name, public)
values ('exercise-media', 'exercise-media', true)
on conflict (id) do update set public = true;
