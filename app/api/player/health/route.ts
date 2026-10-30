// FILE: app/api/player/health/route.ts
//
// Health / soreness reports.
//   Players:  GET ?playerId=  (their own reports)   POST (new report)
//   Coaches and admins (coach cookie, see lib/coachAuth.ts):
//             GET ?all=1   PATCH   (team coaches: their own players only)
//   Admins only:  DELETE
//   Availability levels + timeline (Aches & Pains / Modified / Out /
//   Return to Play / Cleared): lib/availability.ts. Every level change,
//   progress note, Cleared and Reopen adds a health_report_updates row.
//   A report only counts as coach-entered (reportedBy: 'coach') when the
//   coach cookie is present.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCoach, isCoachRequest } from '@/lib/coachAuth'
import { adminsOnly, canSeePlayer, inList, notYourTeam, visiblePlayerIds } from '@/lib/coachScope'
import { canAccessPlayer, signInAgain } from '@/lib/playerAuth'
import { isAvailability, type Availability } from '@/lib/availability'
import { logHealthUpdate } from '@/lib/healthUpdates'

const coachOnly = () => NextResponse.json({ error: 'Coach sign-in required' }, { status: 401 })

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  const all = req.nextUrl.searchParams.get('all')
  const db = createServerClient()

  if (all) {
    const coach = await getCoach(req)
    if (!coach) return coachOnly()
    const visible = await visiblePlayerIds(db, coach)
    let query = db
      .from('health_reports')
      .select('*, players(name, jersey_number)')
      .in('status', ['active', 'monitoring'])
      .order('reported_at', { ascending: false })
    if (visible) query = query.in('player_id', inList(visible))
    const { data: reports } = await query
    return NextResponse.json({ reports: reports ?? [] })
  }

  if (playerId) {
    if (!(await canAccessPlayer(req, playerId))) return signInAgain()
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
  const { playerId, reportType, bodyPart, injuryType, severity, description, painLevel, reportedBy, coachNotes, expectedReturn, availability } = await req.json()

  if (!playerId || !reportType || !bodyPart) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!(await canAccessPlayer(req, playerId))) return signInAgain()

  const byCoach = reportedBy === 'coach' && (await isCoachRequest(req))
  // Only a coach sets how much it keeps the player out; player reports start as Aches & Pains
  const level: Availability = byCoach && isAvailability(availability) ? availability : 'full'

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
      reported_by: byCoach ? 'coach' : 'player',
      confirmed_by_coach: byCoach,
      coach_notes: coachNotes ?? null,
      expected_return: expectedReturn ?? null,
      status: 'active',
      availability: level,
      availability_since: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logHealthUpdate(db, {
    reportId: report.id, playerId, kind: 'logged', to: level,
    coach: byCoach ? await getCoach(req) : null,
  })
  return NextResponse.json({ report })
}

export async function PATCH(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return coachOnly()
  const { id, confirmedByCoach, coachNotes, status, expectedReturn, severity, injuryType, availability, progressNote } = await req.json()

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (availability !== undefined && !isAvailability(availability)) {
    return NextResponse.json({ error: 'Unknown availability level' }, { status: 400 })
  }

  const db = createServerClient()
  const { data: existing } = await db
    .from('health_reports')
    .select('player_id, status, availability')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  if (!coach.isAdmin && !(await canSeePlayer(db, coach, existing.player_id))) return notYourTeam()

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = {}
  if (confirmedByCoach !== undefined) updates.confirmed_by_coach = confirmedByCoach
  if (coachNotes !== undefined) updates.coach_notes = coachNotes
  if (severity !== undefined) updates.severity = severity
  if (injuryType !== undefined) updates.injury_type = injuryType
  if (expectedReturn !== undefined) updates.expected_return = expectedReturn

  const wasResolved = existing.status === 'resolved'
  const clearing = status === 'resolved' && !wasResolved
  const reopening = wasResolved && status !== undefined && status !== 'resolved'
  if (status !== undefined) {
    updates.status = status
    if (clearing) updates.resolved_at = now
    if (reopening) updates.resolved_at = null
  }

  const before: Availability = isAvailability(existing.availability) ? existing.availability : 'full'
  const levelChanged = availability !== undefined && availability !== before
  if (levelChanged || reopening) {
    updates.availability = availability ?? before
    updates.availability_since = now
  }

  const { data: report, error } = await db
    .from('health_reports')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Timeline: one row for what happened; the progress note rides along with it
  const note = typeof progressNote === 'string' ? progressNote : null
  const base = { reportId: id, playerId: existing.player_id as string, coach, note }
  if (clearing) {
    await logHealthUpdate(db, { ...base, kind: 'cleared', from: before })
  } else if (reopening) {
    await logHealthUpdate(db, { ...base, kind: 'reopened', to: (availability ?? before) as Availability })
  } else if (levelChanged) {
    await logHealthUpdate(db, { ...base, kind: 'level', from: before, to: availability as Availability })
  } else if (note?.trim()) {
    await logHealthUpdate(db, { ...base, kind: 'note', to: before })
  }

  return NextResponse.json({ report })
}

export async function DELETE(req: NextRequest) {
  const coach = await getCoach(req)
  if (!coach) return coachOnly()
  if (!coach.isAdmin) return adminsOnly()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db.from('health_reports').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
