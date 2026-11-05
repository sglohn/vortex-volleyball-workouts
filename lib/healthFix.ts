// FILE: lib/healthFix.ts
//
// Server only. "Fix a mistake" on a health report (Health Board → open a
// report → Fix a mistake): the player tapped the wrong side or area, or
// double-tapped and said injured when she meant sore.
//
// Changes the report's area (body_part) and/or type (report_type), and
// corrects her body checks for the days of that report so repeat counts,
// the Watch tab and her body map tell the truth:
//   • area changed     the old zone becomes the new zone on those checks
//   • injury → sore    "injured" becomes "sore" for that zone on those checks
// The fix is written on the report's timeline ("Fixed: Right Hip → Left Hip").
// Areas that aren't one body-map zone ("Finger", "Bilateral Ankle") only
// change the report; the checks are left as they were.
//
// Used by PATCH /api/player/health (coaches and admins; team coaches only for
// their own players).

import { createServerClient } from '@/lib/supabase'
import type { CoachIdentity } from '@/lib/coachAuth'
import { bodyPartToZone, mergeRegions } from '@/lib/bodyChecks'
import { logHealthUpdate } from '@/lib/healthUpdates'

type Db = ReturnType<typeof createServerClient>

export const REPORT_TYPES = ['major_injury', 'nagging_pain', 'soreness'] as const
export type ReportType = (typeof REPORT_TYPES)[number]
const TYPE_LABELS: Record<string, string> = { major_injury: 'Injury', nagging_pain: 'Nagging Pain', soreness: 'Soreness' }

const GENERAL_BODY_PART = 'General (no area marked)'

function zoneOf(bodyPart: string): string | null {
  if (bodyPart.trim().toLowerCase() === GENERAL_BODY_PART.toLowerCase()) return 'general'
  return bodyPartToZone(bodyPart)
}

export interface ReportToFix {
  id: string
  player_id: string
  body_part: string
  report_type: string
  reported_at: string | null
  resolved_at: string | null
}

/**
 * Returns the fields to update on the report, or an error for the coach.
 * Call before saving; then call fixBodyChecks + the timeline note after.
 */
export async function planFix(
  db: Db,
  report: ReportToFix,
  input: { bodyPart?: unknown; reportType?: unknown },
): Promise<{ error: string; status: number } | { updates: Record<string, unknown>; changes: string[] }> {
  const updates: Record<string, unknown> = {}
  const changes: string[] = []

  if (input.bodyPart !== undefined) {
    const bodyPart = typeof input.bodyPart === 'string' ? input.bodyPart.trim() : ''
    if (!bodyPart || bodyPart.length > 60) return { error: 'Pick an area', status: 400 }
    if (bodyPart.toLowerCase() !== report.body_part.toLowerCase()) {
      // One open report per area: don't make a second one for the same spot
      const { data: open } = await db.from('health_reports')
        .select('id, body_part')
        .eq('player_id', report.player_id)
        .in('status', ['active', 'monitoring'])
      const clash = (open ?? []).find(r => r.id !== report.id && r.body_part.toLowerCase() === bodyPart.toLowerCase())
      if (clash) {
        return { error: `She already has an open report for ${clash.body_part}. Clear one of the two instead.`, status: 409 }
      }
      updates.body_part = bodyPart
      changes.push(`${report.body_part} → ${bodyPart}`)
    }
  }

  if (input.reportType !== undefined) {
    if (!(REPORT_TYPES as readonly unknown[]).includes(input.reportType)) return { error: 'Unknown report type', status: 400 }
    if (input.reportType !== report.report_type) {
      updates.report_type = input.reportType
      changes.push(`${TYPE_LABELS[report.report_type] ?? report.report_type} → ${TYPE_LABELS[input.reportType as string]}`)
    }
  }

  return { updates, changes }
}

/** Correct the body checks behind a report after its area or type was fixed. */
export async function fixBodyChecks(db: Db, report: ReportToFix, updates: Record<string, unknown>): Promise<void> {
  const oldZone = zoneOf(report.body_part)
  if (!oldZone) return
  const newBodyPart = typeof updates.body_part === 'string' ? updates.body_part : report.body_part
  const newZone = zoneOf(newBodyPart)
  const moving = !!newZone && newZone !== oldZone
  const downgrade = report.report_type === 'major_injury'
    && typeof updates.report_type === 'string' && updates.report_type !== 'major_injury'
  if (!moving && !downgrade) return

  // The report's days: from a minute before it was reported until it was cleared
  const from = report.reported_at
    ? new Date(new Date(report.reported_at).getTime() - 60_000).toISOString()
    : null
  let query = db.from('body_checks').select('id, regions').eq('player_id', report.player_id)
  if (from) query = query.gte('checked_at', from)
  if (report.resolved_at) query = query.lte('checked_at', report.resolved_at)
  const { data: checks, error } = await query
  if (error) { console.error('fixBodyChecks load failed:', error.message); return }

  for (const c of checks ?? []) {
    const regions = { ...((c.regions ?? {}) as Record<string, string>) }
    const was = regions[oldZone]
    if (was !== 'sore' && was !== 'injured') continue
    const status = downgrade ? 'sore' : was
    let next: Record<string, string>
    if (moving && newZone) {
      delete regions[oldZone]
      next = mergeRegions(regions, { [newZone]: status })
    } else {
      next = { ...regions, [oldZone]: status }
    }
    const { error: upErr } = await db.from('body_checks').update({ regions: next }).eq('id', c.id)
    if (upErr) console.error('fixBodyChecks update failed:', upErr.message)
  }
}

export async function logFix(db: Db, report: ReportToFix, changes: string[], coach: CoachIdentity | null): Promise<void> {
  if (!changes.length) return
  await logHealthUpdate(db, {
    reportId: report.id, playerId: report.player_id, kind: 'note',
    note: `Fixed a mistake: ${changes.join(' · ')}`, coach,
  })
}
