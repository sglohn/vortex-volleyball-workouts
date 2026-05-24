import { PhaseType, PHASE_CONFIG } from './types'

// ============================================================
// 1-REP MAX ESTIMATION
// ============================================================

/**
 * Epley formula — estimates 1RM from a working set.
 * Most accurate for 1–10 reps.
 */
export function estimateOneRepMax(weightLbs: number, reps: number): number {
  if (reps === 1) return weightLbs
  if (reps <= 0 || weightLbs <= 0) return 0
  return Math.round(weightLbs * (1 + reps / 30))
}

/**
 * Find the best estimated 1RM from a list of set logs.
 */
export function getBestOneRepMax(
  sets: Array<{ weight_lbs?: number | null; reps_completed?: number | null }>
): number {
  if (!sets.length) return 0
  return sets.reduce((best, s) => {
    if (!s.weight_lbs || !s.reps_completed) return best
    const est = estimateOneRepMax(s.weight_lbs, s.reps_completed)
    return est > best ? est : best
  }, 0)
}

// ============================================================
// PHASE-AWARE WEIGHT RECOMMENDATIONS
// ============================================================

/**
 * Given a player's best 1RM and their current training phase,
 * return a recommended working weight for a given rep target.
 *
 * Weight is based purely on their own performance history — never body weight.
 * The phase adjusts the intensity target up or down.
 */
export function recommendWeightForPhase(
  oneRepMax: number,
  targetReps: number | string,
  phase: PhaseType = 'general'
): {
  weight: number
  percent: number
  label: string
  phaseNote: string
} {
  if (!oneRepMax || oneRepMax <= 0) {
    return { weight: 0, percent: 0, label: 'No history yet', phaseNote: 'Log your first set to get recommendations.' }
  }

  // Base percent from rep range (standard strength training zones)
  const repsNum = typeof targetReps === 'string' ? parseInt(targetReps) || 8 : targetReps
  let basePercent: number

  if (repsNum <= 3)       basePercent = 0.92
  else if (repsNum <= 5)  basePercent = 0.87
  else if (repsNum <= 6)  basePercent = 0.82
  else if (repsNum <= 8)  basePercent = 0.77
  else if (repsNum <= 10) basePercent = 0.72
  else if (repsNum <= 12) basePercent = 0.67
  else if (repsNum <= 15) basePercent = 0.62
  else                    basePercent = 0.55

  // Phase multiplier adjusts the base
  const phaseConfig = PHASE_CONFIG[phase]
  const adjustedPercent = basePercent * phaseConfig.weightMultiplier

  // Round to nearest 5 lbs — realistic for barbells/dumbbells
  const weight = Math.max(5, Math.round((oneRepMax * adjustedPercent) / 5) * 5)
  const finalPercent = Math.round(adjustedPercent * 100)

  return {
    weight,
    percent: finalPercent,
    label: phaseConfig.intensityNote,
    phaseNote: phaseConfig.playerMessage,
  }
}

/**
 * Suggest whether to go up, hold, or back off based on recent trend.
 */
export function getWeightDirection(
  recentSets: Array<{ weight_lbs?: number | null; reps_completed?: number | null; completed?: boolean }>,
  phase: PhaseType
): 'increase' | 'hold' | 'decrease' {
  if (phase === 'recovery') return 'decrease'
  if (phase === 'pre_tournament') return 'decrease'

  const completed = recentSets.filter(s => s.completed && s.weight_lbs && s.reps_completed)
  if (completed.length < 2) return 'hold'

  // If they completed all sets cleanly last time, suggest increase in build
  if (phase === 'build') return 'increase'
  return 'hold'
}

// ============================================================
// TREND ANALYSIS
// ============================================================

export function getTrend(values: number[]): 'up' | 'down' | 'flat' {
  if (values.length < 2) return 'flat'
  const first = values[0]
  const last = values[values.length - 1]
  const diff = last - first
  if (diff > first * 0.03) return 'up'
  if (diff < -(first * 0.03)) return 'down'
  return 'flat'
}

// ============================================================
// DISPLAY UTILITIES
// ============================================================

export function inchesToFeetInches(inches: number): string {
  const ft = Math.floor(inches / 12)
  const remaining = Math.round((inches % 12) * 10) / 10
  return `${ft}'${remaining}"`
}

export function formatWeight(lbs: number): string {
  return `${lbs} lbs`
}

export function formatVelocity(ms: number): string {
  return `${ms.toFixed(2)} m/s`
}

/**
 * Pain level to color for health UI
 */
export function painLevelColor(level: number): string {
  if (level <= 3) return '#4ade80'   // green — mild
  if (level <= 6) return '#facc15'   // yellow — moderate
  return '#f87171'                    // red — severe
}

/**
 * Pain level to label
 */
export function painLevelLabel(level: number): string {
  if (level <= 2) return 'Mild'
  if (level <= 4) return 'Uncomfortable'
  if (level <= 6) return 'Moderate'
  if (level <= 8) return 'Significant'
  return 'Severe'
}
