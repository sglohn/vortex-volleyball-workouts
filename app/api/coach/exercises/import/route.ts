// FILE: app/api/coach/exercises/import/route.ts
//
// Imports exercises exported from another copy of this app (for example,
// copying the exercise library into the Bruisers Lacrosse database).
// Coach-only: middleware.ts requires the coach cookie for /api/coach/*.
//
//   POST { exercises: ExportedExercise[] }   (up to 5 per call; the
//        Import button sends them in small batches)
//   → { results: [{ name, status: 'added' | 'skipped' | 'error', detail? }] }
//
// For each exercise:
//   - skipped if an exercise with the same name already exists
//   - photos and demo clips are downloaded from the export's Supabase
//     storage and re-uploaded into this site's own "exercise-media" bucket,
//     so this site never loads images or clips from the other project
//   - bar speed logging is turned off when VBT is off (lib/features.ts)

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
}

// Only copy photos from Supabase public storage, never arbitrary addresses
function isSupabasePublicImage(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname.endsWith('.supabase.co') && u.pathname.startsWith('/storage/v1/object/public/')
  } catch { return false }
}

type Db = ReturnType<typeof createServerClient>

async function copyImage(db: Db, url: string, exerciseId: string, which: string): Promise<string | null> {
  if (!isSupabasePublicImage(url)) return null
  const res = await fetch(url)
  if (!res.ok) throw new Error(`photo download failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('photo too large')
  const type = res.headers.get('content-type') ?? 'image/jpeg'
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
  const path = `exercises/${exerciseId}/${which}_${Date.now()}.${ext}`
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
  const path = `exercises/${exerciseId}/clip_${Date.now()}.${type === 'video/webm' ? 'webm' : 'mp4'}`
  const { error } = await db.storage.from('exercise-media').upload(path, buf, { upsert: true, contentType: type })
  if (error) throw new Error(`clip upload failed: ${error.message}`)
  return db.storage.from('exercise-media').getPublicUrl(path).data.publicUrl
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { exercises?: ExportedExercise[] } | null
  const list = Array.isArray(body?.exercises) ? body!.exercises! : null
  if (!list || list.length === 0) return NextResponse.json({ error: 'No exercises' }, { status: 400 })
  if (list.length > MAX_PER_CALL) return NextResponse.json({ error: `Send at most ${MAX_PER_CALL} at a time` }, { status: 400 })

  const db = createServerClient()
  const results: { name: string; status: 'added' | 'skipped' | 'error'; detail?: string }[] = []

  for (const ex of list) {
    const name = (ex.name ?? '').trim()
    if (!name) { results.push({ name: '(no name)', status: 'error', detail: 'missing name' }); continue }

    const { data: existing } = await db.from('exercise_library').select('id').eq('name', name).maybeSingle()
    if (existing) { results.push({ name, status: 'skipped', detail: 'already in library' }); continue }

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
