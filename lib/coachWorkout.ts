// FILE: lib/coachWorkout.ts
//
// Coaches joining in on their team's workout.
//
// Each team coach can have one workout profile: a players row with
// players.coach_id set (supabase/migrations/2026-10-21_coach_workouts.sql).
// It's made the first time they join in, and it is never on a team roster
// (player_teams), so it stays out of team lists, the Players page, player
// search, comparisons and coach scoping. Their sessions carry the team they
// joined (sessions.team_id), which is how the leaderboard places them.

import { createServerClient } from '@/lib/supabase'
import type { CoachIdentity } from '@/lib/coachAuth'

type Db = ReturnType<typeof createServerClient>

interface TeamInfo { id: string; name: string; age_group: string | null }

/** Boys team ("18 Storm Boys" / "Boys 18s") → the coach shows on the boys board */
export function isBoysTeam(team: TeamInfo): boolean {
  return /boy/i.test(team.name) || /boy/i.test(team.age_group ?? '')
}

/** A PIN no one can type (players sign in with 4 digits), so the profile can only be used through the coach sign-in */
function lockedPin(): string {
  return 'coach-' + crypto.randomUUID()
}

/**
 * The coach's workout profile, made the first time. Its name follows the
 * coach account ("Coach Emma Haddix"); its Girl / Boy setting follows the
 * team they're joining, so they're compared with that team on the leaderboard.
 */
export async function coachWorkoutProfile(db: Db, coach: CoachIdentity, team: TeamInfo) {
  if (!coach.id) throw new Error('No coach account')
  const gender = isBoysTeam(team) ? 'M' : 'F'

  const { data: existing } = await db.from('players').select('*').eq('coach_id', coach.id).maybeSingle()
  if (existing) {
    if (existing.name !== coach.name || existing.gender !== gender || !existing.is_active) {
      const { data: updated } = await db.from('players')
        .update({ name: coach.name, gender, is_active: true })
        .eq('id', existing.id).select('*').single()
      return updated ?? existing
    }
    return existing
  }

  const { data: created, error } = await db.from('players')
    .insert({ name: coach.name, pin: lockedPin(), gender, coach_id: coach.id, is_active: true })
    .select('*').single()
  if (created) return created
  // Two taps at once: the other one made it
  const { data: again } = await db.from('players').select('*').eq('coach_id', coach.id).maybeSingle()
  if (again) return again
  throw new Error(error?.message ?? 'Could not make the coach workout profile')
}

export interface CoachBoardRow {
  player_id: string
  team_id: string
  players: { id: string; name: string; jersey_number: string | null; is_active: boolean; gender: string | null }
}

/**
 * Coaches who worked out with a team since `sinceIso` (optionally only these
 * players / teams), shaped like a player_teams row joined to players, so the
 * leaderboard can treat them like a player on that team. A coach goes with
 * the team of their latest session.
 */
export async function coachBoardRows(
  db: Db,
  sinceIso: string,
  opts: { playerIds?: string[]; teamIds?: string[] } = {},
): Promise<CoachBoardRow[]> {
  if (opts.playerIds && !opts.playerIds.length) return []
  if (opts.teamIds && !opts.teamIds.length) return []

  let profilesQuery = db.from('players')
    .select('id, name, jersey_number, is_active, gender')
    .not('coach_id', 'is', null)
  if (opts.playerIds) profilesQuery = profilesQuery.in('id', opts.playerIds)
  const { data: profiles, error } = await profilesQuery
  if (error || !profiles?.length) return []   // e.g. before the migration

  let sessionsQuery = db.from('sessions')
    .select('player_id, team_id, checked_in_at')
    .in('player_id', profiles.map(p => p.id))
    .not('team_id', 'is', null)
    .gte('checked_in_at', sinceIso)
    .order('checked_in_at', { ascending: false })
  if (opts.teamIds) sessionsQuery = sessionsQuery.in('team_id', opts.teamIds)
  const { data: sessions } = await sessionsQuery

  const teamByPlayer = new Map<string, string>()
  for (const s of sessions ?? []) {
    if (!teamByPlayer.has(s.player_id)) teamByPlayer.set(s.player_id, s.team_id as string)
  }
  return profiles
    .filter(p => teamByPlayer.has(p.id))
    .map(p => ({ player_id: p.id, team_id: teamByPlayer.get(p.id)!, players: p }))
}
