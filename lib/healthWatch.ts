// FILE: lib/healthWatch.ts
//
// Server only. Loads what the Health Board's Watch tab needs and runs the
// pattern rules in lib/healthPatterns.ts. Admins get every team plus the
// club section; a team coach gets only their own teams and players.

import { createServerClient } from '@/lib/supabase'
import type { CoachIdentity } from '@/lib/coachAuth'
import { isWarmupLabel } from '@/lib/warmup'
import {
  findPatterns, RULES,
  type CheckRow, type PlayerRow, type ReportRow, type SeenRow, type SessionRow, type TeamRow, type TemplateExercise, type WatchResult,
} from '@/lib/healthPatterns'

type Db = ReturnType<typeof createServerClient>

const PAGE = 1000
const LOOKBACK_DAYS = 42

/** Every row, a page at a time (Supabase returns at most 1000 per request) */
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return rows
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export async function loadWatch(db: Db, coach: CoachIdentity, now = new Date()): Promise<WatchResult> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Teams (not Open Gym — that's the TV display only)
  let teamsQ = db.from('teams').select('id, name, is_open_gym').eq('is_active', true)
  if (!coach.isAdmin) teamsQ = teamsQ.in('id', coach.teamIds.length ? coach.teamIds : ['00000000-0000-0000-0000-000000000000'])
  const { data: teamsRaw } = await teamsQ.order('name')
  const teams: TeamRow[] = (teamsRaw ?? []).filter(t => !t.is_open_gym).map(t => ({ id: t.id, name: t.name }))
  const teamIdSet = new Set(teams.map(t => t.id))

  // Players and the teams they're on (primary first). Coaches' own workout profiles aren't players.
  const memberships = await all<{ player_id: string; team_id: string; is_primary: boolean | null }>((a, b) =>
    db.from('player_teams').select('player_id, team_id, is_primary').range(a, b))
  const playersRaw = await all<{ id: string; name: string }>((a, b) =>
    db.from('players').select('id, name').eq('is_active', true).is('coach_id', null).range(a, b))
  const teamsOf = new Map<string, string[]>()
  for (const m of memberships.sort((x, y) => Number(!!y.is_primary) - Number(!!x.is_primary))) {
    if (!teamIdSet.has(m.team_id)) continue
    const list = teamsOf.get(m.player_id) ?? []
    list.push(m.team_id)
    teamsOf.set(m.player_id, list)
  }
  const players: PlayerRow[] = playersRaw
    .filter(p => coach.isAdmin || teamsOf.has(p.id))
    .map(p => ({ id: p.id, name: p.name, teamIds: teamsOf.get(p.id) ?? [] }))
  const playerSet = new Set(players.map(p => p.id))

  const [checksRaw, sessionsRaw, reportsRaw, seenRaw] = await Promise.all([
    all<CheckRow>((a, b) => db.from('body_checks').select('player_id, session_id, regions, checked_at').gte('checked_at', since).order('checked_at').range(a, b)),
    all<SessionRow>((a, b) => db.from('sessions').select('id, player_id, team_id, template_id, rating, checked_in_at').gte('checked_in_at', since).order('checked_in_at').range(a, b)),
    all<ReportRow>((a, b) => db.from('health_reports').select('id, player_id, body_part, report_type, status, availability, reported_at, resolved_at').order('reported_at').range(a, b)),
    all<SeenRow>((a, b) => db.from('health_watch_seen').select('key, evidence, seen_at, coach_name, note')
      .gte('seen_at', new Date(now.getTime() - RULES.seenDays * 24 * 60 * 60 * 1000).toISOString()).range(a, b)),
  ])
  const checks = checksRaw.filter(c => playerSet.has(c.player_id))
  const sessions = sessionsRaw.filter(s => playerSet.has(s.player_id))
  const reports = reportsRaw.filter(r => playerSet.has(r.player_id))

  // Workout names and their exercises (to point at likely causes)
  const templateIds = [...new Set(sessions.map(s => s.template_id).filter((x): x is string => !!x))]
  const templates: Record<string, string> = {}
  const templateExercises: TemplateExercise[] = []
  for (const ids of chunk(templateIds, 100)) {
    const [{ data: tpl }, { data: blocks }] = await Promise.all([
      db.from('workout_templates').select('id, name').in('id', ids),
      db.from('template_blocks')
        .select('template_id, block_label, template_block_exercises(exercise_library(name, category))')
        .in('template_id', ids),
    ])
    for (const t of tpl ?? []) templates[t.id] = t.name
    for (const b of (blocks ?? []) as unknown as { template_id: string; block_label: string; template_block_exercises: { exercise_library: { name: string; category: string | null } | { name: string; category: string | null }[] | null }[] }[]) {
      if (isWarmupLabel(b.block_label)) continue
      for (const tbe of b.template_block_exercises ?? []) {
        const ex = Array.isArray(tbe.exercise_library) ? tbe.exercise_library[0] : tbe.exercise_library
        if (ex?.name) templateExercises.push({ template_id: b.template_id, name: ex.name, category: ex.category })
      }
    }
  }

  return findPatterns({
    now, checks, sessions, reports, players, teams, templates, templateExercises,
    seen: seenRaw, includeClub: coach.isAdmin,
  })
}
