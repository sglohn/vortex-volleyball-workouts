// FILE: lib/exerciseFeed.ts
//
// The exercise feed: one site (Vortex) shares its active exercise library,
// another (Bruisers Lacrosse) pulls from it with the Sync button.
//
// Vercel settings
//   On the SOURCE site (Vortex):
//     EXERCISE_FEED_SECRET    turns the feed on. Without it the feed address
//                             answers "Not found".
//   On the SYNCING site (Bruisers Lacrosse):
//     EXERCISE_SOURCE_URL     the source site's address, e.g.
//                             https://vortex-volleyball-workouts.vercel.app
//     EXERCISE_SOURCE_SECRET  the same value as the source's
//                             EXERCISE_FEED_SECRET
//   The Sync button only shows when both are set.
//
// The feed only ever contains exercises (names, sets/reps, notes, photo and
// clip links). No players, teams, workouts or anything else. The syncing
// site never gets the source's database key.
//
// Server-only.

import { createHash, timingSafeEqual } from 'crypto'
import type { LibraryRow, SourceExercise } from '@/lib/exerciseCopy'

const clean = (v: string | undefined) => (v ?? '').trim()

// ── Source side ──

export function feedSecret(): string { return clean(process.env.EXERCISE_FEED_SECRET) }

/** True if the request carries the feed secret. */
export function feedAuthorized(header: string | null): boolean {
  const secret = feedSecret()
  if (secret.length < 16 || !header?.startsWith('Bearer ')) return false
  const a = Buffer.from(header.slice(7).trim())
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ── Syncing side ──

export function syncConfigured(): boolean {
  return !!clean(process.env.EXERCISE_SOURCE_URL) && !!clean(process.env.EXERCISE_SOURCE_SECRET)
}

export type FeedExercise = SourceExercise & { id: string; name: string }

/** Downloads the source site's exercise list. Throws a readable message. */
export async function fetchFeed(): Promise<FeedExercise[]> {
  const base = clean(process.env.EXERCISE_SOURCE_URL).replace(/\/+$/, '')
  let res: Response
  try {
    res = await fetch(`${base}/api/exercise-feed`, {
      headers: { authorization: `Bearer ${clean(process.env.EXERCISE_SOURCE_SECRET)}` },
      cache: 'no-store',
    })
  } catch {
    throw new Error("Couldn't reach the source site. Check EXERCISE_SOURCE_URL.")
  }
  if (res.status === 401 || res.status === 404) {
    throw new Error("The source site didn't accept the sync key. Check that EXERCISE_SOURCE_SECRET here matches EXERCISE_FEED_SECRET there.")
  }
  if (!res.ok) throw new Error(`The source site answered with an error (${res.status}).`)
  const data = await res.json().catch(() => null) as { exercises?: FeedExercise[] } | null
  if (!data || !Array.isArray(data.exercises)) throw new Error("The source site's answer wasn't an exercise list.")
  return data.exercises.filter(e => typeof e.id === 'string' && typeof e.name === 'string' && e.name.trim())
}

/**
 * Fingerprint of everything Sync copies, as the exercise is here. Saved
 * after each sync; if it no longer matches later, the exercise was edited
 * here and Sync leaves it alone.
 */
export function rowHash(row: LibraryRow): string {
  const pick = [
    row.name, row.category, row.default_sets, row.default_reps, row.logs_weight, row.equipment,
    row.coaching_notes, row.demo_url, row.start_image_url, row.end_image_url, row.demo_image_url,
    row.start_image_position, row.end_image_position, row.clip_url ?? null, row.clip_poster_url ?? null,
  ].map(v => (v === undefined ? null : v))
  return createHash('sha1').update(JSON.stringify(pick)).digest('hex')
}

/** Names compared the way people see them: case and extra spaces ignored. */
export const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()
