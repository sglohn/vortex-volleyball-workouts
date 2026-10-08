// FILE: app/coach/logs/page.tsx
//
// Workout Logs: pick a day, pick a player, see every set they logged and
// fix anything that's wrong. Sets that look like typos are flagged
// (lib/outliers.ts). Fixes save straight to the player's log, so totals,
// leaderboards and suggestions pick them up on their next refresh.
//
// Address options: /coach/logs?date=YYYY-MM-DD&session=<session id>
'use client'
import { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { clubDateString } from '@/lib/clubTime'
import { EQUIPMENT_OPTIONS, loadLabel, type Equipment } from '@/lib/loads'

interface LogSet {
  id: string
  setNumber: number
  weightLbs: number | null
  repsCompleted: number | null
  velocityMs: number | null
  completed: boolean
  loggedAt: string | null
  flags: string[]
}
interface LogExercise {
  exerciseId: string
  name: string
  equipment: Equipment | null
  logsWeight: boolean
  logsVelocity: boolean
  usualWeight: number | null
  sets: LogSet[]
}
interface LogSession {
  id: string
  playerId: string
  playerName: string
  jerseyNumber: string | null
  teamName: string
  teamColor: string | null
  checkedInAt: string
  completedAt: string | null
  rating: 'easy' | 'medium' | 'hard' | null
  ratingNote: string | null
  setsCompleted: number
  totalLbs: number
  flagCount: number
  exercises: LogExercise[]
}

type Draft = { weight: string; reps: string; velocity: string; completed: boolean }

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

function prettyDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

function clock(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

function equipmentHint(eq: Equipment | null): string {
  if (!eq) return 'Equipment not set'
  return EQUIPMENT_OPTIONS.find(o => o.value === eq)?.hint ?? ''
}

function draftOf(s: LogSet): Draft {
  return {
    weight: s.weightLbs === null ? '' : String(s.weightLbs),
    reps: s.repsCompleted === null ? '' : String(s.repsCompleted),
    velocity: s.velocityMs === null ? '' : String(s.velocityMs),
    completed: s.completed,
  }
}

function sameDraft(a: Draft, b: Draft): boolean {
  return a.weight === b.weight && a.reps === b.reps && a.velocity === b.velocity && a.completed === b.completed
}

function WorkoutLogsInner() {
  const router = useRouter()
  const params = useSearchParams()
  const today = clubDateString()

  const [date, setDate] = useState(params.get('date') ?? today)
  const [selectedId, setSelectedId] = useState<string | null>(params.get('session'))
  const [sessions, setSessions] = useState<LogSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async (keepDrafts = false) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/coach/logs?date=${date}`, { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not load workouts')
      setSessions(d.sessions ?? [])
      if (!keepDrafts) setDrafts({})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load workouts')
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { load() }, [load])

  // Keep the address in sync so a view can be bookmarked or linked
  useEffect(() => {
    const q = new URLSearchParams({ date })
    if (selectedId) q.set('session', selectedId)
    router.replace(`/coach/logs?${q.toString()}`, { scroll: false })
  }, [date, selectedId, router])

  // Pick the first player when the day loads (or the linked session vanished)
  useEffect(() => {
    if (loading) return
    if (!sessions.length) { setSelectedId(null); return }
    if (!selectedId || !sessions.some(s => s.id === selectedId)) setSelectedId(sessions[0].id)
  }, [sessions, loading, selectedId])

  const shown = useMemo(
    () => (onlyFlagged ? sessions.filter(s => s.flagCount > 0) : sessions),
    [sessions, onlyFlagged],
  )
  const byTeam = useMemo(() => {
    const groups: Record<string, LogSession[]> = {}
    for (const s of shown) (groups[s.teamName] ??= []).push(s)
    for (const list of Object.values(groups)) list.sort((a, b) => a.playerName.localeCompare(b.playerName))
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [shown])

  const selected = sessions.find(s => s.id === selectedId) ?? null
  const flaggedPlayers = sessions.filter(s => s.flagCount > 0).length

  function changeDate(next: string) {
    if (next > today) return
    setDate(next)
    setSelectedId(null)
    setNotice('')
  }

  function draftFor(s: LogSet): Draft {
    return drafts[s.id] ?? draftOf(s)
  }

  function edit(s: LogSet, patch: Partial<Draft>) {
    setDrafts(prev => ({ ...prev, [s.id]: { ...(prev[s.id] ?? draftOf(s)), ...patch } }))
  }

  async function save(s: LogSet) {
    const d = draftFor(s)
    setSavingId(s.id)
    setNotice('')
    const res = await fetch('/api/coach/logs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: s.id,
        weight_lbs: d.weight,
        reps_completed: d.reps,
        velocity_ms: d.velocity,
        completed: d.completed,
      }),
    })
    setSavingId(null)
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setNotice(`Set not saved: ${e.error ?? 'try again'}`)
      return
    }
    setDrafts(prev => { const n = { ...prev }; delete n[s.id]; return n })
    setNotice('Set saved')
    load(true)
  }

  async function remove(s: LogSet, exerciseName: string) {
    if (!confirm(`Delete set ${s.setNumber} of ${exerciseName}? This can't be undone.`)) return
    setSavingId(s.id)
    const res = await fetch('/api/coach/logs', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id }),
    })
    setSavingId(null)
    if (!res.ok) { setNotice('Set not deleted. Try again.'); return }
    setNotice('Set deleted')
    load(true)
  }

  const cellInput: React.CSSProperties = {
    width: '100%', padding: '0.4rem 0.5rem', fontSize: '0.95rem', fontWeight: 600,
    textAlign: 'center', borderRadius: 6, border: '1.5px solid var(--gray-border)', background: 'var(--white)',
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1200 }}>
      {/* Header + day picker */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>Workout Logs</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.35rem' }}>{prettyDate(date)}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => changeDate(shiftDate(date, -1))} aria-label="Previous day"
            style={{ padding: '0.45rem 0.8rem', borderRadius: 8, border: '1.5px solid var(--gray-border)', background: 'var(--white)', cursor: 'pointer', fontWeight: 700 }}>‹</button>
          <input type="date" value={date} max={today} onChange={e => e.target.value && changeDate(e.target.value)}
            className="input" style={{ width: 170 }} />
          <button onClick={() => changeDate(shiftDate(date, 1))} disabled={date >= today} aria-label="Next day"
            style={{ padding: '0.45rem 0.8rem', borderRadius: 8, border: '1.5px solid var(--gray-border)', background: 'var(--white)', cursor: date >= today ? 'default' : 'pointer', opacity: date >= today ? 0.4 : 1, fontWeight: 700 }}>›</button>
          {date !== today && (
            <button onClick={() => changeDate(today)}
              style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: '1.5px solid var(--carolina)', background: 'var(--carolina-light)', color: 'var(--carolina-dark)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Today</button>
          )}
        </div>
      </div>

      {error && <div style={{ padding: '0.75rem 1rem', borderRadius: 8, background: 'var(--danger-light)', color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}

      {loading && !sessions.length ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading workouts…</p>
      ) : !sessions.length ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.35rem' }}>No one checked in on this day.</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Use the arrows or the date box to look at another day.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: '1.25rem', alignItems: 'start' }} className="logs-grid">
          {/* Player list */}
          <div className="card" style={{ padding: '0.75rem', position: 'sticky', top: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0.375rem 0.625rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{sessions.length} player{sessions.length === 1 ? '' : 's'}</span>
              {flaggedPlayers > 0 && (
                <button onClick={() => setOnlyFlagged(v => !v)}
                  style={{ padding: '0.2rem 0.6rem', borderRadius: 20, border: '1.5px solid var(--warning)', background: onlyFlagged ? 'var(--warning)' : 'var(--warning-light)', color: onlyFlagged ? '#fff' : 'var(--warning)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                  {onlyFlagged ? 'Show everyone' : `${flaggedPlayers} to check`}
                </button>
              )}
            </div>
            {byTeam.map(([team, list]) => (
              <div key={team} style={{ marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', padding: '0.375rem 0.375rem 0.25rem' }}>{team}</div>
                {list.map(s => {
                  const active = s.id === selectedId
                  return (
                    <button key={s.id} onClick={() => { setSelectedId(s.id); setNotice('') }}
                      style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.5rem', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                        background: active ? 'var(--carolina-light)' : 'transparent', boxShadow: active ? 'inset 3px 0 0 var(--carolina)' : 'none' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.teamColor ?? 'var(--carolina)', flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.playerName}</span>
                        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {s.setsCompleted} sets{s.totalLbs > 0 ? `, ${s.totalLbs.toLocaleString()} lbs` : ''}
                        </span>
                      </span>
                      {s.flagCount > 0 && (
                        <span title={`${s.flagCount} set${s.flagCount === 1 ? '' : 's'} to check`}
                          style={{ minWidth: 22, height: 22, borderRadius: 11, background: 'var(--warning)', color: '#fff', fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{s.flagCount}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Selected player's workout */}
          <div>
            {selected && (
              <>
                <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem 1.5rem' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.1 }}>
                      {selected.playerName}{selected.jerseyNumber ? <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}> #{selected.jerseyNumber}</span> : null}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {selected.teamName}. Checked in {clock(selected.checkedInAt)}{selected.completedAt ? `, finished ${clock(selected.completedAt)}` : ', didn’t tap finish'}
                    </div>
                    {selected.rating && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Rated the workout <strong style={{ color: selected.rating === 'hard' ? 'var(--danger)' : selected.rating === 'medium' ? 'var(--warning)' : 'var(--success)' }}>{selected.rating}</strong>
                        {selected.ratingNote ? <span>: “{selected.ratingNote}”</span> : null}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800 }}>{selected.totalLbs.toLocaleString()} lbs</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{selected.setsCompleted} sets done</div>
                  </div>
                </div>

                {notice && (
                  <div role="status" style={{ padding: '0.5rem 0.875rem', borderRadius: 8, marginBottom: '0.75rem', fontSize: '0.85rem', fontWeight: 600,
                    background: notice.startsWith('Set not') ? 'var(--danger-light)' : 'var(--success-light)', color: notice.startsWith('Set not') ? 'var(--danger)' : 'var(--success)' }}>{notice}</div>
                )}

                {!selected.exercises.length && (
                  <div className="card" style={{ padding: '1.5rem', color: 'var(--text-secondary)' }}>
                    {selected.playerName} checked in but didn’t log any sets.
                  </div>
                )}

                {selected.exercises.map(ex => (
                  <div key={ex.exerciseId} className="card" style={{ padding: '1rem 1.25rem', marginBottom: '0.875rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.25rem 1rem', marginBottom: '0.75rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{ex.name}</div>
                      <div style={{ fontSize: '0.78rem', color: ex.equipment ? 'var(--text-secondary)' : 'var(--warning)' }}>
                        {equipmentHint(ex.equipment)}
                        {ex.usualWeight !== null && ex.logsWeight ? `. Usually ${loadLabel(ex.usualWeight, ex.equipment)}` : ''}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: `52px ${ex.logsWeight ? 'minmax(70px, 110px) ' : ''}minmax(60px, 90px) ${ex.logsVelocity ? 'minmax(70px, 100px) ' : ''}64px 1fr`, gap: '0.5rem', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: '0.375rem', borderBottom: '1px solid var(--gray-border)' }}>
                      <span>Set</span>
                      {ex.logsWeight && <span>Weight</span>}
                      <span>Reps</span>
                      {ex.logsVelocity && <span>Bar speed</span>}
                      <span>Done</span>
                      <span />
                    </div>

                    {ex.sets.map(s => {
                      const d = draftFor(s)
                      const changed = !sameDraft(d, draftOf(s))
                      const busy = savingId === s.id
                      return (
                        <div key={s.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--gray-light)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: `52px ${ex.logsWeight ? 'minmax(70px, 110px) ' : ''}minmax(60px, 90px) ${ex.logsVelocity ? 'minmax(70px, 100px) ' : ''}64px 1fr`, gap: '0.5rem', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700 }}>{s.setNumber}</span>
                            {ex.logsWeight && (
                              <input aria-label={`Set ${s.setNumber} weight`} type="number" inputMode="decimal" value={d.weight}
                                onChange={e => edit(s, { weight: e.target.value })}
                                style={{ ...cellInput, borderColor: s.flags.length ? 'var(--warning)' : cellInput.borderColor as string }} />
                            )}
                            <input aria-label={`Set ${s.setNumber} reps`} type="number" inputMode="numeric" value={d.reps}
                              onChange={e => edit(s, { reps: e.target.value })} style={cellInput} />
                            {ex.logsVelocity && (
                              <input aria-label={`Set ${s.setNumber} bar speed`} type="number" inputMode="decimal" step="0.01" value={d.velocity}
                                onChange={e => edit(s, { velocity: e.target.value })} style={cellInput} />
                            )}
                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <input type="checkbox" checked={d.completed} onChange={e => edit(s, { completed: e.target.checked })}
                                aria-label={`Set ${s.setNumber} done`} style={{ width: 18, height: 18 }} />
                            </label>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.375rem' }}>
                              {changed && (
                                <>
                                  <button onClick={() => setDrafts(prev => { const n = { ...prev }; delete n[s.id]; return n })} disabled={busy}
                                    style={{ padding: '0.35rem 0.7rem', borderRadius: 6, border: '1.5px solid var(--gray-border)', background: 'var(--white)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Undo</button>
                                  <button onClick={() => save(s)} disabled={busy} className="btn-volt"
                                    style={{ padding: '0.35rem 0.9rem', fontSize: '0.8rem' }}>{busy ? 'Saving…' : 'Save'}</button>
                                </>
                              )}
                              {!changed && (
                                <button onClick={() => remove(s, ex.name)} disabled={busy} aria-label={`Delete set ${s.setNumber}`}
                                  style={{ padding: '0.35rem 0.6rem', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>Delete</button>
                              )}
                            </div>
                          </div>
                          {s.flags.length > 0 && !changed && (
                            <div style={{ marginTop: '0.35rem', marginLeft: 52, fontSize: '0.8rem', color: 'var(--warning)', fontWeight: 600 }}>
                              {s.flags.map((f, i) => <div key={i}>{f}</div>)}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 760px) {
          .logs-grid { grid-template-columns: 1fr !important; }
          .logs-grid > .card { position: static !important; }
        }
      `}</style>
    </div>
  )
}

export default function WorkoutLogsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>}>
      <WorkoutLogsInner />
    </Suspense>
  )
}
