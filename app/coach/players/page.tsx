'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Player {
  id: string
  name: string
  jersey_number?: string
  position?: string
  is_active: boolean
  sessionCount?: number
  lastSeen?: string
  trend?: 'up' | 'down' | 'flat'
}

export default function CoachPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', jersey_number: '', position: '', pin: '' })
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/coach/players')
      .then(r => r.json())
      .then(d => { setPlayers(d.players || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function addPlayer() {
    if (!form.name || form.pin.length !== 4) { setMsg('Name and 4-digit PIN required'); return }
    const res = await fetch('/api/coach/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (res.ok) {
      setPlayers(prev => [...prev, data.player])
      setAdding(false)
      setForm({ name: '', jersey_number: '', position: '', pin: '' })
      setMsg('')
    } else {
      setMsg(data.error || 'Error adding player')
    }
  }

  const TREND_COLOR = { up: 'var(--success)', down: 'var(--danger)', flat: 'var(--text-muted)' }
  const TREND_ICON = { up: '↑', down: '↓', flat: '—' }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800 }}>Players</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{players.filter(p => p.is_active).length} active athletes</p>
        </div>
        <button className="btn-volt" onClick={() => setAdding(true)} style={{ padding: '0.625rem 1.25rem' }}>+ Add Player</button>
      </div>

      {msg && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', color: '#f87171', fontSize: '0.9rem' }}>{msg}</div>}

      {/* Add player form */}
      {adding && (
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '1rem', fontSize: '1rem' }}>New Player</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Name *</label>
              <input className="input" placeholder="Full name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>4-Digit PIN *</label>
              <input className="input" type="number" placeholder="e.g. 1234" maxLength={4} value={form.pin} onChange={e => setForm(p => ({ ...p, pin: e.target.value.slice(0, 4) }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Jersey #</label>
              <input className="input" placeholder="e.g. 14" value={form.jersey_number} onChange={e => setForm(p => ({ ...p, jersey_number: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Position</label>
              <input className="input" placeholder="e.g. Setter, OH, MB" value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-ghost" onClick={() => { setAdding(false); setMsg('') }} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
            <button className="btn-volt" onClick={addPlayer} style={{ flex: 2, padding: '0.75rem' }}>Add Player</button>
          </div>
        </div>
      )}

      {/* Player table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--court-border)' }}>
              {['Player', 'Position', 'Sessions', 'Last active', 'Strength trend', ''].map(h => (
                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No players yet. Add one above.</td></tr>
            )}
            {players.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--court-border)' }}>
                <td style={{ padding: '0.875rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--volt)', fontSize: '0.85rem', flexShrink: 0 }}>
                      {p.jersey_number || p.name.charAt(0)}
                    </div>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                  </div>
                </td>
                <td style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{p.position || '—'}</td>
                <td style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{p.sessionCount ?? 0}</td>
                <td style={{ padding: '0.875rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {p.lastSeen ? new Date(p.lastSeen).toLocaleDateString() : 'Never'}
                </td>
                <td style={{ padding: '0.875rem 1rem' }}>
                  {p.trend ? (
                    <span style={{ color: TREND_COLOR[p.trend], fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                      {TREND_ICON[p.trend]}
                    </span>
                  ) : '—'}
                </td>
                <td style={{ padding: '0.875rem 1rem' }}>
                  <Link href={`/coach/players/${p.id}`} style={{ color: 'var(--volt)', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 500 }}>View →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
