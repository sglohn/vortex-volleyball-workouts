// FILE: lib/attendanceLoad.ts
//
// Server only. Loads what the attendance numbers need for a set of teams and
// runs the rules in lib/attendance.ts. Used by app/api/coach/attendance.
// Reads only: team_schedule, player_teams, players, sessions, health_reports,
// health_report_updates. Coaches' own workout profiles are never on
// player_teams, so they're left out on their own.

import { createServerClient } from '@/lib/supabase'
import { clubDateOf, clubDateString, clubDayBounds } from '@/lib/clubTime'
import {
  healthStat, outDatesFor, percent, playerAttendance, seasonEnd, seasonStart, HIGH_PCT, LOW_PCT,
  type PlayerAttendance, type ReportForHealth, type TeamAttendance, type UpdateForHealth,
} from '@/lib/attendance'

type Db = ReturnType<typeof createServerClient>

const PAGE = 1000
const CHUNK = 150

/** Every row, a page at a time (Supabase returns at most 1000 per request) */
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return rows
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export interface AttendanceResult {
  seasonStart: string
  today: string
  teams: TeamAttendance[]
  /** teamId → the players on it */
  players: Record<string, PlayerAttendance[]>
}

type Member = { player_id: string; team_id: string; joined_at: string | null; players: { is_active: boolean; coach_id: string | null } | { is_active: boolean; coach_id: string | null }[] | null }

export async function loadAttendance(db: Db, teamIds: string[], today = clubDateString()): Promise<AttendanceResult> {
  const from = seasonStart(today)
  const empty: AttendanceResult = { seasonStart: from, today, teams: [], players: {} }
  if (!teamIds.length) return empty

  // Teams (not Open Gym: that's the TV display only)
  const { data: teamsRaw } = await db.from('teams').select('id, name, age_group, is_open_gym').in('id', teamIds).eq('is_active', true)
  const teams = (teamsRaw ?? []).filter(t => !t.is_open_gym)
  if (!teams.length) return empty
  const ids = teams.map(t => t.id as string)

  // Workout days, all season (future ones only count toward "of N this season").
  // Days set to not count for attendance (make-up days) are left out.
  const schedule = await all<{ team_id: string; scheduled_date: string }>((a, b) =>
    db.from('team_schedule').select('team_id, scheduled_date')
      .in('team_id', ids).not('template_id', 'is', null)
      .eq('counts_for_attendance', true)
      .gte('scheduled_date', from).lte('scheduled_date', seasonEnd(today))
      .order('scheduled_date').range(a, b))
  const workoutsSoFar = new Map<string, string[]>()
  const workoutsSeason = new Map<string, number>()
  for (const s of schedule) {
    workoutsSeason.set(s.team_id, (workoutsSeason.get(s.team_id) ?? 0) + 1)
    if (s.scheduled_date <= today) {
      const list = workoutsSoFar.get(s.team_id) ?? []
      list.push(s.scheduled_date)
      workoutsSoFar.set(s.team_id, list)
    }
  }

  // Rosters: active players, not coach workout profiles
  const membersRaw = await all<Member>((a, b) =>
    db.from('player_teams').select('player_id, team_id, joined_at, players!inner(is_active, coach_id)')
      .in('team_id', ids).eq('players.is_active', true).is('players.coach_id', null)
      .order('player_id').range(a, b))
  const members = membersRaw.filter(m => {
    const p = Array.isArray(m.players) ? m.players[0] : m.players
    return !!p?.is_active && !p.coach_id
  })
  const playerIds = [...new Set(members.map(m => m.player_id))]

  // Check-ins this season: date → finished?
  const checkIns = new Map<string, Map<string, boolean>>()
  const { start } = clubDayBounds(from)
  const { end } = clubDayBounds(today)
  const reports: (ReportForHealth & { player_id: string })[] = []
  const updates: UpdateForHealth[] = []
  for (const part of chunk(playerIds, CHUNK)) {
    const [sessions, reps] = await Promise.all([
      all<{ player_id: string; checked_in_at: string; completed_at: string | null }>((a, b) =>
        db.from('sessions').select('player_id, checked_in_at, completed_at')
          .in('player_id', part).gte('checked_in_at', start).lt('checked_in_at', end)
          .order('checked_in_at').range(a, b)),
      all<ReportForHealth & { player_id: string }>((a, b) =>
        db.from('health_reports').select('id, player_id, report_type, availability, status, reported_at, created_at, resolved_at')
          .in('player_id', part).order('id').range(a, b)),
    ])
    for (const s of sessions) {
      const date = clubDateOf(s.checked_in_at)
      const days = checkIns.get(s.player_id) ?? new Map<string, boolean>()
      days.set(date, (days.get(date) ?? false) || !!s.completed_at)
      checkIns.set(s.player_id, days)
    }
    reports.push(...reps)
  }
  // Each report's level timeline (by report, since player_id there can be empty)
  for (const part of chunk(reports.map(r => r.id), CHUNK)) {
    updates.push(...await all<UpdateForHealth>((a, b) =>
      db.from('health_report_updates').select('report_id, kind, to_availability, created_at')
        .in('report_id', part).order('created_at').range(a, b)))
  }

  // Each player's health once (it's the same on every team she's on)
  const reportsBy = new Map<string, ReportForHealth[]>()
  for (const r of reports) reportsBy.set(r.player_id, [...(reportsBy.get(r.player_id) ?? []), r])
  const playerOfReport = new Map(reports.map(r => [r.id, r.player_id]))
  const updatesBy = new Map<string, UpdateForHealth[]>()
  for (const u of updates) {
    const pid = playerOfReport.get(u.report_id)
    if (pid) updatesBy.set(pid, [...(updatesBy.get(pid) ?? []), u])
  }
  const outBy = new Map<string, Set<string>>()
  const healthBy = new Map<string, ReturnType<typeof healthStat>>()
  for (const pid of playerIds) {
    const reps = reportsBy.get(pid) ?? []
    const outDates = outDatesFor(reps, updatesBy.get(pid) ?? [], from, today, clubDateOf)
    outBy.set(pid, outDates)
    healthBy.set(pid, healthStat(reps, outDates, from, today, clubDateOf))
  }

  const players: Record<string, PlayerAttendance[]> = {}
  const result: TeamAttendance[] = []
  for (const t of teams) {
    const dates = workoutsSoFar.get(t.id) ?? []
    const list: PlayerAttendance[] = members
      .filter(m => m.team_id === t.id)
      .map(m => ({
        playerId: m.player_id,
        attendance: playerAttendance(dates, m.joined_at, checkIns.get(m.player_id) ?? new Map(), outBy.get(m.player_id) ?? new Set(), today),
        health: healthBy.get(m.player_id)!,
      }))
    players[t.id] = list
    const sum = (f: (p: PlayerAttendance) => number) => list.reduce((n, p) => n + f(p), 0)
    const counted = sum(p => p.attendance.counted)
    const attended = sum(p => p.attendance.attended)
    const finished = sum(p => p.attendance.finished)
    const withPct = list.filter(p => p.attendance.pct !== null)
    result.push({
      teamId: t.id,
      teamName: t.name,
      players: list.length,
      workoutsSoFar: dates.length,
      workoutsSeason: workoutsSeason.get(t.id) ?? 0,
      attended, finished, counted,
      pct: percent(attended, counted),
      finishedPct: percent(finished, counted),
      playersHigh: withPct.filter(p => (p.attendance.pct ?? 0) >= HIGH_PCT).length,
      playersLow: withPct.filter(p => (p.attendance.pct ?? 0) < LOW_PCT).length,
      health: {
        injuries: sum(p => p.health.injuries),
        pains: sum(p => p.health.pains),
        soreness: sum(p => p.health.soreness),
        outDays: sum(p => p.health.outDays),
        outNow: list.some(p => p.health.outNow),
        playersInjured: list.filter(p => p.health.injuries > 0).length,
        playersOutDays: list.filter(p => p.health.outDays > 0).length,
      },
    })
  }
  result.sort((a, b) => a.teamName.localeCompare(b.teamName, undefined, { numeric: true }))
  return { seasonStart: from, today, teams: result, players }
}
