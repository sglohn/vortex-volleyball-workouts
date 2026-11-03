// FILE: app/api/coach/logs/combine/route.ts
//
// Workout Logs: fixing Combine Day numbers (combine_attempts), any day.
//
//   PATCH  { id, value }             fix a number (admins only, middleware.ts)
//   DELETE { id }                    delete a try (admins only)
//   POST   { ids, checked }          "Looks right" on flagged numbers, or undo
//                                    (admins and the player's team coaches)
//
// A fix goes through lib/combineEntry.ts, so the best try is written to that
// day's measurements row again (athleticism score, Comparisons, Profile),
// and the TV combine leaderboard, which reads the tries, shows the fix on
// its next refresh.
//
// Checks save the number with them (lib/combineFlags.ts combineFingerprint).
// If the number is changed later, the check stops counting and the flag is
// back. Columns: supabase/migrations/2026-11-02_combine_attempt_checks.sql
//
// Volleyball only (lib/features.ts).

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCoach } from '@/lib/coachAuth'
import { notYourTeam, signInRequired, visiblePlayerIds } from '@/lib/coachScope'
import { fixAttempt, removeAttempt } from '@/lib/combineEntry'
import { combineFingerprint } from '@/lib/combineFlags'

export const dynamic = 'force-dynamic'

const ID_RE = /^[0-9a-f-]{8,64}$/i

export async function PATCH(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return signInRequired()
  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Missing number id' }, { status: 400 })
  const db = createServerClient()
  const result = await fixAttempt(db, { id, value: body?.value })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return signInRequired()
  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Missing number id' }, { status: 400 })
  const db = createServerClient()
  const result = await removeAttempt(db, id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return signInRequired()

  const body = await req.json().catch(() => null)
  const ids: string[] = Array.isArray(body?.ids)
    ? [...new Set((body.ids as unknown[]).filter((v): v is string => typeof v === 'string' && ID_RE.test(v)))]
    : []
  if (!ids.length) return NextResponse.json({ error: 'No numbers picked' }, { status: 400 })
  if (ids.length > 200) return NextResponse.json({ error: 'Too many at once' }, { status: 400 })
  const checked = body?.checked !== false

  const db = createServerClient()
  const { data: rowsRaw, error } = await db.from('combine_attempts').select('id, player_id, value').in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (rowsRaw ?? []) as { id: string; player_id: string; value: number | string }[]
  if (!rows.length) return NextResponse.json({ error: 'Number not found' }, { status: 404 })

  // Team coaches: only their own players' numbers
  const visible = await visiblePlayerIds(db, coach)
  if (visible) {
    const allowed = new Set(visible)
    if (!rows.every(r => allowed.has(r.player_id))) return notYourTeam()
  }

  const now = new Date().toISOString()
  for (const r of rows) {
    const update = checked
      ? { checked_at: now, checked_by: coach.id, checked_by_name: coach.name, checked_values: combineFingerprint(r.value) }
      : { checked_at: null, checked_by: null, checked_by_name: null, checked_values: null }
    const { error: uErr } = await db.from('combine_attempts').update(update).eq('id', r.id)
    if (uErr) {
      const msg = /checked_/.test(uErr.message)
        ? 'The 2026-11-02_combine_attempt_checks.sql migration hasn’t been run yet'
        : uErr.message
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }
  return NextResponse.json({ ok: true, count: rows.length })
}
