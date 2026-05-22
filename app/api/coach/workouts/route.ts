import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const db = createServerClient()
  const { data: workouts } = await db
    .from('workouts')
    .select('*, exercises(*)')
    .order('created_at', { ascending: false })

  return NextResponse.json({ workouts: workouts ?? [] })
}

export async function POST(req: NextRequest) {
  const { title, description, is_active, exercises } = await req.json()
  const db = createServerClient()

  // If setting active, deactivate all others
  if (is_active) await db.from('workouts').update({ is_active: false }).neq('id', 'none')

  const { data: workout, error } = await db
    .from('workouts')
    .insert({ title, description, is_active })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert exercises
  if (exercises?.length) {
    const rows = exercises.map((ex: Record<string, unknown>, i: number) => ({
      ...ex,
      workout_id: workout.id,
      sort_order: i,
    }))
    await db.from('exercises').insert(rows)
  }

  const { data: full } = await db.from('workouts').select('*, exercises(*)').eq('id', workout.id).single()
  return NextResponse.json({ workout: full })
}

export async function PUT(req: NextRequest) {
  const { id, title, description, is_active, exercises } = await req.json()
  const db = createServerClient()

  if (is_active) await db.from('workouts').update({ is_active: false }).neq('id', id)

  await db.from('workouts').update({ title, description, is_active, updated_at: new Date().toISOString() }).eq('id', id)

  // Replace exercises
  await db.from('exercises').delete().eq('workout_id', id)
  if (exercises?.length) {
    const rows = exercises.map((ex: Record<string, unknown>, i: number) => ({
      ...ex,
      id: undefined,
      workout_id: id,
      sort_order: i,
    }))
    await db.from('exercises').insert(rows)
  }

  const { data: full } = await db.from('workouts').select('*, exercises(*)').eq('id', id).single()
  return NextResponse.json({ workout: full })
}

export async function PATCH(req: NextRequest) {
  const { id, is_active } = await req.json()
  const db = createServerClient()
  if (is_active) await db.from('workouts').update({ is_active: false }).neq('id', id)
  await db.from('workouts').update({ is_active }).eq('id', id)
  return NextResponse.json({ ok: true })
}
