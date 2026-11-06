// FILE: app/api/coach/players/team/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST /api/coach/players/team
// Body: { playerId, teamId } — teamId can be null to unassign
//
// One team per player. Picking the team she's already on changes nothing, so
// her team date (player_teams.joined_at, where weight room attendance starts
// counting for her) is kept. Only a real move gives her a new team date.
export async function POST(req: NextRequest) {
  const { playerId, teamId } = await req.json()
  if (!playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })

  const db = createServerClient()

  if (teamId) {
    // Off every other team, keep the row for this one if she has it
    const { error: delErr } = await db.from('player_teams').delete().eq('player_id', playerId).neq('team_id', teamId)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    const { data: existing } = await db.from('player_teams').select('id').eq('player_id', playerId).eq('team_id', teamId).limit(1)
    if (existing && existing.length) {
      await db.from('player_teams').update({ is_primary: true }).eq('id', existing[0].id)
      return NextResponse.json({ ok: true })
    }

    const { error } = await db
      .from('player_teams')
      .insert({ player_id: playerId, team_id: teamId, is_primary: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // No team
  const { error } = await db.from('player_teams').delete().eq('player_id', playerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
