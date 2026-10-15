// FILE: app/api/coach/exercises/sync/route.ts
//
// Sync button on the coach Exercise Library page (components/ExerciseSync.tsx).
// Pulls new and changed exercises from the source site's exercise feed
// (lib/exerciseFeed.ts). Coach-only: middleware.ts requires the coach cookie
// for /api/coach/*. Needs migration 2026-10-15_exercise_sync.sql.
//
//   GET ?check=1 → { configured }                       (button shown or not)
//   GET  → { configured: false }                        (button hidden)
//        → { configured: true, new, update, kept, passed,
//            matchIds, upToDate }                         (the preview)
//   POST { actions: [{ source_id, action }] }
//        → { results: [{ source_id, name, status, detail? }] }
//
// What Sync does with each exercise in the feed:
//   new      not here yet → offered (added when the coach confirms), or
//            "Not for this team" → never offered again ("passed")
//   update   synced before and NOT edited here since → brought up to date
//            (details, renamed, new photos/clip). Blanks in the source
//            never erase anything here.
//   kept     edited here since the last sync, or already here under the
//            same name but different and never synced → left alone. The
//            coach can still pick "Use volleyball version" for one.
//   match    already here, same name, nothing different → just linked up,
//            so later changes flow through
//   passed   deleted here, or marked "Not for this team" → left out
//   Sync never deletes or hides anything, and never touches exercises that
//   aren't in the feed.
//
// Actions (POST): add, update, force (use the source version), link, pass,
// unpass (offer again). At most 5 add/update/force per call, since each can
// copy photos and a clip.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { addExercise, exerciseDiff, LIBRARY_COLUMNS, updateExisting, type Db, type LibraryRow } from '@/lib/exerciseCopy'
import { fetchFeed, nameKey, rowHash, syncConfigured, type FeedExercise } from '@/lib/exerciseFeed'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const MAX_HEAVY = 5
const MAX_ACTIONS = 400

type Link = { source_id: string; exercise_id: string | null; synced_hash: string | null }
type Action = 'add' | 'update' | 'force' | 'link' | 'pass' | 'unpass'

type State = {
  feed: FeedExercise[]
  rows: LibraryRow[]
  byId: Map<string, LibraryRow>
  byName: Map<string, LibraryRow>   // only exercises here not linked to anything yet
  links: Map<string, Link>
}

async function loadState(db: Db): Promise<State> {
  const feed = await fetchFeed()
  const [{ data: rows, error: rowsError }, { data: links, error: linksError }] = await Promise.all([
    db.from('exercise_library').select(LIBRARY_COLUMNS),
    db.from('exercise_sync').select('source_id, exercise_id, synced_hash'),
  ])
  if (rowsError) throw new Error(rowsError.message)
  if (linksError) {
    throw new Error(linksError.message.includes('exercise_sync')
      ? 'Run supabase/migrations/2026-10-15_exercise_sync.sql in this site\'s Supabase project first.'
      : linksError.message)
  }
  const all = (rows ?? []) as unknown as LibraryRow[]
  const linkMap = new Map<string, Link>(((links ?? []) as Link[]).map(l => [l.source_id, l]))
  const linkedIds = new Set([...linkMap.values()].map(l => l.exercise_id).filter(Boolean) as string[])
  const byName = new Map<string, LibraryRow>()
  for (const r of all) if (!linkedIds.has(r.id)) byName.set(nameKey(r.name), r)
  return { feed, rows: all, byId: new Map(all.map(r => [r.id, r])), byName, links: linkMap }
}

/** True if another exercise here already uses this name (so it can't be renamed to it). */
function nameTaken(state: State, name: string, exceptId: string): boolean {
  const key = nameKey(name)
  return state.rows.some(r => r.id !== exceptId && nameKey(r.name) === key)
}

/** Changes a sync would make to a linked exercise, including a rename. */
function linkedDiff(state: State, f: FeedExercise, row: LibraryRow): string[] {
  const changes = exerciseDiff(f, row)
  if (f.name.trim() !== row.name && !nameTaken(state, f.name, row.id)) changes.unshift('name')
  return changes
}

type Plan =
  | { kind: 'new' }
  | { kind: 'passed' }
  | { kind: 'upToDate' }
  | { kind: 'match'; row: LibraryRow }
  | { kind: 'update'; row: LibraryRow; changes: string[] }
  | { kind: 'kept'; row: LibraryRow; changes: string[] }

function planFor(state: State, f: FeedExercise): Plan {
  const link = state.links.get(f.id)
  if (link) {
    const row = link.exercise_id ? state.byId.get(link.exercise_id) : undefined
    if (!row) return { kind: 'passed' }
    const changes = linkedDiff(state, f, row)
    if (!changes.length) return { kind: 'upToDate' }
    const editedHere = !link.synced_hash || rowHash(row) !== link.synced_hash
    return editedHere ? { kind: 'kept', row, changes } : { kind: 'update', row, changes }
  }
  const row = state.byName.get(nameKey(f.name))
  if (!row) return { kind: 'new' }
  const changes = exerciseDiff(f, row)
  return changes.length ? { kind: 'kept', row, changes } : { kind: 'match', row }
}

export async function GET(req: NextRequest) {
  if (!syncConfigured()) return NextResponse.json({ configured: false })
  // ?check=1: just "is Sync set up?" (decides whether the button shows)
  if (req.nextUrl.searchParams.get('check')) return NextResponse.json({ configured: true })
  const db = createServerClient()
  let state: State
  try { state = await loadState(db) }
  catch (e) { return NextResponse.json({ configured: true, error: (e as Error).message }, { status: 502 }) }

  const out = {
    configured: true,
    new: [] as { source_id: string; name: string; category: string | null }[],
    update: [] as { source_id: string; name: string; changes: string[] }[],
    kept: [] as { source_id: string; name: string; changes: string[] }[],
    passed: [] as { source_id: string; name: string }[],
    matchIds: [] as string[],
    upToDate: 0,
  }
  for (const f of state.feed) {
    const p = planFor(state, f)
    const name = f.name.trim()
    switch (p.kind) {
      case 'new': out.new.push({ source_id: f.id, name, category: f.category ?? null }); break
      case 'update': out.update.push({ source_id: f.id, name: p.row.name, changes: p.changes }); break
      case 'kept': out.kept.push({ source_id: f.id, name: p.row.name, changes: p.changes }); break
      case 'match': out.matchIds.push(f.id); break
      case 'upToDate': out.upToDate++; break
      case 'passed': out.passed.push({ source_id: f.id, name }); break
    }
  }
  return NextResponse.json(out)
}

type Result = { source_id: string; name: string; status: 'added' | 'updated' | 'unchanged' | 'linked' | 'passed' | 'offered' | 'skipped' | 'error'; detail?: string }

/** Saves the link and the fingerprint of the exercise as it is now. */
async function saveLink(db: Db, sourceId: string, exerciseId: string): Promise<string | null> {
  const { data: row, error } = await db.from('exercise_library').select(LIBRARY_COLUMNS).eq('id', exerciseId).single()
  if (error || !row) return error?.message ?? 'exercise not found after saving'
  const { error: linkError } = await db.from('exercise_sync').upsert({
    source_id: sourceId, exercise_id: exerciseId, synced_hash: rowHash(row as unknown as LibraryRow), synced_at: new Date().toISOString(),
  })
  return linkError?.message ?? null
}

/** Brings a linked/matched exercise up to the source version (details, name, media). */
async function applySource(db: Db, state: State, f: FeedExercise, row: LibraryRow): Promise<Result> {
  const r = await updateExisting(db, f, row, row.name)
  let renamed = false
  if (r.status !== 'error' && f.name.trim() !== row.name && !nameTaken(state, f.name, row.id)) {
    const { error } = await db.from('exercise_library').update({ name: f.name.trim() }).eq('id', row.id)
    if (!error) renamed = true
  }
  if (r.status === 'error') return { source_id: f.id, name: row.name, status: 'error', detail: r.detail }
  const linkError = await saveLink(db, f.id, row.id)
  if (linkError) return { source_id: f.id, name: row.name, status: 'error', detail: linkError }
  const detail = [renamed ? `renamed to ${f.name.trim()}` : '', r.detail ?? ''].filter(Boolean).join(', ')
  return {
    source_id: f.id, name: renamed ? f.name.trim() : row.name,
    status: renamed || r.status === 'updated' ? 'updated' : 'unchanged',
    ...(detail ? { detail } : {}),
  }
}

async function runAction(db: Db, state: State, sourceId: string, action: Action): Promise<Result> {
  const f = state.feed.find(e => e.id === sourceId)
  if (!f) return { source_id: sourceId, name: '?', status: 'skipped', detail: 'no longer in the source library' }
  const name = f.name.trim()
  const plan = planFor(state, f)
  const link = state.links.get(f.id)

  switch (action) {
    case 'add': {
      if (plan.kind !== 'new') return { source_id: f.id, name, status: 'skipped', detail: 'already here' }
      if (state.rows.some(r => nameKey(r.name) === nameKey(name))) {
        return { source_id: f.id, name, status: 'skipped', detail: 'another exercise here already has this name' }
      }
      const r = await addExercise(db, f, name)
      if (r.status === 'error' || !r.id) return { source_id: f.id, name, status: 'error', detail: r.detail }
      const linkError = await saveLink(db, f.id, r.id)
      return linkError
        ? { source_id: f.id, name, status: 'error', detail: `added, but not linked (${linkError})` }
        : { source_id: f.id, name, status: 'added', ...(r.detail ? { detail: r.detail } : {}) }
    }
    case 'update': {
      // Re-checked here: if it was edited here since the preview, leave it alone
      if (plan.kind !== 'update') {
        return { source_id: f.id, name, status: 'skipped', detail: plan.kind === 'kept' ? 'edited here, left alone' : 'nothing to update' }
      }
      return applySource(db, state, f, plan.row)
    }
    case 'force': {
      if (plan.kind !== 'kept' && plan.kind !== 'update') return { source_id: f.id, name, status: 'skipped', detail: 'nothing to update' }
      return applySource(db, state, f, plan.row)
    }
    case 'link': {
      if (plan.kind !== 'match') return { source_id: f.id, name, status: 'skipped', detail: 'not an exact match' }
      const linkError = await saveLink(db, f.id, plan.row.id)
      return linkError ? { source_id: f.id, name, status: 'error', detail: linkError } : { source_id: f.id, name, status: 'linked' }
    }
    case 'pass': {
      if (plan.kind !== 'new') return { source_id: f.id, name, status: 'skipped', detail: 'already here' }
      const { error } = await db.from('exercise_sync').upsert({ source_id: f.id, exercise_id: null, synced_hash: null, synced_at: new Date().toISOString() })
      return error ? { source_id: f.id, name, status: 'error', detail: error.message } : { source_id: f.id, name, status: 'passed' }
    }
    case 'unpass': {
      if (!link || link.exercise_id) return { source_id: f.id, name, status: 'skipped' }
      const { error } = await db.from('exercise_sync').delete().eq('source_id', f.id).is('exercise_id', null)
      return error ? { source_id: f.id, name, status: 'error', detail: error.message } : { source_id: f.id, name, status: 'offered' }
    }
  }
}

const ACTIONS = new Set<Action>(['add', 'update', 'force', 'link', 'pass', 'unpass'])
const HEAVY = new Set<Action>(['add', 'update', 'force'])

export async function POST(req: NextRequest) {
  if (!syncConfigured()) return NextResponse.json({ error: 'Sync is not set up on this site' }, { status: 404 })
  const body = await req.json().catch(() => null) as { actions?: { source_id?: unknown; action?: unknown }[] } | null
  const actions = (Array.isArray(body?.actions) ? body!.actions! : [])
    .filter((a): a is { source_id: string; action: Action } =>
      typeof a?.source_id === 'string' && /^[0-9a-f-]{36}$/i.test(a.source_id) && ACTIONS.has(a.action as Action))
  if (!actions.length) return NextResponse.json({ error: 'Nothing to do' }, { status: 400 })
  if (actions.length > MAX_ACTIONS) return NextResponse.json({ error: `At most ${MAX_ACTIONS} at a time` }, { status: 400 })
  if (actions.filter(a => HEAVY.has(a.action)).length > MAX_HEAVY) {
    return NextResponse.json({ error: `At most ${MAX_HEAVY} adds/updates at a time` }, { status: 400 })
  }

  const db = createServerClient()
  let state: State
  try { state = await loadState(db) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }) }

  const results: Result[] = []
  for (const a of actions) {
    try { results.push(await runAction(db, state, a.source_id, a.action)) }
    catch (e) { results.push({ source_id: a.source_id, name: '?', status: 'error', detail: (e as Error).message }) }
  }
  return NextResponse.json({ results })
}
