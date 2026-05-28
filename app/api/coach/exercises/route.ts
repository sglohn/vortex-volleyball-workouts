import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const db = createServerClient()
  const category = req.nextUrl.searchParams.get('category')

  let query = db.from('exercise_library').select('id, name, category, default_sets, default_reps, coaching_notes, demo_url, demo_image_url, start_image_url, end_image_url, logs_weight, logs_velocity, is_active').eq('is_active', true).order('name')
  if (category) query = query.eq('category', category)

  const { data: exercises, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ exercises: exercises ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    name, category, default_sets, default_reps,
    logs_weight, logs_velocity, coaching_notes,
    demo_url, demo_image_url,
  } = body

  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const db = createServerClient()
  const { data: exercise, error } = await db
    .from('exercise_library')
    .insert({
      name,
      category: category ?? null,
      default_sets: default_sets ?? 3,
      default_reps: default_reps ?? null,
      logs_weight: logs_weight ?? false,
      logs_velocity: logs_velocity ?? false,
      coaching_notes: coaching_notes ?? null,
      demo_url: demo_url ?? null,
      demo_image_url: demo_image_url ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ exercise })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = createServerClient()
  const { data: exercise, error } = await db
    .from('exercise_library')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ exercise })
}
