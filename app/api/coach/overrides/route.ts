import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const playerId   = req.nextUrl.searchParams.get('playerId')
  const scheduleId = req.nextUrl.searchParams.get('scheduleId')
  const db = createServerClient()

  if (playerId) {
    const today = new Date().toISOString().split('T')[0]
    const [{ data: overrides }, { data: skips }, { data: templates }] = await Promise.all([
      db.from('player_overrides').select('*').eq('player_id', playerId).order('override_date', { ascending: false }),
      db.from('player_exercise_skips').select('*, exercise_library:exercise_id(id,name)').eq('player_id', playerId).eq('is_active', true).or(`ends_on.is.null,ends_on.gte.${today}`),
      db.from('workout_templates').select('id, name'),
    ])
    return NextResponse.json({ overrides, skips, templates })
  }

  if (scheduleId) {
    const { data: overrides } = await db
      .from('schedule_exercise_overrides')
      .select('*, replacement:replacement_exercise_id(id,name,default_reps), original:original_block_exercise_id(id,exercise_id,custom_reps,lib:exercise_id(id,name))')
      .eq('schedule_id', scheduleId)
    return NextResponse.json({ overrides })
  }

  return NextResponse.json({ error: 'Missing playerId or scheduleId' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = createServerClient()
  const { type } = body

  if (type === 'player_template') {
    const { playerId, date, templateId, notes } = body
    const { data, error } = await db
      .from('player_overrides')
      .upsert({ player_id: playerId, override_date: date, template_id: templateId, notes }, { onConflict: 'player_id,override_date' })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ override: data })
  }

  if (type === 'player_skip') {
    const { playerId, exerciseId, reason, endsOn } = body
    const { data, error } = await db
      .from('player_exercise_skips')
      .insert({ player_id: playerId, exercise_id: exerciseId, reason, ends_on: endsOn ?? null, is_active: true })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ skip: data })
  }

  if (type === 'schedule_exercise') {
    const { scheduleId, originalBlockExerciseId, replacementExerciseId, customReps, customNotes } = body
    const { data, error } = await db
      .from('schedule_exercise_overrides')
      .upsert({ schedule_id: scheduleId, original_block_exercise_id: originalBlockExerciseId, replacement_exercise_id: replacementExerciseId, custom_reps: customReps, custom_notes: customNotes }, { onConflict: 'schedule_id,original_block_exercise_id' })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ override: data })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json()
  const db = createServerClient()
  const { type, id } = body

  if (type === 'player_template') {
    await db.from('player_overrides').delete().eq('id', id)
  } else if (type === 'player_skip') {
    await db.from('player_exercise_skips').update({ is_active: false }).eq('id', id)
  } else if (type === 'schedule_exercise') {
    await db.from('schedule_exercise_overrides').delete().eq('id', id)
  }

  return NextResponse.json({ ok: true })
}
