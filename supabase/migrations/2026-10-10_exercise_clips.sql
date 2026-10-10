-- FILE: supabase/migrations/2026-10-10_exercise_clips.sql
--
-- Short looping demo clips for exercises (a silent 3–6 second video that
-- shows the whole motion, in place of the start/finish photos).
--
--   clip_url         public URL of the clip (MP4) in the "exercise-media" bucket
--   clip_poster_url  a still frame from the clip (JPEG). Shown while the clip
--                    loads, and used for the Roku snapshot, which can only
--                    show a still picture.
--
-- Exercises without a clip keep showing their start/finish photos.
--
-- Also makes sure the "exercise-media" bucket accepts video files: if the
-- bucket has a list of allowed file types, MP4 and WebM are added to it, and
-- if it has a file size limit under 20 MB, the limit is raised to 20 MB.
-- If the bucket has no list and no limit (the usual setup), nothing changes.
--
-- Run once in BOTH Supabase projects (Vortex and Bruisers Lacrosse), in the
-- SQL Editor, before the app update is merged. Safe to run again.

alter table public.exercise_library add column if not exists clip_url text;
alter table public.exercise_library add column if not exists clip_poster_url text;

update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct t)
  from unnest(allowed_mime_types || array['video/mp4', 'video/webm']) as t
)
where id = 'exercise-media'
  and allowed_mime_types is not null
  and not (allowed_mime_types @> array['video/mp4', 'video/webm']);

update storage.buckets
set file_size_limit = 20971520
where id = 'exercise-media'
  and file_size_limit is not null
  and file_size_limit < 20971520;
