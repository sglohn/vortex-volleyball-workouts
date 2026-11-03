-- FILE: supabase/migrations/2026-11-02_combine_attempt_checks.sql
--
-- "Looks right" checks for Combine Day numbers on Workout Logs
-- (app/coach/logs), the same way flagged sets work
-- (2026-10-30_set_log_checks.sql).
--
-- Workout Logs flags combine tries that look like typos (lib/combineFlags.ts),
-- e.g. a standing reach that doesn't fit her height. When a coach or admin
-- looks at a flagged number and it's actually correct, they tap
-- "Looks right" and it stops counting as "to check".
--
--   combine_attempts.checked_at       when it was marked as checked
--   combine_attempts.checked_by       the coach account that checked it
--   combine_attempts.checked_by_name  their name at the time
--   combine_attempts.checked_values   the number when it was checked. If it's
--                                     changed later, the check no longer
--                                     counts and the flag comes back.
--
-- Safe to run more than once. Run in BOTH Supabase projects (Vortex and
-- Bruisers Lacrosse), in the SQL Editor, BEFORE the app update is merged.

alter table public.combine_attempts add column if not exists "checked_at" timestamp with time zone;
alter table public.combine_attempts add column if not exists "checked_by" uuid references public.coaches(id) on delete set null;
alter table public.combine_attempts add column if not exists "checked_by_name" text;
alter table public.combine_attempts add column if not exists "checked_values" text;
