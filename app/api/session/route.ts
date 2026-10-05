// FILE: app/api/session/route.ts
//
// Weight Room Leaderboard data for the multi-team session page (/session/[date]).
//
// Fixes in this version:
//  - Day filtering uses the club timezone (lib/clubTime.ts). Previously the
//    "local date" check ran on Vercel's UTC clock, so anyone who checked in
//    after 8 PM Eastern (7 PM in winter) dropped off the leaderboard.
//  - If a player has more than one session today (e.g. finished, then checked
//    in again), all of today's sets count, and the open session is the one
//    used for logging. Previously one session was picked at random.
//  - Supabase joins are guarded with Array.isArray.
//  - Template set totals are counted in one query instead of one per block.
//  - Pounds moved counts both dumbbells on 2-dumbbell exercises (lib/loads.ts).

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { setLoad, setPoundsMoved } from '@/lib/loads'
import { equipmentByExercise } from '@/lib/equipmentLookup'
import { clubDateString, clubDayBounds, clubDateOf, isDateString } from '@/lib/clubTime'

type PlayerJoin = { id: string; name: string; jersey_number?: string; is_active: boolean }
type SessionRow = { id: string; player_id: string; checked_in_at: string; completed_at: string | null }
type LogRow = {
  session_id: string; exercise_id: string; set_number: number
  weight_lbs: number | null; reps_completed: number | null; completed: boolean
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function GET(req: NextRequest) {
  const teamIds = req.nextUrl.searchParams.get('teams')?.split(',').filter(Boolean) ?? []
  const dateParam = req.nextUrl.searchParams.get('date')
  const date = isDateString(dateParam) ? dateParam : clubDateString()

  if (!teamIds.length) return NextResponse.json({ error: 'Missing teams' }, { status: 400 })

  const db = createServerClient()

  // ── Teams ──
  const { data: teams } = await db
    .from('teams')
    .select('id, name, age_group, color')
    .in('id', teamIds)

  // ── Players (primary team only) ──
  const { data: playerTeams } = await db
    .from('player_teams')
    .select('player_id, team_id, players(id, name, jersey_number, is_active)')
    .in('team_id', teamIds)
    .eq('is_primary', true)

  const players = (playerTeams ?? [])
    .map(pt => {
      const p = one(pt.players as unknown as PlayerJoin | PlayerJoin[] | null)
      return p ? { ...p, teamId: pt.team_id as string } : null
    })
    .filter((p): p is PlayerJoin & { teamId: string } => !!p && p.is_active)

  const playerIds = players.map(p => p.id)

  // ── Today's sessions (club-local day) ──
  const { start, end } = clubDayBounds(date)

  const { data: sessionsRaw } = playerIds.length
    ? await db
        .from('sessions')
        .select('id, player_id, checked_in_at, completed_at')
        .in('player_id', playerIds)
        .gte('checked_in_at', start)
        .lt('checked_in_at', end)
        .order('checked_in_at', { ascending: true })
    : { data: [] }

  // Belt-and-braces: keep only sessions whose club-local date matches
  const sessions = ((sessionsRaw ?? []) as SessionRow[]).filter(s => clubDateOf(s.checked_in_at) === date)

  const sessionsByPlayer: Record<string, SessionRow[]> = {}
  for (const s of sessions) {
    if (!sessionsByPlayer[s.player_id]) sessionsByPlayer[s.player_id] = []
    sessionsByPlayer[s.player_id].push(s)
  }

  const sessionIds = sessions.map(s => s.id)

  // ── Set logs for those sessions ──
  const { data: logsRaw } = sessionIds.length
    ? await db
        .from('set_logs')
        .select('session_id, exercise_id, set_number, weight_lbs, reps_completed, completed')
        .in('session_id', sessionIds)
    : { data: [] }

  const logs = (logsRaw ?? []) as LogRow[]
  // 2-dumbbell exercises count both dumbbells toward pounds moved
  const equipment = await equipmentByExercise(db, logs.map(l => l.exercise_id))
  const logsBySession: Record<string, LogRow[]> = Object.fromEntries(sessionIds.map(id => [id, [] as LogRow[]]))
  for (const log of logs) {
    const arr = logsBySession[log.session_id]
    if (arr) arr.push(log)
  }

  // ── Today's scheduled workouts ──
  const { data: schedules } = await db
    .from('team_schedule')
    .select('team_id, template_id, workout_templates(name)')
    .in('team_id', teamIds)
    .eq('scheduled_date', date)

  const templateByTeam: Record<string, { templateId: string; workoutName: string }> = Object.fromEntries(
    (schedules ?? []).map(s => {
      const tmpl = one(s.workout_templates as unknown as { name: string } | { name: string }[] | null)
      return [s.team_id, { templateId: s.template_id, workoutName: tmpl?.name ?? 'Workout' }]
    })
  )

  // ── Total sets per template (for % complete) ──
  const templateIds = [...new Set(Object.values(templateByTeam).map(t => t.templateId).filter(Boolean))]
  const totalSetsByTemplate: Record<string, number> = {}

  if (templateIds.length) {
    const { data: blocks } = await db
      .from('template_blocks')
      .select('id, template_id, sets')
      .in('template_id', templateIds)

    const blockIds = (blocks ?? []).map(b => b.id)
    const { data: blockExercises } = blockIds.length
      ? await db
          .from('template_block_exercises')
          .select('block_id')
          .in('block_id', blockIds)
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

  // ── Build roster ──
  const roster = players.map(p => {
    const playerSessions = sessionsByPlayer[p.id] ?? []
    // Prefer the open session for logging; otherwise the latest one
    const openSession = [...playerSessions].reverse().find(s => !s.completed_at) ?? null
    const latestSession = playerSessions[playerSessions.length - 1] ?? null
    const activeSession = openSession ?? latestSession

    const completedLogs = playerSessions
      .flatMap(s => logsBySession[s.id] ?? [])
      .filter(l => l.completed)

    const totalWeight = completedLogs.reduce((sum, l) =>
      sum + setPoundsMoved(l.weight_lbs, l.reps_completed, equipment[l.exercise_id]), 0)
    const setsCompleted = completedLogs.length

    const templateId = templateByTeam[p.teamId]?.templateId
    const totalSets = templateId ? (totalSetsByTemplate[templateId] ?? 0) : 0
    const pct = totalSets > 0 ? Math.min(100, Math.round(setsCompleted / totalSets * 100)) : 0

    const weightedSets = completedLogs.filter(l => l.weight_lbs && l.weight_lbs > 0)
    const avgWeightPerSet = weightedSets.length > 0
      ? Math.round(weightedSets.reduce((sum, l) => sum + setLoad(l.weight_lbs, equipment[l.exercise_id]), 0) / weightedSets.length)
      : 0

    return {
      id: p.id, name: p.name, jerseyNumber: p.jersey_number, teamId: p.teamId,
      checkedIn: playerSessions.length > 0,
      completed: playerSessions.length > 0 && !openSession,
      sessionId: activeSession?.id ?? null,
      checkedInAt: playerSessions[0]?.checked_in_at ?? null,
      totalWeightLbs: Math.round(totalWeight), setsCompleted, totalSets, pct, avgWeightPerSet,
    }
  })

  const active = roster.filter(p => p.checkedIn)
  const byWeight = [...active].sort((a, b) => b.totalWeightLbs - a.totalWeightLbs)
  const bySets   = [...active].sort((a, b) => b.setsCompleted - a.setsCompleted)
  const byPct    = [...active].sort((a, b) => b.pct - a.pct)

  return NextResponse.json(
    { teams: teams ?? [], templateByTeam, roster, leaderboard: { byWeight, bySets, byPct }, date },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
