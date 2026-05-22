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
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: selected.id, pin }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Invalid PIN'); setPin(''); setLoading(false); return }
      // Store session in localStorage for this browser session
      localStorage.setItem('vx_session', JSON.stringify({ sessionId: data.sessionId, playerId: selected.id, playerName: selected.name }))
      router.push('/player/workout')
    } catch {
      setError('Something went wrong'); setLoading(false)
    }
  }

  const keys = ['1','2','3','4','5','6','7','8','9','←','0','✓']

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }} className="fade-up">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0a0f0d" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--volt)' }}>VORTEX</h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Weight Room Check-In</p>
      </div>

      <div style={{ width: '100%', maxWidth: 420 }}>
        {!selected ? (
          /* Step 1 — Select player */
          <div className="fade-up">
            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem', fontWeight: 500 }}>Who are you?</p>
            <input
              className="input"
              placeholder="Search your name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ marginBottom: '0.75rem' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 360, overflowY: 'auto' }}>
              {loadingPlayers && (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Loading roster…</div>
              )}
              {!loadingPlayers && filtered.length === 0 && (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No players found</div>
              )}
              {filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelected(p); setPin(''); setError('') }}
                  style={{
                    background: 'var(--court-surface)',
                    border: '1px solid var(--court-border)',
                    borderRadius: 10,
                    padding: '0.875rem 1rem',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    transition: 'border-color 0.15s',
                    color: 'var(--text-primary)',
                    textAlign: 'left',
                    fontFamily: 'var(--font-body)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--volt)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--court-border)')}
                >
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--court-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--volt)', flexShrink: 0 }}>
                    {p.jersey_number || p.name.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                </button>
              ))}
            </div>
            {/* Coach link */}
            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <a href="/coach" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textDecoration: 'none', letterSpacing: '0.05em' }}>
                Coach Dashboard →
              </a>
            </div>
          </div>
        ) : (
          /* Step 2 — Enter PIN */
          <div className="fade-up">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <button onClick={() => { setSelected(null); setPin(''); setError('') }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>←</button>
              <span style={{ color: 'var(--text-secondary)' }}>Checking in as <strong style={{ color: 'var(--text-primary)' }}>{selected.name}</strong></span>
            </div>

            {/* PIN display */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
              {[0,1,2,3].map(i => (
                <div key={i} className={`pin-digit ${i < pin.length ? 'filled' : ''}`}>
                  {i < pin.length ? '●' : ''}
                </div>
              ))}
            </div>

            {error && (
              <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '0.625rem', marginBottom: '1rem', color: '#f87171', textAlign: 'center', fontSize: '0.9rem' }}>
                {error}
              </div>
            )}

            {/* Numpad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {keys.map(k => (
                <button
                  key={k}
                  className="pin-key"
                  onClick={() => k === '✓' ? handleCheckin() : handleKey(k)}
                  style={{
                    width: '100%',
                    background: k === '✓' ? 'var(--volt)' : undefined,
                    color: k === '✓' ? '#0a0f0d' : undefined,
                    fontWeight: k === '✓' ? 700 : undefined,
                    opacity: k === '✓' && pin.length !== 4 ? 0.4 : 1,
                  }}
                  disabled={loading}
                >
                  {k}
                </button>
              ))}
            </div>

            {loading && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Checking in…</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
