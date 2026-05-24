'use client'
import { useState, useEffect } from 'react'

interface Exercise {
  id: string; name: string; category?: string; default_sets: number; default_reps?: string
  logs_weight: boolean; logs_velocity: boolean; coaching_notes?: string; demo_url?: string; demo_image_url?: string
}

const CATEGORIES = ['Warmup','Lower Body','Upper Body','Core','Power','Plyometric','Conditioning','Mobility','Other']

export default function ExerciseLibraryPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Exercise> | null>(null)
  const [filter, setFilter] = useState('')
  const [msg, setMsg] = useState('')
  const blank = (): Partial<Exercise> => ({ name: '', category: '', default_sets: 3, default_reps: '', logs_weight: false, logs_velocity: false, coaching_notes: '', demo_url: '', demo_image_url: '' })

  useEffect(() => { fetch('/api/coach/exercises').then(r => r.json()).then(d => { setExercises(d.exercises ?? []); setLoading(false) }) }, [])

  async function save() {
    if (!editing?.name) return
    const method = editing.id ? 'PUT' : 'POST'
    const res = await fetch('/api/coach/exercises', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) })
    const data = await res.json()
    if (res.ok) {
      setExercises(prev => editing.id ? prev.map(e => e.id === data.exercise.id ? data.exercise : e) : [...prev, data.exercise])
      setEditing(null); setMsg('Saved!')
      setTimeout(() => setMsg(''), 3000)
    } else setMsg(data.error)
  }

  const filtered = exercises.filter(e =>
    e.name.toLowerCase().includes(filter.toLowerCase()) ||
    (e.category ?? '').toLowerCase().includes(filter.toLowerCase())
  )

  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = filtered.filter(e => e.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {} as Record<string, Exercise[]>)
  const uncategorized = filtered.filter(e => !e.category || !CATEGORIES.includes(e.category))

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800 }}>Exercise Library</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{exercises.length} exercises</p>
        </div>
        <button className="btn-volt" onClick={() => setEditing(blank())} style={{ padding: '0.625rem 1.25rem' }}>+ Add Exercise</button>
      </div>

      {msg && <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', color: 'var(--volt)', fontSize: '0.9rem' }}>{msg}</div>}

      <input className="input" placeholder="Search exercises…" value={filter} onChange={e => setFilter(e.target.value)} style={{ marginBottom: '1.5rem' }} />

      {/* Edit form */}
      {editing && (
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '1.25rem', fontSize: '1rem' }}>{editing.id ? 'Edit Exercise' : 'New Exercise'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Exercise Name *</label>
              <input className="input" placeholder="e.g. Romanian Deadlift" value={editing.name ?? ''} onChange={e => setEditing(p => ({ ...p!, name: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Category</label>
              <select className="input" value={editing.category ?? ''} onChange={e => setEditing(p => ({ ...p!, category: e.target.value }))}>
                <option value="">Select…</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Default Sets</label>
              <input className="input" type="number" min={1} value={editing.default_sets ?? 3} onChange={e => setEditing(p => ({ ...p!, default_sets: parseInt(e.target.value) }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Default Reps</label>
              <input className="input" placeholder="e.g. 8, 10 per leg, 30ft" value={editing.default_reps ?? ''} onChange={e => setEditing(p => ({ ...p!, default_reps: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', justifyContent: 'flex-end', paddingBottom: '0.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={editing.logs_weight ?? false} onChange={e => setEditing(p => ({ ...p!, logs_weight: e.target.checked }))} />
                Log weight
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={editing.logs_velocity ?? false} onChange={e => setEditing(p => ({ ...p!, logs_velocity: e.target.checked }))} />
                Log velocity (OVR)
              </label>
            </div>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Coaching Notes (shown to players)</label>
            <textarea className="input" rows={2} placeholder="Cues, form reminders, common mistakes…" value={editing.coaching_notes ?? ''} onChange={e => setEditing(p => ({ ...p!, coaching_notes: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Demo Video URL (YouTube)</label>
              <input className="input" placeholder="https://youtube.com/…" value={editing.demo_url ?? ''} onChange={e => setEditing(p => ({ ...p!, demo_url: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Demo Image URL</label>
              <input className="input" placeholder="https://…" value={editing.demo_image_url ?? ''} onChange={e => setEditing(p => ({ ...p!, demo_image_url: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-ghost" onClick={() => setEditing(null)} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
            <button className="btn-volt" onClick={save} disabled={!editing.name} style={{ flex: 2, padding: '0.75rem' }}>Save Exercise</button>
          </div>
        </div>
      )}

      {/* Exercise list grouped by category */}
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{cat}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {items.map(ex => (
              <div key={ex.id} className="card" style={{ padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {(ex.demo_url || ex.demo_image_url) && (
                  <a href={ex.demo_url || ex.demo_image_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--volt)', flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
                  </a>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{ex.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', marginTop: '0.15rem' }}>
                    {ex.default_sets && <span>{ex.default_sets} sets</span>}
                    {ex.default_reps && <span>{ex.default_reps} reps</span>}
                    {ex.logs_weight && <span style={{ color: 'var(--volt)' }}>⚖ weight</span>}
                    {ex.logs_velocity && <span style={{ color: '#60a5fa' }}>⚡ velocity</span>}
                  </div>
                </div>
                <button onClick={() => setEditing(ex)} className="btn-ghost" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', flexShrink: 0 }}>Edit</button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {uncategorized.length > 0 && (
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Uncategorized</h3>
          {uncategorized.map(ex => (
            <div key={ex.id} className="card" style={{ padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.4rem' }}>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>{ex.name}</div></div>
              <button onClick={() => setEditing(ex)} className="btn-ghost" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>Edit</button>
            </div>
          ))}
        </div>
      )}
      {filtered.length === 0 && <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No exercises found. Add some above.</div>}
    </div>
  )
}
