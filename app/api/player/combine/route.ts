// FILE: app/api/player/combine/route.ts
//
// Combine Day entries (lib/combine.ts, components/CombineDay.tsx).
//
//   GET    ?sessionId=&templateId=   the tests, every try so far, and the
//                                    player's numbers from last time
//   POST   { sessionId, templateId, metric, value }   save a try
//   DELETE { sessionId, templateId, id }              delete a try (a mistake)
//
// Saving and deleting go through lib/combineEntry.ts (shared with the coach
// station, app/api/coach/combine-station): each try goes in
// combine_attempts and the best try for that test is written to today's
// measurements row. Deleting every try for a test puts back the number from
// before today.
//
// Players can only enter numbers when a Combine Day template really is
// today's workout for that session (team schedule or a coach's date
// override), on today's unfinished session. Otherwise the page is read-only.
//
// Volleyball only: blocked in middleware.ts on lacrosse (lib/features.ts).

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { canAccessSession, signInAgain } from '@/lib/playerAuth'
import { clubDateString } from '@/lib/clubTime'
import {
  COMBINE_KEYS, combineMetric, combineMetricsFor,
  type CombineMetric, type CombineMetricKey,
} from '@/lib/combine'
import { deleteAttempt, measurementRows, num, saveAttempt } from '@/lib/combineEntry'

type Db = ReturnType<typeof createServerClient>

interface SessionRow {
  id: string
  player_id: string
  team_id: string | null
  template_id?: string | null
  checked_in_at: string
  completed_at: string | null
}

interface Loaded {
  session: SessionRow
  template: { id: string; name: string; description: string | null; combine_metrics: string[] | null }
  metrics: CombineMetric[]
  /** Why entries can't be changed right now, or null when they can */
  locked: string | null
}

// The session and its Combine Day template, after checking it's today's workout
async function loadCombine(db: Db, sessionId: string, templateIdParam: string | null): Promise<Loaded | NextResponse> {
  const { data: session } = await db.from('sessions').select('*').eq('id', sessionId).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  const s = session as SessionRow

  const templateId = s.template_id ?? templateIdParam
  if (!templateId) return NextResponse.json({ error: 'No Combine Day today' }, { status: 404 })
  const { data: template } = await db.from('workout_templates').select('*').eq('id', templateId).maybeSingle()
  if (!template || template.is_combine !== true) {
    return NextResponse.json({ error: 'No Combine Day today' }, { status: 404 })
  }

  const today = clubDateString()
  let scheduled = s.template_id === templateId
  if (!scheduled) {
    const { data: override } = await db
      .from('player_overrides')
      .select('template_id')
      .eq('player_id', s.player_id)
      .eq('override_date', today)
      .maybeSingle()
    if (override?.template_id) {
      scheduled = override.template_id === templateId
    } else if (s.team_id) {
      const { data: schedule } = await db
        .from('team_schedule')
        .select('template_id')
        .eq('team_id', s.team_id)
        .eq('scheduled_date', today)
        .maybeSingle()
      scheduled = schedule?.template_id === templateId
    }
  }

  let locked: string | null = null
  if (!scheduled) locked = 'Combine Day isn\'t on today\'s schedule.'
  else if (clubDateString(new Date(s.checked_in_at)) !== today) locked = 'This combine was on another day.'
  else if (s.completed_at) locked = 'You already finished this combine. Ask your coach to fix a number.'

  return {
    session: s,
    template: { id: template.id, name: template.name, description: template.description ?? null, combine_metrics: template.combine_metrics ?? null },
    metrics: combineMetricsFor(template.combine_metrics),
    locked,
  }
}

// Everything the Combine Day screen shows
async function combineState(db: Db, loaded: Loaded) {
  const { session, template, metrics, locked } = loaded
  const [{ data: attempts }, rows, { data: player }] = await Promise.all([
    db.from('combine_attempts').select('id, metric, value, created_at')
      .eq('session_id', session.id).order('created_at', { ascending: true }),
    measurementRows(db, session.player_id),
    db.from('players').select('name').eq('id', session.player_id).maybeSingle(),
  ])
  const previous: Partial<Record<CombineMetricKey, number>> = {}
  for (const k of COMBINE_KEYS) {
    const v = num(rows.previousRow?.[k])
    if (v != null) previous[k] = v
  }
  return {
    template: { id: template.id, name: template.name, description: template.description },
    metrics: metrics.map(m => m.key),
    attempts: (attempts ?? []).map(a => ({ id: a.id, metric: a.metric, value: Number(a.value), createdAt: a.created_at })),
    previous,
    previousDate: rows.previousRow?.measured_at ?? null,
    playerName: player?.name ?? null,
    locked,
  }
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  const templateId = req.nextUrl.searchParams.get('templateId')
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  if (!(await canAccessSession(req, sessionId))) return signInAgain()
  const db = createServerClient()
  const loaded = await loadCombine(db, sessionId, templateId)
  if (loaded instanceof NextResponse) return loaded
  return NextResponse.json(await combineState(db, loaded))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { sessionId, templateId, metric: metricKey, value } = body as { sessionId?: string; templateId?: string; metric?: string; value?: unknown }
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  if (!(await canAccessSession(req, sessionId))) return signInAgain()

  const db = createServerClient()
  const loaded = await loadCombine(db, sessionId, templateId ?? null)
  if (loaded instanceof NextResponse) return loaded
  if (loaded.locked) return NextResponse.json({ error: loaded.locked }, { status: 409 })

  const metric = combineMetric(metricKey)
  if (!metric || !loaded.metrics.some(m => m.key === metric.key)) {
    return NextResponse.json({ error: 'That test isn\'t part of this combine' }, { status: 400 })
  }
  const saved = await saveAttempt(db, { sessionId, playerId: loaded.session.player_id, metric, value })
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status })
  return NextResponse.json(await combineState(db, loaded))
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { sessionId, templateId, id } = body as { sessionId?: string; templateId?: string; id?: string }
  if (!sessionId || !id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (!(await canAccessSession(req, sessionId))) return signInAgain()

  const db = createServerClient()
  const loaded = await loadCombine(db, sessionId, templateId ?? null)
  if (loaded instanceof NextResponse) return loaded
  if (loaded.locked) return NextResponse.json({ error: loaded.locked }, { status: 409 })

  const removed = await deleteAttempt(db, { sessionId, playerId: loaded.session.player_id, id, metricOf: combineMetric })
  if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: removed.status })
  return NextResponse.json(await combineState(db, loaded))
}
