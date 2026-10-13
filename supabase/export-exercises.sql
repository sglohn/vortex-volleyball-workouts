-- FILE: supabase/export-exercises.sql
--
-- Exports the exercise library so another copy of this app can import it
-- (coach → Exercise Library → Import).
--
-- Run in the SOURCE project's SQL Editor (for example Vortex). Read-only.
-- Download the result as CSV and upload that file with the Import button.
-- Only active exercises are exported. Bar speed settings and VBT data are
-- not included. Demo clips are included, so the source project needs the
-- clip migration (migrations/2026-10-10_exercise_clips.sql) run first.
--
-- Easier/harder families are included: each exercise's family name, its
-- level, and its recommended backup (by name, since the other site gives
-- every exercise its own id). This needs the levels migration
-- (migrations/2026-10-10_exercise_levels_and_change_requests.sql).

select coalesce(json_agg(json_build_object(
  'name', e.name,
  'category', e.category,
  'default_sets', e.default_sets,
  'default_reps', e.default_reps,
  'logs_weight', e.logs_weight,
  'coaching_notes', e.coaching_notes,
  'demo_url', e.demo_url,
  'demo_image_url', e.demo_image_url,
  'start_image_url', e.start_image_url,
  'end_image_url', e.end_image_url,
  'start_image_position', e.start_image_position,
  'end_image_position', e.end_image_position,
  'equipment', e.equipment,
  'clip_url', e.clip_url,
  'clip_poster_url', e.clip_poster_url,
  'variation_family', e.variation_family,
  'variation_level', e.variation_level,
  'backup_exercise_name', b.name
) order by e.name), '[]'::json) as exercises
from exercise_library e
left join exercise_library b on b.id = e.backup_exercise_id and b.is_active = true
where e.is_active = true;
