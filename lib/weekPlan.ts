// FILE: lib/weekPlan.ts
//
// Weekly workout plans (Bruisers Lacrosse; FEATURES.weekPlan).
//
// Each team has an ordered list of workouts per week: Day 1, Day 2, ...
// Players do them in order, whenever they like that week, with these rules:
//
//   - Weeks run Monday to Sunday in club time (lib/clubTime.ts).
//   - In order: the next workout is always the lowest Day not finished yet.
//   - One per day: once a player finishes a workout, the next one waits
//     until tomorrow.
//   - A started but unfinished workout is picked back up (same session, so
//     logged sets stay) the next time she signs in that week.
//   - "Finished" means she tapped Finish (sessions.completed_at).
//   - Every Monday starts over at Day 1, whatever happened last week.
//   - A week with no plan of its own uses the most recent earlier week that
//     has workouts (it rolls forward). A plan saved with no workouts is an
//     off week; it doesn't roll forward.
//
// Tables: week_plans, week_plan_slots, and sessions.template_id /
// week_start / week_slot (supabase/migrations/2026-10-14_week_plans.sql).

import type { createServerClient } from '@/lib/supabase'
import { clubDateOf } from '@/lib/clubTime'

type Db = ReturnType<typeof createServerClient>

/** Most workouts in one week */
export const MAX_WEEK_SLOTS = 7

// ── Dates (plain YYYY-MM-DD, no time zone involved) ──

function toUtc(date: string): Date {
  return new Date(date + 'T00:00:00Z')
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The Monday of the week a date falls in */
export function weekStartOf(date: string): string {
  const dow = toUtc(date).getUTCDay() // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow)
}

/** "Oct 13" */
export function shortDate(date: string): string {
  return toUtc(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// ── Plans ──

export interface PlanSlot {
  /** Day number shown to players (1, 2, 3...) */
  slot: number
  templateId: string
  name: string
}

export interface WeekPlan {
  weekStart: string
  /** The week whose plan is used: this week, or an earlier one rolled forward. null = no plan at all */
  fromWeek: string | null
  /** True when this week has its own saved plan */
  ownPlan: boolean
  slots: PlanSlot[]
}

interface PlanRow {
  id: string
  week_start: string
  week_plan_slots: { slot: number; template_id: string | null; workout_templates: { name: string } | { name: string }[] | null }[] | null
}

function rowSlots(row: PlanRow): PlanSlot[] {
  const raw = Array.isArray(row.week_plan_slots) ? row.week_plan_slots : []
  // Skip slots whose workout was deleted, and number the rest 1, 2, 3...
  return raw
    .filter(s => !!s.template_id)
    .sort((a, b) => a.slot - b.slot)
    .map((s, i) => {
      const t = Array.isArray(s.workout_templates) ? s.workout_templates[0] : s.workout_templates
      return { slot: i + 1, templateId: s.template_id as string, name: t?.name ?? 'Workout' }
    })
}

/** The plan in effect for a team's week (its own, or rolled forward) */
export async function loadWeekPlan(db: Db, teamId: string, weekStart: string): Promise<WeekPlan> {
  const { data, error } = await db
    .from('week_plans')
    .select('id, week_start, week_plan_slots(slot, template_id, workout_templates(name))')
    .eq('team_id', teamId)
    .lte('week_start', weekStart)
    .order('week_start', { ascending: false })
    .limit(26)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as PlanRow[]
  const own = rows.find(r => r.week_start === weekStart)
  if (own) {
    // This week's own plan, even if it's an off week (no workouts)
    return { weekStart, fromWeek: weekStart, ownPlan: true, slots: rowSlots(own) }
  }
  // Roll forward the most recent earlier week that has workouts
  for (const r of rows) {
    const slots = rowSlots(r)
    if (slots.length) return { weekStart, fromWeek: r.week_start, ownPlan: false, slots }
  }
  return { weekStart, fromWeek: null, ownPlan: false, slots: [] }
}

// ── One player's week ──

export type DayState = 'done' | 'in_progress' | 'next' | 'locked'

export interface PlayerDay {
  slot: number
  name: string
  state: DayState
  /** Club date she started it (YYYY-MM-DD) */
  startedOn: string | null
  /** Club date she finished it (YYYY-MM-DD) */
  finishedOn: string | null
}

export type WeekStatus =
  /** A workout is ready to start or pick back up */
  | 'ready'
  /** She already finished one today; the next one waits until tomorrow */
  | 'done_today'
  /** Every workout this week is finished */
  | 'week_done'
  /** No workouts this week */
  | 'no_plan'

export interface PlayerWeek {
  weekStart: string
  status: WeekStatus
  total: number
  /** The Day she's on (ready / done_today), or null */
  nextSlot: number | null
  /** Workout to open (ready only) */
  templateId: string | null
  /** Unfinished session to pick back up (ready only) */
  resumeSessionId: string | null
  days: PlayerDay[]
}

export interface WeekSessionRow {
  id: string
  week_slot: number
  template_id: string | null
  checked_in_at: string
  completed_at: string | null
}

/** This week's week-plan sessions for a player */
export async function loadWeekSessions(db: Db, playerId: string, weekStart: string): Promise<WeekSessionRow[]> {
  const { data, error } = await db
    .from('sessions')
    .select('id, week_slot, template_id, checked_in_at, completed_at')
    .eq('player_id', playerId)
    .eq('week_start', weekStart)
    .not('week_slot', 'is', null)
  if (error) throw new Error(error.message)
  return (data ?? []) as WeekSessionRow[]
}

/**
 * Where a player is in her week. Pure, so it can be tested without a database.
 * `today` is the club date (YYYY-MM-DD).
 */
export function playerWeekFrom(plan: WeekPlan, sessions: WeekSessionRow[], today: string): PlayerWeek {
  const total = plan.slots.length
  const finished = sessions.filter(s => !!s.completed_at)
  // In order, so the highest finished Day is where she's up to
  const lastDone = finished.reduce((m, s) => Math.max(m, s.week_slot), 0)
  const doneToday = finished.some(s => clubDateOf(s.completed_at as string) === today)
  const nextSlot = lastDone < total ? lastDone + 1 : null
  const open = nextSlot
    ? sessions
        .filter(s => s.week_slot === nextSlot && !s.completed_at)
        .sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at))[0] ?? null
    : null

  let status: WeekStatus
  if (total === 0) status = 'no_plan'
  else if (!nextSlot) status = 'week_done'
  else if (doneToday && !open) status = 'done_today'
  else status = 'ready'

  const days: PlayerDay[] = plan.slots.map(s => {
    const done = finished.find(f => f.week_slot === s.slot)
    const started = done ?? sessions.find(x => x.week_slot === s.slot) ?? null
    let state: DayState
    if (done || s.slot <= lastDone) state = 'done'
    else if (s.slot === nextSlot) state = open ? 'in_progress' : 'next'
    else state = 'locked'
    return {
      slot: s.slot,
      name: s.name,
      state,
      startedOn: started ? clubDateOf(started.checked_in_at) : null,
      finishedOn: done?.completed_at ? clubDateOf(done.completed_at) : null,
    }
  })

  const ready = status === 'ready'
  return {
    weekStart: plan.weekStart,
    status,
    total,
    nextSlot,
    // An unfinished session keeps the workout it started with, even if the
    // coach changes the plan midweek
    templateId: ready ? (open?.template_id ?? plan.slots[(nextSlot as number) - 1].templateId) : null,
    resumeSessionId: ready ? open?.id ?? null : null,
    days,
  }
}

/** Where a player is in this week's plan for her team */
export async function loadPlayerWeek(db: Db, playerId: string, teamId: string, today: string): Promise<PlayerWeek> {
  const weekStart = weekStartOf(today)
  const [plan, sessions] = await Promise.all([
    loadWeekPlan(db, teamId, weekStart),
    loadWeekSessions(db, playerId, weekStart),
  ])
  return playerWeekFrom(plan, sessions, today)
}

/** What the sign-in screen shows (no ids it doesn't need) */
export function publicWeek(w: PlayerWeek) {
  return {
    weekStart: w.weekStart,
    status: w.status,
    total: w.total,
    nextSlot: w.nextSlot,
    resumed: !!w.resumeSessionId,
    days: w.days,
  }
}
