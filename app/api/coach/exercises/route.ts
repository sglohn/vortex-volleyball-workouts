// FILE: app/api/coach/exercises/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { asEquipment } from '@/lib/loads'
import { FEATURES } from '@/lib/features'

// self_guided_roles: which self-guided workout spots an exercise can fill
// (lib/fullBodyWorkout.ts), e.g. ['quad_main', 'push_secondary'].
const ROLE_RE = /^(quad|hamstring|push|pull)_(main|secondary|easier)$/
function asRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v): v is string => typeof v === 'string' && ROLE_RE.test(v)))]
}

const BASE_COLUMNS = 'id, name, category, default_sets, default_reps, coaching_notes, demo_url, demo_image_url, start_image_url, end_image_url, logs_weight, logs_velocity, equipment, is_active'

export async function GET(req: NextRequest) {
  const db = createServerClient()
  const category = req.nextUrl.searchParams.get('category')

  async function run(columns: string) {
    let query = db.from('exercise_library').select(columns).eq('is_active', true).order('name')
    if (category) query = query.eq('category', category)
    return query
  }

  // Falls back to the old columns if the self-guided migration hasn't been run yet
  let { data: exercises, error } = await run(`${BASE_COLUMNS}, self_guided_roles`)
  if (error) ({ data: exercises, error } = await run(BASE_COLUMNS))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ exercises: exercises ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    name, category, default_sets, default_reps,
    logs_weight, logs_velocity, coaching_notes,
    demo_url, demo_image_url, equipment, self_guided_roles,
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
      logs_velocity: FEATURES.vbt ? (logs_velocity ?? false) : false,
      equipment: asEquipment(equipment),
      coaching_notes: coaching_notes ?? null,
      demo_url: demo_url ?? null,
      demo_image_url: demo_image_url ?? null,
      ...(Array.isArray(self_guided_roles) && self_guided_roles.length ? { self_guided_roles: asRoles(self_guided_roles) } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ exercise })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  // No bar speed logging when VBT is off (lib/features.ts)
  if (!FEATURES.vbt && 'logs_velocity' in updates) updates.logs_velocity = false
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  // '' or anything unexpected → not set
  if ('equipment' in updates) updates.equipment = asEquipment(updates.equipment)
  if ('self_guided_roles' in updates) updates.self_guided_roles = asRoles(updates.self_guided_roles)

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

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = createServerClient()

  // Fetch image URLs before deleting so we can clean up storage
  const { data: exercise } = await db
    .from('exercise_library')
    .select('start_image_url, end_image_url, demo_image_url')
    .eq('id', id)
    .single()

  // Delete storage files — all objects under exercises/{id}/
  if (exercise) {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const storageClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: listed } = await storageClient.storage
        .from('exercise-media')
        .list(`exercises/${id}`)

      if (listed && listed.length > 0) {
        const paths = listed.map((f: { name: string }) => `exercises/${id}/${f.name}`)
        await storageClient.storage.from('exercise-media').remove(paths)
      }
    } catch {
      // Storage cleanup failure should not block the DB delete
    }
  }

  // Hard delete — template_block_exercises, overrides, skips all cascade
  const { error } = await db
    .from('exercise_library')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
