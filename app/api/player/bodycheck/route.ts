// app/api/player/bodycheck/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// Zone classification — used to decide what auto-creates a health report
// Joints escalate quickly; muscles need a pattern before flagging
const JOINT_ZONES = new Set([
  'r_knee','l_knee','r_ankle','l_ankle','r_shoulder','l_shoulder',
  'r_hip','l_hip','r_elbow','l_elbow','r_wrist','l_wrist',
  'neck','head',
])
const MUSCLE_ZONES = new Set([
  'r_quad','l_quad','r_hamstring','l_hamstring','r_calf','l_calf',
  'r_glute','l_glute','r_shin','l_shin','chest','core',
  'upper_back','lower_back','r_shoulder','l_shoulder', // shoulder is both
])

export async function POST(req: NextRequest) {
  const { sessionId, playerId, regions } = await req.json()
  if (!sessionId || !playerId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = createServerClient()

  // Save the raw body check (always — this is the source of truth for player self-reports)
  await db.from('body_checks').insert({
    session_id: sessionId,
    player_id: playerId,
    regions,
  })

  const entries = Object.entries(regions as Record<string, string>)
  const injuredRegions = entries.filter(([, s]) => s === 'injured').map(([r]) => r)
  const soreRegions    = entries.filter(([, s]) => s === 'sore').map(([r]) => r)

  // ── Injured regions → always create a health report (unconfirmed, needs coach review)
  for (const region of injuredRegions) {
    const bodyPart = region.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    const isJoint = JOINT_ZONES.has(region)
    await db.from('health_reports').insert({
      player_id: playerId,
      report_type: 'major_injury',
      body_part: bodyPart,
      reported_by: 'player',
      status: 'active',
      confirmed_by_coach: false,
      description: isJoint
        ? 'Player reported joint pain via pre-workout body check'
        : 'Player reported muscle injury via pre-workout body check',
    })
  }

  // ── Sore joint regions → check recurrence; create report if 2+ times in 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  for (const region of soreRegions) {
    if (!JOINT_ZONES.has(region)) continue // muscle soreness handled differently — no auto-report

    // Count how many times this joint was flagged sore in the last 30 days
    const { data: recentChecks } = await db
      .from('body_checks')
      .select('regions')
      .eq('player_id', playerId)
      .gte('checked_at', thirtyDaysAgo)

    const recentCount = (recentChecks ?? []).filter(c => {
      const r = c.regions as Record<string, string>
      return r[region] === 'sore' || r[region] === 'injured'
    }).length

    // 2+ flags in 30 days = create/update a nagging pain report
    if (recentCount >= 2) {
      // Check if there's already an active unconfirmed report for this body part
      const bodyPart = region.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      const { data: existing } = await db
        .from('health_reports')
        .select('id')
        .eq('player_id', playerId)
        .eq('body_part', bodyPart)
        .eq('reported_by', 'player')
        .in('status', ['active', 'monitoring'])
        .limit(1)

      if (!existing?.length) {
        await db.from('health_reports').insert({
          player_id: playerId,
          report_type: 'nagging_pain',
          body_part: bodyPart,
          reported_by: 'player',
          status: 'active',
          confirmed_by_coach: false,
          description: `Recurring joint soreness — flagged ${recentCount + 1}× in the last 30 days`,
        })
      } else {
        // Update description with latest count
        await db.from('health_reports')
          .update({ description: `Recurring joint soreness — flagged ${recentCount + 1}× in the last 30 days` })
          .eq('id', existing[0].id)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    injuredCount: injuredRegions.length,
    soreCount: soreRegions.length,
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
