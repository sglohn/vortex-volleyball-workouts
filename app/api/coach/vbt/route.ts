// app/api/coach/vbt/route.ts
// ============================================================
// VBT API — Coach endpoints
//
// GET  /api/coach/vbt?player_id=xxx
//      Returns all VBT profiles + test history for a player
//
// POST /api/coach/vbt
//      Log a new VBT test session with data points,
//      then recalculate and upsert the player's profile
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import {
  fitLoadVelocityProfile,
  singlePointEstimate,
  DEFAULT_MVT,
  type VbtDataPoint,
} from '@/lib/vbt'

// ------------------------------------------------------------
// GET — fetch all VBT data for a player
// ------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const player_id = searchParams.get('player_id')

  if (!player_id) {
    return NextResponse.json({ error: 'player_id required' }, { status: 400 })
  }

  const db = createServerClient()

  // Fetch profiles (current calculated 1RMs)
  const { data: profiles, error: profileError } = await db
    .from('vbt_profiles')
    .select(`
      *,
      anchor_exercise:vbt_anchor_exercises(*)
    `)
    .eq('player_id', player_id)
    .order('calculated_at', { ascending: false })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  // Fetch full test history with data points
  const { data: tests, error: testError } = await db
    .from('vbt_tests')
    .select(`
      *,
      anchor_exercise:vbt_anchor_exercises(id, name, slug, category),
      vbt_data_points(*)
    `)
    .eq('player_id', player_id)
    .order('tested_at', { ascending: false })

  if (testError) {
    return NextResponse.json({ error: testError.message }, { status: 500 })
  }

  // Fetch all anchor exercises (for the UI to know what's available)
  const { data: anchors } = await db
    .from('vbt_anchor_exercises')
    .select('*')
    .order('sort_order')

  return NextResponse.json({ profiles, tests, anchors })
}

// ------------------------------------------------------------
// POST — log a new VBT test and recalculate profile
//
// Body:
// {
//   player_id: string
//   anchor_exercise_id: string
//   tested_at: string          // ISO date e.g. "2025-09-15"
//   mvt_override?: number      // optional custom MVT
//   notes?: string
//   data_points: [
//     { load_lbs: number, reps_performed: number, best_velocity_ms: number },
//     ...
//   ]
// }
// ------------------------------------------------------------
export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    player_id,
    anchor_exercise_id,
    tested_at,
    mvt_override,
    notes,
    data_points,
  } = body

  // Validation
  if (!player_id || !anchor_exercise_id) {
    return NextResponse.json(
      { error: 'player_id and anchor_exercise_id are required' },
      { status: 400 }
    )
  }
  if (!Array.isArray(data_points) || data_points.length < 1) {
    return NextResponse.json(
      { error: 'At least one data point is required' },
      { status: 400 }
    )
  }

  const db = createServerClient()

  // Fetch the anchor exercise for category + default MVT
  const { data: anchor, error: anchorError } = await db
    .from('vbt_anchor_exercises')
    .select('*')
    .eq('id', anchor_exercise_id)
    .single()

  if (anchorError || !anchor) {
    return NextResponse.json({ error: 'Anchor exercise not found' }, { status: 404 })
  }

  const mvt = mvt_override ?? anchor.mvt_default

  // 1. Insert the test session
  const { data: test, error: testError } = await db
    .from('vbt_tests')
    .insert({
      player_id,
      anchor_exercise_id,
      tested_at: tested_at ?? new Date().toISOString().slice(0, 10),
      mvt_override: mvt_override ?? null,
      notes: notes ?? null,
      created_by_coach: true,
    })
    .select()
    .single()

  if (testError || !test) {
    return NextResponse.json({ error: testError?.message ?? 'Failed to create test' }, { status: 500 })
  }

  // 2. Insert the data points
  const pointsToInsert = data_points.map((p: {
    load_lbs: number
    reps_performed?: number
    best_velocity_ms: number
    notes?: string
  }) => ({
    test_id: test.id,
    load_lbs: p.load_lbs,
    reps_performed: p.reps_performed ?? 3,
    best_velocity_ms: p.best_velocity_ms,
    notes: p.notes ?? null,
  }))

  const { error: pointsError } = await db
    .from('vbt_data_points')
    .insert(pointsToInsert)

  if (pointsError) {
    // Roll back test row on failure
    await db.from('vbt_tests').delete().eq('id', test.id)
    return NextResponse.json({ error: pointsError.message }, { status: 500 })
  }

  // 3. Calculate the 1RM from the new data points
  const vbtPoints: VbtDataPoint[] = data_points.map((p: {
    load_lbs: number
    best_velocity_ms: number
  }) => ({
    load_lbs: p.load_lbs,
    best_velocity_ms: p.best_velocity_ms,
  }))

  let estimated_1rm: number | null = null
  let r_squared: number | null = null
  let profileData = null

  if (vbtPoints.length >= 2) {
    profileData = fitLoadVelocityProfile(vbtPoints, mvt)
    if (profileData) {
      estimated_1rm = profileData.estimated_1rm_lbs
      r_squared = profileData.r_squared
    }
  } else if (vbtPoints.length === 1) {
    // Single point fallback
    estimated_1rm = singlePointEstimate(vbtPoints[0], mvt, anchor.category)
  }

  // 4. Upsert the profile with the new 1RM
  if (estimated_1rm !== null) {
    const sorted = [...vbtPoints].sort((a, b) => a.load_lbs - b.load_lbs)

    const { error: profileError } = await db
      .from('vbt_profiles')
      .upsert({
        player_id,
        anchor_exercise_id,
        estimated_1rm_lbs: estimated_1rm,
        mvt_used: mvt,
        velocity_at_light: sorted[0]?.best_velocity_ms ?? null,
        velocity_at_heavy: sorted[sorted.length - 1]?.best_velocity_ms ?? null,
        load_light_lbs: sorted[0]?.load_lbs ?? null,
        load_heavy_lbs: sorted[sorted.length - 1]?.load_lbs ?? null,
        r_squared: r_squared ?? null,
        source_test_id: test.id,
        calculated_at: new Date().toISOString(),
      }, {
        onConflict: 'player_id,anchor_exercise_id',
      })

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    test,
    estimated_1rm,
    r_squared,
    message: estimated_1rm
      ? `1RM estimated at ${Math.round(estimated_1rm)} lbs`
      : 'Test logged — add a second data point for a 1RM estimate',
  })
}
