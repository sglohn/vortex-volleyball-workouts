// FILE: app/api/player/measurements/route.ts
//
// A player's measurements (Coach → Players, edit a player).
//
//   GET  ?playerId=   every dated row, newest first
//   POST { playerId, height_in, ... }   coaches only; saves today's row
//
// On a Combine Day the TV combine leaderboard reads her tries
// (combine_attempts), not this row. So when a coach changes a test she
// already has a number for today, the try is fixed too
// (lib/combineEntry.ts fixFromProfile) and the leaderboard shows the
// corrected number on its next refresh.
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { canAccessPlayer, signInAgain } from '@/lib/playerAuth'
import { getCoach } from '@/lib/coachAuth'
import { canSeePlayer, notYourTeam } from '@/lib/coachScope'
import { clubDateString } from '@/lib/clubTime'
import { fixFromProfile } from '@/lib/combineEntry'
import type { CombineMetricKey } from '@/lib/combine'

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  if (!playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })
  if (!(await canAccessPlayer(req, playerId))) return signInAgain()
  const db = createServerClient()
  const { data: measurements } = await db
    .from('measurements')
    .select('*')
    .eq('player_id', playerId)
    .order('measured_at', { ascending: false })
  return NextResponse.json({ measurements })
}

// Combine Day today: every test typed in is checked against her tries today,
// and a try that differs is fixed, so the TV leaderboard agrees.
async function fixCombineTries(db: ReturnType<typeof createServerClient>, playerId: string, incoming: Record<string, number | null>) {
  const typed: Partial<Record<CombineMetricKey, number>> = {}
  for (const [key, v] of Object.entries(incoming)) if (v != null && Number.isFinite(v) && v > 0) typed[key as CombineMetricKey] = v
  return fixFromProfile(db, playerId, typed)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { playerId, ...fields } = body
  if (!playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })
  // Only coaches record measurements (team coaches: their own players)
  const coach = await getCoach(req)
  if (!coach) return NextResponse.json({ error: 'Coach sign-in required' }, { status: 401 })

  const db = createServerClient()
  if (!(await canSeePlayer(db, coach, playerId))) return notYourTeam()
  const today = clubDateString()

  const KEYS = ['height_in','wingspan_in','standing_reach_in','standing_vertical_in','approach_vertical_in','acceleration_sec','pro_agility_sec','swing_velocity_mph']

  // Parse only the fields that were provided
  const incoming: Record<string, number | null> = {}
  for (const key of KEYS) {
    if (fields[key] !== undefined && fields[key] !== '') {
      incoming[key] = parseFloat(fields[key])
    }
  }

  if (Object.keys(incoming).length === 0) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  // Get the most recent row to (a) merge missing fields and (b) check if anything changed
  const { data: latest } = await db
    .from('measurements')
    .select('*')
    .eq('player_id', playerId)
    .order('measured_at', { ascending: false })
    .limit(1)
    .single()

  // Merge: start from latest values, overlay with incoming
  const merged: Record<string, number | null> = {}
  for (const key of KEYS) {
    merged[key] = incoming[key] !== undefined ? incoming[key] : (latest?.[key] ?? null)
  }

  // Check if anything actually changed vs the latest row
  const changed = !latest || KEYS.some(key => {
    const prev = latest[key] ?? null
    const next = merged[key] ?? null
    return prev !== next
  })

  if (!changed) {
    // Nothing changed — but a combine try today may still disagree with this
    // row (e.g. a number fixed here before tries were fixed too), so check
    const otherTryBetter = await fixCombineTries(db, playerId, incoming)
    return NextResponse.json({ measurement: latest, skipped: true, ...(otherTryBetter.length ? { otherTryBetter } : {}) })
  }

  // Check if there's already a row for today — update it rather than adding a duplicate
  const { data: todayRow } = await db
    .from('measurements')
    .select('id')
    .eq('player_id', playerId)
    .eq('measured_at', today)
    .single()

  let data, error

  if (todayRow?.id) {
    // Update today's row
    ;({ data, error } = await db
      .from('measurements')
      .update(merged)
      .eq('id', todayRow.id)
      .select()
      .single())
  } else {
    // Insert a new dated snapshot
    ;({ data, error } = await db
      .from('measurements')
      .insert({ player_id: playerId, ...merged, measured_at: today })
      .select()
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const otherTryBetter = await fixCombineTries(db, playerId, incoming)
  if (otherTryBetter.length) {
    const { data: fresh } = await db.from('measurements').select('*').eq('id', data.id).maybeSingle()
    return NextResponse.json({ measurement: fresh ?? data, otherTryBetter })
  }
  return NextResponse.json({ measurement: data })
}
