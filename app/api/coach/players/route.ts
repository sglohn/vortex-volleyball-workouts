import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getBestOneRepMax, getTrend } from '@/lib/fitness'
import { calculateAge } from '@/lib/age'

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  const db = createServerClient()

  if (playerId) {
    // Single player detail
    const { data: player } = await db.from('players').select('*').eq('id', playerId).single()
    const { data: sessions } = await db.from('sessions').select('*').eq('player_id', playerId).order('checked_in_at', { ascending: false }).limit(20)
    const { data: measurements } = await db.from('measurements').select('*').eq('player_id', playerId).order('measured_at', { ascending: false })
    const { data: healthReports } = await db.from('health_reports').select('*').eq('player_id', playerId).order('reported_at', { ascending: false })
    const { data: playerTeam } = await db.from('player_teams').select('*, teams(*)').eq('player_id', playerId).eq('is_primary', true).single()

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    const { data: bodyChecks } = await db
      .from('body_checks')
      .select('regions, checked_at')
      .eq('player_id', playerId)
      .gte('checked_at', sixtyDaysAgo)
      .order('checked_at', { ascending: false })

    const sessionIds = sessions?.map(s => s.id) ?? []
    const { data: allLogs } = await db.from('set_logs').select('exercise_id, session_id, weight_lbs, reps_completed, completed, logged_at').in('session_id', sessionIds.length ? sessionIds : ['none']).eq('completed', true)
    const exerciseIds = [...new Set(allLogs?.map(l => l.exercise_id) ?? [])]
    const { data: exercises } = await db.from('exercise_library').select('id, name').in('id', exerciseIds.length ? exerciseIds : ['none'])

    const exerciseProgress = (exercises ?? []).map(ex => {
      const exLogs = allLogs?.filter(l => l.exercise_id === ex.id) ?? []
      const bySession: Record<string, typeof exLogs> = {}
      for (const log of exLogs) {
        if (!bySession[log.session_id]) bySession[log.session_id] = []
        bySession[log.session_id].push(log)
      }
      const history = Object.entries(bySession).map(([sid, logs]) => {
        const sessionDate = sessions?.find(s => s.id === sid)?.checked_in_at ?? ''
        return { date: sessionDate.split('T')[0], oneRepMax: getBestOneRepMax(logs) }
      }).sort((a, b) => a.date.localeCompare(b.date))
      const vals = history.map(h => h.oneRepMax)
      return { exerciseId: ex.id, exerciseName: ex.name, history, trend: getTrend(vals), current: vals[vals.length - 1] ?? 0 }
    })

    const enrichedPlayer = player ? { ...player, age: calculateAge(player.date_of_birth) } : null

    return NextResponse.json({ player: enrichedPlayer, sessions: sessions?.slice(0, 10), measurements, healthReports, bodyChecks: bodyChecks ?? [], exerciseProgress, team: playerTeam?.teams ?? null })
  }

  // Player list — now includes measurements + best lifts for leaderboard/sorting
  const { data: players } = await db.from('players').select('*').eq('is_active', true).order('name')
  const { data: playerTeams } = await db.from('player_teams').select('player_id, is_primary, teams(id, name, color, age_group)').eq('is_primary', true)
  const { data: activeHealth } = await db.from('health_reports').select('player_id').eq('status', 'active')
  const flaggedIds = new Set((activeHealth ?? []).map(h => h.player_id))

  // Latest measurements for every player
  const { data: allMeasurements } = await db
    .from('measurements')
    .select('player_id, height_in, wingspan_in, standing_reach_in, standing_vertical_in, approach_vertical_in, measured_at')
    .order('measured_at', { ascending: false })

  // Build latest measurement per player (first row = most recent)
  const measMap: Record<string, {
    height_in: number | null
    wingspan_in: number | null
    standing_reach_in: number | null
    standing_vertical_in: number | null
    approach_vertical_in: number | null
  }> = {}
  for (const m of (allMeasurements ?? [])) {
    if (!measMap[m.player_id]) {
      measMap[m.player_id] = {
        height_in: m.height_in,
        wingspan_in: m.wingspan_in,
        standing_reach_in: m.standing_reach_in,
        standing_vertical_in: m.standing_vertical_in,
        approach_vertical_in: m.approach_vertical_in,
      }
    }
  }

  const teamMap = Object.fromEntries(
    (playerTeams ?? []).map(pt => [
      pt.player_id,
      pt.teams as unknown as { id: string; name: string; color: string; age_group?: string } | null
    ])
  )

  // Best lifts per player — fetch all session set_logs efficiently
  const allPlayerIds = (players ?? []).map(p => p.id)
  const { data: allSessions } = await db
    .from('sessions')
    .select('id, player_id, checked_in_at')
    .in('player_id', allPlayerIds.length ? allPlayerIds : ['none'])

  const sessionIds = (allSessions ?? []).map(s => s.id)
  const { data: allLogs } = sessionIds.length
    ? await db.from('set_logs')
        .select('exercise_id, session_id, weight_lbs, reps_completed, completed')
        .in('session_id', sessionIds)
        .eq('completed', true)
    : { data: [] }

  // Map session → player
  const sessionPlayerMap: Record<string, string> = {}
  for (const s of (allSessions ?? [])) sessionPlayerMap[s.id] = s.player_id

  // Map exercise names (fetch all unique exercise IDs)
  const exerciseIds = [...new Set((allLogs ?? []).map(l => l.exercise_id))]
  const { data: exercises } = exerciseIds.length
    ? await db.from('exercise_library').select('id, name').in('id', exerciseIds)
    : { data: [] }

  const exNameMap: Record<string, string> = {}
  for (const ex of (exercises ?? [])) exNameMap[ex.id] = ex.name.toLowerCase()

  // Per-player best lifts: squat, bench, deadlift
  const playerBestLifts: Record<string, { squat: number; bench: number; deadlift: number }> = {}
  for (const log of (allLogs ?? [])) {
    const pid = sessionPlayerMap[log.session_id]
    if (!pid) continue
    if (!playerBestLifts[pid]) playerBestLifts[pid] = { squat: 0, bench: 0, deadlift: 0 }
    const name = exNameMap[log.exercise_id] ?? ''
    if (!log.weight_lbs || !log.reps_completed) continue
    const orm = getBestOneRepMax([{ weight_lbs: log.weight_lbs, reps_completed: log.reps_completed }])
    if (name.includes('squat') && orm > playerBestLifts[pid].squat) playerBestLifts[pid].squat = orm
    if ((name.includes('bench') || name.includes('press')) && orm > playerBestLifts[pid].bench) playerBestLifts[pid].bench = orm
    if (name.includes('deadlift') && orm > playerBestLifts[pid].deadlift) playerBestLifts[pid].deadlift = orm
  }

  // Session count per player
  const sessionCountMap: Record<string, number> = {}
  const lastSeenMap: Record<string, string | null> = {}
  for (const s of (allSessions ?? [])) {
    sessionCountMap[s.player_id] = (sessionCountMap[s.player_id] ?? 0) + 1
    if (!lastSeenMap[s.player_id] || s.checked_in_at > (lastSeenMap[s.player_id] ?? '')) {
      lastSeenMap[s.player_id] = s.checked_in_at
    }
  }

  const enriched = (players ?? []).map(p => {
    const team = teamMap[p.id]
    const meas = measMap[p.id] ?? { height_in: null, wingspan_in: null, standing_reach_in: null, standing_vertical_in: null, approach_vertical_in: null }
    const lifts = playerBestLifts[p.id] ?? { squat: 0, bench: 0, deadlift: 0 }
    const teamName = team?.name ?? ''
    const gender = teamName.toLowerCase().includes('boy') ? 'M' : 'F'
    return {
      ...p,
      teamName,
      teamColor: team?.color,
      teamId: team?.id,
      age_group: team?.age_group ?? '',
      age: calculateAge(p.date_of_birth),
      gender,
      sessionCount: sessionCountMap[p.id] ?? 0,
      lastSeen: lastSeenMap[p.id] ?? null,
      hasHealthFlag: flaggedIds.has(p.id),
      height_in: meas.height_in,
      wingspan_in: meas.wingspan_in,
      standing_reach_in: meas.standing_reach_in,
      standing_vertical_in: meas.standing_vertical_in,
      approach_vertical_in: meas.approach_vertical_in,
      best_squat: lifts.squat || null,
      best_bench: lifts.bench || null,
      best_deadlift: lifts.deadlift || null,
    }
  })

  return NextResponse.json({ players: enriched })
}

export async function POST(req: NextRequest) {
  const { name, pin, jersey_number, position, team_id, date_of_birth } = await req.json()
  if (!name || !pin) return NextResponse.json({ error: 'Name and PIN required' }, { status: 400 })
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })

  const db = createServerClient()
  const { data: player, error } = await db.from('players').insert({
    name,
    pin,
    jersey_number: jersey_number || null,
    position: position || null,
    date_of_birth: date_of_birth || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (team_id) {
    await db.from('player_teams').insert({ player_id: player.id, team_id, is_primary: true })
  }

  return NextResponse.json({ player: { ...player, age: calculateAge(player.date_of_birth) } })
}
