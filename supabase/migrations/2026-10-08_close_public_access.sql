-- FILE: supabase/migrations/2026-10-08_close_public_access.sql
--
-- Closes direct public access to the database.
--
-- Every table had an "allow all" policy for the public role, so anyone with
-- the public (anon) key could read every player's PIN and health reports,
-- and change or delete any data, without going through the app. The app's
-- server uses the service role key, which skips these policies, so removing
-- them doesn't affect the app.
--
-- After this runs:
--   - Row level security stays ON for every table, with no public policies,
--     so the anon key can't read or change any table.
--   - Exercise photos still show (the bucket is public for viewing), but
--     only the server can upload or delete them.
--
-- Run in Supabase → SQL Editor. Safe to run more than once.
-- Until the app update that moves photo uploads to the server is live,
-- uploading exercise photos will fail; everything else keeps working.

do $$
declare
  p record;
begin
  -- 1. Every policy on public tables that applies to the public or anon role
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (roles && array['public', 'anon']::name[])
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    raise notice 'dropped policy "%" on %.%', p.policyname, p.schemaname, p.tablename;
  end loop;

  -- 2. Upload/change/delete/list policies on stored files for the public or anon role
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (roles && array['public', 'anon']::name[])
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    raise notice 'dropped policy "%" on %.%', p.policyname, p.schemaname, p.tablename;
  end loop;
end $$;

-- Make sure every public table has row level security on
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- Check: should return 0 rows
select schemaname, tablename, policyname, roles
from pg_policies
where (schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects'))
  and (roles && array['public', 'anon']::name[]);
