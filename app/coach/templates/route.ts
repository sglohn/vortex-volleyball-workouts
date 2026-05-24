import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const db = createServerClient()
  const id = req.nextUrl.searchParams.get('id')

  if (id) {
    // Single template with full block/exercise detail
    const { data: template } = await db
      .from('workout_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: blocks } = await db
      .from('template_blocks')
      .select('*')
      .eq('template_id', id)
      .order('sort_order')

    const enrichedBlocks = await Promise.all((blocks ?? []).map(async (block) => {
      const { data: blockExercises } = await db
        .from('template_block_exercises')
        .select('*, exercise_library(*)')
        .eq('block_id', block.id)
        .order('sort_order')
      return { ...block, exercises: blockExercises ?? [] }
    }))

    return NextResponse.json({ template: { ...template, blocks: enrichedBlocks } })
  }

  // All templates
  const { data: templates } = await db
    .from('workout_templates')
    .select('*')
    .eq('is_active', true)
    .order('name')

  return NextResponse.json({ templates: templates ?? [] })
}

export async function POST(req: NextRequest) {
  const { name, description, phase_type, warmup_notes, blocks } = await req.json()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const db = createServerClient()

  const { data: template, error } = await db
    .from('workout_templates')
    .insert({ name, description, phase_type, warmup_notes })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert blocks and their exercises
  if (blocks?.length) {
    for (let bi = 0; bi < blocks.length; bi++) {
      const block = blocks[bi]
      const { data: newBlock } = await db
        .from('template_blocks')
        .insert({ template_id: template.id, block_label: block.block_label, sets: block.sets, sort_order: bi })
        .select()
        .single()

      if (newBlock && block.exercises?.length) {
        const exerciseRows = block.exercises.map((ex: Record<string, unknown>, ei: number) => ({
          block_id: newBlock.id,
          exercise_id: ex.exercise_id,
          custom_reps: ex.custom_reps ?? null,
          custom_notes: ex.custom_notes ?? null,
          sort_order: ei,
        }))
        await db.from('template_block_exercises').insert(exerciseRows)
      }
    }
  }

  // Return full template
  const { data: full } = await db
    .from('workout_templates')
    .select('*')
    .eq('id', template.id)
    .single()

  return NextResponse.json({ template: full })
}

export async function PUT(req: NextRequest) {
  const { id, name, description, phase_type, warmup_notes, blocks } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = createServerClient()

  await db.from('workout_templates').update({
    name, description, phase_type, warmup_notes,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  // Replace blocks entirely
  if (blocks !== undefined) {
    // Delete old blocks (cascade deletes exercises)
    await db.from('template_blocks').delete().eq('template_id', id)

    for (let bi = 0; bi < blocks.length; bi++) {
      const block = blocks[bi]
      const { data: newBlock } = await db
        .from('template_blocks')
        .insert({ template_id: id, block_label: block.block_label, sets: block.sets, sort_order: bi })
        .select()
        .single()

      if (newBlock && block.exercises?.length) {
        const exerciseRows = block.exercises.map((ex: Record<string, unknown>, ei: number) => ({
          block_id: newBlock.id,
          exercise_id: ex.exercise_id,
          custom_reps: ex.custom_reps ?? null,
          custom_notes: ex.custom_notes ?? null,
          sort_order: ei,
        }))
        await db.from('template_block_exercises').insert(exerciseRows)
      }
    }
  }

  const { data: full } = await db.from('workout_templates').select('*').eq('id', id).single()
  return NextResponse.json({ template: full })
}
