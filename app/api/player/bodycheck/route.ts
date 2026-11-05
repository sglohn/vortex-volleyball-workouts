// app/api/player/bodycheck/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { canAccessPlayer, canAccessSession, signInAgain } from '@/lib/playerAuth'
import { checkDay, daysFlagged, mergeRegions, zoneToBodyPart } from '@/lib/bodyChecks'
import { logHealthUpdate } from '@/lib/healthUpdates'

// ─── Zone classification ──────────────────────────────────────────────────────
// Every flagged area is kept as a health report. Classification decides how
// it is labelled:
//   injured                         → major_injury
//   sore joint, 2+ days in 30 days  → nagging_pain
//   any other soreness              → soreness
//
// ─── Which reports need a coach's review ─────────────────────────────────────
// Needs Review (confirmed_by_coach = false) only when:
//   • the player marked it injured ("Something hurts" / tapped twice)
//   • she wrote a note for the coach
//   • it keeps coming up: the same area on REVIEW_AFTER_DAYS different days
//     in the last 30 (joints, low back and "no area marked": 2; muscles: 3)
// Plain soreness is still saved, but goes straight to Aches & Pains
// (confirmed_by_coach = true) and feeds the counts above and the Watch tab.
// Once a coach has reviewed a repeat, later sore days don't send it back
// unless it gets worse, she writes a note, or it's marked injured.
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

/** Different sore days (last 30) before soreness needs a coach's review */
const REVIEW_AFTER_DAYS = { sensitive: 2, muscle: 3 }
function reviewAfter(zone: string): number {
  return JOINT_ZONES.has(zone) || zone === 'lower_back' || zone === 'general'
    ? REVIEW_AFTER_DAYS.sensitive
    : REVIEW_AFTER_DAYS.muscle
}

// Higher number = more serious. A report can be upgraded, never downgraded, by a player re-report.
const TYPE_RANK: Record<string, number> = { soreness: 1, nagging_pain: 2, major_injury: 3 }

const GENERAL_BODY_PART = 'General (no area marked)'

type RegionStatus = 'sore' | 'injured'
type ExistingReport = {
  id: string
  body_part: string
  report_type: string
  reported_by: string
  report_count: number | null
  last_reported_at: string | null
  confirmed_by_coach: boolean | null
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { sessionId, playerId, quickStatus } = body as {
    sessionId?: string; playerId?: string; quickStatus?: 'good' | 'sore' | 'injured'
  }
  // Optional note for the coach (components/BodyCheck.tsx). Any note sends
  // every area she marked to Needs Review.
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : ''
  if (!sessionId || !playerId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  // Her own pass, for her own session
  if (!(await canAccessPlayer(req, playerId)) || !(await canAccessSession(req, sessionId))) return signInAgain()

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
  // "Sore" / "Injured" with no area marked is kept as { general: ... } so the
  // Health Board's Watch tab (lib/healthPatterns.ts) counts it; an empty map
  // still means "feeling good".
  const savedRegions: Record<string, string> =
    Object.keys(regions).length === 0 && (quickStatus === 'sore' || quickStatus === 'injured')
      ? { general: quickStatus }
      : regions
  // One body check per workout: if she already answered for this session
  // (signed in again), merge into that one instead of saving a second check.
  const { data: earlier } = await db.from('body_checks')
    .select('id, regions')
    .eq('session_id', sessionId)
    .order('checked_at', { ascending: false })
    .limit(1)
  const { error: checkError } = earlier?.[0]
    ? await db.from('body_checks')
        .update({ regions: mergeRegions(earlier[0].regions as Record<string, string>, savedRegions) })
        .eq('id', earlier[0].id)
    : await db.from('body_checks').insert({
        session_id: sessionId,
        player_id: playerId,
        regions: savedRegions,
      })
  if (checkError) return NextResponse.json({ error: checkError.message }, { status: 500 })

  // ── 2. Pull what we need once: last 30 days of checks + this player's open reports
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [{ data: recentChecks }, { data: openReportsRaw }] = await Promise.all([
    db.from('body_checks')
      .select('regions, checked_at')
      .eq('player_id', playerId)
      .gte('checked_at', thirtyDaysAgo),
    db.from('health_reports')
      .select('id, body_part, report_type, reported_by, report_count, last_reported_at, confirmed_by_coach')
      .eq('player_id', playerId)
      .in('status', ['active', 'monitoring']),
  ])
  const openReports = (openReportsRaw ?? []) as ExistingReport[]

  // How many different DAYS this zone was flagged in the last 30 days
  // (includes today). Two sign-ins on one day count once.
  function flagCount(zone: string): number {
    return daysFlagged((recentChecks ?? []) as { checked_at: string; regions: Record<string, string> | null }[], zone)
  }
  const today = checkDay(now)

  // ── 3. Create or update one report per flagged area
  // needsReview: injured, has a note, or has reached its repeat count.
  // reachedRepeat: today is the day it reached that count (sends a report
  // a coach already saw back to Needs Review once, not every sore day after).
  type Review = { needsReview: boolean; reachedRepeat: boolean }
  const withNote = (text: string) => note ? `Player note: "${note}" · ${text}` : text

  async function upsertReport(bodyPart: string, reportType: string, description: string, review: Review) {
    const existing = openReports.find(r => r.body_part.toLowerCase() === bodyPart.toLowerCase())

    if (!existing) {
      const { data: created, error } = await db.from('health_reports').insert({
        player_id: playerId,
        report_type: reportType,
        body_part: bodyPart,
        reported_by: 'player',
        status: 'active',
        // Plain soreness is noted (Aches & Pains) without waiting for review
        confirmed_by_coach: !review.needsReview,
        description: withNote(description),
        last_reported_at: now,
        report_count: 1,
      }).select('id').single()
      if (!error && created && note) {
        await logHealthUpdate(db, { reportId: created.id, playerId: playerId!, kind: 'note', note })
      }
      return error
    }

    // Already open for this area → update it instead of duplicating.
    // Reported again the same day (signed in twice): not a new report, so the
    // count stays and it isn't sent back to Needs Review unless it got worse
    // or she added a note.
    const upgraded = (TYPE_RANK[reportType] ?? 0) > (TYPE_RANK[existing.report_type] ?? 0)
    const sameDay = !!existing.last_reported_at && checkDay(existing.last_reported_at) === today
    if (sameDay && !upgraded && !note) return null
    const updates: Record<string, unknown> = {
      last_reported_at: now,
      report_count: sameDay ? (existing.report_count ?? 1) : (existing.report_count ?? 1) + 1,
    }
    // Back to Needs Review only for something new: marked injured, a note,
    // worse than before, or the day it reached the repeat count.
    const injured = reportType === 'major_injury'
    if (review.needsReview && (injured || !!note || upgraded || review.reachedRepeat)) {
      updates.confirmed_by_coach = false
    }
    if (upgraded) updates.report_type = reportType
    // Never overwrite a coach's own description on a coach-logged report
    if (existing.reported_by === 'player') updates.description = withNote(description)

    const { error } = await db.from('health_reports').update(updates).eq('id', existing.id)
    if (!error && note) {
      await logHealthUpdate(db, { reportId: existing.id, playerId: playerId!, kind: 'note', note })
    }
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
      description = `Recurring joint soreness — flagged on ${count} days in the last 30 days`
    } else {
      reportType = 'soreness'
      description = count > 1
        ? `Player reported soreness — flagged on ${count} days in the last 30 days`
        : 'Player reported soreness on pre-workout body check'
      if (isMuscle && count >= 4) description += ' — recurring, consider adjusting load'
    }

    const need = reviewAfter(zone)
    const review: Review = {
      needsReview: status === 'injured' || !!note || count >= need,
      reachedRepeat: count === need,
    }
    const err = await upsertReport(bodyPart, reportType, description, review)
    if (err) errors.push(`${bodyPart}: ${err.message}`)
  }

  // ── 4. Player said "sore" or "something hurts" but didn't tap an area — still report it
  if (entries.length === 0 && (quickStatus === 'sore' || quickStatus === 'injured')) {
    const count = flagCount('general')
    const need = reviewAfter('general')
    const err = await upsertReport(
      GENERAL_BODY_PART,
      quickStatus === 'injured' ? 'major_injury' : 'soreness',
      quickStatus === 'injured'
        ? 'Player said something hurts but did not mark where — check in with them'
        : 'Player said they were sore but did not mark where',
      { needsReview: quickStatus === 'injured' || !!note || count >= need, reachedRepeat: count === need },
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
  if (!(await canAccessPlayer(req, playerId))) return signInAgain()

  const db = createServerClient()
  const { data: checks } = await db
    .from('body_checks')
    .select('*, sessions(checked_in_at)')
    .eq('player_id', playerId)
    .order('checked_at', { ascending: false })
    .limit(limit)

  return NextResponse.json({ checks: checks ?? [] })
}
