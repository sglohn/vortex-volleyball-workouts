// FILE: lib/vbt.ts
// ============================================================
// VELOCITY-BASED TRAINING — CALCULATION ENGINE
//
// VBT is exercise-specific: a test on Trap Bar High Pulls only ever
// informs Trap Bar High Pulls. Nothing carries over to other lifts.
//
// Provides:
//   - Load-velocity line fitting from a test (2+ loads)
//   - Optional 1RM estimate (only when a minimum velocity is entered)
//   - Weight for a target bar speed, read off the athlete's line
//   - Next-set adjustment from the speed actually measured today
// ============================================================

// ------------------------------------------------------------
// TYPES
// ------------------------------------------------------------

export interface VbtDataPoint {
  load_lbs: number
  best_velocity_ms: number
}

export interface LoadVelocityLine {
  /** m/s change per lb (negative: heavier = slower) */
  slope: number
  /** predicted velocity at zero load */
  v_intercept: number
  /** R² fit quality — only with 3+ points */
  r_squared: number | null
  n_points: number
  load_light_lbs: number
  load_heavy_lbs: number
  velocity_at_light: number
  velocity_at_heavy: number
}

/** The stored profile fields the engine needs */
export interface StoredProfile {
  slope: number | null
  v_intercept: number | null
  r_squared: number | null
  calculated_at: string
  load_light_lbs: number | null
  load_heavy_lbs: number | null
  velocity_at_light: number | null
  velocity_at_heavy: number | null
  estimated_1rm_lbs: number | null
}

// ------------------------------------------------------------
// DATA SUFFICIENCY RULES
// A profile is only saved, and only used, when it meets all of these.
// ------------------------------------------------------------
export const VBT_RULES = {
  minPoints: 2,               // never fit a line through a single load
  minVelocitySpread: 0.25,    // m/s between lightest and heaviest load
  minRSquared: 0.90,          // 3+ point tests must fit a straight line this well
  maxProfileAgeWeeks: 6,      // older profiles are not used
} as const

export const ADJUST_RULES = {
  maxChangePct: 0.10,         // next-set change limited to ±10%
  aimAboveMinOnly: 0.05,      // with only a minimum speed, aim this far above it
} as const

// ------------------------------------------------------------
// LINE FITTING
// velocity = v_intercept + slope × load
// ------------------------------------------------------------
export function fitLoadVelocityLine(points: VbtDataPoint[]): LoadVelocityLine | null {
  if (points.length < VBT_RULES.minPoints) return null

  const sorted = [...points].sort((a, b) => a.load_lbs - b.load_lbs)
  const light = sorted[0]
  const heavy = sorted[sorted.length - 1]
  if (heavy.load_lbs === light.load_lbs) return null

  let slope: number
  let v_intercept: number
  let r_squared: number | null = null

  if (sorted.length === 2) {
    slope = (heavy.best_velocity_ms - light.best_velocity_ms) / (heavy.load_lbs - light.load_lbs)
    v_intercept = light.best_velocity_ms - slope * light.load_lbs
  } else {
    const n = sorted.length
    const sumX  = sorted.reduce((s, p) => s + p.load_lbs, 0)
    const sumY  = sorted.reduce((s, p) => s + p.best_velocity_ms, 0)
    const sumXY = sorted.reduce((s, p) => s + p.load_lbs * p.best_velocity_ms, 0)
    const sumX2 = sorted.reduce((s, p) => s + p.load_lbs * p.load_lbs, 0)
    const denom = n * sumX2 - sumX * sumX
    if (denom === 0) return null
    slope       = (n * sumXY - sumX * sumY) / denom
    v_intercept = (sumY - slope * sumX) / n

    const meanY = sumY / n
    const ssTot = sorted.reduce((s, p) => s + Math.pow(p.best_velocity_ms - meanY, 2), 0)
    const ssRes = sorted.reduce((s, p) => s + Math.pow(p.best_velocity_ms - (v_intercept + slope * p.load_lbs), 2), 0)
    r_squared = ssTot > 0 ? 1 - ssRes / ssTot : null
  }

  // Heavier must be slower
  if (slope >= 0) return null

  // Loads must be far enough apart in speed to define a real line
  const speeds = sorted.map(p => p.best_velocity_ms)
  if (Math.max(...speeds) - Math.min(...speeds) < VBT_RULES.minVelocitySpread) return null

  // 3+ points must actually fall on a line
  if (r_squared !== null && r_squared < VBT_RULES.minRSquared) return null

  return {
    slope,
    v_intercept,
    r_squared: r_squared !== null ? Math.round(r_squared * 1000) / 1000 : null,
    n_points: sorted.length,
    load_light_lbs: light.load_lbs,
    load_heavy_lbs: heavy.load_lbs,
    velocity_at_light: light.best_velocity_ms,
    velocity_at_heavy: heavy.best_velocity_ms,
  }
}

/**
 * 1RM from a line, using the minimum velocity (MVT) the coach entered.
 * Returns null without an MVT, or when the result isn't believable
 * (not above the heaviest tested load, or more than 2× it).
 */
export function oneRepMaxFromLine(line: LoadVelocityLine, mvt: number | null | undefined): number | null {
  if (!mvt || mvt <= 0) return null
  const est = (mvt - line.v_intercept) / line.slope
  if (!isFinite(est)) return null
  if (est <= line.load_heavy_lbs) return null
  if (est > line.load_heavy_lbs * 2) return null
  return Math.round(est * 10) / 10
}

// ------------------------------------------------------------
// PROFILE TRUST
// ------------------------------------------------------------
export function profileNeedsRefresh(
  calculated_at: string,
  r_squared: number | null,
  weeks_threshold: number = VBT_RULES.maxProfileAgeWeeks
): boolean {
  const age_weeks = (Date.now() - new Date(calculated_at).getTime()) / (1000 * 60 * 60 * 24 * 7)
  if (age_weeks > weeks_threshold) return true
  if (r_squared !== null && r_squared < VBT_RULES.minRSquared) return true
  return false
}

/** True when a stored profile can be used for suggestions */
export function isProfileTrusted(p: StoredProfile | null | undefined): boolean {
  if (!p) return false
  if (p.slope === null || p.v_intercept === null || p.slope >= 0) return false
  if (profileNeedsRefresh(p.calculated_at, p.r_squared)) return false
  if (p.velocity_at_light === null || p.velocity_at_heavy === null) return false
  if (p.velocity_at_light - p.velocity_at_heavy < VBT_RULES.minVelocitySpread) return false
  return true
}

export function profileQualityLabel(n_points: number, r_squared: number | null): string {
  if (n_points < VBT_RULES.minPoints) return 'Needs more data'
  if (r_squared === null) return 'Good (2-point profile)'
  if (r_squared >= 0.98) return 'Excellent'
  if (r_squared >= 0.92) return 'Good'
  if (r_squared >= VBT_RULES.minRSquared) return 'Fair'
  return 'Poor fit — not used, retest needed'
}

// ------------------------------------------------------------
// SPEED TARGETS
// ------------------------------------------------------------

/** The speed to aim for: middle of the range, or a bit inside a lone limit */
export function aimVelocity(min: number | null, max: number | null): number | null {
  if (min && max && max > min) return (min + max) / 2
  if (min) return min + ADJUST_RULES.aimAboveMinOnly
  if (max) return max - ADJUST_RULES.aimAboveMinOnly
  return null
}

/** Is a measured speed inside the target range? */
export function speedStatus(v: number, min: number | null, max: number | null): 'slow' | 'fast' | 'in_range' {
  if (min && v < min) return 'slow'
  if (max && v > max) return 'fast'
  return 'in_range'
}

/** Weight the athlete should move at a given speed, from their line */
export function loadForVelocity(p: StoredProfile, v: number): number | null {
  if (p.slope === null || p.v_intercept === null || p.slope >= 0) return null
  const load = (v - p.v_intercept) / p.slope
  if (!isFinite(load) || load <= 0) return null
  return load
}

/** Round to the nearest 5 lbs (2.5 lb plates per side) */
export function roundToPlates(weight_lbs: number): number {
  return Math.max(5, Math.round(weight_lbs / 5) * 5)
}

export interface NextSetAdjustment {
  status: 'slow' | 'fast' | 'in_range'
  lastWeight: number
  lastVelocity: number
  /** null when there's no trusted profile to size the change */
  nextWeight: number | null
  message: string
}

/**
 * Compare today's last set to the target and size the next set.
 * The size of the change comes from the athlete's own line (its slope),
 * limited to ±10% and rounded to plates. Without a trusted profile,
 * only the direction is given — no number is invented.
 */
export function nextSetAdjustment(opts: {
  lastWeight: number
  lastVelocity: number
  min: number | null
  max: number | null
  profile: StoredProfile | null
}): NextSetAdjustment {
  const { lastWeight, lastVelocity, min, max, profile } = opts
  const status = speedStatus(lastVelocity, min, max)
  const speed = `${lastVelocity.toFixed(2)} m/s`

  if (status === 'in_range') {
    return { status, lastWeight, lastVelocity, nextWeight: lastWeight, message: `Last set ${speed}, in range. Stay at ${lastWeight} lbs.` }
  }

  const aim = aimVelocity(min, max)
  const trusted = isProfileTrusted(profile)

  if (!trusted || aim === null || !profile?.slope) {
    return {
      status, lastWeight, lastVelocity, nextWeight: null,
      message: status === 'slow'
        ? `Last set ${speed}, below target. Go lighter.`
        : `Last set ${speed}, above target. Go heavier.`,
    }
  }

  // Move from today's actual set along the athlete's own slope
  let next = lastWeight + (aim - lastVelocity) / profile.slope
  const maxStep = lastWeight * ADJUST_RULES.maxChangePct
  next = Math.min(lastWeight + maxStep, Math.max(lastWeight - maxStep, next))
  let rounded = roundToPlates(next)

  // Rounding must still move in the right direction
  if (status === 'slow' && rounded >= lastWeight) rounded = roundToPlates(lastWeight - 5)
  if (status === 'fast' && rounded <= lastWeight) rounded = roundToPlates(lastWeight + 5)

  return {
    status, lastWeight, lastVelocity, nextWeight: rounded,
    message: status === 'slow'
      ? `Last set ${speed}, below target. Drop to ${rounded} lbs.`
      : `Last set ${speed}, above target. Go up to ${rounded} lbs.`,
  }
}
