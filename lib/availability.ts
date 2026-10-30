// FILE: lib/availability.ts
//
// How much a health report keeps a player out (health_reports.availability),
// and the timeline of changes (health_report_updates). Migration:
// supabase/migrations/2026-10-30_injury_availability.sql
//
//   full            Aches & Pains   full go, keep an eye on it
//   limited         Work Around It  practicing / lifting with changes
//   out             Out             no practice, games or workouts
//   return_to_play  Return to Play  back from Out, working back in
//   (status 'resolved' = Cleared, full competition)
//
// Safe to import from client components (no server-only imports).

export type Availability = 'full' | 'limited' | 'out' | 'return_to_play'

export interface AvailabilityLevel {
  value: Availability
  label: string
  short: string
  desc: string
  color: string
  bg: string
  border: string
}

/** In the order a coach picks them (least to most serious, then the way back). */
export const AVAILABILITY_LEVELS: AvailabilityLevel[] = [
  { value: 'full',           label: 'Aches & Pains',  short: 'Aches',    desc: 'Full go — keep an eye on it',          color: '#facc15', bg: 'rgba(250,204,21,0.12)',  border: 'rgba(250,204,21,0.4)' },
  { value: 'limited',        label: 'Work Around It', short: 'Limited',  desc: 'Practicing / lifting with changes',     color: '#f97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.4)' },
  { value: 'out',            label: 'Out',            short: 'Out',      desc: 'No practice, games or workouts',        color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.45)' },
  { value: 'return_to_play', label: 'Return to Play', short: 'RTP',      desc: 'Back from Out — working back in',       color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.45)' },
]

export const CLEARED = { label: 'Cleared', desc: 'Full competition again', color: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.4)' }

export const AVAILABILITY_VALUES = AVAILABILITY_LEVELS.map(l => l.value)

export function isAvailability(v: unknown): v is Availability {
  return typeof v === 'string' && (AVAILABILITY_VALUES as string[]).includes(v)
}

export function availabilityLevel(v: string | null | undefined): AvailabilityLevel {
  return AVAILABILITY_LEVELS.find(l => l.value === v) ?? AVAILABILITY_LEVELS[0]
}

/** Board order, most serious first: Out, Return to Play, Work Around It, Aches & Pains. */
export const BOARD_ORDER: Availability[] = ['out', 'return_to_play', 'limited', 'full']

/** How much a level limits the player (higher = more). Used for a player's overall status. */
export const AVAILABILITY_RANK: Record<Availability, number> = { full: 0, limited: 1, return_to_play: 2, out: 3 }

/** The most limiting level among a player's open reports, or null when nothing is open. */
export function worstAvailability(reports: { availability?: string | null; status?: string }[]): Availability | null {
  let worst: Availability | null = null
  for (const r of reports) {
    if (r.status && r.status !== 'active' && r.status !== 'monitoring') continue
    const a = isAvailability(r.availability) ? r.availability : 'full'
    if (worst === null || AVAILABILITY_RANK[a] > AVAILABILITY_RANK[worst]) worst = a
  }
  return worst
}

export interface HealthUpdate {
  id: string
  report_id: string
  kind: 'logged' | 'level' | 'note' | 'cleared' | 'reopened'
  from_availability?: Availability | null
  to_availability?: Availability | null
  note?: string | null
  coach_name?: string | null
  created_at: string
}

const DAY_MS = 24 * 60 * 60 * 1000

export function daysBetween(a: string | number | Date, b: string | number | Date): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / DAY_MS)
}

/** "today", "1 day", "12 days" (whole days, rounded down). */
export function formatDays(days: number): string {
  const d = Math.floor(days)
  if (d <= 0) return 'today'
  return d === 1 ? '1 day' : `${d} days`
}

export interface StageTotals {
  /** Days spent at each level (open reports count up to now). */
  days: Record<Availability, number>
  /** Report start to Cleared (or to now when still open). */
  totalDays: number
  everOut: boolean
  /** True once the report is Cleared. */
  cleared: boolean
}

/**
 * Days at each level, from the report's timeline. Falls back to the report's
 * current level for its whole life when there is no timeline (shouldn't
 * happen after the migration, but keeps old data safe).
 */
export function stageTotals(
  report: { availability?: string | null; reported_at: string; resolved_at?: string | null; status: string },
  updates: HealthUpdate[] | null | undefined,
  now: Date = new Date(),
): StageTotals {
  const days: Record<Availability, number> = { full: 0, limited: 0, out: 0, return_to_play: 0 }
  const cleared = report.status === 'resolved'
  const end = cleared && report.resolved_at ? new Date(report.resolved_at) : now

  // Each change to a level starts a stage; it lasts until the next change or Cleared.
  const sorted = [...(updates ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const marks: { at: string; level: Availability | null }[] = []
  for (const u of sorted) {
    if ((u.kind === 'logged' || u.kind === 'level' || u.kind === 'reopened') && isAvailability(u.to_availability)) {
      marks.push({ at: u.created_at, level: u.to_availability })
    } else if (u.kind === 'cleared') {
      marks.push({ at: u.created_at, level: null })
    }
  }
  if (!marks.length || new Date(marks[0].at) > new Date(report.reported_at)) {
    // No starting point recorded: assume the first known level (or the current one) from the start
    const first = marks.find(m => m.level)?.level ?? (isAvailability(report.availability) ? report.availability : 'full')
    marks.unshift({ at: report.reported_at, level: first })
  }

  for (let i = 0; i < marks.length; i++) {
    const m = marks[i]
    if (!m.level) continue
    const stop = i + 1 < marks.length ? new Date(marks[i + 1].at) : end
    days[m.level] += daysBetween(m.at, stop)
  }

  return {
    days,
    totalDays: daysBetween(report.reported_at, end),
    everOut: days.out > 0 || marks.some(m => m.level === 'out'),
    cleared,
  }
}

/** One line for a timeline row, e.g. "Out → Return to Play". */
export function describeUpdate(u: HealthUpdate): string {
  switch (u.kind) {
    case 'logged':   return `Logged as ${availabilityLevel(u.to_availability).label}`
    case 'level':    return `${u.from_availability ? availabilityLevel(u.from_availability).label : '—'} → ${availabilityLevel(u.to_availability).label}`
    case 'cleared':  return 'Cleared — full competition'
    case 'reopened': return `Reopened as ${availabilityLevel(u.to_availability).label}`
    case 'note':     return 'Progress note'
  }
}
