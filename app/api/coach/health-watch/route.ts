// FILE: app/api/coach/health-watch/route.ts
//
// Health Board → Watch tab: soreness / injury patterns for players, teams and
// the club (lib/healthPatterns.ts, loaded by lib/healthWatch.ts).
//
//   GET              { flags, openCount, club }   (?count=1 → { open })
//   POST   { key, evidence, note? }   mark a flag Seen (with what was done)
//   DELETE { key }                    undo Seen
//
// Admins: every team plus the club section. Team coaches: their own teams and
// players only, and only their own teams'/players' flags can be marked seen.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCoach, type CoachIdentity } from '@/lib/coachAuth'
import { adminsOnly, canSeePlayer, canSeeTeam, notYourTeam, signInRequired } from '@/lib/coachScope'
import { loadWatch } from '@/lib/healthWatch'
import { RULES } from '@/lib/healthPatterns'

type Db = ReturnType<typeof createServerClient>

const KEY_RE = /^(player|team):[0-9a-f-]{36}(:[a-z_]+(:[a-z_]+)?)?$|^club(:[a-z_]+(:[a-z_]+)?)?$/

/** null when allowed, else the response to send */
async function checkKey(db: Db, coach: CoachIdentity, key: string): Promise<NextResponse | null> {
  if (!KEY_RE.test(key)) return NextResponse.json({ error: 'Unknown flag' }, { status: 400 })
  const [scope, id] = key.split(':')
  if (scope === 'club') return coach.isAdmin ? null : adminsOnly()
  if (scope === 'team') return canSeeTeam(coach, id) ? null : notYourTeam()
  return (await canSeePlayer(db, coach, id)) ? null : notYourTeam()
}

export async function GET(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return signInRequired()
  const db = createServerClient()
  try {
    const result = await loadWatch(db, coach)
    if (req.nextUrl.searchParams.get('count')) return NextResponse.json({ open: result.openCount })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return signInRequired()
  const { key, evidence, note } = await req.json()
  if (typeof key !== 'string') return NextResponse.json({ error: 'Missing key' }, { status: 400 })
  const db = createServerClient()
  const denied = await checkKey(db, coach, key)
  if (denied) return denied
  const { error } = await db.from('health_watch_seen').insert({
    key,
    evidence: Number.isFinite(Number(evidence)) ? Math.round(Number(evidence)) : 0,
    note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null,
    coach_id: coach.id,
    coach_name: coach.name,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return signInRequired()
  const { key } = await req.json()
  if (typeof key !== 'string') return NextResponse.json({ error: 'Missing key' }, { status: 400 })
  const db = createServerClient()
  const denied = await checkKey(db, coach, key)
  if (denied) return denied
  const since = new Date(Date.now() - RULES.seenDays * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await db.from('health_watch_seen').delete().eq('key', key).gte('seen_at', since)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
