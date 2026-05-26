import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getBestOneRepMax, getTrend, estimateOneRepMax } from '@/lib/fitness'

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId')
  if (!teamId) return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })

  const db = createServerClient()

  // Team info
  const { data: team } = await db.from('teams').select('*').eq('id', teamId).single()
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  // All players on this team
  const { data: playerTeams } = await db
    .from('player_teams')
    .select('player_id, is_primary, players(id, name, jersey_number, position, is_active)')
    .eq('team_id', teamId)

  const players = (playerTeams ?? [])
    .map(pt => pt.players as unknown as { id: string; name: string; jersey_number?: string; position?: string; is_active: boolean })
    .filter(p => p?.is_active)
    .sort((a, b) => a.name.localeCompare(b.name))

  const playerIds = players.map(p => p.id)

  // Latest measurements for each player
  const { data: allMeasurements } = playerIds.length
    ? await db.from('measurements').select('*').in('player_id', playerIds).order('measured_at', { ascending: false })
    : { data: [] }

  const measurementsByPlayer: Record<string, Record<string, number>> = {}
  for (const m of (allMeasurements ?? [])) {
    if (!measurementsByPlayer[m.player_id]) {
      measurementsByPlayer[m.player_id] = {
        height_in: m.height_in,
        wingspan_in: m.wingspan_in,
        standing_reach_in: m.standing_reach_in,
        standing_vertical_in: m.standing_vertical_in,
        approach_vertical_in: m.approach_vertical_in,
        measured_at: m.measured_at,
      }
    }
  }

  // Active health reports for each player
  const { data: healthReports } = playerIds.length
    ? await db.from('health_reports').select('*').in('player_id', playerIds).in('status', ['active', 'monitoring']).order('reported_at', { ascending: false })
    : { data: [] }

  const healthByPlayer: Record<string, typeof healthReports> = {}
  for (const r of (healthReports ?? [])) {
    if (!healthByPlayer[r.player_id]) healthByPlayer[r.player_id] = []
    healthByPlayer[r.player_id].push(r)
  }

  // Session counts and strength data
  const { data: allSessions } = playerIds.length
    ? await db.from('sessions').select('id, player_id, checked_in_at, completed_at').in('player_id', playerIds).order('checked_in_at', { ascending: false })
    : { data: [] }

  const sessionsByPlayer: Record<string, typeof allSessions> = {}
  for (const s of (allSessions ?? [])) {
    if (!sessionsByPlayer[s.player_id]) sessionsByPlayer[s.player_id] = []
    sessionsByPlayer[s.player_id].push(s)
  }

  // Get all set logs for strength tracking
  const allSessionIds = (allSessions ?? []).map(s => s.id)
  const { data: allLogs } = allSessionIds.length
    ? await db.from('set_logs').select('exercise_id, session_id, weight_lbs, reps_completed, completed').in('session_id', allSessionIds).eq('completed', true)
    : { data: [] }

  // Build per-player strength summary
  const strengthByPlayer: Record<string, { exerciseId: string; exerciseName: string; best1RM: number; trend: string }[]> = {}

  if (allLogs?.length) {
    const exerciseIds = [...new Set(allLogs.map(l => l.exercise_id))]
    const { data: exercises } = await db.from('exercise_library').select('id, name').in('id', exerciseIds)
    const { data: legacyEx } = await db.from('exercises').select('id, name').in('id', exerciseIds)
    const exMap = Object.fromEntries([...(exercises ?? []), ...(legacyEx ?? [])].map(e => [e.id, e.name]))

    for (const p of players) {
      const playerSessions = new Set((sessionsByPlayer[p.id] ?? []).map(s => s.id))
      const playerLogs = allLogs.filter(l => playerSessions.has(l.session_id))
      const byExercise: Record<string, typeof playerLogs> = {}
      for (const l of playerLogs) {
        if (!byExercise[l.exercise_id]) byExercise[l.exercise_id] = []
        byExercise[l.exercise_id].push(l)
      }
      strengthByPlayer[p.id] = Object.entries(byExercise).map(([exId, logs]) => {
        const sorted = logs.sort((a, b) => {
          const sa = (allSessions ?? []).find(s => s.id === a.session_id)?.checked_in_at ?? ''
          const sb = (allSessions ?? []).find(s => s.id === b.session_id)?.checked_in_at ?? ''
          return sa.localeCompare(sb)
        })
        const bySession: Record<string, number> = {}
        for (const l of sorted) {
          if (l.weight_lbs && l.reps_completed) {
            const est = estimateOneRepMax(l.weight_lbs, l.reps_completed)
            const sid = l.session_id
            if (!bySession[sid] || est > bySession[sid]) bySession[sid] = est
          }
        }
        const vals = Object.values(bySession)
        return { exerciseId: exId, exerciseName: exMap[exId] ?? exId, best1RM: getBestOneRepMax(logs), trend: getTrend(vals) }
      }).filter(e => e.best1RM > 0).sort((a, b) => b.best1RM - a.best1RM).slice(0, 3)
    }
  }

  // Assemble roster
  const roster = players.map(p => ({
    id: p.id,
    name: p.name,
    jerseyNumber: p.jersey_number,
    position: p.position,
    measurements: measurementsByPlayer[p.id] ?? null,
    healthReports: healthByPlayer[p.id] ?? [],
    sessionCount: (sessionsByPlayer[p.id] ?? []).length,
    lastSeen: (sessionsByPlayer[p.id] ?? [])[0]?.checked_in_at ?? null,
    strength: strengthByPlayer[p.id] ?? [],
  }))

  // Current training phase
  const today = new Date().toISOString().split('T')[0]
  const { data: phases } = await db.from('training_phases').select('*').eq('team_id', teamId).lte('starts_on', today).gte('ends_on', today).limit(1)

  return NextResponse.json({ team, roster, currentPhase: phases?.[0] ?? null })
}
