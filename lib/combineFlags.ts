// FILE: lib/combineFlags.ts
//
// Spots Combine Day numbers that are probably typos, so a coach can check
// them on the Workout Logs page (app/coach/logs), the same way
// lib/outliers.ts flags lifting sets. Nothing is changed automatically —
// these are just notes.
//
// Each try is checked against:
//   - the test's normal range (lib/combine.ts `usual`)
//   - her number from before that day (a big change asks for a look)
//   - her other numbers that day: touches have to be above standing reach,
//     approach touch is normally above block touch, reach and wingspan
//     should fit her height, and a jump's vertical shouldn't be huge
//   - her other tries at the same test (one try far from the rest)
//
// A coach can mark a flagged number "Looks right"
// (app/api/coach/logs/combine). The number is saved with the check
// (combineFingerprint), so if it's changed later the flag comes back.
//
// Shared by the browser and the server, so no server-only imports here.

import { combineText, feetInchesText, isTouchMetric, verticalFrom, type CombineMetric, type CombineMetricKey } from '@/lib/combine'

export const COMBINE_FLAG_RULES = {
  /** Standing reach ÷ height is normally about 1.33 */
  reachRatio: [1.22, 1.45] as [number, number],
  /** Wingspan is normally within a few inches of height */
  wingspanGap: 6,
  /** Verticals bigger than this (inches) are worth a look */
  maxApproachVertical: 38,
  maxBlockVertical: 32,
  /** …or smaller than this */
  minApproachVertical: 8,
  minBlockVertical: 4,
  /** A try this far from her other tries (× the test's bigChange) */
  trySpread: 0.75,
} as const

export type CombineFlagContext = {
  /** Her numbers that day (best try per test) */
  today: Partial<Record<CombineMetricKey, number>>
  /** Her numbers from before that day (latest measurements row) */
  before: Partial<Record<CombineMetricKey, number>>
  /** Her other tries at this same test that day */
  otherTries: number[]
}

function inches(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}″`
}

/** Notes for one try (empty = nothing odd) */
export function flagCombineTry(metric: CombineMetric, value: number, ctx: CombineFlagContext): string[] {
  const R = COMBINE_FLAG_RULES
  const notes: string[] = []
  const key = metric.key
  const reach = ctx.today.standing_reach_in ?? ctx.before.standing_reach_in ?? null
  const reachWhen = ctx.today.standing_reach_in != null ? 'that day' : 'on file'
  const height = ctx.today.height_in ?? ctx.before.height_in ?? null

  // ── Outside the normal range for the test ──
  const [lo, hi] = metric.usual
  if (value < lo || value > hi) notes.push(`${combineText(metric, value)} is unusual for ${metric.label}`)

  // ── Touches: above reach, sensible vertical ──
  if (isTouchMetric(key) && reach != null) {
    const vert = verticalFrom(value, reach)
    if (vert == null) {
      notes.push(`Not above her standing reach ${reachWhen} (${feetInchesText(reach)}). Was the vertical typed instead of the touch?`)
    } else {
      const approach = key === 'approach_vertical_in'
      const max = approach ? R.maxApproachVertical : R.maxBlockVertical
      const min = approach ? R.minApproachVertical : R.minBlockVertical
      if (vert > max || vert < min) notes.push(`That's ${vert < min ? 'only ' : ''}a ${inches(vert)} vertical (reach ${reachWhen} ${feetInchesText(reach)})`)
    }
  }
  if (key === 'approach_vertical_in' && ctx.today.standing_vertical_in != null && value < ctx.today.standing_vertical_in) {
    notes.push(`Lower than her block touch that day (${feetInchesText(ctx.today.standing_vertical_in)})`)
  }

  // ── Reach and wingspan should fit her height ──
  if (key === 'standing_reach_in' && height != null) {
    const ratio = value / height
    if (ratio < R.reachRatio[0] || ratio > R.reachRatio[1]) {
      const lowIn = Math.round(height * R.reachRatio[0] * 2) / 2
      const highIn = Math.round(height * R.reachRatio[1] * 2) / 2
      notes.push(`Doesn't fit her height (${feetInchesText(height)}). Usually ${feetInchesText(lowIn)} to ${feetInchesText(highIn)}`)
    }
  }
  if (key === 'height_in' && reach != null && ctx.today.standing_reach_in == null) {
    const ratio = reach / value
    if (ratio < R.reachRatio[0] || ratio > R.reachRatio[1]) notes.push(`Doesn't fit her standing reach on file (${feetInchesText(reach)})`)
  }
  if (key === 'wingspan_in' && height != null && Math.abs(value - height) > R.wingspanGap) {
    notes.push(`${inches(Math.abs(value - height))} ${value > height ? 'longer' : 'shorter'} than her height (${feetInchesText(height)})`)
  }

  // ── Big change from before that day ──
  const prev = ctx.before[key]
  if (prev != null && Math.abs(value - prev) > metric.bigChange) {
    notes.push(`Big change from last time (${combineText(metric, prev)})`)
  }

  // ── One try far from her other tries ──
  if (ctx.otherTries.length > 0) {
    const sorted = [...ctx.otherTries].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    if (Math.abs(value - median) > metric.bigChange * R.trySpread) {
      notes.push(`Far from her other ${ctx.otherTries.length === 1 ? 'try' : 'tries'} (${sorted.map(v => combineText(metric, v)).join(', ')})`)
    }
  }

  return notes
}

/** The try's number as one string, saved with a "Looks right" check */
export function combineFingerprint(value: number | string): string {
  const n = Number(value)
  return Number.isFinite(n) ? String(n) : ''
}
