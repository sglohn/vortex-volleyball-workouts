// FILE: lib/fullBodyWorkout.ts
//
// Auto-built full-body workouts for self-guided players
// (players.self_guided = true — former players and coaches not on a team).
//
// Every new session gets a fresh workout pulled from the exercise library:
//
//   Block A   Quads       + Shoulders     (superset)
//   Block B   Hamstrings  + Core          (superset)
//   Block C   Hips/Glutes
//   3 sets each
//
// Where each slot pulls from (exercise_library.category):
//   Quads       'Lower - Quad'
//   Hamstrings  'Lower - Hamstring'
//   Hips        'Lower - Hip/Glute'
//   Shoulders   'Upper - Push' or 'Upper - Pull', preferring exercises whose
//               name looks shoulder-focused (overhead press, raises, face
//               pulls, landmine / Viking press, etc.)
//   Core        'Core'
//
// Rules:
//   - Only active library exercises.
//   - Anything on the player's active skip list is left out entirely.
//   - Exercises used in the player's last 2 generated workouts are avoided
//     when there's anything else to choose from, so it doesn't repeat.
//   - Reps come from the exercise's default reps, or a slot default.
//   - A slot with no exercises in the library is simply left out.
//
// The built workout is saved on the session (sessions.generated_workout),
// so resuming mid-workout shows the same exercises. app/api/workout/route.ts
// turns it into blocks the same way it does for coach templates, so weight
// suggestions, set logging and history all work unchanged.

import { createServerClient } from '@/lib/supabase'

type Db = ReturnType<typeof createServerClient>

export type FullBodySlot = 'quads' | 'hamstrings' | 'hips' | 'shoulders' | 'core'

export interface GeneratedExercise {
  exerciseId: string
  slot: FullBodySlot
  reps: string
}

export interface GeneratedBlock {
  label: string
  sets: number
  exercises: GeneratedExercise[]
}

export interface GeneratedWorkout {
  version: 1
  name: string
  description: string
  warmupNotes: string
  generatedAt: string
  blocks: GeneratedBlock[]
}

interface SlotRule {
  slot: FullBodySlot
  label: string
  categories: string[]
  defaultReps: string
  prefer?: RegExp
}

export const FULL_BODY_SLOTS: Record<FullBodySlot, SlotRule> = {
  quads:      { slot: 'quads',      label: 'Quads',      categories: ['Lower - Quad'],      defaultReps: '10' },
  hamstrings: { slot: 'hamstrings', label: 'Hamstrings', categories: ['Lower - Hamstring'], defaultReps: '10' },
  hips:       { slot: 'hips',       label: 'Hips',       categories: ['Lower - Hip/Glute'], defaultReps: '10' },
  shoulders:  {
    slot: 'shoulders', label: 'Shoulders',
    categories: ['Upper - Push', 'Upper - Pull'],
    defaultReps: '10',
    prefer: /shoulder|overhead|military|arnold|lateral|front raise|raise|face pull|rear delt|\by[- ]?t|ytw|landmine|viking|push press|upright|pull[- ]?apart|z press|scap/i,
  },
  core:       { slot: 'core',       label: 'Core',       categories: ['Core'],              defaultReps: '12' },
}

// Block layout: lower body paired with upper/core so supersets don't stack fatigue
const LAYOUT: { label: string; sets: number; slots: FullBodySlot[] }[] = [
  { label: 'A', sets: 3, slots: ['quads', 'shoulders'] },
  { label: 'B', sets: 3, slots: ['hamstrings', 'core'] },
  { label: 'C', sets: 3, slots: ['hips'] },
]

const RECENT_WORKOUTS_TO_AVOID = 2

const WARMUP =
  '5 minutes easy cardio, then 10 bodyweight squats, 10 glute bridges, 10 arm circles each way and a 30-second plank. Start each lift light and build up.'

interface LibraryRow {
  id: string
  name: string
  category: string | null
  default_reps: string | null
}

function pickRandom<T>(items: T[]): T | null {
  if (!items.length) return null
  return items[Math.floor(Math.random() * items.length)]
}

/** Exercise ids used in this player's most recent generated workouts. */
async function recentGeneratedExerciseIds(db: Db, playerId: string): Promise<Set<string>> {
  const { data } = await db
    .from('sessions')
    .select('generated_workout')
    .eq('player_id', playerId)
    .not('generated_workout', 'is', null)
    .order('checked_in_at', { ascending: false })
    .limit(RECENT_WORKOUTS_TO_AVOID)

  const ids = new Set<string>()
  for (const row of data ?? []) {
    const w = row.generated_workout as GeneratedWorkout | null
    for (const b of w?.blocks ?? []) for (const e of b.exercises ?? []) ids.add(e.exerciseId)
  }
  return ids
}

/** Exercises the coach has this player skipping or replacing today. */
async function skippedExerciseIds(db: Db, playerId: string, today: string): Promise<Set<string>> {
  const { data } = await db
    .from('player_exercise_skips')
    .select('exercise_id')
    .eq('player_id', playerId)
    .eq('is_active', true)
    .or(`ends_on.is.null,ends_on.gte.${today}`)
  return new Set((data ?? []).map(s => s.exercise_id as string))
}

function chooseForSlot(
  rule: SlotRule,
  library: LibraryRow[],
  used: Set<string>,
  recent: Set<string>,
): LibraryRow | null {
  const inCategory = library.filter(ex => ex.category && rule.categories.includes(ex.category) && !used.has(ex.id))
  if (!inCategory.length) return null

  // Avoid the last couple of workouts when there's another option
  const fresh = inCategory.filter(ex => !recent.has(ex.id))
  const pool = fresh.length ? fresh : inCategory

  // Shoulders: prefer shoulder-looking exercises within the pool
  if (rule.prefer) {
    const preferred = pool.filter(ex => rule.prefer!.test(ex.name))
    if (preferred.length) return pickRandom(preferred)
  }
  return pickRandom(pool)
}

function friendlyDate(today: string): string {
  return new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

/**
 * Builds a new full-body workout for a self-guided player.
 * Returns null only if the library has nothing usable for any slot.
 */
export async function buildFullBodyWorkout(db: Db, playerId: string, today: string): Promise<GeneratedWorkout | null> {
  const { data: libraryRaw } = await db
    .from('exercise_library')
    .select('id, name, category, default_reps')
    .eq('is_active', true)

  const [skips, recent] = await Promise.all([
    skippedExerciseIds(db, playerId, today),
    recentGeneratedExerciseIds(db, playerId),
  ])

  const library = ((libraryRaw ?? []) as LibraryRow[]).filter(ex => !skips.has(ex.id))
  const used = new Set<string>()

  const blocks: GeneratedBlock[] = []
  for (const layout of LAYOUT) {
    const exercises: GeneratedExercise[] = []
    for (const slot of layout.slots) {
      const rule = FULL_BODY_SLOTS[slot]
      const ex = chooseForSlot(rule, library, used, recent)
      if (!ex) continue
      used.add(ex.id)
      exercises.push({ exerciseId: ex.id, slot, reps: ex.default_reps?.trim() || rule.defaultReps })
    }
    if (exercises.length) blocks.push({ label: layout.label, sets: layout.sets, exercises })
  }

  if (!blocks.length) return null

  return {
    version: 1,
    name: 'Full Body Workout',
    description: `${friendlyDate(today)} · Quads, hamstrings, hips, shoulders & core — new every time you sign in`,
    warmupNotes: WARMUP,
    generatedAt: new Date().toISOString(),
    blocks,
  }
}

/** Safe read of a session's saved workout (null if missing or malformed). */
export function asGeneratedWorkout(value: unknown): GeneratedWorkout | null {
  if (!value || typeof value !== 'object') return null
  const w = value as Partial<GeneratedWorkout>
  if (!Array.isArray(w.blocks) || !w.blocks.length) return null
  return w as GeneratedWorkout
}
