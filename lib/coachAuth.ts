// FILE: lib/coachAuth.ts
//
// Coach and admin sign-in, checked on the server.
//
// Each coach or admin has their own account (coaches table, see
// supabase/migrations/2026-10-21_coach_accounts.sql) with a 4-digit PIN.
// A correct PIN sets a signed, httpOnly cookie that says which account is
// signed in. Every request looks the account up again, so turning someone
// off, changing their PIN, changing their teams or moving them to admin
// takes effect on their next tap, without waiting for the cookie to expire.
//
// Cookie value:  a.<coachId>.<sessionVersion>.<expiry>.<signature>
//
// First-time setup: while there's no active admin account yet (or before
// the migration has been run), the old shared COACH_PIN still signs in, as
// an admin with no name. Those cookies look like  <expiry>.<signature>  and
// their signature also covers COACH_PIN. As soon as an active admin account
// exists they stop working.
//
// Works in both the Edge runtime (middleware) and Node (API routes):
// it only uses Web Crypto (globalThis.crypto.subtle) and supabase-js.
//
// Environment variables (set in each Vercel project):
//   COACH_SESSION_SECRET   long random string (32+ characters), required
//   COACH_PIN              old shared coach PIN, only used for first-time setup

import { createServerClient } from '@/lib/supabase'

export const COACH_COOKIE = 'coach_session'
export const COACH_SESSION_DAYS = 14

export type CoachRole = 'admin' | 'coach'

export interface CoachIdentity {
  /** coaches.id; null for the first-time-setup sign-in (shared COACH_PIN) */
  id: string | null
  name: string
  role: CoachRole
  isAdmin: boolean
  /** Teams this coach is on. Admins see everything, whatever this says. */
  teamIds: string[]
  /** Signed in with the old shared COACH_PIN during first-time setup */
  setup: boolean
}

/** The old shared coach PIN from Vercel, ignoring stray spaces or line breaks */
export function coachPin(): string {
  return (process.env.COACH_PIN ?? '').trim()
}

function sessionSecret(): string | null {
  const secret = process.env.COACH_SESSION_SECRET?.trim()
  return secret && secret.length >= 32 ? secret : null
}

// Secret for first-time-setup cookies: also covers COACH_PIN, so changing
// that PIN in Vercel signs those sessions out (same as before accounts)
function setupSecret(): string | null {
  const secret = sessionSecret()
  const pin = coachPin()
  return secret && pin ? `${secret}|${pin}` : null
}

export function coachAuthConfigured(): boolean {
  return sessionSecret() !== null
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  let bin = ''
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function sign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return toBase64Url(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}

// Compare without stopping at the first different character
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ── PINs ──
// Stored as  pbkdf2$<iterations>$<salt>$<hash>  so a database leak doesn't
// show anyone's PIN as typed.

const PIN_ITERATIONS = 100_000

async function pbkdf2(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return toBase64Url(bits)
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
  return `pbkdf2$${PIN_ITERATIONS}$${toBase64Url(salt)}$${await pbkdf2(pin, salt, PIN_ITERATIONS)}`
}

export async function pinMatches(pin: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false
  const [kind, iterStr, saltStr, hash] = stored.split('$')
  const iterations = Number(iterStr)
  if (kind !== 'pbkdf2' || !Number.isFinite(iterations) || !saltStr || !hash) return false
  return safeEqual(await pbkdf2(pin, fromBase64Url(saltStr), iterations), hash)
}

export const PIN_RE = /^\d{4}$/

// ── Cookies ──

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Cookie value for a coach/admin account that just entered the right PIN */
export async function createCoachToken(account: { id: string; sessionVersion: number }): Promise<string> {
  const secret = sessionSecret()
  if (!secret) throw new Error('Coach sign-in is not configured')
  const exp = Date.now() + COACH_SESSION_DAYS * 24 * 60 * 60 * 1000
  const body = `a.${account.id}.${account.sessionVersion}.${exp}`
  return `${body}.${await sign(`coach-account.${body}`, secret)}`
}

/** Cookie value for the first-time-setup sign-in with the shared COACH_PIN */
export async function createSetupToken(): Promise<string> {
  const secret = setupSecret()
  if (!secret) throw new Error('Coach sign-in is not configured')
  const exp = Date.now() + COACH_SESSION_DAYS * 24 * 60 * 60 * 1000
  return `${exp}.${await sign(`coach.${exp}`, secret)}`
}

type ParsedToken =
  | { kind: 'account'; id: string; version: number }
  | { kind: 'setup' }

// Checks the signature and expiry only. Who it is gets looked up after.
async function parseToken(token: string | undefined | null): Promise<ParsedToken | null> {
  if (!token) return null
  const parts = token.split('.')

  if (parts.length === 5 && parts[0] === 'a') {
    const secret = sessionSecret()
    if (!secret) return null
    const [, id, verStr, expStr, sig] = parts
    const exp = Number(expStr)
    const version = Number(verStr)
    if (!ID_RE.test(id) || !Number.isInteger(version) || !Number.isFinite(exp) || exp < Date.now()) return null
    const body = parts.slice(0, 4).join('.')
    if (!safeEqual(sig, await sign(`coach-account.${body}`, secret))) return null
    return { kind: 'account', id, version }
  }

  if (parts.length === 2) {
    const secret = setupSecret()
    if (!secret) return null
    const [expStr, sig] = parts
    const exp = Number(expStr)
    if (!Number.isFinite(exp) || exp < Date.now()) return null
    if (!safeEqual(sig, await sign(`coach.${expStr}`, secret))) return null
    return { kind: 'setup' }
  }

  return null
}

type Db = ReturnType<typeof createServerClient>

/**
 * True while the shared COACH_PIN may still be used: no active admin account
 * exists yet, or the coaches table hasn't been created (migration not run).
 */
export async function setupModeOpen(db: Db = createServerClient()): Promise<boolean> {
  const { count, error } = await db
    .from('coaches')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true)
  if (error) return true
  return (count ?? 0) === 0
}

const SETUP_IDENTITY: CoachIdentity = {
  id: null, name: 'Setup', role: 'admin', isAdmin: true, teamIds: [], setup: true,
}

async function lookup(token: string | undefined | null): Promise<CoachIdentity | null> {
  const parsed = await parseToken(token)
  if (!parsed) return null
  const db = createServerClient()

  if (parsed.kind === 'setup') {
    return (await setupModeOpen(db)) ? SETUP_IDENTITY : null
  }

  const { data: coach, error } = await db
    .from('coaches')
    .select('id, name, role, is_active, session_version, coach_teams(team_id)')
    .eq('id', parsed.id)
    .maybeSingle()
  if (error || !coach || !coach.is_active || coach.session_version !== parsed.version) return null

  const links = (Array.isArray(coach.coach_teams) ? coach.coach_teams : coach.coach_teams ? [coach.coach_teams] : []) as { team_id: string }[]
  const role: CoachRole = coach.role === 'admin' ? 'admin' : 'coach'
  return {
    id: coach.id,
    name: coach.name,
    role,
    isAdmin: role === 'admin',
    teamIds: links.map(l => l.team_id),
    setup: false,
  }
}

type CookieReq = { cookies: { get(name: string): { value: string } | undefined } }

// One lookup per request, however many helpers ask
const cache = new WeakMap<object, Promise<CoachIdentity | null>>()

/** The signed-in coach or admin, or null */
export function getCoach(req: CookieReq): Promise<CoachIdentity | null> {
  let hit = cache.get(req)
  if (!hit) {
    hit = lookup(req.cookies.get(COACH_COOKIE)?.value).catch(() => null)
    cache.set(req, hit)
  }
  return hit
}

/** True for any signed-in coach or admin */
export async function isCoachRequest(req: CookieReq): Promise<boolean> {
  return (await getCoach(req)) !== null
}

/** True only for a signed-in admin */
export async function isAdminRequest(req: CookieReq): Promise<boolean> {
  return (await getCoach(req))?.isAdmin === true
}
