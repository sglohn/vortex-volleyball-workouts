// FILE: app/api/coach/combine-station/route.ts
//
// Coach station for Combine Day (components/CombineStation.tsx, opened from
// Team Mode, app/team/[teamId]). A coach or admin standing at one test
// (say Approach Touch) enters every player's numbers on one tablet or laptop,
// without each player typing her PIN.
//
//   GET    ?teams=<id>,<id>           the Combine Day teams here, their tests,
//                                      and every player with today's tries
//   POST   { playerId, metric, value } save a try for that player
//   DELETE { playerId, id }            delete a try (a mistake)
//
// Rules:
//   - Team coaches only see and enter for their own teams (lib/coachScope.ts);
//     admins for every team. Listed in middleware.ts COACH_ROUTES.
//   - Only teams whose workout today is a Combine Day (lib/combine.ts).
//   - A player who hasn't checked in yet is checked in on the spot (same as
//     her PIN would, lib/checkin.ts), so her tries have a session. She can
//     still sign in on her own phone later and keep going on the same
//     session; the body check isn't asked on the station.
//   - A coach can still add or fix numbers after the player tapped Finish
//     (her phone says "Ask your coach to fix a number").
//   - Saving uses lib/combineEntry.ts, the same rules as the phones: best try
//     counts, height / wingspan / reach replace, best goes to measurements.
//
// Volleyball only: lib/features.ts blocks this route on lacrosse.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCoach, type CoachIdentity } from '@/lib/coachAuth'
import { canSeeTeam, notYourTeam, signInRequired } from '@/lib/coachScope'
import { clubDateString, clubDayBounds } from '@/lib/clubTime'
import { startWorkout } from '@/lib/checkin'
import { COMBINE_KEYS, combineMetric, combineMetricsFor, type CombineMetricKey } from '@/lib/combine'
import { deleteAttempt, num, saveAttempt, type MeasurementRow } from '@/lib/combineEntry'

type Db = ReturnType<typeof createServerClient>

const ID_RE = /^[0-9a-f-]{8,64}$/i
const MAX_TEAMS = 6

type TeamRow = { id: string; name: string; age_group?: string | null; color: string | null }
type SessionRow = { id: string; player_id: string; checked_in_at: string; completed_at: string | null; team_id: string | null }
type PlayerJoin = { id: string; name: string; jersey_number?: string | null; is_active: boolean; coach_id?: string | null }

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** Today's Combine Day teams among these ids: team → its tests */
async function combineTeams(db: Db, teamIds: string[]): Promise<Map<string, { team: TeamRow; tests: CombineMetricKey[] }>> {
  const out = new Map<string, { team: TeamRow; tests: CombineMetricKey[] }>()
  if (!teamIds.length) return out
  const today = clubDateString()
  const [{ data: teams }, { data: schedules }] = await Promise.all([
    db.from('teams').select('id, name, age_group, color').in('id', teamIds),
    db.from('team_schedule').select('team_id, template_id').in('team_id', teamIds).eq('scheduled_date', today),
  ])
  const templateIds = [...new Set((schedules ?? []).map(s => s.template_id).filter((id): id is string => !!id))]
  const { data: templates } = templateIds.length
    ? await db.from('workout_templates').select('*').in('id', templateIds)
    : { data: [] }
  const combineTemplates = new Map<string, CombineMetricKey[]>()
  for (const t of templates ?? []) {
    if (t.is_combine === true) combineTemplates.set(t.id as string, combineMetricsFor(t.combine_metrics).map(m => m.key))
  }
  for (const id of teamIds) {
    const team = ((teams ?? []) as TeamRow[]).find(t => t.id === id)
    const sched = (schedules ?? []).find(s => s.team_id === id && s.template_id && combineTemplates.has(s.template_id))
    if (team && sched) out.set(id, { team, tests: combineTemplates.get(sched.template_id!)! })
  }
  return out
}

/** The player's main team, if it's one of the station's combine teams she can be entered for */
async function playerOnStation(db: Db, coach: CoachIdentity, playerId: string) {
  const { data: link } = await db
    .from('player_teams')
    .select('team_id, players(id, name, is_active, self_guided, coach_id)')
    .eq('player_id', playerId)
    .eq('is_primary', true)
    .maybeSingle()
  const player = one(link?.players as unknown as (PlayerJoin & { self_guided?: boolean | null }) | null)
  if (!link || !player || !player.is_active || player.coach_id) return { error: NextResponse.json({ error: 'Player not found' }, { status: 404 }) }
  const teamId = link.team_id as string
  if (!canSeeTeam(coach, teamId)) return { error: notYourTeam() }
  const teams = await combineTeams(db, [teamId])
  const entry = teams.get(teamId)
  if (!entry) return { error: NextResponse.json({ error: 'Her team doesn\'t have a Combine Day today' }, { status: 409 }) }
  return { player, teamId, tests: entry.tests }
}

/** Today's sessions for these players, newest last */
async function todaySessions(db: Db, playerIds: string[]): Promise<SessionRow[]> {
  if (!playerIds.length) return []
  const { start, end } = clubDayBounds(clubDateString())
  const { data } = await db
    .from('sessions')
    .select('id, player_id, checked_in_at, completed_at, team_id')
    .in('player_id', playerIds)
    .gte('checked_in_at', start)
    .lt('checked_in_at', end)
    .order('checked_in_at', { ascending: true })
  return (data ?? []) as SessionRow[]
}

/** The session her tries go on: the open one today, else the latest today */
function activeSession(sessions: SessionRow[]): SessionRow | null {
  return [...sessions].reverse().find(s => !s.completed_at) ?? sessions[sessions.length - 1] ?? null
}

/** Station rows for these players: today's tries on her active session, and last time's numbers */
async function stationPlayers(db: Db, players: Array<{ id: string; name: string; jerseyNumber: string | null; teamId: string }>) {
  const ids = players.map(p => p.id)
  const sessions = await todaySessions(db, ids)
  const byPlayer = new Map<string, SessionRow[]>()
  for (const s of sessions) {
    if (!byPlayer.has(s.player_id)) byPlayer.set(s.player_id, [])
    byPlayer.get(s.player_id)!.push(s)
  }
  const active = new Map<string, SessionRow>()
  for (const [pid, list] of byPlayer) { const s = activeSession(list); if (s) active.set(pid, s) }

  const sessionIds = [...active.values()].map(s => s.id)
  const today = clubDateString()
  const [{ data: tries }, { data: earlier }] = await Promise.all([
    sessionIds.length
      ? db.from('combine_attempts').select('id, session_id, metric, value, created_at').in('session_id', sessionIds).order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as { id: string; session_id: string; metric: string; value: number; created_at: string }[] }),
    ids.length
      ? db.from('measurements').select('*').in('player_id', ids).lt('measured_at', today).order('measured_at', { ascending: false })
      : Promise.resolve({ data: [] as MeasurementRow[] }),
  ])
  const previousRow = new Map<string, MeasurementRow>()
  for (const r of (earlier ?? []) as MeasurementRow[]) if (r.player_id && !previousRow.has(r.player_id)) previousRow.set(r.player_id, r)

  return players.map(p => {
    const s = active.get(p.id) ?? null
    const previous: Partial<Record<CombineMetricKey, number>> = {}
    for (const k of COMBINE_KEYS) {
      const v = num(previousRow.get(p.id)?.[k])
      if (v != null) previous[k] = v
    }
    return {
      ...p,
      sessionId: s?.id ?? null,
      completed: !!s?.completed_at,
      attempts: s
        ? (tries ?? []).filter(t => t.session_id === s.id).map(t => ({ id: t.id, metric: t.metric, value: Number(t.value), createdAt: t.created_at }))
        : [],
      previous,
    }
  })
}

async function onePlayerReply(db: Db, player: { id: string; name: string; jersey_number?: string | null }, teamId: string) {
  const [row] = await stationPlayers(db, [{ id: player.id, name: player.name, jerseyNumber: player.jersey_number ?? null, teamId }])
  return NextResponse.json({ player: row })
}

export async function GET(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return signInRequired()

  const raw = req.nextUrl.searchParams.get('teams') ?? ''
  const asked = [...new Set(raw.split(',').map(s => s.trim()).filter(s => ID_RE.test(s)))].slice(0, MAX_TEAMS)
  if (!asked.length) return NextResponse.json({ error: 'Missing teams' }, { status: 400 })
  const allowed = asked.filter(id => canSeeTeam(coach, id))

  const db = createServerClient()
  const teams = await combineTeams(db, allowed)

  // Players on those teams (main team), coaches' own workout profiles left out
  const teamIds = [...teams.keys()]
  const { data: links } = teamIds.length
    ? await db.from('player_teams')
        .select('team_id, players(id, name, jersey_number, is_active, coach_id)')
        .in('team_id', teamIds).eq('is_primary', true)
    : { data: [] }
  const seen = new Set<string>()
  const roster: Array<{ id: string; name: string; jerseyNumber: string | null; teamId: string }> = []
  for (const l of links ?? []) {
    const p = one(l.players as unknown as PlayerJoin | PlayerJoin[] | null)
    if (!p || !p.is_active || p.coach_id || seen.has(p.id)) continue
    seen.add(p.id)
    roster.push({ id: p.id, name: p.name, jerseyNumber: p.jersey_number ?? null, teamId: l.team_id as string })
  }
  roster.sort((a, b) => a.name.localeCompare(b.name))

  // Tests: every test any of these combines has, in the standard order
  const testSet = new Set([...teams.values()].flatMap(t => t.tests))
  return NextResponse.json({
    coach: { name: coach.name, isAdmin: coach.isAdmin },
    teams: [...teams.values()].map(({ team, tests }) => ({ id: team.id, name: team.name, color: team.color ?? '#56a0d3', tests })),
    /** Teams asked for that aren't shown: not this coach's, or no Combine Day today */
    hidden: {
      notYours: asked.length - allowed.length,
      noCombine: allowed.length - teams.size,
    },
    tests: COMBINE_KEYS.filter(k => testSet.has(k)),
    players: await stationPlayers(db, roster),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return signInRequired()
  const body = await req.json().catch(() => ({}))
  const { playerId, metric: metricKey, value } = body as { playerId?: string; metric?: string; value?: unknown }
  if (!playerId || !ID_RE.test(playerId)) return NextResponse.json({ error: 'Missing player' }, { status: 400 })

  const db = createServerClient()
  const found = await playerOnStation(db, coach, playerId)
  if ('error' in found) return found.error
  const { player, teamId, tests } = found

  const metric = combineMetric(metricKey)
  if (!metric || !tests.includes(metric.key)) {
    return NextResponse.json({ error: 'That test isn\'t part of her team\'s combine' }, { status: 400 })
  }

  // Her session today, or check her in now
  let session = activeSession(await todaySessions(db, [player.id]))
  if (!session) {
    const result = await startWorkout(db, player, teamId)
    const sessionId = typeof result.body.sessionId === 'string' ? result.body.sessionId : null
    if (result.status !== 200 || !sessionId) {
      return NextResponse.json({ error: typeof result.body.error === 'string' ? result.body.error : 'Could not check her in' }, { status: result.status === 200 ? 500 : result.status })
    }
    session = activeSession(await todaySessions(db, [player.id]))
    if (!session) return NextResponse.json({ error: 'Could not check her in' }, { status: 500 })
  }

  const saved = await saveAttempt(db, { sessionId: session.id, playerId: player.id, metric, value })
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status })
  return onePlayerReply(db, player, teamId)
}

export async function DELETE(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return signInRequired()
  const body = await req.json().catch(() => ({}))
  const { playerId, id } = body as { playerId?: string; id?: string }
  if (!playerId || !ID_RE.test(playerId) || !id || !ID_RE.test(id)) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = createServerClient()
  const found = await playerOnStation(db, coach, playerId)
  if ('error' in found) return found.error
  const { player, teamId } = found

  const session = activeSession(await todaySessions(db, [player.id]))
  if (!session) return onePlayerReply(db, player, teamId)
  const removed = await deleteAttempt(db, { sessionId: session.id, playerId: player.id, id, metricOf: combineMetric })
  if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: removed.status })
  return onePlayerReply(db, player, teamId)
}
