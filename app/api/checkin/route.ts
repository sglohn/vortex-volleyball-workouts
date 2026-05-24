import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

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

  // Get player's primary team
  const { data: playerTeam } = await db
    .from('player_teams')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('is_primary', true)
    .single()

  const teamId = playerTeam?.team_id ?? null
  const today = new Date().toISOString().split('T')[0]

  // Check for today's existing incomplete session — resume it
  const { data: existingSession } = await db
    .from('sessions')
    .select('id, team_id')
    .eq('player_id', playerId)
    .gte('checked_in_at', `${today}T00:00:00.000Z`)
    .lte('checked_in_at', `${today}T23:59:59.999Z`)
    .is('completed_at', null)
    .order('checked_in_at', { ascending: false })
    .limit(1)
    .single()

  // Find today's template
  let templateId: string | null = null
  const { data: override } = await db
    .from('player_overrides')
    .select('template_id')
    .eq('player_id', playerId)
    .eq('override_date', today)
    .single()

  if (override?.template_id) {
    templateId = override.template_id
  } else if (teamId) {
    const { data: schedule } = await db
      .from('team_schedule')
      .select('template_id')
      .eq('team_id', teamId)
      .eq('scheduled_date', today)
      .single()
    templateId = schedule?.template_id ?? null
  }

  // Fallback legacy
  let legacyWorkoutId: string | null = null
  if (!templateId) {
    const { data: workout } = await db
      .from('workouts')
      .select('id')
      .eq('is_active', true)
      .single()
    legacyWorkoutId = workout?.id ?? null
  }

  // Get active health reports
  const { data: healthReports } = await db
    .from('health_reports')
    .select('id, report_type, body_part, pain_level, status')
    .eq('player_id', playerId)
    .eq('status', 'active')

  let sessionId: string

  if (existingSession) {
    // Resume existing session
    sessionId = existingSession.id
  } else {
    // Create new session
    const { data: session, error: sessionError } = await db
      .from('sessions')
      .insert({ player_id: playerId, workout_id: legacyWorkoutId, team_id: teamId })
      .select('id')
      .single()
    if (sessionError) return NextResponse.json({ error: 'Could not create session' }, { status: 500 })
    sessionId = session.id
  }

  return NextResponse.json({
    sessionId,
    playerName: player.name,
    teamId,
    templateId,
    isResumed: !!existingSession,
    hasHealthFlags: (healthReports?.length ?? 0) > 0,
    healthReports: healthReports ?? [],
  })
}

export async function PATCH(req: NextRequest) {
  const { sessionId } = await req.json()
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  const db = createServerClient()
  await db.from('sessions').update({ completed_at: new Date().toISOString() }).eq('id', sessionId)
  return NextResponse.json({ ok: true })
}
