// FILE: lib/playerPass.ts
//
// Browser side of the player sign-in pass (see lib/playerAuth.ts).
//
// playerFetch() works like fetch() but sends the signed-in player's pass
// (saved in localStorage 'vx_session' at sign-in). If the server says the
// pass is missing or expired, it clears the sign-in and goes back to the
// sign-in screen.
//
// The weight room tablets sign in several players on one device, so they
// pass each player's own pass to withPass() instead.
'use client'

export const PLAYER_PASS_HEADER = 'x-player-pass'

export function storedPlayerPass(): string | null {
  try {
    const s = localStorage.getItem('vx_session')
    return s ? (JSON.parse(s).playerPass ?? null) : null
  } catch { return null }
}

/** Adds a specific player's pass to request options */
export function withPass(pass: string | null | undefined, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers)
  if (pass) headers.set(PLAYER_PASS_HEADER, pass)
  return { ...init, headers }
}

/** fetch() with the signed-in player's pass; back to sign-in if it's no longer valid */
export async function playerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, withPass(storedPlayerPass(), init))
  if (res.status === 401) {
    try { localStorage.removeItem('vx_session') } catch { /* ignore */ }
    if (typeof window !== 'undefined') window.location.href = '/'
  }
  return res
}

/**
 * After Finish on her own phone (volleyball): keep her signed in so she can
 * go back to her home page (app/player/page.tsx), but drop the workout.
 * Coaches' workout profiles, Team Mode and lacrosse sign out as before.
 * Returns true when she's still signed in.
 */
export function endStoredWorkout(weekPlan: boolean): boolean {
  try {
    const raw = localStorage.getItem('vx_session')
    const s = raw ? JSON.parse(raw) : null
    if (!s || weekPlan || s.teamMode || s.isCoach || !s.playerPass) {
      localStorage.removeItem('vx_session')
      return false
    }
    localStorage.setItem('vx_session', JSON.stringify({
      ...s, sessionId: null, templateId: null, isResumed: false, bodyCheckDone: false,
    }))
    return true
  } catch {
    try { localStorage.removeItem('vx_session') } catch { /* ignore */ }
    return false
  }
}
