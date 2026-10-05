// FILE: lib/loads.ts
//
// Equipment and weight rules for the Vortex weight room.
//
// What players type:
//   Barbell        - the total on the bar (bar + plates), e.g. 135
//   1 dumbbell     - the number on the dumbbell, e.g. 30
//   2 dumbbells    - the number on ONE dumbbell, e.g. 30 (holding two 30s)
//   Other          - whatever the weight is (machine, med ball, etc.)
//
// set_logs.weight_lbs stores exactly what the player typed. Anything that
// counts pounds moved (leaderboards, session totals) multiplies by the
// number of dumbbells, so two 30s count as 60.
//
// Suggestions are always a weight that can actually be loaded:
//   Barbell   - 45 lb bar + pairs of 45/35/25/10/5/2.5 plates
//               → 45, 50, 55 … (5 lb steps, never below the empty bar)
//   Dumbbells - 5 to 50 in steps of 5 (per dumbbell)
//   Other / not set - nearest 5 lbs

export type Equipment = 'barbell' | 'dumbbell_1' | 'dumbbell_2' | 'other'

export const EQUIPMENT_OPTIONS: { value: Equipment; label: string; hint: string }[] = [
  { value: 'barbell',    label: 'Barbell',      hint: 'Player enters bar + plates total' },
  { value: 'dumbbell_1', label: '1 dumbbell',   hint: 'Player enters the number on the dumbbell' },
  { value: 'dumbbell_2', label: '2 dumbbells',  hint: 'Player enters the number on one dumbbell; counts double' },
  { value: 'other',      label: 'Other',        hint: 'Machine, med ball, sled, etc.' },
]

export const BAR_LBS = 45
export const PLATES_LBS = [45, 35, 25, 10, 5, 2.5]   // per side, used in pairs
export const DUMBBELLS_LBS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]

export function asEquipment(value: unknown): Equipment | null {
  return value === 'barbell' || value === 'dumbbell_1' || value === 'dumbbell_2' || value === 'other'
    ? value
    : null
}

/** How many implements the entered number is multiplied by for pounds moved. */
export function implementCount(equipment: Equipment | null | undefined): number {
  return equipment === 'dumbbell_2' ? 2 : 1
}

/** Pounds moved in one set: entered weight × dumbbells × reps. */
export function setPoundsMoved(
  weightEntered: number | null | undefined,
  reps: number | null | undefined,
  equipment: Equipment | null | undefined,
): number {
  return (weightEntered ?? 0) * implementCount(equipment) * (reps ?? 1)
}

/** Total load in one set (entered weight × dumbbells), for "heaviest" style stats. */
export function setLoad(weightEntered: number | null | undefined, equipment: Equipment | null | undefined): number {
  return (weightEntered ?? 0) * implementCount(equipment)
}

/** Closest value in a sorted list; on an exact tie, the lower one. */
function nearest(values: number[], target: number): number {
  let best = values[0]
  for (const v of values) {
    if (Math.abs(v - target) < Math.abs(best - target)) best = v
  }
  return best
}

/** Barbell totals that can be loaded: 45, then 5 lb steps (2.5 per side). */
function nearestBarbellLoad(target: number): number {
  if (target <= BAR_LBS) return BAR_LBS
  const steps = (target - BAR_LBS) / 5
  const down = Math.floor(steps)
  const up = Math.ceil(steps)
  // nearest step; exact tie goes to the lighter load
  const pick = steps - down <= up - steps ? down : up
  return BAR_LBS + pick * 5
}

/**
 * Round a suggested weight (in the units the player enters) to one that can
 * actually be loaded with this equipment. Returns 0 for 0/no suggestion.
 */
export function roundToLoadable(weight: number, equipment: Equipment | null | undefined): number {
  if (!weight || weight <= 0) return 0
  switch (equipment) {
    case 'barbell':
      return nearestBarbellLoad(weight)
    case 'dumbbell_1':
    case 'dumbbell_2':
      return nearest(DUMBBELLS_LBS, weight)
    default: {
      const steps = weight / 5
      const down = Math.floor(steps)
      const pick = steps - down <= 0.5 ? down : down + 1
      return Math.max(5, pick * 5)
    }
  }
}

/** Plates to put on EACH side of the bar for a barbell total, heaviest first. */
export function platesPerSide(total: number): number[] {
  let perSide = (total - BAR_LBS) / 2
  const plates: number[] = []
  for (const p of PLATES_LBS) {
    while (perSide >= p - 1e-9) {
      plates.push(p)
      perSide -= p
    }
  }
  return plates
}

/** Short label for a weight in entered units: "135 lbs", "30# DB", "30# DBs". */
export function loadLabel(weight: number, equipment: Equipment | null | undefined): string {
  if (equipment === 'dumbbell_2') return `${weight}# DBs`
  if (equipment === 'dumbbell_1') return `${weight}# DB`
  return `${weight} lbs`
}

/** Label for the weight input box. */
export function weightInputLabel(equipment: Equipment | null | undefined): string {
  if (equipment === 'dumbbell_2') return 'Weight per DB'
  if (equipment === 'dumbbell_1') return 'DB weight'
  return 'Weight (lbs)'
}

/** "Empty bar" or "45 + 25 each side" for a barbell total; '' otherwise. */
export function plateText(total: number, equipment: Equipment | null | undefined): string {
  if (equipment !== 'barbell' || !total) return ''
  const plates = platesPerSide(total)
  if (!plates.length) return 'Empty bar'
  return `${plates.join(' + ')} each side`
}
