// FILE: app/api/coach/attendance/credit/route.ts
//
// Weight room credit for a workout day she didn't fully finish
// (lib/attendance.ts: Full / Partial / Signed in, "To review").
//
//   GET ?playerId=&date=   how far she got that day: each check-in, her
//                          workout, every exercise with sets logged / sets
//                          asked for (Combine Day: each test), and any
//                          decision already made. Admins, and team coaches
//                          for their own players (COACH_ROUTES).
//   POST                   admins only. Decide the credit:
//                          { playerId, date, credit: 0–100 | null, note? }
//                          or many at once:
//                          { items: [{ playerId, date }], credit, note? }
//                          credit null = take the decision away (back to
//                          her % done). Saved in attendance_credit.
//
// Volleyball only (FEATURES.datedSchedule).

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCoach } from '@/lib/coachAuth'
import { canSeePlayer, notYourTeam, signInRequired } from '@/lib/coachScope'
import { clubDateOf, clubDayBounds } from '@/lib/clubTime'
import { isWarmupLabel } from '@/lib/warmup'
import { combineMetricsFor } from '@/lib/combine'
import { asGeneratedWorkout } from '@/lib/fullBodyWorkout'
import { FEATURES } from '@/lib/features'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type Db = ReturnType<typeof createServerClient>

interface ExerciseLine { name: string; done: number; planned: number }
interface BlockLine { label: string; exercises: ExerciseLine[] }

async function exerciseNames(db: Db, ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const list = [...new Set(ids)].filter(Boolean)
  if (!list.length) return out
  const [lib, old] = await Promise.all([
    db.from('exercise_library').select('id, name').in('id', list),
    db.from('exercises').select('id, name').in('id', list),
  ])
  for (const r of [...(old.data ?? []), ...(lib.data ?? [])]) out[r.id as string] = r.name as string
  return out
}

export async function GET(req: NextRequest) {
  if (!FEATURES.datedSchedule) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const coach = await getCoach(req)
  if (!coach) return signInRequired()
  const playerId = req.nextUrl.searchParams.get('playerId')
  const date = req.nextUrl.searchParams.get('date') ?? ''
  if (!playerId || !DATE_RE.test(date)) return NextResponse.json({ error: 'Missing playerId or date' }, { status: 400 })
  const db = createServerClient()
  if (!(await canSeePlayer(db, coach, playerId))) return notYourTeam()

  const { start, end } = clubDayBounds(date)
  const [{ data: player }, { data: sessionsRaw }, { data: decision }] = await Promise.all([
    db.from('players').select('id, name').eq('id', playerId).maybeSingle(),
    db.from('sessions').select('*').eq('player_id', playerId).gte('checked_in_at', start).lt('checked_in_at', end).order('checked_in_at'),
    db.from('attendance_credit').select('credit, note, set_by_name, updated_at').eq('player_id', playerId).eq('day', date).maybeSingle(),
  ])
  const sessions = (sessionsRaw ?? []).filter(s => clubDateOf(s.checked_in_at) === date)

  // Her team's workout that day, and any date override (older sessions didn't save theirs)
  const { data: pt } = await db.from('player_teams').select('team_id').eq('player_id', playerId).eq('is_primary', true).maybeSingle()
  const [{ data: sched }, { data: override }] = await Promise.all([
    pt?.team_id ? db.from('team_schedule').select('template_id').eq('team_id', pt.team_id).eq('scheduled_date', date).maybeSingle() : Promise.resolve({ data: null }),
    db.from('player_overrides').select('template_id').eq('player_id', playerId).eq('override_date', date).maybeSingle(),
  ])

  const out = []
  for (const s of sessions) {
    const generated = asGeneratedWorkout(s.generated_workout)
    const templateId: string | null = s.template_id ?? (generated ? null : override?.template_id ?? sched?.template_id ?? null)
    const { data: tmpl } = templateId ? await db.from('workout_templates').select('*').eq('id', templateId).maybeSingle() : { data: null }
    const { data: logs } = await db.from('set_logs').select('exercise_id, completed').eq('session_id', s.id)
    const doneBy: Record<string, number> = {}
    for (const l of logs ?? []) if (l.completed) doneBy[l.exercise_id] = (doneBy[l.exercise_id] ?? 0) + 1

    let blocks: BlockLine[] = []
    let combine: { tests: { label: string; done: boolean }[] } | null = null
    if (tmpl?.is_combine === true) {
      const { data: tries } = await db.from('combine_attempts').select('metric').eq('session_id', s.id)
      const have = new Set((tries ?? []).map(t => t.metric as string))
      combine = { tests: combineMetricsFor(tmpl.combine_metrics as string[] | null).map(m => ({ label: m.label, done: have.has(m.key) })) }
    } else if (tmpl) {
      const { data: tb } = await db.from('template_blocks').select('id, block_label, sets, sort_order').eq('template_id', tmpl.id).order('sort_order')
      const lifting = (tb ?? []).filter(b => !isWarmupLabel(b.block_label))
      const { data: be } = lifting.length
        ? await db.from('template_block_exercises').select('block_id, exercise_id, sort_order').in('block_id', lifting.map(b => b.id)).order('sort_order')
        : { data: [] }
      const names = await exerciseNames(db, [...(be ?? []).map(r => r.exercise_id as string), ...Object.keys(doneBy)])
      const used = new Set<string>()
      blocks = lifting.map(b => ({
        label: `Block ${b.block_label}`,
        exercises: (be ?? []).filter(r => r.block_id === b.id).map(r => {
          used.add(r.exercise_id)
          return { name: names[r.exercise_id] ?? 'Exercise', done: doneBy[r.exercise_id] ?? 0, planned: b.sets ?? 0 }
        }),
      }))
      // Sets logged on exercises that aren't in the workout (replacements, swaps)
      const other = Object.keys(doneBy).filter(id => !used.has(id))
      if (other.length) blocks.push({ label: 'Other exercises (replacements)', exercises: other.map(id => ({ name: names[id] ?? 'Exercise', done: doneBy[id], planned: 0 })) })
    } else if (generated) {
      const names = await exerciseNames(db, [...generated.blocks.flatMap(b => b.exercises.map(e => e.exerciseId)), ...Object.keys(doneBy)])
      blocks = generated.blocks.map(b => ({
        label: `Block ${b.label}`,
        exercises: b.exercises.map(e => ({ name: names[e.exerciseId] ?? 'Exercise', done: doneBy[e.exerciseId] ?? 0, planned: b.sets ?? 0 })),
      }))
    }

    const doneSets = Object.values(doneBy).reduce((a, b) => a + b, 0)
    const plannedFromBlocks = blocks.reduce((n, b) => n + b.exercises.reduce((m, e) => m + e.planned, 0), 0)
    out.push({
      sessionId: s.id,
      checkedInAt: s.checked_in_at,
      finishedAt: s.completed_at,
      workoutName: generated?.name ?? (tmpl?.name as string | undefined) ?? 'Workout',
      modified: !!s.template_id && !!sched?.template_id && s.template_id !== sched.template_id,
      done: combine ? combine.tests.filter(t => t.done).length : doneSets,
      planned: combine ? combine.tests.length : (typeof s.planned_sets === 'number' ? s.planned_sets : plannedFromBlocks),
      blocks,
      combine,
    })
  }

  return NextResponse.json({
    player: player ? { id: player.id, name: player.name } : null,
    date,
    sessions: out,
    decision: decision ? { credit: decision.credit, note: decision.note, by: decision.set_by_name, at: decision.updated_at } : null,
    canDecide: coach.isAdmin,
  })
}

export async function POST(req: NextRequest) {
  if (!FEATURES.datedSchedule) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const coach = await getCoach(req)
  if (!coach) return signInRequired()
  if (!coach.isAdmin) return NextResponse.json({ error: 'Only admins can give credit' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const items: { playerId: string; date: string }[] = Array.isArray(body.items)
    ? body.items
    : body.playerId ? [{ playerId: body.playerId, date: body.date }] : []
  const clean = items.filter(i => typeof i?.playerId === 'string' && DATE_RE.test(String(i?.date ?? '')))
  if (!clean.length) return NextResponse.json({ error: 'Missing playerId or date' }, { status: 400 })
  const credit = body.credit === null ? null : Math.round(Number(body.credit))
  if (credit !== null && !(credit >= 0 && credit <= 100)) return NextResponse.json({ error: 'Credit must be 0–100' }, { status: 400 })
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null

  const db = createServerClient()
  if (credit === null) {
    for (const i of clean) {
      const { error } = await db.from('attendance_credit').delete().eq('player_id', i.playerId).eq('day', i.date)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, count: clean.length })
  }
  const rows = clean.map(i => ({
    player_id: i.playerId, day: i.date, credit, note,
    set_by: coach.id, set_by_name: coach.name, updated_at: new Date().toISOString(),
  }))
  const { error } = await db.from('attendance_credit').upsert(rows, { onConflict: 'player_id,day' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, count: rows.length })
}
