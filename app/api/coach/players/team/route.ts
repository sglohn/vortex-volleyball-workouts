import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST /api/coach/players/team
// Body: { playerId, teamId } — teamId can be null to unassign
export async function POST(req: NextRequest) {
  const { playerId, teamId } = await req.json()
  if (!playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })

  const db = createServerClient()

  // Remove all current team assignments for this player
  await db.from('player_teams').delete().eq('player_id', playerId)

  // If a new team was provided, insert the assignment
  if (teamId) {
    const { error } = await db
      .from('player_teams')
      .insert({ player_id: playerId, team_id: teamId, is_primary: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
