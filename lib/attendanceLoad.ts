// FILE: lib/attendanceLoad.ts
//
// Server only. Loads what the attendance numbers need for a set of teams and
// runs the rules in lib/attendance.ts. Used by app/api/coach/attendance.
// Reads only: team_schedule, player_teams, players, sessions,
// session_set_counts, combine_attempts, attendance_credit, health_reports,
// health_report_updates (+ templates for older sessions). Coaches' own
// workout profiles are never on player_teams, so they're left out on their own.
//
// What she did each day (lib/attendance.ts DayWork):
//   done     completed sets on that day's sessions (session_set_counts), or
//            Combine tests with a number (combine_attempts)
//   planned  sessions.planned_sets (saved when she opened her workout); for
//            sessions without it: her session's workout (sessions.template_id,
//            or the self-guided workout on it), else a date override that
//            day, else her team's workout that day, counted the same way (warm-up left out; tests on a combine)
//   credit   an admin's decision for that day (attendance_credit)

import { createServerClient } from '@/lib/supabase'
import { clubDateOf, clubDateString, clubDayBounds } from '@/lib/clubTime'
import {
  healthStat, outDatesFor, percent, playerAttendance, seasonEnd, seasonStart, HIGH_PCT, LOW_PCT,
  type DayWork, type PlayerAttendance, type ReportForHealth, type TeamAttendance, type UpdateForHealth,
} from '@/lib/attendance'
import { isWarmupLabel } from '@/lib/warmup'
import { combineMetricsFor } from '@/lib/combine'
import { asGeneratedWorkout } from '@/lib/fullBodyWorkout'

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

type SessionRow = {
  id: string; player_id: string; team_id: string | null; checked_in_at: string
  template_id?: string | null; planned_sets?: number | null; generated_workout?: unknown
}

/** Sets each workout asks for (warm-up left out), or tests on a Combine Day */
export async function plannedByTemplate(db: Db, templateIds: string[]): Promise<Map<string, { planned: number; combine: boolean }>> {
  const out = new Map<string, { planned: number; combine: boolean }>()
  const ids = [...new Set(templateIds)]
  if (!ids.length) return out
  const { data: tmpl } = await db.from('workout_templates').select('*').in('id', ids)
  const combine = new Map<string, number>()
  for (const t of tmpl ?? []) if (t.is_combine === true) combine.set(t.id as string, combineMetricsFor(t.combine_metrics as string[] | null).length)
  const { data: blocksRaw } = await db.from('template_blocks').select('id, template_id, sets, block_label').in('template_id', ids)
  const blocks = (blocksRaw ?? []).filter(b => !isWarmupLabel(b.block_label))
  const perBlock = new Map<string, number>()
  for (const part of chunk(blocks.map(b => b.id as string), CHUNK)) {
    const { data: be } = await db.from('template_block_exercises').select('block_id').in('block_id', part)
    for (const r of be ?? []) perBlock.set(r.block_id, (perBlock.get(r.block_id) ?? 0) + 1)
  }
  for (const id of ids) out.set(id, combine.has(id) ? { planned: combine.get(id)!, combine: true } : { planned: 0, combine: false })
  for (const b of blocks) {
    const cur = out.get(b.template_id)
    if (cur && !cur.combine) cur.planned += (b.sets ?? 0) * (perBlock.get(b.id) ?? 0)
  }
  return out
}

/** Sets in a self-guided workout saved on a session */
function generatedPlanned(raw: unknown): number | null {
  const g = asGeneratedWorkout(raw)
  if (!g) return null
  return g.blocks.reduce((n, b) => n + (b.sets ?? 0) * b.exercises.length, 0)
}

/** Admin decisions for these players this season: player → date → { credit, note } */
async function loadCredits(db: Db, playerIds: string[], from: string): Promise<Map<string, Map<string, { credit: number; note: string | null }>>> {
  const out = new Map<string, Map<string, { credit: number; note: string | null }>>()
  for (const part of chunk(playerIds, CHUNK)) {
    const { data, error } = await db.from('attendance_credit').select('player_id, day, credit, note').in('player_id', part).gte('day', from)
    if (error) return out   // before the migration
    for (const r of data ?? []) {
      const m = out.get(r.player_id) ?? new Map()
      m.set(r.day, { credit: r.credit, note: r.note ?? null })
      out.set(r.player_id, m)
    }
  }
  return out
}

/**
 * What each player did each day: player → club date → DayWork.
 * teamDayTemplate(teamId, date) = that team's scheduled workout (for older
 * sessions that didn't save theirs).
 */
export async function loadDayWork(
  db: Db, playerIds: string[], from: string, today: string,
  teamDayTemplate: (teamId: string | null, date: string) => string | null,
): Promise<Map<string, Map<string, DayWork>>> {
  const { start } = clubDayBounds(from)
  const { end } = clubDayBounds(today)
  const sessions: SessionRow[] = []
  for (const part of chunk(playerIds, CHUNK)) {
    sessions.push(...await all<SessionRow>((a, b) =>
      db.from('sessions').select('*')
        .in('player_id', part).gte('checked_in_at', start).lt('checked_in_at', end)
        .order('checked_in_at').range(a, b)))
  }
  const ids = sessions.map(s => s.id)
  const doneBy = new Map<string, number>()
  const testsBy = new Map<string, Set<string>>()
  for (const part of chunk(ids, CHUNK)) {
    const [counts, tries] = await Promise.all([
      db.from('session_set_counts').select('session_id, done').in('session_id', part),
      db.from('combine_attempts').select('session_id, metric').in('session_id', part),
    ])
    for (const r of counts.data ?? []) doneBy.set(r.session_id, Number(r.done) || 0)
    for (const r of tries.data ?? []) {
      const set = testsBy.get(r.session_id) ?? new Set<string>()
      set.add(r.metric)
      testsBy.set(r.session_id, set)
    }
  }
  // Older sessions didn't save their workout: a coach date override that
  // day, else her team's workout that day
  const overrides = new Map<string, string>()
  for (const part of chunk(playerIds, CHUNK)) {
    const { data } = await db.from('player_overrides').select('player_id, override_date, template_id')
      .in('player_id', part).gte('override_date', from).lte('override_date', today)
    for (const r of data ?? []) if (r.template_id) overrides.set(`${r.player_id}|${r.override_date}`, r.template_id)
  }
  const templateFor = (s: SessionRow) => {
    if (s.template_id) return s.template_id
    if (asGeneratedWorkout(s.generated_workout)) return null
    const date = clubDateOf(s.checked_in_at)
    return overrides.get(`${s.player_id}|${date}`) ?? teamDayTemplate(s.team_id, date)
  }
  const needed = sessions.filter(s => typeof s.planned_sets !== 'number' || s.template_id).map(templateFor).filter((t): t is string => !!t)
  const plans = await plannedByTemplate(db, needed)
  const credits = await loadCredits(db, playerIds, from)

  const out = new Map<string, Map<string, DayWork>>()
  for (const s of sessions) {
    const date = clubDateOf(s.checked_in_at)
    const tmpl = templateFor(s)
    const plan = tmpl ? plans.get(tmpl) : undefined
    const combine = !!plan?.combine
    const planned = typeof s.planned_sets === 'number' ? s.planned_sets : (generatedPlanned(s.generated_workout) ?? plan?.planned ?? 0)
    const done = combine ? (testsBy.get(s.id)?.size ?? 0) : (doneBy.get(s.id) ?? 0)
    const days = out.get(s.player_id) ?? new Map<string, DayWork>()
    const cur = days.get(date)
    const decision = credits.get(s.player_id)?.get(date)
    if (!cur) days.set(date, { done, planned, combine, credit: decision?.credit ?? null, note: decision?.note ?? null })
    else {
      // More than one check-in that day: add up what she did, against the bigger workout
      cur.done += done
      cur.planned = Math.max(cur.planned, planned)
      cur.combine = cur.combine || combine
    }
    out.set(s.player_id, days)
  }
  return out
}

export interface AttendanceResult {
  seasonStart: string
  today: string
  teams: TeamAttendance[]
  /** teamId → the players on it */
  players: Record<string, PlayerAttendance[]>
}

type MemberPlayer = { is_active: boolean; coach_id: string | null; trains_with_team_id: string | null }
type Member = { player_id: string; team_id: string; joined_at: string | null; players: MemberPlayer | MemberPlayer[] | null }

export async function loadAttendance(db: Db, teamIds: string[], today = clubDateString()): Promise<AttendanceResult> {
  const from = seasonStart(today)
  const empty: AttendanceResult = { seasonStart: from, today, teams: [], players: {} }
  if (!teamIds.length) return empty

  // Teams (not Open Gym: that's the TV display only)
  const { data: teamsRaw } = await db.from('teams').select('id, name, age_group, is_open_gym').in('id', teamIds).eq('is_active', true)
  const teams = (teamsRaw ?? []).filter(t => !t.is_open_gym)
  if (!teams.length) return empty
  const ids = teams.map(t => t.id as string)

  // Rosters: active players, not coach workout profiles
  const membersRaw = await all<Member>((a, b) =>
    db.from('player_teams').select('player_id, team_id, joined_at, players!inner(is_active, coach_id, trains_with_team_id)')
      .in('team_id', ids).eq('players.is_active', true).is('players.coach_id', null)
      .order('player_id').range(a, b))
  const memberPlayer = (m: Member) => (Array.isArray(m.players) ? m.players[0] : m.players) ?? null
  const members = membersRaw.filter(m => {
    const p = memberPlayer(m)
    return !!p?.is_active && !p.coach_id
  })
  const playerIds = [...new Set(members.map(m => m.player_id))]
  // A player who comes in with another team follows that team's workout days
  const trainsWith = new Map<string, string>()
  for (const m of members) {
    const other = memberPlayer(m)?.trains_with_team_id
    if (other && other !== m.team_id) trainsWith.set(m.player_id, other)
  }
  const scheduleTeamIds = [...new Set([...ids, ...trainsWith.values()])]

  // Workout days, all season (future ones only count toward "of N this season").
  // Days set to not count for attendance (make-up days) are left out.
  const schedule = await all<{ team_id: string; scheduled_date: string; template_id: string }>((a, b) =>
    db.from('team_schedule').select('team_id, scheduled_date, template_id')
      .in('team_id', scheduleTeamIds).not('template_id', 'is', null)
      .eq('counts_for_attendance', true)
      .gte('scheduled_date', from).lte('scheduled_date', seasonEnd(today))
      .order('scheduled_date').range(a, b))
  const workoutsSoFar = new Map<string, string[]>()
  const workoutsSeason = new Map<string, number>()
  const templateOn = new Map<string, string>()   // team|date → workout
  for (const s of schedule) {
    templateOn.set(`${s.team_id}|${s.scheduled_date}`, s.template_id)
    workoutsSeason.set(s.team_id, (workoutsSeason.get(s.team_id) ?? 0) + 1)
    if (s.scheduled_date <= today) {
      const list = workoutsSoFar.get(s.team_id) ?? []
      list.push(s.scheduled_date)
      workoutsSoFar.set(s.team_id, list)
    }
  }


  // What each player did each workout day (sets against her own workout)
  const checkIns = await loadDayWork(db, playerIds, from, today,
    (teamId, date) => (teamId ? templateOn.get(`${teamId}|${date}`) ?? null : null))

  // Health reports this season
  const reports: (ReportForHealth & { player_id: string })[] = []
  const updates: UpdateForHealth[] = []
  for (const part of chunk(playerIds, CHUNK)) {
    reports.push(...await all<ReportForHealth & { player_id: string }>((a, b) =>
      db.from('health_reports').select('id, player_id, report_type, availability, status, reported_at, created_at, resolved_at')
        .in('player_id', part).order('id').range(a, b)))
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
        attendance: playerAttendance(
          trainsWith.has(m.player_id) ? workoutsSoFar.get(trainsWith.get(m.player_id)!) ?? [] : dates,
          m.joined_at, checkIns.get(m.player_id) ?? new Map(), outBy.get(m.player_id) ?? new Set(), today),
        health: healthBy.get(m.player_id)!,
      }))
    players[t.id] = list
    const sum = (f: (p: PlayerAttendance) => number) => list.reduce((n, p) => n + f(p), 0)
    const counted = sum(p => p.attendance.counted)
    const attended = sum(p => p.attendance.attended)
    const finished = sum(p => p.attendance.finished)
    const creditPts = list.reduce((n, p) => n + p.attendance.credit * 100, 0)
    const withPct = list.filter(p => p.attendance.pct !== null)
    result.push({
      teamId: t.id,
      teamName: t.name,
      players: list.length,
      workoutsSoFar: dates.length,
      workoutsSeason: workoutsSeason.get(t.id) ?? 0,
      attended, finished, counted,
      partial: sum(p => p.attendance.partial),
      signedIn: sum(p => p.attendance.signedIn),
      toReview: sum(p => p.attendance.toReview),
      credit: Math.round(creditPts) / 100,
      pct: counted > 0 ? Math.round(creditPts / counted) : null,
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
