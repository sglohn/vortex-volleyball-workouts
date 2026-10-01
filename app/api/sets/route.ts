// FILE: app/api/sets/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getQualifiedOneRepMax, recommendWeightForPhase } from '@/lib/fitness'
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
    targetReps,        // optional: the rep target shown for this exercise in today's workout
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
    completed,
    logged_at: new Date().toISOString(),
  }

  if (existing) {
    await db.from('set_logs').update(logData).eq('id', existing.id)
    logId = existing.id
  } else {
    const { data: newLog } = await db
      .from('set_logs')
      .insert({ session_id: sessionId, exercise_id: exerciseId, set_number: setNumber, ...logData })
      .select('id')
      .single()
    logId = newLog?.id
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

  // Recalculate suggestion — only when the player has enough proven history.
  // See getQualifiedOneRepMax in lib/fitness.ts for the rules.
  const { data: session } = await db.from('sessions').select('player_id, team_id').eq('id', sessionId).single()
  const { data: playerSessions } = await db.from('sessions').select('id, checked_in_at').eq('player_id', session?.player_id)
  const sessionDate: Record<string, string> = Object.fromEntries(
    (playerSessions ?? []).map(s => [s.id, s.checked_in_at])
  )
  const { data: allLogs } = await db
    .from('set_logs')
    .select('session_id, weight_lbs, reps_completed, completed')
    .eq('exercise_id', exerciseId)
    .in('session_id', playerSessions?.map(s => s.id) ?? ['none'])
    .eq('completed', true)

  const qualified = getQualifiedOneRepMax(
    (allLogs ?? []).map(l => ({ ...l, session_date: sessionDate[l.session_id] ?? null }))
  )
  const newOneRepMax = qualified.oneRepMax   // 0 when there isn't enough data

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
  const repsForSuggestion = targetReps ?? ex?.default_reps ?? '8'

  const recommendation = qualified.qualified
    ? recommendWeightForPhase(newOneRepMax, repsForSuggestion, phaseType)
    : { weight: 0, percent: 0, label: '', phaseNote: qualified.reason }

  return NextResponse.json({ id: logId, newOneRepMax, recommendation })
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ logs: [] })
  const db = createServerClient()
  const { data: logs } = await db
    .from('set_logs')
    .select('exercise_id, set_number, weight_lbs, reps_completed, completed')
    .eq('session_id', sessionId)
  return NextResponse.json({ logs: logs ?? [] })
}
