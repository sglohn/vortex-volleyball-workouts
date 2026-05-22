import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST — player check-in (verify PIN, create session)
export async function POST(req: NextRequest) {
  const { playerId, pin } = await req.json()
  if (!playerId || !pin) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = createServerClient()

  // Verify player + PIN
  const { data: player, error } = await db
    .from('players')
    .select('id, name, pin')
    .eq('id', playerId)
    .eq('is_active', true)
    .single()

  if (error || !player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  if (player.pin !== pin) return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })

  // Get active workout
  const { data: workout } = await db
    .from('workouts')
    .select('id')
    .eq('is_active', true)
    .single()

  // Create session
  const { data: session, error: sessionError } = await db
    .from('sessions')
    .insert({ player_id: playerId, workout_id: workout?.id ?? null })
    .select('id')
    .single()

  if (sessionError) return NextResponse.json({ error: 'Could not create session' }, { status: 500 })

  return NextResponse.json({ sessionId: session.id, playerName: player.name })
}

// PATCH — mark session as completed
export async function PATCH(req: NextRequest) {
  const { sessionId } = await req.json()
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

  const db = createServerClient()
  await db.from('sessions').update({ completed_at: new Date().toISOString() }).eq('id', sessionId)

  return NextResponse.json({ ok: true })
}
