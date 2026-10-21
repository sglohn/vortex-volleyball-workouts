// FILE: middleware.ts   (repo root, next to package.json)
//
// Guards every /api/coach/* route. A request must carry a valid coach
// cookie (see lib/coachAuth.ts) or it gets 401.
//
// Left open on purpose:
//   /api/coach                 POST sign in, DELETE sign out, GET "am I signed in?"
//   GET /api/coach/teams       team list on the player sign-in screen + TV display
//   GET /api/coach/schedule    TV display (workout calendar, no player data;
//                              volleyball only, see lib/features.ts)
//   GET /api/coach/phases      TV display (training phases, no player data)
//   GET /api/coach/templates   TV display (workout contents, no player data)
//   GET /api/coach/signin-list admin names for the Admin sign-in screen
//
// Coaches (role 'coach', lib/coachAuth.ts) can only use the routes in
// COACH_ROUTES below; everything else under /api/coach is admins only.
// Those routes then limit what they return to the coach's own teams
// (lib/coachScope.ts).
//
// The TV display (/coach/display and /api/display-snapshot for the Roku)
// only uses those open reads, so it keeps working without signing in.
//
// Also blocks pages and API routes for features this sport doesn't use
// (lib/features.ts): pages go to the coach dashboard (or the player's
// workout), API calls get 404.

import { NextRequest, NextResponse } from 'next/server'
import { coachAuthConfigured, getCoach } from '@/lib/coachAuth'
import { hiddenPageHome, isHiddenApi, isHiddenPage } from '@/lib/features'

const PUBLIC_GET = new Set([
  '/api/coach/teams',
  '/api/coach/schedule',
  '/api/coach/phases',
  '/api/coach/templates',
  '/api/coach/signin-list',
])

// What a team coach (not an admin) may call. Each of these routes also
// checks that the player / team / request belongs to one of the coach's teams.
const COACH_ROUTES: Record<string, string[]> = {
  '/api/coach/dashboard':       ['GET'],
  '/api/coach/health':          ['GET', 'POST'],              // view, add an injury / health note
  '/api/coach/team-detail':     ['GET'],
  '/api/coach/players':         ['GET'],
  '/api/coach/logs':            ['GET'],
  '/api/coach/session-detail':  ['GET'],
  '/api/coach/change-requests': ['GET', 'PATCH'],             // view, approve / decline, mark seen
  '/api/coach/overrides':       ['GET', 'POST', 'DELETE'],    // one player's exercise replacements only
  '/api/coach/player-programs': ['GET'],
  '/api/coach/week-plan':       ['GET'],
  '/api/coach/exercises':       ['GET'],
  '/api/coach/teams':           ['GET'],
  '/api/coach/schedule':        ['GET'],
  '/api/coach/phases':          ['GET'],
  '/api/coach/templates':       ['GET'],
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/\/+$/, '') || '/'

  // ── Features this sport doesn't use ──
  if (isHiddenPage(path)) {
    const to = new URL(hiddenPageHome(path), req.url)
    // keep ?team=... so an old Schedule link opens that team's week plan
    if (to.pathname === '/coach/week-plan') to.search = req.nextUrl.search
    return NextResponse.redirect(to)
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

  const coach = await getCoach(req)
  if (!coach) return NextResponse.json({ error: 'Coach sign-in required' }, { status: 401 })

  if (!coach.isAdmin && !COACH_ROUTES[path]?.includes(req.method)) {
    return NextResponse.json({ error: 'Only admins can do that' }, { status: 403 })
  }

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
    '/coach/schedule', '/coach/schedule/:path*',
    '/coach/week-plan', '/coach/week-plan/:path*',
    '/api/player/measurements', '/api/player/measurements/:path*',
    '/api/display-snapshot', '/api/display-snapshot/:path*',
    '/api/display-teams', '/api/display-teams/:path*',
  ],
}
