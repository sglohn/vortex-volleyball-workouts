import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getBestOneRepMax, getTrend, estimateOneRepMax } from '@/lib/fitness'

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  const db = createServerClient()

  // Single player detail view
  if (playerId) {
    const { data: player } = await db.from('players').select('*').eq('id', playerId).single()
    const { data: sessions } = await db.from('sessions').select('*').eq('player_id', playerId).order('checked_in_at', { ascending: false }).limit(10)
    const { data: measurements } = await db.from('measurements').select('*').eq('player_id', playerId).order('measured_at', { ascending: false })

    const sessionIds = sessions?.map(s => s.id) ?? []
    const { data: allLogs } = await db.from('set_logs').select('exercise_id, session_id, weight_lbs, reps_completed, completed, logged_at').in('session_id', sessionIds.length ? sessionIds : ['none']).eq('completed', true)

    const exerciseIds = [...new Set(allLogs?.map(l => l.exercise_id) ?? [])]
    const { data: exercises } = await db.from('exercises').select('id, name, reps').in('id', exerciseIds.length ? exerciseIds : ['none'])

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

    return NextResponse.json({ player, sessions: sessions?.slice(0, 5), recentSessions: sessions, measurements, exerciseProgress })
  }

  // Player list with session counts and trend
  const { data: players } = await db.from('players').select('*').eq('is_active', true).order('name')

  const enriched = await Promise.all((players ?? []).map(async (p) => {
    const { data: sessions } = await db.from('sessions').select('id, checked_in_at').eq('player_id', p.id).order('checked_in_at', { ascending: false })
    const sessionIds = sessions?.map(s => s.id) ?? []
    const { data: logs } = await db.from('set_logs').select('exercise_id, weight_lbs, reps_completed').in('session_id', sessionIds.length ? sessionIds : ['none']).eq('completed', true)

    // Simple overall trend: compare latest 1RM sum to earlier
    const exerciseIds = [...new Set(logs?.map(l => l.exercise_id) ?? [])]
    let trend: 'up' | 'down' | 'flat' = 'flat'
    if (logs && logs.length > 0 && exerciseIds.length) {
      const recent = logs.slice(0, Math.ceil(logs.length / 2))
      const older = logs.slice(Math.ceil(logs.length / 2))
      const recentBest = getBestOneRepMax(recent)
      const olderBest = getBestOneRepMax(older)
      trend = getTrend([olderBest, recentBest])
    }

    return {
      ...p,
      sessionCount: sessions?.length ?? 0,
      lastSeen: sessions?.[0]?.checked_in_at ?? null,
      trend,
    }
  }))

  return NextResponse.json({ players: enriched })
}

export async function POST(req: NextRequest) {
  const { name, pin, jersey_number, position } = await req.json()
  if (!name || !pin) return NextResponse.json({ error: 'Name and PIN required' }, { status: 400 })
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })

  const db = createServerClient()
  const { data: player, error } = await db
    .from('players')
    .insert({ name, pin, jersey_number: jersey_number || null, position: position || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ player })
}
