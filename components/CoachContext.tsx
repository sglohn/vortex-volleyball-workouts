// FILE: components/CoachContext.tsx   (new file)
//
// Who is signed in on the coach side, for coach pages.
// app/coach/layout.tsx loads it from GET /api/coach and provides it;
// pages call useCoach() to hide buttons a team coach can't use.
//
// This only decides what the screens show. The server enforces the same
// rules on its own (middleware.ts, lib/coachScope.ts).

'use client'
import { createContext, useContext } from 'react'

export interface SignedInCoach {
  name: string
  role: 'admin' | 'coach'
  isAdmin: boolean
  teamIds: string[]
  /** Signed in with the old shared coach PIN during first-time setup */
  setup: boolean
}

const CoachContext = createContext<SignedInCoach | null>(null)

export const CoachProvider = CoachContext.Provider

/** The signed-in coach, or null while loading */
export function useCoach(): SignedInCoach | null {
  return useContext(CoachContext)
}

/** True once we know the signed-in person is an admin */
export function useIsAdmin(): boolean {
  return useContext(CoachContext)?.isAdmin === true
}

/** Coach pages a team coach (not an admin) can open. Everything else is admins only. */
export const COACH_PAGES = [
  '/coach/dashboard',
  '/coach/health',
  '/coach/requests',
  '/coach/teams',
  '/coach/players',
  '/coach/logs',
]

export function coachCanOpen(path: string): boolean {
  return COACH_PAGES.some(p => path === p || path.startsWith(`${p}/`))
}
