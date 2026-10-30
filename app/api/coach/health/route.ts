// FILE: app/api/coach/health/route.ts
//
// Coach Health Board. Admins see the whole club; a team coach sees, and can
// add reports for, only the players on their teams (lib/coachScope.ts).
//
// Each report has an availability level (Aches & Pains / Modified /
// Out / Return to Play) and a timeline in health_report_updates
// (lib/availability.ts). Active and History include the timeline; Trends
// adds days-out and return-to-play numbers.
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCoach } from '@/lib/coachAuth'
import { canSeePlayer, canSeeTeam, inList, notYourTeam, onlyAllowed, signInRequired, visiblePlayerIds } from '@/lib/coachScope'
import { isAvailability, stageTotals, type Availability, type HealthUpdate } from '@/lib/availability'
import { logHealthUpdate } from '@/lib/healthUpdates'

const UPDATES = 'health_report_updates(id, report_id, kind, from_availability, to_availability, note, coach_name, created_at)'

export async function GET(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return signInRequired()
  const db = createServerClient()
  const teamId  = req.nextUrl.searchParams.get('teamId')
  const mode    = req.nextUrl.searchParams.get('mode') // 'active' | 'history' | 'trends'
  if (teamId && !canSeeTeam(coach, teamId)) return notYourTeam()

  // Build player ID filter if team is selected (team coaches: always their teams)
  let playerIds: string[] | null = await visiblePlayerIds(db, coach)
  if (teamId) {
    const { data: teamPlayers } = await db
      .from('player_teams')
      .select('player_id')
      .eq('team_id', teamId)
    playerIds = onlyAllowed(teamPlayers?.map(p => p.player_id) ?? [], playerIds)
  }
  if (playerIds) playerIds = inList(playerIds)

  if (mode === 'trends') {
    // Return all resolved + active for trend analysis.
    // Everyday soreness is left out so it doesn't drown out real injury trends.
    let query = db
      .from('health_reports')
      .select(`id, body_part, report_type, injury_type, severity, status, reported_at, resolved_at, player_id, availability, ${UPDATES}`)
      .neq('report_type', 'soreness')
      .order('reported_at', { ascending: true })
    if (playerIds) query = query.in('player_id', playerIds)
    const { data: all } = await query

    const reports = all ?? []

    // By body part
    const byBodyPart: Record<string, number> = {}
    for (const r of reports) {
      byBodyPart[r.body_part] = (byBodyPart[r.body_part] ?? 0) + 1
    }

    // By injury type
    const byType: Record<string, number> = {}
    for (const r of reports) {
      const t = r.injury_type ?? 'unspecified'
      byType[t] = (byType[t] ?? 0) + 1
    }

    // By severity
    const bySeverity: Record<string, number> = {}
    for (const r of reports) {
      const s = r.severity ?? 'unspecified'
      bySeverity[s] = (bySeverity[s] ?? 0) + 1
    }

    // By month (last 12 months)
    const byMonth: Record<string, number> = {}
    for (const r of reports) {
      const month = r.reported_at?.slice(0, 7) // YYYY-MM
      if (month) byMonth[month] = (byMonth[month] ?? 0) + 1
    }

    // Avg days to resolve
    const resolved = reports.filter(r => r.status === 'resolved' && r.resolved_at)
    const avgDays = resolved.length
      ? Math.round(resolved.reduce((sum, r) => {
          const diff = new Date(r.resolved_at).getTime() - new Date(r.reported_at).getTime()
          return sum + diff / (1000 * 60 * 60 * 24)
        }, 0) / resolved.length)
      : null

    // By availability level (current level of reports still open)
    const byAvailability: Record<string, number> = {}
    for (const r of reports) {
      if (r.status === 'resolved') continue
      const a = isAvailability(r.availability) ? r.availability : 'full'
      byAvailability[a] = (byAvailability[a] ?? 0) + 1
    }

    // Time out and back: only reports that ever had the player Out
    const outCases = reports
      .map(r => stageTotals(r, r.health_report_updates as HealthUpdate[]))
      .filter(t => t.everOut)
    const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null
    const clearedOut = outCases.filter(t => t.cleared)
    const outStats = {
      cases: outCases.length,
      stillOpen: outCases.length - clearedOut.length,
      avgDaysOut: avg(outCases.map(t => t.days.out)),
      avgDaysReturnToPlay: avg(outCases.filter(t => t.days.return_to_play > 0).map(t => t.days.return_to_play)),
      // Report start to Cleared, cleared cases only
      avgDaysToFull: avg(clearedOut.map(t => t.totalDays)),
    }

    return NextResponse.json({ byBodyPart, byType, bySeverity, byAvailability, outStats, byMonth, total: reports.length, avgDays })
  }

  if (mode === 'history') {
    let query = db
      .from('health_reports')
      .select(`*, players!inner(id, name, jersey_number), ${UPDATES}`)
      .eq('status', 'resolved')
      .order('resolved_at', { ascending: false })
      .limit(100)
    if (playerIds) query = query.in('player_id', playerIds)
    const { data: resolved } = await query
    return NextResponse.json({ resolved: resolved ?? [] })
  }

  // Default: active + unconfirmed — most recently reported first
  // (a repeat report bumps last_reported_at, so it rises back to the top)
  let query = db
    .from('health_reports')
    .select(`*, players!inner(id, name, jersey_number), ${UPDATES}`)
    .in('status', ['active', 'monitoring'])
    .order('last_reported_at', { ascending: false, nullsFirst: false })
    .order('reported_at', { ascending: false })
  if (playerIds) query = query.in('player_id', playerIds)

  const { data: reports, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const unconfirmed = (reports ?? []).filter(r => !r.confirmed_by_coach)
  const active = (reports ?? []).filter(r => r.confirmed_by_coach)

  return NextResponse.json({ unconfirmed, active, total: reports?.length ?? 0 })
}

export async function POST(req: NextRequest) {
  const { playerId, reportType, bodyPart, injuryType, severity, description, painLevel, expectedReturn, coachNotes, availability } = await req.json()

  if (!playerId || !bodyPart) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const coach = await getCoach(req)
  if (!coach) return signInRequired()
  const db = createServerClient()
  if (!(await canSeePlayer(db, coach, playerId))) return notYourTeam()
  const level: Availability = isAvailability(availability) ? availability : 'full'
  const now = new Date().toISOString()
  const { data: report, error } = await db
    .from('health_reports')
    .insert({
      player_id: playerId,
      report_type: reportType ?? 'major_injury',
      body_part: bodyPart,
      injury_type: injuryType ?? null,
      severity: severity ?? null,
      description: description ?? null,
      pain_level: painLevel ?? null,
      reported_by: 'coach',
      confirmed_by_coach: true,
      coach_notes: coachNotes ?? null,
      expected_return: expectedReturn ?? null,
      status: 'active',
      availability: level,
      availability_since: now,
      last_reported_at: now,
      report_count: 1,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logHealthUpdate(db, { reportId: report.id, playerId, kind: 'logged', to: level, coach })
  return NextResponse.json({ report })
}
