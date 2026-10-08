-- FILE: supabase/migrations/2026-10-08_auth_attempts.sql
--
-- Counts wrong coach PINs so coach sign-in can lock for 15 minutes after
-- 5 wrong tries (see app/api/coach/route.ts).
--
-- Run once in Supabase → SQL Editor. Safe to run again.
-- Only the server (service role key) touches this table. RLS is on with
-- no policies, so the public anon key can't read or change it.

create table if not exists auth_attempts (
  key           text primary key,          -- e.g. 'coach:203.0.113.7'
  failed_count  integer not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);

alter table auth_attempts enable row level security;
