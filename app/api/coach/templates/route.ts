// FILE: app/api/coach/templates/route.ts
//
// Workout templates. A Combine Day template (is_combine, lib/combine.ts)
// keeps only its warm-up block: players enter their test numbers instead of
// lifting. combine_metrics lists the tests it includes (null = all).
// Combine Day is volleyball only (FEATURES.measurements); on lacrosse the
// two fields are left alone.
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { asBand } from '@/lib/loads'
import { FEATURES } from '@/lib/features'
import { cleanCombineMetrics } from '@/lib/combine'
import { isWarmupLabel } from '@/lib/warmup'

// Target bar speed from the builder: blank → null, otherwise a number in m/s
function toSpeed(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(String(v))
  return isFinite(n) && n > 0 ? n : null
}

// Coach's recommended band for a band exercise ('hip_blue', lib/loads.ts).
// Only sent when one is picked, so saving still works for workouts with no
// band picks before the bands migration has been run.
function bandField(v: unknown): { recommended_band?: string } {
  const band = asBand(v)
  return band ? { recommended_band: band } : {}
}

// A block as the template builder sends it
interface BlockInput { block_label: string; sets: number; exercises?: Record<string, unknown>[] }

// Combine Day fields to save (volleyball only)
function combineFields(isCombine: unknown, metrics: unknown): { is_combine?: boolean; combine_metrics?: string[] | null } {
  if (!FEATURES.measurements) return {}
  const on = isCombine === true
  return { is_combine: on, combine_metrics: on ? cleanCombineMetrics(metrics) : null }
}

// A Combine Day has no lifting, so only its warm-up block is kept
function blocksToSave(isCombine: unknown, blocks: BlockInput[] | undefined): BlockInput[] | undefined {
  if (!blocks || !FEATURES.measurements || isCombine !== true) return blocks
  return blocks.filter(b => isWarmupLabel(b.block_label))
}

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
  const body = await req.json()
  const { name, description, phase_type, warmup_notes } = body
  const blocks = blocksToSave(body.is_combine, body.blocks)
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const db = createServerClient()

  const { data: template, error } = await db
    .from('workout_templates')
    .insert({ name, description, phase_type, warmup_notes, ...combineFields(body.is_combine, body.combine_metrics) })
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
          target_velocity_min: toSpeed(ex.target_velocity_min),
          target_velocity_max: toSpeed(ex.target_velocity_max),
          ...bandField(ex.recommended_band),
          sort_order: ei,
        }))
        const { error: exErr } = await db.from('template_block_exercises').insert(exerciseRows)
        if (exErr) return NextResponse.json({ error: `Exercises in block ${block.block_label} not saved: ${exErr.message}` }, { status: 500 })
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
  const body = await req.json()
  const { id, name, description, phase_type, warmup_notes } = body
  const blocks = blocksToSave(body.is_combine, body.blocks)
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = createServerClient()

  const { error: updateError } = await db.from('workout_templates').update({
    name, description, phase_type, warmup_notes,
    ...combineFields(body.is_combine, body.combine_metrics),
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

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
          target_velocity_min: toSpeed(ex.target_velocity_min),
          target_velocity_max: toSpeed(ex.target_velocity_max),
          ...bandField(ex.recommended_band),
          sort_order: ei,
        }))
        const { error: exErr } = await db.from('template_block_exercises').insert(exerciseRows)
        if (exErr) return NextResponse.json({ error: `Exercises in block ${block.block_label} not saved: ${exErr.message}` }, { status: 500 })
      }
    }
  }

  const { data: full } = await db.from('workout_templates').select('*').eq('id', id).single()
  return NextResponse.json({ template: full })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = createServerClient()

  // template_blocks cascade deletes template_block_exercises
  // team_schedule.template_id goes SET NULL (so schedule entries stay, just lose the template ref)
  const { error } = await db
    .from('workout_templates')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
