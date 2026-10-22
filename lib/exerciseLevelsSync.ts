// FILE: lib/exerciseLevelsSync.ts
//
// Easier / harder levels and backups in Sync (lacrosse pulls from Vortex).
// Used by app/api/coach/exercises/sync/route.ts; shown in
// components/ExerciseSync.tsx.
//
// For every exercise in the volleyball feed that is also here (linked by an
// earlier sync, or the same name), compares:
//   family + level   exercise_library.variation_family / variation_level
//   backup           exercise_library.backup_exercise_id, matched to the
//                    same exercise here (by sync link, then by name)
//
// Each part is one of:
//   fill     blank here, set in volleyball → filled in when the coach
//            confirms Sync (also for exercises added in that same sync)
//   differs  set here to something else → left alone unless the coach taps
//            "Use volleyball's" (one exercise, or all of them)
//   missing  volleyball's backup isn't in this library (not added yet, or
//            "Not for this team") → can't be set, just listed
// Blanks in volleyball never erase anything here.
//
// These columns aren't part of Sync's "edited here" fingerprint
// (rowHash in lib/exerciseFeed.ts), so filling them in never makes an
// exercise look edited, and editing them here never blocks other updates.

import { familyKey } from '@/lib/exerciseLevels'

export interface LevelsFeedRow {
  id: string
  name: string
  variation_family?: string | null
  variation_level?: number | null
  backup_exercise_id?: string | null
}

export interface LevelsHereRow {
  id: string
  name: string
  variation_family?: string | null
  variation_level?: number | null
  backup_exercise_id?: string | null
}

export type LevelsPart = 'family' | 'backup'

export interface LevelsItem {
  source_id: string
  /** this site's exercise */
  exercise_id: string
  name: string
  fill: LevelsPart[]
  differs: LevelsPart[]
  /** volleyball's family and level, e.g. "Bulgarian Split Squat, level 2" */
  vbFamily: string | null
  hereFamily: string | null
  /** backup names */
  vbBackup: string | null
  hereBackup: string | null
  /** volleyball's backup isn't in this library */
  backupMissing: string | null
  /** the values to write */
  set: { variation_family?: string; variation_level?: number | null; backup_exercise_id?: string }
  setFill: { variation_family?: string; variation_level?: number | null; backup_exercise_id?: string }
}

const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
const nk = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

function familyLabel(family: string | null | undefined, level: number | null | undefined): string | null {
  if (blank(family)) return null
  return level ? `${family!.trim()}, level ${level}` : family!.trim()
}

/**
 * links: source_id → this site's exercise id (null = "Not for this team").
 * rows: this site's exercise library.
 */
export function planLevels(
  feed: LevelsFeedRow[],
  rows: LevelsHereRow[],
  links: Map<string, string | null>,
): LevelsItem[] {
  const byId = new Map(rows.map(r => [r.id, r]))
  const linkedIds = new Set([...links.values()].filter(Boolean) as string[])
  const byName = new Map<string, LevelsHereRow>()
  for (const r of rows) if (!linkedIds.has(r.id)) byName.set(nk(r.name), r)

  // Which exercise here a volleyball exercise is
  const hereFor = (f: LevelsFeedRow): LevelsHereRow | null => {
    if (links.has(f.id)) {
      const id = links.get(f.id)
      return id ? byId.get(id) ?? null : null
    }
    return byName.get(nk(f.name)) ?? null
  }
  const feedById = new Map(feed.map(f => [f.id, f]))

  const items: LevelsItem[] = []
  for (const f of feed) {
    const row = hereFor(f)
    if (!row) continue
    const item: LevelsItem = {
      source_id: f.id, exercise_id: row.id, name: row.name, fill: [], differs: [],
      vbFamily: familyLabel(f.variation_family, f.variation_level),
      hereFamily: familyLabel(row.variation_family, row.variation_level),
      vbBackup: null, hereBackup: null, backupMissing: null, set: {}, setFill: {},
    }

    // ── Family + level ──
    if (!blank(f.variation_family)) {
      const vbFam = f.variation_family!.trim()
      const vbLevel = f.variation_level ?? null
      const sameFamily = familyKey(row.variation_family) === familyKey(vbFam)
      const want = { variation_family: vbFam, variation_level: vbLevel }
      if (blank(row.variation_family)) {
        item.fill.push('family'); item.set = { ...item.set, ...want }; item.setFill = { ...item.setFill, ...want }
      } else if (sameFamily && (row.variation_level ?? null) === null && vbLevel !== null) {
        item.fill.push('family'); item.set = { ...item.set, ...want }; item.setFill = { ...item.setFill, ...want }
      } else if (!sameFamily || (vbLevel !== null && row.variation_level !== vbLevel)) {
        item.differs.push('family'); item.set = { ...item.set, ...want }
      }
    }

    // ── Backup ──
    if (f.backup_exercise_id) {
      const vbBackup = feedById.get(f.backup_exercise_id)
      if (vbBackup) {
        item.vbBackup = vbBackup.name.trim()
        const target = hereFor(vbBackup)
        const current = row.backup_exercise_id ? byId.get(row.backup_exercise_id) ?? null : null
        item.hereBackup = current?.name ?? null
        if (!target) {
          // Only worth mentioning when there's no backup here at all
          if (!row.backup_exercise_id) item.backupMissing = vbBackup.name.trim()
        } else if (target.id === row.id) {
          // would point at itself; skip
        } else if (!row.backup_exercise_id) {
          item.fill.push('backup'); item.set.backup_exercise_id = target.id; item.setFill.backup_exercise_id = target.id
        } else if (row.backup_exercise_id !== target.id) {
          item.differs.push('backup'); item.set.backup_exercise_id = target.id
        }
      }
    }

    if (item.fill.length || item.differs.length || item.backupMissing) items.push(item)
  }
  return items.sort((a, b) => a.name.localeCompare(b.name))
}
