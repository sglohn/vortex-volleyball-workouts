// FILE: app/api/player/home/route.ts
//
// GET ?playerId=  The player's own home page (app/player/page.tsx), after
// she signs in on her phone. Volleyball only (dated team schedules); lacrosse
// players keep the week card on the sign-in screen and get 404 here.
//
// Returns:
//   player      name, team (name + color)
//   today       today's workout (lib/checkin.ts pickWorkout, so it's the
//               same one "Begin" will start: date override → program →
//               self-guided → team schedule → trains-with team), and her
//               session today if she already began (in progress or done)
//   next        her next scheduled workout after today
//   attendance  her season attendance on her team (lib/attendanceLoad.ts,
//               the same numbers coaches see on Coach → Teams)
//   season      workouts begun / finished and sets logged since Aug 1
//   recent      her last 3 workouts
//   numbers     her latest measurements (only from this season: the Nov 3
//               reset cleared older ones), verticals worked out from reach
//
// Reads only. Needs her pass (or an admin / her team coach).

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { canAccessPlayer, signInAgain } from '@/lib/playerAuth'
import { clubDateOf, clubDateString, clubDayBounds } from '@/lib/clubTime'
import { pickWorkout } from '@/lib/checkin'
import { loadAttendance } from '@/lib/attendanceLoad'
import { seasonStart } from '@/lib/attendance'
import { asGeneratedWorkout } from '@/lib/fullBodyWorkout'
import { FEATURES } from '@/lib/features'

type Db = ReturnType<typeof createServerClient>

const MEASURE_KEYS = [
  'height_in', 'wingspan_in', 'standing_reach_in', 'standing_vertical_in', 'approach_vertical_in',
  'acceleration_sec', 'pro_agility_sec', 'swing_velocity_mph',
] as const

async function templateInfo(db: Db, id: string | null): Promise<{ name: string; isCombine: boolean } | null> {
  if (!id) return null
  const { data } = await db.from('workout_templates').select('*').eq('id', id).maybeSingle()
  if (!data) return null
  return { name: (data.name as string) ?? 'Workout', isCombine: data.is_combine === true }
}

/** What a past session was called (same order as app/api/player/history) */
async function sessionName(db: Db, s: Record<string, unknown>): Promise<string> {
  const generated = asGeneratedWorkout(s.generated_workout)
  if (generated) return generated.name
  if (s.template_id) return (await templateInfo(db, s.template_id as string))?.name ?? 'Workout'
  if (s.team_id) {
    const { data } = await db.from('team_schedule').select('template_id')
      .eq('team_id', s.team_id as string).eq('scheduled_date', clubDateOf(s.checked_in_at as string)).maybeSingle()
    const t = await templateInfo(db, data?.template_id ?? null)
    if (t) return t.name
  }
  return 'Workout'
}

export async function GET(req: NextRequest) {
  if (!FEATURES.datedSchedule) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const playerId = req.nextUrl.searchParams.get('playerId')
  if (!playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })
  if (!(await canAccessPlayer(req, playerId))) return signInAgain()

  const db = createServerClient()
  const today = clubDateString()
  const from = seasonStart(today)

  const { data: player } = await db.from('players').select('*').eq('id', playerId).eq('is_active', true).maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  // Her team (primary)
  const { data: pt } = await db.from('player_teams').select('team_id').eq('player_id', playerId).eq('is_primary', true).maybeSingle()
  const teamId: string | null = pt?.team_id ?? null
  const { data: team } = teamId
    ? await db.from('teams').select('id, name, color').eq('id', teamId).maybeSingle()
    : { data: null }

  // ── Today ──
  const picked = await pickWorkout(db, player, teamId, today)
  const tmpl = await templateInfo(db, picked.templateId)
  const workoutName = tmpl?.name ?? (picked.selfGuided ? 'Your full-body workout' : null)

  const { start: dayStart, end: dayEnd } = clubDayBounds(today)
  const { data: todaySessions } = await db.from('sessions').select('*')
    .eq('player_id', playerId).gte('checked_in_at', dayStart).lt('checked_in_at', dayEnd)
    .order('checked_in_at', { ascending: false })
  // An unfinished one first (that's the one Begin resumes), else the latest
  const open = (todaySessions ?? []).find(s => !s.completed_at) ?? null
  const latest = open ?? (todaySessions ?? [])[0] ?? null
  let todaySession: { id: string; finished: boolean; bodyCheckDone: boolean; setsDone: number; name: string } | null = null
  if (latest) {
    const [{ data: checks }, { count }] = await Promise.all([
      db.from('body_checks').select('id').eq('session_id', latest.id).limit(1),
      db.from('set_logs').select('id', { count: 'exact', head: true }).eq('session_id', latest.id).eq('completed', true),
    ])
    todaySession = {
      id: latest.id,
      finished: !!latest.completed_at,
      bodyCheckDone: (checks?.length ?? 0) > 0,
      setsDone: count ?? 0,
      name: await sessionName(db, latest),
    }
  }

  // ── Next scheduled workout after today (her team, or the team she comes in with) ──
  const scheduleTeams = [teamId, player.trains_with_team_id].filter((t): t is string => !!t)
  let next: { date: string; name: string } | null = null
  if (scheduleTeams.length) {
    const { data: rows } = await db.from('team_schedule').select('scheduled_date, template_id')
      .in('team_id', scheduleTeams).not('template_id', 'is', null).gt('scheduled_date', today)
      .order('scheduled_date').limit(1)
    const row = rows?.[0]
    if (row) next = { date: row.scheduled_date, name: (await templateInfo(db, row.template_id))?.name ?? 'Workout' }
  }

  // ── Attendance on her team ──
  let attendance = null
  if (teamId) {
    try {
      const result = await loadAttendance(db, [teamId], today)
      attendance = result.players[teamId]?.find(p => p.playerId === playerId)?.attendance ?? null
    } catch { attendance = null }
  }

  // ── This season: workouts and sets ──
  const { start: seasonFrom } = clubDayBounds(from)
  const { data: seasonSessions } = await db.from('sessions').select('*')
    .eq('player_id', playerId).gte('checked_in_at', seasonFrom)
    .order('checked_in_at', { ascending: false })
  const sessions = seasonSessions ?? []
  let setsLogged = 0
  if (sessions.length) {
    const { count } = await db.from('set_logs').select('id', { count: 'exact', head: true })
      .in('session_id', sessions.map(s => s.id)).eq('completed', true)
    setsLogged = count ?? 0
  }
  const season = {
    workouts: sessions.length,
    finished: sessions.filter(s => !!s.completed_at).length,
    setsLogged,
  }

  // ── Last 3 workouts ──
  const recent = await Promise.all(sessions.slice(0, 3).map(async s => {
    const { count } = await db.from('set_logs').select('id', { count: 'exact', head: true }).eq('session_id', s.id).eq('completed', true)
    return { id: s.id, date: clubDateOf(s.checked_in_at), name: await sessionName(db, s), finished: !!s.completed_at, setsDone: count ?? 0 }
  }))

  // ── Latest numbers (each one's most recent value) ──
  let numbers: Record<string, { value: number; date: string }> | null = null
  if (FEATURES.measurements) {
    const { data: rows } = await db.from('measurements').select('*').eq('player_id', playerId)
      .order('measured_at', { ascending: false }).limit(50)
    numbers = {}
    for (const r of rows ?? []) {
      for (const k of MEASURE_KEYS) {
        const v = r[k]
        if (v != null && numbers[k] == null) numbers[k] = { value: Number(v), date: String(r.measured_at).slice(0, 10) }
      }
    }
  }

  return NextResponse.json({
    today: {
      date: today,
      workoutName,
      isCombine: tmpl?.isCombine === true,
      hasWorkout: !!workoutName,
      session: todaySession,
    },
    player: { id: playerId, name: player.name, team: team ? { id: team.id, name: team.name, color: team.color } : null },
    next,
    attendance,
    season,
    recent,
    numbers,
  })
}
