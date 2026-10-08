// FILE: app/api/player/session-rating/route.ts   (new file)
//
// Saves the player's end-of-workout rating on her session.
//   POST { sessionId, rating: 'easy' | 'medium' | 'hard', note? }
//
// Needs supabase/migrations/2026-10-08_session_rating.sql (adds
// sessions.rating and sessions.rating_note). Coaches see the rating in
// Workout Logs.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { canAccessSession, signInAgain } from '@/lib/playerAuth'

const RATINGS = new Set(['easy', 'medium', 'hard'])
const ID_RE = /^[0-9a-f-]{8,64}$/i

export async function POST(req: NextRequest) {
  const { sessionId, rating, note } = await req.json().catch(() => ({}))
  if (typeof sessionId !== 'string' || !ID_RE.test(sessionId)) return NextResponse.json({ error: 'Bad session' }, { status: 400 })
  if (typeof rating !== 'string' || !RATINGS.has(rating)) return NextResponse.json({ error: 'Rating must be easy, medium or hard' }, { status: 400 })
  if (!(await canAccessSession(req, sessionId))) return signInAgain()
  const cleanNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null

  const db = createServerClient()
  const { data, error } = await db
    .from('sessions')
    .update({ rating, rating_note: cleanNote })
    .eq('id', sessionId)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
