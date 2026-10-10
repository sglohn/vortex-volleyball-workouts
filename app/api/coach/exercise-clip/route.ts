// FILE: app/api/coach/exercise-clip/route.ts   (new file)
//
// Demo clip uploads for exercises (bucket "exercise-media").
//
// Vercel won't accept uploads bigger than about 4.5 MB through a site
// function, so the clip itself does NOT come through here. Instead:
//   1. The Exercises page asks this route for a one-time upload link.
//   2. The browser sends the clip straight to Supabase with that link.
// The link only works for the one file path it was made for, and the
// browser still never sees a Supabase key. Coach-only: middleware.ts
// requires the coach cookie for every /api/coach/* route.
//
//   POST   { exerciseId, contentType }  → { uploadUrl, publicUrl }
//          contentType: 'video/mp4' or 'video/webm'
//   DELETE { exerciseId, url }          → { ok: true }
//          removes an old clip or clip picture after it's replaced or
//          removed (only files in that exercise's own folder)

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const BUCKET = 'exercise-media'
const ID_RE = /^[0-9a-f-]{8,64}$/i
const EXTENSIONS: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { exerciseId?: string; contentType?: string } | null
  const exerciseId = String(body?.exerciseId ?? '')
  const contentType = String(body?.contentType ?? '')

  if (!ID_RE.test(exerciseId)) return NextResponse.json({ error: 'Bad exercise id' }, { status: 400 })
  const ext = EXTENSIONS[contentType]
  if (!ext) return NextResponse.json({ error: 'Clip must be an MP4 or WebM video' }, { status: 400 })

  const path = `exercises/${exerciseId}/clip_${Date.now()}.${ext}`
  const db = createServerClient()
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not start the upload' }, { status: 500 })

  const publicUrl = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  return NextResponse.json({ uploadUrl: data.signedUrl, publicUrl })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null) as { exerciseId?: string; url?: string } | null
  const exerciseId = String(body?.exerciseId ?? '')
  const url = String(body?.url ?? '')
  if (!ID_RE.test(exerciseId)) return NextResponse.json({ error: 'Bad exercise id' }, { status: 400 })

  // Turn the public URL back into a storage path, and only allow files in
  // this exercise's folder
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const at = url.indexOf(marker)
  const path = at >= 0 ? decodeURIComponent(url.slice(at + marker.length).split('?')[0]) : ''
  const folder = `exercises/${exerciseId}/`
  if (!path.startsWith(folder) || path.includes('..') || path.slice(folder.length).includes('/')) {
    return NextResponse.json({ error: 'Not a file of this exercise' }, { status: 400 })
  }

  const db = createServerClient()
  const { error } = await db.storage.from(BUCKET).remove([path])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
