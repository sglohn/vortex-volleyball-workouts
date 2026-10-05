// FILE: app/api/leaderboard/route.ts
//
// Weight Room Leaderboard feed for the standalone TV display (Roku app).
//
// Returns today's leaderboard for EVERY player who has checked in today
// (club-local day), already sorted, trimmed and formatted, so the TV only
// has to draw it.
//
// Optional query params:
//   ?teams=<id>,<id>   only these teams
//   ?gender=F | M      girls or boys only (derived from team name, like elsewhere)
//   ?limit=10          rows per board (1–15, default 10)
//   ?key=...           required only if LEADERBOARD_DISPLAY_KEY is set in Vercel
//
// Pounds moved counts both dumbbells on 2-dumbbell exercises (lib/loads.ts).

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { setLoad, setPoundsMoved } from '@/lib/loads'
import { equipmentByExercise } from '@/lib/equipmentLookup'
import { CLUB_TIMEZONE, clubDateString, clubDayBounds } from '@/lib/clubTime'

type SessionRow = { id: string; player_id: string; checked_in_at: string; completed_at: string | null }
type LogRow = { session_id: string; exercise_id: string; weight_lbs: number | null; reps_completed: number | null; completed: boolean }
type PlayerJoin = { id: string; name: string; jersey_number?: string; is_active: boolean }
type TeamRow = { id: string; name: string; age_group?: string | null; color?: string | null }

type Athlete = {
  id: string; name: string; teamId: string; teamName: string; teamColor: string
  completed: boolean; totalWeightLbs: number; avgWeightPerSet: number
  setsCompleted: number; totalSets: number; pct: number
}

const ACCENTS = {
  weight: '0x56a0d3ff', // carolina
  avg:    '0x8b5cf6ff', // purple
  pct:    '0xf97316ff', // orange
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** '#56a0d3' → '0x56a0d3ff' (Roku colour format). Falls back if the colour is missing or odd. */
function rokuColor(hex: string | null | undefined, fallback: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim())
  return m ? `0x${m[1].toLowerCase()}ff` : fallback
}

function genderOf(teamName: string): 'M' | 'F' {
  return teamName.toLowerCase().includes('boy') ? 'M' : 'F'
}

function clubTimeLabel(at: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: CLUB_TIMEZONE, hour: 'numeric', minute: '2-digit' }).format(at)
}

function clubDayLabel(at: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: CLUB_TIMEZONE, weekday: 'long', month: 'short', day: 'numeric' }).format(at)
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams

  // ── Optional display key ──
  const requiredKey = process.env.LEADERBOARD_DISPLAY_KEY
  if (requiredKey && params.get('key') !== requiredKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const teamFilter = params.get('teams')?.split(',').filter(Boolean) ?? []
  const genderParam = params.get('gender')?.toUpperCase()
  const genderFilter = genderParam === 'M' || genderParam === 'F' ? genderParam : null
  const limit = Math.min(15, Math.max(1, Number(params.get('limit')) || 10))

  const now = new Date()
  const date = clubDateString(now)
  const { start, end } = clubDayBounds(date)

  const db = createServerClient()

  // ── Everyone who checked in today ──
  const { data: sessionsRaw } = await db
    .from('sessions')
    .select('id, player_id, checked_in_at, completed_at')
    .gte('checked_in_at', start)
    .lt('checked_in_at', end)
    .order('checked_in_at', { ascending: true })

  const sessions = (sessionsRaw ?? []) as SessionRow[]
  const playerIds = [...new Set(sessions.map(s => s.player_id))]

  // ── Their primary teams ──
  const { data: playerTeams } = playerIds.length
    ? await db
        .from('player_teams')
        .select('player_id, team_id, players(id, name, jersey_number, is_active)')
        .in('player_id', playerIds)
        .eq('is_primary', true)
    : { data: [] }

  const teamIds = [...new Set((playerTeams ?? []).map(pt => pt.team_id as string))]

  const { data: teamsRaw } = teamIds.length
    ? await db.from('teams').select('id, name, age_group, color').in('id', teamIds)
    : { data: [] }

  const teamById: Record<string, TeamRow> = Object.fromEntries(((teamsRaw ?? []) as TeamRow[]).map(t => [t.id, t]))

  const players = (playerTeams ?? [])
    .map(pt => {
      const p = one(pt.players as unknown as PlayerJoin | PlayerJoin[] | null)
      const team = teamById[pt.team_id as string]
      return p && team ? { ...p, team } : null
    })
    .filter((p): p is PlayerJoin & { team: TeamRow } => !!p && p.is_active)
    .filter(p => !teamFilter.length || teamFilter.includes(p.team.id))
    .filter(p => !genderFilter || genderOf(p.team.name) === genderFilter)

  // ── Set logs ──
  const shownPlayerIds = new Set(players.map(p => p.id))
  const shownSessions = sessions.filter(s => shownPlayerIds.has(s.player_id))
  const sessionIds = shownSessions.map(s => s.id)

  const { data: logsRaw } = sessionIds.length
    ? await db
        .from('set_logs')
        .select('session_id, exercise_id, weight_lbs, reps_completed, completed')
        .in('session_id', sessionIds)
    : { data: [] }

  // 2-dumbbell exercises count both dumbbells toward pounds moved
  const equipment = await equipmentByExercise(db, ((logsRaw ?? []) as LogRow[]).map(l => l.exercise_id))

  const logsBySession: Record<string, LogRow[]> = {}
  for (const log of (logsRaw ?? []) as LogRow[]) {
    if (!logsBySession[log.session_id]) logsBySession[log.session_id] = []
    logsBySession[log.session_id].push(log)
  }

  const sessionsByPlayer: Record<string, SessionRow[]> = {}
  for (const s of shownSessions) {
    if (!sessionsByPlayer[s.player_id]) sessionsByPlayer[s.player_id] = []
    sessionsByPlayer[s.player_id].push(s)
  }

  // ── Total sets in each team's workout today (for % complete) ──
  const shownTeamIds = [...new Set(players.map(p => p.team.id))]
  const { data: schedules } = shownTeamIds.length
    ? await db.from('team_schedule').select('team_id, template_id').in('team_id', shownTeamIds).eq('scheduled_date', date)
    : { data: [] }

  const templateByTeam: Record<string, string> = {}
  for (const s of schedules ?? []) if (s.template_id) templateByTeam[s.team_id] = s.template_id

  const templateIds = [...new Set(Object.values(templateByTeam))]
  const totalSetsByTemplate: Record<string, number> = {}

  if (templateIds.length) {
    const { data: blocks } = await db.from('template_blocks').select('id, template_id, sets').in('template_id', templateIds)
    const blockIds = (blocks ?? []).map(b => b.id)
    const { data: blockExercises } = blockIds.length
      ? await db.from('template_block_exercises').select('block_id').in('block_id', blockIds)
      : { data: [] }

    const exerciseCountByBlock: Record<string, number> = {}
    for (const be of blockExercises ?? []) {
      exerciseCountByBlock[be.block_id] = (exerciseCountByBlock[be.block_id] ?? 0) + 1
    }
    for (const b of blocks ?? []) {
      totalSetsByTemplate[b.template_id] =
        (totalSetsByTemplate[b.template_id] ?? 0) + (exerciseCountByBlock[b.id] ?? 0) * (b.sets ?? 0)
    }
  }

  // ── Per-athlete totals ──
  const athletes: Athlete[] = players.map(p => {
    const playerSessions = sessionsByPlayer[p.id] ?? []
    const completedLogs = playerSessions.flatMap(s => logsBySession[s.id] ?? []).filter(l => l.completed)

    const totalWeight = completedLogs.reduce((sum, l) => sum + setPoundsMoved(l.weight_lbs, l.reps_completed, equipment[l.exercise_id]), 0)
    const weighted = completedLogs.filter(l => (l.weight_lbs ?? 0) > 0)
    const avg = weighted.length ? weighted.reduce((sum, l) => sum + setLoad(l.weight_lbs, equipment[l.exercise_id]), 0) / weighted.length : 0

    const templateId = templateByTeam[p.team.id]
    const totalSets = templateId ? (totalSetsByTemplate[templateId] ?? 0) : 0
    const setsCompleted = completedLogs.length

    return {
      id: p.id,
      name: p.name,
      teamId: p.team.id,
      teamName: p.team.name,
      teamColor: rokuColor(p.team.color, ACCENTS.weight),
      completed: playerSessions.length > 0 && playerSessions.every(s => !!s.completed_at),
      totalWeightLbs: Math.round(totalWeight),
      avgWeightPerSet: Math.round(avg),
      setsCompleted,
      totalSets,
      pct: totalSets > 0 ? Math.min(100, Math.round(setsCompleted / totalSets * 100)) : 0,
    }
  })

  // ── Boards ──
  function board(
    key: keyof typeof ACCENTS, title: string, sub: string,
    sorted: Athlete[], score: (a: Athlete) => number, display: (a: Athlete) => string,
  ) {
    const top = sorted.slice(0, limit)
    const max = Math.max(0, ...top.map(score))
    return {
      key, title, sub, accent: ACCENTS[key],
      rows: top.map((a, i) => ({
        rank: i + 1,
        name: a.name,
        team: a.teamName,
        teamColor: a.teamColor,
        done: a.completed,
        value: display(a),
        bar: key === 'pct' ? score(a) : (max > 0 ? Math.round(score(a) / max * 100) : 0),
      })),
    }
  }

  const byName = (a: Athlete, b: Athlete) => a.name.localeCompare(b.name)

  const categories = [
    board('weight', 'Most Weight Moved', 'Total lbs lifted today',
      [...athletes].sort((a, b) => b.totalWeightLbs - a.totalWeightLbs || byName(a, b)),
      a => a.totalWeightLbs,
      a => a.totalWeightLbs > 0 ? `${a.totalWeightLbs.toLocaleString('en-US')} lbs` : '—'),
    board('avg', 'Heaviest Average', 'Avg lbs per set logged',
      [...athletes].sort((a, b) => b.avgWeightPerSet - a.avgWeightPerSet || byName(a, b)),
      a => a.avgWeightPerSet,
      a => a.avgWeightPerSet > 0 ? `${a.avgWeightPerSet} lbs` : '—'),
    board('pct', '% Complete', 'Furthest through the workout',
      [...athletes].sort((a, b) => b.pct - a.pct || b.setsCompleted - a.setsCompleted || byName(a, b)),
      a => a.pct,
      a => a.totalSets > 0 ? `${a.pct}%` : (a.setsCompleted > 0 ? `${a.setsCompleted} sets` : '—')),
  ]

  const totalLbs = athletes.reduce((sum, a) => sum + a.totalWeightLbs, 0)

  return NextResponse.json(
    {
      date,
      dayLabel: clubDayLabel(now),
      asOf: clubTimeLabel(now),
      summary: {
        lifting: athletes.filter(a => !a.completed).length,
        checkedIn: athletes.length,
        finished: athletes.filter(a => a.completed).length,
        totalLbs,
        totalLbsLabel: totalLbs.toLocaleString('en-US'),
      },
      categories,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
