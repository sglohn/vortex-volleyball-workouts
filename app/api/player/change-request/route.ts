// FILE: app/api/player/change-request/route.ts   (new file)
//
// A player asks the coach to change one exercise in a team workout.
// Players can't change team workouts themselves; the coach approves or
// declines in Coach → Requests (app/api/coach/change-requests).
//
//   POST   { sessionId, slot, exerciseId, originalExerciseId, templateId?,
//            wants: 'easier'|'harder'|'different',
//            reason: 'sore'|'painful'|'too_hard'|'too_easy'|'equipment'|'other',
//            bodyPart?, painLevel? (0–10), note? }
//          → { request }   (replaces the player's open request for that spot)
//   DELETE { sessionId, id } → withdraws a request that's still waiting
//
// The latest request for each spot comes back with the workout
// (app/api/workout, exercise.changeRequest), so the player sees
// "Waiting for coach", the coach's answer, and the new exercise once approved.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { canAccessSession, signInAgain } from '@/lib/playerAuth'
import { asPainLevel, asReason, asText, asWants, CHANGE_REASONS, BODY_AREAS } from '@/lib/exerciseLevels'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const asUuid = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null)

const notReady = () => NextResponse.json(
  { error: 'Change requests aren’t set up yet. Ask your coach.' },
  { status: 503 },
)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const sessionId = asUuid(body.sessionId)
  const slot = asText(body.slot, 100)
  const exerciseId = asUuid(body.exerciseId)
  const originalExerciseId = asUuid(body.originalExerciseId) ?? exerciseId
  const wants = asWants(body.wants)
  const reason = asReason(body.reason)

  if (!sessionId || !slot || !exerciseId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (!wants) return NextResponse.json({ error: 'Pick what kind of change you want' }, { status: 400 })
  if (!reason) return NextResponse.json({ error: 'Pick a reason' }, { status: 400 })
  if (!(await canAccessSession(req, sessionId))) return signInAgain()

  const asksWhere = CHANGE_REASONS.find(r => r.value === reason)?.asksWhere ?? false
  const bodyPartRaw = asText(body.bodyPart, 40)
  const bodyPart = asksWhere && bodyPartRaw && BODY_AREAS.includes(bodyPartRaw) ? bodyPartRaw : null
  const painLevel = reason === 'painful' || reason === 'sore' ? asPainLevel(body.painLevel) : null
  const note = asText(body.note, 500)

  const db = createServerClient()
  const { data: session } = await db.from('sessions').select('id, player_id').eq('id', sessionId).single()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // One open request per spot: a new one replaces the one still waiting
  const { error: cancelError } = await db
    .from('exercise_change_requests')
    .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('slot', slot)
    .eq('status', 'pending')
  if (cancelError) return notReady()

  const { data: request, error } = await db
    .from('exercise_change_requests')
    .insert({
      player_id: session.player_id,
      session_id: sessionId,
      slot,
      template_id: asUuid(body.templateId),
      exercise_id: exerciseId,
      original_exercise_id: originalExerciseId,
      kind: 'request',
      wants,
      reason,
      body_part: bodyPart,
      pain_level: painLevel,
      note,
      status: 'pending',
    })
    .select('id, status, wants, reason, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const sessionId = asUuid(body.sessionId)
  const id = asUuid(body.id)
  if (!sessionId || !id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (!(await canAccessSession(req, sessionId))) return signInAgain()

  const db = createServerClient()
  const { data, error } = await db
    .from('exercise_change_requests')
    .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('session_id', sessionId)
    .eq('status', 'pending')
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Your coach already answered this one' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
