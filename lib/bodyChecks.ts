// FILE: lib/bodyChecks.ts
//
// Body checks are counted by DAY, not by saved check. A player who signs in
// twice on one day (phone closed, switched to the kiosk, Team Mode after her
// phone) used to get two body_checks rows, so one sore day read as
// "flagged 2× in the last 30 days". Everything that counts flags goes
// through these helpers so one day is one flag.
//
// Safe to import from client components (no server-only imports).

import { clubDateString } from './clubTime'

type Regions = Record<string, string>

const RANK: Record<string, number> = { sore: 1, injured: 2 }

/** Club-local date (YYYY-MM-DD) of a check. */
export function checkDay(checkedAt: string): string {
  return clubDateString(new Date(checkedAt))
}

/** Two body maps as one: every area from both, keeping the worse status. */
export function mergeRegions(a: Regions | null | undefined, b: Regions | null | undefined): Regions {
  const out: Regions = { ...(a ?? {}) }
  for (const [zone, status] of Object.entries(b ?? {})) {
    if ((RANK[status] ?? 0) > (RANK[out[zone]] ?? 0)) out[zone] = status
  }
  return out
}

/**
 * One check per player per club day: areas merged (worse status wins), the
 * latest check's other fields kept. Newest first.
 */
export function mergeSameDayChecks<T extends { checked_at: string; regions: Regions | null; player_id?: string }>(checks: T[]): T[] {
  const byDay = new Map<string, T>()
  for (const c of checks) {
    const key = `${c.player_id ?? ''}|${checkDay(c.checked_at)}`
    const prev = byDay.get(key)
    if (!prev) { byDay.set(key, { ...c, regions: { ...(c.regions ?? {}) } }); continue }
    const latest = c.checked_at > prev.checked_at ? c : prev
    byDay.set(key, { ...latest, regions: mergeRegions(prev.regions, c.regions) })
  }
  return [...byDay.values()].sort((a, b) => b.checked_at.localeCompare(a.checked_at))
}

/** How many different days an area was flagged sore or injured. */
export function daysFlagged(checks: { checked_at: string; regions: Regions | null }[], zone: string): number {
  const days = new Set<string>()
  for (const c of checks) {
    const s = c.regions?.[zone]
    if (s === 'sore' || s === 'injured') days.add(checkDay(c.checked_at))
  }
  return days.size
}
