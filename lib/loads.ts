// FILE: lib/loads.ts
//
// Equipment and weight rules for the weight room.
//
// Each site has its own dumbbells and large bands (lib/brand.ts):
//   Vortex            dumbbells 5–50 by 5s; large bands Yellow, Red, Black, Purple
//   Bruisers Lacrosse dumbbells 2.5, 5, 7.5, 10, 12.5, 15, then 20–50 by 5s;
//                     large bands Orange (extra light), Red (light),
//                     Green (medium), Orange (heavy, the thicker one),
//                     White (extra heavy)
//   Med balls: Vortex 10 lb balls and one 14 lb ball; Bruisers Lacrosse
//              6, 8, 10, 12, 14, 16, 20 and 30 lb balls
// Bars, plates, trap bars and hip bands are the same on both.
//
// What players type:
//   Barbell        - the total on the bar (bar + plates), e.g. 135
//   1 dumbbell     - the number on the dumbbell, e.g. 30
//   2 dumbbells    - the number on ONE dumbbell, e.g. 30 (holding two 30s)
//   Landmine       - the plates on the bar's free end, e.g. 25 (0 = empty bar)
//                    Used for Landmine and Viking Press exercises. Pounds
//                    moved adds the bar's felt weight (LANDMINE_BAR_LBS).
//   Med ball       - the ball's weight (MEDBALLS_LBS for this site; the
//                    picker starts on 10)
//   Large band /   - the band's color (no weight). Saved in set_logs.band,
//   Hip band         e.g. 'hip_blue' (BANDS below)
//   Other          - whatever the weight is (machine, sled, etc.)
//
// set_logs.weight_lbs stores exactly what the player typed. Anything that
// counts pounds moved (leaderboards, session totals) multiplies by the
// number of dumbbells, so two 30s count as 60.
//
// Suggestions are always a weight that can actually be loaded:
//   Barbell   - 45 lb bar + pairs of 45/35/25/10/5/2.5 plates
//               → 45, 50, 55 … (5 lb steps, never below the empty bar)
//   Dumbbells - the nearest dumbbell this site has (per dumbbell)
//   Landmine  - plates on one end in 2.5 lb steps (lightest suggestion is
//               2.5; players can still enter 0 for the empty bar)
//   Other / not set - nearest 5 lbs
//   Bands and med balls get no weight suggestion. For bands the coach picks
//   a band per exercise in the workout (template_block_exercises.recommended_band).

import { BRAND } from '@/lib/brand'

const LACROSSE = BRAND.sport === 'lacrosse'

export type Equipment =
  | 'barbell' | 'dumbbell_1' | 'dumbbell_2' | 'landmine'
  | 'medball' | 'large_band' | 'hip_band' | 'other'

export const EQUIPMENT_OPTIONS: { value: Equipment; label: string; hint: string }[] = [
  { value: 'barbell',    label: 'Barbell',      hint: 'Player enters bar + plates total' },
  { value: 'dumbbell_1', label: '1 dumbbell',   hint: 'Player enters the number on the dumbbell' },
  { value: 'dumbbell_2', label: '2 dumbbells',  hint: 'Player enters the number on one dumbbell; counts double' },
  { value: 'landmine',   label: 'Landmine',     hint: 'Bar against the wall; player enters plates on the end' },
  { value: 'medball',    label: 'Med ball',     hint: LACROSSE ? 'Player taps the ball: 6, 8, 10 (default), 12, 14, 16, 20 or 30 lb' : 'Player picks the 10 lb (default) or 14 lb ball' },
  { value: 'large_band', label: 'Large band',   hint: LACROSSE ? 'Player taps the band: Orange, Red, Green, Orange (heavy), White' : 'Player taps the band color: Yellow, Red, Black, Purple' },
  { value: 'hip_band',   label: 'Hip band',     hint: 'Player taps the band color: Green, Yellow, Blue, Red, Black' },
  { value: 'other',      label: 'Other',        hint: 'Machine, sled, etc.' },
]

export const BAR_LBS = 45
export const PLATES_LBS = [45, 35, 25, 10, 5, 2.5]   // per side, used in pairs
// The dumbbells on the rack, lightest first (the number on one dumbbell)
export const DUMBBELLS_LBS = LACROSSE
  ? [2.5, 5, 7.5, 10, 12.5, 15, 20, 25, 30, 35, 40, 45, 50]
  : [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]

// A 45 lb bar with one end in a landmine pivot. Lifted at the free end, the
// lifter carries about half the bar (~22.5 lbs) at any angle; 25 also
// covers grip position and a little friction. Change here if needed.
export const LANDMINE_BAR_LBS = 25

// Med balls in the weight room, lightest first.
//   Vortex: 10 lb balls and one 14 lb ball.
//   Bruisers Lacrosse: 6, 8, 10, 12, 14, 16, 20 and 30 lb.
// Both start on the 10 lb ball.
export const MEDBALLS_LBS = LACROSSE
  ? [6, 8, 10, 12, 14, 16, 20, 30]
  : [10, 14]
export const MEDBALL_DEFAULT_LBS = 10

/** Coach-facing note for med ball exercises (Exercise Library). */
export const MEDBALL_COACH_NOTE = LACROSSE
  ? 'Players start on the 10 lb ball and tap the ball they used (6, 8, 10, 12, 14, 16, 20 or 30 lb). No weight is suggested.'
  : 'Players start on the 10 lb ball and can switch to the 14 lb ball. No weight is suggested.'

/** Player-facing help line in the weight picker. */
export const MEDBALL_PLAYER_HELP = LACROSSE
  ? 'The 10 lb ball is picked for you. Used a different ball? Tap its weight.'
  : 'The 10 lb ball is picked for you. Using the 14 lb ball? Tap it.'

// ── Bands ─────────────────────────────────────────────────────────────────
// Lightest to heaviest. The key is what's saved (set_logs.band and
// template_block_exercises.recommended_band); the SQL migrations
// 2026-10-19_bands_and_medballs.sql and 2026-10-21_lacrosse_large_bands.sql
// list the same keys. Large bands differ by site; hip bands are the same.

export type BandKind = 'large' | 'hip'

export interface BandInfo {
  key: string
  kind: BandKind
  color: string        // 'Yellow'
  level: string        // 'Extra light'
  swatch: string       // button color
  ink: string          // text color on the swatch
}

const VORTEX_LARGE_BANDS: BandInfo[] = [
  { key: 'large_yellow', kind: 'large', color: 'Yellow', level: 'Extra light', swatch: '#facc15', ink: '#111827' },
  { key: 'large_red',    kind: 'large', color: 'Red',    level: 'Light',       swatch: '#dc2626', ink: '#ffffff' },
  { key: 'large_black',  kind: 'large', color: 'Black',  level: 'Medium',      swatch: '#111827', ink: '#ffffff' },
  { key: 'large_purple', kind: 'large', color: 'Purple', level: 'Heavy',       swatch: '#7c3aed', ink: '#ffffff' },
]

// Two of these are orange; the heavy one is the thicker band
const LACROSSE_LARGE_BANDS: BandInfo[] = [
  { key: 'large_orange',       kind: 'large', color: 'Orange', level: 'Extra light', swatch: '#fb923c', ink: '#111827' },
  { key: 'large_red',          kind: 'large', color: 'Red',    level: 'Light',       swatch: '#dc2626', ink: '#ffffff' },
  { key: 'large_green',        kind: 'large', color: 'Green',  level: 'Medium',      swatch: '#16a34a', ink: '#ffffff' },
  { key: 'large_orange_heavy', kind: 'large', color: 'Orange', level: 'Heavy',       swatch: '#c2410c', ink: '#ffffff' },
  { key: 'large_white',        kind: 'large', color: 'White',  level: 'Extra heavy', swatch: '#ffffff', ink: '#111827' },
]

export const BANDS: BandInfo[] = [
  ...(LACROSSE ? LACROSSE_LARGE_BANDS : VORTEX_LARGE_BANDS),
  { key: 'hip_green',    kind: 'hip',   color: 'Green',  level: 'Extra light', swatch: '#16a34a', ink: '#ffffff' },
  { key: 'hip_yellow',   kind: 'hip',   color: 'Yellow', level: 'Light',       swatch: '#facc15', ink: '#111827' },
  { key: 'hip_blue',     kind: 'hip',   color: 'Blue',   level: 'Medium',      swatch: '#2563eb', ink: '#ffffff' },
  { key: 'hip_red',      kind: 'hip',   color: 'Red',    level: 'Heavy',       swatch: '#dc2626', ink: '#ffffff' },
  { key: 'hip_black',    kind: 'hip',   color: 'Black',  level: 'Extra heavy', swatch: '#111827', ink: '#ffffff' },
]

export function asEquipment(value: unknown): Equipment | null {
  return value === 'barbell' || value === 'dumbbell_1' || value === 'dumbbell_2' || value === 'landmine'
    || value === 'medball' || value === 'large_band' || value === 'hip_band' || value === 'other'
    ? value
    : null
}

export function isBandEquipment(equipment: Equipment | null | undefined): equipment is 'large_band' | 'hip_band' {
  return equipment === 'large_band' || equipment === 'hip_band'
}

/** Bands and med balls: the app never suggests a weight for these. */
export function skipsWeightSuggestion(equipment: Equipment | null | undefined): boolean {
  return isBandEquipment(equipment) || equipment === 'medball'
}

/** The bands a band exercise uses, lightest first ([] for anything else). */
export function bandsFor(equipment: Equipment | null | undefined): BandInfo[] {
  if (equipment === 'large_band') return BANDS.filter(b => b.kind === 'large')
  if (equipment === 'hip_band') return BANDS.filter(b => b.kind === 'hip')
  return []
}

export function asBand(value: unknown): string | null {
  return typeof value === 'string' && BANDS.some(b => b.key === value) ? value : null
}

export function bandInfo(key: string | null | undefined): BandInfo | null {
  return BANDS.find(b => b.key === key) ?? null
}

/** True when another band of the same kind has the same color (lacrosse's two oranges) */
function colorRepeats(b: BandInfo): boolean {
  return BANDS.some(o => o.kind === b.kind && o.key !== b.key && o.color === b.color)
}

/** "Orange" or, when two bands share the color, "Orange (heavy)" */
export function bandName(b: BandInfo): string {
  return colorRepeats(b) ? `${b.color} (${b.level.toLowerCase()})` : b.color
}

/** "Blue band"; "Orange band (heavy)" when two bands share the color */
export function bandLabel(key: string | null | undefined): string {
  const b = bandInfo(key)
  if (!b) return ''
  return colorRepeats(b) ? `${b.color} band (${b.level.toLowerCase()})` : `${b.color} band`
}

/** "Blue band (medium)" */
export function bandLongLabel(key: string | null | undefined): string {
  const b = bandInfo(key)
  return b ? `${b.color} band (${b.level.toLowerCase()})` : ''
}

/** How many implements the entered number is multiplied by for pounds moved. */
export function implementCount(equipment: Equipment | null | undefined): number {
  return equipment === 'dumbbell_2' ? 2 : 1
}

/**
 * Weight the entered number stands for in the suggestion math, on top of
 * what was entered: the landmine bar's felt weight, 0 for everything else.
 */
export function entryOffset(equipment: Equipment | null | undefined): number {
  return equipment === 'landmine' ? LANDMINE_BAR_LBS : 0
}

/**
 * Total load in one set: entered weight × dumbbells, plus the landmine
 * bar. A landmine set with no weight entered counts as the empty bar.
 */
export function setLoad(weightEntered: number | null | undefined, equipment: Equipment | null | undefined): number {
  return (weightEntered ?? 0) * implementCount(equipment) + entryOffset(equipment)
}

/** Pounds moved in one set: load × reps. */
export function setPoundsMoved(
  weightEntered: number | null | undefined,
  reps: number | null | undefined,
  equipment: Equipment | null | undefined,
): number {
  return setLoad(weightEntered, equipment) * (reps ?? 1)
}

/** Closest value in a sorted list; on an exact tie, the lower one. */
function nearest(values: number[], target: number): number {
  let best = values[0]
  for (const v of values) {
    if (Math.abs(v - target) < Math.abs(best - target)) best = v
  }
  return best
}

/** Barbell totals that can be loaded: 45, then 5 lb steps (2.5 per side). */
function nearestBarbellLoad(target: number): number {
  if (target <= BAR_LBS) return BAR_LBS
  const steps = (target - BAR_LBS) / 5
  const down = Math.floor(steps)
  const up = Math.ceil(steps)
  // nearest step; exact tie goes to the lighter load
  const pick = steps - down <= up - steps ? down : up
  return BAR_LBS + pick * 5
}

/**
 * Round a suggested weight (in the units the player enters) to one that can
 * actually be loaded with this equipment. Returns 0 for 0/no suggestion.
 */
export function roundToLoadable(weight: number, equipment: Equipment | null | undefined): number {
  if (!weight || weight <= 0) return 0
  switch (equipment) {
    case 'barbell':
      return nearestBarbellLoad(weight)
    case 'dumbbell_1':
    case 'dumbbell_2':
      return nearest(DUMBBELLS_LBS, weight)
    case 'medball':
      return nearest(MEDBALLS_LBS, weight)
    case 'landmine': {
      // plates on one end: 2.5 lb steps, lightest suggestion 2.5
      const steps = weight / 2.5
      const down = Math.floor(steps)
      const pick = steps - down <= 0.5 ? down : down + 1
      return Math.max(2.5, pick * 2.5)
    }
    default: {
      const steps = weight / 5
      const down = Math.floor(steps)
      const pick = steps - down <= 0.5 ? down : down + 1
      return Math.max(5, pick * 5)
    }
  }
}

/** Fewest plates (heaviest first) that add up to a weight. */
function platesFor(weight: number): number[] {
  let left = weight
  const plates: number[] = []
  for (const p of PLATES_LBS) {
    while (left >= p - 1e-9) {
      plates.push(p)
      left -= p
    }
  }
  return plates
}

/** Plates to put on EACH side of the bar for a barbell total, heaviest first. */
export function platesPerSide(total: number): number[] {
  return platesFor((total - BAR_LBS) / 2)
}

/** Short label for a weight in entered units: "135 lbs", "30# DB", "30# DBs". */
export function loadLabel(weight: number, equipment: Equipment | null | undefined): string {
  if (equipment === 'landmine') return weight > 0 ? `${weight} lbs of plates` : 'Empty bar'
  if (equipment === 'dumbbell_2') return `${weight}# DBs`
  if (equipment === 'dumbbell_1') return `${weight}# DB`
  if (equipment === 'medball') return `${weight} lb ball`
  return `${weight} lbs`
}

/** Label for the weight input box. */
export function weightInputLabel(equipment: Equipment | null | undefined): string {
  if (equipment === 'dumbbell_2') return 'Weight per DB'
  if (equipment === 'dumbbell_1') return 'DB weight'
  if (equipment === 'landmine') return 'Plates on end (lbs)'
  if (equipment === 'medball') return 'Med ball (lbs)'
  if (isBandEquipment(equipment)) return 'Band'
  return 'Weight (lbs)'
}

/**
 * Plate setup line: barbell → "Empty bar" or "45 + 25 each side";
 * landmine → "25 + 10 on the end"; '' otherwise.
 */
export function plateText(total: number, equipment: Equipment | null | undefined): string {
  if (equipment === 'landmine') {
    if (!total) return ''
    return `${platesFor(total).join(' + ')} on the end`
  }
  if (equipment !== 'barbell' || !total) return ''
  const plates = platesPerSide(total)
  if (!plates.length) return 'Empty bar'
  return `${plates.join(' + ')} each side`
}

// ── One logged set: weight or band ──────────────────────────────────────
// The logging pages keep what the player picked in one string (the weight
// box's value): a number for weights, or a band key for band exercises.
// These turn that string into what's saved, and a saved set back into
// that string or a short label.

export interface LoggedEntry {
  weight_lbs?: number | null
  band?: string | null
  completed?: boolean
  set_number?: number
}

/** What /api/sets gets: band exercises send `band` and no weight. */
export function entryPayload(equipment: Equipment | null | undefined, input: string): { weightLbs: number | null; band?: string | null } {
  if (isBandEquipment(equipment)) {
    // only a band of this exercise's kind (large vs hip)
    return { weightLbs: null, band: bandsFor(equipment).some(b => b.key === input) ? input : null }
  }
  const n = input ? parseFloat(input) : NaN
  return { weightLbs: Number.isFinite(n) ? n : null }
}

/** The same thing for the page's own copy of the set after saving. */
export function entryLogFields(equipment: Equipment | null | undefined, input: string): { weight_lbs?: number; band?: string } {
  const p = entryPayload(equipment, input)
  if (isBandEquipment(equipment)) return p.band ? { band: p.band } : {}
  return p.weightLbs !== null ? { weight_lbs: p.weightLbs } : {}
}

/** A saved set back into the picker's string ('' when nothing). */
export function entryValue(log: LoggedEntry | null | undefined, equipment: Equipment | null | undefined): string {
  if (!log) return ''
  if (isBandEquipment(equipment)) return asBand(log.band) ?? ''
  return log.weight_lbs === null || log.weight_lbs === undefined ? '' : String(log.weight_lbs)
}

/** Short label for a saved set's load: "Blue band", "30# DBs", "10 lb ball"; '' when none. */
export function entryText(log: LoggedEntry | null | undefined, equipment: Equipment | null | undefined): string {
  if (!log) return ''
  if (isBandEquipment(equipment)) return bandLabel(log.band)
  return log.weight_lbs ? loadLabel(Number(log.weight_lbs), equipment) : ''
}

/**
 * What the player used on their latest completed set of this exercise
 * today ('' if none), so the next set can start from it.
 */
export function previousEntry(setLogs: LoggedEntry[] | null | undefined, equipment: Equipment | null | undefined): string {
  const done = (setLogs ?? []).filter(l => l.completed && entryValue(l, equipment) !== '')
  if (!done.length) return ''
  const last = done.reduce((a, b) => ((b.set_number ?? 0) >= (a.set_number ?? 0) ? b : a))
  return entryValue(last, equipment)
}
