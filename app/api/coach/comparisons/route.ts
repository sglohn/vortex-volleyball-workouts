import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { calculateAge } from '@/lib/age'

export async function GET() {
  const db = createServerClient()

  const { data: players, error: pErr } = await db
    .from('players')
    .select('id, name, jersey_number, position, date_of_birth')
    .eq('is_active', true)
    .order('name')

  if (pErr) return NextResponse.json({ error: pErr.message, players: [] })

  // teams table has: name, color, age_group — no gender column
  const { data: playerTeams } = await db
    .from('player_teams')
    .select('player_id, teams(id, name, color, age_group)')
    .eq('is_primary', true)

  const teamMap: Record<string, { name: string; color: string; age_group?: string }> = {}
  for (const pt of (playerTeams ?? [])) {
    if (pt.teams) {
      teamMap[pt.player_id] = pt.teams as unknown as { name: string; color: string; age_group?: string }
    }
  }

  const { data: allMeasurements, error: mErr } = await db
    .from('measurements')
    .select('player_id, height_in, standing_reach_in, approach_vertical_in, measured_at')
    .order('measured_at', { ascending: false })

  if (mErr) return NextResponse.json({ error: mErr.message, players: [] })

  const measMap: Record<string, { height_in: number | null; standing_reach_in: number | null; approach_vertical_in: number | null }> = {}
  for (const m of (allMeasurements ?? [])) {
    if (!measMap[m.player_id]) {
      measMap[m.player_id] = {
        height_in: m.height_in,
        standing_reach_in: m.standing_reach_in,
        approach_vertical_in: m.approach_vertical_in,
      }
    }
  }

  const enriched = (players ?? []).map(p => {
    const team = teamMap[p.id]
    const meas = measMap[p.id] ?? { height_in: null, standing_reach_in: null, approach_vertical_in: null }
    const teamName = team?.name ?? 'No team'
    // Derive gender from team name — "boy" anywhere in name = M, else F
    const gender = teamName.toLowerCase().includes('boy') ? 'M' : 'F'
    // Team's assigned age group — still used for "My team" comparisons
    const age_group = team?.age_group ?? ''
    // Individual computed age from date of birth — used for "same age" comparisons
    const age = calculateAge(p.date_of_birth)
    return {
      id: p.id,
      name: p.name,
      jersey_number: p.jersey_number,
      position: p.position,
      gender,
      age_group,
      age,
      teamName,
      teamColor: team?.color ?? '#888',
      height_in: meas.height_in,
      standing_reach_in: meas.standing_reach_in,
      approach_vertical_in: meas.approach_vertical_in,
    }
  })

  const withMeasurements = enriched.filter(p => p.height_in && p.approach_vertical_in)

  return NextResponse.json({
    players: withMeasurements,
    _debug: {
      totalPlayers: players?.length ?? 0,
      totalMeasurements: allMeasurements?.length ?? 0,
      withBothMeasurements: withMeasurements.length,
      teamMapSize: Object.keys(teamMap).length,
    }
  })
}
