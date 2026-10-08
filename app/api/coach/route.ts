// FILE: app/api/coach/route.ts
//
// Coach sign-in.
//   POST   { pin }  → checks the PIN, sets the signed coach cookie
//   GET             → { signedIn: true/false }  (coach layout checks this on load)
//   DELETE          → signs out (clears the cookie)
//
// Wrong-PIN lockout: 5 wrong tries from the same network locks coach
// sign-in from that network for 15 minutes. Tries are counted in the
// auth_attempts table (supabase/migrations/2026-10-08_auth_attempts.sql).
// If that table doesn't exist yet, sign-in still works, just without
// the lockout.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import {
  COACH_COOKIE, COACH_SESSION_DAYS, coachAuthConfigured, createCoachToken, isCoachRequest,
} from '@/lib/coachAuth'

const MAX_TRIES = 5
const LOCK_MINUTES = 15

function clientKey(req: NextRequest): string {
  const ip = req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
  return `coach:${ip}`
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ signedIn: await isCoachRequest(req) })
}

export async function POST(req: NextRequest) {
  if (!coachAuthConfigured()) {
    return NextResponse.json(
      { error: 'Coach sign-in is not set up on the server yet.' },
      { status: 500 },
    )
  }

  const { pin } = await req.json().catch(() => ({ pin: '' }))
  const db = createServerClient()
  const key = clientKey(req)
  const now = Date.now()

  // ── Lockout check ──
  let failedCount = 0
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
  failedCount = attempt?.failed_count ?? 0

  // ── Wrong PIN ──
  if (typeof pin !== 'string' || pin !== process.env.COACH_PIN) {
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

  // ── Right PIN ──
  if (!attemptErr && attempt) await db.from('auth_attempts').delete().eq('key', key)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COACH_COOKIE, await createCoachToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COACH_SESSION_DAYS * 24 * 60 * 60,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COACH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
