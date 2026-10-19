-- FILE: supabase/migrations/2026-10-19_bands_and_medballs.sql
--
-- Bands and med balls in the weight room.
--
-- 1. Three new equipment choices for exercises (Coach → Exercises):
--      'large_band'  Large bands: Yellow (extra light), Red (light),
--                    Black (medium), Purple (heavy)
--      'hip_band'    Hip bands: Green (extra light), Yellow (light),
--                    Blue (medium), Red (heavy), Black (extra heavy)
--      'medball'     Med ball: 10 lb (default) or the one 14 lb ball
--
-- 2. set_logs.band — the band a player used on a set, e.g. 'hip_blue'.
--    Band sets save no weight. Med ball sets save 10 or 14 in weight_lbs
--    like any other weight.
--
-- 3. template_block_exercises.recommended_band — the band the coach
--    recommends for a band exercise in a workout (Coach → Templates).
--
-- The band names are listed in lib/loads.ts (BANDS). If a band is ever
-- added there, add it to both lists below too.
--
-- Run once in BOTH Supabase projects (Vortex and Bruisers Lacrosse), in the
-- SQL Editor, BEFORE the app update is merged. Running it again is safe.

-- 1. Equipment choices
alter table public.exercise_library drop constraint if exists exercise_library_equipment_check;
alter table public.exercise_library add constraint exercise_library_equipment_check check (
  equipment is null or equipment in (
    'barbell', 'dumbbell_1', 'dumbbell_2', 'landmine', 'other',
    'large_band', 'hip_band', 'medball'
  )
);

-- 2. Band used on each set
alter table public.set_logs add column if not exists band text;
alter table public.set_logs drop constraint if exists set_logs_band_check;
alter table public.set_logs add constraint set_logs_band_check check (
  band is null or band in (
    'large_yellow', 'large_red', 'large_black', 'large_purple',
    'hip_green', 'hip_yellow', 'hip_blue', 'hip_red', 'hip_black'
  )
);

-- 3. Coach's band recommendation in a workout
alter table public.template_block_exercises add column if not exists recommended_band text;
alter table public.template_block_exercises drop constraint if exists template_block_exercises_recommended_band_check;
alter table public.template_block_exercises add constraint template_block_exercises_recommended_band_check check (
  recommended_band is null or recommended_band in (
    'large_yellow', 'large_red', 'large_black', 'large_purple',
    'hip_green', 'hip_yellow', 'hip_blue', 'hip_red', 'hip_black'
  )
);

-- Check: all three should be listed
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'set_logs' and column_name = 'band')
    or (table_name = 'template_block_exercises' and column_name = 'recommended_band'))
union all
select 'exercise_library', 'equipment check: ' || pg_get_constraintdef(oid)
from pg_constraint where conname = 'exercise_library_equipment_check';
