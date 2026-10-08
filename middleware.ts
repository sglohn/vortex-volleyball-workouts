// FILE: middleware.ts   (repo root, next to package.json)
//
// Guards every /api/coach/* route. A request must carry a valid coach
// cookie (see lib/coachAuth.ts) or it gets 401.
//
// Left open on purpose:
//   /api/coach                 POST sign in, DELETE sign out, GET "am I signed in?"
//   GET /api/coach/teams       team list on the player sign-in screen + TV display
//   GET /api/coach/schedule    TV display (workout calendar, no player data)
//   GET /api/coach/phases      TV display (training phases, no player data)
//   GET /api/coach/templates   TV display (workout contents, no player data)
//
// The TV display (/coach/display and /api/display-snapshot for the Roku)
// only uses those open reads, so it keeps working without signing in.
//
// Also blocks pages and API routes for features this sport doesn't use
// (lib/features.ts): pages go to the coach dashboard (or the player's
// workout), API calls get 404.

import { NextRequest, NextResponse } from 'next/server'
import { COACH_COOKIE, coachAuthConfigured, verifyCoachToken } from '@/lib/coachAuth'
import { isHiddenApi, isHiddenPage } from '@/lib/features'

const PUBLIC_GET = new Set([
  '/api/coach/teams',
  '/api/coach/schedule',
  '/api/coach/phases',
  '/api/coach/templates',
])

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/\/+$/, '') || '/'

  // ── Features this sport doesn't use ──
  if (isHiddenPage(path)) {
    const home = path.startsWith('/player') ? '/player/workout' : '/coach/dashboard'
    return NextResponse.redirect(new URL(home, req.url))
  }
  if (isHiddenApi(path)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!path.startsWith('/api/coach')) return NextResponse.next()

  // ── Coach API sign-in check ──
  if (path === '/api/coach') return NextResponse.next()
  if (req.method === 'GET' && PUBLIC_GET.has(path)) return NextResponse.next()

  if (!coachAuthConfigured()) {
    return NextResponse.json(
      { error: 'Coach sign-in is not set up on the server (COACH_PIN / COACH_SESSION_SECRET).' },
      { status: 500 },
    )
  }

  const ok = await verifyCoachToken(req.cookies.get(COACH_COOKIE)?.value)
  if (!ok) return NextResponse.json({ error: 'Coach sign-in required' }, { status: 401 })

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/coach', '/api/coach/:path*',
    // feature-switched addresses (keep in step with lib/features.ts)
    '/coach/comparisons', '/coach/comparisons/:path*',
    '/player/profile', '/player/profile/:path*',
    '/coach/vbt', '/coach/vbt/:path*',
    '/coach/display', '/coach/display/:path*',
    '/api/player/measurements', '/api/player/measurements/:path*',
    '/api/display-snapshot', '/api/display-snapshot/:path*',
    '/api/display-teams', '/api/display-teams/:path*',
  ],
}
