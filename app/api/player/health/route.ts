import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  const all = req.nextUrl.searchParams.get('all')
  const db = createServerClient()

  if (all) {
    const { data: reports } = await db
      .from('health_reports')
      .select('*, players(name, jersey_number)')
      .in('status', ['active', 'monitoring'])
      .order('reported_at', { ascending: false })
    return NextResponse.json({ reports: reports ?? [] })
  }

  if (playerId) {
    const { data: reports } = await db
      .from('health_reports')
      .select('*')
      .eq('player_id', playerId)
      .order('reported_at', { ascending: false })
    return NextResponse.json({ reports: reports ?? [] })
  }

  return NextResponse.json({ error: 'Missing playerId or all param' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const { playerId, reportType, bodyPart, injuryType, severity, description, painLevel, reportedBy, coachNotes, expectedReturn } = await req.json()

  if (!playerId || !reportType || !bodyPart) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const db = createServerClient()
  const { data: report, error } = await db
    .from('health_reports')
    .insert({
      player_id: playerId,
      report_type: reportType,
      body_part: bodyPart,
      injury_type: injuryType ?? null,
      severity: severity ?? null,
      description: description ?? null,
      pain_level: painLevel ?? null,
      reported_by: reportedBy ?? 'player',
      confirmed_by_coach: reportedBy === 'coach',
      coach_notes: coachNotes ?? null,
      expected_return: expectedReturn ?? null,
      status: 'active',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ report })
}

export async function PATCH(req: NextRequest) {
  const { id, confirmedByCoach, coachNotes, status, expectedReturn, severity, injuryType } = await req.json()

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = createServerClient()
  const updates: Record<string, unknown> = {}
  if (confirmedByCoach !== undefined) updates.confirmed_by_coach = confirmedByCoach
  if (coachNotes !== undefined) updates.coach_notes = coachNotes
  if (severity !== undefined) updates.severity = severity
  if (injuryType !== undefined) updates.injury_type = injuryType
  if (status !== undefined) {
    updates.status = status
    if (status === 'resolved') updates.resolved_at = new Date().toISOString()
  }
  if (expectedReturn !== undefined) updates.expected_return = expectedReturn

  const { data: report, error } = await db
    .from('health_reports')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ report })
}
