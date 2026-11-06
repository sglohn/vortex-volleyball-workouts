'use client'
// FILE: components/WorkoutCredit.tsx
//
// How far a player got on one workout day, and (admins) how much credit it
// earns (lib/attendance.ts). Data: /api/coach/attendance/credit.
//   - Each check-in that day: her workout, check-in / finish time, every
//     exercise with sets logged of sets asked for (Combine Day: each test).
//   - Admins: Full credit · Keep her % done · No credit · any %, with a note.
//     "Back to % done" takes a decision away.
// Used on a team's roster (tap a day) and Coach → Teams "Workouts to review".

import { useEffect, useState } from 'react'
import { dayLabel } from '@/lib/attendance'

interface ExerciseLine { name: string; done: number; planned: number }
interface SessionDetail {
  sessionId: string; checkedInAt: string; finishedAt: string | null; workoutName: string; modified: boolean
  done: number; planned: number
  blocks: { label: string; exercises: ExerciseLine[] }[]
  combine: { tests: { label: string; done: boolean }[] } | null
}
interface Detail {
  date: string
  sessions: SessionDetail[]
  decision: { credit: number; note: string | null; by: string | null; at: string } | null
  canDecide: boolean
}

const time = (ts: string | null) => ts ? new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) : null

const btn = (bg: string, color: string): React.CSSProperties => ({
  padding: '0.4rem 0.75rem', borderRadius: 7, border: `1.5px solid ${color}40`, background: bg, color,
  fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
})

/** Save a credit decision (admins). credit null = back to her % done. */
export async function saveCredit(items: { playerId: string; date: string }[], credit: number | null, note?: string): Promise<string | null> {
  const res = await fetch('/api/coach/attendance/credit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, credit, note: note || undefined }),
  })
  if (res.ok) return null
  const d = await res.json().catch(() => ({}))
  return d.error || 'Could not save'
}

export default function WorkoutCredit({ playerId, playerName, date, onChanged, onClose }: {
  playerId: string; playerName?: string; date: string; onChanged?: () => void; onClose?: () => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [custom, setCustom] = useState('')
  const [note, setNote] = useState('')

  function load() {
    setError('')
    fetch(`/api/coach/attendance/credit?playerId=${playerId}&date=${date}`)
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || 'Could not load')))
      .then((d: Detail) => { setDetail(d); setNote(d.decision?.note ?? '') })
      .catch(e => setError(String(e)))
  }
  useEffect(load, [playerId, date])

  async function decide(credit: number | null) {
    setSaving(true)
    const err = await saveCredit([{ playerId, date }], credit, note)
    setSaving(false)
    if (err) { setError(err); return }
    setCustom('')
    load()
    onChanged?.()
  }

  const done = detail?.sessions.reduce((n, s) => n + s.done, 0) ?? 0
  const planned = detail?.sessions.reduce((n, s) => Math.max(n, s.planned), 0) ?? 0
  const combine = !!detail?.sessions.some(s => s.combine)
  const pctDone = planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0

  return (
    <div style={{ border: '1.5px solid var(--carolina-border)', borderRadius: 10, padding: '0.85rem 1rem', background: 'var(--white)', marginTop: '0.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.9rem' }}>{playerName ? `${playerName} · ` : ''}{dayLabel(date)}</strong>
        {detail && detail.sessions.length > 0 && (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {done} of {planned || '?'} {combine ? 'tests' : 'sets'} ({pctDone}%)
          </span>
        )}
        {onClose && <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem' }}>✕</button>}
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.4rem' }}>{error}</div>}
      {!detail && !error && <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.4rem' }}>Loading…</div>}

      {detail?.sessions.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.4rem' }}>She didn&apos;t check in that day.</div>}

      {detail?.sessions.map(s => (
        <div key={s.sessionId} style={{ marginTop: '0.6rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>
            {s.workoutName}{s.modified && <span className="tag" style={{ marginLeft: '0.4rem', fontSize: '0.65rem' }}>Modified</span>}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Checked in {time(s.checkedInAt)}{s.finishedAt ? ` · tapped Finish ${time(s.finishedAt)}` : ' · never tapped Finish'}
          </div>
          {s.combine && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.35rem' }}>
              {s.combine.tests.map(t => (
                <span key={t.label} style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: 5, background: t.done ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.08)', color: t.done ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                  {t.done ? '✓' : '✕'} {t.label}
                </span>
              ))}
            </div>
          )}
          {s.blocks.map(b => (
            <div key={b.label} style={{ marginTop: '0.35rem' }}>
              <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>{b.label}</div>
              {b.exercises.map((e, i) => {
                const full = e.planned > 0 && e.done >= e.planned
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.78rem', padding: '0.1rem 0' }}>
                    <span>{e.name}</span>
                    <span style={{ fontWeight: 700, color: full ? '#16a34a' : e.done ? '#d97706' : '#dc2626', whiteSpace: 'nowrap' }}>
                      {e.planned ? `${e.done}/${e.planned}` : `${e.done}`} sets
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
          {!s.combine && !s.blocks.length && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>No workout on file for this check-in.</div>}
        </div>
      ))}

      {detail && detail.sessions.length > 0 && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.6rem', borderTop: '1px solid var(--gray-border)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.45rem' }}>
            Credit: <strong>{detail.decision ? `${detail.decision.credit}%` : `${pctDone}%`}</strong>
            {detail.decision
              ? <> (decided{detail.decision.by ? ` by ${detail.decision.by}` : ''}{detail.decision.note ? `: ${detail.decision.note}` : ''})</>
              : pctDone < 100 ? <> (her % done, until an admin decides)</> : null}
          </div>
          {detail.canDecide && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                <button disabled={saving} onClick={() => decide(100)} style={btn('rgba(22,163,74,0.1)', '#16a34a')}>Full credit</button>
                {pctDone > 0 && pctDone < 100 && <button disabled={saving} onClick={() => decide(pctDone)} style={btn('rgba(217,119,6,0.1)', '#b45309')}>Keep {pctDone}%</button>}
                <button disabled={saving} onClick={() => decide(0)} style={btn('rgba(220,38,38,0.08)', '#dc2626')}>No credit</button>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input value={custom} onChange={e => setCustom(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))} placeholder="%" inputMode="numeric"
                    style={{ width: 52, padding: '0.35rem 0.4rem', borderRadius: 7, border: '1.5px solid var(--gray-border)', fontSize: '0.8rem' }} />
                  <button disabled={saving || custom === '' || Number(custom) > 100} onClick={() => decide(Number(custom))} style={btn('var(--carolina-light)', 'var(--carolina-dark)')}>Give %</button>
                </span>
                {detail.decision && <button disabled={saving} onClick={() => decide(null)} style={btn('var(--white)', 'var(--text-muted)')}>Back to % done</button>}
              </div>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional), e.g. modified workout on paper" maxLength={500}
                style={{ marginTop: '0.45rem', width: '100%', padding: '0.4rem 0.55rem', borderRadius: 7, border: '1.5px solid var(--gray-border)', fontSize: '0.8rem' }} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
