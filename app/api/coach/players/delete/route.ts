import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function PATCH(req: NextRequest) {
  const { id, name, pin, jersey_number, position, team_id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin)))
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
  const db = createServerClient()
  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (pin !== undefined) updates.pin = pin
  if (jersey_number !== undefined) updates.jersey_number = jersey_number || null
  if (position !== undefined) updates.position = position || null
  const { data: player, error } = await db.from('players').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (team_id !== undefined) {
    await db.from('player_teams').delete().eq('player_id', id)
    if (team_id) await db.from('player_teams').insert({ player_id: id, team_id, is_primary: true })
  }
  return NextResponse.json({ player })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const db = createServerClient()
  const { error } = await db.from('players').update({ is_active: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
