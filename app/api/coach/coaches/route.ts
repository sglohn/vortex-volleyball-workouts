// FILE: app/api/coach/coaches/route.ts   (new file)
//
// Coach → Coaches: add and manage coach and admin accounts. Admins only
// (middleware.ts: not in COACH_ROUTES).
//
//   GET                                          → { coaches, teams }
//   POST   { name, role, pin, teamIds }          add an account
//   PATCH  { id, name?, role?, pin?, teamIds?, isActive? }
//                                                change an account. A new PIN
//                                                or turning it off signs that
//                                                person out everywhere.
//   DELETE { id }                                remove an account for good
//
// The last active admin can't be turned off, removed or made a coach, so
// there's always someone who can get in. (If it ever happens anyway, the old
// shared COACH_PIN opens the coach side again for first-time setup.)

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { PIN_RE, hashPin } from '@/lib/coachAuth'

export const dynamic = 'force-dynamic'

type Db = ReturnType<typeof createServerClient>
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const notReady = () => NextResponse.json(
  { error: 'Run the 2026-10-21_coach_accounts.sql migration in Supabase first.', notReady: true },
  { status: 503 },
)

function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const name = v.replace(/\s+/g, ' ').trim().slice(0, 60)
  return name || null
}

function cleanTeamIds(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)))]
}

async function setTeams(db: Db, coachId: string, teamIds: string[]) {
  const { error: delErr } = await db.from('coach_teams').delete().eq('coach_id', coachId)
  if (delErr) return delErr.message
  if (!teamIds.length) return null
  const { error } = await db.from('coach_teams').insert(teamIds.map(team_id => ({ coach_id: coachId, team_id })))
  return error?.message ?? null
}

async function otherActiveAdmins(db: Db, notId: string): Promise<number> {
  const { count } = await db
    .from('coaches')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin').eq('is_active', true).neq('id', notId)
  return count ?? 0
}

export async function GET() {
  const db = createServerClient()
  const { data, error } = await db
    .from('coaches')
    .select('id, name, role, is_active, last_signin_at, created_at, coach_teams(team_id)')
    .order('name')
  if (error) return notReady()

  const { data: teams } = await db
    .from('teams')
    .select('id, name, color, age_group, is_active')
    .eq('is_active', true)
    .order('age_group')

  const coaches = (data ?? []).map(c => {
    const links = (Array.isArray(c.coach_teams) ? c.coach_teams : c.coach_teams ? [c.coach_teams] : []) as { team_id: string }[]
    return {
      id: c.id,
      name: c.name,
      role: c.role === 'admin' ? 'admin' : 'coach',
      isActive: c.is_active,
      lastSigninAt: c.last_signin_at,
      teamIds: links.map(l => l.team_id),
    }
  })
  return NextResponse.json({ coaches, teams: teams ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const name = cleanName(body.name)
  const role = body.role === 'admin' ? 'admin' : 'coach'
  const pin = typeof body.pin === 'string' ? body.pin.trim() : ''
  const teamIds = cleanTeamIds(body.teamIds) ?? []
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  if (!PIN_RE.test(pin)) return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })

  const db = createServerClient()
  const { data: same } = await db.from('coaches').select('id').ilike('name', name).limit(1)
  if (same?.length) return NextResponse.json({ error: `There's already an account called ${name}` }, { status: 409 })

  const { data: coach, error } = await db
    .from('coaches')
    .insert({ name, role, pin_hash: await hashPin(pin) })
    .select('id')
    .single()
  if (error) return error.code === '42P01' ? notReady() : NextResponse.json({ error: error.message }, { status: 500 })

  const teamErr = await setTeams(db, coach.id, teamIds)
  if (teamErr) return NextResponse.json({ error: `Account added, but teams not saved: ${teamErr}` }, { status: 500 })
  return NextResponse.json({ ok: true, id: coach.id })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' && ID_RE.test(body.id) ? body.id : null
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = createServerClient()
  const { data: current, error: loadErr } = await db
    .from('coaches').select('id, name, role, is_active, session_version').eq('id', id).maybeSingle()
  if (loadErr) return notReady()
  if (!current) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  let signOut = false

  if (body.name !== undefined) {
    const name = cleanName(body.name)
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
    if (name.toLowerCase() !== current.name.toLowerCase()) {
      const { data: same } = await db.from('coaches').select('id').ilike('name', name).neq('id', id).limit(1)
      if (same?.length) return NextResponse.json({ error: `There's already an account called ${name}` }, { status: 409 })
    }
    updates.name = name
  }
  if (body.pin !== undefined && body.pin !== '') {
    const pin = typeof body.pin === 'string' ? body.pin.trim() : ''
    if (!PIN_RE.test(pin)) return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
    updates.pin_hash = await hashPin(pin)
    signOut = true
  }

  const nextRole = body.role === undefined ? current.role : body.role === 'admin' ? 'admin' : 'coach'
  const nextActive = body.isActive === undefined ? current.is_active : body.isActive === true
  const losingAdmin = current.role === 'admin' && current.is_active && (nextRole !== 'admin' || !nextActive)
  if (losingAdmin && (await otherActiveAdmins(db, id)) === 0) {
    return NextResponse.json({ error: 'This is the only admin. Add or turn on another admin first.' }, { status: 409 })
  }
  updates.role = nextRole
  updates.is_active = nextActive
  if (!nextActive && current.is_active) signOut = true
  if (signOut) updates.session_version = current.session_version + 1

  const { error } = await db.from('coaches').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const teamIds = cleanTeamIds(body.teamIds)
  if (teamIds) {
    const teamErr = await setTeams(db, id, teamIds)
    if (teamErr) return NextResponse.json({ error: `Saved, but teams not updated: ${teamErr}` }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' && ID_RE.test(body.id) ? body.id : null
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = createServerClient()
  const { data: current } = await db.from('coaches').select('role, is_active').eq('id', id).maybeSingle()
  if (!current) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  if (current.role === 'admin' && current.is_active && (await otherActiveAdmins(db, id)) === 0) {
    return NextResponse.json({ error: 'This is the only admin. Add or turn on another admin first.' }, { status: 409 })
  }
  const { error } = await db.from('coaches').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
