// FILE: app/api/coach/exercises/import/route.ts
//
// Imports exercises exported from another copy of this app (for example,
// copying the exercise library into the Bruisers Lacrosse database).
// Coach-only: middleware.ts requires the coach cookie for /api/coach/*.
//
//   POST { exercises: ExportedExercise[], updateExisting?: boolean }
//        (up to 5 per call; the Import button sends them in small batches)
//   → { results: [{ name, status: 'added' | 'updated' | 'unchanged' | 'skipped' | 'error', detail? }] }
//
//   POST { backups: [{ name, backup }] }   (sent once at the end, after every
//        exercise is in, since a backup may come later in the file)
//   → { linked, missing: string[] }
//
// Easier/harder families: the family name and level come across with each
// exercise. The recommended backup is matched by name in the final step.
//
// For each exercise:
//   - new name: added
//   - name already in the library:
//       updateExisting off (default) → skipped
//       updateExisting on → its details (including family, level and
//         backup) are brought up to date from the file. Only details the
//         file actually has are copied, so a blank in the export never
//         wipes out something set here. Photos and the demo clip are only
//         copied again when the export's one is different from the one
//         copied last time. Nothing is ever removed, and settings this site
//         keeps for itself (self-guided spots, bar speed, active/hidden)
//         are left alone.
//   - photos and demo clips are downloaded from the export's Supabase
//     storage and re-uploaded into this site's own "exercise-media" bucket,
//     so this site never loads images or clips from the other project
//   - bar speed logging is turned off when VBT is off (lib/features.ts)

import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { asEquipment } from '@/lib/loads'
import { FEATURES } from '@/lib/features'

export const maxDuration = 120

const MAX_PER_CALL = 5
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_CLIP_BYTES = 20 * 1024 * 1024

interface ExportedExercise {
  name?: string
  category?: string | null
  default_sets?: number | null
  default_reps?: string | null
  logs_weight?: boolean | null
  logs_velocity?: boolean | null
  coaching_notes?: string | null
  demo_url?: string | null
  demo_image_url?: string | null
  start_image_url?: string | null
  end_image_url?: string | null
  start_image_position?: string | null
  end_image_position?: string | null
  equipment?: string | null
  clip_url?: string | null
  clip_poster_url?: string | null
  variation_family?: string | null
  variation_level?: number | null
  backup_exercise_name?: string | null
}

/** Family name tidied the same way the Exercise Library page saves it */
function cleanFamily(value: string | null | undefined): string | null {
  const f = (value ?? '').trim().replace(/\s+/g, ' ')
  return f || null
}

/** Level 1–20, or null */
function cleanLevel(value: unknown): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : null
}

// Only copy photos from Supabase public storage, never arbitrary addresses
function isSupabasePublicImage(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname.endsWith('.supabase.co') && u.pathname.startsWith('/storage/v1/object/public/')
  } catch { return false }
}

type Db = ReturnType<typeof createServerClient>

/**
 * Short fingerprint of where a photo or clip came from. It goes into the
 * copied file's name, so a later update can tell whether the export's file
 * is the same one already copied (and skip downloading it again).
 */
function sourceTag(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 10)
}

/** True if `current` (this site's copy) was copied from `source`. */
function copiedFrom(current: string | null | undefined, source: string): boolean {
  return !!current && current.includes(`_${sourceTag(source)}.`)
}

async function copyImage(db: Db, url: string, exerciseId: string, which: string): Promise<string | null> {
  if (!isSupabasePublicImage(url)) return null
  const res = await fetch(url)
  if (!res.ok) throw new Error(`photo download failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('photo too large')
  const type = res.headers.get('content-type') ?? 'image/jpeg'
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
  const path = `exercises/${exerciseId}/${which}_${Date.now()}_${sourceTag(url)}.${ext}`
  const { error } = await db.storage.from('exercise-media').upload(path, buf, { upsert: true, contentType: type })
  if (error) throw new Error(`photo upload failed: ${error.message}`)
  return db.storage.from('exercise-media').getPublicUrl(path).data.publicUrl
}

async function copyClip(db: Db, url: string, exerciseId: string): Promise<string | null> {
  if (!isSupabasePublicImage(url)) return null
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

type Result = { name: string; status: 'added' | 'updated' | 'unchanged' | 'skipped' | 'error'; detail?: string }

type ExistingRow = {
  id: string; category: string | null; default_sets: number | null; default_reps: string | null
  logs_weight: boolean | null; equipment: string | null; coaching_notes: string | null; demo_url: string | null
  start_image_url: string | null; end_image_url: string | null; demo_image_url: string | null
  start_image_position: string | null; end_image_position: string | null
  clip_url?: string | null; clip_poster_url?: string | null
  variation_family?: string | null; variation_level?: number | null
}

const has = (v: unknown) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')

/** Brings an exercise already in this library up to date from the export. */
async function updateExisting(db: Db, ex: ExportedExercise, row: ExistingRow, name: string): Promise<Result> {
  const changed: string[] = []

  // ── Details ──
  const details: Record<string, unknown> = {}
  const set = (column: keyof ExistingRow, value: unknown, label: string) => {
    if (!has(value) || row[column] === value) return
    details[column] = value
    if (!changed.includes(label)) changed.push(label)
  }
  set('category', ex.category, 'category')
  set('default_sets', ex.default_sets, 'sets/reps')
  set('default_reps', ex.default_reps, 'sets/reps')
  set('logs_weight', ex.logs_weight, 'logs weight')
  set('equipment', asEquipment(ex.equipment ?? null), 'equipment')
  set('coaching_notes', ex.coaching_notes, 'notes')
  set('demo_url', ex.demo_url, 'demo link')
  set('start_image_position', ex.start_image_position, 'photo framing')
  set('end_image_position', ex.end_image_position, 'photo framing')
  const family = cleanFamily(ex.variation_family)
  if (family) {
    set('variation_family', family, 'family')
    set('variation_level', cleanLevel(ex.variation_level), 'family')
  }
  if (Object.keys(details).length) {
    const { error } = await db.from('exercise_library').update(details).eq('id', row.id)
    if (error) return { name, status: 'error', detail: error.message }
  }

  // ── Photos (only ones that are different from what was copied before) ──
  try {
    const photos: Record<string, string | null> = {}
    const copied = new Map<string, string | null>()
    const copy = async (url: string, which: string) => {
      if (!copied.has(url)) copied.set(url, await copyImage(db, url, row.id, which))
      return copied.get(url) ?? null
    }
    if (ex.start_image_url && !copiedFrom(row.start_image_url, ex.start_image_url)) {
      const u = await copy(ex.start_image_url, 'start'); if (u) photos.start_image_url = u
    }
    if (ex.end_image_url && !copiedFrom(row.end_image_url, ex.end_image_url)) {
      const u = await copy(ex.end_image_url, 'end'); if (u) photos.end_image_url = u
    }
    if (ex.demo_image_url && !copiedFrom(row.demo_image_url, ex.demo_image_url)) {
      const u = await copy(ex.demo_image_url, 'start'); if (u) photos.demo_image_url = u
    }
    if (Object.keys(photos).length) {
      const { error } = await db.from('exercise_library').update(photos).eq('id', row.id)
      if (error) throw new Error(error.message)
      changed.push('photos')
    }
  } catch (e) {
    return { name, status: 'updated', detail: `updated without new photos (${(e as Error).message})` }
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
      return { name, status: 'updated', detail: `updated without its new demo clip (${(e as Error).message})` }
    }
  }

  return changed.length
    ? { name, status: 'updated', detail: changed.join(', ') }
    : { name, status: 'unchanged' }
}

/** Final step: set each exercise's recommended backup by name. */
async function linkBackups(db: Db, links: { name?: string; backup?: string }[]) {
  const pairs = links
    .map(l => ({ name: (l.name ?? '').trim(), backup: (l.backup ?? '').trim() }))
    .filter(l => l.name && l.backup && l.name !== l.backup)
  const names = [...new Set(pairs.flatMap(p => [p.name, p.backup]))]
  const { data } = names.length
    ? await db.from('exercise_library').select('id, name, backup_exercise_id').in('name', names)
    : { data: [] }
  const byName = new Map((data ?? []).map(r => [r.name as string, r as { id: string; name: string; backup_exercise_id: string | null }]))

  let linked = 0
  const missing: string[] = []
  for (const p of pairs) {
    const ex = byName.get(p.name)
    const backup = byName.get(p.backup)
    if (!ex) continue
    if (!backup) { missing.push(`${p.name} → ${p.backup}`); continue }
    if (ex.backup_exercise_id === backup.id) continue
    const { error } = await db.from('exercise_library').update({ backup_exercise_id: backup.id }).eq('id', ex.id)
    if (!error) linked++
  }
  return { linked, missing }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    exercises?: ExportedExercise[]; updateExisting?: boolean; backups?: { name?: string; backup?: string }[]
  } | null

  if (Array.isArray(body?.backups)) {
    if (body!.backups!.length > 500) return NextResponse.json({ error: 'Too many backups' }, { status: 400 })
    return NextResponse.json(await linkBackups(createServerClient(), body!.backups!))
  }

  const list = Array.isArray(body?.exercises) ? body!.exercises! : null
  const update = body?.updateExisting === true
  if (!list || list.length === 0) return NextResponse.json({ error: 'No exercises' }, { status: 400 })
  if (list.length > MAX_PER_CALL) return NextResponse.json({ error: `Send at most ${MAX_PER_CALL} at a time` }, { status: 400 })

  const db = createServerClient()
  const results: Result[] = []

  for (const ex of list) {
    const name = (ex.name ?? '').trim()
    if (!name) { results.push({ name: '(no name)', status: 'error', detail: 'missing name' }); continue }

    const { data: existing } = await db.from('exercise_library').select('*').eq('name', name).maybeSingle()
    if (existing) {
      results.push(update
        ? await updateExisting(db, ex, existing as ExistingRow, name)
        : { name, status: 'skipped', detail: 'already in library' })
      continue
    }

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
      start_image_position: ex.start_image_position ?? '50% 50%',
      end_image_position: ex.end_image_position ?? '50% 50%',
      ...(cleanFamily(ex.variation_family)
        ? { variation_family: cleanFamily(ex.variation_family), variation_level: cleanLevel(ex.variation_level) }
        : {}),
    }).select('id').single()
    if (error || !created) { results.push({ name, status: 'error', detail: error?.message ?? 'insert failed' }); continue }

    // Photos: copy each distinct one once
    try {
      const copied = new Map<string, string | null>()
      const copy = async (url: string | null | undefined, which: string) => {
        if (!url) return null
        if (!copied.has(url)) copied.set(url, await copyImage(db, url, created.id, which))
        return copied.get(url) ?? null
      }
      const start = await copy(ex.start_image_url, 'start')
      const end = await copy(ex.end_image_url, 'end')
      const demo = await copy(ex.demo_image_url, 'start')
      if (start || end || demo) {
        await db.from('exercise_library').update({
          start_image_url: start, end_image_url: end, demo_image_url: demo ?? start,
        }).eq('id', created.id)
      }
    } catch (e) {
      results.push({ name, status: 'added', detail: `added without photos (${(e as Error).message})` })
      continue
    }

    // Demo clip and its still picture (only if this site has the clip columns)
    if (ex.clip_url) {
      try {
        const clip = await copyClip(db, ex.clip_url, created.id)
        const poster = ex.clip_poster_url ? await copyImage(db, ex.clip_poster_url, created.id, 'poster') : null
        if (clip) {
          const { error: clipError } = await db.from('exercise_library').update({ clip_url: clip, clip_poster_url: poster }).eq('id', created.id)
          if (clipError) throw new Error(clipError.message)
        }
      } catch (e) {
        results.push({ name, status: 'added', detail: `added without its demo clip (${(e as Error).message})` })
        continue
      }
    }
    results.push({ name, status: 'added' })
  }

  return NextResponse.json({ results })
}
