// FILE: lib/athleticPoints.ts
//
// TRIAL (Nov 2026): a decathlon-style "absolute" athleticism score, shown
// next to the current score (lib/athleticism.ts) on Coach → Comparisons →
// Score Trial so Steve can see how rankings would change before switching.
// Nothing else uses it yet; the current score is unchanged everywhere.
//
// Why: the current score runs each test through a bell curve against the
// club, so points flatten out near 0 and 100 per test (a player far ahead
// of the next one gets almost nothing for it), and height / reach / block
// touch / approach touch all count size again and again.
//
// How it works:
//   - Three traits, each counted once:
//       Size       standing reach
//       Jumping    standing vertical and max vertical (touch − reach), averaged
//       Quickness  acceleration (endline to net, 9 m) and agility (3-6-3 m
//                  net shuttle), averaged
//   - Each test has a fixed points table, like the decathlon:
//       bigger is better:  points = A × (mark − zero)^C
//       times:             points = A × (zero − time)^C
//     `zero` is the mark worth 0 points, `elite` the mark worth 1,000.
//     C > 1 makes the curve steeper at the top, so each extra inch (or
//     hundredth) is worth more the better you already are, and there's no
//     cap: beating 1,000 is allowed.
//   - Total = Size + Jumping + Quickness (about 0–3,000). It needs all three
//     traits; a trait with one of its two tests uses that one.
//   - The tables are fixed, so a score never moves because someone else
//     tested, girls and boys are on the same scale, and seasons compare.
//
// Agility before AGILITY_COURSE_START was a different course (the boys'
// full 5-10-5 at tryouts), so it isn't counted until they retest.
//
// Shared by the browser and the server, so no server-only imports here.

export const POINTS_EXPONENT = 1.4

/** The first Combine Day on the 3-6-3 m net shuttle (Nov 2, 2026) */
export const AGILITY_COURSE_START = '2026-11-02'

export type PointsTestKey = 'standing_reach_in' | 'standing_vert' | 'max_vert' | 'acceleration_sec' | 'pro_agility_sec'

export interface PointsTest {
  key: PointsTestKey
  label: string
  unit: 'ftin' | 'in' | 'sec'
  /** The mark worth 0 points */
  zero: number
  /** The mark worth 1,000 points */
  elite: number
  lower: boolean
}

export const POINTS_TESTS: PointsTest[] = [
  { key: 'standing_reach_in', label: 'Standing Reach',    unit: 'ftin', zero: 72,  elite: 102, lower: false },
  { key: 'standing_vert',     label: 'Standing Vertical', unit: 'in',   zero: 4,   elite: 30,  lower: false },
  { key: 'max_vert',          label: 'Max Vertical',      unit: 'in',   zero: 6,   elite: 36,  lower: false },
  { key: 'acceleration_sec',  label: 'Acceleration (9 m)', unit: 'sec', zero: 3.0, elite: 1.6, lower: true },
  { key: 'pro_agility_sec',   label: 'Agility (3-6-3 m)', unit: 'sec',  zero: 6.0, elite: 3.4, lower: true },
]

export type TraitKey = 'size' | 'jumping' | 'quickness'

export const TRAITS: { key: TraitKey; label: string; tests: PointsTestKey[] }[] = [
  { key: 'size',      label: 'Size',      tests: ['standing_reach_in'] },
  { key: 'jumping',   label: 'Jumping',   tests: ['standing_vert', 'max_vert'] },
  { key: 'quickness', label: 'Quickness', tests: ['acceleration_sec', 'pro_agility_sec'] },
]

export function pointsTest(key: PointsTestKey): PointsTest {
  return POINTS_TESTS.find(t => t.key === key)!
}

/** Points for one mark (0 at or past the zero mark; no upper cap) */
export function testPoints(test: PointsTest, mark: number | null | undefined): number | null {
  if (mark == null || !Number.isFinite(mark) || mark <= 0) return null
  const span = test.lower ? test.zero - test.elite : test.elite - test.zero
  const over = test.lower ? test.zero - mark : mark - test.zero
  if (over <= 0) return 0
  return 1000 * Math.pow(over / span, POINTS_EXPONENT)
}

export type PointsInputs = Partial<Record<PointsTestKey, number | null>>

export interface PointsResult {
  tests: Partial<Record<PointsTestKey, number>>
  traits: Record<TraitKey, number | null>
  /** Size + Jumping + Quickness; null until all three have a number */
  total: number | null
  missing: TraitKey[]
}

export function athleticPoints(inputs: PointsInputs): PointsResult {
  const tests: Partial<Record<PointsTestKey, number>> = {}
  for (const t of POINTS_TESTS) {
    const p = testPoints(t, inputs[t.key])
    if (p != null) tests[t.key] = p
  }
  const traits = {} as Record<TraitKey, number | null>
  const missing: TraitKey[] = []
  for (const tr of TRAITS) {
    const vals = tr.tests.map(k => tests[k]).filter((v): v is number => v != null)
    traits[tr.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    if (traits[tr.key] == null) missing.push(tr.key)
  }
  const total = missing.length ? null : TRAITS.reduce((s, tr) => s + traits[tr.key]!, 0)
  return { tests, traits, total, missing }
}

/** Agility measured before the net-shuttle course started doesn't count */
export function agilityCounts(measuredAt: string | null | undefined): boolean {
  return !!measuredAt && measuredAt.slice(0, 10) >= AGILITY_COURSE_START
}
