import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

  const db = createServerClient()

  // Session info
  const { data: session } = await db
    .from('sessions')
    .select('id, player_id, checked_in_at, completed_at, players(id, name, jersey_number)')
    .eq('id', sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // All set logs for this session with exercise info
  const { data: logs } = await db
    .from('set_logs')
    .select('id, exercise_id, set_number, weight_lbs, reps_completed, completed, created_at, exercise_library:exercise_id(id, name, category, logs_weight)')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  // Group logs by exercise, preserving order first logged
  const exerciseOrder: string[] = []
  const byExercise: Record<string, {
    exerciseId: string
    name: string
    category: string
    logsWeight: boolean
    sets: Array<{
      setNumber: number
      weightLbs: number | null
      repsCompleted: number | null
      completed: boolean
      loggedAt: string
    }>
    firstLoggedAt: string
  }> = {}

  for (const log of (logs ?? [])) {
    const lib = log.exercise_library as unknown as { id: string; name: string; category: string; logs_weight: boolean } | null
    const exId = log.exercise_id
    const name = lib?.name ?? exId

    if (!byExercise[exId]) {
      exerciseOrder.push(exId)
      byExercise[exId] = {
        exerciseId: exId,
        name,
        category: lib?.category ?? '',
        logsWeight: lib?.logs_weight ?? false,
        sets: [],
        firstLoggedAt: log.created_at,
      }
    }

    byExercise[exId].sets.push({
      setNumber: log.set_number,
      weightLbs: log.weight_lbs,
      repsCompleted: log.reps_completed,
      completed: log.completed,
      loggedAt: log.created_at,
    })
  }

  const exercises = exerciseOrder.map(id => byExercise[id])

  // Calculate stats
  const completedLogs = (logs ?? []).filter(l => l.completed)
  const totalWeightMoved = completedLogs.reduce((sum, l) =>
    sum + (l.weight_lbs ?? 0) * (l.reps_completed ?? 1), 0)
  const totalSetsCompleted = completedLogs.length

  // Duration
  const checkedInAt = session.checked_in_at ? new Date(session.checked_in_at) : null
  const completedAt = session.completed_at ? new Date(session.completed_at) : null
  const durationMs = checkedInAt && completedAt ? completedAt.getTime() - checkedInAt.getTime() : null
  const durationMin = durationMs ? Math.round(durationMs / 60000) : null

  // Top lifts (heaviest weight per exercise)
  const topLifts = exercises
    .filter(e => e.logsWeight)
    .map(e => ({
      name: e.name,
      heaviest: Math.max(...e.sets.filter(s => s.completed && s.weightLbs).map(s => s.weightLbs ?? 0)),
      repsAtHeaviest: e.sets.find(s => s.completed && s.weightLbs === Math.max(...e.sets.filter(s2 => s2.completed && s2.weightLbs).map(s2 => s2.weightLbs ?? 0)))?.repsCompleted ?? null,
    }))
    .filter(e => e.heaviest > 0)
    .sort((a, b) => b.heaviest - a.heaviest)

  return NextResponse.json({
    session: {
      id: session.id,
      playerName: (session.players as unknown as { name: string })?.name ?? 'Unknown',
      jerseyNumber: (session.players as unknown as { jersey_number?: string })?.jersey_number,
      checkedInAt: session.checked_in_at,
      completedAt: session.completed_at,
      durationMin,
    },
    exercises,
    stats: {
      totalWeightMoved: Math.round(totalWeightMoved),
      totalSetsCompleted,
      exercisesHit: exercises.length,
    },
    topLifts,
  })
}
