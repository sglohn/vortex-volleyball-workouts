import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const db = createServerClient()
  const { data: teams } = await db
    .from('teams')
    .select('*')
    .eq('is_active', true)
    .order('age_group')

  // Enrich with player counts
  const enriched = await Promise.all((teams ?? []).map(async (team) => {
    const { count } = await db
      .from('player_teams')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', team.id)
    return { ...team, playerCount: count ?? 0 }
  }))

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
