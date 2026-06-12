// app/api/coach/vbt/ratios/route.ts
// ============================================================
// Manage exercise → anchor ratio mappings
//
// POST   /api/coach/vbt/ratios   — upsert a ratio for an exercise
// DELETE /api/coach/vbt/ratios   — remove a ratio for an exercise
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// POST — upsert ratio
export async function POST(req: NextRequest) {
  const { exercise_id, anchor_exercise_id, ratio, confidence } = await req.json()

  if (!exercise_id || !anchor_exercise_id || !ratio) {
    return NextResponse.json(
      { error: 'exercise_id, anchor_exercise_id, and ratio are required' },
      { status: 400 }
    )
  }

  const db = createServerClient()

  const { data, error } = await db
    .from('exercise_anchor_ratios')
    .upsert({
      exercise_id,
      anchor_exercise_id,
      ratio:      parseFloat(ratio),
      confidence: confidence ?? 'medium',
    }, {
      onConflict: 'exercise_id,anchor_exercise_id',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ratio: data })
}

// DELETE — remove ratio for an exercise
export async function DELETE(req: NextRequest) {
  const { exercise_id } = await req.json()

  if (!exercise_id) {
    return NextResponse.json({ error: 'exercise_id is required' }, { status: 400 })
  }

  const db = createServerClient()

  const { error } = await db
    .from('exercise_anchor_ratios')
    .delete()
    .eq('exercise_id', exercise_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
