'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CoachLoginPage() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const keys = ['1','2','3','4','5','6','7','8','9','←','0','✓']

  function handleKey(k: string) {
    setError('')
    if (k === '←') { setPin(p => p.slice(0, -1)); return }
    if (pin.length >= 4) return
    setPin(p => p + k)
  }

  async function handleLogin() {
    if (pin.length !== 4) return
    setLoading(true)
    const res = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    if (res.ok) {
      localStorage.setItem('vx_coach', 'true')
      router.push('/coach/dashboard')
    } else {
      setError('Wrong PIN')
      setPin('')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0a0f0d" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--volt)' }}>VORTEX</h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Coach Dashboard</p>
      </div>

      <div style={{ width: '100%', maxWidth: 320 }} className="fade-up">
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {keys.map(k => (
            <button
              key={k}
              className="pin-key"
              onClick={() => k === '✓' ? handleLogin() : handleKey(k)}
              style={{ width: '100%', background: k === '✓' ? 'var(--volt)' : undefined, color: k === '✓' ? '#0a0f0d' : undefined, fontWeight: k === '✓' ? 700 : undefined, opacity: k === '✓' && pin.length !== 4 ? 0.4 : 1 }}
              disabled={loading}
            >{k}</button>
          ))}
        </div>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <a href="/" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textDecoration: 'none' }}>← Back to player check-in</a>
        </div>
      </div>
    </div>
  )
}
