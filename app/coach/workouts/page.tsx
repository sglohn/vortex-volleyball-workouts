'use client'
import { useState, useEffect } from 'react'

interface Exercise {
  id?: string
  name: string
  sets: number
  reps: number
  rest_seconds: number
  notes: string
  sort_order: number
}

interface Workout {
  id?: string
  title: string
  description: string
  is_active: boolean
  exercises: Exercise[]
}

const blankExercise = (): Exercise => ({ name: '', sets: 3, reps: 10, rest_seconds: 90, notes: '', sort_order: 0 })

export default function CoachWorkoutsPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [editing, setEditing] = useState<Workout | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/coach/workouts')
      .then(r => r.json())
      .then(d => { setWorkouts(d.workouts || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function startNew() {
    setEditing({ title: '', description: '', is_active: false, exercises: [blankExercise()] })
  }

  function addExercise() {
    setEditing(prev => prev ? { ...prev, exercises: [...prev.exercises, blankExercise()] } : prev)
  }

  function removeExercise(i: number) {
    setEditing(prev => prev ? { ...prev, exercises: prev.exercises.filter((_, idx) => idx !== i) } : prev)
  }

  function updateExercise(i: number, field: keyof Exercise, value: string | number) {
    setEditing(prev => {
      if (!prev) return prev
      const exs = [...prev.exercises]
      exs[i] = { ...exs[i], [field]: value }
      return { ...prev, exercises: exs }
    })
  }

  async function save() {
    if (!editing) return
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/coach/workouts', {
      method: editing.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    })
    const data = await res.json()
    if (res.ok) {
      setMsg('Saved!')
      setWorkouts(prev => {
        const updated = prev.filter(w => w.id !== data.workout.id)
        return [data.workout, ...updated]
      })
      setEditing(null)
    } else {
      setMsg('Error saving: ' + data.error)
    }
    setSaving(false)
  }

  async function setActive(id: string) {
    await fetch('/api/coach/workouts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: true }),
    })
    setWorkouts(prev => prev.map(w => ({ ...w, is_active: w.id === id })))
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800 }}>Workouts</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Create and manage workout programs</p>
        </div>
        <button className="btn-volt" onClick={startNew} style={{ padding: '0.625rem 1.25rem' }}>+ New Workout</button>
      </div>

      {msg && (
        <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', color: 'var(--volt)', fontSize: '0.9rem' }}>{msg}</div>
      )}

      {/* Workout editor */}
      {editing && (
        <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', marginBottom: '1.25rem' }}>
            {editing.id ? 'Edit Workout' : 'New Workout'}
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Title</label>
              <input className="input" value={editing.title} onChange={e => setEditing(p => p ? { ...p, title: e.target.value } : p)} placeholder="e.g. Week 1 — Strength" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Description</label>
              <input className="input" value={editing.description} onChange={e => setEditing(p => p ? { ...p, description: e.target.value } : p)} placeholder="Optional notes" />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={editing.is_active} onChange={e => setEditing(p => p ? { ...p, is_active: e.target.checked } : p)} />
            Set as active workout (shown to all players)
          </label>

          {/* Exercises */}
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Exercises</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
            {editing.exercises.map((ex, i) => (
              <div key={i} className="card-raised" style={{ padding: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '0.625rem', alignItems: 'start', marginBottom: '0.625rem' }}>
                  <input className="input" placeholder="Exercise name (e.g. Back Squat)" value={ex.name} onChange={e => updateExercise(i, 'name', e.target.value)} />
                  <div>
                    <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Sets</label>
                    <input className="input" type="number" min={1} max={10} value={ex.sets} onChange={e => updateExercise(i, 'sets', parseInt(e.target.value))} style={{ width: 70, textAlign: 'center' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Reps</label>
                    <input className="input" type="number" min={1} max={50} value={ex.reps} onChange={e => updateExercise(i, 'reps', parseInt(e.target.value))} style={{ width: 70, textAlign: 'center' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Rest (s)</label>
                    <input className="input" type="number" min={0} value={ex.rest_seconds} onChange={e => updateExercise(i, 'rest_seconds', parseInt(e.target.value))} style={{ width: 80, textAlign: 'center' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
                  <input className="input" placeholder="Coaching notes (optional)" value={ex.notes} onChange={e => updateExercise(i, 'notes', e.target.value)} style={{ flex: 1 }} />
                  <button onClick={() => removeExercise(i)} className="btn-ghost" style={{ padding: '0.5rem', color: '#f87171', borderColor: 'rgba(248,113,113,0.3)', flexShrink: 0 }}>✕</button>
                </div>
              </div>
            ))}
          </div>

          <button className="btn-ghost" onClick={addExercise} style={{ marginBottom: '1.25rem', padding: '0.625rem 1rem', width: '100%', fontSize: '0.9rem' }}>
            + Add Exercise
          </button>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-ghost" onClick={() => setEditing(null)} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
            <button className="btn-volt" onClick={save} disabled={saving || !editing.title} style={{ flex: 2, padding: '0.75rem' }}>
              {saving ? 'Saving…' : 'Save Workout'}
            </button>
          </div>
        </div>
      )}

      {/* Workout list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {workouts.length === 0 && !editing && (
          <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No workouts yet. Create one above.
          </div>
        )}
        {workouts.map(w => (
          <div key={w.id} className="card" style={{ padding: '1.25rem', borderColor: w.is_active ? 'var(--volt)' : 'var(--court-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>{w.title}</h3>
                  {w.is_active && <span className="tag tag-volt">Active</span>}
                </div>
                {w.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{w.description}</p>}
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{w.exercises?.length ?? 0} exercises</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {!w.is_active && (
                  <button className="btn-ghost" onClick={() => setActive(w.id!)} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>Set active</button>
                )}
                <button className="btn-ghost" onClick={() => setEditing(w)} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>Edit</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
