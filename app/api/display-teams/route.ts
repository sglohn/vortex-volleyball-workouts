// FILE: app/api/display-teams/route.ts
//
// Team list for the Roku TV Display app's Left/Right buttons: only teams
// with a workout scheduled today. Falls back to all active teams (with
// todayOnly: false) when nothing is scheduled today.

import { NextResponse } from 'next/server'
import { displayTeamsForToday } from '@/lib/displayTeams'

export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await displayTeamsForToday()
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
