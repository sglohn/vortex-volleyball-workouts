-- FILE: supabase/export-exercises.sql
--
-- Exports the exercise library so another copy of this app can import it
-- (coach → Exercise Library → Import).
--
-- Run in the SOURCE project's SQL Editor (for example Vortex). Read-only.
-- Download the result as CSV and upload that file with the Import button.
-- Only active exercises are exported. Bar speed settings and VBT data are
-- not included. Demo clips are included (the old start/finish photos are
-- not), so the source project needs the clip migration
-- (migrations/2026-10-10_exercise_clips.sql) run first.

select coalesce(json_agg(json_build_object(
  'name', name,
  'category', category,
  'default_sets', default_sets,
  'default_reps', default_reps,
  'logs_weight', logs_weight,
  'coaching_notes', coaching_notes,
  'demo_url', demo_url,
  'equipment', equipment,
  'clip_url', clip_url,
  'clip_poster_url', clip_poster_url
) order by name), '[]'::json) as exercises
from exercise_library
where is_active = true;
