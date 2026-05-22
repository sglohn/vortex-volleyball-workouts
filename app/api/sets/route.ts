import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getBestOneRepMax, recommendWeight } from '@/lib/fitness'

export async function POST(req: NextRequest) {
  const { sessionId, exerciseId, setNumber, weightLbs, repsCompleted, completed } = await req.json()

  if (!sessionId || !exerciseId || !setNumber) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const db = createServerClient()

  // Upsert the set log (update if exists, insert if not)
  const { data: existing } = await db
    .from('set_logs')
    .select('id')
    .eq('session_id', sessionId)
    .eq('exercise_id', exerciseId)
    .eq('set_number', setNumber)
    .single()

  let logId: string
  if (existing) {
    await db.from('set_logs').update({
      weight_lbs: weightLbs,
      reps_completed: repsCompleted,
      completed,
      logged_at: new Date().toISOString(),
    }).eq('id', existing.id)
    logId = existing.id
  } else {
    const { data: newLog } = await db.from('set_logs').insert({
      session_id: sessionId,
      exercise_id: exerciseId,
      set_number: setNumber,
      weight_lbs: weightLbs,
      reps_completed: repsCompleted,
      completed,
    }).select('id').single()
    logId = newLog?.id
  }

  // Recalculate 1RM from all logs for this player + exercise
  const { data: session } = await db.from('sessions').select('player_id').eq('id', sessionId).single()
  const { data: playerSessions } = await db.from('sessions').select('id').eq('player_id', session?.player_id)
  const sessionIds = playerSessions?.map(s => s.id) ?? []

  const { data: allLogs } = await db
    .from('set_logs')
    .select('weight_lbs, reps_completed')
    .eq('exercise_id', exerciseId)
    .in('session_id', sessionIds)
    .eq('completed', true)

  const { data: ex } = await db.from('exercises').select('reps').eq('id', exerciseId).single()
  const newOneRepMax = getBestOneRepMax(allLogs ?? [])
  const recommendation = newOneRepMax > 0 && ex ? recommendWeight(newOneRepMax, ex.reps) : undefined

  return NextResponse.json({ id: logId, newOneRepMax, recommendation })
}
