'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Team { id: string; name: string; age_group?: string; color: string }
interface Player { id: string; name: string; jersey_number?: string; position?: string; is_active: boolean; teamName?: string; teamColor?: string; sessionCount?: number; lastSeen?: string; hasHealthFlag?: boolean }

export default function CoachPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', jersey_number: '', position: '', pin: '', team_id: '' })
  const [msg, setMsg] = useState('')
  const [filter, setFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/coach/players').then(r => r.json()),
      fetch('/api/coach/teams').then(r => r.json()),
    ]).then(([p, t]) => { setPlayers(p.players ?? []); setTeams(t.teams ?? []); setLoading(false) })
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
      const team = teams.find(t => t.id === form.team_id)
      setPlayers(prev => [...prev, { ...data.player, teamName: team?.name, teamColor: team?.color }])
      setAdding(false); setForm({ name: '', jersey_number: '', position: '', pin: '', team_id: '' }); setMsg('')
    } else setMsg(data.error || 'Error')
  }

  const filtered = players.filter(p => {
    const matchName = p.name.toLowerCase().includes(filter.toLowerCase())
    const matchTeam = !teamFilter || p.teamName === teamFilter
    return matchName && matchTeam
  })

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800 }}>Players</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{players.filter(p => p.is_active).length} active players across {teams.length} teams</p>
        </div>
        <button className="btn-volt" onClick={() => setAdding(true)} style={{ padding: '0.625rem 1.25rem' }}>+ Add Player</button>
      </div>

      {msg && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', color: '#f87171', fontSize: '0.9rem' }}>{msg}</div>}

      {adding && (
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '1rem', fontSize: '1rem' }}>Add Player</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Name *</label>
              <input className="input" placeholder="Full name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>4-Digit PIN *</label>
              <input className="input" type="number" placeholder="e.g. 1234" value={form.pin} onChange={e => setForm(p => ({ ...p, pin: e.target.value.slice(0, 4) }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Team</label>
              <select className="input" value={form.team_id} onChange={e => setForm(p => ({ ...p, team_id: e.target.value }))}>
                <option value="">No team assigned</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name} {t.age_group ? `(${t.age_group})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Jersey #</label>
              <input className="input" placeholder="e.g. 14" value={form.jersey_number} onChange={e => setForm(p => ({ ...p, jersey_number: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-ghost" onClick={() => { setAdding(false); setMsg('') }} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
            <button className="btn-volt" onClick={addPlayer} style={{ flex: 2, padding: '0.75rem' }}>Add Player</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <input className="input" placeholder="Search players…" value={filter} onChange={e => setFilter(e.target.value)} style={{ flex: 1 }} />
        <select className="input" value={teamFilter} onChange={e => setTeamFilter(e.target.value)} style={{ width: 180 }}>
          <option value="">All teams</option>
          {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
      </div>

      {/* Player table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--court-border)' }}>
              {['Player','Team','Sessions','Last Active','Health',''].map(h => (
                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No players found.</td></tr>
            )}
            {filtered.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--court-border)' }}>
                <td style={{ padding: '0.875rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.teamColor ? `${p.teamColor}25` : 'rgba(74,222,128,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, color: p.teamColor ?? 'var(--volt)', fontSize: '0.85rem', flexShrink: 0 }}>
                      {p.jersey_number || p.name.charAt(0)}
                    </div>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                  </div>
                </td>
                <td style={{ padding: '0.875rem 1rem' }}>
                  {p.teamName
                    ? <span style={{ fontSize: '0.85rem', color: p.teamColor ?? 'var(--volt)', background: p.teamColor ? `${p.teamColor}18` : 'rgba(74,222,128,0.1)', padding: '0.2rem 0.6rem', borderRadius: 4, fontWeight: 500 }}>{p.teamName}</span>
                    : <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                  }
                </td>
                <td style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{p.sessionCount ?? 0}</td>
                <td style={{ padding: '0.875rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{p.lastSeen ? new Date(p.lastSeen).toLocaleDateString() : 'Never'}</td>
                <td style={{ padding: '0.875rem 1rem' }}>
                  {p.hasHealthFlag ? <span className="tag tag-danger">⚠ Flag</span> : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>}
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
