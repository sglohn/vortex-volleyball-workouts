// FILE: lib/athleticism.ts
//
// Composite "Athleticism Score" — implements the methodology you found for
// AVCA's VPI: each of the 8 metrics is rescaled to a value between 0 and 1
// based on sample variance (a z-score run through the normal distribution's
// CDF), the 8 rescaled values are summed, and the sum is multiplied by 100.
// A perfectly average player across all 8 metrics scores ~400 (8 × 0.5 ×
// 100); someone consistently a full standard deviation above average scores
// noticeably higher.
//
// ONE IMPORTANT DIFFERENCE FROM AVCA'S OWN NUMBERS: AVCA's mean/variance
// come from their national pool of ~570 college + ~1360 prospect-age
// players — data we don't have access to. This version computes the mean
// and standard deviation from your OWN club's currently-tested active
// roster instead, since that's the sample we actually have. Practically,
// that means:
//   - A score of ~400 means "average for your club's tested players,"
//     not "average for AVCA's national pool."
//   - Scores will shift slightly over the season as more players get
//     tested and the club's mean/std dev update — this is expected and
//     matches what "based on sample variance" means when the sample is
//     your own roster.
// If you'd rather lock the benchmark to a fixed point in time (e.g. "the
// mean/std dev from opening tryouts, frozen for the whole season") or ever
// get access to AVCA's actual published variance figures, this is the one
// file that needs to change.

export interface AthleticismInputs {
  height_in?: number | null
  standing_reach_in?: number | null
  standing_vertical_in?: number | null   // raw block-touch height (two hands, no approach)
  approach_vertical_in?: number | null   // raw approach-touch height (attack height stand-in)
  acceleration_sec?: number | null
  pro_agility_sec?: number | null
  swing_velocity_mph?: number | null
}

type MetricKey =
  | 'height_in' | 'standing_reach_in' | 'standing_vertical_in' | 'standingVert'
  | 'approach_vertical_in' | 'acceleration_sec' | 'pro_agility_sec' | 'swing_velocity_mph'

// For these two, a LOWER raw time is better, so their z-score gets flipped
// before being run through the normal CDF.
const LOWER_IS_BETTER = new Set<MetricKey>(['acceleration_sec', 'pro_agility_sec'])

export const MIN_METRICS_FOR_SCORE = 5
export const TOTAL_METRICS = 8

const METRIC_KEYS: MetricKey[] = [
  'height_in', 'standing_reach_in', 'standing_vertical_in', 'standingVert',
  'approach_vertical_in', 'acceleration_sec', 'pro_agility_sec', 'swing_velocity_mph',
]

// Standing Vertical Jump isn't stored directly — it's block-touch height
// minus standing reach, same calculation used elsewhere in the app.
function deriveStandingVert(i: AthleticismInputs): number | null {
  if (i.standing_vertical_in == null || i.standing_reach_in == null) return null
  const v = i.standing_vertical_in - i.standing_reach_in
  return v > 0 ? v : null
}

function metricValue(i: AthleticismInputs, key: MetricKey): number | null {
  if (key === 'standingVert') return deriveStandingVert(i)
  const v = i[key as keyof AthleticismInputs] as number | null | undefined
  return v == null || v <= 0 ? null : v
}

export type PopulationStats = Partial<Record<MetricKey, { mean: number; std: number; count: number }>>

// Sample mean & standard deviation for each metric, computed across every
// player in the pool who has that metric recorded. This IS the "sample" in
// "based on sample variance" — currently your club's active, tested roster.
export function buildPopulationStats(pool: AthleticismInputs[]): PopulationStats {
  const stats: PopulationStats = {}
  for (const key of METRIC_KEYS) {
    const values = pool.map(p => metricValue(p, key)).filter((v): v is number => v != null)
    if (values.length < 2) continue
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)
    const std = Math.sqrt(variance)
    if (std > 0) stats[key] = { mean, std, count: values.length }
  }
  return stats
}

// Abramowitz & Stegun erf approximation — accurate to ~1.5e-7, more than
// enough precision for this purpose. JS has no built-in erf/normal CDF.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const t = 1 / (1 + p * ax)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax)
  return sign * y
}
function normalCDF(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

export interface AthleticismResult {
  score: number | null   // null until MIN_METRICS_FOR_SCORE metrics are on file
  metricsUsed: number    // how many of the 8 metrics fed the score
}

// Rescales each available metric to 0–1 via (z-score → normal CDF) against
// the population's mean/std dev, sums them, multiplies by 100 — AVCA's
// stated method. If fewer than 8 metrics are recorded, the average of the
// ones available is projected across all 8 so partial scores stay on the
// same 0–800ish scale as complete ones.
export function calculateAthleticismScore(inputs: AthleticismInputs, population: PopulationStats): AthleticismResult {
  const rescaled: number[] = []
  for (const key of METRIC_KEYS) {
    const value = metricValue(inputs, key)
    const pop = population[key]
    if (value == null || pop == null) continue
    const rawZ = (value - pop.mean) / pop.std
    const z = LOWER_IS_BETTER.has(key) ? -rawZ : rawZ
    rescaled.push(normalCDF(z))
  }

  if (rescaled.length < MIN_METRICS_FOR_SCORE) {
    return { score: null, metricsUsed: rescaled.length }
  }

  const avgRescaled = rescaled.reduce((a, b) => a + b, 0) / rescaled.length
  const score = Math.round(avgRescaled * TOTAL_METRICS * 100 * 10) / 10
  return { score, metricsUsed: rescaled.length }
}
