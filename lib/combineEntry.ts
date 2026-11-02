// FILE: lib/combineEntry.ts
//
// Saving and deleting Combine Day tries, on the server. Shared by:
//   app/api/player/combine          a player's own phone, or Team Mode with
//                                   her pass (one player, all her tests)
//   app/api/coach/combine-station   a coach at one test station entering
//                                   numbers for a line of players
// so both follow exactly the same rules:
//   - each try goes in combine_attempts, on the player's session for today
//   - jumps, sprints and swing: up to maxAttempts tries, best counts
//   - height, wingspan, reach: one number; entering again replaces it
//   - after every change the best try for that test is written to today's
//     measurements row (a new row starts from her latest numbers, the same
//     way app/api/player/measurements does it), so the athleticism score,
//     Comparisons and her Profile use it. Deleting every try for a test puts
//     back the number from before today.
//
// Volleyball only (lib/features.ts).

import { createServerClient } from '@/lib/supabase'
import { clubDateString } from '@/lib/clubTime'
import { bestValue, roundToStep, type CombineMetric } from '@/lib/combine'

type Db = ReturnType<typeof createServerClient>

// Every measurements column, so a new dated row carries the rest forward
export const MEASUREMENT_KEYS = [
  'height_in', 'wingspan_in', 'standing_reach_in', 'standing_vertical_in',
  'approach_vertical_in', 'acceleration_sec', 'pro_agility_sec', 'swing_velocity_mph',
] as const

export type MeasurementRow = Record<string, unknown> & { id: string; player_id?: string; measured_at: string }

export function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Today's measurements row, and the latest row from before today */
export async function measurementRows(db: Db, playerId: string) {
  const today = clubDateString()
  const [{ data: todayRows }, { data: earlier }] = await Promise.all([
    db.from('measurements').select('*').eq('player_id', playerId).eq('measured_at', today)
      .order('created_at', { ascending: false }).limit(1),
    db.from('measurements').select('*').eq('player_id', playerId).lt('measured_at', today)
      .order('measured_at', { ascending: false }).limit(1),
  ])
  return {
    todayRow: (todayRows?.[0] ?? null) as MeasurementRow | null,
    previousRow: (earlier?.[0] ?? null) as MeasurementRow | null,
  }
}

/** Writes the best try for one test (this session) to today's measurements row */
export async function syncMeasurement(db: Db, playerId: string, sessionId: string, metric: CombineMetric): Promise<string | null> {
  const { data: tries, error: triesError } = await db
    .from('combine_attempts')
    .select('value')
    .eq('session_id', sessionId)
    .eq('metric', metric.key)
  if (triesError) return triesError.message
  const best = bestValue(metric, (tries ?? []).map(t => Number(t.value)).filter(Number.isFinite))
  const { todayRow, previousRow } = await measurementRows(db, playerId)

  if (best != null) {
    if (todayRow) {
      const { error } = await db.from('measurements').update({ [metric.key]: best }).eq('id', todayRow.id)
      return error?.message ?? null
    }
    // New dated row: last time's numbers, with this test's best today
    const row: Record<string, unknown> = { player_id: playerId, measured_at: clubDateString() }
    for (const k of MEASUREMENT_KEYS) row[k] = previousRow?.[k] ?? null
    row[metric.key] = best
    const { error } = await db.from('measurements').insert(row)
    return error?.message ?? null
  }

  // No tries left for this test: put back the number from before today
  if (todayRow) {
    const { error } = await db.from('measurements').update({ [metric.key]: previousRow?.[metric.key] ?? null }).eq('id', todayRow.id)
    return error?.message ?? null
  }
  return null
}

export type SaveResult = { ok: true } | { ok: false; status: number; error: string }

/** Saves one try (already checked: the session is today's and the test is in this combine) */
export async function saveAttempt(db: Db, opts: {
  sessionId: string
  playerId: string
  metric: CombineMetric
  value: unknown
}): Promise<SaveResult> {
  const { sessionId, playerId, metric } = opts
  const raw = num(opts.value)
  if (raw == null) return { ok: false, status: 400, error: 'Enter a number' }
  const v = roundToStep(metric, raw)
  if (v < metric.limits[0] || v > metric.limits[1]) {
    return { ok: false, status: 400, error: `That can't be right for ${metric.label}. Check the number.` }
  }

  const { data: existing, error: existingError } = await db
    .from('combine_attempts')
    .select('id')
    .eq('session_id', sessionId)
    .eq('metric', metric.key)
  if (existingError) return { ok: false, status: 500, error: existingError.message }

  if (metric.maxAttempts === 1) {
    // One number for this test: a new one replaces the old one
    if ((existing ?? []).length > 0) {
      await db.from('combine_attempts').delete().eq('session_id', sessionId).eq('metric', metric.key)
    }
  } else if ((existing ?? []).length >= metric.maxAttempts) {
    return { ok: false, status: 409, error: `All ${metric.maxAttempts} tries are in. Delete one to enter another.` }
  }

  const { error: insertError } = await db.from('combine_attempts').insert({
    session_id: sessionId,
    player_id: playerId,
    metric: metric.key,
    value: v,
  })
  if (insertError) return { ok: false, status: 500, error: insertError.message }

  const syncError = await syncMeasurement(db, playerId, sessionId, metric)
  if (syncError) return { ok: false, status: 500, error: `Saved, but the best wasn't updated: ${syncError}` }
  return { ok: true }
}

/** Deletes one try from this session; `metricOf` tells which test it was (for re-syncing) */
export async function deleteAttempt(db: Db, opts: {
  sessionId: string
  playerId: string
  id: string
  metricOf: (key: string) => CombineMetric | null
}): Promise<SaveResult> {
  const { sessionId, playerId, id } = opts
  const { data: attempt } = await db
    .from('combine_attempts')
    .select('id, metric')
    .eq('id', id)
    .eq('session_id', sessionId)
    .maybeSingle()
  if (!attempt) return { ok: true }   // already gone

  const { error } = await db.from('combine_attempts').delete().eq('id', id).eq('session_id', sessionId)
  if (error) return { ok: false, status: 500, error: error.message }

  const metric = opts.metricOf(attempt.metric)
  if (metric) {
    const syncError = await syncMeasurement(db, playerId, sessionId, metric)
    if (syncError) return { ok: false, status: 500, error: `Deleted, but the best wasn't updated: ${syncError}` }
  }
  return { ok: true }
}
