// FILE: app/api/coach/teams/route.ts
//
//   GET          active teams with player counts and coach names
//                (coaches: ["Coach Emma Haddix", …]). Open to everyone (the
//                player sign-in screen and TV display use it, middleware.ts).
//                A signed-in team coach gets only their own teams, unless
//                ?all=1 (the sign-in screen and TV display ask for all).
//   POST / PUT   admins only (middleware.ts)
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCoach } from '@/lib/coachAuth'
import { inList } from '@/lib/coachScope'

export async function GET(req: NextRequest) {
  const db = createServerClient()
  let query = db
    .from('teams')
    .select('*')
    .eq('is_active', true)
  if (!req.nextUrl.searchParams.get('all')) {
    const coach = await getCoach(req)
    if (coach && !coach.isAdmin) query = query.in('id', inList(coach.teamIds))
  }
  const { data: teams } = await query.order('age_group')

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

  // Each team's coaches (team coach accounts, not admins), shown in small
  // type under the team name so players and coaches can find their team by
  // either one. Names only.
  const coachesByTeam = new Map<string, string[]>()
  if (enriched.length) {
    const { data: links } = await db
      .from('coach_teams')
      .select('team_id, coaches!inner(name, role, is_active)')
      .in('team_id', enriched.map(t => t.id))
      .eq('coaches.is_active', true)
      .eq('coaches.role', 'coach')
    type C = { name: string }
    for (const row of (links ?? []) as unknown as { team_id: string; coaches: C | C[] | null }[]) {
      const c = Array.isArray(row.coaches) ? row.coaches[0] : row.coaches
      if (!c?.name) continue
      const list = coachesByTeam.get(row.team_id) ?? []
      list.push(c.name)
      coachesByTeam.set(row.team_id, list)
    }
  }
  const withCoaches = enriched.map(team => ({
    ...team,
    coaches: (coachesByTeam.get(team.id) ?? []).sort((a, b) => a.localeCompare(b)),
  }))

  // Sort: regular teams first (by age_group), Open Gym last
  withCoaches.sort((a, b) => {
    if (a.is_open_gym && !b.is_open_gym) return 1
    if (!a.is_open_gym && b.is_open_gym) return -1
    return (a.age_group ?? '').localeCompare(b.age_group ?? '') || a.name.localeCompare(b.name)
  })

  return NextResponse.json({ teams: withCoaches })
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
