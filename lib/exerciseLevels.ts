// FILE: lib/exerciseLevels.ts
//
// Easier / harder versions of the same movement, and the recommended backup.
//
// On the Exercise Library page, exercises that are versions of one movement
// share a family name and each gets a level (1 = easiest):
//
//   Bulgarian Split Squat   1 Bodyweight  →  2 Dumbbell  →  3 Barbell
//
// Each version is still its own exercise (own clip, logs, PRs and weight
// suggestions). An exercise can also name one recommended backup: a
// different movement for the same area.
//
// Used by:
//   - the Exercise Library page (setting levels, showing the ladder)
//   - the coach's change-request inbox (step down / step up / backup)
//   - self-guided easier options (lower levels and the backup come first)
//   - the player workout page ("Level 2 of 3")
//
// Safe to use before the migration (2026-10-10_exercise_levels_and_change_requests.sql)
// has been run: everything just comes back empty.

export interface LevelRow {
  id: string
  name: string
  variation_family?: string | null
  variation_level?: number | null
  backup_exercise_id?: string | null
}

/** Family names compare without caring about case or extra spaces */
export function familyKey(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Every exercise in the same family as `ex` (including `ex`), easiest first */
export function familyOf<T extends LevelRow>(library: T[], ex: LevelRow | null | undefined): T[] {
  const key = familyKey(ex?.variation_family)
  if (!key) return []
  return library
    .filter(row => familyKey(row.variation_family) === key)
    .sort((a, b) => (a.variation_level ?? 99) - (b.variation_level ?? 99) || a.name.localeCompare(b.name))
}

export interface ChangeOptions<T extends LevelRow> {
  family: string | null
  level: number | null
  levelCount: number
  /** Lower levels, closest first (one step down is easier[0]) */
  easier: T[]
  /** Higher levels, closest first */
  harder: T[]
  backup: T | null
}

/** The easier/harder versions and the backup for one exercise */
export function changeOptions<T extends LevelRow>(library: T[], exerciseId: string): ChangeOptions<T> {
  const ex = library.find(row => row.id === exerciseId)
  const family = familyOf(library, ex)
  const level = ex?.variation_level ?? null
  const others = family.filter(row => row.id !== exerciseId)
  const easier = level == null ? [] : others.filter(row => (row.variation_level ?? 99) < level).reverse()
  const harder = level == null ? [] : others.filter(row => (row.variation_level ?? 0) > level)
  const backup = ex?.backup_exercise_id ? library.find(row => row.id === ex.backup_exercise_id) ?? null : null
  return {
    family: family.length ? (ex?.variation_family ?? '').trim() : null,
    level: family.length ? level : null,
    levelCount: family.length,
    easier,
    harder,
    backup: backup && backup.id !== exerciseId ? backup : null,
  }
}

/** "Level 2 of 3", or null when the exercise isn't in a family */
export function levelLabel(level: number | null | undefined, count: number): string | null {
  if (!level || count < 2) return null
  return `Level ${level} of ${count}`
}

// ── Change requests ──────────────────────────────────────────────

export type ChangeWants = 'easier' | 'harder' | 'different'
export type ChangeReason = 'sore' | 'painful' | 'too_easy' | 'too_hard' | 'equipment' | 'other'

export const CHANGE_WANTS: { value: ChangeWants; label: string; hint: string }[] = [
  { value: 'easier',    label: 'Easier',              hint: 'Lighter or shorter range' },
  { value: 'harder',    label: 'Harder',              hint: 'Ready for the next level' },
  { value: 'different', label: 'Something different', hint: 'This movement doesn’t work for me' },
]

export const CHANGE_REASONS: { value: ChangeReason; label: string; asksWhere: boolean }[] = [
  { value: 'sore',      label: 'I’m sore',                  asksWhere: true },
  { value: 'painful',   label: 'The movement hurts',        asksWhere: true },
  { value: 'too_hard',  label: 'Too hard / can’t do it right', asksWhere: false },
  { value: 'too_easy',  label: 'Too easy',                  asksWhere: false },
  { value: 'equipment', label: 'Equipment isn’t free',      asksWhere: false },
  { value: 'other',     label: 'Something else',            asksWhere: false },
]

export const BODY_AREAS = [
  'Ankle', 'Knee', 'Hip', 'Hamstring', 'Quad', 'Groin', 'Lower back', 'Upper back',
  'Shoulder', 'Elbow', 'Wrist', 'Neck', 'Other',
]

export function reasonLabel(reason: string | null | undefined): string {
  return CHANGE_REASONS.find(r => r.value === reason)?.label ?? 'No reason given'
}

export function wantsLabel(wants: string | null | undefined): string {
  return CHANGE_WANTS.find(w => w.value === wants)?.label ?? ''
}

export function asWants(value: unknown): ChangeWants | null {
  return CHANGE_WANTS.some(w => w.value === value) ? value as ChangeWants : null
}

export function asReason(value: unknown): ChangeReason | null {
  return CHANGE_REASONS.some(r => r.value === value) ? value as ChangeReason : null
}

/** 0–10, or null */
export function asPainLevel(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n))) : null
}

/** Trimmed text up to `max` characters, or null */
export function asText(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t ? t.slice(0, max) : null
}

/** Short summary for the coach, e.g. "The movement hurts · Knee · pain 6/10" */
export function requestSummary(r: { reason?: string | null; body_part?: string | null; pain_level?: number | null }): string {
  return [
    reasonLabel(r.reason),
    r.body_part || null,
    r.pain_level != null ? `pain ${r.pain_level}/10` : null,
  ].filter(Boolean).join(' · ')
}
