// FILE: components/ExerciseImport.tsx
//
// "Import" button on the coach Exercise Library page.
// Reads an exercise export file (the CSV from running
// supabase/export-exercises.sql in another copy of this app, or plain JSON),
// then sends the exercises to /api/coach/exercises/import a few at a time.
// Exercises already in the library (same name) are skipped, so it's safe to
// run the same file again later to pick up new exercises.
'use client'
import { useRef, useState } from 'react'

const BATCH = 5

type Result = { name: string; status: 'added' | 'skipped' | 'error'; detail?: string }

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
        body: JSON.stringify({ exercises: list.slice(i, i + BATCH) }),
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
    const added = all.filter(r => r.status === 'added').length
    const skipped = all.filter(r => r.status === 'skipped').length
    const errors = all.filter(r => r.status === 'error').length
    setProgress(`Done: ${added} added, ${skipped} already here${errors ? `, ${errors} failed` : ''}.`)
    onDone()
  }

  const problems = (results ?? []).filter(r => r.status === 'error' || r.detail?.startsWith('added without'))

  return (
    <div style={{ position: 'relative' }}>
      <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f) }} />
      <button className="btn-ghost" disabled={running} onClick={() => fileRef.current?.click()} style={{ padding: '0.625rem 1rem' }}>
        {running ? 'Importing…' : 'Import'}
      </button>
      {progress && (
        <div className="card" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 20, width: 300, maxWidth: 'none', padding: '0.75rem', fontSize: '0.8rem' }}>
          <div style={{ fontWeight: 600, marginBottom: problems.length ? '0.4rem' : 0 }}>{progress}</div>
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
