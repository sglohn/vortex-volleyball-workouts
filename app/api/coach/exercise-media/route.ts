// FILE: app/api/coach/exercise-media/route.ts
//
// Uploads the still picture of an exercise's demo clip to Supabase storage
// (bucket "exercise-media") from the server. (This used to upload the
// start/finish photos too; clips replaced those.)
//
// The Exercises page used to upload straight from the browser with the
// public Supabase key, which put that key in the site's public JavaScript.
// Now the browser sends the picture here, and only the server talks to
// Supabase. Coach-only: middleware.ts requires the coach cookie for every
// /api/coach/* route.
//
//   POST multipart form: file (image), exerciseId, which ('poster')
//   → { url }  public URL of the uploaded picture
//
// 'poster' is the still frame taken from an exercise's demo clip (see
// components/ClipPicker.tsx). The clip itself is uploaded differently
// (app/api/coach/exercise-clip/route.ts) because videos can be too big for
// this route.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const MAX_BYTES = 4 * 1024 * 1024
const ID_RE = /^[0-9a-f-]{8,64}$/i
const SLOTS = ['poster']

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Expected a picture upload' }, { status: 400 })

  const file = form.get('file')
  const exerciseId = String(form.get('exerciseId') ?? '')
  const which = String(form.get('which') ?? '')

  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: 'No picture' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Picture is too large (4 MB max)' }, { status: 413 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
  if (!ID_RE.test(exerciseId)) return NextResponse.json({ error: 'Bad exercise id' }, { status: 400 })
  if (!SLOTS.includes(which)) return NextResponse.json({ error: 'Bad picture slot' }, { status: 400 })

  const path = `exercises/${exerciseId}/${which}_${Date.now()}.jpg`
  const db = createServerClient()
  const { error } = await db.storage
    .from('exercise-media')
    .upload(path, Buffer.from(await file.arrayBuffer()), { upsert: true, contentType: 'image/jpeg' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = db.storage.from('exercise-media').getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
