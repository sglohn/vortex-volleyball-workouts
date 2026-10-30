// FILE: app/api/coach/logs/check/route.ts
//
// Workout Logs "Looks right": mark flagged sets as checked (or undo it).
//
//   POST { ids: string[], checked: boolean }
//
// Admins and team coaches (middleware.ts COACH_ROUTES). Team coaches can
// only check sets from their own players (lib/coachScope.ts).
//
// The set's current values are saved with the check (lib/setChecks.ts), so
// if the set is changed later the check stops counting and the flag is back.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCoach } from '@/lib/coachAuth'
import { notYourTeam, signInRequired, visiblePlayerIds } from '@/lib/coachScope'
import { setFingerprint, type CheckableSet } from '@/lib/setChecks'

export const dynamic = 'force-dynamic'

type Row = CheckableSet & { id: string; session_id: string }

export async function POST(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return signInRequired()

  const body = await req.json().catch(() => null)
  const ids: string[] = Array.isArray(body?.ids)
    ? [...new Set((body.ids as unknown[]).filter((v): v is string => typeof v === 'string' && v.length > 0))]
    : []
  if (!ids.length) return NextResponse.json({ error: 'No sets picked' }, { status: 400 })
  if (ids.length > 200) return NextResponse.json({ error: 'Too many sets at once' }, { status: 400 })
  const checked = body?.checked !== false

  const db = createServerClient()
  const { data: rowsRaw, error } = await db
    .from('set_logs')
    .select('*')
    .in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (rowsRaw ?? []) as Row[]
  if (!rows.length) return NextResponse.json({ error: 'Set not found' }, { status: 404 })

  // ── Team coaches: every set must be one of their players' ──
  const visible = await visiblePlayerIds(db, coach)
  if (visible) {
    const sessionIds = [...new Set(rows.map(r => r.session_id))]
    const { data: sessions } = await db.from('sessions').select('id, player_id').in('id', sessionIds)
    const allowed = new Set(visible)
    const ok = sessionIds.every(sid => {
      const s = (sessions ?? []).find(x => x.id === sid)
      return !!s && allowed.has(s.player_id as string)
    })
    if (!ok) return notYourTeam()
  }

  // ── Save ──
  const now = new Date().toISOString()
  for (const r of rows) {
    const update = checked
      ? { checked_at: now, checked_by: coach.id, checked_by_name: coach.name, checked_values: setFingerprint(r) }
      : { checked_at: null, checked_by: null, checked_by_name: null, checked_values: null }
    const { error: uErr } = await db.from('set_logs').update(update).eq('id', r.id)
    if (uErr) {
      const msg = /checked_/.test(uErr.message)
        ? 'The 2026-10-30_set_log_checks.sql migration hasn’t been run yet'
        : uErr.message
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, count: rows.length })
}
