// FILE: app/api/coach/teams/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const db = createServerClient()
  const { data: teams } = await db
    .from('teams')
    .select('*')
    .eq('is_active', true)
    .order('age_group')

  // Enrich with player counts — ACTIVE players only.
  // The !inner join lets us filter on players.is_active so removed players
  // (soft-deleted) don't get counted, matching what the roster page shows.
  const enriched = await Promise.all((teams ?? []).map(async (team) => {
    const { count } = await db
      .from('player_teams')
      .select('player_id, players!inner(is_active)', { count: 'exact', head: true })
      .eq('team_id', team.id)
      .eq('players.is_active', true)
    return { ...team, playerCount: count ?? 0 }
  }))

  // Sort: regular teams first (by age_group), Open Gym last
  enriched.sort((a, b) => {
    if (a.is_open_gym && !b.is_open_gym) return 1
    if (!a.is_open_gym && b.is_open_gym) return -1
    return (a.age_group ?? '').localeCompare(b.age_group ?? '')
  })

  return NextResponse.json({ teams: enriched })
}

export async function POST(req: NextRequest) {
  const { name, age_group, color } = await req.json()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const db = createServerClient()
  const { data: team, error } = await db
    .from('teams')
    .insert({ name, age_group: age_group ?? null, color: color ?? '#4ade80' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ team })
}

export async function PUT(req: NextRequest) {
  const { id, name, age_group, color, is_active } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = createServerClient()
  const { data: team, error } = await db
    .from('teams')
    .update({ name, age_group, color, is_active })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ team })
}
