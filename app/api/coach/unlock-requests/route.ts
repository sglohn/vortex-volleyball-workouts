// FILE: app/api/coach/unlock-requests/route.ts   (new file)
//
// Coach -> Requests: players asking to start their next week-plan Day today
// (Bruisers Lacrosse, FEATURES.weekPlan; hidden on Vortex, lib/features.ts).
// Admins only: not listed in middleware.ts COACH_ROUTES, and checked here too.
//
// A player can ask when she finished a workout today that she started on an
// earlier day (did the sets, forgot to tap Finish). See lib/weekPlan.ts and
// app/api/player/day-unlock.
//
//   GET ?count=1  → { open }        pending requests (nav badge)
//   GET           → { requests }    pending first, then the last 14 days of
//                                   answered ones. Each carries the workout
//                                   she finished late (when she started it,
//                                   when her sets were logged, when she
//                                   tapped Finish) so the admin can decide.
//   PATCH { id, action: 'approve' | 'decline' }
//
// Approving lets her start that Day as soon as she signs in again (today or
// any later day that week). Declining leaves the one-a-day rule as is; the
// Day opens tomorrow like normal. A request left unanswered past the day it
// was sent drops off the list: by then the Day has opened anyway.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCoach } from '@/lib/coachAuth'
import { adminsOnly, signInRequired } from '@/lib/coachScope'
import { loadWeekPlan } from '@/lib/weekPlan'
import { clubDateString, clubDayBounds } from '@/lib/clubTime'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HISTORY_DAYS = 14

const notReady = () => NextResponse.json(
  { error: 'Run the 2026-10-22_day_unlock_requests.sql migration in Supabase first.', notReady: true },
  { status: 503 },
)

interface UnlockRow {
  id: string
  player_id: string
  team_id: string | null
  week_start: string
  week_slot: number
  finished_session_id: string | null
  status: 'pending' | 'approved' | 'declined'
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
}

export async function GET(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return signInRequired()
  if (!coach.isAdmin) return adminsOnly()
  const db = createServerClient()

  // Only today's unanswered requests still matter
  const todayStart = clubDayBounds(clubDateString()).start

  if (req.nextUrl.searchParams.get('count')) {
    const { count, error } = await db
      .from('day_unlock_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('created_at', todayStart)
    return NextResponse.json({ open: error ? 0 : count ?? 0 })
  }

  const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString()
  const [openRes, recentRes] = await Promise.all([
    db.from('day_unlock_requests').select('*').eq('status', 'pending').gte('created_at', todayStart).order('created_at', { ascending: false }).limit(100),
    db.from('day_unlock_requests').select('*').neq('status', 'pending').gte('created_at', since).order('created_at', { ascending: false }).limit(60),
  ])
  if (openRes.error) return notReady()
  const rows = [...(openRes.data ?? []), ...(recentRes.data ?? [])] as UnlockRow[]
  if (!rows.length) return NextResponse.json({ requests: [] })

  const playerIds = [...new Set(rows.map(r => r.player_id))]
  const sessionIds = [...new Set(rows.map(r => r.finished_session_id).filter((x): x is string => !!x))]
  const coachIds = [...new Set(rows.map(r => r.resolved_by).filter((x): x is string => !!x))]

  const [playersRes, sessionsRes, setsRes, coachesRes] = await Promise.all([
    db.from('players').select('id, name, jersey_number').in('id', playerIds),
    sessionIds.length
      ? db.from('sessions').select('id, week_slot, template_id, checked_in_at, completed_at').in('id', sessionIds)
      : Promise.resolve({ data: [] as never[] }),
    sessionIds.length
      ? db.from('set_logs').select('session_id, logged_at').in('session_id', sessionIds)
      : Promise.resolve({ data: [] as never[] }),
    coachIds.length
      ? db.from('coaches').select('id, name').in('id', coachIds)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const playerById = new Map((playersRes.data ?? []).map(p => [p.id as string, p]))
  const coachById = new Map((coachesRes.data ?? []).map(c => [c.id as string, c.name as string]))
  const sessionById = new Map((sessionsRes.data ?? []).map(s => [s.id as string, s]))

  // Sets per finished session: how many, first and last logged
  const setsBySession = new Map<string, { count: number; first: string | null; last: string | null }>()
  for (const l of (setsRes.data ?? []) as { session_id: string; logged_at: string | null }[]) {
    const cur = setsBySession.get(l.session_id) ?? { count: 0, first: null, last: null }
    cur.count++
    if (l.logged_at) {
      if (!cur.first || l.logged_at < cur.first) cur.first = l.logged_at
      if (!cur.last || l.logged_at > cur.last) cur.last = l.logged_at
    }
    setsBySession.set(l.session_id, cur)
  }

  // Workout names: the Day she's asking for comes from her team's plan
  const templateIds = [...new Set((sessionsRes.data ?? []).map(s => s.template_id as string | null).filter((x): x is string => !!x))]
  const { data: templates } = templateIds.length
    ? await db.from('workout_templates').select('id, name').in('id', templateIds)
    : { data: [] }
  const templateName = new Map((templates ?? []).map(t => [t.id as string, t.name as string]))

  const planCache = new Map<string, Awaited<ReturnType<typeof loadWeekPlan>> | null>()
  async function dayName(teamId: string | null, weekStart: string, slot: number): Promise<string | null> {
    if (!teamId) return null
    const key = `${teamId}|${weekStart}`
    if (!planCache.has(key)) {
      try { planCache.set(key, await loadWeekPlan(db, teamId, weekStart)) } catch { planCache.set(key, null) }
    }
    return planCache.get(key)?.slots.find(s => s.slot === slot)?.name ?? null
  }

  const requests = await Promise.all(rows.map(async r => {
    const p = playerById.get(r.player_id)
    const s = r.finished_session_id ? sessionById.get(r.finished_session_id) : undefined
    const sets = r.finished_session_id ? setsBySession.get(r.finished_session_id) : undefined
    return {
      id: r.id,
      status: r.status,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      resolvedBy: r.resolved_by ? coachById.get(r.resolved_by) ?? null : null,
      player: { id: r.player_id, name: (p?.name as string) ?? 'Unknown player', jersey: (p?.jersey_number as string | null) ?? null },
      weekStart: r.week_start,
      slot: r.week_slot,
      slotName: await dayName(r.team_id, r.week_start, r.week_slot),
      finished: s ? {
        slot: s.week_slot as number,
        name: s.template_id ? templateName.get(s.template_id as string) ?? null : null,
        startedAt: s.checked_in_at as string,
        finishedAt: s.completed_at as string | null,
        sets: sets?.count ?? 0,
        firstSetAt: sets?.first ?? null,
        lastSetAt: sets?.last ?? null,
      } : null,
    }
  }))

  return NextResponse.json({ requests })
}

export async function PATCH(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return signInRequired()
  if (!coach.isAdmin) return adminsOnly()
  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : null
  const action = body.action === 'approve' ? 'approved' : body.action === 'decline' ? 'declined' : null
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (!action) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const db = createServerClient()
  const { data, error } = await db
    .from('day_unlock_requests')
    .update({ status: action, resolved_at: new Date().toISOString(), resolved_by: coach.id })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
  if (error) return notReady()
  if (!data?.length) return NextResponse.json({ error: 'This request was already answered' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
