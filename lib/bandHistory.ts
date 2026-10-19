// FILE: lib/bandHistory.ts
//
// Server-side helper: the band a player used the last time they did a band
// exercise (before today's session), so the band picker can say
// "Last time you used the red band" (components/WeightPicker.tsx).
//
// Returns null when there's no earlier band set, or before the
// 2026-10-19_bands_and_medballs.sql migration has been run.

import { createServerClient } from '@/lib/supabase'
import { asBand } from '@/lib/loads'

type Db = ReturnType<typeof createServerClient>

export async function lastBandUsed(db: Db, playerId: string, exerciseId: string, currentSessionId: string): Promise<string | null> {
  const { data: sessions, error: sErr } = await db
    .from('sessions')
    .select('id')
    .eq('player_id', playerId)
    .neq('id', currentSessionId)
  if (sErr || !sessions?.length) return null

  const { data, error } = await db
    .from('set_logs')
    .select('band, logged_at')
    .eq('exercise_id', exerciseId)
    .eq('completed', true)
    .not('band', 'is', null)
    .in('session_id', sessions.map(s => s.id))
    .order('logged_at', { ascending: false })
    .limit(1)
  if (error) return null
  return asBand((data?.[0] as { band?: unknown } | undefined)?.band)
}
