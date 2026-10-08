// FILE: lib/features.ts
//
// Volleyball-only features, switched off by sport (see lib/brand.ts).
//
//   measurements  height/reach/verticals/sprint/agility, the Comparisons
//                 (net) page, the athleticism score, and the player
//                 Profile tab (which only shows measurements)
//   vbt           bar speed (velocity) fields and VBT testing
//   tvDisplay     the weight room TV / Roku display
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
} as const

// Address prefixes that belong to each feature
const FEATURE_PATHS: { on: boolean; pages: string[]; apis: string[] }[] = [
  {
    on: FEATURES.measurements,
    pages: ['/coach/comparisons', '/player/profile'],
    apis: ['/api/coach/comparisons', '/api/player/measurements'],
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
]

function startsWithAny(path: string, prefixes: string[]): boolean {
  return prefixes.some(p => path === p || path.startsWith(p + '/'))
}

/** True when this page address belongs to a switched-off feature */
export function isHiddenPage(path: string): boolean {
  return FEATURE_PATHS.some(f => !f.on && startsWithAny(path, f.pages))
}

/** True when this API address belongs to a switched-off feature */
export function isHiddenApi(path: string): boolean {
  return FEATURE_PATHS.some(f => !f.on && startsWithAny(path, f.apis))
}

/** Position choices on player forms */
export const POSITIONS: string[] = VOLLEYBALL
  ? ['Setter', 'Outside Hitter', 'Middle Blocker', 'Opposite', 'Libero', 'Defensive Specialist', 'Other']
  : ['Attack', 'Midfield', 'Defense', 'Goalie', 'Other']
