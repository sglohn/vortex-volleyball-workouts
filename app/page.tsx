'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()
  const [players, setPlayers] = useState<Array<{ id: string; name: string; jersey_number?: string }>>([])
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPlayers, setLoadingPlayers] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    localStorage.removeItem('vx_session')
    fetch('/api/player/list')
      .then(r => r.json())
      .then(data => { setPlayers(data.players || []); setLoadingPlayers(false) })
      .catch(() => setLoadingPlayers(false))
  }, [])

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  function handleKey(k: string) {
    setError('')
    if (k === '←') { setPin(p => p.slice(0, -1)); return }
    if (pin.length >= 4) return
    setPin(p => p + k)
  }

  async function handleCheckin() {
    if (!selected || pin.length !== 4) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: selected.id, pin }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Invalid PIN'); setPin(''); setLoading(false); return }
      localStorage.setItem('vx_session', JSON.stringify({
        sessionId: data.sessionId, playerId: selected.id, playerName: selected.name,
        teamId: data.teamId, templateId: data.templateId,
        hasHealthFlags: data.hasHealthFlags, healthReports: data.healthReports,
        isResumed: data.isResumed,
      }))
      router.push('/player/bodycheck')
    } catch { setError('Something went wrong'); setLoading(false) }
  }

  const keys = ['1','2','3','4','5','6','7','8','9','←','0','✓']

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2.5rem 1rem', background: 'var(--page-bg)' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }} className="fade-up">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.25rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--black)' }}>VORTEX</h1>
        </div>
        <p style={{ color: 'var(--carolina-dark)', fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>Strength & Conditioning</p>
        <div style={{ height: 3, width: 60, background: 'linear-gradient(90deg, var(--black), var(--carolina))', borderRadius: 2, margin: '0.625rem auto 0' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 420 }}>
        {!selected ? (
          <div className="fade-up">
            <p style={{ color: 'var(--black)', marginBottom: '0.75rem', fontWeight: 600, fontSize: '0.95rem' }}>Who are you?</p>
            <input className="input" placeholder="Search your name…" value={search}
              onChange={e => setSearch(e.target.value)} style={{ marginBottom: '0.75rem' }} autoComplete="off" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 380, overflowY: 'auto' }}>
              {loadingPlayers && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Loading roster…</div>}
              {!loadingPlayers && filtered.length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No players found</div>}
              {filtered.map(p => (
                <button key={p.id} onClick={() => { setSelected(p); setPin(''); setError('') }}
                  style={{ background: 'var(--white)', border: '1.5px solid var(--gray-border)', borderRadius: 10, padding: '0.875rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--black)', textAlign: 'left', fontFamily: 'var(--font-body)', transition: 'all 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--carolina)'; e.currentTarget.style.background = 'var(--carolina-light)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gray-border)'; e.currentTarget.style.background = 'var(--white)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--yellow)', flexShrink: 0 }}>
                    {p.jersey_number || p.name.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <a href="/coach" style={{ color: 'var(--carolina-dark)', fontSize: '0.8rem', textDecoration: 'none', letterSpacing: '0.05em', fontWeight: 500 }}>Coach Dashboard →</a>
            </div>
          </div>
        ) : (
          <div className="fade-up">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <button onClick={() => { setSelected(null); setPin(''); setError('') }}
                style={{ background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 8, color: 'var(--carolina-dark)', cursor: 'pointer', padding: '0.3rem 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>← Back</button>
              <span style={{ color: 'var(--text-secondary)' }}>Checking in as <strong style={{ color: 'var(--black)' }}>{selected.name}</strong></span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
              {[0,1,2,3].map(i => (
                <div key={i} className={`pin-digit ${i < pin.length ? 'filled' : ''}`}>{i < pin.length ? '●' : ''}</div>
              ))}
            </div>
            {error && (
              <div style={{ background: 'var(--danger-light)', border: '1.5px solid #fecaca', borderRadius: 8, padding: '0.625rem', marginBottom: '1rem', color: 'var(--danger)', textAlign: 'center', fontSize: '0.9rem' }}>{error}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {keys.map(k => (
                <button key={k} className="pin-key"
                  onClick={() => k === '✓' ? handleCheckin() : handleKey(k)}
                  style={{ width: '100%', background: k === '✓' ? 'var(--carolina)' : 'var(--white)', color: k === '✓' ? 'var(--white)' : 'var(--black)', fontWeight: k === '✓' ? 700 : 600, opacity: k === '✓' && pin.length !== 4 ? 0.4 : 1 }}
                  disabled={loading}>{k}</button>
              ))}
            </div>
            {loading && <div style={{ textAlign: 'center', color: 'var(--carolina-dark)', fontWeight: 500 }}>Checking in…</div>}
          </div>
        )}
      </div>
    </div>
  )
}
