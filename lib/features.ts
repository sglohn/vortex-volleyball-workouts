// FILE: lib/features.ts
//
// Volleyball-only features, switched off by sport (see lib/brand.ts).
//
//   measurements  height/reach/verticals/sprint/agility, the Comparisons
//                 (net) page, the athleticism score, and the player
//                 Profile tab (which only shows measurements), and Combine
//                 Day workouts (lib/combine.ts)
//   vbt           bar speed (velocity) fields and VBT testing
//   tvDisplay     the weight room TV / Roku display
//
// How workouts are scheduled (one or the other):
//   datedSchedule volleyball: a workout on set dates per team (Schedule page,
//                 team_schedule)
//   weekPlan      lacrosse: Day 1, Day 2... each week, done in order whenever
//                 players can, one per day (Week Plan page, lib/weekPlan.ts)
//
// Pages and API routes for switched-off features are blocked in
// middleware.ts, so they can't be reached by typing the address either.

import { BRAND } from '@/lib/brand'

// Same test as lib/brand.ts, written out so the build drops the unused
// sport's lists entirely.
const VOLLEYBALL = process.env.NEXT_PUBLIC_BRAND !== 'lacrosse'
if (VOLLEYBALL !== (BRAND.sport === 'volleyball')) throw new Error('lib/features.ts and lib/brand.ts disagree on sport')

export const FEATURES = {
  measurements: VOLLEYBALL,
  vbt: VOLLEYBALL,
  tvDisplay: VOLLEYBALL,
  datedSchedule: VOLLEYBALL,
  weekPlan: !VOLLEYBALL,
} as const

// Address prefixes that belong to each feature
const FEATURE_PATHS: { on: boolean; pages: string[]; apis: string[] }[] = [
  {
    on: FEATURES.measurements,
    pages: ['/coach/comparisons', '/player/profile'],
    apis: ['/api/coach/comparisons', '/api/player/measurements', '/api/player/combine'],
  },
  {
    on: FEATURES.vbt,
    pages: ['/coach/vbt'],
    apis: ['/api/coach/vbt'],
  },
  {
    on: FEATURES.tvDisplay,
    pages: ['/coach/display'],
    apis: ['/api/display-snapshot', '/api/display-teams'],
  },
  {
    on: FEATURES.datedSchedule,
    pages: ['/coach/schedule'],
    apis: ['/api/coach/schedule'],
  },
  {
    on: FEATURES.weekPlan,
    pages: ['/coach/week-plan'],
    apis: ['/api/coach/week-plan', '/api/coach/unlock-requests', '/api/player/day-unlock'],
  },
]

function startsWithAny(path: string, prefixes: string[]): boolean {
  return prefixes.some(p => path === p || path.startsWith(p + '/'))
}

/** True when this page address belongs to a switched-off feature */
export function isHiddenPage(path: string): boolean {
  return FEATURE_PATHS.some(f => !f.on && startsWithAny(path, f.pages))
}

/** Where a switched-off page sends people instead */
export function hiddenPageHome(path: string): string {
  if (path.startsWith('/player')) return '/player/workout'
  // Old Schedule links (Teams and Dashboard pages) go to the Week Plan
  if (FEATURES.weekPlan && startsWithAny(path, ['/coach/schedule'])) return '/coach/week-plan'
  return '/coach/dashboard'
}

/** True when this API address belongs to a switched-off feature */
export function isHiddenApi(path: string): boolean {
  return FEATURE_PATHS.some(f => !f.on && startsWithAny(path, f.apis))
}

/** Position choices on player forms */
export const POSITIONS: string[] = VOLLEYBALL
  ? ['Setter', 'Outside Hitter', 'Middle Blocker', 'Opposite', 'Libero', 'Defensive Specialist', 'Other']
  : ['Attack', 'Midfield', 'Defense', 'Goalie', 'Other']
