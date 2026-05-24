import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getBestOneRepMax, getTrend, estimateOneRepMax } from '@/lib/fitness'

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  if (!playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })

  const db = createServerClient()

  const { data: sessions } = await db
    .from('sessions')
    .select('id, checked_in_at')
    .eq('player_id', playerId)
    .order('checked_in_at', { ascending: false })

  const sessionIds = sessions?.map(s => s.id) ?? []

  const { data: allLogs } = await db
    .from('set_logs')
    .select('exercise_id, session_id, weight_lbs, reps_completed, completed, logged_at')
    .in('session_id', sessionIds.length ? sessionIds : ['none'])
    .eq('completed', true)

  // Try exercise_library first, fall back to exercises table
  const exerciseIds = [...new Set(allLogs?.map(l => l.exercise_id) ?? [])]
  let exercises: Array<{ id: string; name: string }> = []

  if (exerciseIds.length) {
    const { data: libEx } = await db.from('exercise_library').select('id, name').in('id', exerciseIds)
    const { data: legacyEx } = await db.from('exercises').select('id, name').in('id', exerciseIds)
    const libMap = Object.fromEntries((libEx ?? []).map(e => [e.id, e]))
    const legacyMap = Object.fromEntries((legacyEx ?? []).map(e => [e.id, e]))
    exercises = exerciseIds.map(id => libMap[id] ?? legacyMap[id]).filter(Boolean)
  }

  const exerciseProgress = exercises.map(ex => {
    const exLogs = allLogs?.filter(l => l.exercise_id === ex.id) ?? []
    const bySession: Record<string, typeof exLogs> = {}
    for (const log of exLogs) {
      if (!bySession[log.session_id]) bySession[log.session_id] = []
      bySession[log.session_id].push(log)
    }
    const history = Object.entries(bySession).map(([sid, logs]) => {
      const sessionDate = sessions?.find(s => s.id === sid)?.checked_in_at ?? ''
      let bestWeight = 0, bestReps = 0, bestEst = 0
      for (const l of logs) {
        const est = l.weight_lbs && l.reps_completed ? estimateOneRepMax(l.weight_lbs, l.reps_completed) : 0
        if (est > bestEst) { bestEst = est; bestWeight = l.weight_lbs ?? 0; bestReps = l.reps_completed ?? 0 }
      }
      return { date: sessionDate.split('T')[0], oneRepMax: getBestOneRepMax(logs), weight: bestWeight, reps: bestReps }
    }).sort((a, b) => a.date.localeCompare(b.date))

    const vals = history.map(h => h.oneRepMax)
    const current = vals[vals.length - 1] ?? 0
    return { exerciseId: ex.id, exerciseName: ex.name, history, trend: getTrend(vals), current, change: Math.round(current - (vals[0] ?? 0)) }
  }).filter(ex => ex.history.length > 0)

  const { data: measurements } = await db
    .from('measurements').select('*').eq('player_id', playerId).order('measured_at', { ascending: false })

  const KEYS = [
    { key: 'height_in', label: 'Height' },
    { key: 'wingspan_in', label: 'Wingspan' },
    { key: 'standing_reach_in', label: 'Standing Reach' },
    { key: 'standing_vertical_in', label: 'Standing Vertical' },
    { key: 'approach_vertical_in', label: 'Approach Vertical' },
  ]

  const measurementProgress = KEYS.map(({ key, label }) => {
    const history = (measurements ?? [])
      .filter(m => (m as Record<string, unknown>)[key] != null)
      .map(m => ({ date: m.measured_at, value: (m as Record<string, unknown>)[key] as number }))
    return { key, label, history, trend: getTrend(history.map(h => h.value)) }
  })

  return NextResponse.json({ exerciseProgress, measurementProgress, sessionCount: sessions?.length ?? 0 })
}
