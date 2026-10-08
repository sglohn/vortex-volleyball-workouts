// FILE: app/api/coach/logs/route.ts
//
// Coach "Workout Logs": every set players logged on a given day, with
// possible mistakes flagged (lib/outliers.ts), and corrections.
//
//   GET    ?date=YYYY-MM-DD   all sessions that club-local day (default today)
//   PATCH  { id, weight_lbs, reps_completed, velocity_ms, completed }   fix a set
//   DELETE { id }                                                       remove a set
//
// Leaderboards, totals and suggestions all read set_logs, so a fix here
// shows up everywhere on their next refresh.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { clubDateString, clubDayBounds, isDateString } from '@/lib/clubTime'
import { asEquipment, setPoundsMoved, type Equipment } from '@/lib/loads'
import { flagExerciseSets } from '@/lib/outliers'

export const dynamic = 'force-dynamic'

type Db = ReturnType<typeof createServerClient>
type SessionRow = { id: string; player_id: string; checked_in_at: string; completed_at: string | null; rating?: string | null; rating_note?: string | null }
type LogRow = {
  id: string; session_id: string; exercise_id: string; set_number: number
  weight_lbs: number | null; reps_completed: number | null; velocity_ms: number | null
  completed: boolean; logged_at: string | null
}
type PlayerJoin = { id: string; name: string; jersey_number?: string | null }
type TeamJoin = { id: string; name: string; color?: string | null; age_group?: string | null }

const HISTORY_SESSIONS = 8   // earlier sessions per player used for "usual"

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Supabase returns at most 1000 rows per request; page through all of them. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1)
    if (error) throw error
    const batch = (data ?? []) as T[]
    rows.push(...batch)
    if (batch.length < page) break
  }
  return rows
}

async function logsForSessions(db: Db, sessionIds: string[], exerciseIds?: string[]): Promise<LogRow[]> {
  const out: LogRow[] = []
  for (const ids of chunk(sessionIds, 100)) {
    const rows = await fetchAll<LogRow>((from, to) => {
      let q = db
        .from('set_logs')
        .select('id, session_id, exercise_id, set_number, weight_lbs, reps_completed, velocity_ms, completed, logged_at')
        .in('session_id', ids)
      if (exerciseIds) q = q.in('exercise_id', exerciseIds)
      return q.order('id').range(from, to)
    })
    out.push(...rows)
  }
  return out
}

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get('date')
  const date = isDateString(dateParam) ? dateParam : clubDateString()
  const { start, end } = clubDayBounds(date)
  const db = createServerClient()

  // ── Sessions that day ──
  const { data: sessionsRaw, error: sErr } = await db
    .from('sessions')
    .select('id, player_id, checked_in_at, completed_at, rating, rating_note')
    .gte('checked_in_at', start)
    .lt('checked_in_at', end)
    .order('checked_in_at', { ascending: true })
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

  const sessions = (sessionsRaw ?? []) as SessionRow[]
  if (!sessions.length) return NextResponse.json({ date, sessions: [] })

  const playerIds = [...new Set(sessions.map(s => s.player_id))]

  // ── Players and their primary teams ──
  const [{ data: playersRaw }, { data: playerTeams }] = await Promise.all([
    db.from('players').select('id, name, jersey_number').in('id', playerIds),
    db.from('player_teams').select('player_id, team_id').in('player_id', playerIds).eq('is_primary', true),
  ])
  const teamIds = [...new Set((playerTeams ?? []).map(pt => pt.team_id as string))]
  const { data: teamsRaw } = teamIds.length
    ? await db.from('teams').select('id, name, color, age_group').in('id', teamIds)
    : { data: [] }
  const teamById: Record<string, TeamJoin> = Object.fromEntries(((teamsRaw ?? []) as TeamJoin[]).map(t => [t.id, t]))
  const playerById: Record<string, PlayerJoin> = Object.fromEntries(((playersRaw ?? []) as PlayerJoin[]).map(p => [p.id, p]))
  const teamByPlayer: Record<string, TeamJoin | null> = {}
  for (const pt of playerTeams ?? []) {
    teamByPlayer[pt.player_id as string] = teamById[pt.team_id as string] ?? null
  }

  // ── The day's sets ──
  let logs: LogRow[]
  try {
    logs = await logsForSessions(db, sessions.map(s => s.id))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load sets' }, { status: 500 })
  }
  const exerciseIds = [...new Set(logs.map(l => l.exercise_id))]

  // ── Exercise info ──
  const [{ data: libEx }, { data: legacyEx }] = exerciseIds.length
    ? await Promise.all([
        db.from('exercise_library').select('id, name, logs_weight, logs_velocity, equipment').in('id', exerciseIds),
        db.from('exercises').select('id, name, logs_weight').in('id', exerciseIds),
      ])
    : [{ data: [] }, { data: [] }]
  const exInfo: Record<string, { name: string; logsWeight: boolean; logsVelocity: boolean; equipment: Equipment | null }> = {}
  for (const e of legacyEx ?? []) exInfo[e.id] = { name: e.name, logsWeight: !!e.logs_weight, logsVelocity: false, equipment: null }
  for (const e of libEx ?? []) exInfo[e.id] = { name: e.name, logsWeight: !!e.logs_weight, logsVelocity: !!e.logs_velocity, equipment: asEquipment(e.equipment) }

  // ── Each player's earlier sessions (for "usual" weights) ──
  const historyWeights: Record<string, number[]> = {}   // `${playerId}|${exerciseId}` → recent first
  const historyBest: Record<string, number> = {}
  try {
    const earlier = await fetchAll<SessionRow>((from, to) =>
      db.from('sessions')
        .select('id, player_id, checked_in_at, completed_at')
        .in('player_id', playerIds)
        .lt('checked_in_at', start)
        .order('checked_in_at', { ascending: false })
        .range(from, to))
    const perPlayer: Record<string, SessionRow[]> = {}
    for (const s of earlier) {
      const list = (perPlayer[s.player_id] ??= [])
      if (list.length < HISTORY_SESSIONS) list.push(s)
    }
    const recent = Object.values(perPlayer).flat()
    const playerOfSession = Object.fromEntries(recent.map(s => [s.id, s.player_id]))
    const orderOfSession = Object.fromEntries(recent.map(s => [s.id, s.checked_in_at]))
    if (recent.length && exerciseIds.length) {
      const histLogs = (await logsForSessions(db, recent.map(s => s.id), exerciseIds))
        .filter(l => l.completed && l.weight_lbs !== null && Number(l.weight_lbs) > 0)
        .sort((a, b) => (orderOfSession[b.session_id] ?? '').localeCompare(orderOfSession[a.session_id] ?? ''))
      for (const l of histLogs) {
        const key = `${playerOfSession[l.session_id]}|${l.exercise_id}`
        const w = Number(l.weight_lbs)
        ;(historyWeights[key] ??= []).push(w)
        historyBest[key] = Math.max(historyBest[key] ?? 0, w)
      }
    }
  } catch {
    // History is only for flags; carry on without it
  }

  // ── Build each session ──
  const logsBySession: Record<string, LogRow[]> = {}
  for (const l of logs) (logsBySession[l.session_id] ??= []).push(l)

  const result = sessions.map(s => {
    const player = playerById[s.player_id]
    const team = teamByPlayer[s.player_id] ?? null
    const sessionLogs = (logsBySession[s.id] ?? []).sort((a, b) =>
      (a.logged_at ?? '').localeCompare(b.logged_at ?? '') || a.set_number - b.set_number)

    // group by exercise, in the order first logged
    const order: string[] = []
    const byExercise: Record<string, LogRow[]> = {}
    for (const l of sessionLogs) {
      if (!byExercise[l.exercise_id]) { order.push(l.exercise_id); byExercise[l.exercise_id] = [] }
      byExercise[l.exercise_id].push(l)
    }

    let flagCount = 0
    let totalLbs = 0
    let setsCompleted = 0

    const exercises = order.map(exId => {
      const info = exInfo[exId] ?? { name: 'Unknown exercise', logsWeight: false, logsVelocity: false, equipment: null }
      const key = `${s.player_id}|${exId}`
      const sets = byExercise[exId].sort((a, b) => a.set_number - b.set_number)
      const flags = flagExerciseSets(
        sets.map(l => ({
          id: l.id,
          weight: l.weight_lbs === null ? null : Number(l.weight_lbs),
          reps: l.reps_completed,
          velocity: l.velocity_ms === null ? null : Number(l.velocity_ms),
          completed: l.completed,
        })),
        { equipment: info.equipment, logsWeight: info.logsWeight, history: historyWeights[key] ?? [], previousBest: historyBest[key] ?? 0 },
      )

      return {
        exerciseId: exId,
        name: info.name,
        equipment: info.equipment,
        logsWeight: info.logsWeight,
        logsVelocity: info.logsVelocity,
        usualWeight: (historyWeights[key]?.length ?? 0) >= 3
          ? [...historyWeights[key]].sort((a, b) => a - b)[Math.floor(historyWeights[key].length / 2)]
          : null,
        sets: sets.map(l => {
          const notes = flags[l.id] ?? []
          flagCount += notes.length ? 1 : 0
          if (l.completed) {
            setsCompleted++
            if (info.logsWeight) totalLbs += setPoundsMoved(l.weight_lbs === null ? null : Number(l.weight_lbs), l.reps_completed, info.equipment)
          }
          return {
            id: l.id,
            setNumber: l.set_number,
            weightLbs: l.weight_lbs === null ? null : Number(l.weight_lbs),
            repsCompleted: l.reps_completed,
            velocityMs: l.velocity_ms === null ? null : Number(l.velocity_ms),
            completed: l.completed,
            loggedAt: l.logged_at,
            flags: notes,
          }
        }),
      }
    })

    return {
      id: s.id,
      playerId: s.player_id,
      playerName: player?.name ?? 'Unknown player',
      jerseyNumber: player?.jersey_number ?? null,
      teamName: team?.name ? `${team.name}${team.age_group ? ` ${team.age_group}` : ''}` : 'No team',
      teamColor: team?.color ?? null,
      checkedInAt: s.checked_in_at,
      completedAt: s.completed_at,
      rating: s.rating ?? null,
      ratingNote: s.rating_note ?? null,
      setsCompleted,
      totalLbs: Math.round(totalLbs),
      flagCount,
      exercises,
    }
  })

  return NextResponse.json({ date, sessions: result }, { headers: { 'Cache-Control': 'no-store' } })
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'Missing set id' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if ('weight_lbs' in body) update.weight_lbs = numOrNull(body.weight_lbs)
  if ('reps_completed' in body) {
    const r = numOrNull(body.reps_completed)
    update.reps_completed = r === null ? null : Math.round(r)
  }
  if ('velocity_ms' in body) update.velocity_ms = numOrNull(body.velocity_ms)
  if ('completed' in body) update.completed = !!body.completed
  if (!Object.keys(update).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db.from('set_logs').update(update).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'Missing set id' }, { status: 400 })
  const db = createServerClient()
  const { error } = await db.from('set_logs').delete().eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
