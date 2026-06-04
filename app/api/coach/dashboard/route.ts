import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const db = createServerClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)

  // Today's sessions with player/team info
  const { data: sessions } = await db
    .from('sessions')
    .select('id, player_id, checked_in_at, completed_at')
    .gte('checked_in_at', today.toISOString())
    .order('checked_in_at', { ascending: false })

  const playerIds = [...new Set(sessions?.map(s => s.player_id) ?? [])]
  const { data: players } = await db.from('players').select('id, name, jersey_number').in('id', playerIds.length ? playerIds : ['none'])
  const playerMap = Object.fromEntries((players ?? []).map(p => [p.id, { name: p.name, jersey: p.jersey_number }]))

  // Get team info for players
  const { data: playerTeams } = await db.from('player_teams').select('player_id, team_id, teams(name, color)').in('player_id', playerIds.length ? playerIds : ['none']).eq('is_primary', true)
  const teamMap = Object.fromEntries((playerTeams ?? []).map(pt => [pt.player_id, {
    name: (pt.teams as unknown as { name: string; color: string })?.name,
    color: (pt.teams as unknown as { name: string; color: string })?.color,
  }]))

  // Active health flags per player
  const { data: healthFlags } = await db.from('health_reports').select('player_id').in('player_id', playerIds.length ? playerIds : ['none']).eq('status', 'active')
  const flaggedPlayers = new Set((healthFlags ?? []).map(h => h.player_id))

  const todaySessions = (sessions ?? []).map(s => ({
    id: s.id,
    playerName: playerMap[s.player_id]?.name ?? 'Unknown',
    jerseyNumber: playerMap[s.player_id]?.jersey,
    teamName: teamMap[s.player_id]?.name,
    teamColor: teamMap[s.player_id]?.color,
    checkedInAt: s.checked_in_at,
    completedAt: s.completed_at,
    completionPct: 0,
    hasHealthFlag: flaggedPlayers.has(s.player_id),
  }))

  // Unconfirmed health reports
  const { data: unconfirmed } = await db
    .from('health_reports')
    .select('id, player_id, body_part, report_type, pain_level, players(name)')
    .eq('confirmed_by_coach', false)
    .eq('status', 'active')
    .order('reported_at', { ascending: false })

  const unconfirmedHealth = (unconfirmed ?? []).map(r => ({
    id: r.id,
    playerName: (r.players as unknown as { name: string })?.name ?? 'Unknown',
    bodyPart: r.body_part,
    reportType: r.report_type,
    painLevel: r.pain_level,
  }))

  // Active injuries count
  const { count: activeInjuries } = await db.from('health_reports').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('confirmed_by_coach', true)

  // Week session count
  const { count: weekCount } = await db.from('sessions').select('*', { count: 'exact', head: true }).gte('checked_in_at', weekAgo.toISOString())

  // Total active players
  const { count: totalPlayers } = await db.from('players').select('*', { count: 'exact', head: true }).eq('is_active', true)

  // Teams with current phase AND today's scheduled workout
  const { data: teams } = await db.from('teams').select('*').eq('is_active', true).order('age_group')

  // Fetch today's schedule for all teams in one query
  const { data: todaySchedule } = await db
    .from('team_schedule')
    .select('team_id, workout_templates(name)')
    .eq('scheduled_date', todayStr)

  const scheduleMap = Object.fromEntries(
    (todaySchedule ?? []).map(s => [s.team_id, (s.workout_templates as unknown as { name: string } | null)?.name ?? null])
  )

  const teamsActive = await Promise.all((teams ?? []).map(async team => {
    const { data: phases } = await db.from('training_phases').select('phase_type, name').eq('team_id', team.id).lte('starts_on', todayStr).gte('ends_on', todayStr).limit(1)
    return {
      ...team,
      phase: phases?.[0] ?? null,
      todayWorkout: scheduleMap[team.id] ?? null,
    }
  }))

  teamsActive.sort((a, b) => {
    if (a.is_open_gym && !b.is_open_gym) return 1
    if (!a.is_open_gym && b.is_open_gym) return -1
    return (a.age_group ?? '').localeCompare(b.age_group ?? '')
  })

  return NextResponse.json({
    todaySessions,
    unconfirmedHealth,
    activeInjuries: activeInjuries ?? 0,
    totalPlayers: totalPlayers ?? 0,
    sessionsTodayCount: sessions?.length ?? 0,
    sessionsWeekCount: weekCount ?? 0,
    teamsActive,
  })
}
