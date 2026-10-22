// FILE: app/api/player/day-unlock/route.ts   (new file)
//
// A player asks an admin to unlock her next week-plan Day today
// (Bruisers Lacrosse, FEATURES.weekPlan; hidden on Vortex, lib/features.ts).
//
// Only offered when she already finished a workout today that she started
// on an earlier day: she did the sets then, but forgot to tap Finish until
// she came back. See lib/weekPlan.ts. Admins answer in Coach -> Requests
// (app/api/coach/unlock-requests).
//
//   POST (x-player-pass header) → { week }   the sign-in screen's week card,
//                                             now showing unlock: 'pending'
//
// Uses the player's pass from sign-in (app/api/checkin), so no player ID is
// trusted from the browser.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { PLAYER_PASS_HEADER, signInAgain, verifyPlayerPass } from '@/lib/playerAuth'
import { clubDateString } from '@/lib/clubTime'
import { loadPlayerWeek, publicWeek } from '@/lib/weekPlan'

export async function POST(req: NextRequest) {
  const playerId = await verifyPlayerPass(req.headers.get(PLAYER_PASS_HEADER))
  if (!playerId) return signInAgain()

  const db = createServerClient()
  const { data: playerTeam } = await db
    .from('player_teams')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('is_primary', true)
    .maybeSingle()
  const teamId = (playerTeam?.team_id as string | undefined) ?? null
  if (!teamId) return NextResponse.json({ error: 'You aren’t on a team yet. Ask your coach.' }, { status: 400 })

  const today = clubDateString()
  let week
  try {
    week = await loadPlayerWeek(db, playerId, teamId, today)
  } catch (e) {
    return NextResponse.json({ error: 'Could not load this week’s workouts: ' + (e as Error).message }, { status: 500 })
  }

  // Already asked (or answered): just show where it stands
  if (week.unlock) return NextResponse.json({ week: publicWeek(week) })

  if (week.status !== 'done_today' || !week.lateFinish || !week.nextSlot) {
    return NextResponse.json({ error: 'There’s nothing to unlock right now.', week: publicWeek(week) }, { status: 409 })
  }

  const { error } = await db.from('day_unlock_requests').insert({
    player_id: playerId,
    team_id: teamId,
    week_start: week.weekStart,
    week_slot: week.nextSlot,
    finished_session_id: week.lateFinish.sessionId,
    status: 'pending',
  })
  // 23505: a second tap already made it
  if (error && error.code !== '23505') {
    return NextResponse.json({ error: 'Unlock requests aren’t set up yet. Ask your coach.' }, { status: 503 })
  }

  return NextResponse.json({ week: publicWeek(await loadPlayerWeek(db, playerId, teamId, today)) })
}
