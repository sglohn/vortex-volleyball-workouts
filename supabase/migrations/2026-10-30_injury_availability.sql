-- FILE: supabase/migrations/2026-10-30_injury_availability.sql
--
-- Health Board: how much each health report keeps a player out, and the
-- history of that over time (lib/availability.ts).
--
--   health_reports.availability   one of
--       'full'            Aches & Pains   - full go, just keep an eye on it
--       'limited'         Modified  - practicing/lifting with changes
--       'out'             Out             - no practice, games or workouts
--       'return_to_play'  Return to Play  - back from Out, working back in
--     Marking a report Resolved ("Cleared - full competition") ends it.
--   health_reports.availability_since   when the current level started
--
--   health_report_updates   one row per change: logged, level changed,
--                           progress note, cleared or reopened. Used for the
--                           timeline and the days-out / return-to-play
--                           numbers on the Health Board.
--
-- Existing reports are given a level from their old severity:
--   severe -> out, moderate -> limited, mild -> full;
--   no severity: injury -> limited, nagging pain / soreness -> full.
-- The old severity column is left in place (nothing is deleted).
--
-- Safe to run more than once. Run in BOTH Supabase projects (Vortex and
-- Bruisers Lacrosse), in the SQL Editor, BEFORE the app update is merged.

alter table public.health_reports add column if not exists "availability" text;
alter table public.health_reports add column if not exists "availability_since" timestamp with time zone;

update public.health_reports
set availability = case
    when severity = 'severe'   then 'out'
    when severity = 'moderate' then 'limited'
    when severity = 'mild'     then 'full'
    when report_type = 'major_injury' then 'limited'
    else 'full'
  end
where availability is null;

update public.health_reports
set availability_since = coalesce(reported_at, created_at, now())
where availability_since is null;

alter table public.health_reports alter column availability set default 'full';
alter table public.health_reports alter column availability set not null;
alter table public.health_reports alter column availability_since set default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'health_reports_availability_check') then
    alter table public.health_reports add constraint health_reports_availability_check
      check (availability in ('full', 'limited', 'out', 'return_to_play'));
  end if;
end $$;

create index if not exists idx_health_reports_availability
  on public.health_reports (availability) where status in ('active', 'monitoring');

create table if not exists public.health_report_updates (
  "id" uuid default gen_random_uuid() not null primary key,
  "report_id" uuid not null references public.health_reports(id) on delete cascade,
  "player_id" uuid references public.players(id) on delete cascade,
  -- 'logged' | 'level' | 'note' | 'cleared' | 'reopened'
  "kind" text not null,
  "from_availability" text,
  "to_availability" text,
  "note" text,
  "coach_id" uuid references public.coaches(id) on delete set null,
  "coach_name" text,
  "created_at" timestamp with time zone default now() not null,
  constraint health_report_updates_kind_check check (kind in ('logged', 'level', 'note', 'cleared', 'reopened')),
  constraint health_report_updates_to_check check (to_availability is null or to_availability in ('full', 'limited', 'out', 'return_to_play')),
  constraint health_report_updates_from_check check (from_availability is null or from_availability in ('full', 'limited', 'out', 'return_to_play'))
);

create index if not exists idx_health_report_updates_report
  on public.health_report_updates (report_id, created_at);

-- Starting point for reports that existed before this migration, so every
-- report's timeline begins at its first level.
insert into public.health_report_updates (report_id, player_id, kind, to_availability, created_at)
select r.id, r.player_id, 'logged', r.availability, coalesce(r.reported_at, r.created_at, now())
from public.health_reports r
where not exists (select 1 from public.health_report_updates u where u.report_id = r.id);

insert into public.health_report_updates (report_id, player_id, kind, from_availability, created_at)
select r.id, r.player_id, 'cleared', r.availability, r.resolved_at
from public.health_reports r
where r.status = 'resolved' and r.resolved_at is not null
  and not exists (select 1 from public.health_report_updates u where u.report_id = r.id and u.kind = 'cleared');

-- Same as every other table: no public access, the server uses the
-- service-role key.
alter table public.health_report_updates enable row level security;
