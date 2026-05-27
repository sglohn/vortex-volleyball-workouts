import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  if (!playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })
  const db = createServerClient()
  const { data: measurements } = await db
    .from('measurements')
    .select('*')
    .eq('player_id', playerId)
    .order('measured_at', { ascending: false })
  return NextResponse.json({ measurements })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { playerId, ...fields } = body
  if (!playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })

  const db = createServerClient()
  const today = new Date().toISOString().split('T')[0]

  const KEYS = ['height_in','wingspan_in','standing_reach_in','standing_vertical_in','approach_vertical_in']

  // Parse only the fields that were provided
  const incoming: Record<string, number | null> = {}
  for (const key of KEYS) {
    if (fields[key] !== undefined && fields[key] !== '') {
      incoming[key] = parseFloat(fields[key])
    }
  }

  if (Object.keys(incoming).length === 0) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  // Get the most recent row to (a) merge missing fields and (b) check if anything changed
  const { data: latest } = await db
    .from('measurements')
    .select('*')
    .eq('player_id', playerId)
    .order('measured_at', { ascending: false })
    .limit(1)
    .single()

  // Merge: start from latest values, overlay with incoming
  const merged: Record<string, number | null> = {}
  for (const key of KEYS) {
    merged[key] = incoming[key] !== undefined ? incoming[key] : (latest?.[key] ?? null)
  }

  // Check if anything actually changed vs the latest row
  const changed = !latest || KEYS.some(key => {
    const prev = latest[key] ?? null
    const next = merged[key] ?? null
    return prev !== next
  })

  if (!changed) {
    // Nothing changed — just return the existing row
    return NextResponse.json({ measurement: latest, skipped: true })
  }

  // Check if there's already a row for today — update it rather than adding a duplicate
  const { data: todayRow } = await db
    .from('measurements')
    .select('id')
    .eq('player_id', playerId)
    .eq('measured_at', today)
    .single()

  let data, error

  if (todayRow?.id) {
    // Update today's row
    ;({ data, error } = await db
      .from('measurements')
      .update(merged)
      .eq('id', todayRow.id)
      .select()
      .single())
  } else {
    // Insert a new dated snapshot
    ;({ data, error } = await db
      .from('measurements')
      .insert({ player_id: playerId, ...merged, measured_at: today })
      .select()
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ measurement: data })
}
