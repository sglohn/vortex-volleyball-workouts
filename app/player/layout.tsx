'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const [playerName, setPlayerName] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('vx_session')
    if (!stored) { router.push('/'); return }
    setPlayerName(JSON.parse(stored).playerName ?? '')
  }, [router])

  const nav = [
    { href: '/player/workout', label: 'Workout', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6.5 6.5h11M6.5 12h11M6.5 17.5h7"/><rect x="2" y="4" width="3" height="16" rx="1"/><rect x="19" y="4" width="3" height="16" rx="1"/></svg> },
    { href: '/player/health', label: 'Health', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> },
    { href: '/player/profile', label: 'Profile', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
    { href: '/player/progress', label: 'Progress', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
    { href: '/player/history', label: 'History', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 9 15"/><path d="M2 12a10 10 0 0 1 10-10"/><polyline points="2 6 2 12 8 12"/></svg> },
  ]

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--page-bg)' }}>
      {/* Top bar */}
      <div style={{ background: 'var(--black)', padding: '0.625rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--black)" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </div>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.1em', color: 'var(--yellow)' }}>VORTEX S&C</span>
        <div style={{ flex: 1 }} />
        {playerName && <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>{playerName}</span>}
        <Link href="/" style={{ color: 'var(--carolina-light)', fontSize: '0.75rem', textDecoration: 'none', fontWeight: 500 }}>Sign out</Link>
      </div>

      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: '5rem' }}>{children}</main>

      {/* Bottom nav */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--white)', borderTop: '1.5px solid var(--gray-border)', display: 'flex', justifyContent: 'space-around', padding: '0.4rem 0', zIndex: 10, boxShadow: '0 -2px 12px rgba(0,0,0,0.07)' }}>
        {nav.map(item => (
          <Link key={item.href} href={item.href} className={`nav-item ${path === item.href ? 'active' : ''}`}>
            {item.icon}{item.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
