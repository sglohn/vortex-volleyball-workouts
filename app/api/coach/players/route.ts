import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getBestOneRepMax, getTrend } from '@/lib/fitness'

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

    return NextResponse.json({ player, sessions: sessions?.slice(0, 10), measurements, healthReports, exerciseProgress, team: playerTeam?.teams ?? null })
  }

  // Player list with team info and health flags
  const { data: players } = await db.from('players').select('*').eq('is_active', true).order('name')
  const { data: playerTeams } = await db.from('player_teams').select('player_id, is_primary, teams(id, name, color)').eq('is_primary', true)
  const { data: activeHealth } = await db.from('health_reports').select('player_id').eq('status', 'active')
  const flaggedIds = new Set((activeHealth ?? []).map(h => h.player_id))
  const teamMap = Object.fromEntries((playerTeams ?? []).map(pt => [pt.player_id, pt.teams as unknown as { name: string; color: string } | null]))

  const enriched = await Promise.all((players ?? []).map(async (p) => {
    const { data: sessions } = await db.from('sessions').select('id, checked_in_at').eq('player_id', p.id).order('checked_in_at', { ascending: false }).limit(1)
    const { count } = await db.from('sessions').select('*', { count: 'exact', head: true }).eq('player_id', p.id)
    const team = teamMap[p.id]
    return { ...p, teamName: team?.name, teamColor: team?.color, sessionCount: count ?? 0, lastSeen: sessions?.[0]?.checked_in_at ?? null, hasHealthFlag: flaggedIds.has(p.id) }
  }))

  return NextResponse.json({ players: enriched })
}

export async function POST(req: NextRequest) {
  const { name, pin, jersey_number, position, team_id } = await req.json()
  if (!name || !pin) return NextResponse.json({ error: 'Name and PIN required' }, { status: 400 })
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })

  const db = createServerClient()
  const { data: player, error } = await db.from('players').insert({ name, pin, jersey_number: jersey_number || null, position: position || null }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Assign to team if provided
  if (team_id) {
    await db.from('player_teams').insert({ player_id: player.id, team_id, is_primary: true })
  }

  return NextResponse.json({ player })
}
