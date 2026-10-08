// FILE: lib/coachAuth.ts
//
// Coach sign-in cookie, checked on the server.
//
// Before this file, "signed in as coach" was only a flag in the browser
// (localStorage 'vx_coach'), and the /api/coach/* routes never checked
// anything. Now a successful coach PIN sets a signed, httpOnly cookie,
// and middleware.ts refuses coach API calls that don't carry a valid one.
//
// The cookie holds an expiry time plus a signature. The signature is made
// with COACH_SESSION_SECRET and also covers COACH_PIN, so changing the
// coach PIN in Vercel signs every coach out.
//
// Works in both the Edge runtime (middleware) and Node (API routes):
// it only uses Web Crypto (globalThis.crypto.subtle).
//
// Required environment variables (set in each Vercel project):
//   COACH_PIN              4-digit coach PIN
//   COACH_SESSION_SECRET   long random string (32+ characters)

export const COACH_COOKIE = 'coach_session'
export const COACH_SESSION_DAYS = 14

/** The coach PIN from Vercel, ignoring stray spaces or line breaks */
export function coachPin(): string {
  return (process.env.COACH_PIN ?? '').trim()
}

function getSecret(): string | null {
  const secret = process.env.COACH_SESSION_SECRET?.trim()
  const pin = coachPin()
  if (!secret || secret.length < 32 || !pin) return null
  return `${secret}|${pin}`
}

export function coachAuthConfigured(): boolean {
  return getSecret() !== null
}

function toBase64Url(bytes: ArrayBuffer): string {
  let bin = ''
  const arr = new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return toBase64Url(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}

// Compare without stopping at the first different character
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Makes the cookie value for a coach who just entered the right PIN
export async function createCoachToken(): Promise<string> {
  const secret = getSecret()
  if (!secret) throw new Error('Coach sign-in is not configured')
  const exp = Date.now() + COACH_SESSION_DAYS * 24 * 60 * 60 * 1000
  return `${exp}.${await sign(`coach.${exp}`, secret)}`
}

// True only for an unexpired cookie signed with the current secret and PIN
export async function verifyCoachToken(token: string | undefined | null): Promise<boolean> {
  const secret = getSecret()
  if (!secret || !token) return false
  const dot = token.indexOf('.')
  if (dot < 1) return false
  const expStr = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  return safeEqual(sig, await sign(`coach.${expStr}`, secret))
}

// For API routes outside /api/coach that have some coach-only actions
// (for example app/api/player/health/route.ts)
export async function isCoachRequest(req: { cookies: { get(name: string): { value: string } | undefined } }): Promise<boolean> {
  return verifyCoachToken(req.cookies.get(COACH_COOKIE)?.value)
}
