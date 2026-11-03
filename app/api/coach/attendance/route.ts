// FILE: app/api/coach/attendance/route.ts
//
// Weight room attendance this season, with each player's health reports next
// to it (lib/attendance.ts has the rules, lib/attendanceLoad.ts the loading).
//
//   GET                 every team the coach can see: { teams: TeamAttendance[] }
//                       (Coach → Teams list and its Season Report)
//   GET ?teamId=<id>    that team plus its players:
//                       { team: TeamAttendance, players: PlayerAttendance[] }
//                       (Coach → Teams → a team's roster)
//
// Admins see every team; a team coach only their own (COACH_ROUTES in
// middleware.ts). Volleyball only (FEATURES.datedSchedule, lib/features.ts).
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCoach } from '@/lib/coachAuth'
import { canSeeTeam, notYourTeam, signInRequired } from '@/lib/coachScope'
import { loadAttendance } from '@/lib/attendanceLoad'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return signInRequired()
  const db = createServerClient()
  const teamId = req.nextUrl.searchParams.get('teamId')

  try {
    if (teamId) {
      if (!canSeeTeam(coach, teamId)) return notYourTeam()
      const r = await loadAttendance(db, [teamId])
      return NextResponse.json({
        seasonStart: r.seasonStart, today: r.today,
        team: r.teams[0] ?? null,
        players: r.players[teamId] ?? [],
      })
    }

    let teamIds = coach.teamIds
    if (coach.isAdmin) {
      const { data } = await db.from('teams').select('id').eq('is_active', true)
      teamIds = (data ?? []).map(t => t.id as string)
    }
    const r = await loadAttendance(db, teamIds)
    return NextResponse.json({ seasonStart: r.seasonStart, today: r.today, teams: r.teams })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load attendance' }, { status: 500 })
  }
}
