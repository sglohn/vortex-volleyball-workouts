// FILE: components/FixSetsSheet.tsx
//
// "Fix a set" sheet on the player workout page: every set the player has
// logged in one block, each with an Edit button. Lets a player correct a
// mistake (wrong weight, wrong reps, wrong bar speed) after moving on,
// including in a block they've already finished.
//
// Opened from:
//   - the "Fix a set" link under a block on the block list
//   - tapping one of the "Previous sets today" chips while lifting
//     (opens straight into editing that set)
//
// Band exercises show the band colors to tap and med ball exercises show
// the 10 / 14 lb balls (components/WeightPicker.tsx) instead of a number box.
//
// Saving re-sends the set to /api/sets (same as logging it), which updates
// the existing set instead of adding a new one. Coaches can still fix or
// delete any set from Coach → Workout Logs.
'use client'
import { useState } from 'react'
import { entryText, entryValue, isBandEquipment, asBand, weightInputLabel, type Equipment } from '@/lib/loads'
import WeightPicker from '@/components/WeightPicker'

export interface FixSetLog { set_number: number; weight_lbs?: number; reps_completed?: number; velocity_ms?: number; band?: string | null; completed: boolean }
export interface FixSetExercise {
  id: string
  name: string
  equipment?: Equipment | null
  logs_weight: boolean
  logs_velocity: boolean
  skipped?: boolean
  setLogs: FixSetLog[]
}
/** band: band exercises only (the band key, or null) */
export interface FixSetValues { weight: number | null; reps: number | null; velocity: number | null; band?: string | null }

interface Props {
  title: string
  exercises: FixSetExercise[]
  // Open straight into editing this set (exercise id + set number)
  startEditing?: { exerciseId: string; setNumber: number } | null
  onSave: (exerciseId: string, setNumber: number, values: FixSetValues) => Promise<string | null>  // error text, or null when saved
  onClose: () => void
}

// weight holds the band key on band exercises (same as the logging pages)
type Draft = { weight: string; reps: string; velocity: string }

const str = (n: number | undefined | null) => (n === undefined || n === null ? '' : String(n))
const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : null }

function setText(ex: FixSetExercise, log: FixSetLog): string {
  const parts: string[] = []
  const load = ex.logs_weight ? entryText(log, ex.equipment ?? null) : ''
  if (load) parts.push(load)
  if (log.reps_completed !== undefined && log.reps_completed !== null) parts.push(`${log.reps_completed} reps`)
  if (ex.logs_velocity && log.velocity_ms) parts.push(`${log.velocity_ms} m/s`)
  return parts.join(' · ') || 'Done'
}

/** Bands and med balls are tapped (no number box). */
function tapsToPick(ex: FixSetExercise): boolean {
  return isBandEquipment(ex.equipment) || ex.equipment === 'medball'
}

export default function FixSetsSheet({ title, exercises, startEditing, onSave, onClose }: Props) {
  const startKey = startEditing ? `${startEditing.exerciseId}:${startEditing.setNumber}` : null
  const [editing, setEditing] = useState<string | null>(startKey)
  const [draft, setDraft] = useState<Draft>(() => {
    if (!startEditing) return { weight: '', reps: '', velocity: '' }
    const ex = exercises.find(e => e.id === startEditing.exerciseId)
    const log = ex?.setLogs.find(l => l.set_number === startEditing.setNumber)
    return { weight: entryValue(log, ex?.equipment ?? null), reps: str(log?.reps_completed), velocity: str(log?.velocity_ms) }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedKey, setSavedKey] = useState<string | null>(null)

  const withSets = exercises.filter(e => e.setLogs.some(l => l.completed))

  function startEdit(ex: FixSetExercise, log: FixSetLog) {
    setEditing(`${ex.id}:${log.set_number}`)
    setDraft({ weight: entryValue(log, ex.equipment ?? null), reps: str(log.reps_completed), velocity: str(log.velocity_ms) })
    setError('')
    setSavedKey(null)
  }

  async function save(ex: FixSetExercise, setNumber: number) {
    setSaving(true)
    setError('')
    const isBand = isBandEquipment(ex.equipment)
    const err = await onSave(ex.id, setNumber, isBand
      ? { weight: null, band: asBand(draft.weight), reps: num(draft.reps), velocity: num(draft.velocity) }
      : { weight: num(draft.weight), reps: num(draft.reps), velocity: num(draft.velocity) })
    setSaving(false)
    if (err) { setError(err); return }
    setSavedKey(`${ex.id}:${setNumber}`)
    setEditing(null)
  }

  const label: React.CSSProperties = { display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem', fontWeight: 600 }
  const box: React.CSSProperties = { fontSize: '1.2rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, padding: '0.55rem', width: '100%' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 60 }}
      onClick={() => !saving && onClose()}>
      <div className="card" style={{ width: '100%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto', padding: '1.25rem', borderRadius: '16px 16px 0 0' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem' }}>Fix a set · {title}</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem', lineHeight: 1.4 }}>
              Typed the wrong number? Tap Edit on that set and put in what you really did.
            </p>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        {withSets.length === 0 && (
          <div style={{ padding: '1rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No sets logged in this block yet.</div>
        )}

        {withSets.map(ex => (
          <div key={ex.id} style={{ marginBottom: '0.875rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.375rem' }}>{ex.name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {ex.setLogs.filter(l => l.completed).map(log => {
                const key = `${ex.id}:${log.set_number}`
                const isEditing = editing === key
                return (
                  <div key={key} style={{ background: 'var(--court-raised)', borderRadius: 10, padding: '0.6rem 0.75rem', border: isEditing ? '1.5px solid var(--carolina)' : '1.5px solid transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', width: 44, flexShrink: 0 }}>Set {log.set_number}</span>
                      <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 600 }}>{setText(ex, log)}</span>
                      {savedKey === key && !isEditing && <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 700 }}>Saved ✓</span>}
                      {!isEditing && (
                        <button onClick={() => startEdit(ex, log)} disabled={saving}
                          style={{ padding: '0.3rem 0.75rem', borderRadius: 6, border: '1.5px solid var(--carolina)', background: 'transparent', color: 'var(--carolina-dark)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>Edit</button>
                      )}
                    </div>

                    {isEditing && (
                      <div style={{ marginTop: '0.6rem' }}>
                        {ex.logs_weight && tapsToPick(ex) && (
                          <div style={{ marginBottom: '0.5rem' }}>
                            <WeightPicker equipment={ex.equipment} value={draft.weight} onChange={v => setDraft(d => ({ ...d, weight: v }))} />
                          </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${1 + (ex.logs_weight && !tapsToPick(ex) ? 1 : 0) + (ex.logs_velocity ? 1 : 0)}, minmax(0, 1fr))`, gap: '0.5rem' }}>
                          {ex.logs_weight && !tapsToPick(ex) && (
                            <div>
                              <label style={label}>{weightInputLabel(ex.equipment ?? null)}</label>
                              <input className="input" type="number" inputMode="decimal" value={draft.weight} onChange={e => setDraft(d => ({ ...d, weight: e.target.value }))} style={box} />
                            </div>
                          )}
                          <div>
                            <label style={label}>Reps</label>
                            <input className="input" type="number" inputMode="numeric" value={draft.reps} onChange={e => setDraft(d => ({ ...d, reps: e.target.value }))} style={box} />
                          </div>
                          {ex.logs_velocity && (
                            <div>
                              <label style={{ ...label, color: '#60a5fa' }}>Bar speed</label>
                              <input className="input" type="number" inputMode="decimal" step="0.01" value={draft.velocity} onChange={e => setDraft(d => ({ ...d, velocity: e.target.value }))} style={box} />
                            </div>
                          )}
                        </div>
                        {error && <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 600 }}>{error}</div>}
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                          <button className="btn-ghost" onClick={() => { setEditing(null); setError('') }} disabled={saving} style={{ flex: 1, padding: '0.6rem' }}>Cancel</button>
                          <button className="btn-volt" onClick={() => save(ex, log.set_number)} disabled={saving} style={{ flex: 2, padding: '0.6rem' }}>{saving ? 'Saving…' : 'Save fix'}</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
