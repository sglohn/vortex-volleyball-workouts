// FILE: app/coach/page.tsx
//
// Coach sign-in. The server sets the coach cookie (app/api/coach/route.ts).
// Shows the server's message, so lockouts read "Too many wrong PINs…".

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BrandMark from '@/components/BrandMark'
import { BRAND } from '@/lib/brand'

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
      const data = await res.json().catch(() => ({}))
      // Only a 401 means the PIN itself was wrong; show anything else as-is
      setError(data?.error || (res.status === 401 ? 'Wrong PIN' : `Server error (${res.status}). Try again in a minute.`))
      setPin('')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: BRAND.markSrc ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
          <BrandMark size={BRAND.markSrc ? 88 : 40} tone="dark" />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: BRAND.markSrc ? 'clamp(1.6rem, 8vw, 2rem)' : '2rem', whiteSpace: 'nowrap', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--volt)' }}>{BRAND.name}</h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Strength & Conditioning — Coach</p>
      </div>
      <div style={{ width: '100%', maxWidth: 320 }} className="fade-up">
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[0,1,2,3].map(i => (
            <div key={i} className={`pin-digit ${i < pin.length ? 'filled' : ''}`}>{i < pin.length ? '●' : ''}</div>
          ))}
        </div>
        {error && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '0.625rem', marginBottom: '1rem', color: '#f87171', textAlign: 'center', fontSize: '0.9rem' }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {keys.map(k => (
            <button key={k} className="pin-key" onClick={() => k === '✓' ? handleLogin() : handleKey(k)}
              style={{ width: '100%', background: k === '✓' ? 'var(--volt)' : undefined, color: k === '✓' ? '#0a0f0d' : undefined, fontWeight: k === '✓' ? 700 : undefined, opacity: k === '✓' && pin.length !== 4 ? 0.4 : 1 }}
              disabled={loading}>{k}</button>
          ))}
        </div>
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <a href="/" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textDecoration: 'none' }}>← Player check-in</a>
        </div>
      </div>
    </div>
  )
}
