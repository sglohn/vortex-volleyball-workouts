// FILE: app/api/sets/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getPlayerRecommendation } from '@/lib/suggestions'
import { PhaseType } from '@/lib/types'

export async function POST(req: NextRequest) {
  const {
    sessionId,
    exerciseId,
    setNumber,
    weightLbs,
    repsCompleted,
    velocityMs,
    completed,
    targetReps,          // optional: the rep target shown for this exercise in today's workout
    targetVelocityMin,   // optional: speed target for this exercise in today's workout
    targetVelocityMax,
  } = await req.json()

  if (!sessionId || !exerciseId || !setNumber) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const db = createServerClient()

  // Upsert set log
  const { data: existing } = await db
    .from('set_logs')
    .select('id')
    .eq('session_id', sessionId)
    .eq('exercise_id', exerciseId)
    .eq('set_number', setNumber)
    .single()

  let logId: string
  const logData = {
    weight_lbs: weightLbs ?? null,
    reps_completed: repsCompleted ?? null,
    velocity_ms: velocityMs ?? null,
    completed,
    logged_at: new Date().toISOString(),
  }

  // Save errors are returned so the screens can show them instead of
  // silently losing the set.
  if (existing) {
    const { error: updErr } = await db.from('set_logs').update(logData).eq('id', existing.id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
    logId = existing.id
  } else {
    const { data: newLog, error: insErr } = await db
      .from('set_logs')
      .insert({ session_id: sessionId, exercise_id: exerciseId, set_number: setNumber, ...logData })
      .select('id')
      .single()
    if (insErr || !newLog) return NextResponse.json({ error: insErr?.message ?? 'Set not saved' }, { status: 500 })
    logId = newLog.id
  }

  // Log OVR velocity if provided
  if (velocityMs) {
    const { data: session } = await db.from('sessions').select('player_id').eq('id', sessionId).single()
    if (session) {
      await db.from('ovr_logs').insert({
        player_id: session.player_id,
        session_id: sessionId,
        exercise_id: exerciseId,
        log_type: 'velocity',
        value: velocityMs,
        weight_lbs: weightLbs ?? null,
      })
    }
  }

  // Recalculate suggestion for the next set — see lib/suggestions.ts.
  const { data: session } = await db.from('sessions').select('player_id, team_id').eq('id', sessionId).single()

  // Get current phase for recommendation
  let phaseType: PhaseType = 'general'
  if (session?.team_id) {
    const today = new Date().toISOString().split('T')[0]
    const { data: phases } = await db
      .from('training_phases')
      .select('phase_type')
      .eq('team_id', session.team_id)
      .lte('starts_on', today)
      .gte('ends_on', today)
      .limit(1)
    phaseType = (phases?.[0]?.phase_type as PhaseType) ?? 'general'
  }

  // Use the workout's rep target when the page sends it, so the suggestion
  // doesn't switch to the exercise's default reps after the first set.
  const { data: ex } = await db.from('exercise_library').select('default_reps').eq('id', exerciseId).single()

  const recommendation = session?.player_id
    ? await getPlayerRecommendation(db, {
        playerId: session.player_id,
        exerciseId,
        targetReps: targetReps ?? ex?.default_reps ?? '8',
        phaseType,
        sessionId,
        targetVelocityMin: targetVelocityMin ?? null,
        targetVelocityMax: targetVelocityMax ?? null,
      })
    : null
  const newOneRepMax = recommendation?.best1RM ?? 0   // 0 when there isn't enough data

  return NextResponse.json({ id: logId, newOneRepMax, recommendation })
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ logs: [] })
  const db = createServerClient()
  const { data: logs } = await db
    .from('set_logs')
    .select('exercise_id, set_number, weight_lbs, reps_completed, velocity_ms, completed')
    .eq('session_id', sessionId)
  return NextResponse.json({ logs: logs ?? [] })
}
