-- FILE: supabase/imports/2026-11-02_combine_no_swing.sql
--
-- Swing Velocity is no longer part of the regular combine (Nov 2, 2026).
-- It stays in the app as an optional test (lib/combine.ts, optional: true):
-- a coach can tick it on a Combine Day template in Coach → Templates later,
-- and the Swing Velocity column and the Coach → Players box stay as they are.
--
-- With the code change, a combine template with no test list saved (null)
-- already gets the regular tests without Swing Velocity. This script cleans
-- up any combine template that lists its tests by hand, and takes
-- "swing velocity" out of the description players read on Combine Day.
--
-- VORTEX Supabase only. Run it after PR #56 is merged. Safe to run again.
-- Changes nothing but Combine Day templates (is_combine = true).

-- 1. Preview: Combine Day templates before the change
select id, name, combine_metrics, description
from public.workout_templates
where is_combine = true
order by name;

-- 2. Take Swing Velocity out of any hand-picked test list
update public.workout_templates
set combine_metrics = array_remove(combine_metrics, 'swing_velocity_mph'),
    updated_at = now()
where is_combine = true
  and combine_metrics is not null
  and 'swing_velocity_mph' = any(combine_metrics);

-- 3. A list that is now exactly the regular tests is saved as null ("regular")
update public.workout_templates
set combine_metrics = null,
    updated_at = now()
where is_combine = true
  and combine_metrics is not null
  and combine_metrics @> array['height_in','wingspan_in','standing_reach_in','standing_vertical_in','approach_vertical_in','acceleration_sec','pro_agility_sec']::text[]
  and combine_metrics <@ array['height_in','wingspan_in','standing_reach_in','standing_vertical_in','approach_vertical_in','acceleration_sec','pro_agility_sec']::text[];

-- 4. Players' description: "..., pro-agility, swing velocity)" → "..., pro-agility)"
update public.workout_templates
set description = regexp_replace(description, ',?\s*(and\s+)?swing velocity', '', 'gi'),
    updated_at = now()
where is_combine = true
  and description ~* 'swing velocity';

-- 5. Check: Combine Day templates after the change
select id, name, combine_metrics, description
from public.workout_templates
where is_combine = true
order by name;
