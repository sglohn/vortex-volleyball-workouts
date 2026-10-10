// FILE: app/api/player/self-guided-swap/route.ts   (new file)
//
// Easier-option swaps for self-guided full-body workouts (lib/fullBodyWorkout.ts).
// A sore player can swap one exercise for another that hits the same area
// with less weight or a shorter range of motion, and swap back.
//
//   GET  ?sessionId=&slot=gen-<block>-<exercise>
//        → { current, original, options: [{ id, name, imageUrl, equipment }] }
//   POST { sessionId, slot, exerciseId, reason?, bodyPart? }
//        → swaps that exercise in the session's saved workout
//
// Options: easier levels of the same movement and its backup come first
// (lib/exerciseLevels.ts), each with a short tag. Every swap to an easier
// option is also saved in exercise_change_requests (kind 'self_guided_swap')
// with the player's reason, so the coach sees it in Coach → Requests.
//
// Rules:
//   - Only on self-guided sessions (sessions.generated_workout).
//   - Only before any set of that exercise has been logged today.
//   - The new exercise must be one of the offered options, or the original.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { canAccessSession, signInAgain } from '@/lib/playerAuth'
import { clubDateString } from '@/lib/clubTime'
import { asReason, asText, BODY_AREAS, CHANGE_REASONS } from '@/lib/exerciseLevels'
import {
  asGeneratedWorkout, easierOptions, type EasierOption, loadLibrary, parseSlotId, skippedExerciseIds,
  type GeneratedWorkout, type LibraryRow,
} from '@/lib/fullBodyWorkout'

type Db = ReturnType<typeof createServerClient>

interface Loaded {
  workout: GeneratedWorkout
  blockIndex: number
  exerciseIndex: number
  library: LibraryRow[]
  options: EasierOption[]
  originalId: string
  playerId: string
}

async function load(db: Db, sessionId: string, slot: string | null): Promise<Loaded | NextResponse> {
  const where = parseSlotId(slot)
  if (!where) return NextResponse.json({ error: 'Unknown exercise' }, { status: 400 })

  const { data: session } = await db.from('sessions').select('*').eq('id', sessionId).single()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const workout = asGeneratedWorkout(session.generated_workout)
  const entry = workout?.blocks[where.blockIndex]?.exercises[where.exerciseIndex]
  if (!workout || !entry) return NextResponse.json({ error: 'This workout has no easier options' }, { status: 400 })

  const [libraryAll, skips] = await Promise.all([
    loadLibrary(db),
    skippedExerciseIds(db, session.player_id, clubDateString()),
  ])
  const library = libraryAll.filter(ex => !skips.has(ex.id))

  // Leave out the current exercise, the original, and everything else already in today's workout
  const originalId = entry.swappedFromId ?? entry.exerciseId
  const exclude = new Set<string>([entry.exerciseId, originalId])
  for (const b of workout.blocks) for (const e of b.exercises) exclude.add(e.exerciseId)

  const options = easierOptions(library, entry.area, entry.role, exclude, originalId)
  return { workout, ...where, library, options, originalId, playerId: session.player_id }
}

function brief(ex: LibraryRow | undefined | null, extra?: Record<string, unknown>) {
  if (!ex) return null
  return { id: ex.id, name: ex.name, equipment: ex.equipment, ...extra }
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  const slot = req.nextUrl.searchParams.get('slot')
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  if (!(await canAccessSession(req, sessionId))) return signInAgain()

  const db = createServerClient()
  const result = await load(db, sessionId, slot)
  if (result instanceof NextResponse) return result

  const entry = result.workout.blocks[result.blockIndex].exercises[result.exerciseIndex]
  const byId = new Map(result.library.map(ex => [ex.id, ex]))

  // Photos for the option list
  const ids = result.options.map(o => o.id)
  const { data: media } = ids.length
    ? await db.from('exercise_library').select('id, start_image_url, demo_image_url').in('id', ids)
    : { data: [] }
  const imageById = new Map((media ?? []).map(m => [m.id as string, (m.start_image_url || m.demo_image_url || null) as string | null]))

  return NextResponse.json({
    current: brief(byId.get(entry.exerciseId)),
    original: entry.swappedFromId ? brief(byId.get(result.originalId)) ?? { id: result.originalId, name: entry.swappedFromName } : null,
    options: result.options.map(o => brief(o, { imageUrl: imageById.get(o.id) ?? null, tag: o.tag ?? null })),
  })
}

export async function POST(req: NextRequest) {
  const { sessionId, slot, exerciseId, reason: rawReason, bodyPart: rawBodyPart } = await req.json()
  if (!sessionId || !slot || !exerciseId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (!(await canAccessSession(req, sessionId))) return signInAgain()

  const db = createServerClient()
  const result = await load(db, sessionId, slot)
  if (result instanceof NextResponse) return result

  const { workout, blockIndex, exerciseIndex, options, originalId, library } = result
  const entry = workout.blocks[blockIndex].exercises[exerciseIndex]

  // No swapping once a set of the current exercise is logged
  const { count } = await db
    .from('set_logs')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('exercise_id', entry.exerciseId)
    .eq('completed', true)
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'You already logged a set of this exercise' }, { status: 409 })
  }

  const backToOriginal = exerciseId === originalId
  if (!backToOriginal && !options.some(o => o.id === exerciseId)) {
    return NextResponse.json({ error: 'That exercise is not an option here' }, { status: 400 })
  }

  const originalName = entry.swappedFromName ?? library.find(ex => ex.id === originalId)?.name ?? 'the original exercise'
  const updatedEntry = backToOriginal
    ? { exerciseId: originalId, area: entry.area, role: entry.role, reps: entry.reps }
    : { ...entry, exerciseId, swappedFromId: originalId, swappedFromName: originalName }

  const updated: GeneratedWorkout = {
    ...workout,
    blocks: workout.blocks.map((b, bi) => bi !== blockIndex ? b : {
      ...b,
      exercises: b.exercises.map((e, ei) => ei !== exerciseIndex ? e : updatedEntry),
    }),
  }

  const { error } = await db.from('sessions').update({ generated_workout: updated }).eq('id', sessionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Let the coach know (best effort — the swap already happened)
  if (!backToOriginal) {
    const reason = asReason(rawReason)
    const asksWhere = CHANGE_REASONS.find(r => r.value === reason)?.asksWhere ?? false
    const bodyPart = asText(rawBodyPart, 40)
    await db.from('exercise_change_requests').insert({
      player_id: result.playerId,
      session_id: sessionId,
      slot,
      exercise_id: entry.exerciseId,
      original_exercise_id: originalId,
      kind: 'self_guided_swap',
      wants: 'easier',
      reason,
      body_part: asksWhere && bodyPart && BODY_AREAS.includes(bodyPart) ? bodyPart : null,
      status: 'noted',
      replacement_exercise_id: exerciseId,
      applies: 'today',
      resolved_at: new Date().toISOString(),
    }).then(() => {}, () => {})
  }

  return NextResponse.json({ ok: true, swappedBack: backToOriginal })
}
