// FILE: lib/leaderboardBoards.ts
//
// Board-building rules for the weight room TV leaderboard
// (app/api/leaderboard/route.ts). Everything here is plain math on data the
// route has already loaded, so it can be read and changed without touching
// any database code.
//
// What the TV shows:
//   - Three columns at a time. The first two rotate every PAGE_SECONDS
//     through these pages: Today, Exercise of the Day, Fastest Bar Speed,
//     Team Battle, This Week, Streaks / Most Improved. Pages with nothing to
//     show yet are skipped.
//   - The third column is always New PRs, so a PR shows up within one
//     refresh no matter which page is up.
//   - Girls are only ranked against girls and boys only against boys. When
//     both are lifting, each board appears twice (Girls / Boys) side by side.
//
// The Roku apps draw whatever three boards they are sent, so changing
// anything here needs no Roku update.

import { setLoad, type Equipment } from '@/lib/loads'
import { OUTLIER_RULES } from '@/lib/outliers'

export const PAGE_SECONDS = 15

export const ACCENTS = {
  weight:   '0x56a0d3ff', // carolina
  avg:      '0x8b5cf6ff', // purple
  pct:      '0xf97316ff', // orange
  exercise: '0xc6f432ff', // volt
  speed:    '0x22d3eeff', // cyan
  team:     '0xef4444ff', // red
  week:     '0x8b5cf6ff', // purple
  streak:   '0xf59e0bff', // amber
  improved: '0x22c55eff', // green
  pr:       '0xfbbf24ff', // gold
} as const

export type Gender = 'F' | 'M'

export type BoardRow = {
  rank: number
  name: string
  team: string
  teamColor: string
  done: boolean
  value: string
  bar: number
}

export type Board = {
  key: string
  title: string
  sub: string
  accent: string
  rows: BoardRow[]
}

export type Section = { page: string; boards: Board[] }
export type Page = { name: string; boards: Board[] }

// ── Small helpers ───────────────────────────────────────────────────────

export function genderOf(teamName: string): Gender {
  return teamName.toLowerCase().includes('boy') ? 'M' : 'F'
}

/** 'YYYY-MM-DD' + n days → 'YYYY-MM-DD' (calendar math, no timezone). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Monday of the week a date falls in. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow)
}

/** Weight in the units the player typed, labelled for the TV. */
export function weightText(entered: number, equipment: Equipment | null | undefined): string {
  const n = Number.isInteger(entered) ? String(entered) : entered.toFixed(1)
  if (equipment === 'dumbbell_2') return `${n}# DBs`
  if (equipment === 'dumbbell_1') return `${n}# DB`
  if (equipment === 'landmine') return `${Math.round(setLoad(entered, equipment))} lbs`
  return `${n} lbs`
}

export function lbsText(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} lbs`
}

/** Estimated one-rep max (Epley). Only trusted for 1–12 reps. */
export function estimatedMax(load: number, reps: number | null | undefined): number | null {
  if (!load || load <= 0 || !reps || reps < 1 || reps > 12) return null
  return reps === 1 ? load : load * (1 + reps / 30)
}

// ── Building a board ────────────────────────────────────────────────────

export function makeBoard<T>(opts: {
  key: keyof typeof ACCENTS
  title: string
  sub: string
  items: T[]
  score: (t: T) => number
  value: (t: T) => string
  name: (t: T) => string
  team: (t: T) => string
  teamColor: (t: T) => string
  done?: (t: T) => boolean
  tieBreak?: (a: T, b: T) => number
  /** keep rows that score 0 (default: drop them) */
  keepZero?: boolean
  /** score is already a 0–100 percentage for the bar */
  barIsPct?: boolean
  limit: number
}): Board {
  const kept = opts.keepZero ? opts.items : opts.items.filter(t => opts.score(t) > 0)
  const sorted = [...kept].sort((a, b) =>
    opts.score(b) - opts.score(a) || (opts.tieBreak ? opts.tieBreak(a, b) : 0) || opts.name(a).localeCompare(opts.name(b)))
  const top = sorted.slice(0, opts.limit)
  const max = Math.max(0, ...top.map(opts.score))
  return {
    key: opts.key,
    title: opts.title,
    sub: opts.sub,
    accent: ACCENTS[opts.key],
    rows: top.map((t, i) => ({
      rank: i + 1,
      name: opts.name(t),
      team: opts.team(t),
      teamColor: opts.teamColor(t),
      done: opts.done ? opts.done(t) : false,
      value: opts.value(t),
      bar: opts.barIsPct
        ? Math.max(0, Math.min(100, Math.round(opts.score(t))))
        : (max > 0 ? Math.round(opts.score(t) / max * 100) : 0),
    })),
  }
}

/**
 * Split a list into girls / boys. When only one is present the label is
 * null, so board subtitles don't say "Girls" for no reason.
 */
export function byGender<T>(items: T[], gender: (t: T) => Gender): { label: string | null; items: T[] }[] {
  const girls = items.filter(t => gender(t) === 'F')
  const boys = items.filter(t => gender(t) === 'M')
  if (girls.length && boys.length) return [{ label: 'Girls', items: girls }, { label: 'Boys', items: boys }]
  if (boys.length) return [{ label: null, items: boys }]
  return [{ label: null, items: girls }]
}

export function withLabel(label: string | null, sub: string): string {
  return label ? `${label.toUpperCase()}  |  ${sub}` : sub
}

/**
 * Turn sections into pages of two boards. A section's boards stay together;
 * a section with one board left over is paired with the next one that also
 * has a single board, so no page is half empty.
 */
export function buildPages(sections: Section[]): Page[] {
  const pages: Page[] = []
  let single: Page | null = null

  for (const section of sections) {
    const boards = section.boards.filter(b => b.rows.length > 0)
    for (let i = 0; i < boards.length; i += 2) {
      const chunk = boards.slice(i, i + 2)
      if (chunk.length === 2) {
        pages.push({ name: section.page, boards: chunk })
      } else if (single) {
        single.boards.push(chunk[0])
        if (single.name !== section.page) single.name = `${single.name} / ${section.page}`
        single = null
      } else {
        single = { name: section.page, boards: chunk }
        pages.push(single)
      }
    }
  }
  return pages
}

// ── Personal records ────────────────────────────────────────────────────

export type LiftSet = {
  playerId: string
  exerciseId: string
  /** club-local date YYYY-MM-DD */
  date: string
  /** when it was logged (ISO), for ordering */
  at: string
  /** number the player typed */
  entered: number
  /** total load (both dumbbells, landmine bar) */
  load: number
  reps: number | null
}

export type PrEvent = {
  playerId: string
  exerciseId: string
  date: string
  at: string
  entered: number
  load: number
  gain: number
}

/**
 * Walks every weighted set in time order and records a PR whenever a player
 * beats their heaviest earlier load on that exercise.
 *  - A first-ever log of an exercise is not a PR (nothing to beat yet).
 *  - A jump of more than 25% over their best (the same limit the Workout
 *    Logs page flags) is treated as a probable typo: no PR, and it doesn't
 *    become their new best. Fixing the typo on the Workout Logs page clears
 *    it either way, because PRs are worked out fresh from the saved sets.
 *  - Several PRs on one exercise in one day count once, at the heaviest.
 * Returns only PRs on or after `sinceDate`.
 */
export function findPRs(sets: LiftSet[], sinceDate: string): PrEvent[] {
  const ordered = [...sets].filter(s => s.load > 0).sort((a, b) => a.at.localeCompare(b.at))
  const best = new Map<string, number>()
  const events = new Map<string, PrEvent>()

  for (const s of ordered) {
    const key = `${s.playerId}|${s.exerciseId}`
    const prev = best.get(key)
    if (prev === undefined) { best.set(key, s.load); continue }
    if (s.load <= prev) continue
    if (s.load > prev * OUTLIER_RULES.overBestRatio) continue // probable typo

    best.set(key, s.load)
    if (s.date < sinceDate) continue

    const dayKey = `${key}|${s.date}`
    const earlier = events.get(dayKey)
    events.set(dayKey, {
      playerId: s.playerId,
      exerciseId: s.exerciseId,
      date: s.date,
      at: s.at,
      entered: s.entered,
      load: s.load,
      // gain is measured from their best before that day
      gain: s.load - (earlier ? earlier.load - earlier.gain : prev),
    })
  }

  return [...events.values()].sort((a, b) => b.at.localeCompare(a.at))
}

// ── Most improved ───────────────────────────────────────────────────────

export type Improvement = { playerId: string; exerciseId: string; pct: number }

/**
 * Each player's biggest jump in estimated max on any lift: best of the last
 * two weeks vs. best of the four weeks before that. Needs the lift logged in
 * both windows. Under 3% is noise; over 50% is almost certainly a typo.
 */
export function mostImproved(sets: LiftSet[], today: string): Improvement[] {
  const recentFrom = addDays(today, -13)
  const baseFrom = addDays(today, -41)
  const recent = new Map<string, number>()
  const base = new Map<string, number>()

  for (const s of sets) {
    const e = estimatedMax(s.load, s.reps)
    if (e === null || s.date < baseFrom) continue
    const key = `${s.playerId}|${s.exerciseId}`
    const target = s.date >= recentFrom ? recent : base
    target.set(key, Math.max(target.get(key) ?? 0, e))
  }

  const bestByPlayer = new Map<string, Improvement>()
  for (const [key, r] of recent) {
    const b = base.get(key)
    if (!b) continue
    const pct = (r - b) / b
    if (pct < 0.03 || pct > 0.5) continue
    const [playerId, exerciseId] = key.split('|')
    const current = bestByPlayer.get(playerId)
    if (!current || pct > current.pct) bestByPlayer.set(playerId, { playerId, exerciseId, pct })
  }
  return [...bestByPlayer.values()]
}

// ── Attendance streaks ──────────────────────────────────────────────────

/**
 * Weeks in a row (Mon–Sun) with at least two days in the weight room. The
 * current week only counts once it reaches two days, but it doesn't break
 * the streak while it's still in progress.
 */
export function weekStreak(days: Set<string>, today: string, minDays = 2): number {
  const perWeek = new Map<string, number>()
  for (const d of days) {
    const w = weekStart(d)
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1)
  }
  let week = weekStart(today)
  if ((perWeek.get(week) ?? 0) < minDays) week = addDays(week, -7)
  let streak = 0
  while ((perWeek.get(week) ?? 0) >= minDays) {
    streak++
    week = addDays(week, -7)
  }
  return streak
}
