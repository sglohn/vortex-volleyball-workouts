// FILE: lib/playerAuth.ts
//
// Player sign-in pass, checked on the server.
//
// When a player enters her correct PIN (app/api/checkin), the server returns
// a signed pass for her player ID, good for 18 hours. The player screens send
// it with every request in the "x-player-pass" header (lib/playerPass.ts),
// and the routes that read or write a player's own data only answer when the
// pass matches that player. A signed-in coach (coach cookie) can always get
// through.
//
// Without this, the routes trusted any player ID, and the sign-in screen
// lists every player's ID, so anyone could read any player's soreness and
// injury history without a PIN.
//
// Signed with COACH_SESSION_SECRET (with a separate "player" label, so a
// player pass can never be used as a coach cookie or the other way round).

import { NextRequest, NextResponse } from 'next/server'
import { isCoachRequest, safeEqual, sign } from '@/lib/coachAuth'
import { createServerClient } from '@/lib/supabase'

export const PLAYER_PASS_HEADER = 'x-player-pass'
const PASS_HOURS = 18
const ID_RE = /^[0-9a-f-]{8,64}$/i

function secret(): string | null {
  const s = process.env.COACH_SESSION_SECRET?.trim()
  return s && s.length >= 32 ? `${s}|player-pass` : null
}

/** Makes a pass for a player who just entered her correct PIN */
export async function createPlayerPass(playerId: string): Promise<string> {
  const key = secret()
  if (!key) throw new Error('Player sign-in is not configured (COACH_SESSION_SECRET)')
  const exp = Date.now() + PASS_HOURS * 60 * 60 * 1000
  return `${playerId}.${exp}.${await sign(`player.${playerId}.${exp}`, key)}`
}

/** The player ID a valid, unexpired pass belongs to, or null */
export async function verifyPlayerPass(pass: string | null | undefined): Promise<string | null> {
  const key = secret()
  if (!key || !pass) return null
  const parts = pass.split('.')
  if (parts.length !== 3) return null
  const [playerId, expStr, sig] = parts
  if (!playerId || !ID_RE.test(playerId)) return null
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now()) return null
  return safeEqual(sig ?? '', await sign(`player.${playerId}.${expStr}`, key)) ? playerId : null
}

/** True when the request comes from a signed-in coach, or carries this player's pass */
export async function canAccessPlayer(req: NextRequest, playerId: string | null | undefined): Promise<boolean> {
  if (await isCoachRequest(req)) return true
  if (!playerId) return false
  return (await verifyPlayerPass(req.headers.get(PLAYER_PASS_HEADER))) === playerId
}

/** Same check, for routes that only know the session ID */
export async function canAccessSession(req: NextRequest, sessionId: string | null | undefined): Promise<boolean> {
  if (await isCoachRequest(req)) return true
  if (!sessionId || !ID_RE.test(sessionId)) return false
  const passPlayer = await verifyPlayerPass(req.headers.get(PLAYER_PASS_HEADER))
  if (!passPlayer) return false
  const { data } = await createServerClient().from('sessions').select('player_id').eq('id', sessionId).maybeSingle()
  return data?.player_id === passPlayer
}

/** The reply when the pass is missing, expired or for someone else */
export function signInAgain() {
  return NextResponse.json({ error: 'Please sign in again', signIn: true }, { status: 401 })
}
