// FILE: app/api/team/route.ts
//
// Roster + leaderboard data for Team Mode (/team/[teamId]), the shared
// screen where players without a phone check in and log their sets.
//
//   GET ?teamId=<id>            one team
//   GET ?teamId=<id>,<id>,...   several teams lifting together (up to 6)
//
// Reply:
//   teams    [{ id, name, age_group, color, workoutName, templateId, combine }]
//            in the order asked for (unknown ids are left out). `combine` is
//            { tests } when today's workout is a Combine Day (lib/combine.ts),
//            else null.
//   roster   every active player on those teams (primary team), each with
//            teamId, checked-in / done state and today's stats (on a Combine
//            Day, stats.testsDone / testsTotal: tests with a number today).
//            Players from other teams who train with one of these teams
//            (players.trains_with_team_id, volleyball) are listed with it,
//            with fromTeam = their own team's name.
//   checkedInCount, completedCount   across all the teams
//   team, workoutName, templateId    the first team's (older screens)
//
// Notes:
//  - "Today" is the club's date (lib/clubTime.ts), not Vercel's UTC date.
//  - % complete is measured against her own workout: the sets saved on her
//    session when she opened it (sessions.planned_sets: a modified workout,
//    override or program counts its own sets), else that team's full
//    workout, without the warm-up (lib/warmup.ts): players watch the
//    warm-up, they don't log it.
//  - If a player has more than one session today, all of today's sets count
//    and the open session is the one used for logging.
//  - Set logs are fetched in one query for everyone.
//  - Supabase joins are guarded with Array.isArray.
//  - Pounds moved counts both dumbbells on 2-dumbbell exercises (lib/loads.ts).

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { setPoundsMoved } from '@/lib/loads'
import { equipmentByExercise } from '@/lib/equipmentLookup'
import { clubDateString, clubDayBounds } from '@/lib/clubTime'
import { isWarmupLabel } from '@/lib/warmup'
import { combineMetricsFor } from '@/lib/combine'
import { FEATURES } from '@/lib/features'

type PlayerJoin = { id: string; name: string; jersey_number?: string; is_active: boolean }
type GuestRow = { id: string; name: string; jersey_number?: string; trains_with_team_id: string; player_teams: { team_id: string; is_primary: boolean; teams: { name: string } | { name: string }[] | null }[] | null }
type SessionRow = { id: string; player_id: string; checked_in_at: string; completed_at: string | null; template_id?: string | null; planned_sets?: number | null }
type LogRow = { session_id: string; exercise_id: string; completed: boolean; weight_lbs: number | null; reps_completed: number | null }
type TeamRow = { id: string; name: string; age_group?: string | null; color: string }

const MAX_TEAMS = 6
const ID_RE = /^[0-9a-f-]{8,64}$/i

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('teamId') ?? ''
  const teamIds = [...new Set(decodeURIComponent(raw).split(',').map(s => s.trim()).filter(s => ID_RE.test(s)))].slice(0, MAX_TEAMS)
  if (!teamIds.length) return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })

  const db = createServerClient()
  const today = clubDateString()
  const { start, end } = clubDayBounds(today)

  // ── Teams ──
  const { data: teamRows } = await db
    .from('teams')
    .select('id, name, age_group, color')
    .in('id', teamIds)

  const teamsFound = teamIds
    .map(id => ((teamRows ?? []) as TeamRow[]).find(t => t.id === id))
    .filter((t): t is TeamRow => !!t)
  if (!teamsFound.length) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  const ids = teamsFound.map(t => t.id)

  // ── Today's scheduled workouts ──
  const { data: schedules } = await db
    .from('team_schedule')
    .select('team_id, template_id, workout_templates(name)')
    .in('team_id', ids)
    .eq('scheduled_date', today)

  const scheduleByTeam: Record<string, { templateId: string | null; workoutName: string | null }> = {}
  for (const s of schedules ?? []) {
    if (scheduleByTeam[s.team_id]?.templateId) continue
    scheduleByTeam[s.team_id] = {
      templateId: s.template_id ?? null,
      workoutName: one(s.workout_templates as unknown as { name: string } | { name: string }[] | null)?.name ?? null,
    }
  }

  const templateIds = [...new Set(Object.values(scheduleByTeam).map(s => s.templateId).filter((id): id is string => !!id))]

  // ── Combine Day workouts: which tests ('*' so this works before the migration) ──
  const combineTests: Record<string, string[]> = {}
  if (FEATURES.measurements && templateIds.length) {
    const { data: tmpl } = await db.from('workout_templates').select('*').in('id', templateIds)
    for (const t of tmpl ?? []) {
      if (t.is_combine === true) combineTests[t.id as string] = combineMetricsFor(t.combine_metrics).map(m => m.key)
    }
  }

  // ── Total sets in each of today's workouts (for % complete), warm-up left out ──
  const totalSetsByTemplate: Record<string, number> = {}
  if (templateIds.length) {
    const { data: allBlocks } = await db
      .from('template_blocks')
      .select('id, template_id, sets, block_label')
      .in('template_id', templateIds)
    const blocks = (allBlocks ?? []).filter(b => !isWarmupLabel(b.block_label))

    const blockIds = blocks.map(b => b.id)
    const { data: blockExercises } = blockIds.length
      ? await db.from('template_block_exercises').select('block_id').in('block_id', blockIds)
      : { data: [] }

    const exerciseCountByBlock: Record<string, number> = {}
    for (const be of blockExercises ?? []) {
      exerciseCountByBlock[be.block_id] = (exerciseCountByBlock[be.block_id] ?? 0) + 1
    }
    for (const b of blocks) {
      totalSetsByTemplate[b.template_id] = (totalSetsByTemplate[b.template_id] ?? 0) + (exerciseCountByBlock[b.id] ?? 0) * (b.sets ?? 0)
    }
  }

  // ── Players on these teams (primary team) ──
  const { data: playerTeams } = await db
    .from('player_teams')
    .select('team_id, player_id, players(id, name, jersey_number, is_active)')
    .in('team_id', ids)
    .eq('is_primary', true)

  const seen = new Set<string>()
  const players: Array<PlayerJoin & { teamId: string; fromTeam?: string }> = []
  for (const pt of playerTeams ?? []) {
    const p = one(pt.players as unknown as PlayerJoin | PlayerJoin[] | null)
    if (!p || !p.is_active || seen.has(p.id)) continue
    seen.add(p.id)
    players.push({ ...p, teamId: pt.team_id as string })
  }

  // Players from other teams who come in with one of these teams
  if (FEATURES.datedSchedule) {
    const { data: guests } = await db
      .from('players')
      .select('id, name, jersey_number, trains_with_team_id, player_teams(team_id, is_primary, teams(name))')
      .in('trains_with_team_id', ids)
      .eq('is_active', true)
      .is('coach_id', null)
    for (const g of (guests ?? []) as unknown as GuestRow[]) {
      if (seen.has(g.id)) continue
      const own = (g.player_teams ?? []).find(pt => pt.is_primary)
      seen.add(g.id)
      players.push({
        id: g.id, name: g.name, jersey_number: g.jersey_number, is_active: true,
        teamId: g.trains_with_team_id,
        fromTeam: one(own?.teams ?? null)?.name ?? undefined,
      })
    }
  }
  players.sort((a, b) => a.name.localeCompare(b.name))

  // ── Today's sessions (club-local day) ──
  const playerIds = players.map(p => p.id)
  const { data: sessionsRaw } = playerIds.length
    ? await db
        .from('sessions')
        // '*' so this works before planned_sets exists (workout credit migration)
        .select('*')
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
        .select('session_id, exercise_id, completed, weight_lbs, reps_completed')
        .in('session_id', sessionIds)
    : { data: [] }

  // Combine Day tries today: which tests each session has a number for
  const testsBySession: Record<string, Set<string>> = {}
  if (Object.keys(combineTests).length && sessionIds.length) {
    const { data: tries } = await db.from('combine_attempts').select('session_id, metric').in('session_id', sessionIds)
    for (const t of (tries ?? []) as { session_id: string; metric: string }[]) {
      if (!testsBySession[t.session_id]) testsBySession[t.session_id] = new Set()
      testsBySession[t.session_id].add(t.metric)
    }
  }

  // 2-dumbbell exercises count both dumbbells toward pounds moved
  const equipment = await equipmentByExercise(db, ((logsRaw ?? []) as LogRow[]).map(l => l.exercise_id))

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
        id: p.id, name: p.name, jerseyNumber: p.jersey_number, teamId: p.teamId, fromTeam: p.fromTeam ?? null,
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
      .reduce((sum, l) => sum + setPoundsMoved(l.weight_lbs, l.reps_completed, equipment[l.exercise_id]), 0)

    const firstCheckIn = playerSessions[0].checked_in_at
    const durationMin = !openSession && latestSession.completed_at
      ? Math.round((new Date(latestSession.completed_at).getTime() - new Date(firstCheckIn).getTime()) / 60000)
      : null

    // Her own workout (saved on her session), else the team's
    const templateId = activeSession.template_id ?? scheduleByTeam[p.teamId]?.templateId ?? null
    const templateTotalSets = activeSession.planned_sets ?? (templateId ? totalSetsByTemplate[templateId] ?? 0 : 0)
    const tests = templateId ? combineTests[templateId] : undefined
    const testsDoneSet = new Set(playerSessions.flatMap(s => [...(testsBySession[s.id] ?? [])]))

    return {
      id: p.id,
      name: p.name,
      jerseyNumber: p.jersey_number,
      teamId: p.teamId,
      fromTeam: p.fromTeam ?? null,
      checkedIn: true,
      completed: !openSession,
      sessionId: activeSession.id,
      stats: {
        pct: templateTotalSets > 0 ? Math.min(100, Math.round(completedSets / templateTotalSets * 100)) : 0,
        completedSets,
        totalSets: templateTotalSets,
        totalWeightLbs: Math.round(totalWeight),
        durationMin,
        ...(tests ? { testsDone: tests.filter(k => testsDoneSet.has(k)).length, testsTotal: tests.length } : {}),
      },
    }
  })

  const teams = teamsFound.map(t => ({
    ...t,
    workoutName: scheduleByTeam[t.id]?.workoutName ?? null,
    templateId: scheduleByTeam[t.id]?.templateId ?? null,
    combine: (() => {
      const id = scheduleByTeam[t.id]?.templateId
      return id && combineTests[id] ? { tests: combineTests[id].length } : null
    })(),
  }))

  return NextResponse.json(
    {
      teams,
      roster,
      checkedInCount: roster.filter(r => r.checkedIn).length,
      completedCount: roster.filter(r => r.completed).length,
      // First team, for older screens
      team: teamsFound[0],
      workoutName: teams[0].workoutName,
      templateId: teams[0].templateId,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
