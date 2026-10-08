// FILE: app/api/player/roster/route.ts   (new file)
//
// Names only, for the player sign-in screen (app/page.tsx).
//   GET ?teamId=<id>  → { roster: [{ id, name, jerseyNumber }] }
//
// The sign-in screen used to call /api/coach/team-detail, which also
// returned every player's health reports, measurements and sessions to
// anyone. That route is now coach-only; this one returns just what the
// "Who are you?" list needs.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

type Row = { players: { id: string; name: string; jersey_number: string | null; is_active: boolean } | { id: string; name: string; jersey_number: string | null; is_active: boolean }[] | null }

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId')
  if (!teamId) return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })

  const db = createServerClient()
  const { data, error } = await db
    .from('player_teams')
    .select('players(id, name, jersey_number, is_active)')
    .eq('team_id', teamId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const roster = ((data ?? []) as unknown as Row[])
    .map(r => (Array.isArray(r.players) ? r.players[0] : r.players))
    .filter((p): p is NonNullable<typeof p> => !!p && p.is_active)
    .map(p => ({ id: p.id, name: p.name, jerseyNumber: p.jersey_number ?? undefined }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({ roster })
}
