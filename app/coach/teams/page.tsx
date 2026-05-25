'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Team { id: string; name: string; age_group?: string; color: string; is_active: boolean; playerCount?: number }

const COLORS = ['#4ade80','#60a5fa','#f472b6','#fb923c','#a78bfa','#34d399','#facc15','#f87171']
const AGE_GROUPS = ['12s','13s','14s','15-16s','17-18s','Boys 14s','Boys 16s','Boys 18s','Open']

export default function CoachTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Team | null>(null)
  const [form, setForm] = useState({ name: '', age_group: '', color: '#4ade80' })
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/coach/teams').then(r => r.json()).then(d => { setTeams(d.teams ?? []); setLoading(false) })
  }, [])

  async function save() {
    const method = editing ? 'PUT' : 'POST'
    const body = editing ? { id: editing.id, ...form } : form
    const res = await fetch('/api/coach/teams', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (res.ok) {
      setTeams(prev => {
        const filtered = prev.filter(t => t.id !== data.team.id)
        return editing ? filtered.map(t => t.id === data.team.id ? data.team : t) : [...filtered, data.team]
      })
      setAdding(false); setEditing(null); setForm({ name: '', age_group: '', color: '#4ade80' })
    } else setMsg(data.error)
  }

  function startEdit(t: Team) { setEditing(t); setForm({ name: t.name, age_group: t.age_group ?? '', color: t.color }); setAdding(true) }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800 }}>Teams</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{teams.length} active teams</p>
        </div>
        <button className="btn-volt" onClick={() => { setAdding(true); setEditing(null); setForm({ name: '', age_group: '', color: '#4ade80' }) }} style={{ padding: '0.625rem 1.25rem' }}>+ New Team</button>
      </div>

      {msg && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', color: '#f87171', fontSize: '0.9rem' }}>{msg}</div>}

      {adding && (
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '1rem', fontSize: '1rem' }}>{editing ? 'Edit Team' : 'New Team'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Team Name *</label>
              <input className="input" placeholder="e.g. 14 Black" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Age Group</label>
              <select className="input" value={form.age_group} onChange={e => setForm(p => ({ ...p, age_group: e.target.value }))}>
                <option value="">Select…</option>
                {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Team Color</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {COLORS.map(c => (
                <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))} style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: form.color === c ? '3px solid white' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.15s' }} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-ghost" onClick={() => { setAdding(false); setEditing(null) }} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
            <button className="btn-volt" onClick={save} disabled={!form.name} style={{ flex: 2, padding: '0.75rem' }}>Save Team</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {teams.length === 0 && !adding && (
          <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No teams yet. Add your first team above.</div>
        )}
        {teams.map(t => (
          <div key={t.id} className="card" style={{ padding: '1rem', borderLeft: `4px solid ${t.color}`, display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>{t.name}</div>
              {t.age_group && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.age_group}</div>}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t.playerCount ?? 0} players</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Link href={`/coach/schedule?team=${t.id}`} style={{ color: 'var(--carolina-dark)', fontSize: '0.8rem', textDecoration: 'none', fontWeight: 500 }}>Schedule</Link>
              <a href={`/team/${t.id}`} target="_blank" rel="noopener noreferrer" style={{ background: 'var(--carolina)', color: 'var(--white)', fontSize: '0.78rem', textDecoration: 'none', fontWeight: 700, padding: '0.3rem 0.75rem', borderRadius: 6 }}>▶ Team Mode</a>
              <button onClick={() => startEdit(t)} className="btn-ghost" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>Edit</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
