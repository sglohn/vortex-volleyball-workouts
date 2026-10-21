// FILE: app/api/coach/signin-list/route.ts   (new file)
//
// For the Admin sign-in screen (app/coach/page.tsx). Open to everyone
// (middleware.ts PUBLIC_GET): names only.
//   GET → { admins: [{ id, name }], setup }
//         setup = true while no active admin account exists yet, so the old
//         shared COACH_PIN still signs in (first-time setup)
//
// Team coaches aren't listed here; they're listed under their team on the
// main sign-in screen (app/api/player/roster).

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = createServerClient()
  const { data, error } = await db
    .from('coaches')
    .select('id, name')
    .eq('role', 'admin')
    .eq('is_active', true)
    .order('name')
  // No coaches table yet (migration not run): first-time setup with the shared PIN
  if (error) return NextResponse.json({ admins: [], setup: true })
  const admins = (data ?? []).map(a => ({ id: a.id, name: a.name }))
  return NextResponse.json({ admins, setup: admins.length === 0 })
}
