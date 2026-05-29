import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('id, player_id, checked_in_at, completed_at, players(id, name, jersey_number)')
    .eq('id', sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch logs without the broken FK join
  const { data: logs } = await db
    .from('set_logs')
    .select('id, exercise_id, set_number, weight_lbs, reps_completed, completed, logged_at')
    .eq('session_id', sessionId)
    .order('logged_at', { ascending: true })

  if (!logs?.length) {
    return NextResponse.json({
      session: {
        id: session.id,
        playerName: (session.players as unknown as { name: string })?.name ?? 'Unknown',
        jerseyNumber: (session.players as unknown as { jersey_number?: string })?.jersey_number,
        checkedInAt: session.checked_in_at,
        completedAt: session.completed_at,
        durationMin: null,
      },
      exercises: [],
      stats: { totalWeightMoved: 0, totalSetsCompleted: 0, exercisesHit: 0 },
      topLifts: [],
    })
  }

  // Look up exercise names separately — try exercise_library first, fall back to exercises
  const exerciseIds = [...new Set(logs.map(l => l.exercise_id))]
  const [{ data: libExercises }, { data: legacyExercises }] = await Promise.all([
    db.from('exercise_library').select('id, name, category, logs_weight').in('id', exerciseIds),
    db.from('exercises').select('id, name, logs_weight').in('id', exerciseIds),
  ])

  const exMap = Object.fromEntries([
    ...(legacyExercises ?? []).map(e => [e.id, { name: e.name, category: 'Other', logsWeight: e.logs_weight ?? false }]),
    ...(libExercises ?? []).map(e => [e.id, { name: e.name, category: e.category ?? '', logsWeight: e.logs_weight ?? false }]),
  ])

  // Group logs by exercise in order first seen
  const exerciseOrder: string[] = []
  const byExercise: Record<string, {
    exerciseId: string; name: string; category: string; logsWeight: boolean
    firstLoggedAt: string
    sets: Array<{ setNumber: number; weightLbs: number | null; repsCompleted: number | null; completed: boolean; loggedAt: string }>
  }> = {}

  for (const log of logs) {
    const exId = log.exercise_id
    const exInfo = exMap[exId] ?? { name: 'Unknown Exercise', category: '', logsWeight: false }
    if (!byExercise[exId]) {
      exerciseOrder.push(exId)
      byExercise[exId] = { exerciseId: exId, ...exInfo, firstLoggedAt: log.logged_at, sets: [] }
    }
    byExercise[exId].sets.push({
      setNumber: log.set_number,
      weightLbs: log.weight_lbs,
      repsCompleted: log.reps_completed,
      completed: log.completed,
      loggedAt: log.logged_at,
    })
  }

  const exercises = exerciseOrder.map(id => byExercise[id])
  const completedLogs = logs.filter(l => l.completed)
  const totalWeightMoved = completedLogs.reduce((sum, l) => sum + (l.weight_lbs ?? 0) * (l.reps_completed ?? 1), 0)

  const checkedInAt = session.checked_in_at ? new Date(session.checked_in_at) : null
  const completedAt = session.completed_at ? new Date(session.completed_at) : null
  const durationMs = checkedInAt && completedAt ? completedAt.getTime() - checkedInAt.getTime() : null

  const topLifts = exercises
    .filter(e => e.logsWeight)
    .map(e => {
      const heaviestSet = e.sets.filter(s => s.completed && s.weightLbs).reduce((best, s) => (!best || (s.weightLbs ?? 0) > (best.weightLbs ?? 0)) ? s : best, null as typeof e.sets[0] | null)
      return heaviestSet ? { name: e.name, heaviest: heaviestSet.weightLbs ?? 0, repsAtHeaviest: heaviestSet.repsCompleted } : null
    })
    .filter((e): e is { name: string; heaviest: number; repsAtHeaviest: number | null } => e !== null && e.heaviest > 0)
    .sort((a, b) => b.heaviest - a.heaviest)

  return NextResponse.json({
    session: {
      id: session.id,
      playerName: (session.players as unknown as { name: string })?.name ?? 'Unknown',
      jerseyNumber: (session.players as unknown as { jersey_number?: string })?.jersey_number,
      checkedInAt: session.checked_in_at,
      completedAt: session.completed_at,
      durationMin: durationMs ? Math.round(durationMs / 60000) : null,
    },
    exercises,
    stats: { totalWeightMoved: Math.round(totalWeightMoved), totalSetsCompleted: completedLogs.length, exercisesHit: exercises.length },
    topLifts,
  })
}
