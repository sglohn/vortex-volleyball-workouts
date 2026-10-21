-- FILE: supabase/migrations/2026-10-21_lacrosse_large_bands.sql
--
-- Bruisers Lacrosse large bands.
--
-- The lacrosse weight room has different large bands from Vortex:
--   Orange (extra light), Red (light), Green (medium),
--   Orange (heavy, the thicker one), White (extra heavy)
-- Their keys (lib/loads.ts BANDS) are added to the allowed band lists:
--   large_orange, large_green, large_orange_heavy, large_white
-- (large_red was already allowed.)
--
-- Hip bands, and every band Vortex uses, stay allowed. Nothing is changed or
-- removed, so this is harmless on the Vortex database.
--
-- Run once in BOTH Supabase projects (Vortex and Bruisers Lacrosse), in the
-- SQL Editor, BEFORE the app update is merged. Running it again is safe.

-- Band used on each set
alter table public.set_logs drop constraint if exists set_logs_band_check;
alter table public.set_logs add constraint set_logs_band_check check (
  band is null or band in (
    'large_yellow', 'large_red', 'large_black', 'large_purple',
    'large_orange', 'large_green', 'large_orange_heavy', 'large_white',
    'hip_green', 'hip_yellow', 'hip_blue', 'hip_red', 'hip_black'
  )
);

-- Coach's band recommendation in a workout
alter table public.template_block_exercises drop constraint if exists template_block_exercises_recommended_band_check;
alter table public.template_block_exercises add constraint template_block_exercises_recommended_band_check check (
  recommended_band is null or recommended_band in (
    'large_yellow', 'large_red', 'large_black', 'large_purple',
    'large_orange', 'large_green', 'large_orange_heavy', 'large_white',
    'hip_green', 'hip_yellow', 'hip_blue', 'hip_red', 'hip_black'
  )
);

-- Check: both lists should include large_orange_heavy
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conname in ('set_logs_band_check', 'template_block_exercises_recommended_band_check');
