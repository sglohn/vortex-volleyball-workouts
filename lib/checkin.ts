// FILE: lib/checkin.ts
//
// Starting (or resuming) today's workout for one player, after the PIN or
// coach sign-in has been checked. Used by:
//   app/api/checkin              players (team = her primary team)
//   app/api/coach/join-workout   a coach joining a team's workout (team =
//                                the team they signed in through)
//
// Which workout, in order:
//   1. Coach date override (player_overrides)
//   2. Active individual program (player_programs)
//   3. Self-guided player (players.self_guided) → auto-built full-body
//      workout (lib/fullBodyWorkout.ts), saved on the session so resuming
//      shows the same exercises. Each new session gets a new one.
//   4. Team schedule (volleyball), or this week's plan (lacrosse,
//      FEATURES.weekPlan): the next Day she hasn't finished, in order, one
//      per day. See lib/weekPlan.ts. When nothing is waiting (done today,
//      done for the week, no workouts) no session is made and the reply has
//      sessionId: null plus `week`, for the sign-in screen to explain.
//   5. Legacy active workout (not for week plan teams)
// Uses the club's local date (lib/clubTime.ts), not Vercel's UTC date.

import { createServerClient } from '@/lib/supabase'
import { clubDateString, clubDayBounds } from '@/lib/clubTime'
import { createPlayerPass } from '@/lib/playerAuth'
import { buildFullBodyWorkout, asGeneratedWorkout } from '@/lib/fullBodyWorkout'
import { FEATURES } from '@/lib/features'
import { loadPlayerWeek, publicWeek, type PlayerWeek } from '@/lib/weekPlan'

type Db = ReturnType<typeof createServerClient>

export interface CheckInResult { status: number; body: Record<string, unknown> }

/** player: the players row (select '*'); teamId: whose team workout to use */
export async function startWorkout(
  db: Db,
  player: { id: string; name: string; self_guided?: boolean | null },
  teamId: string | null,
): Promise<CheckInResult> {
  const playerId = player.id
  // Club-local date — Vercel's clock is UTC, which rolls to tomorrow at 8 PM Eastern
  const today = clubDateString()
  const { start: dayStart, end: dayEnd } = clubDayBounds(today)

  // Check for today's existing incomplete session — resume it
  const { data: existingSession } = await db
    .from('sessions')
    .select('*')
    .eq('player_id', playerId)
    .gte('checked_in_at', dayStart)
    .lt('checked_in_at', dayEnd)
    .is('completed_at', null)
    .order('checked_in_at', { ascending: false })
    .limit(1)
    .single()

  // Find today's template — priority: date override → player program → self-guided → team schedule
  let templateId: string | null = null
  let selfGuided = false
  let week: PlayerWeek | null = null

  const { data: override } = await db
    .from('player_overrides')
    .select('template_id')
    .eq('player_id', playerId)
    .eq('override_date', today)
    .single()

  if (override?.template_id) {
    templateId = override.template_id
  } else {
    // Check for active player program
    const { data: program } = await db
      .from('player_programs')
      .select('*')
      .eq('player_id', playerId)
      .eq('is_active', true)
      .lte('started_on', today)
      .or('ended_on.is.null,ended_on.gte.' + today)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (program) {
      // Cycle through template sequence based on session count since program start
      const sequence = program.template_sequence as string[]
      if (sequence.length) {
        const { count } = await db
          .from('sessions')
          .select('*', { count: 'exact', head: true })
          .eq('player_id', playerId)
          .gte('checked_in_at', program.started_on)
        const idx = (count ?? 0) % sequence.length
        templateId = sequence[idx] ?? null
      }
    } else if (player.self_guided === true) {
      // Auto-built full-body workout (built below, when the session is known)
      selfGuided = true
    } else if (teamId && FEATURES.weekPlan) {
      // Lacrosse: next workout in this week's plan
      try {
        week = await loadPlayerWeek(db, playerId, teamId, today)
      } catch (e) {
        return { status: 500, body: { error: 'Could not load this week\'s workouts: ' + (e as Error).message } }
      }
      templateId = week.templateId
    } else if (teamId) {
      const { data: schedule } = await db
        .from('team_schedule')
        .select('template_id')
        .eq('team_id', teamId)
        .eq('scheduled_date', today)
        .single()
      templateId = schedule?.template_id ?? null
    }
  }

  // Fallback legacy (not for self-guided players — they get their own workout)
  let legacyWorkoutId: string | null = null
  if (!templateId && !selfGuided && !week) {
    const { data: workout } = await db
      .from('workouts')
      .select('id')
      .eq('is_active', true)
      .single()
    legacyWorkoutId = workout?.id ?? null
  }

  // Get active health reports
  const { data: healthReports } = await db
    .from('health_reports')
    .select('id, report_type, body_part, pain_level, status')
    .eq('player_id', playerId)
    .eq('status', 'active')

  let sessionId: string
  let isResumed = !!existingSession

  if (week) {
    if (week.status !== 'ready' || !templateId) {
      // Nothing to start right now — no session; the sign-in screen says why
      return { status: 200, body: {
        sessionId: null,
        playerName: player.name,
        teamId,
        templateId: null,
        selfGuided: false,
        isResumed: false,
        hasHealthFlags: (healthReports?.length ?? 0) > 0,
        healthReports: healthReports ?? [],
        week: publicWeek(week),
        playerPass: await createPlayerPass(playerId),
      } }
    }
    if (week.resumeSessionId) {
      // Pick her unfinished Day back up (any day this week), logged sets and all
      sessionId = week.resumeSessionId
      isResumed = true
    } else {
      const { data: session, error: sessionError } = await db
        .from('sessions')
        .insert({
          player_id: playerId,
          team_id: teamId,
          template_id: templateId,
          week_start: week.weekStart,
          week_slot: week.nextSlot,
        })
        .select('id')
        .single()
      if (session) {
        sessionId = session.id
      } else {
        // A second tap got there first (one session per Day, see the
        // migration) — use that one
        const { data: same } = await db
          .from('sessions')
          .select('id')
          .eq('player_id', playerId)
          .eq('week_start', week.weekStart)
          .eq('week_slot', week.nextSlot as number)
          .single()
        if (!same) return { status: 500, body: { error: 'Could not create session' + (sessionError ? ': ' + sessionError.message : '') } }
        sessionId = same.id
        isResumed = true
      }
    }
  } else if (existingSession) {
    // Resume existing session — keep the same generated workout if it has one
    sessionId = existingSession.id
    if (selfGuided && !asGeneratedWorkout(existingSession.generated_workout)) {
      // e.g. coach switched the player to self-guided after they checked in
      const generated = await buildFullBodyWorkout(db, playerId, today)
      if (generated) {
        await db.from('sessions').update({ generated_workout: generated }).eq('id', sessionId)
      }
    }
  } else {
    // Create new session (self-guided players get a brand-new workout)
    const generated = selfGuided ? await buildFullBodyWorkout(db, playerId, today) : null
    const { data: session, error: sessionError } = await db
      .from('sessions')
      .insert({
        player_id: playerId,
        workout_id: legacyWorkoutId,
        team_id: teamId,
        ...(generated ? { generated_workout: generated } : {}),
      })
      .select('id')
      .single()
    if (sessionError || !session) return { status: 500, body: { error: 'Could not create session' } }
    sessionId = session.id
  }

  return { status: 200, body: {
    sessionId,
    playerName: player.name,
    teamId,
    templateId,
    selfGuided,
    isResumed,
    hasHealthFlags: (healthReports?.length ?? 0) > 0,
    healthReports: healthReports ?? [],
    ...(week ? { week: publicWeek(week) } : {}),
    // Signed pass for this player's own data (lib/playerAuth.ts)
    playerPass: await createPlayerPass(playerId),
  } }
}
