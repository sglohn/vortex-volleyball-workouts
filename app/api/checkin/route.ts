// FILE: app/api/checkin/route.ts
//
// Player check-in (phone, kiosk and session tablet).
// Uses the club's local date (lib/clubTime.ts) when resuming today's
// session and finding today's workout, instead of Vercel's UTC date.
//
// Which workout a player gets today, in order:
//   1. Coach date override (player_overrides)
//   2. Active individual program (player_programs)
//   3. Self-guided player (players.self_guided) → auto-built full-body
//      workout (lib/fullBodyWorkout.ts), saved on the session so resuming
//      shows the same exercises. Each new session gets a new one.
//   4. Team schedule
//   5. Legacy active workout

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { clubDateString, clubDayBounds } from '@/lib/clubTime'
import { canAccessSession, createPlayerPass, signInAgain } from '@/lib/playerAuth'
import { buildFullBodyWorkout, asGeneratedWorkout } from '@/lib/fullBodyWorkout'

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

  const teamId = playerTeam?.team_id ?? null
  // Club-local date — Vercel's clock is UTC, which rolls to tomorrow at 8 PM Eastern
  const today = clubDateString()
  const { start: dayStart, end: dayEnd } = clubDayBounds(today)

  // Check for today's existing incomplete session — resume it
  const { data: existingSession } = await db
    .from('sessions')
    .select('*')
    .eq('player_id', playerId)
    .gte('checked_in_at', dayStart)
    .lt('checked_in_at', dayEnd)
    .is('completed_at', null)
    .order('checked_in_at', { ascending: false })
    .limit(1)
    .single()

  // Find today's template — priority: date override → player program → self-guided → team schedule
  let templateId: string | null = null
  let selfGuided = false

  const { data: override } = await db
    .from('player_overrides')
    .select('template_id')
    .eq('player_id', playerId)
    .eq('override_date', today)
    .single()

  if (override?.template_id) {
    templateId = override.template_id
  } else {
    // Check for active player program
    const { data: program } = await db
      .from('player_programs')
      .select('*')
      .eq('player_id', playerId)
      .eq('is_active', true)
      .lte('started_on', today)
      .or('ended_on.is.null,ended_on.gte.' + today)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (program) {
      // Cycle through template sequence based on session count since program start
      const sequence = program.template_sequence as string[]
      if (sequence.length) {
        const { count } = await db
          .from('sessions')
          .select('*', { count: 'exact', head: true })
          .eq('player_id', playerId)
          .gte('checked_in_at', program.started_on)
        const idx = (count ?? 0) % sequence.length
        templateId = sequence[idx] ?? null
      }
    } else if (player.self_guided === true) {
      // Auto-built full-body workout (built below, when the session is known)
      selfGuided = true
    } else if (teamId) {
      const { data: schedule } = await db
        .from('team_schedule')
        .select('template_id')
        .eq('team_id', teamId)
        .eq('scheduled_date', today)
        .single()
      templateId = schedule?.template_id ?? null
    }
  }

  // Fallback legacy (not for self-guided players — they get their own workout)
  let legacyWorkoutId: string | null = null
  if (!templateId && !selfGuided) {
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
    // Resume existing session — keep the same generated workout if it has one
    sessionId = existingSession.id
    if (selfGuided && !asGeneratedWorkout(existingSession.generated_workout)) {
      // e.g. coach switched the player to self-guided after they checked in
      const generated = await buildFullBodyWorkout(db, playerId, today)
      if (generated) {
        await db.from('sessions').update({ generated_workout: generated }).eq('id', sessionId)
      }
    }
  } else {
    // Create new session (self-guided players get a brand-new workout)
    const generated = selfGuided ? await buildFullBodyWorkout(db, playerId, today) : null
    const { data: session, error: sessionError } = await db
      .from('sessions')
      .insert({
        player_id: playerId,
        workout_id: legacyWorkoutId,
        team_id: teamId,
        ...(generated ? { generated_workout: generated } : {}),
      })
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
    selfGuided,
    isResumed: !!existingSession,
    hasHealthFlags: (healthReports?.length ?? 0) > 0,
    healthReports: healthReports ?? [],
    // Signed pass for this player's own data (lib/playerAuth.ts)
    playerPass: await createPlayerPass(playerId),
  })
}

export async function PATCH(req: NextRequest) {
  const { sessionId } = await req.json()
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  if (!(await canAccessSession(req, sessionId))) return signInAgain()
  const db = createServerClient()
  await db.from('sessions').update({ completed_at: new Date().toISOString() }).eq('id', sessionId)
  return NextResponse.json({ ok: true })
}
