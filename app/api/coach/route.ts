// FILE: app/api/coach/route.ts
//
// Coach and admin sign-in.
//   POST   { coachId, pin }  → checks that account's PIN, sets the signed coach cookie
//          { pin }           → first-time setup only: the old shared COACH_PIN,
//                              while no active admin account exists yet
//   GET                      → { signedIn, coach: { name, role, isAdmin, teamIds, setup } }
//                              (coach layout checks this on load)
//   DELETE                   → signs out (clears the cookie)
//
// Wrong-PIN lockout: 5 wrong tries from the same network locks coach
// sign-in from that network for 15 minutes. Tries are counted in the
// auth_attempts table (supabase/migrations/2026-10-08_auth_attempts.sql).
// If that table doesn't exist yet, sign-in still works, just without
// the lockout.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import {
  COACH_COOKIE, COACH_SESSION_DAYS, PIN_RE, coachAuthConfigured, coachPin, createCoachToken,
  createSetupToken, getCoach, pinMatches, setupModeOpen,
} from '@/lib/coachAuth'

const MAX_TRIES = 5
const LOCK_MINUTES = 15
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function clientKey(req: NextRequest): string {
  const ip = req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
  return `coach:${ip}`
}

export async function GET(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return NextResponse.json({ signedIn: false })
  return NextResponse.json({
    signedIn: true,
    coach: { name: coach.name, role: coach.role, isAdmin: coach.isAdmin, teamIds: coach.teamIds, setup: coach.setup },
  })
}

export async function POST(req: NextRequest) {
  if (!coachAuthConfigured()) {
    return NextResponse.json(
      { error: 'Coach sign-in is not set up on the server yet (COACH_SESSION_SECRET).' },
      { status: 500 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const pin = typeof body.pin === 'string' ? body.pin.trim() : ''
  const coachId = typeof body.coachId === 'string' && ID_RE.test(body.coachId) ? body.coachId : null
  const key = clientKey(req)
  const now = Date.now()

  // The database is needed for accounts and the lockout. If its settings are
  // wrong, say so plainly instead of an error the screen reads as "Wrong PIN".
  let db: ReturnType<typeof createServerClient>
  try {
    db = createServerClient()
  } catch (e) {
    return NextResponse.json(
      { error: `Server can't reach the database: ${(e as Error).message}. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.` },
      { status: 500 },
    )
  }

  // ── Lockout check ──
  const { data: attempt, error: attemptErr } = await db
    .from('auth_attempts')
    .select('failed_count, locked_until')
    .eq('key', key)
    .maybeSingle()
  if (attemptErr) console.error('auth_attempts lookup failed (lockout off):', attemptErr.message)

  if (attempt?.locked_until && new Date(attempt.locked_until).getTime() > now) {
    const mins = Math.ceil((new Date(attempt.locked_until).getTime() - now) / 60000)
    return NextResponse.json(
      { error: `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` },
      { status: 429 },
    )
  }
  const failedCount = attempt?.failed_count ?? 0

  async function wrongPin() {
    if (!attemptErr) {
      const next = failedCount + 1
      const lock = next >= MAX_TRIES
      await db.from('auth_attempts').upsert({
        key,
        failed_count: lock ? 0 : next,
        locked_until: lock ? new Date(now + LOCK_MINUTES * 60000).toISOString() : null,
        updated_at: new Date(now).toISOString(),
      })
      if (lock) {
        return NextResponse.json(
          { error: `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes.` },
          { status: 429 },
        )
      }
    }
    return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 })
  }

  async function signedIn(token: string) {
    if (!attemptErr && attempt) await db.from('auth_attempts').delete().eq('key', key)
    const res = NextResponse.json({ ok: true })
    res.cookies.set(COACH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COACH_SESSION_DAYS * 24 * 60 * 60,
    })
    return res
  }

  // ── Account sign-in ──
  if (coachId) {
    const { data: coach, error } = await db
      .from('coaches')
      .select('id, pin_hash, is_active, session_version')
      .eq('id', coachId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: `Couldn't check the PIN: ${error.message}` }, { status: 500 })
    if (!coach || !coach.is_active) return NextResponse.json({ error: 'That account is turned off. Ask an admin.' }, { status: 401 })
    if (!PIN_RE.test(pin) || !(await pinMatches(pin, coach.pin_hash))) return wrongPin()

    await db.from('coaches').update({ last_signin_at: new Date(now).toISOString() }).eq('id', coach.id)
    return signedIn(await createCoachToken({ id: coach.id, sessionVersion: coach.session_version }))
  }

  // ── First-time setup: shared COACH_PIN ──
  if (!(await setupModeOpen(db))) {
    return NextResponse.json({ error: 'Pick your name to sign in.' }, { status: 400 })
  }
  if (!coachPin()) {
    return NextResponse.json({ error: 'No admin accounts yet, and COACH_PIN isn’t set in Vercel for first-time setup.' }, { status: 500 })
  }
  if (pin !== coachPin()) return wrongPin()
  return signedIn(await createSetupToken())
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COACH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
