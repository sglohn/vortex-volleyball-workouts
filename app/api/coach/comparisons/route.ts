import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const db = createServerClient()

  // Get all active players with team info
  const [{ data: players }, { data: playerTeams }, { data: allMeasurements }] = await Promise.all([
    db.from('players').select('id, name, jersey_number, position, gender, age_group').eq('is_active', true).order('name'),
    db.from('player_teams').select('player_id, is_primary, teams(id, name, color, age_group)').eq('is_primary', true),
    db.from('measurements').select('player_id, height_in, standing_reach_in, approach_vertical_in, measured_at').order('measured_at', { ascending: false }),
  ])

  const teamMap = Object.fromEntries(
    (playerTeams ?? []).map(pt => [pt.player_id, pt.teams as unknown as { name: string; color: string; age_group?: string } | null])
  )

  // Get most recent measurement per player
  const measMap: Record<string, { height_in?: number; standing_reach_in?: number; approach_vertical_in?: number }> = {}
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
    const meas = measMap[p.id] ?? {}
    return {
      id: p.id,
      name: p.name,
      jersey_number: p.jersey_number,
      position: p.position,
      gender: p.gender,
      age_group: p.age_group ?? (team as { age_group?: string } | null)?.age_group,
      teamName: team?.name,
      teamColor: team?.color,
      height_in: meas.height_in ?? null,
      standing_reach_in: meas.standing_reach_in ?? null,
      approach_vertical_in: meas.approach_vertical_in ?? null,
    }
  })

  // Only return players that have at least height and approach touch
  const withMeasurements = enriched.filter(p => p.height_in && p.approach_vertical_in)

  return NextResponse.json({ players: withMeasurements })
}
