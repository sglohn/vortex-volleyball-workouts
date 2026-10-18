// FILE: components/ExerciseImport.tsx
//
// "Import" button on the coach Exercise Library page.
// Reads an exercise export file (the CSV from running
// supabase/export-exercises.sql in another copy of this app, or plain JSON),
// then sends the exercises to /api/coach/exercises/import a few at a time.
// Two choices before picking the file:
//   Add new only          - exercises already here (same name) are skipped
//   Add new + update      - exercises already here are brought up to date
//                           from the file too (details, new demo clip)
// Either way it's safe to run the same file again later.
'use client'
import { useRef, useState } from 'react'

const BATCH = 5

type Result = { name: string; status: 'added' | 'updated' | 'unchanged' | 'skipped' | 'error'; detail?: string }

// Accepts the Supabase SQL Editor CSV download (header line + one quoted
// JSON cell) or a plain JSON file.
function parseExportFile(text: string): Record<string, unknown>[] {
  const tryJson = (s: string) => {
    const v = JSON.parse(s)
    if (Array.isArray(v)) return v
    if (v && Array.isArray(v.exercises)) return v.exercises
    throw new Error('not an exercise list')
  }
  const trimmed = text.trim()
  try { return tryJson(trimmed) } catch { /* try CSV */ }
  const nl = trimmed.indexOf('\n')
  let cell = (nl >= 0 ? trimmed.slice(nl + 1) : trimmed).trim()
  if (cell.startsWith('"') && cell.endsWith('"')) cell = cell.slice(1, -1).replace(/""/g, '"')
  return tryJson(cell)
}

export default function ExerciseImport({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState<Result[] | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [updateExisting, setUpdateExisting] = useState(false)

  async function handleFile(file: File) {
    setResults(null)
    let list: Record<string, unknown>[]
    try { list = parseExportFile(await file.text()) }
    catch { setProgress("That file doesn't look like an exercise export."); return }
    if (list.length === 0) { setProgress('The file has no exercises.'); return }

    setRunning(true)
    const all: Result[] = []
    for (let i = 0; i < list.length; i += BATCH) {
      setProgress(`Importing ${Math.min(i + BATCH, list.length)} of ${list.length}…`)
      const res = await fetch('/api/coach/exercises/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercises: list.slice(i, i + BATCH), updateExisting }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        all.push(...list.slice(i, i + BATCH).map(e => ({ name: String(e.name ?? '?'), status: 'error' as const, detail: data.error ?? `error ${res.status}` })))
      } else {
        all.push(...(data.results ?? []))
      }
    }
    setRunning(false)
    setResults(all)
    const count = (s: Result['status']) => all.filter(r => r.status === s).length
    const parts = [`${count('added')} added`]
    if (updateExisting) parts.push(`${count('updated')} updated`, `${count('unchanged')} already up to date`)
    else parts.push(`${count('skipped')} already here`)
    if (count('error')) parts.push(`${count('error')} failed`)
    setProgress(`Done: ${parts.join(', ')}.`)
    onDone()
  }

  const problems = (results ?? []).filter(r => r.status === 'error' || r.detail?.includes(' without '))
  const updated = (results ?? []).filter(r => r.status === 'updated' && !r.detail?.includes(' without '))

  return (
    <div style={{ position: 'relative' }}>
      <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f) }} />
      <button className="btn-ghost" disabled={running} onClick={() => { setProgress(''); setResults(null); setChoosing(c => !c) }} style={{ padding: '0.625rem 1rem' }}>
        {running ? 'Importing…' : 'Import'}
      </button>
      {choosing && !running && (
        <div className="card" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 20, width: 320, maxWidth: 'none', padding: '0.875rem', fontSize: '0.82rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Import exercises from a file</div>
          {([
            [false, 'Add new exercises only', 'Exercises already here are left as they are.'],
            [true, 'Add new and update ones already here', 'Exercises with the same name get the file\'s category, sets/reps, equipment, notes, and any new demo clip. Blanks in the file never erase anything here.'],
          ] as const).map(([value, label, hint]) => (
            <label key={label} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.5rem', cursor: 'pointer' }}>
              <input type="radio" name="import-mode" checked={updateExisting === value} onChange={() => setUpdateExisting(value)} style={{ marginTop: 3 }} />
              <span>
                <span style={{ fontWeight: 600 }}>{label}</span>
                <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{hint}</span>
              </span>
            </label>
          ))}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
            <button className="btn-volt" onClick={() => { setChoosing(false); fileRef.current?.click() }} style={{ padding: '0.5rem 0.875rem' }}>Choose file…</button>
            <button className="btn-ghost" onClick={() => setChoosing(false)} style={{ padding: '0.5rem 0.875rem' }}>Cancel</button>
          </div>
        </div>
      )}
      {progress && (
        <div className="card" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 20, width: 300, maxWidth: 'none', padding: '0.75rem', fontSize: '0.8rem' }}>
          <div style={{ fontWeight: 600, marginBottom: problems.length ? '0.4rem' : 0 }}>{progress}</div>
          {updated.length > 0 && (
            <ul style={{ margin: '0 0 0.4rem', paddingLeft: '1rem', maxHeight: 140, overflowY: 'auto', color: 'var(--text-secondary)' }}>
              {updated.map((u, i) => <li key={i}>{u.name}: {u.detail}</li>)}
            </ul>
          )}
          {problems.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: '1rem', maxHeight: 160, overflowY: 'auto', color: 'var(--text-secondary)' }}>
              {problems.map((p, i) => <li key={i}>{p.name}: {p.detail}</li>)}
            </ul>
          )}
          {!running && (
            <button onClick={() => { setProgress(''); setResults(null) }} style={{ marginTop: '0.4rem', background: 'none', border: 'none', color: 'var(--carolina-dark)', cursor: 'pointer', padding: 0, fontSize: '0.78rem', fontWeight: 600 }}>
              Close
            </button>
          )}
        </div>
      )}
    </div>
  )
}
