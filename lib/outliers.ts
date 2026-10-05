// FILE: lib/outliers.ts
//
// Spots logged sets that are probably typos, so a coach can check them on
// the Workout Logs page. Nothing is changed automatically — these are
// just notes.
//
// Weights are compared in the units players enter (lib/loads.ts): barbell
// total, the number on one dumbbell, or landmine plates.

import { DUMBBELLS_LBS, type Equipment } from '@/lib/loads'

export type FlagSet = {
  id: string
  weight: number | null
  reps: number | null
  velocity: number | null
  completed: boolean
}

export type FlagContext = {
  equipment: Equipment | null
  logsWeight: boolean
  /** this player's completed weights for this exercise in earlier sessions (recent first) */
  history: number[]
  /** this player's heaviest earlier weight for this exercise, 0 if none */
  previousBest: number
}

export const OUTLIER_RULES = {
  minHistory: 3,          // earlier sets needed before comparing to "usual"
  heavierRatio: 1.5,      // ≥ 1.5× usual …
  lighterRatio: 0.5,      // ≤ 0.5× usual …
  minGapLbs: 15,          // … and at least this many lbs different
  overBestRatio: 1.25,    // > 25% over previous best
  sameSessionHigh: 1.8,   // vs. their other sets today (when no history)
  sameSessionLow: 0.45,
  maxReps: 30,
  minVelocity: 0.1,
  maxVelocity: 2.5,
} as const

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b)
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** Notes for each set of ONE exercise in ONE session, keyed by set id. */
export function flagExerciseSets(sets: FlagSet[], ctx: FlagContext): Record<string, string[]> {
  const R = OUTLIER_RULES
  const out: Record<string, string[]> = {}
  const usual = ctx.history.length >= R.minHistory ? median(ctx.history) : null

  for (const set of sets) {
    const notes: string[] = []
    if (!set.completed) { out[set.id] = notes; continue }
    const w = set.weight

    // ── Weight that can't be right for the equipment ──
    if (ctx.logsWeight && (w === null || w === undefined)) {
      if (ctx.equipment === 'barbell' || ctx.equipment === 'dumbbell_1' || ctx.equipment === 'dumbbell_2') {
        notes.push('No weight entered')
      }
    }
    if (w !== null && w !== undefined && w > 0) {
      if (ctx.equipment === 'barbell') {
        if (w < 45) notes.push('Under 45 lbs, but the empty bar is 45. Plates only?')
        else if ((w - 45) % 5 !== 0) notes.push(`${fmt(w)} can't be loaded with your plates`)
      }
      if (ctx.equipment === 'dumbbell_1' || ctx.equipment === 'dumbbell_2') {
        const max = DUMBBELLS_LBS[DUMBBELLS_LBS.length - 1]
        if (w > max) {
          if (ctx.equipment === 'dumbbell_2' && DUMBBELLS_LBS.includes(w / 2)) {
            notes.push(`No ${fmt(w)}# dumbbell. Total of both? Each DB would be ${fmt(w / 2)}`)
          } else {
            notes.push(`No ${fmt(w)}# dumbbell (heaviest is ${max})`)
          }
        } else if (!DUMBBELLS_LBS.includes(w)) {
          notes.push(`${fmt(w)} isn't a dumbbell size`)
        }
      }
      if (ctx.equipment === 'landmine' && (w * 2) % 5 !== 0) {
        notes.push(`${fmt(w)} can't be loaded with your plates`)
      }
    }

    // ── Compared with this player's earlier sessions ──
    if (w !== null && w !== undefined && w > 0 && usual && usual > 0) {
      let historyNote = ''
      if (ctx.equipment === 'dumbbell_2' && Math.abs(w - 2 * usual) / (2 * usual) <= 0.1 && w >= 1.6 * usual) {
        historyNote = `About double their usual ${fmt(usual)}#. May be the total of both DBs`
      } else if (ctx.equipment === 'landmine' && Math.abs(w - (usual + 45)) <= 5) {
        historyNote = `About 45 over their usual ${fmt(usual)}. May include the bar`
      } else if (ctx.previousBest > 0 && w > ctx.previousBest * R.overBestRatio && w - ctx.previousBest >= R.minGapLbs) {
        historyNote = `${Math.round((w / ctx.previousBest - 1) * 100)}% over their previous best (${fmt(ctx.previousBest)})`
      } else if (w >= usual * R.heavierRatio && w - usual >= R.minGapLbs) {
        historyNote = `Much heavier than usual (usually about ${fmt(usual)})`
      } else if (w <= usual * R.lighterRatio && usual - w >= R.minGapLbs) {
        historyNote = `Much lighter than usual (usually about ${fmt(usual)})`
      }
      if (historyNote) notes.push(historyNote)
    }

    // ── Compared with their other sets today (only when there's no history) ──
    if (w !== null && w !== undefined && w > 0 && !usual) {
      const others = sets
        .filter(s => s.id !== set.id && s.completed && s.weight && s.weight > 0)
        .map(s => s.weight as number)
      if (others.length >= 2) {
        const typical = median(others)
        if ((w >= typical * R.sameSessionHigh || w <= typical * R.sameSessionLow) && Math.abs(w - typical) >= R.minGapLbs) {
          notes.push(`Very different from their other sets today (about ${fmt(typical)})`)
        }
      }
    }

    // ── Reps and bar speed ──
    if (set.reps !== null && set.reps !== undefined) {
      if (set.reps === 0) notes.push('0 reps logged')
      else if (set.reps > R.maxReps) notes.push(`${set.reps} reps is unusually high`)
    }
    if (set.velocity !== null && set.velocity !== undefined && set.velocity !== 0) {
      if (set.velocity > R.maxVelocity || set.velocity < R.minVelocity) {
        notes.push(`Bar speed ${set.velocity} m/s looks off`)
      }
    }

    out[set.id] = notes
  }
  return out
}
