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

  // Convert string fields to numbers
  const numeric: Record<string, number | null> = {}
  for (const key of ['height_in', 'wingspan_in', 'standing_reach_in', 'standing_vertical_in', 'approach_vertical_in']) {
    numeric[key] = fields[key] ? parseFloat(fields[key]) : null
  }

  const { data, error } = await db
    .from('measurements')
    .insert({ player_id: playerId, ...numeric, measured_at: new Date().toISOString().split('T')[0] })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ measurement: data })
}
