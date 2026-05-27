import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const teamIds = req.nextUrl.searchParams.get('teams')?.split(',').filter(Boolean) ?? []
  const date    = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  if (!teamIds.length) return NextResponse.json({ error: 'Missing teams' }, { status: 400 })

  const db = createServerClient()

  const { data: teams } = await db
    .from('teams')
    .select('id, name, age_group, color')
    .in('id', teamIds)

  const { data: playerTeams } = await db
    .from('player_teams')
    .select('player_id, team_id, players(id, name, jersey_number, is_active)')
    .in('team_id', teamIds)
    .eq('is_primary', true)

  const players = (playerTeams ?? [])
    .map(pt => ({
      ...(pt.players as unknown as { id: string; name: string; jersey_number?: string; is_active: boolean }),
      teamId: pt.team_id,
    }))
    .filter(p => p.is_active)

  const playerIds = players.map(p => p.id)

  // Fetch sessions for a wide window (+/- 1 day) to handle any timezone offset
  // then filter by local date string on checked_in_at
  const dayBefore = new Date(date + 'T00:00:00Z')
  dayBefore.setDate(dayBefore.getDate() - 1)
  const dayAfter  = new Date(date + 'T00:00:00Z')
  dayAfter.setDate(dayAfter.getDate() + 2)

  const { data: allSessions } = playerIds.length
    ? await db
        .from('sessions')
        .select('id, player_id, checked_in_at, completed_at')
        .in('player_id', playerIds)
        .gte('checked_in_at', dayBefore.toISOString())
        .lte('checked_in_at', dayAfter.toISOString())
    : { data: [] }

  // Keep only sessions whose local date matches
  const sessions = (allSessions ?? []).filter(s => {
    const local = new Date(s.checked_in_at)
    const localDate = `${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}-${String(local.getDate()).padStart(2,'0')}`
    return localDate === date
  })

  const sessionMap = Object.fromEntries(sessions.map(s => [s.player_id, s]))
  const sessionIds = sessions.map(s => s.id)

  type LogRow = {
    session_id: string; exercise_id: string; set_number: number
    weight_lbs: number | null; reps_completed: number | null; completed: boolean
  }

  const { data: logsRaw } = sessionIds.length
    ? await db
        .from('set_logs')
        .select('session_id, exercise_id, set_number, weight_lbs, reps_completed, completed')
        .in('session_id', sessionIds)
    : { data: [] }

  const logs = (logsRaw ?? []) as LogRow[]

  const logsBySession: Record<string, LogRow[]> = Object.fromEntries(sessionIds.map(id => [id, []]))
  for (const log of logs) {
    const arr = logsBySession[log.session_id]
    if (arr) arr.push(log)
  }

  const { data: schedules } = await db
    .from('team_schedule')
    .select('team_id, template_id, workout_templates(name)')
    .in('team_id', teamIds)
    .eq('scheduled_date', date)

  const templateByTeam = Object.fromEntries(
    (schedules ?? []).map(s => [s.team_id, {
      templateId: s.template_id,
      workoutName: (s.workout_templates as unknown as { name: string } | null)?.name ?? 'Workout',
    }])
  )

  // Get total sets from templates so pct is accurate
  const templateTotalSets: Record<string, number> = {}
  for (const [teamId, tmpl] of Object.entries(templateByTeam)) {
    if (!tmpl.templateId) continue
    const { data: blocks } = await db
      .from('template_blocks')
      .select('id, sets')
      .eq('template_id', tmpl.templateId)
    if (!blocks) continue
    let total = 0
    for (const block of blocks) {
      const { count } = await db
        .from('template_block_exercises')
        .select('*', { count: 'exact', head: true })
        .eq('block_id', block.id)
      total += (count ?? 0) * block.sets
    }
    templateTotalSets[teamId] = total
  }

  const roster = players.map(p => {
    const session = sessionMap[p.id]
    const playerLogs = session ? (logsBySession[session.id] ?? []) : []
    const completedLogs = playerLogs.filter(l => l.completed)

    const totalWeight = completedLogs.reduce((sum, l) =>
      sum + (l.weight_lbs ?? 0) * (l.reps_completed ?? 1), 0)
    const setsCompleted = completedLogs.length
    const totalSets = templateTotalSets[p.teamId] ?? 0
    const pct = totalSets > 0 ? Math.round(setsCompleted / totalSets * 100) : 0

    const weightedSets = completedLogs.filter(l => l.weight_lbs && l.weight_lbs > 0)
    const avgWeightPerSet = weightedSets.length > 0
      ? Math.round(weightedSets.reduce((sum, l) => sum + (l.weight_lbs ?? 0), 0) / weightedSets.length)
      : 0

    return {
      id: p.id, name: p.name, jerseyNumber: p.jersey_number, teamId: p.teamId,
      checkedIn: !!session, completed: !!session?.completed_at,
      sessionId: session?.id ?? null, checkedInAt: session?.checked_in_at ?? null,
      totalWeightLbs: Math.round(totalWeight), setsCompleted, totalSets, pct, avgWeightPerSet,
    }
  })

  const active = roster.filter(p => p.checkedIn)
  const byWeight = [...active].sort((a, b) => b.totalWeightLbs - a.totalWeightLbs)
  const bySets   = [...active].sort((a, b) => b.setsCompleted - a.setsCompleted)
  const byPct    = [...active].sort((a, b) => b.pct - a.pct)

  return NextResponse.json({ teams: teams ?? [], templateByTeam, roster, leaderboard: { byWeight, bySets, byPct }, date })
}
