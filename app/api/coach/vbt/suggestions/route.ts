// app/api/coach/vbt/suggestion/route.ts
// ============================================================
// VBT SUGGESTION API
//
// GET /api/coach/vbt/suggestion?player_id=xxx&exercise_id=xxx&reps=5
//
// Returns the best weight suggestion for a player+exercise combo,
// using the priority cascade:
//   1. Direct VBT profile for this exercise's anchor
//   2. VBT profile for a related anchor via ratio
//   3. Epley estimate from rep history
//   4. Nothing (prompt for first weight)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { buildWeightSuggestion, epley1RM } from '@/lib/vbt'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const player_id   = searchParams.get('player_id')
  const exercise_id = searchParams.get('exercise_id')
  const reps        = parseInt(searchParams.get('reps') ?? '5', 10)

  if (!player_id || !exercise_id) {
    return NextResponse.json(
      { error: 'player_id and exercise_id are required' },
      { status: 400 }
    )
  }

  const db = createServerClient()

  // --- 1. Look up this exercise's anchor ratio ---
  const { data: ratio_row } = await db
    .from('exercise_anchor_ratios')
    .select(`
      ratio,
      confidence,
      anchor_exercise:vbt_anchor_exercises(id, slug, category)
    `)
    .eq('exercise_id', exercise_id)
    .maybeSingle()

  // --- 2. Look up player's VBT profiles ---
  const { data: profiles } = await db
    .from('vbt_profiles')
    .select('anchor_exercise_id, estimated_1rm_lbs')
    .eq('player_id', player_id)

  const profileMap: Record<string, number> = {}
  for (const p of profiles ?? []) {
    profileMap[p.anchor_exercise_id] = p.estimated_1rm_lbs
  }

  // --- 3. Determine VBT 1RM inputs ---
  let vbt_1rm: number | null = null
  let vbt_ratio_1rm: number | null = null
  let vbt_ratio: number | null = null
  let vbt_ratio_confidence: 'high' | 'medium' | 'low' = 'medium'
  let is_explosive = false

  if (ratio_row?.anchor_exercise) {
    const anchor_id = (ratio_row.anchor_exercise as { id: string; slug: string; category: string }).id
    const anchor_category = (ratio_row.anchor_exercise as { id: string; slug: string; category: string }).category
    is_explosive = anchor_category === 'explosive'

    const anchor_1rm = profileMap[anchor_id] ?? null

    if (anchor_1rm) {
      // Check if this exercise IS the anchor (ratio would be 1.0 and exercise_id matches an anchor)
      if (ratio_row.ratio === 1.0) {
        vbt_1rm = anchor_1rm
      } else {
        vbt_ratio_1rm = anchor_1rm
        vbt_ratio = ratio_row.ratio
        vbt_ratio_confidence = (ratio_row.confidence as 'high' | 'medium' | 'low') ?? 'medium'
      }
    }
  }

  // --- 4. Epley fallback: fetch best recent set for this exercise ---
  let epley_weight: number | null = null
  let epley_reps:   number | null = null

  if (!vbt_1rm && !vbt_ratio_1rm) {
    // Get the heaviest set logged in the last 90 days for this exercise
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

    const { data: sets } = await db
      .from('set_logs')
      .select(`
        weight_lbs,
        reps_completed,
        session:sessions!inner(player_id, checked_in_at),
        exercise_id
      `)
      .eq('exercise_id', exercise_id)
      .eq('session.player_id', player_id)
      .gte('session.checked_in_at', cutoff)
      .gt('weight_lbs', 0)
      .gt('reps_completed', 0)
      .order('weight_lbs', { ascending: false })
      .limit(20)

    if (sets && sets.length > 0) {
      // Find the set with the best estimated 1RM
      let best1rm = 0
      for (const s of sets) {
        const est = epley1RM(s.weight_lbs, s.reps_completed)
        if (est > best1rm) {
          best1rm = est
          epley_weight = s.weight_lbs
          epley_reps   = s.reps_completed
        }
      }
    }
  }

  // --- 5. Build suggestion ---
  const suggestion = buildWeightSuggestion({
    target_reps:          reps,
    is_explosive,
    vbt_1rm,
    vbt_ratio_1rm,
    vbt_ratio,
    vbt_ratio_confidence,
    epley_weight_lbs:     epley_weight,
    epley_reps:           epley_reps,
  })

  return NextResponse.json(suggestion)
}
