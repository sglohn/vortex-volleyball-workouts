// FILE: lib/healthUpdates.ts
//
// Server only. Writes one row to health_report_updates (the timeline behind
// a health report's availability level; see lib/availability.ts).
// A failed timeline write never fails the change itself.

import { createServerClient } from '@/lib/supabase'
import type { CoachIdentity } from '@/lib/coachAuth'
import type { Availability, HealthUpdate } from '@/lib/availability'

type Db = ReturnType<typeof createServerClient>

export async function logHealthUpdate(db: Db, row: {
  reportId: string
  playerId: string | null
  kind: HealthUpdate['kind']
  from?: Availability | null
  to?: Availability | null
  note?: string | null
  coach?: CoachIdentity | null
}): Promise<void> {
  const note = row.note?.trim() || null
  const { error } = await db.from('health_report_updates').insert({
    report_id: row.reportId,
    player_id: row.playerId,
    kind: row.kind,
    from_availability: row.from ?? null,
    to_availability: row.to ?? null,
    note,
    coach_id: row.coach?.id ?? null,
    coach_name: row.coach?.name ?? null,
  })
  if (error) console.error('health_report_updates insert failed:', error.message)
}
