// FILE: lib/attendance.ts
//
// Weight room attendance for the season, next to each player's health
// reports, so coaches can see who's putting in the work and compare it with
// who gets hurt. Volleyball only (FEATURES.datedSchedule: workouts on set
// dates per team, team_schedule). Data loading is in lib/attendanceLoad.ts;
// this file is the counting rules and is safe to import from client code.
//
// The rules:
//   Season          Aug 1 to Jul 31 (seasonStart). Rolls over by itself.
//   Workout day     a team_schedule row for the team with a workout, from the
//                   season start through today, that counts for attendance
//                   (counts_for_attendance; make-up days are set not to).
//   Counts for her  workout days on or after she joined the team
//                   (player_teams.joined_at). A player who trains with
//                   another team (players.trains_with_team_id) follows that
//                   team's workout days instead, still counted on her team.
//   Attended        she checked in that day (a session that club-local date,
//                   for any team or workout: a coach override, Combine Day
//                   and Team Mode all count).
//   Finished        that session was finished (tapped Finish).
//   Out             she had a health report at Out that day and didn't check
//                   in: not counted against her (shown as "Out").
//   Today           counts once she checks in; until then it's left out, so
//                   nobody shows a miss before the workout has happened.
//   Extra           days she checked in with no team workout that counts
//                   (no workout scheduled, or a make-up day).
//
// Attendance % = attended ÷ workout days that count. A team's % is the whole
// roster added together (attended ÷ counted), so every workout weighs the same.

export type DayStatus = 'finished' | 'attended' | 'missed' | 'out' | 'today'

export interface AttendanceDay { date: string; status: DayStatus }

export interface AttendanceStat {
  /** Workout days that count (attended + missed) */
  counted: number
  attended: number
  finished: number
  missed: number
  /** Missed while Out (not counted) */
  out: number
  /** Check-ins on days with no team workout */
  extra: number
  /** attended ÷ counted, 0–100, null when nothing counts yet */
  pct: number | null
  /** finished ÷ counted */
  finishedPct: number | null
  /** Every workout day so far, oldest first */
  days: AttendanceDay[]
}

export interface HealthStat {
  /** Reports logged this season, by type */
  injuries: number
  pains: number
  soreness: number
  /** Calendar days this season she was at Out (through today) */
  outDays: number
  /** At Out right now */
  outNow: boolean
}

export interface PlayerAttendance { playerId: string; attendance: AttendanceStat; health: HealthStat }

export interface TeamAttendance {
  teamId: string
  teamName: string
  players: number
  /** The team's workout days so far / all season (including ones still to come) */
  workoutsSoFar: number
  workoutsSeason: number
  attended: number
  finished: number
  counted: number
  pct: number | null
  finishedPct: number | null
  /** Players at 90%+ / under 70% (of those with something counted) */
  playersHigh: number
  playersLow: number
  health: HealthStat & { playersInjured: number; playersOutDays: number }
}

export const HIGH_PCT = 90
export const LOW_PCT = 70

/** Aug 1 of the season `today` falls in (YYYY-MM-DD) */
export function seasonStart(today: string): string {
  const [y, m] = today.split('-').map(Number)
  return `${m >= 8 ? y : y - 1}-08-01`
}

/** Jul 31 at the end of that season */
export function seasonEnd(today: string): string {
  const start = seasonStart(today)
  return `${Number(start.slice(0, 4)) + 1}-07-31`
}

export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null
}

/** Each day from `from` to `to` (inclusive), YYYY-MM-DD */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(from + 'T12:00:00Z')
  const end = new Date(to + 'T12:00:00Z')
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/**
 * One player's attendance for one team.
 *   workoutDates  the team's workout days from the season start through today
 *   joinedOn      player_teams.joined_at (null = whole season)
 *   checkIns      club-local date → finished? (true if any session that day was finished)
 *   outDates      club-local dates she was at Out
 */
export function playerAttendance(
  workoutDates: string[],
  joinedOn: string | null,
  checkIns: Map<string, boolean>,
  outDates: Set<string>,
  today: string,
): AttendanceStat {
  const days: AttendanceDay[] = []
  let attended = 0, finished = 0, missed = 0, out = 0
  const workoutSet = new Set(workoutDates)
  for (const date of [...workoutDates].sort()) {
    if (joinedOn && date < joinedOn) continue
    const ci = checkIns.get(date)
    if (ci !== undefined) {
      attended++
      if (ci) finished++
      days.push({ date, status: ci ? 'finished' : 'attended' })
    } else if (date === today) {
      days.push({ date, status: 'today' })
    } else if (outDates.has(date)) {
      out++
      days.push({ date, status: 'out' })
    } else {
      missed++
      days.push({ date, status: 'missed' })
    }
  }
  let extra = 0
  for (const date of checkIns.keys()) if (!workoutSet.has(date)) extra++
  const counted = attended + missed
  return { counted, attended, finished, missed, out, extra, pct: percent(attended, counted), finishedPct: percent(finished, counted), days }
}

export interface ReportForHealth {
  id: string
  report_type: string
  availability: string | null
  status: string | null
  reported_at: string | null
  created_at: string | null
  resolved_at: string | null
}
export interface UpdateForHealth { report_id: string; kind: string; to_availability: string | null; created_at: string }

/**
 * The club-local dates (from `from` through `today`) a player was at Out,
 * from each report's timeline (health_report_updates). A report with no
 * timeline uses its current level from the day it was reported.
 * `dateOf` turns a timestamp into its club-local date (lib/clubTime.ts).
 */
export function outDatesFor(
  reports: ReportForHealth[],
  updates: UpdateForHealth[],
  from: string,
  today: string,
  dateOf: (ts: string) => string,
): Set<string> {
  const out = new Set<string>()
  const byReport = new Map<string, UpdateForHealth[]>()
  for (const u of updates) {
    const list = byReport.get(u.report_id) ?? []
    list.push(u)
    byReport.set(u.report_id, list)
  }
  const addRange = (start: string, end: string) => {
    const a = start < from ? from : start
    const b = end > today ? today : end
    if (a <= b) for (const d of eachDate(a, b)) out.add(d)
  }
  for (const r of reports) {
    const timeline = (byReport.get(r.id) ?? []).sort((x, y) => x.created_at.localeCompare(y.created_at))
    if (!timeline.length) {
      const startTs = r.reported_at ?? r.created_at
      if (r.availability !== 'out' || !startTs) continue
      const open = r.status === 'active' || r.status === 'monitoring'
      if (!open && !r.resolved_at) continue
      addRange(dateOf(startTs), open ? today : dateOf(r.resolved_at as string))
      continue
    }
    // Walk the timeline: logged / level / reopened set the level, cleared ends it
    let outSince: string | null = null
    for (const u of timeline) {
      const level = u.kind === 'cleared' ? null : (u.kind === 'note' ? undefined : u.to_availability)
      if (level === undefined) continue
      if (level === 'out' && outSince === null) outSince = u.created_at
      else if (level !== 'out' && outSince !== null) {
        addRange(dateOf(outSince), dateOf(u.created_at))
        outSince = null
      }
    }
    if (outSince !== null) {
      const open = r.status === 'active' || r.status === 'monitoring'
      addRange(dateOf(outSince), open || !r.resolved_at ? today : dateOf(r.resolved_at))
    }
  }
  return out
}

/** Reports logged this season, by type, plus days at Out */
export function healthStat(reports: ReportForHealth[], outDates: Set<string>, from: string, today: string, dateOf: (ts: string) => string): HealthStat {
  let injuries = 0, pains = 0, soreness = 0
  for (const r of reports) {
    const ts = r.reported_at ?? r.created_at
    if (!ts || dateOf(ts) < from) continue
    if (r.report_type === 'major_injury') injuries++
    else if (r.report_type === 'nagging_pain') pains++
    else if (r.report_type === 'soreness') soreness++
  }
  return { injuries, pains, soreness, outDays: outDates.size, outNow: outDates.has(today) }
}

/** Short date for the day strip: "Tue 11/3" */
export function dayLabel(date: string): string {
  const d = new Date(date + 'T12:00:00Z')
  const wd = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  return `${wd} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

/** Color for an attendance %: green 90+, amber 70–89, red under 70 */
export function pctColor(pct: number | null): string {
  if (pct === null) return 'var(--text-muted)'
  if (pct >= HIGH_PCT) return 'var(--success)'
  if (pct >= LOW_PCT) return 'var(--warning)'
  return 'var(--danger)'
}

export const DAY_STATUS: Record<DayStatus, { label: string; color: string; bg: string }> = {
  finished: { label: 'Finished',             color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  attended: { label: 'Came, didn’t finish',  color: '#65a30d', bg: 'rgba(101,163,13,0.12)' },
  missed:   { label: 'Missed',               color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  out:      { label: 'Out (injured)',        color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  today:    { label: 'Today, not in yet',    color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
}
