// FILE: app/api/checkin/route.ts
//
// Player check-in (phone, kiosk and session tablet).
//
// POST { playerId, pin }               checks the PIN, then starts or resumes
//                                      today's workout on her primary team
//                                      (lib/checkin.ts). Team Mode and the
//                                      lacrosse sign-in use this.
// POST { playerId, pin, start: false } volleyball phone sign-in: checks the
//                                      PIN and only signs her in (her pass,
//                                      name, team). No session is made, so
//                                      looking at her own page doesn't count
//                                      as coming in. Lacrosse ignores
//                                      start: false (its week card needs the
//                                      session).
// POST { playerId } + her pass         "Begin today's workout" on the player
//                                      home page (app/player/page.tsx): the
//                                      pass from sign-in stands in for the
//                                      PIN, then starts the workout as above.
// PATCH { sessionId }                  Finish.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { canAccessSession, createPlayerPass, signInAgain, verifyPlayerPass, PLAYER_PASS_HEADER } from '@/lib/playerAuth'
import { startWorkout } from '@/lib/checkin'
import { FEATURES } from '@/lib/features'

export async function POST(req: NextRequest) {
  const { playerId, pin, start } = await req.json()
  if (!playerId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // No PIN: her pass from sign-in must be for this player
  const byPass = !pin
  if (byPass && (await verifyPlayerPass(req.headers.get(PLAYER_PASS_HEADER))) !== playerId) return signInAgain()

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
  if (!byPass && player.pin !== pin) return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })

  // Get player's primary team
  const { data: playerTeam } = await db
    .from('player_teams')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('is_primary', true)
    .single()
  const teamId = playerTeam?.team_id ?? null

  // Sign in only: her own page, no workout started yet
  if (start === false && !FEATURES.weekPlan) {
    return NextResponse.json({
      signedIn: true,
      sessionId: null,
      playerId,
      playerName: player.name,
      teamId,
      playerPass: await createPlayerPass(playerId),
    })
  }

  const result = await startWorkout(db, player, teamId)
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
