// FILE: app/api/coach/change-requests/route.ts   (new file)
//
// Coach → Requests: players' exercise change requests, and self-guided
// players' easier-option swaps. Coach only (middleware.ts).
//
//   GET ?count=1  → { open }   pending requests + swaps not yet seen (nav badge)
//   GET           → { requests, exercises }
//                   open items first, then the last 14 days of answered ones.
//                   Each request carries the choices for approving it:
//                   options.easier / options.harder (levels of the same
//                   movement, closest first) and options.backup.
//   PATCH { id, action: 'approve', replacementId, applies: 'today'|'ongoing', coachNote? }
//         { id, action: 'decline', coachNote? }
//         { id, action: 'seen' }          self-guided swap: mark as seen
//         { action: 'seen_all' }
//
// Approving adds a player replacement (player_exercise_skips, skip_type
// 'replace') for the exercise the workout calls for — the same thing the
// coach can add on a player's page, where it can also be removed early:
//   today    ends today; any ongoing replacement comes back tomorrow
//   ongoing  until the coach removes it; replaces earlier ongoing ones
// Approving "back to the workout's exercise" removes the player's
// replacements for it instead.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { clubDateString, clubDateOf } from '@/lib/clubTime'
import { asText, changeOptions, reasonLabel, requestSummary, wantsLabel } from '@/lib/exerciseLevels'

type Db = ReturnType<typeof createServerClient>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HISTORY_DAYS = 14

const notReady = () => NextResponse.json(
  { error: 'Run the 2026-10-10_exercise_levels_and_change_requests.sql migration in Supabase first.', notReady: true },
  { status: 503 },
)

interface LibRow {
  id: string
  name: string
  category: string | null
  variation_family: string | null
  variation_level: number | null
  backup_exercise_id: string | null
}

async function loadLibrary(db: Db): Promise<LibRow[]> {
  const { data, error } = await db
    .from('exercise_library')
    .select('id, name, category, variation_family, variation_level, backup_exercise_id')
    .eq('is_active', true)
    .order('name')
  if (!error) return (data ?? []) as LibRow[]
  const basic = await db.from('exercise_library').select('id, name, category').eq('is_active', true).order('name')
  return ((basic.data ?? []) as Pick<LibRow, 'id' | 'name' | 'category'>[])
    .map(r => ({ ...r, variation_family: null, variation_level: null, backup_exercise_id: null }))
}

const openFilter = 'status.eq.pending,and(kind.eq.self_guided_swap,coach_seen_at.is.null)'

export async function GET(req: NextRequest) {
  const db = createServerClient()

  if (req.nextUrl.searchParams.get('count')) {
    const { count, error } = await db
      .from('exercise_change_requests')
      .select('id', { count: 'exact', head: true })
      .or(openFilter)
    return NextResponse.json({ open: error ? 0 : count ?? 0 })
  }

  const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString()
  const [openRes, recentRes, library] = await Promise.all([
    db.from('exercise_change_requests').select('*').or(openFilter).order('created_at', { ascending: false }).limit(100),
    db.from('exercise_change_requests').select('*')
      .gte('created_at', since)
      .in('status', ['approved', 'declined', 'noted'])
      .order('created_at', { ascending: false })
      .limit(60),
    loadLibrary(db),
  ])
  if (openRes.error) return notReady()

  const seen = new Set<string>()
  const rows = [...(openRes.data ?? []), ...(recentRes.data ?? [])].filter(r => !seen.has(r.id) && seen.add(r.id))

  const playerIds = [...new Set(rows.map(r => r.player_id))]
  const { data: players } = playerIds.length
    ? await db.from('players').select('id, name, jersey_number').in('id', playerIds)
    : { data: [] }
  const playerById = new Map((players ?? []).map(p => [p.id, p]))
  const nameById = new Map(library.map(e => [e.id, e.name]))

  // How many times each player has asked/swapped in the last 30 days (spotting a pattern)
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: recentForPlayers } = playerIds.length
    ? await db.from('exercise_change_requests').select('player_id').in('player_id', playerIds).gte('created_at', monthAgo).neq('status', 'cancelled')
    : { data: [] }
  const monthCount = new Map<string, number>()
  for (const r of recentForPlayers ?? []) monthCount.set(r.player_id, (monthCount.get(r.player_id) ?? 0) + 1)

  const brief = (e: LibRow) => ({ id: e.id, name: e.name, level: e.variation_level })

  const requests = rows.map(r => {
    const player = playerById.get(r.player_id)
    // Choices are levels of what the player was shown (which may already be a replacement)
    const opts = r.exercise_id ? changeOptions(library, r.exercise_id) : null
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      open: r.status === 'pending' || (r.kind === 'self_guided_swap' && !r.coach_seen_at),
      createdAt: r.created_at,
      sessionDate: clubDateOf(r.created_at),
      player: { id: r.player_id, name: player?.name ?? 'Unknown player', jersey: player?.jersey_number ?? null },
      requestsLast30Days: monthCount.get(r.player_id) ?? 1,
      exercise: r.exercise_id ? { id: r.exercise_id, name: nameById.get(r.exercise_id) ?? 'Deleted exercise' } : null,
      originalExercise: r.original_exercise_id ? { id: r.original_exercise_id, name: nameById.get(r.original_exercise_id) ?? 'Deleted exercise' } : null,
      wants: r.wants,
      wantsLabel: wantsLabel(r.wants),
      reason: r.reason,
      reasonLabel: reasonLabel(r.reason),
      summary: requestSummary(r),
      bodyPart: r.body_part,
      painLevel: r.pain_level,
      note: r.note,
      replacement: r.replacement_exercise_id ? { id: r.replacement_exercise_id, name: nameById.get(r.replacement_exercise_id) ?? 'Deleted exercise' } : null,
      applies: r.applies,
      coachNote: r.coach_note,
      resolvedAt: r.resolved_at,
      options: opts ? {
        family: opts.family,
        level: opts.level,
        levelCount: opts.levelCount,
        easier: opts.easier.map(brief),
        harder: opts.harder.map(brief),
        backup: opts.backup ? brief(opts.backup) : null,
      } : null,
    }
  })

  return NextResponse.json({
    requests,
    exercises: library.map(e => ({ id: e.id, name: e.name, category: e.category })),
  })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = body.action as string
  const db = createServerClient()
  const now = new Date().toISOString()

  if (action === 'seen_all') {
    const { error } = await db.from('exercise_change_requests')
      .update({ coach_seen_at: now })
      .eq('kind', 'self_guided_swap')
      .is('coach_seen_at', null)
    if (error) return notReady()
    return NextResponse.json({ ok: true })
  }

  const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : null
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: request, error: loadError } = await db.from('exercise_change_requests').select('*').eq('id', id).single()
  if (loadError) return loadError.code === 'PGRST116' ? NextResponse.json({ error: 'Request not found' }, { status: 404 }) : notReady()

  if (action === 'seen') {
    await db.from('exercise_change_requests').update({ coach_seen_at: now }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  if (request.status !== 'pending' || request.kind !== 'request') {
    return NextResponse.json({ error: request.status === 'cancelled' ? 'The player withdrew this request' : 'This request was already answered' }, { status: 409 })
  }
  const coachNote = asText(body.coachNote, 500)

  if (action === 'decline') {
    const { error } = await db.from('exercise_change_requests')
      .update({ status: 'declined', coach_note: coachNote, resolved_at: now, coach_seen_at: now })
      .eq('id', id).eq('status', 'pending')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action !== 'approve') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const replacementId = typeof body.replacementId === 'string' && UUID.test(body.replacementId) ? body.replacementId : null
  if (!replacementId) return NextResponse.json({ error: 'Pick the exercise they should do' }, { status: 400 })
  let applies: 'today' | 'ongoing' = body.applies === 'ongoing' ? 'ongoing' : 'today'

  const { data: replacement } = await db.from('exercise_library').select('id, name').eq('id', replacementId).single()
  if (!replacement) return NextResponse.json({ error: 'That exercise no longer exists' }, { status: 400 })

  const originalId: string | null = request.original_exercise_id ?? request.exercise_id
  if (!originalId) return NextResponse.json({ error: 'The exercise in this request was deleted' }, { status: 400 })

  const today = clubDateString()
  const reasonText = ['Change request', [reasonLabel(request.reason), request.body_part].filter(Boolean).join(' — '), coachNote]
    .filter(Boolean).join(': ').slice(0, 300)

  let skipId: string | null = null
  if (replacementId === originalId) {
    // Back to the workout's own exercise: end the player's replacements for it
    applies = 'ongoing'
    await db.from('player_exercise_skips')
      .update({ is_active: false })
      .eq('player_id', request.player_id).eq('exercise_id', originalId).eq('is_active', true)
  } else {
    if (applies === 'ongoing') {
      // The new ongoing replacement takes over from older ones
      await db.from('player_exercise_skips')
        .update({ is_active: false })
        .eq('player_id', request.player_id).eq('exercise_id', originalId).eq('is_active', true)
    }
    const { data: skip, error: skipError } = await db.from('player_exercise_skips')
      .insert({
        player_id: request.player_id,
        exercise_id: originalId,
        replacement_exercise_id: replacementId,
        skip_type: 'replace',
        reason: reasonText,
        starts_on: today,
        ends_on: applies === 'today' ? today : null,
        created_by: 'coach',
        is_active: true,
      })
      .select('id')
      .single()
    if (skipError) return NextResponse.json({ error: skipError.message }, { status: 500 })
    skipId = skip.id
  }

  const { error } = await db.from('exercise_change_requests')
    .update({
      status: 'approved',
      replacement_exercise_id: replacementId,
      applies,
      skip_id: skipId,
      coach_note: coachNote,
      resolved_at: now,
      coach_seen_at: now,
    })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, replacement })
}
