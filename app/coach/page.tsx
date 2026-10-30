// FILE: app/coach/page.tsx
//
// Admin sign-in (the small "Admin" link at the bottom of the main screen).
// Pick your name, then your 4-digit PIN. The server sets the coach cookie
// (app/api/coach/route.ts). Shows the server's message, so lockouts read
// "Too many wrong PINs…".
//
// Team coaches sign in from the main screen under their team instead.
//
// First-time setup: until an admin account exists (Coach → Coaches), there
// are no names to pick, and the old shared coach PIN signs in.

'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BrandMark from '@/components/BrandMark'
import { BRAND } from '@/lib/brand'

interface Admin { id: string; name: string }

const KEYS = ['1','2','3','4','5','6','7','8','9','←','0','✓']

function AdminRow({ admin, onPick }: { admin: Admin; onPick: () => void }) {
  return (
    <button onClick={onPick}
      style={{ width: '100%', background: 'var(--white)', border: '1.5px solid var(--gray-border)', borderRadius: 10, padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--black)', textAlign: 'left' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
        {admin.name.charAt(0).toUpperCase()}
      </div>
      <span style={{ fontWeight: 500 }}>{admin.name}</span>
      <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '1.1rem' }}>›</div>
    </button>
  )
}

export default function CoachLoginPage() {
  const router = useRouter()
  const [admins, setAdmins] = useState<Admin[]>([])
  const [setup, setSetup] = useState(false)
  const [listLoading, setListLoading] = useState(true)
  const [picked, setPicked] = useState<Admin | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/coach/signin-list')
      .then(r => r.json())
      .then(d => { setAdmins(d.admins ?? []); setSetup(!!d.setup) })
      .catch(() => setError('Couldn’t load the list. Check your connection.'))
      .finally(() => setListLoading(false))
  }, [])

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
      body: JSON.stringify(picked ? { coachId: picked.id, pin } : { pin }),
    })
    if (res.ok) {
      localStorage.setItem('vx_coach', 'true')
      router.push(setup ? '/coach/coaches' : '/coach/dashboard')
    } else {
      const data = await res.json().catch(() => ({}))
      // Only a 401 means the PIN itself was wrong; show anything else as-is
      setError(data?.error || (res.status === 401 ? 'Wrong PIN' : `Server error (${res.status}). Try again in a minute.`))
      setPin('')
      setLoading(false)
    }
  }

  const showPad = setup || picked !== null

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        {BRAND.logoSrc ? (
          <h1 style={{ margin: '0 auto 0.625rem', width: 'min(280px, 80vw)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.logoSrc} alt={BRAND.description} width={1200} height={278}
              style={{ width: '100%', height: 'auto', display: 'block' }} />
          </h1>
        ) : (
          <div style={{ display: 'flex', flexDirection: BRAND.markSrc ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <BrandMark size={BRAND.markSrc ? 88 : 40} tone="dark" />
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: BRAND.markSrc ? 'clamp(1.6rem, 8vw, 2rem)' : '2rem', whiteSpace: 'nowrap', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--volt)' }}>{BRAND.name}</h1>
          </div>
        )}
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Strength & Conditioning — Admin</p>
      </div>

      <div style={{ width: '100%', maxWidth: 320 }} className="fade-up">
        {!showPad && (
          <div>
            <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.875rem', textAlign: 'center' }}>Who are you?</p>
            {listLoading && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>Loading…</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {admins.map(a => <AdminRow key={a.id} admin={a} onPick={() => { setPicked(a); setPin(''); setError('') }} />)}
            </div>
            {error && <div style={{ marginTop: '1rem', color: '#f87171', textAlign: 'center', fontSize: '0.9rem' }}>{error}</div>}
          </div>
        )}

        {showPad && (
          <div>
            {picked && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <button onClick={() => { setPicked(null); setPin(''); setError('') }}
                  style={{ background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 8, color: 'var(--carolina-dark)', cursor: 'pointer', padding: '0.35rem 0.875rem', fontSize: '0.85rem', fontWeight: 600 }}>← Back</button>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Signing in as <strong style={{ color: 'var(--black)' }}>{picked.name}</strong>
                </span>
              </div>
            )}
            {setup && !picked && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1rem' }}>
                First-time setup: enter the club coach PIN, then add admin accounts.
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {[0,1,2,3].map(i => (
                <div key={i} className={`pin-digit ${i < pin.length ? 'filled' : ''}`}>{i < pin.length ? '●' : ''}</div>
              ))}
            </div>
            {error && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '0.625rem', marginBottom: '1rem', color: '#f87171', textAlign: 'center', fontSize: '0.9rem' }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {KEYS.map(k => (
                <button key={k} className="pin-key" onClick={() => k === '✓' ? handleLogin() : handleKey(k)}
                  style={{ width: '100%', background: k === '✓' ? 'var(--yellow)' : undefined, color: k === '✓' ? '#0a0f0d' : undefined, fontWeight: k === '✓' ? 700 : undefined, opacity: k === '✓' && pin.length !== 4 ? 0.4 : 1 }}
                  disabled={loading}>{k}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <a href="/" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textDecoration: 'none' }}>← Player and coach sign-in</a>
        </div>
      </div>
    </div>
  )
}
