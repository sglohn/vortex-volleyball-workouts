import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const db = createServerClient()
  const teamId = req.nextUrl.searchParams.get('teamId')
  const weekOf = req.nextUrl.searchParams.get('weekOf') // YYYY-MM-DD of Monday

  let query = db
    .from('team_schedule')
    .select('*, teams(name, age_group, color), workout_templates(name, phase_type)')
    .order('scheduled_date')

  if (teamId) query = query.eq('team_id', teamId)

  if (weekOf) {
    // Parse as local date by appending T00:00:00 to avoid UTC offset shifting the day
    const start = new Date(weekOf + 'T00:00:00')
    const end = new Date(weekOf + 'T00:00:00')
    end.setDate(end.getDate() + 6)
    query = query
      .gte('scheduled_date', start.toISOString().split('T')[0])
      .lte('scheduled_date', end.toISOString().split('T')[0])
  }

  const { data: schedule, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ schedule: schedule ?? [] })
}

export async function POST(req: NextRequest) {
  const { teamId, templateId, scheduledDate, notes } = await req.json()
  if (!teamId || !scheduledDate) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const db = createServerClient()

  // Upsert — one workout per team per day
  const { data: entry, error } = await db
    .from('team_schedule')
    .upsert({
      team_id: teamId,
      template_id: templateId ?? null,
      scheduled_date: scheduledDate,
      notes: notes ?? null,
    }, { onConflict: 'team_id,scheduled_date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = createServerClient()
  await db.from('team_schedule').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
