// FILE: components/ExerciseSync.tsx
//
// "Sync library" button on the coach Exercise Library page. Only shows on a
// site that has EXERCISE_SOURCE_URL and EXERCISE_SOURCE_SECRET set
// (lib/exerciseFeed.ts), i.e. Bruisers Lacrosse.
//
// 1. Tap Sync library → it checks the volleyball library and shows what's
//    new and what changed. Nothing is changed yet.
// 2. Untick any new exercise you don't want this time, or tap "Not for
//    this team" so it's never offered again.
// 3. Tap the confirm button → new exercises are added and changed ones are
//    updated (photos and clips copied here).
//
// Exercises edited on this site since the last sync are left alone; each
// one has a "Use volleyball version" button (tap twice) if you want it.
//
// Easier/harder levels and backups (lib/exerciseLevelsSync.ts): blank ones
// here are filled in with volleyball's when you confirm (also for exercises
// added in the same sync). Ones set differently here are listed with "Use
// volleyball's" (one, or all; tap twice) and otherwise left alone.
// Sync never deletes anything. Server side: app/api/coach/exercises/sync/route.ts
'use client'
import { useEffect, useState } from 'react'

const HEAVY_BATCH = 5

type Item = { source_id: string; name: string; category?: string | null; changes?: string[] }
type LevelsItem = {
  source_id: string; name: string; fill: string[]; differs: string[]
  vbFamily: string | null; hereFamily: string | null; vbBackup: string | null; hereBackup: string | null
  backupMissing: string | null
}
type Preview = {
  configured: boolean; error?: string
  new: Item[]; update: Item[]; kept: Item[]; passed: Item[]
  matchIds: string[]; upToDate: number
  levels?: LevelsItem[]
}
type Action = { source_id: string; action: 'add' | 'update' | 'force' | 'link' | 'pass' | 'unpass' | 'levels' }
type Result = { source_id: string; name: string; status: string; detail?: string }

async function post(actions: Action[], fillLevels = false): Promise<Result[]> {
  const res = await fetch('/api/coach/exercises/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actions, ...(fillLevels ? { fillLevels: true } : {}) }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return actions.map(a => ({ source_id: a.source_id, name: '?', status: 'error', detail: data.error ?? `error ${res.status}` }))
  return data.results ?? []
}

const sectionTitle: React.CSSProperties = { fontWeight: 700, fontSize: '0.8rem', margin: '0.875rem 0 0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)' }
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderTop: '1px solid var(--gray-border)', fontSize: '0.85rem' }
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--carolina-dark)', cursor: 'pointer', padding: 0, fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }
const muted: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '0.75rem' }

/** "family: Squat, level 2 · backup: Goblet Squat" for the parts listed */
function levelsLine(i: LevelsItem, parts: string[], side: 'vb' | 'here'): string {
  return [
    parts.includes('family') ? `family: ${(side === 'vb' ? i.vbFamily : i.hereFamily) ?? 'none'}` : '',
    parts.includes('backup') ? `backup: ${(side === 'vb' ? i.vbBackup : i.hereBackup) ?? 'none'}` : '',
  ].filter(Boolean).join(' · ')
}

export default function ExerciseSync({ onDone }: { onDone: () => void }) {
  const [available, setAvailable] = useState(false)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loadError, setLoadError] = useState('')
  const [skipNew, setSkipNew] = useState<Set<string>>(new Set())
  const [confirmForce, setConfirmForce] = useState<string | null>(null)
  const [busy, setBusy] = useState('')            // progress text while working
  const [results, setResults] = useState<Result[] | null>(null)
  const [showPassed, setShowPassed] = useState(false)
  const [confirmLevels, setConfirmLevels] = useState<string | null>(null)   // source_id, or 'all'

  useEffect(() => {
    fetch('/api/coach/exercises/sync?check=1').then(r => r.json()).then(d => setAvailable(!!d.configured)).catch(() => {})
  }, [])

  async function loadPreview() {
    setPreview(null); setLoadError(''); setResults(null); setConfirmForce(null); setConfirmLevels(null); setSkipNew(new Set())
    const res = await fetch('/api/coach/exercises/sync')
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) { setLoadError(data.error ?? `Couldn't check (error ${res.status})`); return }
    setPreview(data)
  }

  function openPanel() { setOpen(true); loadPreview() }
  function close() { setOpen(false); setPreview(null); setResults(null); setBusy('') }

  // Small one-off actions (Not for this team, Offer again, Use volleyball version)
  async function quick(action: Action, label: string) {
    setBusy(label)
    const r = await post([action])
    setBusy('')
    const bad = r.find(x => x.status === 'error')
    if (bad) { setLoadError(`${bad.name}: ${bad.detail}`); return }
    if (action.action === 'force' || action.action === 'levels') onDone()
    await loadPreview()
  }

  // "Use volleyball's" levels/backup for every exercise set differently here
  async function levelsAll(ids: string[]) {
    setBusy('Updating levels and backups…')
    const r = await post(ids.map(id => ({ source_id: id, action: 'levels' as const })))
    setBusy('')
    const bad = r.filter(x => x.status === 'error')
    if (bad.length) { setLoadError(bad.map(b => `${b.name}: ${b.detail}`).join('; ')); return }
    onDone()
    await loadPreview()
  }

  async function runSync() {
    if (!preview) return
    const heavy: Action[] = [
      ...preview.new.filter(n => !skipNew.has(n.source_id)).map(n => ({ source_id: n.source_id, action: 'add' as const })),
      ...preview.update.map(u => ({ source_id: u.source_id, action: 'update' as const })),
    ]
    const links: Action[] = preview.matchIds.map(id => ({ source_id: id, action: 'link' }))
    const all: Result[] = []
    const fill = fillCount > 0 || heavy.some(a => a.action === 'add')
    // Exact matches are just linked up (quick), in the first call
    const batches: Action[][] = []
    for (let i = 0; i < heavy.length; i += HEAVY_BATCH) batches.push(heavy.slice(i, i + HEAVY_BATCH))
    if (!batches.length) batches.push([])
    batches[0] = [...links, ...batches[0]]
    let done = 0
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b]
      const last = b === batches.length - 1
      // Levels/backups are filled in with the last call, after every add
      if (!batch.length && !(last && fill)) continue
      setBusy(heavy.length ? `Syncing ${Math.min(done + HEAVY_BATCH, heavy.length)} of ${heavy.length}…` : 'Syncing…')
      all.push(...await post(batch, last && fill))
      done += HEAVY_BATCH
    }
    setBusy('')
    setResults(all.filter(r => r.status !== 'linked'))
    onDone()
  }

  if (!available) return null

  const newCount = preview ? preview.new.filter(n => !skipNew.has(n.source_id)).length : 0
  const updateCount = preview?.update.length ?? 0
  const levelItems = preview?.levels ?? []
  const fillItems = levelItems.filter(i => i.fill.length)
  const fillCount = fillItems.length
  const differItems = levelItems.filter(i => i.differs.length)
  const missingItems = levelItems.filter(i => i.backupMissing)
  const nothingToDo = preview && !preview.new.length && !preview.update.length && !fillCount
  const count = (s: string) => (results ?? []).filter(r => r.status === s).length
  const problems = (results ?? []).filter(r => r.status === 'error' || r.status === 'skipped' || r.detail?.includes(' without '))

  return (
    <>
      <button className="btn-ghost" onClick={openPanel} style={{ padding: '0.625rem 1rem' }}>Sync library</button>
      {open && (
        <div onClick={e => { if (e.target === e.currentTarget && !busy) close() }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 16px', overflowY: 'auto' }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem' }}>Sync exercise library</div>
              {!busy && <button onClick={close} style={linkBtn}>Close</button>}
            </div>

            {loadError && <p style={{ marginTop: '0.75rem', color: '#b91c1c', fontSize: '0.85rem' }}>{loadError}</p>}
            {!preview && !loadError && <p style={{ marginTop: '0.75rem', ...muted, fontSize: '0.85rem' }}>Checking the volleyball library…</p>}

            {/* ── After syncing ── */}
            {results && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                <p style={{ fontWeight: 600 }}>
                  Done: {count('added')} added, {count('updated')} updated
                  {count('levels') ? `, levels/backups set on ${count('levels')}` : ''}{count('error') ? `, ${count('error')} failed` : ''}.
                </p>
                {problems.length > 0 && (
                  <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1rem', color: 'var(--text-secondary)' }}>
                    {problems.map((p, i) => <li key={i}>{p.name}: {p.detail}</li>)}
                  </ul>
                )}
                <button className="btn-volt" onClick={close} style={{ marginTop: '1rem', padding: '0.625rem 1.25rem' }}>Done</button>
              </div>
            )}

            {/* ── Preview ── */}
            {preview && !results && (
              <>
                <p style={{ marginTop: '0.5rem', ...muted, fontSize: '0.82rem' }}>
                  {preview.new.length} new · {preview.update.length} changed · {preview.upToDate + preview.matchIds.length} already up to date
                  {preview.kept.length ? ` · ${preview.kept.length} edited here (left alone)` : ''}
                  {fillCount ? ` · ${fillCount} levels/backups to fill in` : ''}
                </p>

                {nothingToDo && <p style={{ marginTop: '0.875rem', fontWeight: 600 }}>Everything's up to date.</p>}

                {preview.new.length > 0 && (
                  <>
                    <div style={sectionTitle}>New exercises</div>
                    {preview.new.map(n => (
                      <label key={n.source_id} style={{ ...rowStyle, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!skipNew.has(n.source_id)} disabled={!!busy}
                          onChange={() => setSkipNew(s => { const x = new Set(s); if (x.has(n.source_id)) x.delete(n.source_id); else x.add(n.source_id); return x })} />
                        <span style={{ flex: 1 }}>{n.name}{n.category ? <span style={{ ...muted, marginLeft: 6 }}>{n.category}</span> : null}</span>
                        <button style={linkBtn} disabled={!!busy} onClick={e => { e.preventDefault(); quick({ source_id: n.source_id, action: 'pass' }, 'Saving…') }}>
                          Not for this team
                        </button>
                      </label>
                    ))}
                  </>
                )}

                {preview.update.length > 0 && (
                  <>
                    <div style={sectionTitle}>Changed in volleyball</div>
                    {preview.update.map(u => (
                      <div key={u.source_id} style={rowStyle}>
                        <span style={{ flex: 1 }}>{u.name}</span>
                        <span style={muted}>{u.changes?.join(', ')}</span>
                      </div>
                    ))}
                  </>
                )}

                {fillCount > 0 && (
                  <>
                    <div style={sectionTitle}>Easier/harder levels and backups to fill in</div>
                    <p style={{ ...muted, marginBottom: '0.25rem' }}>Blank here, set in volleyball. They&apos;ll be copied over.</p>
                    {fillItems.map(i => (
                      <div key={i.source_id} style={rowStyle}>
                        <span style={{ flex: 1 }}>{i.name}<span style={{ ...muted, display: 'block' }}>{levelsLine(i, i.fill, 'vb')}</span></span>
                      </div>
                    ))}
                  </>
                )}

                {(preview.new.length > 0 || preview.update.length > 0 || fillCount > 0) && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn-volt" disabled={!!busy || (newCount === 0 && updateCount === 0 && fillCount === 0)} onClick={runSync} style={{ padding: '0.625rem 1.25rem' }}>
                      {busy || [
                        newCount ? `Add ${newCount} new` : '',
                        updateCount ? `Update ${updateCount}` : '',
                        fillCount ? `Fill in ${fillCount} levels/backups` : '',
                      ].filter(Boolean).join(', ') || 'Nothing selected'}
                    </button>
                    {!busy && <button className="btn-ghost" onClick={close} style={{ padding: '0.625rem 1rem' }}>Cancel</button>}
                  </div>
                )}

                {preview.kept.length > 0 && (
                  <>
                    <div style={sectionTitle}>Edited here — left alone</div>
                    <p style={{ ...muted, marginBottom: '0.25rem' }}>These are different here than in volleyball, so Sync won&apos;t change them.</p>
                    {preview.kept.map(k => (
                      <div key={k.source_id} style={rowStyle}>
                        <span style={{ flex: 1 }}>{k.name}<span style={{ ...muted, display: 'block' }}>Volleyball has different {k.changes?.join(', ')}</span></span>
                        {confirmForce === k.source_id ? (
                          <button style={{ ...linkBtn, color: '#b91c1c' }} disabled={!!busy}
                            onClick={() => { setConfirmForce(null); quick({ source_id: k.source_id, action: 'force' }, 'Updating…') }}>
                            Tap again to replace
                          </button>
                        ) : (
                          <button style={linkBtn} disabled={!!busy} onClick={() => setConfirmForce(k.source_id)}>Use volleyball version</button>
                        )}
                      </div>
                    ))}
                  </>
                )}

                {differItems.length > 0 && (
                  <>
                    <div style={sectionTitle}>Levels or backups set differently here</div>
                    <p style={{ ...muted, marginBottom: '0.25rem' }}>Left alone unless you pick volleyball&apos;s.</p>
                    {differItems.map(i => (
                      <div key={i.source_id} style={rowStyle}>
                        <span style={{ flex: 1 }}>
                          {i.name}
                          <span style={{ ...muted, display: 'block' }}>Here: {levelsLine(i, i.differs, 'here')}</span>
                          <span style={{ ...muted, display: 'block' }}>Volleyball: {levelsLine(i, i.differs, 'vb')}</span>
                        </span>
                        {confirmLevels === i.source_id ? (
                          <button style={{ ...linkBtn, color: '#b91c1c' }} disabled={!!busy}
                            onClick={() => { setConfirmLevels(null); quick({ source_id: i.source_id, action: 'levels' }, 'Updating…') }}>
                            Tap again to replace
                          </button>
                        ) : (
                          <button style={linkBtn} disabled={!!busy} onClick={() => setConfirmLevels(i.source_id)}>Use volleyball&apos;s</button>
                        )}
                      </div>
                    ))}
                    {differItems.length > 1 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        {confirmLevels === 'all' ? (
                          <button style={{ ...linkBtn, color: '#b91c1c' }} disabled={!!busy}
                            onClick={() => { setConfirmLevels(null); levelsAll(differItems.map(i => i.source_id)) }}>
                            Tap again to use volleyball&apos;s for all {differItems.length}
                          </button>
                        ) : (
                          <button style={linkBtn} disabled={!!busy} onClick={() => setConfirmLevels('all')}>
                            Use volleyball&apos;s for all {differItems.length}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                {missingItems.length > 0 && (
                  <>
                    <div style={sectionTitle}>Backups not in this library</div>
                    <p style={{ ...muted, marginBottom: '0.25rem' }}>Volleyball&apos;s backup for these isn&apos;t here yet, so it can&apos;t be set. Add it (or tap Offer again if it was left out), then sync again.</p>
                    {missingItems.map(i => (
                      <div key={i.source_id} style={rowStyle}>
                        <span style={{ flex: 1 }}>{i.name}</span>
                        <span style={muted}>backup: {i.backupMissing}</span>
                      </div>
                    ))}
                  </>
                )}

                {preview.passed.length > 0 && (
                  <div style={{ marginTop: '0.875rem' }}>
                    <button style={linkBtn} onClick={() => setShowPassed(v => !v)}>
                      {showPassed ? 'Hide' : 'Show'} {preview.passed.length} left out (not for this team, or deleted here)
                    </button>
                    {showPassed && preview.passed.map(p => (
                      <div key={p.source_id} style={rowStyle}>
                        <span style={{ flex: 1 }}>{p.name}</span>
                        <button style={linkBtn} disabled={!!busy} onClick={() => quick({ source_id: p.source_id, action: 'unpass' }, 'Saving…')}>Offer again</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
