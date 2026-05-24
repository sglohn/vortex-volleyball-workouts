'use client'
import { useState, useEffect } from 'react'
import { PHASE_CONFIG, PhaseType } from '@/lib/types'

interface Team { id: string; name: string; age_group?: string; color: string }
interface Phase { id: string; team_id: string; phase_type: string; name: string; description?: string; intensity_target?: string; starts_on: string; ends_on: string; teams?: Team }

const PHASE_TYPES = Object.entries(PHASE_CONFIG).map(([k, v]) => ({ value: k, label: v.label, color: v.color, message: v.playerMessage }))

export default function PhasesPage() {
  const [phases, setPhases] = useState<Phase[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Phase> | null>(null)
  const [msg, setMsg] = useState('')
  const blank = (): Partial<Phase> => ({ team_id: '', phase_type: 'build', name: '', description: '', intensity_target: '', starts_on: '', ends_on: '' })

  useEffect(() => {
    Promise.all([fetch('/api/coach/phases').then(r => r.json()), fetch('/api/coach/teams').then(r => r.json())])
      .then(([p, t]) => { setPhases(p.phases ?? []); setTeams(t.teams ?? []); setLoading(false) })
  }, [])

  async function save() {
    if (!editing?.team_id || !editing.phase_type || !editing.name || !editing.starts_on || !editing.ends_on) { setMsg('Fill in all required fields'); return }
    const method = editing.id ? 'PUT' : 'POST'
    const res = await fetch('/api/coach/phases', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editing.id, teamId: editing.team_id, phaseType: editing.phase_type, name: editing.name, description: editing.description, intensityTarget: editing.intensity_target, startsOn: editing.starts_on, endsOn: editing.ends_on }),
    })
    const data = await res.json()
    if (res.ok) {
      setPhases(prev => editing.id ? prev.map(p => p.id === data.phase.id ? { ...data.phase, teams: teams.find(t => t.id === data.phase.team_id) } : p) : [...prev, { ...data.phase, teams: teams.find(t => t.id === data.phase.team_id) }])
      setEditing(null); setMsg('Saved!')
      setTimeout(() => setMsg(''), 3000)
    } else setMsg(data.error)
  }

  async function deletePhase(id: string) {
    await fetch('/api/coach/phases', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setPhases(prev => prev.filter(p => p.id !== id))
  }

  const today = new Date().toISOString().split('T')[0]
  const active = phases.filter(p => p.starts_on <= today && p.ends_on >= today)
  const upcoming = phases.filter(p => p.starts_on > today)
  const past = phases.filter(p => p.ends_on < today)

  const selectedPhaseConfig = editing?.phase_type ? PHASE_CONFIG[editing.phase_type as PhaseType] : null

  const PhaseCard = ({ p }: { p: Phase }) => {
    const config = PHASE_CONFIG[p.phase_type as PhaseType]
    const isActive = p.starts_on <= today && p.ends_on >= today
    return (
      <div className="card" style={{ padding: '1rem', borderLeft: `4px solid ${config?.color ?? 'var(--volt)'}`, marginBottom: '0.625rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem' }}>
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <span style={{ fontSize: '0.7rem', color: config?.color, background: `${config?.color}20`, padding: '0.15rem 0.5rem', borderRadius: 4, fontWeight: 600 }}>{config?.label}</span>
              {isActive && <span className="tag tag-volt" style={{ fontSize: '0.65rem' }}>Active now</span>}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              {p.teams?.name} {p.teams?.age_group ? `(${p.teams.age_group})` : ''}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {new Date(p.starts_on + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(p.ends_on + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            {p.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>{p.description}</div>}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button onClick={() => setEditing(p)} className="btn-ghost" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>Edit</button>
            <button onClick={() => deletePhase(p.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800 }}>Training Phases</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Set periodization periods for each team</p>
        </div>
        <button className="btn-volt" onClick={() => setEditing(blank())} style={{ padding: '0.625rem 1.25rem' }}>+ New Phase</button>
      </div>

      {msg && <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', color: 'var(--volt)', fontSize: '0.9rem' }}>{msg}</div>}

      {/* Editor */}
      {editing && (
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '1.25rem', fontSize: '1rem' }}>{editing.id ? 'Edit Phase' : 'New Phase'}</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Team *</label>
              <select className="input" value={editing.team_id ?? ''} onChange={e => setEditing(p => ({ ...p!, team_id: e.target.value }))}>
                <option value="">Select team…</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name} {t.age_group ? `(${t.age_group})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Phase Type *</label>
              <select className="input" value={editing.phase_type ?? 'build'} onChange={e => setEditing(p => ({ ...p!, phase_type: e.target.value }))}>
                {PHASE_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
              </select>
            </div>
          </div>

          {selectedPhaseConfig && (
            <div style={{ background: `${selectedPhaseConfig.color}12`, border: `1px solid ${selectedPhaseConfig.color}30`, borderRadius: 8, padding: '0.75rem', marginBottom: '0.75rem', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
              <strong style={{ color: selectedPhaseConfig.color }}>Players will see:</strong> "{selectedPhaseConfig.playerMessage}"
            </div>
          )}

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Phase Name *</label>
            <input className="input" placeholder="e.g. November Build Block" value={editing.name ?? ''} onChange={e => setEditing(p => ({ ...p!, name: e.target.value }))} />
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Description (shown to players)</label>
            <textarea className="input" rows={2} placeholder="Explain the purpose of this phase…" value={editing.description ?? ''} onChange={e => setEditing(p => ({ ...p!, description: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Start Date *</label>
              <input type="date" className="input" value={editing.starts_on ?? ''} onChange={e => setEditing(p => ({ ...p!, starts_on: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>End Date *</label>
              <input type="date" className="input" value={editing.ends_on ?? ''} onChange={e => setEditing(p => ({ ...p!, ends_on: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-ghost" onClick={() => setEditing(null)} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
            <button className="btn-volt" onClick={save} style={{ flex: 2, padding: '0.75rem' }}>Save Phase</button>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--volt)', marginBottom: '0.625rem' }}>Active Now</h2>
          {active.map(p => <PhaseCard key={p.id} p={p} />)}
        </div>
      )}

      {upcoming.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.625rem' }}>Upcoming</h2>
          {upcoming.map(p => <PhaseCard key={p.id} p={p} />)}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.625rem' }}>Past</h2>
          {past.map(p => <PhaseCard key={p.id} p={p} />)}
        </div>
      )}

      {phases.length === 0 && !editing && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No phases yet. Create a training phase for each team to enable periodization-aware weight recommendations.
        </div>
      )}
    </div>
  )
}
