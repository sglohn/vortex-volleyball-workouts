// FILE: lib/supabase.ts
//
// Server-only Supabase access. Use createServerClient() in API routes and
// other server code.
//
// There is deliberately no browser client here. Anything the browser needs
// goes through an API route, so the Supabase keys never ship in the site's
// public JavaScript. The database's row-level security has no public
// policies (supabase/migrations/2026-10-08_close_public_access.sql), so the
// public anon key can't read or change anything anyway.

import { createClient } from '@supabase/supabase-js'

// Service role, bypasses RLS. Only use in API routes (server-side).
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
