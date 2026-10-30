-- FILE: supabase/migrations/2026-10-30_set_log_checks.sql
--
-- "Looks right" checks on Workout Logs (app/coach/logs).
--
-- Workout Logs flags sets that look like typos (lib/outliers.ts). When a
-- coach or admin looks at a flagged set and it's actually correct, they tap
-- "Looks right" and the set stops counting as "to check".
--
--   set_logs.checked_at       when it was marked as checked
--   set_logs.checked_by       the coach account that checked it
--   set_logs.checked_by_name  their name at the time (kept if the account is removed)
--   set_logs.checked_values   the set's values when it was checked
--                             (lib/setChecks.ts setFingerprint). If the set is
--                             changed later, the values no longer match, so the
--                             check no longer counts and the flag comes back.
--
-- Safe to run more than once. Run in BOTH Supabase projects (Vortex and
-- Bruisers Lacrosse), in the SQL Editor, BEFORE the app update is merged.

alter table public.set_logs add column if not exists "checked_at" timestamp with time zone;
alter table public.set_logs add column if not exists "checked_by" uuid references public.coaches(id) on delete set null;
alter table public.set_logs add column if not exists "checked_by_name" text;
alter table public.set_logs add column if not exists "checked_values" text;
