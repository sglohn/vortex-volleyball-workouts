// FILE: lib/bodyChecks.ts
//
// Body checks are counted by DAY, not by saved check. A player who signs in
// twice on one day (phone closed, switched to the kiosk, Team Mode after her
// phone) used to get two body_checks rows, so one sore day read as
// "flagged 2× in the last 30 days". Everything that counts flags goes
// through these helpers so one day is one flag.
//
// Safe to import from client components (no server-only imports).
//
// Also the zone ↔ body part names ("r_hip" ↔ "Right Hip") shared by the
// body check API, the body map and the coach's "Fix a mistake" tool.

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

// ─── Zone names ──────────────────────────────────────────────────────────────

const SPECIAL_LABELS: Record<string, string> = {
  head: 'Head', neck: 'Neck', chest: 'Chest', core: 'Core',
  upper_back: 'Upper Back', lower_back: 'Lower Back',
}

/** Body-map zones (components/BodyCheck.tsx), head to toe */
export const BODY_ZONES = [
  'head', 'neck', 'r_shoulder', 'l_shoulder', 'chest', 'upper_back', 'r_elbow', 'l_elbow',
  'core', 'lower_back', 'r_wrist', 'l_wrist', 'r_hip', 'l_hip', 'r_glute', 'l_glute',
  'r_quad', 'l_quad', 'r_hamstring', 'l_hamstring', 'r_knee', 'l_knee',
  'r_shin', 'l_shin', 'r_calf', 'l_calf', 'r_ankle', 'l_ankle',
]

/** "r_knee" → "Right Knee" (same format the coach Log Injury form uses) */
export function zoneToBodyPart(zone: string): string {
  if (SPECIAL_LABELS[zone]) return SPECIAL_LABELS[zone]
  const title = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  if (zone.startsWith('r_')) return `Right ${title(zone.slice(2))}`
  if (zone.startsWith('l_')) return `Left ${title(zone.slice(2))}`
  return title(zone)
}

/** "Right Knee" → "r_knee"; null when it isn't one body-map zone ("Bilateral Ankle", "Finger") */
export function bodyPartToZone(bodyPart: string): string | null {
  const want = bodyPart.trim().toLowerCase()
  return BODY_ZONES.find(z => zoneToBodyPart(z).toLowerCase() === want) ?? null
}

/** The other side's zone ("r_hip" → "l_hip"), or null for head, core, … */
export function otherSide(zone: string): string | null {
  if (zone.startsWith('r_')) return `l_${zone.slice(2)}`
  if (zone.startsWith('l_')) return `r_${zone.slice(2)}`
  return null
}
