import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const db = createServerClient()
  const teamId  = req.nextUrl.searchParams.get('teamId')
  const mode    = req.nextUrl.searchParams.get('mode') // 'active' | 'history' | 'trends'

  // Build player ID filter if team is selected
  let playerIds: string[] | null = null
  if (teamId) {
    const { data: teamPlayers } = await db
      .from('player_teams')
      .select('player_id')
      .eq('team_id', teamId)
    playerIds = teamPlayers?.map(p => p.player_id) ?? []
  }

  if (mode === 'trends') {
    // Return all resolved + active for trend analysis
    let query = db
      .from('health_reports')
      .select('id, body_part, report_type, injury_type, severity, status, reported_at, resolved_at, player_id')
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

    return NextResponse.json({ byBodyPart, byType, bySeverity, byMonth, total: reports.length, avgDays })
  }

  if (mode === 'history') {
    let query = db
      .from('health_reports')
      .select('*, players!inner(id, name, jersey_number)')
      .eq('status', 'resolved')
      .order('resolved_at', { ascending: false })
      .limit(100)
    if (playerIds) query = query.in('player_id', playerIds)
    const { data: resolved } = await query
    return NextResponse.json({ resolved: resolved ?? [] })
  }

  // Default: active + unconfirmed
  let query = db
    .from('health_reports')
    .select('*, players!inner(id, name, jersey_number)')
    .in('status', ['active', 'monitoring'])
    .order('reported_at', { ascending: false })
  if (playerIds?.length) query = query.in('player_id', playerIds)

  const { data: reports, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const unconfirmed = (reports ?? []).filter(r => !r.confirmed_by_coach)
  const active = (reports ?? []).filter(r => r.confirmed_by_coach)

  return NextResponse.json({ unconfirmed, active, total: reports?.length ?? 0 })
}

export async function POST(req: NextRequest) {
  const { playerId, reportType, bodyPart, injuryType, severity, description, painLevel, expectedReturn, coachNotes } = await req.json()

  if (!playerId || !bodyPart) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const db = createServerClient()
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
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ report })
}
