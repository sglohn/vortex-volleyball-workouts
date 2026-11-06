// FILE: app/api/coach/comparisons/groups/route.ts
//
// GET  admins only (not in COACH_ROUTES, middleware.ts). Volleyball only
//      (lib/features.ts, under /api/coach/comparisons).
//
// Every active player on a team (primary team; not Open Gym teams, not
// coaches' workout profiles) with what Coach → Comparisons → Groups groups
// by (team, age group, age, position, team level, girls/boys) and her
// current numbers: her latest measurements row, the same numbers Coach →
// Players and the athleticism score use. Verticals are touch minus that
// row's standing reach. Players with no numbers are included so each group
// can show "tested X of Y". The page does the grouping and averaging.
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { calculateAge } from '@/lib/age'
import { verticalFrom } from '@/lib/combine'
import { buildPopulationStats, calculateAthleticismScore, type AthleticismInputs } from '@/lib/athleticism'
import { cleanTeamLevel } from '@/lib/teamLevel'

const PAGE_ROWS = 1000

type PlayerJoin = {
  id: string; name: string; is_active: boolean; gender?: string | null; coach_id?: string | null
  position?: string | null; date_of_birth?: string | null; jersey_number?: string | null
}
type TeamJoin = {
  id: string; name: string; color?: string | null; age_group?: string | null
  level?: string | null; is_active?: boolean | null; is_open_gym?: boolean | null
}
type MeasRow = {
  player_id: string; measured_at: string | null
  height_in: number | null; wingspan_in: number | null; standing_reach_in: number | null
  standing_vertical_in: number | null; approach_vertical_in: number | null
  acceleration_sec: number | null; pro_agility_sec: number | null; swing_velocity_mph: number | null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function GET() {
  const db = createServerClient()

  // Players on their primary team
  const players: { p: PlayerJoin; t: TeamJoin }[] = []
  const seen = new Set<string>()
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await db
      .from('player_teams')
      .select('player_id, players(*), teams(*)')
      .eq('is_primary', true)
      .order('player_id')
      .range(from, from + PAGE_ROWS - 1)
    if (error) return NextResponse.json({ error: error.message, players: [] }, { status: 500 })
    const rows = data ?? []
    for (const r of rows) {
      const p = one(r.players as unknown as PlayerJoin | PlayerJoin[] | null)
      const t = one(r.teams as unknown as TeamJoin | TeamJoin[] | null)
      if (!p || !t || !p.is_active || p.coach_id || !t.is_active || t.is_open_gym || seen.has(p.id)) continue
      seen.add(p.id)
      players.push({ p, t })
    }
    if (rows.length < PAGE_ROWS) break
  }

  // Each player's latest measurements row (same as Coach → Players)
  const latest = new Map<string, MeasRow>()
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await db
      .from('measurements')
      .select('player_id, measured_at, height_in, wingspan_in, standing_reach_in, standing_vertical_in, approach_vertical_in, acceleration_sec, pro_agility_sec, swing_velocity_mph')
      .order('measured_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_ROWS - 1)
    if (error) return NextResponse.json({ error: error.message, players: [] }, { status: 500 })
    const rows = (data ?? []) as MeasRow[]
    for (const r of rows) if (r.player_id && !latest.has(r.player_id)) latest.set(r.player_id, r)
    if (rows.length < PAGE_ROWS) break
  }

  // Athleticism score against the whole club's latest numbers (as on Players)
  const inputsOf = (m: MeasRow | undefined): AthleticismInputs => ({
    height_in: num(m?.height_in),
    standing_reach_in: num(m?.standing_reach_in),
    standing_vertical_in: num(m?.standing_vertical_in),
    approach_vertical_in: num(m?.approach_vertical_in),
    acceleration_sec: num(m?.acceleration_sec),
    pro_agility_sec: num(m?.pro_agility_sec),
    swing_velocity_mph: num(m?.swing_velocity_mph),
  })
  const population = buildPopulationStats([...latest.values()].map(inputsOf))

  const list = players.map(({ p, t }) => {
    const m = latest.get(p.id)
    const reach = num(m?.standing_reach_in)
    const block = num(m?.standing_vertical_in)
    const approach = num(m?.approach_vertical_in)
    return {
      id: p.id,
      name: p.name,
      gender: p.gender === 'M' ? 'M' : 'F',
      position: p.position || null,
      age: calculateAge(p.date_of_birth),
      teamId: t.id,
      teamName: t.name,
      teamColor: t.color ?? '#888',
      ageGroup: t.age_group || null,
      level: cleanTeamLevel(t.level),
      measuredAt: m?.measured_at ?? null,
      metrics: {
        height_in: num(m?.height_in),
        wingspan_in: num(m?.wingspan_in),
        standing_reach_in: reach,
        block_touch: block,
        standing_vert: verticalFrom(block, reach),
        approach_touch: approach,
        max_vert: verticalFrom(approach, reach),
        acceleration_sec: num(m?.acceleration_sec),
        pro_agility_sec: num(m?.pro_agility_sec),
        swing_velocity_mph: num(m?.swing_velocity_mph),
        score: m ? calculateAthleticismScore(inputsOf(m), population).score : null,
      },
    }
  })

  list.sort((a, b) => a.name.localeCompare(b.name))
  return NextResponse.json({ players: list })
}
