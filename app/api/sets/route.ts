import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getBestOneRepMax, recommendWeightForPhase } from '@/lib/fitness'
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

  // Recalculate 1RM
  const { data: session } = await db.from('sessions').select('player_id, team_id').eq('id', sessionId).single()
  const { data: playerSessions } = await db.from('sessions').select('id').eq('player_id', session?.player_id)
  const { data: allLogs } = await db
    .from('set_logs')
    .select('weight_lbs, reps_completed')
    .eq('exercise_id', exerciseId)
    .in('session_id', playerSessions?.map(s => s.id) ?? ['none'])
    .eq('completed', true)

  const newOneRepMax = getBestOneRepMax(allLogs ?? [])

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

  const { data: ex } = await db.from('exercise_library').select('default_reps').eq('id', exerciseId).single()
  const recommendation = newOneRepMax > 0
    ? recommendWeightForPhase(newOneRepMax, ex?.default_reps ?? '8', phaseType)
    : null

  return NextResponse.json({ id: logId, newOneRepMax, recommendation })
}
