import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const db = createServerClient()
  const teamId = req.nextUrl.searchParams.get('teamId')

  // Get all active health reports
  let query = db
    .from('health_reports')
    .select('*, players!inner(id, name, jersey_number)')
    .in('status', ['active', 'monitoring'])
    .order('reported_at', { ascending: false })

  if (teamId) {
    // Filter by team — join through player_teams
    const { data: teamPlayers } = await db
      .from('player_teams')
      .select('player_id')
      .eq('team_id', teamId)

    const playerIds = teamPlayers?.map(p => p.player_id) ?? []
    if (playerIds.length) {
      query = query.in('player_id', playerIds)
    }
  }

  const { data: reports, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Separate into unconfirmed (needs review) and confirmed
  const unconfirmed = (reports ?? []).filter(r => !r.confirmed_by_coach)
  const active = (reports ?? []).filter(r => r.confirmed_by_coach)

  return NextResponse.json({ unconfirmed, active, total: reports?.length ?? 0 })
}
