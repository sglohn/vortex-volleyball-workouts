// FILE: app/api/coach/vbt/route.ts
// ============================================================
// VBT API — Coach endpoints (exercise-specific)
//
// GET  /api/coach/vbt?player_id=xxx
//      The player's VBT profiles and test history, plus every
//      exercise that has "Log velocity" turned on (testable exercises).
//
// POST /api/coach/vbt
//      Log a test for one exercise and rebuild that player's
//      profile for that exercise from the test's data points.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import {
  fitLoadVelocityLine,
  oneRepMaxFromLine,
  VBT_RULES,
  type VbtDataPoint,
} from '@/lib/vbt'

// ------------------------------------------------------------
// GET
// ------------------------------------------------------------
export async function GET(req: NextRequest) {
  const player_id = new URL(req.url).searchParams.get('player_id')
  if (!player_id) return NextResponse.json({ error: 'player_id required' }, { status: 400 })

  const db = createServerClient()

  const { data: profiles, error: profileError } = await db
    .from('vbt_profiles')
    .select('*, exercise:exercise_library(id, name)')
    .eq('player_id', player_id)
    .not('exercise_id', 'is', null)
    .order('calculated_at', { ascending: false })
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  const { data: tests, error: testError } = await db
    .from('vbt_tests')
    .select('*, exercise:exercise_library(id, name), vbt_data_points(*)')
    .eq('player_id', player_id)
    .not('exercise_id', 'is', null)
    .order('tested_at', { ascending: false })
  if (testError) return NextResponse.json({ error: testError.message }, { status: 500 })

  const { data: exercises } = await db
    .from('exercise_library')
    .select('id, name')
    .eq('is_active', true)
    .eq('logs_velocity', true)
    .order('name')

  return NextResponse.json({ profiles, tests, exercises: exercises ?? [] })
}

// ------------------------------------------------------------
// POST
// Body:
// {
//   player_id: string
//   exercise_id: string
//   tested_at?: string             // "2026-10-01"
//   mvt?: number                   // optional: speed at a true max, for a 1RM estimate
//   notes?: string
//   data_points: [{ load_lbs, reps_performed?, best_velocity_ms }, ...]
// }
// ------------------------------------------------------------
export async function POST(req: NextRequest) {
  const { player_id, exercise_id, tested_at, mvt, notes, data_points } = await req.json()

  if (!player_id || !exercise_id) {
    return NextResponse.json({ error: 'player_id and exercise_id are required' }, { status: 400 })
  }
  if (!Array.isArray(data_points) || data_points.length < 1) {
    return NextResponse.json({ error: 'At least one data point is required' }, { status: 400 })
  }

  const db = createServerClient()

  // 1. Save the test
  const { data: test, error: testError } = await db
    .from('vbt_tests')
    .insert({
      player_id,
      exercise_id,
      tested_at: tested_at ?? new Date().toISOString().slice(0, 10),
      mvt_override: mvt ?? null,
      notes: notes ?? null,
      created_by_coach: true,
    })
    .select()
    .single()
  if (testError || !test) {
    return NextResponse.json({ error: testError?.message ?? 'Failed to create test' }, { status: 500 })
  }

  // 2. Save the data points
  const { error: pointsError } = await db.from('vbt_data_points').insert(
    data_points.map((p: { load_lbs: number; reps_performed?: number; best_velocity_ms: number; notes?: string }) => ({
      test_id: test.id,
      load_lbs: p.load_lbs,
      reps_performed: p.reps_performed ?? 3,
      best_velocity_ms: p.best_velocity_ms,
      notes: p.notes ?? null,
    }))
  )
  if (pointsError) {
    await db.from('vbt_tests').delete().eq('id', test.id)
    return NextResponse.json({ error: pointsError.message }, { status: 500 })
  }

  // 3. Fit the line
  const points: VbtDataPoint[] = data_points.map((p: { load_lbs: number; best_velocity_ms: number }) => ({
    load_lbs: p.load_lbs,
    best_velocity_ms: p.best_velocity_ms,
  }))
  const line = fitLoadVelocityLine(points)

  if (!line) {
    const reason = points.length < VBT_RULES.minPoints
      ? `Test saved. The profile needs at least ${VBT_RULES.minPoints} different loads, so it was not updated.`
      : `Test saved, but the profile was not updated. The lightest and heaviest loads need at least ${VBT_RULES.minVelocitySpread} m/s difference in bar speed, heavier loads must be slower, and 3+ loads must fit a straight line (R² ${VBT_RULES.minRSquared}+). Retest with a lighter and a heavier load.`
    return NextResponse.json({ test, profile_updated: false, message: reason })
  }

  const estimated_1rm = oneRepMaxFromLine(line, mvt)

  // 4. Save the profile for this player + exercise
  const { error: profileError } = await db
    .from('vbt_profiles')
    .upsert({
      player_id,
      exercise_id,
      anchor_exercise_id: null,
      slope: line.slope,
      v_intercept: line.v_intercept,
      estimated_1rm_lbs: estimated_1rm,
      mvt_used: mvt ?? null,
      velocity_at_light: line.velocity_at_light,
      velocity_at_heavy: line.velocity_at_heavy,
      load_light_lbs: line.load_light_lbs,
      load_heavy_lbs: line.load_heavy_lbs,
      r_squared: line.r_squared,
      source_test_id: test.id,
      calculated_at: new Date().toISOString(),
    }, { onConflict: 'player_id,exercise_id' })
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  return NextResponse.json({
    test,
    profile_updated: true,
    estimated_1rm,
    r_squared: line.r_squared,
    message: estimated_1rm
      ? `Profile saved. Estimated 1RM ${Math.round(estimated_1rm)} lbs.`
      : 'Profile saved. Speed targets will work for this exercise. (No 1RM — enter a minimum velocity to get one.)',
  })
}
