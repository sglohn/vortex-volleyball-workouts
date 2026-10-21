// FILE: app/api/checkin/route.ts
//
// Player check-in (phone, kiosk and session tablet): checks the PIN, then
// starts or resumes today's workout on her primary team (lib/checkin.ts).

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { canAccessSession, signInAgain } from '@/lib/playerAuth'
import { startWorkout } from '@/lib/checkin'

export async function POST(req: NextRequest) {
  const { playerId, pin } = await req.json()
  if (!playerId || !pin) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = createServerClient()

  // Verify player + PIN
  // select('*') so check-in keeps working even before the self_guided column exists
  const { data: player, error } = await db
    .from('players')
    .select('*')
    .eq('id', playerId)
    .eq('is_active', true)
    .single()

  if (error || !player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  if (player.pin !== pin) return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })

  // Get player's primary team
  const { data: playerTeam } = await db
    .from('player_teams')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('is_primary', true)
    .single()

  const result = await startWorkout(db, player, playerTeam?.team_id ?? null)
  return NextResponse.json(result.body, { status: result.status })
}

export async function PATCH(req: NextRequest) {
  const { sessionId } = await req.json()
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  if (!(await canAccessSession(req, sessionId))) return signInAgain()
  const db = createServerClient()
  await db.from('sessions').update({ completed_at: new Date().toISOString() }).eq('id', sessionId)
  return NextResponse.json({ ok: true })
}
