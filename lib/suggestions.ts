// FILE: lib/suggestions.ts
// ============================================================
// WEIGHT SUGGESTION ENGINE
//
// Every suggested weight in the app comes from getPlayerRecommendation,
// so the player page, team kiosk and session page always agree.
//
// VBT is exercise-specific. A player's VBT profile for an exercise only
// ever informs that same exercise.
//
// Order of decisions for one exercise:
//
// 1. SPEED TARGET SET IN THE WORKOUT (min and/or max m/s)
//    a. Player already did a set of it today with a bar speed logged
//       → compare that speed to the target and adjust the next set.
//         Sized from the athlete's own load-velocity line (±10% max).
//         Without a trusted profile: direction only, no number.
//    b. First set today + trusted VBT profile
//       → the weight their line says they move at the target speed.
//    c. No trusted profile → falls through to step 2.
//
// 2. NORMAL SUGGESTION (% of 1RM, adjusted for training phase)
//    1RM sources:
//      VBT  — profile 1RM (only if a min velocity was entered on the test)
//      Sets — Epley from history passing getQualifiedOneRepMax
//    Both within 15% → average.  >15% apart → lower one.
//    One only → that one.  Neither → no suggestion.
//
// 3. LOADABLE WEIGHT (lib/loads.ts)
//    Every suggestion is rounded to a weight that can actually be loaded
//    for the exercise's equipment: barbell = 45 bar + plate pairs (5 lb
//    steps, never under 45); dumbbells = 5–50 by 5s, given per dumbbell
//    (the number on the dumbbell, which is also what players enter);
//    landmine = plates on the end in 2.5 lb steps.
//
// LANDMINE / VIKING PRESS
//    Players enter only the plates. The math adds the bar's felt weight
//    (LANDMINE_BAR_LBS) so the 1RM and % work on the real load, then the
//    suggestion is handed back as plates to load.
// ============================================================

import { createServerClient } from '@/lib/supabase'
import { getQualifiedOneRepMax, recommendWeightForPhase } from '@/lib/fitness'
import {
  isProfileTrusted, aimVelocity, loadForVelocity, roundToPlates,
  nextSetAdjustment, type StoredProfile,
} from '@/lib/vbt'
import { PhaseType } from '@/lib/types'
import { asEquipment, entryOffset, roundToLoadable, type Equipment } from '@/lib/loads'

type Db = ReturnType<typeof createServerClient>

export const COMBINE_RULES = {
  agreementPct: 0.15,
} as const

export type SuggestionSource =
  | 'speed_adjust'   // next set, adjusted from today's bar speed
  | 'speed_target'   // first set, read off the athlete's load-velocity line
  | 'vbt_and_sets'
  | 'vbt'
  | 'sets'
  | 'none'

export interface PlayerRecommendation {
  weight: number              // 0 when no number is suggested
  percent: number             // % of 1RM (0 for speed-based suggestions)
  label: string               // phase intensity note (blank for speed-based)
  phaseNote: string           // phase message, or why there's no suggestion
  best1RM: number             // 1RM behind the suggestion, 0 if none/unknown
  source: SuggestionSource
  sourceLabel: string         // where the number came from
  detail: string              // short line under the weight, e.g. "62% of your best" or "Aim 0.80–0.95 m/s"
  adjustmentMessage: string   // feedback from today's last set, blank if none
  targetVelocityMin: number | null
  targetVelocityMax: number | null
  vbt1RM: number | null
  sets1RM: number | null
  disagreement: boolean
}

// ------------------------------------------------------------
// Data loaders
// ------------------------------------------------------------
async function getEquipment(db: Db, exerciseId: string): Promise<Equipment | null> {
  const { data } = await db.from('exercise_library').select('equipment').eq('id', exerciseId).maybeSingle()
  return asEquipment((data as { equipment?: unknown } | null)?.equipment)
}

async function getProfile(db: Db, playerId: string, exerciseId: string): Promise<StoredProfile | null> {
  const { data } = await db
    .from('vbt_profiles')
    .select('slope, v_intercept, r_squared, calculated_at, load_light_lbs, load_heavy_lbs, velocity_at_light, velocity_at_heavy, estimated_1rm_lbs')
    .eq('player_id', playerId)
    .eq('exercise_id', exerciseId)
    .maybeSingle()
  return (data as StoredProfile | null) ?? null
}

export async function getSetsOneRepMax(
  db: Db,
  playerId: string,
  exerciseId: string,
  offset = 0,   // added to every entered weight (landmine bar)
): Promise<{ oneRepMax: number | null; reason: string }> {
  const { data: playerSessions } = await db
    .from('sessions')
    .select('id, checked_in_at')
    .eq('player_id', playerId)

  const sessionDate: Record<string, string> = Object.fromEntries(
    (playerSessions ?? []).map(s => [s.id, s.checked_in_at])
  )

  const { data: logs } = await db
    .from('set_logs')
    .select('session_id, weight_lbs, reps_completed, completed')
    .eq('exercise_id', exerciseId)
    .in('session_id', playerSessions?.map(s => s.id) ?? ['none'])
    .eq('completed', true)

  const q = getQualifiedOneRepMax(
    (logs ?? []).map(l => ({
      ...l,
      weight_lbs: offset && l.weight_lbs != null ? Number(l.weight_lbs) + offset : l.weight_lbs,
      session_date: sessionDate[l.session_id] ?? null,
    }))
  )
  return { oneRepMax: q.qualified ? q.oneRepMax : null, reason: q.reason }
}

/** Most recent completed set of this exercise in this session that has a bar speed */
async function getLastSpeedSetToday(db: Db, sessionId: string, exerciseId: string) {
  const { data } = await db
    .from('set_logs')
    .select('set_number, weight_lbs, velocity_ms, completed')
    .eq('session_id', sessionId)
    .eq('exercise_id', exerciseId)
    .eq('completed', true)
    .not('velocity_ms', 'is', null)
    .gt('weight_lbs', 0)
    .order('set_number', { ascending: false })
    .limit(1)
  const row = data?.[0]
  return row && row.weight_lbs && row.velocity_ms
    ? { weight: Number(row.weight_lbs), velocity: Number(row.velocity_ms) }
    : null
}

// ------------------------------------------------------------
// Combine VBT 1RM and set-history 1RM (normal suggestions)
// ------------------------------------------------------------
export function combineOneRepMax(
  vbt: number | null,
  sets: number | null
): { oneRepMax: number | null; source: SuggestionSource; disagreement: boolean } {
  if (vbt && sets) {
    const gap = Math.abs(vbt - sets) / Math.max(vbt, sets)
    if (gap <= COMBINE_RULES.agreementPct) {
      return { oneRepMax: Math.round((vbt + sets) / 2), source: 'vbt_and_sets', disagreement: false }
    }
    return { oneRepMax: Math.min(vbt, sets), source: 'vbt_and_sets', disagreement: true }
  }
  if (vbt)  return { oneRepMax: vbt,  source: 'vbt',  disagreement: false }
  if (sets) return { oneRepMax: sets, source: 'sets', disagreement: false }
  return { oneRepMax: null, source: 'none', disagreement: false }
}

function fmtRange(min: number | null, max: number | null): string {
  if (min && max) return `${min.toFixed(2)}–${max.toFixed(2)} m/s`
  if (min) return `over ${min.toFixed(2)} m/s`
  if (max) return `under ${max.toFixed(2)} m/s`
  return ''
}

// ------------------------------------------------------------
// Main entry point
// ------------------------------------------------------------
export async function getPlayerRecommendation(
  db: Db,
  opts: Parameters<typeof computeRecommendation>[1]
): Promise<PlayerRecommendation> {
  const equipment = await getEquipment(db, opts.exerciseId)
  const rec = await computeRecommendation(db, { ...opts, offset: entryOffset(equipment) })

  // Landmine: a %-of-best suggestion at or under the bar's own weight
  // still gets the lightest plate rather than disappearing.
  const isPercentSuggestion = rec.source === 'sets' || rec.source === 'vbt' || rec.source === 'vbt_and_sets'
  const weight = equipment === 'landmine' && isPercentSuggestion && rec.weight <= 0
    ? roundToLoadable(0.01, equipment)
    : roundToLoadable(rec.weight, equipment)

  // Always hand players a weight they can actually load
  return { ...rec, weight }
}

async function computeRecommendation(
  db: Db,
  opts: {
    playerId: string
    exerciseId: string
    targetReps: number | string
    phaseType: PhaseType
    sessionId?: string | null
    targetVelocityMin?: number | null
    targetVelocityMax?: number | null
    offset?: number   // landmine bar weight; see lib/loads.ts
  }
): Promise<PlayerRecommendation> {
  const offset = opts.offset ?? 0
  const vMin = opts.targetVelocityMin ? Number(opts.targetVelocityMin) : null
  const vMax = opts.targetVelocityMax ? Number(opts.targetVelocityMax) : null
  const hasSpeedTarget = !!(vMin || vMax)
  const range = fmtRange(vMin, vMax)

  const [profile, setsResult] = await Promise.all([
    getProfile(db, opts.playerId, opts.exerciseId),
    getSetsOneRepMax(db, opts.playerId, opts.exerciseId, offset),
  ])
  const trusted = isProfileTrusted(profile)
  const vbt1RM = trusted && profile?.estimated_1rm_lbs ? Number(profile.estimated_1rm_lbs) + offset : null
  const sets1RM = setsResult.oneRepMax

  const base = {
    targetVelocityMin: vMin, targetVelocityMax: vMax,
    vbt1RM, sets1RM, disagreement: false,
  }

  // ---- 1. Speed target ----
  if (hasSpeedTarget) {
    // a. Adjust from today's last set
    if (opts.sessionId) {
      const last = await getLastSpeedSetToday(db, opts.sessionId, opts.exerciseId)
      if (last) {
        const adj = nextSetAdjustment({
          lastWeight: last.weight, lastVelocity: last.velocity,
          min: vMin, max: vMax, profile: trusted ? profile : null,
        })
        return {
          ...base,
          weight: adj.nextWeight ?? 0,
          percent: 0,
          label: '',
          phaseNote: adj.nextWeight ? '' : adj.message,
          best1RM: vbt1RM ?? 0,
          source: 'speed_adjust',
          sourceLabel: adj.nextWeight ? 'Adjusted from your last set' : '',
          detail: `Aim ${range}`,
          adjustmentMessage: adj.message,
        }
      }
    }

    // b. First set: read off the athlete's line
    const aim = aimVelocity(vMin, vMax)
    if (trusted && profile && aim !== null) {
      const load = loadForVelocity(profile, aim)
      if (load) {
        return {
          ...base,
          weight: roundToPlates(load),
          percent: 0,
          label: '',
          phaseNote: '',
          best1RM: vbt1RM ?? 0,
          source: 'speed_target',
          sourceLabel: 'From your bar speed test',
          detail: `Aim ${range}`,
          adjustmentMessage: '',
        }
      }
    }
    // c. No trusted profile — fall through to the normal suggestion
  }

  // ---- 2. Normal suggestion ----
  const combined = combineOneRepMax(vbt1RM, sets1RM)

  if (!combined.oneRepMax) {
    return {
      ...base,
      weight: 0, percent: 0, label: '', best1RM: 0,
      phaseNote: setsResult.reason,
      source: 'none', sourceLabel: '',
      detail: hasSpeedTarget ? `Aim ${range}` : '',
      adjustmentMessage: '',
    }
  }

  const rec = recommendWeightForPhase(combined.oneRepMax, opts.targetReps, opts.phaseType)
  const sourceLabel =
    combined.source === 'vbt_and_sets' ? (combined.disagreement ? 'Bar speed + sets (using lower)' : 'Bar speed + your sets')
    : combined.source === 'vbt' ? 'From your bar speed test'
    : 'From your recent sets'

  return {
    ...base,
    ...rec,
    weight: rec.weight - offset,   // landmine: back to plates to load
    best1RM: combined.oneRepMax,
    source: combined.source,
    sourceLabel,
    detail: hasSpeedTarget ? `Aim ${range}` : `${rec.percent}% of your best`,
    adjustmentMessage: '',
    disagreement: combined.disagreement,
  }
}
