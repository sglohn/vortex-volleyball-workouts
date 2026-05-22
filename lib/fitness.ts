// ============================================================
// 1-REP MAX ESTIMATION & WEIGHT RECOMMENDATIONS
// ============================================================

/**
 * Epley formula — the most widely-used 1RM estimator.
 * Works best for sets of 1–10 reps.
 * Returns estimated 1RM in lbs.
 */
export function estimateOneRepMax(weightLbs: number, reps: number): number {
  if (reps === 1) return weightLbs
  if (reps <= 0 || weightLbs <= 0) return 0
  return Math.round(weightLbs * (1 + reps / 30))
}

/**
 * Given a 1RM, return suggested working weights for common % targets.
 * Rounds to nearest 5 lbs (realistic barbell increments).
 */
export function getWorkingWeights(oneRepMax: number): Record<string, number> {
  const round5 = (n: number) => Math.round(n / 5) * 5
  return {
    '50%': round5(oneRepMax * 0.5),
    '60%': round5(oneRepMax * 0.6),
    '70%': round5(oneRepMax * 0.7),
    '75%': round5(oneRepMax * 0.75),
    '80%': round5(oneRepMax * 0.8),
    '85%': round5(oneRepMax * 0.85),
    '90%': round5(oneRepMax * 0.9),
  }
}

/**
 * Given a target rep count, suggest an appropriate % of 1RM
 * and return the recommended weight.
 *
 * General guideline:
 *  1–3 reps  → 90–95%  (strength/neural)
 *  4–6 reps  → 80–85%  (power/strength)
 *  7–10 reps → 70–75%  (hypertrophy)
 *  11–15 reps → 60–65% (endurance/volume)
 *  16+ reps  → 50–55%  (conditioning)
 */
export function recommendWeight(oneRepMax: number, targetReps: number): {
  weight: number
  percent: number
  label: string
} {
  let percent: number
  let label: string

  if (targetReps <= 3) {
    percent = 0.92; label = 'Heavy — strength focus'
  } else if (targetReps <= 6) {
    percent = 0.82; label = 'Power zone'
  } else if (targetReps <= 10) {
    percent = 0.72; label = 'Hypertrophy zone'
  } else if (targetReps <= 15) {
    percent = 0.62; label = 'Volume / endurance'
  } else {
    percent = 0.52; label = 'Conditioning'
  }

  const weight = Math.round((oneRepMax * percent) / 5) * 5
  return { weight, percent: Math.round(percent * 100), label }
}

/**
 * Find the best estimated 1RM from a list of set logs for one exercise.
 * Returns 0 if no data.
 */
export function getBestOneRepMax(
  sets: Array<{ weight_lbs: number | null; reps_completed: number | null }>
): number {
  if (!sets.length) return 0
  return sets.reduce((best, s) => {
    if (!s.weight_lbs || !s.reps_completed) return best
    const est = estimateOneRepMax(s.weight_lbs, s.reps_completed)
    return est > best ? est : best
  }, 0)
}

/**
 * Determine trend direction from a series of 1RM estimates over time.
 */
export function getTrend(values: number[]): 'up' | 'down' | 'flat' {
  if (values.length < 2) return 'flat'
  const first = values[0]
  const last = values[values.length - 1]
  const diff = last - first
  if (diff > first * 0.03) return 'up'    // >3% increase
  if (diff < -first * 0.03) return 'down' // >3% decrease
  return 'flat'
}

/**
 * Convert inches to a readable feet + inches string.
 * e.g. 73.5 → 6'1.5"
 */
export function inchesToFeetInches(inches: number): string {
  const ft = Math.floor(inches / 12)
  const remaining = Math.round((inches % 12) * 10) / 10
  return `${ft}'${remaining}"`
}
