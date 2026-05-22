'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { recommendWeight, inchesToFeetInches } from '@/lib/fitness'

interface SetLog {
  id?: string
  set_number: number
  reps_completed?: number
  weight_lbs?: number
  completed: boolean
}

interface ExerciseData {
  id: string
  name: string
  sets: number
  reps: number
  rest_seconds?: number
  notes?: string
  setLogs: SetLog[]
  estimatedOneRepMax: number
  recommendation?: { weight: number; percent: number; label: string }
}

interface WorkoutData {
  title: string
  description?: string
  exercises: ExerciseData[]
}

export default function WorkoutPage() {
  const router = useRouter()
  const [session, setSession] = useState<{ sessionId: string; playerName: string } | null>(null)
  const [workout, setWorkout] = useState<WorkoutData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingSet, setEditingSet] = useState<{ exIdx: number; setIdx: number } | null>(null)
  const [weightInput, setWeightInput] = useState('')
  const [repsInput, setRepsInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('vx_session')
    if (!stored) { router.push('/'); return }
    const s = JSON.parse(stored)
    setSession(s)
    // Load workout
    fetch(`/api/workout?sessionId=${s.sessionId}`)
      .then(r => r.json())
      .then(data => { setWorkout(data.workout); setLoading(false) })
      .catch(() => setLoading(false))
  }, [router])

  const totalSets = workout?.exercises.reduce((sum, ex) => sum + ex.sets, 0) ?? 0
  const completedSets = workout?.exercises.reduce((sum, ex) =>
    sum + ex.setLogs.filter(s => s.completed).length, 0) ?? 0
  const progress = totalSets > 0 ? completedSets / totalSets : 0

  const openEdit = (exIdx: number, setIdx: number) => {
    const log = workout!.exercises[exIdx].setLogs[setIdx]
    setWeightInput(log.weight_lbs?.toString() ?? '')
    setRepsInput(log.reps_completed?.toString() ?? workout!.exercises[exIdx].reps.toString())
    setEditingSet({ exIdx, setIdx })
  }

  const saveSet = useCallback(async (completed: boolean) => {
    if (!editingSet || !workout || !session) return
    setSaving(true)
    const ex = workout.exercises[editingSet.exIdx]
    const setNum = editingSet.setIdx + 1

    const res = await fetch('/api/sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.sessionId,
        exerciseId: ex.id,
        setNumber: setNum,
        weightLbs: weightInput ? parseFloat(weightInput) : null,
        repsCompleted: repsInput ? parseInt(repsInput) : null,
        completed,
      }),
    })
    const data = await res.json()

    // Update local state
    setWorkout(prev => {
      if (!prev) return prev
      const updated = { ...prev }
      updated.exercises = [...prev.exercises]
      const exCopy = { ...updated.exercises[editingSet.exIdx] }
      exCopy.setLogs = [...exCopy.setLogs]
      exCopy.setLogs[editingSet.setIdx] = {
        ...exCopy.setLogs[editingSet.setIdx],
        weight_lbs: weightInput ? parseFloat(weightInput) : undefined,
        reps_completed: repsInput ? parseInt(repsInput) : undefined,
        completed,
        id: data.id,
      }
      exCopy.estimatedOneRepMax = data.newOneRepMax ?? exCopy.estimatedOneRepMax
      exCopy.recommendation = data.recommendation
      updated.exercises[editingSet.exIdx] = exCopy
      return updated
    })
    setEditingSet(null)
    setSaving(false)
  }, [editingSet, workout, session, weightInput, repsInput])

  async function handleFinish() {
    if (!session) return
    await fetch('/api/checkin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.sessionId }),
    })
    setFinished(true)
    localStorage.removeItem('vx_session')
  }

  if (loading) return (
    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
      Loading workout…
    </div>
  )

  if (!workout) return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>No active workout found.</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Ask your coach to create one.</p>
    </div>
  )

  if (finished) return (
    <div style={{ padding: '3rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }} className="fade-up">
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', border: '2px solid var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="pulse">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--volt)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: 'var(--volt)', marginBottom: '0.5rem' }}>WORKOUT DONE</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Great work, {session?.playerName}!</p>
      </div>
      <button className="btn-volt" onClick={() => router.push('/')} style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}>
        Sign Out
      </button>
    </div>
  )

  return (
    <div style={{ padding: '1rem', maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }} className="fade-up">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800 }}>{workout.title}</h1>
            {workout.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>{workout.description}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--volt)' }}>{completedSets}/{totalSets}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sets done</div>
          </div>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {/* Exercises */}
      {workout.exercises.map((ex, exIdx) => {
        const exComplete = ex.setLogs.every(s => s.completed) && ex.setLogs.length === ex.sets
        return (
          <div key={ex.id} className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
            {/* Exercise header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>{ex.name}</h3>
                  {exComplete && <span className="tag tag-volt">Done</span>}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {ex.sets} sets × {ex.reps} reps{ex.rest_seconds ? ` · ${ex.rest_seconds}s rest` : ''}
                </div>
              </div>
              {ex.estimatedOneRepMax > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--volt)' }}>{ex.estimatedOneRepMax} lbs</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Est. 1RM</div>
                </div>
              )}
            </div>

            {/* Recommendation */}
            {ex.recommendation && ex.estimatedOneRepMax > 0 && (
              <div style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recommended today</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--volt)' }}>{ex.recommendation.weight} lbs <span style={{ fontWeight: 400, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>({ex.recommendation.percent}%)</span></div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right', maxWidth: 120 }}>{ex.recommendation.label}</div>
              </div>
            )}

            {ex.notes && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontStyle: 'italic' }}>
                💬 {ex.notes}
              </div>
            )}

            {/* Sets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {Array.from({ length: ex.sets }, (_, i) => {
                const log = ex.setLogs[i] || { set_number: i + 1, completed: false }
                return (
                  <div
                    key={i}
                    className={`set-row ${log.completed ? 'completed' : ''}`}
                    onClick={() => openEdit(exIdx, i)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Check circle */}
                    <div className={`check-circle ${log.completed ? 'done' : ''}`}>
                      {log.completed && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0f0d" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>SET {i + 1}</div>
                    <div style={{ fontSize: '0.9rem', color: log.weight_lbs ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {log.weight_lbs ? `${log.weight_lbs} lbs` : '— lbs'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                      {log.reps_completed ?? ex.reps} reps
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Finish button */}
      {progress >= 0.5 && (
        <button className="btn-volt" onClick={handleFinish} style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', marginBottom: '1rem' }}>
          Finish Workout
        </button>
      )}

      {/* Set edit modal */}
      {editingSet && workout && (() => {
        const ex = workout.exercises[editingSet.exIdx]
        const setNum = editingSet.setIdx + 1
        return (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
            onClick={e => { if (e.target === e.currentTarget) setEditingSet(null) }}
          >
            <div className="card" style={{ width: '100%', maxWidth: 480, padding: '1.5rem', borderRadius: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>{ex.name} — Set {setNum}</h3>
                <button onClick={() => setEditingSet(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
              </div>

              {ex.recommendation && ex.estimatedOneRepMax > 0 && (
                <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Suggested: <strong style={{ color: 'var(--volt)' }}>{ex.recommendation.weight} lbs</strong>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Weight (lbs)</label>
                  <input className="input" type="number" placeholder="0" value={weightInput} onChange={e => setWeightInput(e.target.value)} style={{ fontSize: '1.25rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Reps</label>
                  <input className="input" type="number" placeholder={ex.reps.toString()} value={repsInput} onChange={e => setRepsInput(e.target.value)} style={{ fontSize: '1.25rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700 }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn-ghost" onClick={() => saveSet(false)} disabled={saving} style={{ flex: 1, padding: '0.75rem', fontSize: '0.9rem' }}>
                  Save only
                </button>
                <button className="btn-volt" onClick={() => saveSet(true)} disabled={saving} style={{ flex: 1, padding: '0.75rem', fontSize: '0.9rem' }}>
                  {saving ? 'Saving…' : '✓ Mark done'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
