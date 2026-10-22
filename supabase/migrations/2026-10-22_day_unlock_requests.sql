-- FILE: supabase/migrations/2026-10-22_day_unlock_requests.sql
--
-- Unlock requests (Bruisers Lacrosse week plans, lib/weekPlan.ts).
--
-- Players do one week-plan workout per day. A player who did all her sets
-- one day but forgot to tap Finish until she came back for her next workout
-- finishes it "today", so the next Day stays locked until tomorrow. From the
-- sign-in screen she can ask an admin to unlock it; the admin approves or
-- declines in Coach -> Requests (app/api/coach/unlock-requests).
--
--   day_unlock_requests   one row per request. An approved row lets that
--                         player start that Day of that week even though
--                         she already finished a workout today.
--
-- Vortex never writes to this table (no week plans there); it just sits
-- unused.
--
-- Safe to run more than once. Run in BOTH Supabase projects (Vortex and
-- Bruisers Lacrosse), in the SQL Editor, BEFORE the app update is merged.

create table if not exists public.day_unlock_requests (
  "id" uuid default gen_random_uuid() not null primary key,
  "player_id" uuid not null references public.players(id) on delete cascade,
  "team_id" uuid references public.teams(id) on delete set null,
  "week_start" date not null,
  "week_slot" integer not null,
  -- The workout she finished late (shown to the admin as evidence)
  "finished_session_id" uuid references public.sessions(id) on delete set null,
  "status" text default 'pending' not null,
  "created_at" timestamp with time zone default now() not null,
  "resolved_at" timestamp with time zone,
  "resolved_by" uuid references public.coaches(id) on delete set null,
  constraint day_unlock_requests_status_check check (status in ('pending', 'approved', 'declined')),
  constraint day_unlock_requests_slot_check check (week_slot between 1 and 7)
);

-- At most one request per player per Day per week (a second tap reuses it)
create unique index if not exists day_unlock_requests_player_week_slot_key
  on public.day_unlock_requests (player_id, week_start, week_slot);

create index if not exists idx_day_unlock_requests_status
  on public.day_unlock_requests (status, created_at desc);

-- Same as every other table: no public access, the server uses the
-- service-role key.
alter table public.day_unlock_requests enable row level security;
