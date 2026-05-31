'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Team { id: string; name: string; age_group?: string; color: string; is_active: boolean; playerCount?: number }

const COLORS = ['#56a0d3','#111827','#ef4444','#f97316','#8b5cf6','#10b981','#f59e0b','#ec4899','#06b6d4','#84cc16']
const AGE_GROUPS = ['12s','13s','14s','15-16s','17-18s','Boys 14s','Boys 16s','Boys 18s','Open']

export default function CoachTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add'|'edit'|null>(null)
  const [editTarget, setEditTarget] = useState<Team|null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Team|null>(null)
  const [form, setForm] = useState({ name:'', age_group:'', color:'#56a0d3' })
  const [msg, setMsg] = useState('')
  const [msgErr, setMsgErr] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sessionTeams, setSessionTeams] = useState<string[]>([])
  const [sessionUrl, setSessionUrl] = useState('')

  useEffect(() => {
    fetch('/api/coach/teams').then(r => r.json()).then(d => { setTeams(d.teams ?? []); setLoading(false) })
  }, [])

  function openAdd() { setForm({ name:'', age_group:'', color:'#56a0d3' }); setEditTarget(null); setModal('add'); setMsg('') }
  function openEdit(t: Team) { setForm({ name:t.name, age_group:t.age_group??'', color:t.color }); setEditTarget(t); setModal('edit'); setMsg('') }
  function closeModal() { setModal(null); setEditTarget(null); setMsg('') }

  async function save() {
    if (!form.name) { setMsg('Team name is required'); setMsgErr(true); return }
    setSaving(true)
    const method = modal === 'add' ? 'POST' : 'PUT'
    const body = modal === 'edit' && editTarget ? { id: editTarget.id, ...form } : form
    const res = await fetch('/api/coach/teams', { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    const data = await res.json()
    if (res.ok) {
      if (modal === 'add') setTeams(prev => [...prev, { ...data.team, playerCount: 0 }])
      else setTeams(prev => prev.map(t => t.id === data.team.id ? { ...t, ...data.team } : t))
      closeModal(); setMsg(`Team ${modal==='add'?'created':'updated'}`); setMsgErr(false); setTimeout(()=>setMsg(''),3000)
    } else { setMsg(data.error || 'Error'); setMsgErr(true) }
    setSaving(false)
  }

  async function deleteTeam() {
    if (!deleteConfirm) return
    await fetch('/api/coach/teams/delete', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: deleteConfirm.id }) })
    setTeams(prev => prev.filter(t => t.id !== deleteConfirm.id))
    setDeleteConfirm(null); setMsg('Team removed'); setMsgErr(false); setTimeout(()=>setMsg(''),3000)
  }

  function buildSessionUrl() {
    if (!sessionTeams.length) return
    const date = new Date()
    const d = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
    const url = `${window.location.origin}/session/${d}?teams=${sessionTeams.join(',')}`
    setSessionUrl(url)
  }

  if (loading) return <div style={{ padding:'2rem', color:'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding:'2rem', maxWidth:800 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'2rem' }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:800 }}>Teams</h1>
          <p style={{ color:'var(--text-muted)', fontSize:'0.85rem' }}>{teams.length} active teams</p>
        </div>
        <button className="btn-volt" onClick={openAdd} style={{ padding:'0.625rem 1.25rem' }}>+ New Team</button>
      </div>

      {msg && <div style={{ background: msgErr?'var(--danger-light)':'var(--carolina-light)', border:`1.5px solid ${msgErr?'#fecaca':'var(--carolina-border)'}`, borderRadius:8, padding:'0.75rem', marginBottom:'1rem', color: msgErr?'var(--danger)':'var(--carolina-deep)', fontSize:'0.9rem' }}>{msg}</div>}

      <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
        {teams.length === 0 && <div className="card" style={{ padding:'2rem', textAlign:'center', color:'var(--text-muted)' }}>No teams yet. Add your first team above.</div>}
        {teams.map(t => (
          <div key={t.id} className="card" style={{ padding:'1.1rem 1.25rem', borderLeft:`4px solid ${t.color}`, display:'flex', alignItems:'center', gap:'1rem' }}>
            {/* Color swatch */}
            <div style={{ width:40, height:40, borderRadius:10, background:t.color, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1rem', color:'white' }}>{t.name.charAt(0)}</span>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <Link href={`/coach/teams/${t.id}`} style={{ fontWeight:700, fontSize:'1rem', color:'var(--black)', textDecoration:'none' }}>{t.name} →</Link>
              <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:'0.1rem' }}>
                {t.age_group && <span>{t.age_group} · </span>}
                <span>{t.playerCount ?? 0} players</span>
              </div>
            </div>
            <div style={{ display:'flex', gap:'0.625rem', alignItems:'center', flexShrink:0 }}>
              <a href={`/team/${t.id}`} target="_blank" rel="noopener noreferrer"
                style={{ background:'var(--carolina)', color:'var(--white)', fontSize:'0.78rem', textDecoration:'none', fontWeight:700, padding:'0.35rem 0.75rem', borderRadius:6, letterSpacing:'0.03em' }}>
                ▶ Team Mode
              </a>
              <Link href={`/coach/schedule?team=${t.id}`}
                style={{ color:'var(--carolina-dark)', fontSize:'0.82rem', textDecoration:'none', fontWeight:600 }}>
                Schedule
              </Link>
              <button onClick={() => openEdit(t)} style={{ background:'none', border:'none', color:'var(--carolina-dark)', cursor:'pointer', fontSize:'0.82rem', fontWeight:600, padding:0 }}>Edit</button>
              <span style={{ color:'var(--gray-border)' }}>|</span>
              <button onClick={() => setDeleteConfirm(t)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:'0.82rem', fontWeight:600, padding:0 }}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── SESSION LAUNCHER ── */}
      <div className="card" style={{ padding:'1.25rem', marginTop:'1.5rem', borderLeft:'4px solid var(--carolina)' }}>
        <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.1rem', marginBottom:'0.5rem' }}>Start Weight Room Session</h2>
        <p style={{ color:'var(--text-muted)', fontSize:'0.82rem', marginBottom:'0.875rem' }}>Pick the teams coming in today. Copy the URL and open it on your wall tablets.</p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem', marginBottom:'0.875rem' }}>
          {teams.map(t => (
            <button key={t.id} onClick={() => setSessionTeams(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])}
              style={{ padding:'0.35rem 0.875rem', borderRadius:20, border:`2px solid ${sessionTeams.includes(t.id) ? t.color : 'var(--gray-border)'}`, background: sessionTeams.includes(t.id) ? `${t.color}18` : 'transparent', color: sessionTeams.includes(t.id) ? t.color : 'var(--text-muted)', fontSize:'0.82rem', fontWeight:600, cursor:'pointer' }}>
              {t.name}{t.age_group ? ` ${t.age_group}` : ''}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:'0.625rem', alignItems:'center', flexWrap:'wrap' }}>
          <button className="btn-volt" onClick={buildSessionUrl} disabled={!sessionTeams.length} style={{ padding:'0.5rem 1.25rem', fontSize:'0.85rem' }}>
            Generate URL
          </button>
          {sessionUrl && (
            <>
              <input value={sessionUrl} readOnly style={{ flex:1, padding:'0.5rem 0.75rem', border:'1.5px solid var(--carolina-border)', borderRadius:7, fontSize:'0.78rem', background:'var(--carolina-light)', color:'var(--carolina-deep)', minWidth:200, fontFamily:'monospace' }} onClick={e => (e.target as HTMLInputElement).select()} />
              <button onClick={() => { navigator.clipboard.writeText(sessionUrl); }} className="btn-ghost" style={{ padding:'0.5rem 0.875rem', fontSize:'0.82rem', flexShrink:0 }}>Copy</button>
              <a href={sessionUrl} target="_blank" rel="noopener noreferrer" className="btn-black" style={{ padding:'0.5rem 0.875rem', fontSize:'0.82rem', textDecoration:'none', flexShrink:0 }}>Open →</a>
            </>
          )}
          {sessionUrl && (
            <div style={{ marginTop:'0.75rem', display:'flex', alignItems:'flex-start', gap:'1rem', flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginBottom:'0.35rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>QR Code for tablets</div>
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(sessionUrl)}`} alt="Session QR code" style={{ width:120, height:120, borderRadius:8, border:'2px solid var(--gray-border)' }} />
                <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:'0.3rem', maxWidth:120 }}>Scan to open on wall tablet</div>
              </div>
              <div style={{ flex:1, minWidth:200 }}>
                <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginBottom:'0.35rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>Bookmark this URL on each tablet</div>
                <div style={{ fontSize:'0.75rem', fontFamily:'monospace', background:'var(--carolina-light)', border:'1px solid var(--carolina-border)', borderRadius:6, padding:'0.5rem 0.75rem', wordBreak:'break-all', color:'var(--carolina-deep)' }}>{sessionUrl}</div>
                <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'0.3rem' }}>Players can check in directly from this page — no phone needed</div>
              </div>
            </div>
          )}
          {sessionUrl && <>
            </>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:'1rem' }}
          onClick={e => { if (e.target===e.currentTarget) closeModal() }}>
          <div className="card" style={{ width:'100%', maxWidth:440, padding:'1.75rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.25rem' }}>{modal==='add'?'New Team':`Edit — ${editTarget?.name}`}</h2>
              <button onClick={closeModal} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'1.3rem', lineHeight:1 }}>✕</button>
            </div>
            {msg && <div style={{ background:'var(--danger-light)', border:'1.5px solid #fecaca', borderRadius:8, padding:'0.625rem', marginBottom:'1rem', color:'var(--danger)', fontSize:'0.85rem' }}>{msg}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.875rem', marginBottom:'1.25rem' }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'block', fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.4rem', fontWeight:600 }}>Team Name *</label>
                <input className="input" placeholder="e.g. 14 Black" value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.4rem', fontWeight:600 }}>Age Group</label>
                <select className="input" value={form.age_group} onChange={e => setForm(p=>({...p,age_group:e.target.value}))}>
                  <option value="">Select…</option>
                  {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display:'block', fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.5rem', fontWeight:600 }}>Team Color</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'0.5rem' }}>
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setForm(p=>({...p,color:c}))}
                      style={{ width:30, height:30, borderRadius:'50%', background:c, border: form.color===c ? '3px solid var(--black)' : '2px solid transparent', cursor:'pointer', transition:'all 0.12s', boxShadow: form.color===c ? '0 0 0 2px white inset' : 'none' }} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:'0.75rem' }}>
              <button className="btn-ghost" onClick={closeModal} style={{ flex:1, padding:'0.75rem' }}>Cancel</button>
              <button className="btn-volt" onClick={save} disabled={saving||!form.name} style={{ flex:2, padding:'0.75rem' }}>{saving?'Saving…':modal==='add'?'Create Team':'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:'1rem' }}
          onClick={e => { if (e.target===e.currentTarget) setDeleteConfirm(null) }}>
          <div className="card" style={{ width:'100%', maxWidth:400, padding:'1.75rem', textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'var(--danger-light)', border:'1.5px solid #fecaca', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </div>
            <h3 style={{ fontFamily:'var(--font-display)', fontSize:'1.25rem', fontWeight:800, marginBottom:'0.5rem' }}>Delete {deleteConfirm.name}?</h3>
            <p style={{ color:'var(--text-muted)', fontSize:'0.85rem', marginBottom:'1.5rem', lineHeight:1.6 }}>
              This removes the team and unassigns all players from it. Player data and workout history is preserved.
            </p>
            <div style={{ display:'flex', gap:'0.75rem' }}>
              <button className="btn-ghost" onClick={()=>setDeleteConfirm(null)} style={{ flex:1, padding:'0.75rem' }}>Cancel</button>
              <button onClick={deleteTeam} style={{ flex:1, padding:'0.75rem', background:'var(--danger)', color:'var(--white)', border:'none', borderRadius:8, fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.95rem', cursor:'pointer' }}>Delete Team</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
