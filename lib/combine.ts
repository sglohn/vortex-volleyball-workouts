// FILE: lib/combine.ts
//
// Combine Day: the Volleyball Performance Index tests players enter
// themselves (components/CombineDay.tsx, app/api/player/combine).
//
// A workout template marked "Combine Day" (Coach → Templates) shows these
// tests on the player's phone instead of lifting blocks. Players pick any
// test in any order, enter each try, and the best try for each test is
// saved to today's measurements row (the same numbers the coach sees on the
// player page). Standing vertical and max vertical are still worked out at
// display time (touch minus standing reach), as everywhere else.
//
// Volleyball only (FEATURES.measurements). Wingspan is a measurement but
// not part of the score (lib/athleticism.ts), so it isn't a combine test.
//
// Shared by the browser and the server, so no server-only imports here.

export type CombineMetricKey =
  | 'height_in' | 'standing_reach_in' | 'standing_vertical_in' | 'approach_vertical_in'
  | 'acceleration_sec' | 'pro_agility_sec' | 'swing_velocity_mph'

export type CombineUnit = 'ft-in' | 'sec' | 'mph'

export interface CombineMetric {
  key: CombineMetricKey
  /** Big name on the card */
  label: string
  /** One line under the name on the test list */
  short: string
  unit: CombineUnit
  /** How to do the test, shown above the entry box */
  howTo: string
  /** Tries that count; with 1, saving again replaces the number */
  maxAttempts: number
  /** Which try counts as best */
  better: 'higher' | 'lower'
  /** Normal range: outside it the player is asked to double-check */
  usual: [number, number]
  /** Hard limits: outside these the number can't be saved */
  limits: [number, number]
  /** A change from last time bigger than this asks for a double-check */
  bigChange: number
  /** Entry step: inches go by halves, seconds by hundredths */
  step: number
}

export const COMBINE_METRICS: CombineMetric[] = [
  {
    key: 'height_in', label: 'Height', short: 'Shoes off', unit: 'ft-in',
    howTo: 'Shoes off. Heels, back and head against the wall, looking straight ahead. Have a partner read it.',
    maxAttempts: 1, better: 'higher', usual: [54, 84], limits: [36, 96], bigChange: 3, step: 0.5,
  },
  {
    key: 'standing_reach_in', label: 'Standing Reach', short: 'Flat-footed, one hand', unit: 'ft-in',
    howTo: 'Stand side-on to the wall or Vertec, heels flat. Reach one hand straight up as high as you can without lifting your heels.',
    maxAttempts: 1, better: 'higher', usual: [72, 115], limits: [48, 130], bigChange: 4, step: 0.5,
  },
  {
    key: 'standing_vertical_in', label: 'Block Touch', short: 'Standing jump, two hands', unit: 'ft-in',
    howTo: 'No steps. From a standing start, jump with both hands up like a block. Enter the height you touched (not your vertical).',
    maxAttempts: 3, better: 'higher', usual: [80, 135], limits: [60, 150], bigChange: 8, step: 0.5,
  },
  {
    key: 'approach_vertical_in', label: 'Approach Touch', short: 'Full approach, hitting hand', unit: 'ft-in',
    howTo: 'Use your full approach and reach with your hitting hand. Enter the height you touched (not your vertical).',
    maxAttempts: 3, better: 'higher', usual: [84, 140], limits: [60, 155], bigChange: 8, step: 0.5,
  },
  {
    key: 'acceleration_sec', label: 'Acceleration', short: '5 yard sprint', unit: 'sec',
    howTo: 'Start in your ready stance and sprint 5 yards. Enter the time from the timer, like 1.12.',
    maxAttempts: 3, better: 'lower', usual: [0.8, 2.2], limits: [0.4, 6], bigChange: 0.4, step: 0.01,
  },
  {
    key: 'pro_agility_sec', label: 'Pro-Agility', short: '5-10-5 shuttle', unit: 'sec',
    howTo: 'Start in the middle. 5 yards one way, 10 yards back, 5 yards to the middle, touching each line. Enter the time, like 5.38.',
    maxAttempts: 3, better: 'lower', usual: [4.2, 7], limits: [3, 12], bigChange: 1, step: 0.01,
  },
  {
    key: 'swing_velocity_mph', label: 'Swing Velocity', short: 'Radar, hitting arm', unit: 'mph',
    howTo: 'Swing at the ball with your hitting arm. Enter the radar reading in mph.',
    maxAttempts: 3, better: 'higher', usual: [20, 75], limits: [5, 110], bigChange: 15, step: 0.1,
  },
]

export const COMBINE_KEYS: CombineMetricKey[] = COMBINE_METRICS.map(m => m.key)

export function combineMetric(key: string | null | undefined): CombineMetric | null {
  return COMBINE_METRICS.find(m => m.key === key) ?? null
}

/** The tests a combine template includes, in the standard order (null/empty = all) */
export function combineMetricsFor(selected: string[] | null | undefined): CombineMetric[] {
  if (!selected || selected.length === 0) return COMBINE_METRICS
  const set = new Set(selected)
  const list = COMBINE_METRICS.filter(m => set.has(m.key))
  return list.length > 0 ? list : COMBINE_METRICS
}

/** Cleans a template's picked tests for saving: known keys only; all of them → null */
export function cleanCombineMetrics(v: unknown): CombineMetricKey[] | null {
  if (!Array.isArray(v)) return null
  const set = new Set(v.map(String))
  const list = COMBINE_KEYS.filter(k => set.has(k))
  return list.length === 0 || list.length === COMBINE_KEYS.length ? null : list
}

/** Best try: highest touch / reach / speed, lowest time */
export function bestValue(metric: CombineMetric, values: number[]): number | null {
  if (values.length === 0) return null
  return metric.better === 'lower' ? Math.min(...values) : Math.max(...values)
}

/** Rounds to the test's step (halves of an inch, hundredths of a second...) */
export function roundToStep(metric: CombineMetric, value: number): number {
  const r = Math.round(value / metric.step) * metric.step
  return Math.round(r * 100) / 100
}

/** 112.5 → 9′ 4½″ */
export function feetInchesText(inches: number): string {
  const rounded = Math.round(inches * 2) / 2
  let ft = Math.floor(rounded / 12)
  let rest = Math.round((rounded - ft * 12) * 2) / 2
  if (rest >= 12) { ft += 1; rest -= 12 }
  const whole = Math.floor(rest)
  const half = rest - whole >= 0.5 ? '½' : ''
  return `${ft}′ ${whole}${half}″`
}

/** How a value reads on screen: 9′ 4½″, 1.12 sec, 48.5 mph */
export function combineText(metric: CombineMetric, value: number | null | undefined): string {
  if (value == null) return '—'
  if (metric.unit === 'ft-in') return feetInchesText(value)
  if (metric.unit === 'sec') return `${value.toFixed(2)} sec`
  return `${Number.isInteger(value) ? value : value.toFixed(1)} mph`
}

/** Vertical in inches from a touch height and standing reach (null if it doesn't make sense) */
export function verticalFrom(touch: number | null | undefined, reach: number | null | undefined): number | null {
  if (touch == null || reach == null) return null
  const v = Math.round((touch - reach) * 10) / 10
  return v > 0 ? v : null
}

export interface CombineCheck {
  /** Can't be saved (outside the hard limits, or a touch at/below reach) */
  error: string | null
  /** Can be saved after a second tap */
  warning: string | null
}

/**
 * Checks a number before it's saved. `context` has the player's other
 * numbers today (or last time) and her previous best for this test.
 */
export function checkCombineValue(
  metric: CombineMetric,
  value: number,
  context: { reach?: number | null; blockTouch?: number | null; previous?: number | null } = {},
): CombineCheck {
  if (!Number.isFinite(value) || value <= 0) return { error: 'Enter a number.', warning: null }
  const [lo, hi] = metric.limits
  if (value < lo || value > hi) {
    return { error: `That can't be right for ${metric.label}. Check the number and try again.`, warning: null }
  }
  const isTouch = metric.key === 'standing_vertical_in' || metric.key === 'approach_vertical_in'
  if (isTouch && context.reach != null && value <= context.reach) {
    return {
      error: `Your touch has to be higher than your standing reach (${feetInchesText(context.reach)}). Enter the height you touched, not your vertical.`,
      warning: null,
    }
  }
  const [ulo, uhi] = metric.usual
  if (value < ulo || value > uhi) {
    return { error: null, warning: `${combineText(metric, value)} is unusual for ${metric.label}. Check it with your partner.` }
  }
  if (context.previous != null && Math.abs(value - context.previous) > metric.bigChange) {
    return { error: null, warning: `That's a big change from last time (${combineText(metric, context.previous)}). Check it with your partner.` }
  }
  if (metric.key === 'approach_vertical_in' && context.blockTouch != null && value < context.blockTouch) {
    return { error: null, warning: `That's lower than your block touch today (${feetInchesText(context.blockTouch)}). Is it right?` }
  }
  return { error: null, warning: null }
}
