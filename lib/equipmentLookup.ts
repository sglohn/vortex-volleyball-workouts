// FILE: lib/equipmentLookup.ts
//
// Server-side helper: equipment for a set of exercises, so pounds-moved
// totals can count both dumbbells on 2-dumbbell exercises (lib/loads.ts).

import { createServerClient } from '@/lib/supabase'
import { asEquipment, type Equipment } from '@/lib/loads'

type Db = ReturnType<typeof createServerClient>

export async function equipmentByExercise(db: Db, exerciseIds: string[]): Promise<Record<string, Equipment | null>> {
  const ids = [...new Set(exerciseIds.filter(Boolean))]
  if (!ids.length) return {}
  const { data } = await db.from('exercise_library').select('id, equipment').in('id', ids)
  return Object.fromEntries((data ?? []).map(e => [e.id as string, asEquipment((e as { equipment?: unknown }).equipment)]))
}
