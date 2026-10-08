// FILE: app/api/coach/players/delete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { calculateAge } from '@/lib/age'

// PATCH — edit a player's details and/or change their team.
// team_id: undefined = leave team alone, '' or null = unassign, uuid = move to that team.
// self_guided: true/false — auto-built full-body workouts (lib/fullBodyWorkout.ts).
export async function PATCH(req: NextRequest) {
  const { id, name, pin, jersey_number, position, team_id, date_of_birth, self_guided } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin)))
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })

  const db = createServerClient()

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (pin !== undefined) updates.pin = pin
  if (jersey_number !== undefined) updates.jersey_number = jersey_number || null
  if (position !== undefined) updates.position = position || null
  if (date_of_birth !== undefined) updates.date_of_birth = date_of_birth || null
  if (self_guided !== undefined) updates.self_guided = self_guided === true

  // Only run the players UPDATE when there is something to update.
  // The team page's Add/Remove buttons send ONLY { id, team_id }, and an empty
  // update + .single() errors out before the team change below ever runs.
  let player
  if (Object.keys(updates).length > 0) {
    const { data, error } = await db.from('players').update(updates).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    player = data
  } else {
    const { data, error } = await db.from('players').select().eq('id', id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    player = data
  }

  if (team_id !== undefined) {
    const { error: delErr } = await db.from('player_teams').delete().eq('player_id', id)
    if (delErr) return NextResponse.json({ error: `Could not clear old team: ${delErr.message}` }, { status: 500 })

    if (team_id) {
      const { error: insErr } = await db
        .from('player_teams')
        .insert({ player_id: id, team_id, is_primary: true })
      if (insErr) return NextResponse.json({ error: `Could not assign team: ${insErr.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ player: { ...player, age: calculateAge(player.date_of_birth) } })
}

// DELETE — remove a player from the club (soft delete).
// Also clears their team assignments so they stop counting toward team totals.
export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = createServerClient()

  const { error } = await db.from('players').update({ is_active: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: ptErr } = await db.from('player_teams').delete().eq('player_id', id)
  if (ptErr) return NextResponse.json({ error: `Player removed, but team link not cleared: ${ptErr.message}` }, { status: 500 })

  return NextResponse.json({ ok: true })
}
