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
//   Her workout     whatever she was given that day (team workout, modified
//                   workout, override, program): sessions.planned_sets, saved
//                   when she opened it (lib/workoutCredit.ts works it out for
//                   older sessions). Combine Day: the tests.
//   Credit          signing in isn't enough. Each workout day earns credit:
//                     Full      every set logged (every test on a Combine
//                               Day): a whole workout
//                     Partial   some sets: her % done (12 of 24 = half)
//                     Signed in no sets: nothing
//                   until an admin decides (attendance_credit), which then
//                   wins: full, none, or any % in between. Partial and
//                   signed-in days from before today wait in "To review".
//   Missed at Out   she had a health report at Out that day and didn't check
//                   in. Out means out of volleyball, not the weight room, so
//                   it counts as a miss like any other; it's shown as
//                   "Missed (Out)" so coaches can see injured players who
//                   aren't coming in.
//   Today           counts once she's done every set (or an admin decides);
//                   until then it's shown in progress and left out, so
//                   nobody drops mid-workout.
//   Extra           days she checked in with no team workout that counts
//                   (no workout scheduled, or a make-up day).
//
// Attendance % = credit earned ÷ workout days that count. A team's % is the
// whole roster added together, so every workout weighs the same.

export type DayStatus = 'finished' | 'partial' | 'signedIn' | 'missed' | 'out' | 'today'

export interface AttendanceDay {
  date: string
  status: DayStatus
  /** Sets logged (tests done on a Combine Day) / what her workout asked for */
  done?: number
  planned?: number
  /** Credit this day earns, 0–100 (null for today while it's left out) */
  credit?: number | null
  /** An admin set the credit (attendance_credit) */
  decided?: boolean
  note?: string | null
  /** Partial or signed-in, before today, nobody has decided yet */
  toReview?: boolean
  combine?: boolean
}

/** One day's check-in, for the rules below */
export interface DayWork {
  /** Sets logged (completed) that day, or Combine tests with a number */
  done: number
  /** What her workout asked for (0 = not known) */
  planned: number
  combine?: boolean
  /** Admin decision (attendance_credit), 0–100 */
  credit?: number | null
  note?: string | null
}

export interface AttendanceStat {
  /** Workout days that count (attended + missed) */
  counted: number
  /** Days she checked in (any amount done) */
  attended: number
  /** Full workouts: every set logged (or given full credit) */
  finished: number
  /** Checked in but not every set, and signed in with nothing */
  partial: number
  signedIn: number
  /** Workouts' worth of credit earned, e.g. 3.5 */
  credit: number
  /** All misses, including the ones while Out */
  missed: number
  /** Of the misses, how many were while she was at Out */
  out: number
  /** Check-ins on days with no team workout */
  extra: number
  /** Partial / signed-in days waiting for an admin */
  toReview: number
  /** credit ÷ counted, 0–100, null when nothing counts yet */
  pct: number | null
  /** full workouts ÷ counted */
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
  /** Partial / signed-in check-ins, and how many wait for an admin */
  partial: number
  signedIn: number
  toReview: number
  /** Workouts' worth of credit earned by the roster */
  credit: number
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

/** Credit a checked-in day earns (0–100) before/after an admin decides */
export function dayCredit(w: DayWork): { status: 'finished' | 'partial' | 'signedIn'; credit: number; pctDone: number } {
  const pctDone = w.planned > 0 ? Math.min(100, Math.round((w.done / w.planned) * 100)) : (w.done > 0 ? 100 : 0)
  const full = w.planned > 0 ? w.done >= w.planned : w.done > 0
  const status = full ? 'finished' : w.done > 0 ? 'partial' : 'signedIn'
  const decided = typeof w.credit === 'number'
  if (!decided) return { status, credit: full ? 100 : pctDone, pctDone }
  // An admin decided: full credit shows as a full workout, anything less as partial
  const credit = w.credit as number
  return { status: credit === 100 ? 'finished' : w.done > 0 || credit > 0 ? 'partial' : 'signedIn', credit, pctDone }
}

/**
 * One player's attendance for one team.
 *   workoutDates  the team's workout days from the season start through today
 *   joinedOn      player_teams.joined_at (null = whole season)
 *   checkIns      club-local date → what she did that day (any team or workout)
 *   outDates      club-local dates she was at Out
 */
export function playerAttendance(
  workoutDates: string[],
  joinedOn: string | null,
  checkIns: Map<string, DayWork>,
  outDates: Set<string>,
  today: string,
): AttendanceStat {
  const days: AttendanceDay[] = []
  let attended = 0, finished = 0, partial = 0, signedIn = 0, missed = 0, out = 0, toReview = 0, credit = 0
  const workoutSet = new Set(workoutDates)
  for (const date of [...new Set(workoutDates)].sort()) {
    if (joinedOn && date < joinedOn) continue
    const w = checkIns.get(date)
    if (w) {
      const c = dayCredit(w)
      const decided = typeof w.credit === 'number'
      const base = { date, done: w.done, planned: w.planned, decided, note: w.note ?? null, combine: !!w.combine }
      if (date === today && c.status !== 'finished' && !decided) {
        // In progress: left out until she's done or the day is over
        days.push({ ...base, status: 'today', credit: null })
        continue
      }
      attended++
      credit += c.credit
      if (c.status === 'finished') finished++
      else if (c.status === 'partial') partial++
      else signedIn++
      const review = c.status !== 'finished' && !decided
      if (review) toReview++
      days.push({ ...base, status: c.status, credit: c.credit, toReview: review })
    } else if (date === today) {
      days.push({ date, status: 'today', credit: null })
    } else if (outDates.has(date)) {
      // Out of volleyball, not the weight room: still a miss
      missed++
      out++
      days.push({ date, status: 'out', credit: 0 })
    } else {
      missed++
      days.push({ date, status: 'missed', credit: 0 })
    }
  }
  let extra = 0
  for (const date of checkIns.keys()) if (!workoutSet.has(date)) extra++
  const counted = attended + missed
  return {
    counted, attended, finished, partial, signedIn, credit: Math.round(credit) / 100,
    missed, out, extra, toReview,
    pct: counted > 0 ? Math.round(credit / counted) : null,
    finishedPct: percent(finished, counted), days,
  }
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
  finished: { label: 'Full workout',         color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  partial:  { label: 'Part of the workout',  color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  signedIn: { label: 'Signed in, no sets',   color: '#b45309', bg: 'rgba(180,83,9,0.14)' },
  missed:   { label: 'Missed',               color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  out:      { label: 'Missed (Out)',         color: '#9f1239', bg: 'rgba(159,18,57,0.12)' },
  today:    { label: 'Today (counts when done)', color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
}
