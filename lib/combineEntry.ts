// FILE: lib/combineEntry.ts
//
// Saving and deleting Combine Day tries, on the server. Shared by:
//   app/api/player/combine          a player's own phone, or Team Mode with
//                                   her pass (one player, all her tests)
//   app/api/coach/combine-station   a coach at one test station entering
//                                   numbers for a line of players
//   app/api/coach/logs/combine      a coach fixing a number on Workout Logs,
//                                   any day (fixAttempt / removeAttempt)
//   app/api/player/measurements     a coach editing her numbers on the
//                                   player page on a combine day
//                                   (fixFromProfile)
// so all of them follow exactly the same rules:
//   - each try goes in combine_attempts, on the player's session for today
//   - jumps, sprints and swing: up to maxAttempts tries, best counts
//   - height, wingspan, reach: one number; entering again replaces it
//   - after every change the best try for that test is written to today's
//     measurements row (a new row starts from her latest numbers, the same
//     way app/api/player/measurements does it), so the athleticism score,
//     Comparisons and her Profile use it. Deleting every try for a test puts
//     back the number from before today.
//   - the TV combine leaderboard reads the tries themselves
//     (lib/combineLeaderboard.ts), so a fix has to change the try, not only
//     the measurements row. A fix on an earlier day updates that day's
//     measurements row.
//
// Volleyball only (lib/features.ts).

import { createServerClient } from '@/lib/supabase'
import { clubDateOf, clubDateString, clubDayBounds } from '@/lib/clubTime'
import { bestValue, combineMetric, roundToStep, type CombineMetric, type CombineMetricKey } from '@/lib/combine'

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

/** That day's measurements row (default today), and the latest row from before it */
export async function measurementRows(db: Db, playerId: string, date: string = clubDateString()) {
  const today = date
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

/** Writes the best try for one test (this session) to that day's measurements row (default today) */
export async function syncMeasurement(db: Db, playerId: string, sessionId: string, metric: CombineMetric, date: string = clubDateString()): Promise<string | null> {
  const { data: tries, error: triesError } = await db
    .from('combine_attempts')
    .select('value')
    .eq('session_id', sessionId)
    .eq('metric', metric.key)
  if (triesError) return triesError.message
  const best = bestValue(metric, (tries ?? []).map(t => Number(t.value)).filter(Number.isFinite))
  const { todayRow, previousRow } = await measurementRows(db, playerId, date)

  if (best != null) {
    if (todayRow) {
      const { error } = await db.from('measurements').update({ [metric.key]: best }).eq('id', todayRow.id)
      return error?.message ?? null
    }
    // New dated row: last time's numbers, with this test's best today
    const row: Record<string, unknown> = { player_id: playerId, measured_at: date }
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

// ── Coach fixes (Workout Logs, any day) ─────────────────────────────────

export type AttemptRow = { id: string; session_id: string; player_id: string; metric: string; value: number | string; created_at: string }

/** One try with the club date of its session (null if it's gone) */
export async function findAttempt(db: Db, id: string): Promise<{ attempt: AttemptRow; metric: CombineMetric; date: string } | null> {
  const { data: attempt } = await db.from('combine_attempts').select('*').eq('id', id).maybeSingle()
  if (!attempt) return null
  const metric = combineMetric(attempt.metric)
  if (!metric) return null
  const { data: session } = await db.from('sessions').select('checked_in_at').eq('id', attempt.session_id).maybeSingle()
  const date = session?.checked_in_at ? clubDateOf(session.checked_in_at as string) : clubDateOf(attempt.created_at as string)
  return { attempt: attempt as AttemptRow, metric, date }
}

/** Changes the number on one try, then updates that day's measurements row */
export async function fixAttempt(db: Db, opts: { id: string; value: unknown }): Promise<SaveResult> {
  const found = await findAttempt(db, opts.id)
  if (!found) return { ok: false, status: 404, error: 'That number isn\'t there any more' }
  const { attempt, metric, date } = found
  const raw = num(opts.value)
  if (raw == null) return { ok: false, status: 400, error: 'Enter a number' }
  const v = roundToStep(metric, raw)
  if (v < metric.limits[0] || v > metric.limits[1]) {
    return { ok: false, status: 400, error: `That can't be right for ${metric.label}. Check the number.` }
  }
  // A changed number drops any "Looks right" check (the fingerprint won't match)
  const { error } = await db.from('combine_attempts').update({ value: v }).eq('id', attempt.id)
  if (error) return { ok: false, status: 500, error: error.message }
  const syncError = await syncMeasurement(db, attempt.player_id, attempt.session_id, metric, date)
  if (syncError) return { ok: false, status: 500, error: `Saved, but the best wasn't updated: ${syncError}` }
  return { ok: true }
}

/** Deletes one try, then updates that day's measurements row */
export async function removeAttempt(db: Db, id: string): Promise<SaveResult> {
  const found = await findAttempt(db, id)
  if (!found) return { ok: true }   // already gone
  const { attempt, metric, date } = found
  const { error } = await db.from('combine_attempts').delete().eq('id', attempt.id)
  if (error) return { ok: false, status: 500, error: error.message }
  const syncError = await syncMeasurement(db, attempt.player_id, attempt.session_id, metric, date)
  if (syncError) return { ok: false, status: 500, error: `Deleted, but the best wasn't updated: ${syncError}` }
  return { ok: true }
}

/**
 * A coach changed her numbers on the player page (app/api/player/measurements)
 * today. For each changed test she has tries for today, the try is fixed too,
 * so the TV combine leaderboard shows the corrected number:
 *   - height, wingspan, reach (one number): that number is replaced
 *   - jumps and sprints (best of 3): her best try is replaced
 * Then today's measurements row is set from the tries again. Returns the
 * tests whose best ended up different from what was typed (another try
 * was better), so the page can say so.
 */
export async function fixFromProfile(db: Db, playerId: string, changed: Partial<Record<CombineMetricKey, number>>): Promise<CombineMetricKey[]> {
  const keys = Object.keys(changed) as CombineMetricKey[]
  if (!keys.length) return []
  const date = clubDateString()
  const { start, end } = clubDayBounds(date)
  const { data: sessions } = await db.from('sessions').select('id').eq('player_id', playerId)
    .gte('checked_in_at', start).lt('checked_in_at', end)
  const sessionIds = (sessions ?? []).map(s => s.id as string)
  if (!sessionIds.length) return []
  const { data: triesRaw, error } = await db.from('combine_attempts').select('*')
    .in('session_id', sessionIds).in('metric', keys).order('created_at', { ascending: true })
  if (error) return []   // e.g. before the Combine Day migration
  const tries = (triesRaw ?? []) as AttemptRow[]

  const differs: CombineMetricKey[] = []
  for (const key of keys) {
    const metric = combineMetric(key)
    const typed = changed[key]
    const mine = tries.filter(t => t.metric === key)
    if (!metric || typed == null || !mine.length) continue
    const v = roundToStep(metric, typed)
    if (v < metric.limits[0] || v > metric.limits[1]) continue
    // The try that counts: the only one, or her best (latest if tied)
    const bestV = bestValue(metric, mine.map(t => Number(t.value)))
    const target = [...mine].reverse().find(t => Number(t.value) === bestV) ?? mine[mine.length - 1]
    if (Number(target.value) !== v) {
      const { error: uErr } = await db.from('combine_attempts').update({ value: v }).eq('id', target.id)
      if (uErr) continue
    }
    await syncMeasurement(db, playerId, target.session_id, metric, date)
    const after = bestValue(metric, mine.map(t => (t.id === target.id ? v : Number(t.value))))
    if (after != null && after !== v) differs.push(key)
  }
  return differs
}
