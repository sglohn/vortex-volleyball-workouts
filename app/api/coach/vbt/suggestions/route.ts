// FILE: app/api/coach/vbt/suggestions/route.ts
// ============================================================
// VBT SUGGESTION API
//
// GET /api/coach/vbt/suggestions?player_id=xxx&exercise_id=xxx&reps=5
//
// Returns the best weight suggestion for a player+exercise combo,
// using the priority cascade:
//   1. Direct VBT profile for this exercise's anchor (fresh + good fit)
//   2. VBT profile for a related anchor via a high-confidence ratio
//   3. Epley estimate from history that passes getQualifiedOneRepMax
//   4. Nothing — player chooses their own weight
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { buildWeightSuggestion, profileNeedsRefresh } from '@/lib/vbt'
import { getQualifiedOneRepMax } from '@/lib/fitness'

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
    .select('anchor_exercise_id, estimated_1rm_lbs, r_squared, calculated_at, load_light_lbs, load_heavy_lbs')
    .eq('player_id', player_id)

  // Only profiles that are recent, fit well, and came from 2+ different
  // loads are trusted. Anything else is ignored rather than guessed from.
  const profileMap: Record<string, number> = {}
  for (const p of profiles ?? []) {
    if (!p.estimated_1rm_lbs || p.estimated_1rm_lbs <= 0) continue
    if (profileNeedsRefresh(p.calculated_at, p.r_squared)) continue
    if (p.load_light_lbs === null || p.load_heavy_lbs === null || p.load_light_lbs === p.load_heavy_lbs) continue
    profileMap[p.anchor_exercise_id] = p.estimated_1rm_lbs
  }

  // --- 3. Determine VBT 1RM inputs ---
  let vbt_1rm: number | null = null
  let vbt_ratio_1rm: number | null = null
  let vbt_ratio: number | null = null
  let vbt_ratio_confidence: 'high' | 'medium' | 'low' = 'medium'
  let is_explosive = false

  const anchorExercise = Array.isArray(ratio_row?.anchor_exercise)
    ? ratio_row?.anchor_exercise[0]
    : ratio_row?.anchor_exercise as { id: string; slug: string; category: string } | undefined

  if (anchorExercise) {
    const anchor_id = anchorExercise.id
    const anchor_category = anchorExercise.category
    is_explosive = anchor_category === 'explosive'

    const anchor_1rm = profileMap[anchor_id] ?? null

    if (anchor_1rm) {
      // Check if this exercise IS the anchor (ratio would be 1.0 and exercise_id matches an anchor)
      if (ratio_row?.ratio === 1.0) {
        vbt_1rm = anchor_1rm
      } else {
        vbt_ratio_1rm = anchor_1rm
        vbt_ratio = ratio_row?.ratio ?? null
        vbt_ratio_confidence = (ratio_row?.confidence as 'high' | 'medium' | 'low') ?? 'medium'
      }
    }
  }

  // --- 4. Epley fallback: only from proven history (see lib/fitness.ts) ---
  let epley_qualified_1rm: number | null = null
  let epley_not_qualified_reason = ''

  if (!vbt_1rm && !vbt_ratio_1rm) {
    const { data: sets } = await db
      .from('set_logs')
      .select(`
        session_id,
        weight_lbs,
        reps_completed,
        completed,
        session:sessions!inner(player_id, checked_in_at)
      `)
      .eq('exercise_id', exercise_id)
      .eq('session.player_id', player_id)
      .eq('completed', true)

    const qualified = getQualifiedOneRepMax(
      (sets ?? []).map(s => {
        const sess = Array.isArray(s.session) ? s.session[0] : s.session
        return {
          session_id: s.session_id,
          session_date: (sess as { checked_in_at?: string } | undefined)?.checked_in_at ?? null,
          weight_lbs: s.weight_lbs,
          reps_completed: s.reps_completed,
          completed: s.completed,
        }
      })
    )
    if (qualified.qualified) epley_qualified_1rm = qualified.oneRepMax
    else epley_not_qualified_reason = qualified.reason
  }

  // --- 5. Build suggestion ---
  const suggestion = buildWeightSuggestion({
    target_reps:          reps,
    is_explosive,
    vbt_1rm,
    vbt_ratio_1rm,
    vbt_ratio,
    vbt_ratio_confidence,
    epley_qualified_1rm,
    epley_not_qualified_reason,
  })

  return NextResponse.json(suggestion)
}
