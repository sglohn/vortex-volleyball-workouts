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
  const { data: players } = await db.from('players').select('id, name').in('id', playerIds.length ? playerIds : ['none'])
  const playerMap = Object.fromEntries((players ?? []).map(p => [p.id, p.name]))

  // Get team info for players
  const { data: playerTeams } = await db.from('player_teams').select('player_id, team_id, teams(name)').in('player_id', playerIds.length ? playerIds : ['none']).eq('is_primary', true)
  const teamMap = Object.fromEntries((playerTeams ?? []).map(pt => [pt.player_id, (pt.teams as unknown as { name: string })?.name]))

  // Active health flags per player
  const { data: healthFlags } = await db.from('health_reports').select('player_id').in('player_id', playerIds.length ? playerIds : ['none']).eq('status', 'active')
  const flaggedPlayers = new Set((healthFlags ?? []).map(h => h.player_id))

  const todaySessions = (sessions ?? []).map(s => ({
    id: s.id,
    playerName: playerMap[s.player_id] ?? 'Unknown',
    teamName: teamMap[s.player_id],
    checkedInAt: s.checked_in_at,
    completedAt: s.completed_at,
    completionPct: 0, // simplified for dashboard speed
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

  // Teams with current phase
  const { data: teams } = await db.from('teams').select('*').eq('is_active', true).order('age_group')
  const teamsActive = await Promise.all((teams ?? []).map(async team => {
    const { data: phases } = await db.from('training_phases').select('phase_type, name').eq('team_id', team.id).lte('starts_on', todayStr).gte('ends_on', todayStr).limit(1)
    return { ...team, phase: phases?.[0] ?? null }
  }))

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
