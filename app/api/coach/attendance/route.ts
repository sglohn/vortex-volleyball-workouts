// FILE: app/api/coach/attendance/route.ts
//
// Weight room attendance this season, with each player's health reports next
// to it (lib/attendance.ts has the rules, lib/attendanceLoad.ts the loading).
//
//   GET                 every team the coach can see: { teams: TeamAttendance[] }
//                       (Coach → Teams list and its Season Report), plus
//                       review: every partial / signed-in workout day from
//                       before today nobody has decided on yet
//                       ({ playerId, playerName, teamId, teamName, date, done,
//                       planned, combine, credit }), newest first
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
    // Partial / signed-in days waiting for a decision
    const waiting = r.teams.flatMap(t => (r.players[t.teamId] ?? []).flatMap(p =>
      p.attendance.days.filter(d => d.toReview).map(d => ({ playerId: p.playerId, teamId: t.teamId, teamName: t.teamName, ...d }))))
    const names: Record<string, string> = {}
    const ids = [...new Set(waiting.map(w => w.playerId))]
    for (let i = 0; i < ids.length; i += 150) {
      const { data } = await db.from('players').select('id, name').in('id', ids.slice(i, i + 150))
      for (const p of data ?? []) names[p.id] = p.name
    }
    const review = waiting
      .map(w => ({ playerId: w.playerId, playerName: names[w.playerId] ?? 'Player', teamId: w.teamId, teamName: w.teamName, date: w.date, status: w.status, done: w.done ?? 0, planned: w.planned ?? 0, combine: !!w.combine, credit: w.credit ?? 0 }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.teamName.localeCompare(b.teamName, undefined, { numeric: true }) || a.playerName.localeCompare(b.playerName))
    return NextResponse.json({ seasonStart: r.seasonStart, today: r.today, teams: r.teams, review })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load attendance' }, { status: 500 })
  }
}
