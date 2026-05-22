import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getBestOneRepMax, getTrend, estimateOneRepMax } from '@/lib/fitness'

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  if (!playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })

  const db = createServerClient()

  // All sessions for this player
  const { data: sessions } = await db
    .from('sessions')
    .select('id, checked_in_at, workout_id')
    .eq('player_id', playerId)
    .order('checked_in_at', { ascending: false })

  const sessionIds = sessions?.map(s => s.id) ?? []

  // Get all set logs with exercise info
  const { data: allLogs } = await db
    .from('set_logs')
    .select('exercise_id, session_id, weight_lbs, reps_completed, completed, logged_at')
    .in('session_id', sessionIds.length ? sessionIds : ['none'])
    .eq('completed', true)

  // Get exercise names
  const exerciseIds = [...new Set(allLogs?.map(l => l.exercise_id) ?? [])]
  const { data: exercises } = await db
    .from('exercises')
    .select('id, name, reps')
    .in('id', exerciseIds.length ? exerciseIds : ['none'])

  // Build per-exercise history
  const exerciseProgress = (exercises ?? []).map(ex => {
    const exLogs = allLogs?.filter(l => l.exercise_id === ex.id) ?? []

    // Group by session to get one 1RM per session date
    const bySession: Record<string, typeof exLogs> = {}
    for (const log of exLogs) {
      if (!bySession[log.session_id]) bySession[log.session_id] = []
      bySession[log.session_id].push(log)
    }

    const history = Object.entries(bySession).map(([sid, logs]) => {
      const sessionDate = sessions?.find(s => s.id === sid)?.checked_in_at ?? ''
      const best = getBestOneRepMax(logs)
      let bestWeight = 0, bestReps = 0, bestEst = 0
      for (const l of logs) {
        const est = l.weight_lbs && l.reps_completed ? estimateOneRepMax(l.weight_lbs, l.reps_completed) : 0
        if (est > bestEst) { bestEst = est; bestWeight = l.weight_lbs ?? 0; bestReps = l.reps_completed ?? 0 }
      }
      return {
        date: sessionDate.split('T')[0],
        oneRepMax: best,
        weight: bestWeight,
        reps: bestReps,
      }
    }).sort((a, b) => a.date.localeCompare(b.date))

    const oneRepMaxValues = history.map(h => h.oneRepMax)
    const current = oneRepMaxValues[oneRepMaxValues.length - 1] ?? 0
    const first = oneRepMaxValues[0] ?? 0

    return {
      exerciseId: ex.id,
      exerciseName: ex.name,
      history,
      trend: getTrend(oneRepMaxValues),
      current,
      change: Math.round(current - first),
    }
  }).filter(ex => ex.history.length > 0)

  // Measurement progress
  const { data: measurements } = await db
    .from('measurements')
    .select('*')
    .eq('player_id', playerId)
    .order('measured_at', { ascending: false })

  const MEASUREMENT_KEYS = [
    { key: 'height_in', label: 'Height' },
    { key: 'wingspan_in', label: 'Wingspan' },
    { key: 'standing_reach_in', label: 'Standing Reach' },
    { key: 'standing_vertical_in', label: 'Standing Vertical' },
    { key: 'approach_vertical_in', label: 'Approach Vertical' },
  ]

  const measurementProgress = MEASUREMENT_KEYS.map(({ key, label }) => {
    const history = (measurements ?? [])
      .filter(m => (m as Record<string, unknown>)[key] != null)
      .map(m => ({ date: m.measured_at, value: (m as Record<string, unknown>)[key] as number }))
    return { key, label, history, trend: getTrend(history.map(h => h.value)) }
  })

  return NextResponse.json({
    exerciseProgress,
    measurementProgress,
    sessionCount: sessions?.length ?? 0,
  })
}
