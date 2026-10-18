// FILE: lib/exerciseCopy.ts
//
// Copying exercises from another copy of this app into this site's
// exercise library. Shared by:
//   Import  (app/api/coach/exercises/import/route.ts)  - from an export file
//   Sync    (app/api/coach/exercises/sync/route.ts)    - from the live feed
//
// Rules (same for both):
//   - demo clips (and their still pictures) are downloaded from the other
//     project's Supabase storage and re-uploaded into this site's own
//     "exercise-media" bucket, so this site never loads clips from the
//     other project
//   - the old start/finish photos are not copied (clips replaced them); an
//     older export file that still has them is fine, they're just ignored
//   - when updating, only details the source actually has are copied, so a
//     blank there never wipes out something set here
//   - the clip is only copied again when the source's file is
//     different from the one copied last time (the copied file's name
//     carries a short fingerprint of where it came from)
//   - settings this site keeps for itself (level family, backup exercise,
//     self-guided spots, bar speed, active/hidden) are never touched
//   - bar speed logging is turned off when VBT is off (lib/features.ts)
//
// Server-only.

import { createHash } from 'crypto'
import { createServerClient } from '@/lib/supabase'
import { asEquipment } from '@/lib/loads'
import { FEATURES } from '@/lib/features'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_CLIP_BYTES = 20 * 1024 * 1024

export type Db = ReturnType<typeof createServerClient>

/** One exercise as it comes from the other site (export file or feed). */
export interface SourceExercise {
  id?: string
  name?: string
  category?: string | null
  default_sets?: number | null
  default_reps?: string | null
  logs_weight?: boolean | null
  logs_velocity?: boolean | null
  coaching_notes?: string | null
  demo_url?: string | null
  equipment?: string | null
  clip_url?: string | null
  clip_poster_url?: string | null
}

/**
 * The columns of this site's exercise_library that copying reads. The photo
 * columns are no longer written, but are still read because Sync's
 * fingerprint (rowHash in lib/exerciseFeed.ts) includes them; taking them
 * out would make every synced exercise look edited here.
 */
export type LibraryRow = {
  id: string; name: string; category: string | null; default_sets: number | null; default_reps: string | null
  logs_weight: boolean | null; equipment: string | null; coaching_notes: string | null; demo_url: string | null
  start_image_url: string | null; end_image_url: string | null; demo_image_url: string | null
  start_image_position: string | null; end_image_position: string | null
  clip_url?: string | null; clip_poster_url?: string | null
  is_active?: boolean | null
}

export const LIBRARY_COLUMNS =
  'id, name, category, default_sets, default_reps, logs_weight, equipment, coaching_notes, demo_url, ' +
  'start_image_url, end_image_url, demo_image_url, start_image_position, end_image_position, ' +
  'clip_url, clip_poster_url, is_active'

export type CopyResult = { name: string; status: 'added' | 'updated' | 'unchanged' | 'skipped' | 'error'; detail?: string; id?: string }

// Only copy from Supabase public storage, never arbitrary addresses
function isSupabasePublicFile(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname.endsWith('.supabase.co') && u.pathname.startsWith('/storage/v1/object/public/')
  } catch { return false }
}

/** Short fingerprint of where a clip or picture came from (goes into the copied file's name). */
function sourceTag(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 10)
}

/** True if `current` (this site's copy) was copied from `source`. */
export function copiedFrom(current: string | null | undefined, source: string): boolean {
  return !!current && current.includes(`_${sourceTag(source)}.`)
}

async function copyImage(db: Db, url: string, exerciseId: string, which: string): Promise<string | null> {
  if (!isSupabasePublicFile(url)) return null
  const res = await fetch(url)
  if (!res.ok) throw new Error(`picture download failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('picture too large')
  const type = res.headers.get('content-type') ?? 'image/jpeg'
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
  const path = `exercises/${exerciseId}/${which}_${Date.now()}_${sourceTag(url)}.${ext}`
  const { error } = await db.storage.from('exercise-media').upload(path, buf, { upsert: true, contentType: type })
  if (error) throw new Error(`picture upload failed: ${error.message}`)
  return db.storage.from('exercise-media').getPublicUrl(path).data.publicUrl
}

async function copyClip(db: Db, url: string, exerciseId: string): Promise<string | null> {
  if (!isSupabasePublicFile(url)) return null
  const res = await fetch(url)
  if (!res.ok) throw new Error(`clip download failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_CLIP_BYTES) throw new Error('clip too large')
  const type = (res.headers.get('content-type') ?? '').includes('webm') ? 'video/webm' : 'video/mp4'
  const path = `exercises/${exerciseId}/clip_${Date.now()}_${sourceTag(url)}.${type === 'video/webm' ? 'webm' : 'mp4'}`
  const { error } = await db.storage.from('exercise-media').upload(path, buf, { upsert: true, contentType: type })
  if (error) throw new Error(`clip upload failed: ${error.message}`)
  return db.storage.from('exercise-media').getPublicUrl(path).data.publicUrl
}

const has = (v: unknown) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')

/** The detail columns copied from the source, with their labels. */
function detailChanges(ex: SourceExercise, row: LibraryRow): { details: Record<string, unknown>; labels: string[] } {
  const details: Record<string, unknown> = {}
  const labels: string[] = []
  const set = (column: keyof LibraryRow, value: unknown, label: string) => {
    if (!has(value) || row[column] === value) return
    details[column] = value
    if (!labels.includes(label)) labels.push(label)
  }
  set('category', ex.category, 'category')
  set('default_sets', ex.default_sets, 'sets/reps')
  set('default_reps', ex.default_reps, 'sets/reps')
  set('logs_weight', ex.logs_weight, 'logs weight')
  set('equipment', asEquipment(ex.equipment ?? null), 'equipment')
  set('coaching_notes', ex.coaching_notes, 'notes')
  set('demo_url', ex.demo_url, 'demo link')
  return { details, labels }
}

/**
 * What bringing `row` up to date from `ex` would change, as short labels
 * ("notes", "demo clip"...). Empty = already matches. Doesn't change anything.
 */
export function exerciseDiff(ex: SourceExercise, row: LibraryRow): string[] {
  const labels = [...detailChanges(ex, row).labels]
  if (ex.clip_url && !copiedFrom(row.clip_url, ex.clip_url)) labels.push('demo clip')
  return labels
}

/** Brings an exercise already in this library up to date from the source. */
export async function updateExisting(db: Db, ex: SourceExercise, row: LibraryRow, name: string): Promise<CopyResult> {
  const { details, labels: changed } = detailChanges(ex, row)
  if (Object.keys(details).length) {
    const { error } = await db.from('exercise_library').update(details).eq('id', row.id)
    if (error) return { name, status: 'error', detail: error.message, id: row.id }
  }

  // ── Demo clip ──
  if (ex.clip_url && !copiedFrom(row.clip_url, ex.clip_url)) {
    try {
      const clip = await copyClip(db, ex.clip_url, row.id)
      const poster = ex.clip_poster_url ? await copyImage(db, ex.clip_poster_url, row.id, 'poster') : null
      if (clip) {
        const { error } = await db.from('exercise_library').update({ clip_url: clip, clip_poster_url: poster ?? row.clip_poster_url ?? null }).eq('id', row.id)
        if (error) throw new Error(error.message)
        changed.push('demo clip')
      }
    } catch (e) {
      return { name, status: 'updated', detail: `updated without its new demo clip (${(e as Error).message})`, id: row.id }
    }
  }

  return changed.length
    ? { name, status: 'updated', detail: changed.join(', '), id: row.id }
    : { name, status: 'unchanged', id: row.id }
}

/** Adds a new exercise to this library, with a copy of its demo clip. */
export async function addExercise(db: Db, ex: SourceExercise, name: string): Promise<CopyResult> {
  const { data: created, error } = await db.from('exercise_library').insert({
    name,
    category: ex.category ?? null,
    default_sets: ex.default_sets ?? 3,
    default_reps: ex.default_reps ?? null,
    logs_weight: ex.logs_weight ?? false,
    logs_velocity: FEATURES.vbt ? (ex.logs_velocity ?? false) : false,
    equipment: asEquipment(ex.equipment ?? null),
    coaching_notes: ex.coaching_notes ?? null,
    demo_url: ex.demo_url ?? null,
  }).select('id').single()
  if (error || !created) return { name, status: 'error', detail: error?.message ?? 'insert failed' }

  // Demo clip and its still picture
  if (ex.clip_url) {
    try {
      const clip = await copyClip(db, ex.clip_url, created.id)
      const poster = ex.clip_poster_url ? await copyImage(db, ex.clip_poster_url, created.id, 'poster') : null
      if (clip) {
        const { error: clipError } = await db.from('exercise_library').update({ clip_url: clip, clip_poster_url: poster }).eq('id', created.id)
        if (clipError) throw new Error(clipError.message)
      }
    } catch (e) {
      return { name, status: 'added', detail: `added without its demo clip (${(e as Error).message})`, id: created.id }
    }
  }
  return { name, status: 'added', id: created.id }
}
