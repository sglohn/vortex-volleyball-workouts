import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const db = createServerClient()
  const teamId = req.nextUrl.searchParams.get('teamId')

  let query = db
    .from('training_phases')
    .select('*, teams(name, age_group, color)')
    .order('starts_on', { ascending: false })

  if (teamId) query = query.eq('team_id', teamId)

  const { data: phases, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ phases: phases ?? [] })
}

export async function POST(req: NextRequest) {
  const { teamId, phaseType, name, description, intensityTarget, startsOn, endsOn } = await req.json()
  if (!teamId || !phaseType || !name || !startsOn || !endsOn) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const db = createServerClient()
  const { data: phase, error } = await db
    .from('training_phases')
    .insert({
      team_id: teamId,
      phase_type: phaseType,
      name,
      description: description ?? null,
      intensity_target: intensityTarget ?? null,
      starts_on: startsOn,
      ends_on: endsOn,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ phase })
}

export async function PUT(req: NextRequest) {
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = createServerClient()
  const { data: phase, error } = await db
    .from('training_phases')
    .update({
      phase_type: updates.phaseType,
      name: updates.name,
      description: updates.description,
      intensity_target: updates.intensityTarget,
      starts_on: updates.startsOn,
      ends_on: updates.endsOn,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ phase })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = createServerClient()
  await db.from('training_phases').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
