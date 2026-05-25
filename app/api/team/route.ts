import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId')
  if (!teamId) return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })

  const db = createServerClient()
  const today = new Date().toISOString().split('T')[0]

  // Get team info
  const { data: team } = await db
    .from('teams')
    .select('id, name, age_group, color')
    .eq('id', teamId)
    .single()

  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  // Get today's scheduled workout template
  const { data: schedule } = await db
    .from('team_schedule')
    .select('template_id, workout_templates(name)')
    .eq('team_id', teamId)
    .eq('scheduled_date', today)
    .single()

  // Get all players on this team
  const { data: playerTeams } = await db
    .from('player_teams')
    .select('player_id, players(id, name, jersey_number, is_active)')
    .eq('team_id', teamId)
    .eq('is_primary', true)

  const players = (playerTeams ?? [])
    .map(pt => pt.players as unknown as { id: string; name: string; jersey_number?: string; is_active: boolean })
    .filter(p => p?.is_active)
    .sort((a, b) => a.name.localeCompare(b.name))

  // Get today's sessions for these players
  const playerIds = players.map(p => p.id)
  const todayStart = `${today}T00:00:00.000Z`
  const todayEnd = `${today}T23:59:59.999Z`

  const { data: sessions } = playerIds.length
    ? await db
        .from('sessions')
        .select('id, player_id, checked_in_at, completed_at')
        .in('player_id', playerIds)
        .gte('checked_in_at', todayStart)
        .lte('checked_in_at', todayEnd)
        .order('checked_in_at', { ascending: true })
    : { data: [] }

  // For each session get completion stats
  const sessionStats: Record<string, { pct: number; completedSets: number; totalSets: number; totalWeightLbs: number; durationMin: number | null }> = {}

  for (const s of (sessions ?? [])) {
    const { data: logs } = await db
      .from('set_logs')
      .select('completed, weight_lbs, reps_completed')
      .eq('session_id', s.id)

    const total = logs?.length ?? 0
    const completed = logs?.filter(l => l.completed).length ?? 0
    const totalWeight = logs?.filter(l => l.completed && l.weight_lbs)
      .reduce((sum, l) => sum + (l.weight_lbs! * (l.reps_completed ?? 1)), 0) ?? 0
    const duration = s.completed_at
      ? Math.round((new Date(s.completed_at).getTime() - new Date(s.checked_in_at).getTime()) / 60000)
      : null

    sessionStats[s.player_id] = {
      pct: total > 0 ? Math.round(completed / total * 100) : 0,
      completedSets: completed,
      totalSets: total,
      totalWeightLbs: Math.round(totalWeight),
      durationMin: duration,
    }
  }

  const sessionMap = Object.fromEntries((sessions ?? []).map(s => [s.player_id, s]))

  const roster = players.map(p => ({
    id: p.id,
    name: p.name,
    jerseyNumber: p.jersey_number,
    checkedIn: !!sessionMap[p.id],
    completed: !!sessionMap[p.id]?.completed_at,
    sessionId: sessionMap[p.id]?.id ?? null,
    stats: sessionStats[p.id] ?? null,
  }))

  return NextResponse.json({
    team,
    roster,
    workoutName: (schedule?.workout_templates as unknown as { name: string } | null)?.name ?? null,
    templateId: schedule?.template_id ?? null,
    checkedInCount: roster.filter(r => r.checkedIn).length,
    completedCount: roster.filter(r => r.completed).length,
  })
}
