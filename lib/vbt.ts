// lib/vbt.ts
// ============================================================
// VELOCITY-BASED TRAINING — CALCULATION ENGINE
//
// Provides:
//   - Load-velocity profile fitting (linear regression)
//   - 1RM estimation from velocity data
//   - Cross-exercise weight suggestion via anchor ratios
//   - Fallback to Epley method when no VBT data exists
// ============================================================

// ------------------------------------------------------------
// TYPES
// ------------------------------------------------------------

export interface VbtDataPoint {
  load_lbs: number
  best_velocity_ms: number
}

export interface LoadVelocityProfile {
  /** Slope of the load-velocity line (lbs per m/s decrease) */
  slope: number
  /** Y-intercept: predicted velocity at zero load */
  v_intercept: number
  /** Estimated 1RM in lbs */
  estimated_1rm_lbs: number
  /** Minimum velocity threshold used */
  mvt_used: number
  /** R² fit quality (0–1). Only meaningful with 3+ points. */
  r_squared: number | null
  /** Number of data points used */
  n_points: number
}

export type WeightSuggestionSource =
  | 'vbt_profile'         // derived from velocity-based 1RM
  | 'vbt_ratio'           // VBT 1RM from another anchor via ratio
  | 'epley'               // estimated from logged reps/weight
  | 'none'                // no data available

export interface WeightSuggestion {
  suggested_weight_lbs: number | null
  suggested_reps: number
  training_zone_pct: number    // % of 1RM this represents
  one_rm_lbs: number | null    // underlying 1RM estimate
  source: WeightSuggestionSource
  source_label: string         // human-readable explanation
  confidence: 'high' | 'medium' | 'low'
}

// ------------------------------------------------------------
// MINIMUM VELOCITY THRESHOLDS (defaults, per anchor slug)
// These are the published/coach-defined MVTs seeded in the DB.
// Stored here as a fallback for client-side calculation.
// ------------------------------------------------------------
export const DEFAULT_MVT: Record<string, number> = {
  squat:              0.30,
  bench_press:        0.17,
  deadlift:           0.15,
  trap_bar_high_pull: 0.50,
}

// ------------------------------------------------------------
// LOAD-VELOCITY LINEAR REGRESSION
//
// The load-velocity relationship is highly linear within the
// working range (40–90% 1RM). We fit a line through the data
// points and extrapolate to the MVT to find 1RM.
//
// Formula:  velocity = v_intercept + slope * load
//           At 1RM:   mvt = v_intercept + slope * 1rm
//           Therefore: 1rm = (mvt - v_intercept) / slope
// ------------------------------------------------------------

/**
 * Fit a linear load-velocity profile from 2 or more data points.
 * Points should be sorted by load ascending.
 */
export function fitLoadVelocityProfile(
  points: VbtDataPoint[],
  mvt: number
): LoadVelocityProfile | null {
  if (points.length < 2) return null

  // Sort by load ascending
  const sorted = [...points].sort((a, b) => a.load_lbs - b.load_lbs)

  let slope: number
  let v_intercept: number
  let r_squared: number | null = null

  if (sorted.length === 2) {
    // Two-point: exact line through both points
    const [p1, p2] = sorted
    slope = (p2.best_velocity_ms - p1.best_velocity_ms) / (p2.load_lbs - p1.load_lbs)
    v_intercept = p1.best_velocity_ms - slope * p1.load_lbs
  } else {
    // 3+ points: ordinary least squares regression
    const n = sorted.length
    const sumX  = sorted.reduce((s, p) => s + p.load_lbs, 0)
    const sumY  = sorted.reduce((s, p) => s + p.best_velocity_ms, 0)
    const sumXY = sorted.reduce((s, p) => s + p.load_lbs * p.best_velocity_ms, 0)
    const sumX2 = sorted.reduce((s, p) => s + p.load_lbs * p.load_lbs, 0)

    slope       = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    v_intercept = (sumY - slope * sumX) / n

    // Calculate R²
    const meanY    = sumY / n
    const ssTot    = sorted.reduce((s, p) => s + Math.pow(p.best_velocity_ms - meanY, 2), 0)
    const ssRes    = sorted.reduce((s, p) => {
      const predicted = v_intercept + slope * p.load_lbs
      return s + Math.pow(p.best_velocity_ms - predicted, 2)
    }, 0)
    r_squared = ssTot > 0 ? 1 - ssRes / ssTot : null
  }

  // Slope must be negative (velocity decreases as load increases)
  if (slope >= 0) return null

  // Extrapolate to 1RM: load at which velocity = MVT
  const estimated_1rm_lbs = (mvt - v_intercept) / slope

  // Sanity check — 1RM must be greater than heaviest test load
  const maxTestLoad = sorted[sorted.length - 1].load_lbs
  if (estimated_1rm_lbs <= maxTestLoad) return null
  // And must be a reasonable value (not more than 3x heaviest test load)
  if (estimated_1rm_lbs > maxTestLoad * 3) return null

  return {
    slope,
    v_intercept,
    estimated_1rm_lbs: Math.round(estimated_1rm_lbs * 10) / 10,
    mvt_used: mvt,
    r_squared: r_squared !== null ? Math.round(r_squared * 1000) / 1000 : null,
    n_points: sorted.length,
  }
}

/**
 * Quick single-point 1RM estimate using a two-point profile
 * where the second "point" is a theoretical zero-load intercept.
 *
 * This is less accurate than a real two-point test but gives a
 * reasonable estimate when only one data point is available.
 *
 * Uses the population-average velocity at ~0 load (~1.3 m/s for
 * lower body, ~1.1 m/s for upper body) as the anchor.
 */
export function singlePointEstimate(
  point: VbtDataPoint,
  mvt: number,
  category: string
): number | null {
  // Theoretical max velocity at ~0 load (unloaded bar speed)
  const v0 = category === 'strength_upper' ? 1.1 : 1.3

  const syntheticPoints: VbtDataPoint[] = [
    { load_lbs: 0, best_velocity_ms: v0 },
    point,
  ]

  const profile = fitLoadVelocityProfile(syntheticPoints, mvt)
  return profile ? profile.estimated_1rm_lbs : null
}

// ------------------------------------------------------------
// EPLEY 1RM ESTIMATION (fallback)
//
// Formula: 1RM = weight × (1 + reps / 30)
// Most accurate for 1–10 reps. Gets less reliable above 10.
// ------------------------------------------------------------

export function epley1RM(weight_lbs: number, reps: number): number {
  if (reps === 1) return weight_lbs
  if (reps > 15)  return weight_lbs * 1.5  // cap — formula breaks down at high reps
  return Math.round(weight_lbs * (1 + reps / 30))
}

// ------------------------------------------------------------
// WEIGHT SUGGESTION ENGINE
//
// Given a 1RM estimate and target training parameters,
// returns the suggested working weight.
// ------------------------------------------------------------

/**
 * Standard training zones as % of 1RM.
 * These are typical strength & conditioning guidelines.
 */
export const TRAINING_ZONES = {
  max_strength:   { min: 85, max: 100, reps: 3,  label: 'Max Strength'   },
  strength:       { min: 75, max: 85,  reps: 5,  label: 'Strength'       },
  hypertrophy:    { min: 65, max: 75,  reps: 8,  label: 'Hypertrophy'    },
  strength_endur: { min: 55, max: 65,  reps: 12, label: 'Strength-Endur' },
  endurance:      { min: 40, max: 55,  reps: 15, label: 'Endurance'      },
} as const

/**
 * Round a weight to the nearest practical increment.
 * - Standard plates: 2.5 lb increments below 100 lbs, 5 lb above
 * - For explosive lifts, round to nearest 5 lbs always
 */
export function roundToPlates(weight_lbs: number, explosive = false): number {
  if (explosive) return Math.round(weight_lbs / 5) * 5
  if (weight_lbs < 100) return Math.round(weight_lbs / 2.5) * 2.5
  return Math.round(weight_lbs / 5) * 5
}

/**
 * Given a 1RM and target reps, suggest a working weight.
 * Uses standard %1RM guidelines.
 */
export function suggestWeightFromOneRM(
  one_rm_lbs: number,
  target_reps: number,
  explosive = false
): { weight_lbs: number; zone_pct: number } {
  // Inverse Epley: what % of 1RM should you use for target reps?
  // % = 1 / (1 + reps/30)  — gives the load that yields that rep count
  const zone_pct = target_reps === 1
    ? 100
    : Math.round((1 / (1 + target_reps / 30)) * 100)

  const raw_weight = one_rm_lbs * (zone_pct / 100)
  const weight_lbs = roundToPlates(raw_weight, explosive)

  return { weight_lbs, zone_pct }
}

// ------------------------------------------------------------
// FULL SUGGESTION BUILDER
//
// Takes all available data for a player+exercise and returns
// the best possible weight suggestion with source metadata.
// ------------------------------------------------------------

export interface SuggestionInput {
  target_reps: number
  is_explosive?: boolean

  // VBT direct: player has a profile for this exact anchor
  vbt_1rm?: number | null

  // VBT indirect: player has a profile for a related anchor
  // provide the 1RM and the ratio to apply
  vbt_ratio_1rm?: number | null
  vbt_ratio?: number | null
  vbt_ratio_confidence?: 'high' | 'medium' | 'low'

  // Epley fallback: best logged set for this exercise
  epley_weight_lbs?: number | null
  epley_reps?: number | null
}

export function buildWeightSuggestion(input: SuggestionInput): WeightSuggestion {
  const { target_reps, is_explosive = false } = input

  // ---- Priority 1: Direct VBT 1RM ----
  if (input.vbt_1rm && input.vbt_1rm > 0) {
    const { weight_lbs, zone_pct } = suggestWeightFromOneRM(
      input.vbt_1rm, target_reps, is_explosive
    )
    return {
      suggested_weight_lbs: weight_lbs,
      suggested_reps: target_reps,
      training_zone_pct: zone_pct,
      one_rm_lbs: Math.round(input.vbt_1rm),
      source: 'vbt_profile',
      source_label: 'Based on your velocity profile',
      confidence: 'high',
    }
  }

  // ---- Priority 2: VBT via cross-exercise ratio ----
  if (input.vbt_ratio_1rm && input.vbt_ratio_1rm > 0 && input.vbt_ratio) {
    const derived_1rm = input.vbt_ratio_1rm * input.vbt_ratio
    const { weight_lbs, zone_pct } = suggestWeightFromOneRM(
      derived_1rm, target_reps, is_explosive
    )
    return {
      suggested_weight_lbs: weight_lbs,
      suggested_reps: target_reps,
      training_zone_pct: zone_pct,
      one_rm_lbs: Math.round(derived_1rm),
      source: 'vbt_ratio',
      source_label: 'Estimated from your velocity profile (related lift)',
      confidence: input.vbt_ratio_confidence ?? 'medium',
    }
  }

  // ---- Priority 3: Epley from rep history ----
  if (
    input.epley_weight_lbs && input.epley_weight_lbs > 0 &&
    input.epley_reps     && input.epley_reps     > 0
  ) {
    const one_rm = epley1RM(input.epley_weight_lbs, input.epley_reps)
    const { weight_lbs, zone_pct } = suggestWeightFromOneRM(
      one_rm, target_reps, is_explosive
    )
    return {
      suggested_weight_lbs: weight_lbs,
      suggested_reps: target_reps,
      training_zone_pct: zone_pct,
      one_rm_lbs: one_rm,
      source: 'epley',
      source_label: 'Estimated from your recent sets',
      confidence: 'medium',
    }
  }

  // ---- Priority 4: No data ----
  return {
    suggested_weight_lbs: null,
    suggested_reps: target_reps,
    training_zone_pct: 0,
    one_rm_lbs: null,
    source: 'none',
    source_label: 'No data yet — enter a starting weight',
    confidence: 'low',
  }
}

// ------------------------------------------------------------
// PROFILE QUALITY HELPERS
// ------------------------------------------------------------

/**
 * Returns a human-readable assessment of a profile's quality.
 */
export function profileQualityLabel(
  n_points: number,
  r_squared: number | null
): string {
  if (n_points < 2) return 'Needs more data'
  if (n_points === 2) return 'Good (2-point profile)'
  if (r_squared === null) return 'Good'
  if (r_squared >= 0.98) return 'Excellent'
  if (r_squared >= 0.92) return 'Good'
  if (r_squared >= 0.80) return 'Fair — consider retesting'
  return 'Poor fit — retest recommended'
}

/**
 * Returns true if a VBT profile should be flagged for refresh.
 * Criteria: older than 6 weeks, or r² below threshold.
 */
export function profileNeedsRefresh(
  calculated_at: string,
  r_squared: number | null,
  weeks_threshold = 6
): boolean {
  const age_ms   = Date.now() - new Date(calculated_at).getTime()
  const age_weeks = age_ms / (1000 * 60 * 60 * 24 * 7)
  if (age_weeks > weeks_threshold) return true
  if (r_squared !== null && r_squared < 0.80) return true
  return false
}
