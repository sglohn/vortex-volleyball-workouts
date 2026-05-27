'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import FeetInchesInput from '@/components/FeetInchesInput'

interface Team { id: string; name: string; age_group?: string; color: string }
interface Player {
  id: string; name: string; jersey_number?: string; position?: string
  is_active: boolean; teamName?: string; teamColor?: string; teamId?: string
  sessionCount?: number; lastSeen?: string; hasHealthFlag?: boolean
}

const POSITIONS = ['Setter','Outside Hitter','Middle Blocker','Opposite','Libero','Defensive Specialist','Other']

function FF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.4rem', fontWeight:600 }}>{label}</label>
      {children}
    </div>
  )
}

export default function CoachPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add'|'edit'|null>(null)
  const [editTarget, setEditTarget] = useState<Player|null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Player|null>(null)
  const [form, setForm] = useState({ name:'', jersey_number:'', position:'', pin:'', team_id:'' })
  const [msg, setMsg] = useState('')
  const [msgErr, setMsgErr] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [measurements, setMeasurements] = useState({ height_in:'', wingspan_in:'', standing_reach_in:'', standing_vertical_in:'', approach_vertical_in:'' })

  useEffect(() => {
    Promise.all([
      fetch('/api/coach/players').then(r => r.json()),
      fetch('/api/coach/teams').then(r => r.json()),
    ]).then(([p,t]) => { setPlayers(p.players ?? []); setTeams(t.teams ?? []); setLoading(false) })
  }, [])

  function openAdd() { setForm({ name:'', jersey_number:'', position:'', pin:'', team_id:'' }); setEditTarget(null); setModal('add'); setMsg('') }
  function openEdit(p: Player) {
    setForm({ name: p.name, jersey_number: p.jersey_number ?? '', position: p.position ?? '', pin: '', team_id: p.teamId ?? '' })
    setMeasurements({ height_in:'', wingspan_in:'', standing_reach_in:'', standing_vertical_in:'', approach_vertical_in:'' })
    setEditTarget(p)
    setModal('edit')
    setMsg('')
    // Load latest measurements for this player
    fetch(`/api/player/measurements?playerId=${p.id}`)
      .then(r => r.json())
      .then(d => {
        const latest = d.measurements?.[0]
        if (latest) setMeasurements({
          height_in: latest.height_in?.toString() ?? '',
          wingspan_in: latest.wingspan_in?.toString() ?? '',
          standing_reach_in: latest.standing_reach_in?.toString() ?? '',
          standing_vertical_in: latest.standing_vertical_in?.toString() ?? '',
          approach_vertical_in: latest.approach_vertical_in?.toString() ?? '',
        })
      })
  }
  function closeModal() { setModal(null); setEditTarget(null); setMsg('') }

  async function save() {
    setSaving(true); setMsg('')
    if (!form.name) { setMsg('Name is required'); setMsgErr(true); setSaving(false); return }
    if (modal === 'add') {
      if (!/^\d{4}$/.test(form.pin)) { setMsg('PIN must be exactly 4 digits'); setMsgErr(true); setSaving(false); return }
      const res = await fetch('/api/coach/players', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) })
      const data = await res.json()
      if (res.ok) {
        const team = teams.find(t => t.id === form.team_id)
        setPlayers(prev => [...prev, { ...data.player, teamName: team?.name, teamColor: team?.color, teamId: team?.id }])
        closeModal()
      } else { setMsg(data.error || 'Error saving'); setMsgErr(true) }
    } else if (modal === 'edit' && editTarget) {
      if (form.pin && !/^\d{4}$/.test(form.pin)) { setMsg('New PIN must be 4 digits, or leave blank'); setMsgErr(true); setSaving(false); return }
      const body: Record<string,string> = { id: editTarget.id, name: form.name, jersey_number: form.jersey_number, position: form.position, team_id: form.team_id }
      if (form.pin) body.pin = form.pin
      const res = await fetch('/api/coach/players/delete', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      const data = await res.json()
      if (res.ok) {
        const team = teams.find(t => t.id === form.team_id)
        setPlayers(prev => prev.map(p => p.id === editTarget.id ? { ...p, ...data.player, teamName: team?.name, teamColor: team?.color, teamId: team?.id } : p))
        // Save measurements if any were filled in
        const hasMeasurements = Object.values(measurements).some(v => v !== '')
        if (hasMeasurements) {
          await fetch('/api/player/measurements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: editTarget.id, ...measurements }),
          })
        }
        closeModal(); setMsg('Player updated'); setMsgErr(false); setTimeout(() => setMsg(''), 3000)
      } else { setMsg(data.error || 'Error saving'); setMsgErr(true) }
    }
    setSaving(false)
  }

  async function deletePlayer() {
    if (!deleteConfirm) return
    await fetch('/api/coach/players/delete', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: deleteConfirm.id }) })
    setPlayers(prev => prev.filter(p => p.id !== deleteConfirm.id))
    setDeleteConfirm(null); setMsg('Player removed'); setMsgErr(false); setTimeout(() => setMsg(''), 3000)
  }

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(filter.toLowerCase()) &&
    (!teamFilter || p.teamName === teamFilter)
  )



  if (loading) return <div style={{ padding:'2rem', color:'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding:'2rem', maxWidth:1000 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'2rem' }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:800 }}>Players</h1>
          <p style={{ color:'var(--text-muted)', fontSize:'0.85rem' }}>{players.length} active players · {teams.length} teams</p>
        </div>
        <button className="btn-volt" onClick={openAdd} style={{ padding:'0.625rem 1.25rem' }}>+ Add Player</button>
      </div>

      {msg && <div style={{ background: msgErr ? 'var(--danger-light)' : 'var(--carolina-light)', border:`1.5px solid ${msgErr ? '#fecaca' : 'var(--carolina-border)'}`, borderRadius:8, padding:'0.75rem', marginBottom:'1rem', color: msgErr ? 'var(--danger)' : 'var(--carolina-deep)', fontSize:'0.9rem' }}>{msg}</div>}

      <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1.25rem' }}>
        <input className="input" placeholder="Search players…" value={filter} onChange={e => setFilter(e.target.value)} style={{ flex:1 }} />
        <select className="input" value={teamFilter} onChange={e => setTeamFilter(e.target.value)} style={{ width:200 }}>
          <option value="">All teams</option>
          {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
      </div>

      <div className="card" style={{ overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1.5px solid var(--gray-border)', background:'var(--carolina-light)' }}>
              {['Player','Team','Position','Sessions','Last Active','Actions'].map(h => (
                <th key={h} style={{ padding:'0.75rem 1rem', textAlign:'left', fontSize:'0.72rem', color:'var(--carolina-deep)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6} style={{ padding:'2rem', textAlign:'center', color:'var(--text-muted)' }}>No players found.</td></tr>}
            {filtered.map((p, i) => (
              <tr key={p.id} style={{ borderBottom:'1px solid var(--gray-border)', background: i%2===0 ? 'var(--white)' : 'rgba(238,244,255,0.35)' }}>
                <td style={{ padding:'0.875rem 1rem' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                    <div style={{ width:34, height:34, borderRadius:'50%', background: p.teamColor ? `${p.teamColor}22` : 'var(--carolina-light)', border:`1.5px solid ${p.teamColor ?? 'var(--carolina-border)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-display)', fontWeight:700, color: p.teamColor ?? 'var(--carolina-deep)', fontSize:'0.85rem', flexShrink:0 }}>
                      {p.jersey_number || p.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight:600 }}>{p.name}</div>
                      {p.hasHealthFlag && <div style={{ fontSize:'0.7rem', color:'var(--danger)' }}>⚠ Health flag</div>}
                    </div>
                  </div>
                </td>
                <td style={{ padding:'0.875rem 1rem' }}>
                  {p.teamName ? <span style={{ fontSize:'0.82rem', color: p.teamColor ?? 'var(--carolina-dark)', background: p.teamColor ? `${p.teamColor}18` : 'var(--carolina-light)', padding:'0.2rem 0.6rem', borderRadius:4, fontWeight:500 }}>{p.teamName}</span> : <span style={{ color:'var(--text-muted)', fontSize:'0.82rem' }}>—</span>}
                </td>
                <td style={{ padding:'0.875rem 1rem', color:'var(--text-secondary)', fontSize:'0.85rem' }}>{p.position || '—'}</td>
                <td style={{ padding:'0.875rem 1rem', color:'var(--text-secondary)', fontSize:'0.85rem' }}>{p.sessionCount ?? 0}</td>
                <td style={{ padding:'0.875rem 1rem', color:'var(--text-muted)', fontSize:'0.82rem' }}>{p.lastSeen ? new Date(p.lastSeen).toLocaleDateString() : 'Never'}</td>
                <td style={{ padding:'0.875rem 1rem' }}>
                  <div style={{ display:'flex', gap:'0.625rem', alignItems:'center' }}>
                    <Link href={`/coach/players/${p.id}`} style={{ color:'var(--carolina-dark)', fontSize:'0.82rem', textDecoration:'none', fontWeight:600 }}>View</Link>
                    <span style={{ color:'var(--gray-border)' }}>|</span>
                    <button onClick={() => openEdit(p)} style={{ background:'none', border:'none', color:'var(--carolina-dark)', cursor:'pointer', fontSize:'0.82rem', fontWeight:600, padding:0 }}>Edit</button>
                    <span style={{ color:'var(--gray-border)' }}>|</span>
                    <button onClick={() => setDeleteConfirm(p)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:'0.82rem', fontWeight:600, padding:0 }}>Remove</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:'1rem' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="card" style={{ width:'100%', maxWidth:500, padding:'1.75rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.25rem' }}>{modal==='add' ? 'Add Player' : `Edit — ${editTarget?.name}`}</h2>
              <button onClick={closeModal} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'1.3rem', lineHeight:1 }}>✕</button>
            </div>
            {msg && <div style={{ background:'var(--danger-light)', border:'1.5px solid #fecaca', borderRadius:8, padding:'0.625rem', marginBottom:'1rem', color:'var(--danger)', fontSize:'0.85rem' }}>{msg}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.875rem', marginBottom:'0.875rem' }}>
              <div style={{ gridColumn:'1/-1' }}>
                <FF label="Full Name *"><input className="input" placeholder="Player's full name" value={form.name} onChange={e => setForm(p => ({ ...p, name:e.target.value }))} /></FF>
              </div>
              <FF label={modal==='add' ? '4-Digit PIN *' : 'New PIN (blank = keep current)'}>
                <input className="input" type="number" placeholder="e.g. 1234" value={form.pin} onChange={e => setForm(p => ({ ...p, pin:e.target.value.slice(0,4) }))} />
              </FF>
              <FF label="Jersey #">
                <input className="input" placeholder="e.g. 14" value={form.jersey_number} onChange={e => setForm(p => ({ ...p, jersey_number:e.target.value }))} />
              </FF>
              <FF label="Team">
                <select className="input" value={form.team_id} onChange={e => setForm(p => ({ ...p, team_id:e.target.value }))}>
                  <option value="">No team assigned</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}{t.age_group ? ` (${t.age_group})` : ''}</option>)}
                </select>
              </FF>
              <FF label="Position">
                <select className="input" value={form.position} onChange={e => setForm(p => ({ ...p, position:e.target.value }))}>
                  <option value="">Select…</option>
                  {POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                </select>
              </FF>
            </div>
            <div style={{ display:'flex', gap:'0.75rem' }}>
              <button className="btn-ghost" onClick={closeModal} style={{ flex:1, padding:'0.75rem' }}>Cancel</button>
              <button className="btn-volt" onClick={save} disabled={saving||!form.name} style={{ flex:2, padding:'0.75rem' }}>{saving ? 'Saving…' : modal==='add' ? 'Add Player' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:'1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}>
          <div className="card" style={{ width:'100%', maxWidth:400, padding:'1.75rem', textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'var(--danger-light)', border:'1.5px solid #fecaca', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </div>
            <h3 style={{ fontFamily:'var(--font-display)', fontSize:'1.25rem', fontWeight:800, marginBottom:'0.5rem' }}>Remove {deleteConfirm.name}?</h3>
            <p style={{ color:'var(--text-muted)', fontSize:'0.85rem', marginBottom:'1.5rem', lineHeight:1.6 }}>
              This removes them from the active roster. All their workout history and data is preserved.
            </p>
            <div style={{ display:'flex', gap:'0.75rem' }}>
              <button className="btn-ghost" onClick={() => setDeleteConfirm(null)} style={{ flex:1, padding:'0.75rem' }}>Cancel</button>
              <button onClick={deletePlayer} style={{ flex:1, padding:'0.75rem', background:'var(--danger)', color:'var(--white)', border:'none', borderRadius:8, fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.95rem', cursor:'pointer', letterSpacing:'0.04em' }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
