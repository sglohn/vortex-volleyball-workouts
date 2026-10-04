// FILE: app/api/team/route.ts
//
// Roster + leaderboard data for the single-team kiosk page (/team/[teamId]).
//
// Fixes in this version:
//  - "Today" is the club's date (lib/clubTime.ts), not Vercel's UTC date.
//    Previously, after 8 PM Eastern (7 PM in winter) the kiosk looked up
//    tomorrow's workout and every checked-in player vanished.
//  - % complete is measured against the full workout template. Previously it
//    was completed sets ÷ sets logged so far, which reads ~100% almost always.
//  - If a player has more than one session today, all of today's sets count
//    and the open session is the one used for logging.
//  - Set logs are fetched in one query instead of one per player.
//  - Supabase joins are guarded with Array.isArray.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { clubDateString, clubDayBounds } from '@/lib/clubTime'

type PlayerJoin = { id: string; name: string; jersey_number?: string; is_active: boolean }
type SessionRow = { id: string; player_id: string; checked_in_at: string; completed_at: string | null }
type LogRow = { session_id: string; completed: boolean; weight_lbs: number | null; reps_completed: number | null }

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId')
  if (!teamId) return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })

  const db = createServerClient()
  const today = clubDateString()
  const { start, end } = clubDayBounds(today)

  // ── Team ──
  const { data: team } = await db
    .from('teams')
    .select('id, name, age_group, color')
    .eq('id', teamId)
    .single()

  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  // ── Today's scheduled workout ──
  const { data: schedules } = await db
    .from('team_schedule')
    .select('template_id, workout_templates(name)')
    .eq('team_id', teamId)
    .eq('scheduled_date', today)
    .limit(1)

  const schedule = schedules?.[0] ?? null
  const templateId: string | null = schedule?.template_id ?? null
  const workoutName =
    one(schedule?.workout_templates as unknown as { name: string } | { name: string }[] | null)?.name ?? null

  // ── Total sets in today's workout (for % complete) ──
  let templateTotalSets = 0
  if (templateId) {
    const { data: blocks } = await db
      .from('template_blocks')
      .select('id, sets')
      .eq('template_id', templateId)

    const blockIds = (blocks ?? []).map(b => b.id)
    const { data: blockExercises } = blockIds.length
      ? await db.from('template_block_exercises').select('block_id').in('block_id', blockIds)
      : { data: [] }

    const exerciseCountByBlock: Record<string, number> = {}
    for (const be of blockExercises ?? []) {
      exerciseCountByBlock[be.block_id] = (exerciseCountByBlock[be.block_id] ?? 0) + 1
    }
    for (const b of blocks ?? []) {
      templateTotalSets += (exerciseCountByBlock[b.id] ?? 0) * (b.sets ?? 0)
    }
  }

  // ── Players on this team ──
  const { data: playerTeams } = await db
    .from('player_teams')
    .select('player_id, players(id, name, jersey_number, is_active)')
    .eq('team_id', teamId)
    .eq('is_primary', true)

  const players = (playerTeams ?? [])
    .map(pt => one(pt.players as unknown as PlayerJoin | PlayerJoin[] | null))
    .filter((p): p is PlayerJoin => !!p && p.is_active)
    .sort((a, b) => a.name.localeCompare(b.name))

  // ── Today's sessions (club-local day) ──
  const playerIds = players.map(p => p.id)

  const { data: sessionsRaw } = playerIds.length
    ? await db
        .from('sessions')
        .select('id, player_id, checked_in_at, completed_at')
        .in('player_id', playerIds)
        .gte('checked_in_at', start)
        .lt('checked_in_at', end)
        .order('checked_in_at', { ascending: true })
    : { data: [] }

  const sessions = (sessionsRaw ?? []) as SessionRow[]
  const sessionsByPlayer: Record<string, SessionRow[]> = {}
  for (const s of sessions) {
    if (!sessionsByPlayer[s.player_id]) sessionsByPlayer[s.player_id] = []
    sessionsByPlayer[s.player_id].push(s)
  }

  // ── Set logs for all of today's sessions, in one query ──
  const sessionIds = sessions.map(s => s.id)
  const { data: logsRaw } = sessionIds.length
    ? await db
        .from('set_logs')
        .select('session_id, completed, weight_lbs, reps_completed')
        .in('session_id', sessionIds)
    : { data: [] }

  const logsBySession: Record<string, LogRow[]> = {}
  for (const log of (logsRaw ?? []) as LogRow[]) {
    if (!logsBySession[log.session_id]) logsBySession[log.session_id] = []
    logsBySession[log.session_id].push(log)
  }

  // ── Build roster ──
  const roster = players.map(p => {
    const playerSessions = sessionsByPlayer[p.id] ?? []
    if (!playerSessions.length) {
      return {
        id: p.id, name: p.name, jerseyNumber: p.jersey_number,
        checkedIn: false, completed: false, sessionId: null, stats: null,
      }
    }

    const openSession = [...playerSessions].reverse().find(s => !s.completed_at) ?? null
    const latestSession = playerSessions[playerSessions.length - 1]
    const activeSession = openSession ?? latestSession

    const completedLogs = playerSessions
      .flatMap(s => logsBySession[s.id] ?? [])
      .filter(l => l.completed)

    const completedSets = completedLogs.length
    const totalWeight = completedLogs
      .filter(l => l.weight_lbs)
      .reduce((sum, l) => sum + (l.weight_lbs ?? 0) * (l.reps_completed ?? 1), 0)

    const firstCheckIn = playerSessions[0].checked_in_at
    const durationMin = !openSession && latestSession.completed_at
      ? Math.round((new Date(latestSession.completed_at).getTime() - new Date(firstCheckIn).getTime()) / 60000)
      : null

    return {
      id: p.id,
      name: p.name,
      jerseyNumber: p.jersey_number,
      checkedIn: true,
      completed: !openSession,
      sessionId: activeSession.id,
      stats: {
        pct: templateTotalSets > 0 ? Math.min(100, Math.round(completedSets / templateTotalSets * 100)) : 0,
        completedSets,
        totalSets: templateTotalSets,
        totalWeightLbs: Math.round(totalWeight),
        durationMin,
      },
    }
  })

  return NextResponse.json(
    {
      team,
      roster,
      workoutName,
      templateId,
      checkedInCount: roster.filter(r => r.checkedIn).length,
      completedCount: roster.filter(r => r.completed).length,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
