// FILE: app/api/coach/join-workout/route.ts
//
// A team coach joins in on one of their team's workouts.
//   POST { teamId }  → starts (or resumes) today's workout for that team on
//                      the coach's own workout profile (lib/coachWorkout.ts)
//                      and answers like /api/checkin, plus coach: true.
//
// Team coaches only (admins don't join in), and only for their own teams.
// The sign-in screen calls this right after the coach's PIN was accepted,
// when they tap "Join today's workout".

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCoach } from '@/lib/coachAuth'
import { startWorkout } from '@/lib/checkin'
import { coachWorkoutProfile } from '@/lib/coachWorkout'

export async function POST(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach?.id || coach.setup) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  if (coach.role !== 'coach') return NextResponse.json({ error: 'Joining a workout is for team coaches' }, { status: 403 })

  const { teamId } = await req.json().catch(() => ({}))
  if (typeof teamId !== 'string' || !coach.teamIds.includes(teamId)) {
    return NextResponse.json({ error: 'You can only join your own team\'s workout' }, { status: 403 })
  }

  const db = createServerClient()
  const { data: team } = await db.from('teams').select('id, name, age_group, is_active').eq('id', teamId).maybeSingle()
  if (!team || !team.is_active) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  let profile
  try {
    profile = await coachWorkoutProfile(db, coach, team)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const result = await startWorkout(db, profile, teamId)
  return NextResponse.json({ ...result.body, playerId: profile.id, coach: true }, { status: result.status })
}
