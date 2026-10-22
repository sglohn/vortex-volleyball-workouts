-- FILE: supabase/migrations/2026-10-22_protected_admin.sql
--
-- Protected admin account (both sites).
--
-- coaches.is_protected  true = only this account itself can edit it, change
--                       its PIN, turn it off or remove it. Other admins see
--                       it on Coach → Coaches but its buttons are hidden,
--                       and the server refuses their changes.
--
-- Set here for Steve's account, the admin account named "Admin". It can't
-- be set or cleared from the app, only with SQL.
--
-- Safe to run more than once. Run in BOTH Supabase projects (Vortex and
-- Bruisers Lacrosse), in the SQL Editor, BEFORE the app update is merged.

alter table public.coaches add column if not exists is_protected boolean not null default false;

update public.coaches
set is_protected = true
where role = 'admin' and lower(name) = 'admin';

-- Check: should list exactly one row, Admin, with is_protected = true
select name, role, is_active, is_protected
from public.coaches
where role = 'admin'
order by is_protected desc, name;
