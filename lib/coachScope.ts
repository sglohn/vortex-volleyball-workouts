// FILE: lib/coachScope.ts
//
// What a signed-in coach is allowed to see.
//
// Admins see the whole club. A coach (role 'coach') only sees the teams
// they're on (coach_teams) and the players on those teams (player_teams,
// any team link, not just the player's main team).
//
// API routes use these after middleware.ts has already checked that the
// request is from a signed-in coach or admin, and turned coaches away from
// admin-only routes.

import { NextResponse } from 'next/server'
import type { CoachIdentity } from '@/lib/coachAuth'
import { createServerClient } from '@/lib/supabase'

type Db = ReturnType<typeof createServerClient>

/** Players on any of these teams */
export async function playerIdsOnTeams(db: Db, teamIds: string[]): Promise<string[]> {
  if (!teamIds.length) return []
  const { data } = await db.from('player_teams').select('player_id').in('team_id', teamIds)
  return [...new Set((data ?? []).map(r => r.player_id as string))]
}

/**
 * The players this person may see: null = everyone (admin), otherwise a list
 * (possibly empty, for a coach who isn't on a team yet).
 */
export async function visiblePlayerIds(db: Db, coach: CoachIdentity): Promise<string[] | null> {
  if (coach.isAdmin) return null
  return playerIdsOnTeams(db, coach.teamIds)
}

/** The teams this person may see: null = all (admin) */
export function visibleTeamIds(coach: CoachIdentity): string[] | null {
  return coach.isAdmin ? null : coach.teamIds
}

export function canSeeTeam(coach: CoachIdentity, teamId: string | null | undefined): boolean {
  if (coach.isAdmin) return true
  return !!teamId && coach.teamIds.includes(teamId)
}

export async function canSeePlayer(db: Db, coach: CoachIdentity, playerId: string | null | undefined): Promise<boolean> {
  if (coach.isAdmin) return true
  if (!playerId || !coach.teamIds.length) return false
  const { count } = await db
    .from('player_teams')
    .select('player_id', { count: 'exact', head: true })
    .eq('player_id', playerId)
    .in('team_id', coach.teamIds)
  return (count ?? 0) > 0
}

/** Keeps only the ids in `allowed` (null = keep all) */
export function onlyAllowed(ids: string[], allowed: string[] | null): string[] {
  if (!allowed) return ids
  const ok = new Set(allowed)
  return ids.filter(id => ok.has(id))
}

/** For .in('player_id', …): an empty list would match nothing anyway, but PostgREST needs one value */
export function inList(ids: string[]): string[] {
  return ids.length ? ids : ['00000000-0000-0000-0000-000000000000']
}

export const adminsOnly = () =>
  NextResponse.json({ error: 'Only admins can do that' }, { status: 403 })

export const notYourTeam = () =>
  NextResponse.json({ error: 'That player or team isn’t one of yours' }, { status: 403 })

export const signInRequired = () =>
  NextResponse.json({ error: 'Coach sign-in required' }, { status: 401 })
