// app/api/coach/vbt/anchors/route.ts
// ============================================================
// Returns the 4 anchor exercises (for dropdowns)
// GET /api/coach/vbt/anchors
// ============================================================

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const db = createServerClient()
  const { data: anchors, error } = await db
    .from('vbt_anchor_exercises')
    .select('id, name, slug, category, mvt_default, mvt_label, notes')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ anchors })
}
