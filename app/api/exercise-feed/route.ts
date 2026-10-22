// FILE: app/api/exercise-feed/route.ts
//
// The exercise feed (see lib/exerciseFeed.ts). Answers on the source site
// (Vortex) only, and only to a request carrying EXERCISE_FEED_SECRET.
// Anything else gets "Not found", so the address gives nothing away.
//
//   GET  (Authorization: Bearer <EXERCISE_FEED_SECRET>)
//   → { exercises: [{ id, name, category, sets/reps, notes, equipment,
//                     demo clip links, easier/harder family + level,
//                     backup (as the backup's id in this feed) }] }
//
// Active exercises only. Nothing about players, teams or workouts, and no
// bar speed settings.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { feedAuthorized } from '@/lib/exerciseFeed'

export const dynamic = 'force-dynamic'

const FEED_COLUMNS =
  'id, name, category, default_sets, default_reps, logs_weight, coaching_notes, demo_url, ' +
  'equipment, clip_url, clip_poster_url, variation_family, variation_level, backup_exercise_id'

export async function GET(req: NextRequest) {
  if (!feedAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const db = createServerClient()
  const { data, error } = await db.from('exercise_library').select(FEED_COLUMNS).eq('is_active', true).order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ exercises: data ?? [] }, { headers: { 'cache-control': 'no-store' } })
}
