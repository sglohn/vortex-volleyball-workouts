// FILE: lib/fullBodyWorkout.ts
//
// Auto-built full-body workouts for self-guided players
// (players.self_guided = true — former players and coaches not on a team).
//
// Every new session gets a fresh workout, laid out like a team workout:
//
//   Block A  Quad        Main lift + Secondary   (e.g. Bulgarian Split Squat + Box Jumps)
//   Block B  Hamstring   Main lift + Secondary   (e.g. Barbell RDL + Banded Side Steps)
//   Block C  Push        Main lift + Secondary   (e.g. Bench Press + Pallof Press)
//   Block D  Pull        Main lift + Secondary   (e.g. Bench Row + Band Pull Aparts)
//   3 sets each, done as a superset
//
// HOW EXERCISES ARE CHOSEN
//   Tagged first: on the Exercise Library page each exercise can be ticked
//   for any block as Main, Secondary or Easier option
//   (exercise_library.self_guided_roles, e.g. 'quad_main', 'push_secondary').
//   If nothing is tagged for a spot, category rules fill it:
//
//              Main (prefers weighted)    Secondary (prefers unweighted)
//     A Quad   Lower - Quad               Power
//     B Ham    Lower - Hamstring          Lower - Hip/Glute
//     C Push   Upper - Push               Core
//     D Pull   Upper - Pull               Upper - Pull
//
//   - Only active exercises; anything on the player's skip list is left out.
//   - Exercises from the player's last 2 generated workouts are avoided
//     when there's anything else to choose from.
//   - Reps come from the exercise's default reps (main 8, secondary 10 if blank).
//
// EASIER OPTION (sore players)
//   Before logging a set of an exercise, the player can swap it for an
//   easier one that hits the same area (lighter weight or shorter range):
//     1. exercises tagged "Easier option" for that block
//     2. other exercises from the same category — not ones tagged Main for
//        that block, no barbell lifts when there's another choice, and
//        names that sound lighter/shorter-range first (goblet, box, banded…)
//   They can swap back to the original. See app/api/player/self-guided-swap.
//
// The workout is saved on the session (sessions.generated_workout), so
// resuming shows the same exercises. app/api/workout/route.ts turns it into
// blocks the same way it does coach templates, so weight suggestions, set
// logging and history all work unchanged.

import { createServerClient } from '@/lib/supabase'

type Db = ReturnType<typeof createServerClient>

export type FullBodyArea = 'quad' | 'hamstring' | 'push' | 'pull'
export type FullBodyRole = 'main' | 'secondary'
export type SelfGuidedRoleTag = `${FullBodyArea}_${FullBodyRole | 'easier'}`

export interface GeneratedExercise {
  exerciseId: string
  area: FullBodyArea
  role: FullBodyRole
  reps: string
  /** Set when the player swapped to an easier option */
  swappedFromId?: string
  swappedFromName?: string
}

export interface GeneratedBlock {
  label: string
  area: FullBodyArea
  title: string
  sets: number
  exercises: GeneratedExercise[]
}

export interface GeneratedWorkout {
  version: 2
  name: string
  description: string
  warmupNotes: string
  generatedAt: string
  blocks: GeneratedBlock[]
}

interface AreaRule {
  area: FullBodyArea
  label: string
  title: string
  mainCategories: string[]
  secondaryCategories: string[]
}

export const FULL_BODY_AREAS: AreaRule[] = [
  { area: 'quad',      label: 'A', title: 'Quad',      mainCategories: ['Lower - Quad'],      secondaryCategories: ['Power'] },
  { area: 'hamstring', label: 'B', title: 'Hamstring', mainCategories: ['Lower - Hamstring'], secondaryCategories: ['Lower - Hip/Glute'] },
  { area: 'push',      label: 'C', title: 'Push',      mainCategories: ['Upper - Push'],      secondaryCategories: ['Core'] },
  { area: 'pull',      label: 'D', title: 'Pull',      mainCategories: ['Upper - Pull'],      secondaryCategories: ['Upper - Pull'] },
]

/** Every tag the Exercise Library page can set, in display order */
export const SELF_GUIDED_ROLE_COLUMNS: { role: FullBodyRole | 'easier'; label: string }[] = [
  { role: 'main', label: 'Main' },
  { role: 'secondary', label: 'Secondary' },
  { role: 'easier', label: 'Easier option' },
]

export function roleTag(area: FullBodyArea, role: FullBodyRole | 'easier'): SelfGuidedRoleTag {
  return `${area}_${role}` as SelfGuidedRoleTag
}

const SETS_PER_BLOCK = 3
const DEFAULT_REPS: Record<FullBodyRole, string> = { main: '8', secondary: '10' }
const RECENT_WORKOUTS_TO_AVOID = 2
const MAX_EASIER_OPTIONS = 8

// Names that usually mean lighter load or shorter range of motion
const EASIER_NAME = /goblet|box|assisted|band|banded|partial|pin|floor|incline|supported|split|step|\bdb\b|dumbbell|single[- ]arm|single[- ]leg|machine|iso|hold|tempo|bodyweight|\bbw\b|wall|kneeling|bridge|landmine|trx|ring|cable|light/i

const WARMUP =
  '5 minutes easy cardio, then 10 bodyweight squats, 10 glute bridges, 10 arm circles each way and a 30-second plank. Start each main lift light and build up.'

export interface LibraryRow {
  id: string
  name: string
  category: string | null
  default_reps: string | null
  logs_weight: boolean | null
  equipment: string | null
  self_guided_roles: string[] | null
}

function pickRandom<T>(items: T[]): T | null {
  if (!items.length) return null
  return items[Math.floor(Math.random() * items.length)]
}

function hasTag(ex: LibraryRow, tag: SelfGuidedRoleTag): boolean {
  return Array.isArray(ex.self_guided_roles) && ex.self_guided_roles.includes(tag)
}

function areaRule(area: FullBodyArea): AreaRule {
  return FULL_BODY_AREAS.find(a => a.area === area)!
}

/** The exercises that can fill a Main or Secondary spot (tagged ones, else category rules). */
export function spotCandidates(library: LibraryRow[], area: FullBodyArea, role: FullBodyRole): LibraryRow[] {
  const tagged = library.filter(ex => hasTag(ex, roleTag(area, role)))
  if (tagged.length) return tagged

  const rule = areaRule(area)
  const categories = role === 'main' ? rule.mainCategories : rule.secondaryCategories
  const inCategory = library.filter(ex => ex.category && categories.includes(ex.category))
  // Main lifts prefer weighted exercises; secondaries prefer unweighted
  const preferred = inCategory.filter(ex => role === 'main' ? ex.logs_weight === true : ex.logs_weight !== true)
  return preferred.length ? preferred : inCategory
}

/**
 * Easier options for one exercise in the workout — same area, ordered so the
 * most likely lighter/shorter-range choices come first.
 */
export function easierOptions(
  library: LibraryRow[],
  area: FullBodyArea,
  role: FullBodyRole,
  excludeIds: Set<string>,
): LibraryRow[] {
  const rule = areaRule(area)
  const categories = role === 'main' ? rule.mainCategories : rule.secondaryCategories
  const usable = library.filter(ex => !excludeIds.has(ex.id))

  const tagged = usable.filter(ex => hasTag(ex, roleTag(area, 'easier')))
  // Same category, minus lifts tagged as this block's Main (those aren't "easier")
  const inCategory = usable.filter(ex =>
    ex.category && categories.includes(ex.category) && !tagged.includes(ex) && !hasTag(ex, roleTag(area, 'main')))
  // Leave out barbell lifts whenever there's a non-barbell choice
  const nonBarbell = inCategory.filter(ex => ex.equipment !== 'barbell')
  const sameCategory = (nonBarbell.length ? nonBarbell : inCategory)
    .sort((a, b) => {
      const ea = EASIER_NAME.test(a.name) ? 0 : 1
      const eb = EASIER_NAME.test(b.name) ? 0 : 1
      if (ea !== eb) return ea - eb
      return a.name.localeCompare(b.name)
    })

  return [...tagged.sort((a, b) => a.name.localeCompare(b.name)), ...sameCategory].slice(0, MAX_EASIER_OPTIONS)
}

/** Active exercise library, with or without the self_guided_roles column (before the migration). */
export async function loadLibrary(db: Db): Promise<LibraryRow[]> {
  const full = await db
    .from('exercise_library')
    .select('id, name, category, default_reps, logs_weight, equipment, self_guided_roles')
    .eq('is_active', true)
  if (!full.error) return (full.data ?? []) as LibraryRow[]

  const basic = await db
    .from('exercise_library')
    .select('id, name, category, default_reps, logs_weight, equipment')
    .eq('is_active', true)
  return ((basic.data ?? []) as Omit<LibraryRow, 'self_guided_roles'>[]).map(ex => ({ ...ex, self_guided_roles: null }))
}

/** Exercises the coach has this player skipping or replacing today. */
export async function skippedExerciseIds(db: Db, playerId: string, today: string): Promise<Set<string>> {
  const { data } = await db
    .from('player_exercise_skips')
    .select('exercise_id')
    .eq('player_id', playerId)
    .eq('is_active', true)
    .or(`ends_on.is.null,ends_on.gte.${today}`)
  return new Set((data ?? []).map(s => s.exercise_id as string))
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
    const w = asGeneratedWorkout(row.generated_workout)
    for (const b of w?.blocks ?? []) for (const e of b.exercises ?? []) ids.add(e.exerciseId)
  }
  return ids
}

function chooseForSpot(
  library: LibraryRow[],
  area: FullBodyArea,
  role: FullBodyRole,
  used: Set<string>,
  recent: Set<string>,
): LibraryRow | null {
  const pool = spotCandidates(library, area, role).filter(ex => !used.has(ex.id))
  if (!pool.length) return null
  const fresh = pool.filter(ex => !recent.has(ex.id))
  return pickRandom(fresh.length ? fresh : pool)
}

function friendlyDate(today: string): string {
  return new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

/**
 * Builds a new full-body workout for a self-guided player.
 * Returns null only if the library has nothing usable for any block.
 */
export async function buildFullBodyWorkout(db: Db, playerId: string, today: string): Promise<GeneratedWorkout | null> {
  const [libraryAll, skips, recent] = await Promise.all([
    loadLibrary(db),
    skippedExerciseIds(db, playerId, today),
    recentGeneratedExerciseIds(db, playerId),
  ])

  const library = libraryAll.filter(ex => !skips.has(ex.id))
  const used = new Set<string>()

  const blocks: GeneratedBlock[] = []
  for (const rule of FULL_BODY_AREAS) {
    const exercises: GeneratedExercise[] = []
    for (const role of ['main', 'secondary'] as FullBodyRole[]) {
      const ex = chooseForSpot(library, rule.area, role, used, recent)
      if (!ex) continue
      used.add(ex.id)
      exercises.push({ exerciseId: ex.id, area: rule.area, role, reps: ex.default_reps?.trim() || DEFAULT_REPS[role] })
    }
    if (exercises.length) {
      blocks.push({ label: rule.label, area: rule.area, title: rule.title, sets: SETS_PER_BLOCK, exercises })
    }
  }

  if (!blocks.length) return null

  return {
    version: 2,
    name: 'Full Body Workout',
    description: `${friendlyDate(today)} · ${blocks.map(b => `${b.label} ${b.title}`).join(' · ')} — new every time you sign in`,
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

/** Slot id used on the player page for one exercise: "gen-<block>-<exercise>" */
export function slotId(blockIndex: number, exerciseIndex: number): string {
  return `gen-${blockIndex}-${exerciseIndex}`
}

export function parseSlotId(slot: string | null | undefined): { blockIndex: number; exerciseIndex: number } | null {
  const m = /^gen-(\d+)-(\d+)$/.exec(slot ?? '')
  if (!m) return null
  return { blockIndex: Number(m[1]), exerciseIndex: Number(m[2]) }
}
