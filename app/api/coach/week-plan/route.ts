// FILE: app/api/coach/week-plan/route.ts
//
// Coach Week Plan (lacrosse only; FEATURES.weekPlan, blocked on Vortex in
// middleware.ts). Coach sign-in required (middleware.ts).
//
//   GET    ?teamId=…&week=YYYY-MM-DD   plan in effect that week (any date in
//                                       the week; default this week) and each
//                                       player's progress through it
//   POST   { teamId, weekStart, templateIds: [...] }
//                                       save that week's own plan, in order.
//                                       [] = off week (no workouts).
//   DELETE { teamId, weekStart }        remove that week's own plan, so it
//                                       goes back to rolling forward
//
// See lib/weekPlan.ts for how players move through the week.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { clubDateString, isDateString } from '@/lib/clubTime'
import { getCoach } from '@/lib/coachAuth'
import { canSeeTeam, notYourTeam, signInRequired } from '@/lib/coachScope'
import { MAX_WEEK_SLOTS, loadWeekPlan, playerWeekFrom, weekStartOf, type WeekSessionRow } from '@/lib/weekPlan'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId')
  if (!teamId) return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })
  const coach = await getCoach(req)
  if (!coach) return signInRequired()
  if (!canSeeTeam(coach, teamId)) return notYourTeam()
  const weekParam = req.nextUrl.searchParams.get('week')
  const today = clubDateString()
  const weekStart = weekStartOf(isDateString(weekParam) ? weekParam : today)

  const db = createServerClient()
  let plan
  try {
    plan = await loadWeekPlan(db, teamId, weekStart)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // Players whose main team this is
  const { data: links, error: linkError } = await db
    .from('player_teams')
    .select('player_id, players!inner(id, name, jersey_number, is_active)')
    .eq('team_id', teamId)
    .eq('is_primary', true)
    .eq('players.is_active', true)
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })

  type P = { id: string; name: string; jersey_number: string | null }
  const players: P[] = (links ?? [])
    .map(l => (Array.isArray(l.players) ? l.players[0] : l.players) as unknown as P | null)
    .filter((p): p is P => !!p)
    .sort((a, b) => a.name.localeCompare(b.name))

  const sessionsByPlayer = new Map<string, WeekSessionRow[]>()
  if (players.length) {
    const { data: rows, error } = await db
      .from('sessions')
      .select('id, player_id, week_slot, template_id, checked_in_at, completed_at')
      .in('player_id', players.map(p => p.id))
      .eq('week_start', weekStart)
      .not('week_slot', 'is', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const r of rows ?? []) {
      const list = sessionsByPlayer.get(r.player_id as string) ?? []
      list.push(r as WeekSessionRow)
      sessionsByPlayer.set(r.player_id as string, list)
    }
  }

  return NextResponse.json({
    weekStart,
    thisWeek: weekStartOf(today),
    today,
    maxSlots: MAX_WEEK_SLOTS,
    plan,
    players: players.map(p => {
      const w = playerWeekFrom(plan, sessionsByPlayer.get(p.id) ?? [], today)
      return { id: p.id, name: p.name, jerseyNumber: p.jersey_number, status: w.status, days: w.days }
    }),
  })
}

export async function POST(req: NextRequest) {
  const { teamId, weekStart, templateIds } = await req.json()
  if (!teamId || !isDateString(weekStart)) return NextResponse.json({ error: 'Missing team or week' }, { status: 400 })
  if (weekStartOf(weekStart) !== weekStart) return NextResponse.json({ error: 'Week must start on a Monday' }, { status: 400 })
  if (!Array.isArray(templateIds) || templateIds.some(t => typeof t !== 'string' || !t)) {
    return NextResponse.json({ error: 'Pick a workout for every Day' }, { status: 400 })
  }
  if (templateIds.length > MAX_WEEK_SLOTS) return NextResponse.json({ error: `At most ${MAX_WEEK_SLOTS} workouts a week` }, { status: 400 })

  const db = createServerClient()

  if (templateIds.length) {
    const { data: found, error } = await db.from('workout_templates').select('id').in('id', templateIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const ok = new Set((found ?? []).map(t => t.id))
    if (templateIds.some((t: string) => !ok.has(t))) return NextResponse.json({ error: 'One of those workouts no longer exists' }, { status: 400 })
  }

  const { data: plan, error: planError } = await db
    .from('week_plans')
    .upsert({ team_id: teamId, week_start: weekStart, updated_at: new Date().toISOString() }, { onConflict: 'team_id,week_start' })
    .select('id')
    .single()
  if (planError || !plan) return NextResponse.json({ error: planError?.message ?? 'Plan not saved' }, { status: 500 })

  const { error: clearError } = await db.from('week_plan_slots').delete().eq('plan_id', plan.id)
  if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 })

  if (templateIds.length) {
    const { error: slotError } = await db
      .from('week_plan_slots')
      .insert(templateIds.map((t: string, i: number) => ({ plan_id: plan.id, slot: i + 1, template_id: t })))
    if (slotError) return NextResponse.json({ error: slotError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, plan: await loadWeekPlan(db, teamId, weekStart) })
}

export async function DELETE(req: NextRequest) {
  const { teamId, weekStart } = await req.json()
  if (!teamId || !isDateString(weekStart)) return NextResponse.json({ error: 'Missing team or week' }, { status: 400 })
  const db = createServerClient()
  // Slots go with it (on delete cascade)
  const { error } = await db.from('week_plans').delete().eq('team_id', teamId).eq('week_start', weekStart)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, plan: await loadWeekPlan(db, teamId, weekStart) })
}
