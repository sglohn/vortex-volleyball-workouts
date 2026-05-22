import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getBestOneRepMax, getTrend } from '@/lib/fitness'

export async function GET() {
  const db = createServerClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Today's sessions
  const { data: todaySessions } = await db
    .from('sessions')
    .select('id, player_id, checked_in_at, completed_at')
    .gte('checked_in_at', today.toISOString())
    .order('checked_in_at', { ascending: false })

  // Get player names for today's sessions
  const playerIds = [...new Set(todaySessions?.map(s => s.player_id) ?? [])]
  const { data: players } = await db.from('players').select('id, name').in('id', playerIds.length ? playerIds : ['none'])
  const playerMap = Object.fromEntries((players ?? []).map(p => [p.id, p.name]))

  // Get completion % for each session
  const sessionsWithCompletion = await Promise.all((todaySessions ?? []).map(async (s) => {
    const { data: workout } = await db.from('sessions').select('workout_id').eq('id', s.id).single()
    let totalSets = 0, completedSets = 0
    if (workout?.workout_id) {
      const { data: exercises } = await db.from('exercises').select('sets').eq('workout_id', workout.workout_id)
      totalSets = exercises?.reduce((sum, e) => sum + e.sets, 0) ?? 0
      const { data: logs } = await db.from('set_logs').select('completed').eq('session_id', s.id)
      completedSets = logs?.filter(l => l.completed).length ?? 0
    }
    return {
      id: s.id,
      playerName: playerMap[s.player_id] ?? 'Unknown',
      checkedInAt: s.checked_in_at,
      completedAt: s.completed_at,
      completionPct: totalSets > 0 ? Math.round(completedSets / totalSets * 100) : 0,
    }
  }))

  // Total active players
  const { count: totalPlayers } = await db.from('players').select('*', { count: 'exact', head: true }).eq('is_active', true)

  // Sessions this week
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const { count: weekCount } = await db.from('sessions').select('*', { count: 'exact', head: true }).gte('checked_in_at', weekAgo.toISOString())

  // Average completion
  const avgCompletion = sessionsWithCompletion.length
    ? Math.round(sessionsWithCompletion.reduce((s, x) => s + x.completionPct, 0) / sessionsWithCompletion.length)
    : 0

  // Flag players — missed 3+ days in last 7 days
  const { data: allPlayers } = await db.from('players').select('id, name').eq('is_active', true)
  const flagged = []

  for (const p of (allPlayers ?? [])) {
    const { data: recentSessions } = await db
      .from('sessions')
      .select('id, checked_in_at')
      .eq('player_id', p.id)
      .gte('checked_in_at', weekAgo.toISOString())

    if (!recentSessions?.length) {
      flagged.push({ id: p.id, name: p.name, reason: 'No sessions this week', severity: 'danger' as const })
      continue
    }

    if (recentSessions.length < 2) {
      flagged.push({ id: p.id, name: p.name, reason: 'Only 1 session this week', severity: 'warn' as const })
    }
  }

  return NextResponse.json({
    todaySessions: sessionsWithCompletion,
    flaggedPlayers: flagged,
    totalPlayers: totalPlayers ?? 0,
    totalWorkoutsThisWeek: weekCount ?? 0,
    avgCompletionPct: avgCompletion,
  })
}
