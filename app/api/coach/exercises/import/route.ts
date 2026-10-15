// FILE: app/api/coach/exercises/import/route.ts
//
// Imports exercises from an export file made in another copy of this app
// (supabase/export-exercises.sql). The Sync button
// (app/api/coach/exercises/sync/route.ts) does the same thing from the live
// feed without a file; this stays as a fallback.
// Coach-only: middleware.ts requires the coach cookie for /api/coach/*.
//
//   POST { exercises: SourceExercise[], updateExisting?: boolean }
//        (up to 5 per call; the Import button sends them in small batches)
//   → { results: [{ name, status: 'added' | 'updated' | 'unchanged' | 'skipped' | 'error', detail? }] }
//
// For each exercise:
//   - new name: added
//   - name already in the library:
//       updateExisting off (default) → skipped
//       updateExisting on → brought up to date from the file
// How photos, clips and blanks are handled: lib/exerciseCopy.ts

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { addExercise, updateExisting, type CopyResult, type LibraryRow, type SourceExercise } from '@/lib/exerciseCopy'

export const maxDuration = 120

const MAX_PER_CALL = 5

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { exercises?: SourceExercise[]; updateExisting?: boolean } | null
  const list = Array.isArray(body?.exercises) ? body!.exercises! : null
  const update = body?.updateExisting === true
  if (!list || list.length === 0) return NextResponse.json({ error: 'No exercises' }, { status: 400 })
  if (list.length > MAX_PER_CALL) return NextResponse.json({ error: `Send at most ${MAX_PER_CALL} at a time` }, { status: 400 })

  const db = createServerClient()
  const results: CopyResult[] = []

  for (const ex of list) {
    const name = (ex.name ?? '').trim()
    if (!name) { results.push({ name: '(no name)', status: 'error', detail: 'missing name' }); continue }

    const { data: existing } = await db.from('exercise_library').select('*').eq('name', name).maybeSingle()
    if (existing) {
      results.push(update
        ? await updateExisting(db, ex, existing as LibraryRow, name)
        : { name, status: 'skipped', detail: 'already in library' })
      continue
    }
    results.push(await addExercise(db, ex, name))
  }

  return NextResponse.json({ results: results.map(({ id: _id, ...r }) => r) })
}
