// app/api/player/bodycheck/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// ─── Zone classification ──────────────────────────────────────────────────────
// Every flagged area now reaches the coach Health Board.
// Classification only decides HOW it is labelled:
//   injured                         → major_injury
//   sore joint, 2+ times in 30 days → nagging_pain
//   any other soreness              → soreness
const JOINT_ZONES = new Set([
  'r_knee','l_knee','r_ankle','l_ankle','r_shoulder','l_shoulder',
  'r_hip','l_hip','r_elbow','l_elbow','r_wrist','l_wrist',
  'neck','head',
])
const MUSCLE_ZONES = new Set([
  'r_quad','l_quad','r_hamstring','l_hamstring','r_calf','l_calf',
  'r_glute','l_glute','r_shin','l_shin','chest','core',
  'upper_back','lower_back',
])

// Higher number = more serious. A report can be upgraded, never downgraded, by a player re-report.
const TYPE_RANK: Record<string, number> = { soreness: 1, nagging_pain: 2, major_injury: 3 }

const GENERAL_BODY_PART = 'General (no area marked)'

const SPECIAL_LABELS: Record<string, string> = {
  head: 'Head', neck: 'Neck', chest: 'Chest', core: 'Core',
  upper_back: 'Upper Back', lower_back: 'Lower Back',
}

// "r_knee" → "Right Knee" (same format the coach Log Injury form uses,
// so PlayerHealthCard maps it onto the body diagram correctly)
function zoneToBodyPart(zone: string): string {
  if (SPECIAL_LABELS[zone]) return SPECIAL_LABELS[zone]
  const title = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  if (zone.startsWith('r_')) return `Right ${title(zone.slice(2))}`
  if (zone.startsWith('l_')) return `Left ${title(zone.slice(2))}`
  return title(zone)
}

type RegionStatus = 'sore' | 'injured'
type ExistingReport = {
  id: string
  body_part: string
  report_type: string
  reported_by: string
  report_count: number | null
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { sessionId, playerId, quickStatus } = body as {
    sessionId?: string; playerId?: string; quickStatus?: 'good' | 'sore' | 'injured'
  }
  if (!sessionId || !playerId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Accept the full map ({ regions: { r_knee: 'sore', ... } }).
  // Also accept the older one-region-per-request shape ({ region, status }) in case
  // a player still has the old page cached on their phone.
  let regions: Record<string, RegionStatus> = {}
  if (body.regions && typeof body.regions === 'object') {
    regions = body.regions
  } else if (body.region && (body.status === 'sore' || body.status === 'injured')) {
    regions = { [body.region]: body.status }
  }

  const db = createServerClient()
  const now = new Date().toISOString()

  // ── 1. Save the raw body check (source of truth for the body map history)
  const { error: checkError } = await db.from('body_checks').insert({
    session_id: sessionId,
    player_id: playerId,
    regions,
  })
  if (checkError) return NextResponse.json({ error: checkError.message }, { status: 500 })

  // ── 2. Pull what we need once: last 30 days of checks + this player's open reports
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [{ data: recentChecks }, { data: openReportsRaw }] = await Promise.all([
    db.from('body_checks')
      .select('regions')
      .eq('player_id', playerId)
      .gte('checked_at', thirtyDaysAgo),
    db.from('health_reports')
      .select('id, body_part, report_type, reported_by, report_count')
      .eq('player_id', playerId)
      .in('status', ['active', 'monitoring']),
  ])
  const openReports = (openReportsRaw ?? []) as ExistingReport[]

  // How many times has this zone been flagged in the last 30 days (includes today's check)
  function flagCount(zone: string): number {
    return (recentChecks ?? []).filter(c => {
      const r = (c.regions ?? {}) as Record<string, string>
      return r[zone] === 'sore' || r[zone] === 'injured'
    }).length
  }

  // ── 3. Create or update one report per flagged area
  async function upsertReport(bodyPart: string, reportType: string, description: string) {
    const existing = openReports.find(r => r.body_part.toLowerCase() === bodyPart.toLowerCase())

    if (!existing) {
      const { error } = await db.from('health_reports').insert({
        player_id: playerId,
        report_type: reportType,
        body_part: bodyPart,
        reported_by: 'player',
        status: 'active',
        confirmed_by_coach: false,
        description,
        last_reported_at: now,
        report_count: 1,
      })
      return error
    }

    // Already open for this area → bump it back into "Needs Review" instead of duplicating
    const upgraded = (TYPE_RANK[reportType] ?? 0) > (TYPE_RANK[existing.report_type] ?? 0)
    const updates: Record<string, unknown> = {
      confirmed_by_coach: false,
      last_reported_at: now,
      report_count: (existing.report_count ?? 1) + 1,
    }
    if (upgraded) updates.report_type = reportType
    // Never overwrite a coach's own description on a coach-logged report
    if (existing.reported_by === 'player') updates.description = description

    const { error } = await db.from('health_reports').update(updates).eq('id', existing.id)
    return error
  }

  const errors: string[] = []
  const entries = Object.entries(regions).filter(([, s]) => s === 'sore' || s === 'injured')

  for (const [zone, status] of entries) {
    const bodyPart = zoneToBodyPart(zone)
    const count = flagCount(zone)
    const isJoint = JOINT_ZONES.has(zone)
    const isMuscle = MUSCLE_ZONES.has(zone)

    let reportType: string
    let description: string

    if (status === 'injured') {
      reportType = 'major_injury'
      description = isJoint
        ? 'Player reported joint pain/injury on pre-workout body check'
        : 'Player reported pain/injury on pre-workout body check'
    } else if (isJoint && count >= 2) {
      reportType = 'nagging_pain'
      description = `Recurring joint soreness — flagged ${count}× in the last 30 days`
    } else {
      reportType = 'soreness'
      description = count > 1
        ? `Player reported soreness — flagged ${count}× in the last 30 days`
        : 'Player reported soreness on pre-workout body check'
      if (isMuscle && count >= 4) description += ' — recurring, consider adjusting load'
    }

    const err = await upsertReport(bodyPart, reportType, description)
    if (err) errors.push(`${bodyPart}: ${err.message}`)
  }

  // ── 4. Player said "sore" or "something hurts" but didn't tap an area — still report it
  if (entries.length === 0 && (quickStatus === 'sore' || quickStatus === 'injured')) {
    const err = await upsertReport(
      GENERAL_BODY_PART,
      quickStatus === 'injured' ? 'major_injury' : 'soreness',
      quickStatus === 'injured'
        ? 'Player said something hurts but did not mark where — check in with them'
        : 'Player said they were sore but did not mark where',
    )
    if (err) errors.push(`${GENERAL_BODY_PART}: ${err.message}`)
  }

  if (errors.length) return NextResponse.json({ ok: false, errors }, { status: 500 })

  return NextResponse.json({
    ok: true,
    injuredCount: entries.filter(([, s]) => s === 'injured').length,
    soreCount: entries.filter(([, s]) => s === 'sore').length,
  })
}

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '30')
  if (!playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })

  const db = createServerClient()
  const { data: checks } = await db
    .from('body_checks')
    .select('*, sessions(checked_in_at)')
    .eq('player_id', playerId)
    .order('checked_at', { ascending: false })
    .limit(limit)

  return NextResponse.json({ checks: checks ?? [] })
}
