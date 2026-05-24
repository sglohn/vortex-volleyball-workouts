'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

const NAV = [
  { href: '/coach/dashboard', label: 'Dashboard', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
  { href: '/coach/health', label: 'Health Board', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> },
  { href: '/coach/schedule', label: 'Schedule', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { href: '/coach/phases', label: 'Phases', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { href: '/coach/templates', label: 'Workouts', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6.5 6.5h11M6.5 12h11M6.5 17.5h7"/><rect x="2" y="4" width="3" height="16" rx="1"/><rect x="19" y="4" width="3" height="16" rx="1"/></svg> },
  { href: '/coach/exercises', label: 'Exercise Library', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> },
  { href: '/coach/teams', label: 'Teams', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.85"/></svg> },
  { href: '/coach/players', label: 'Players', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
]

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (path !== '/coach' && !localStorage.getItem('vx_coach')) router.push('/coach')
  }, [path, router])

  function signOut() {
    localStorage.removeItem('vx_coach')
    router.push('/')
  }

  if (path === '/coach') return <>{children}</>

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      <aside style={{ width: 210, background: 'var(--court-surface)', borderRight: '1px solid var(--court-border)', display: 'flex', flexDirection: 'column', padding: '1.25rem 0.75rem', flexShrink: 0, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.75rem', padding: '0 0.25rem' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0f0d" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.08em', color: 'var(--volt)', lineHeight: 1 }}>VORTEX</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>S&C Coach</div>
          </div>
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {NAV.map(item => (
            <Link key={item.href} href={item.href} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.625rem', borderRadius: 7, textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500, color: path.startsWith(item.href) ? 'var(--volt)' : 'var(--text-secondary)', background: path.startsWith(item.href) ? 'rgba(74,222,128,0.1)' : 'transparent', transition: 'all 0.15s' }}>
              {item.icon}{item.label}
            </Link>
          ))}
        </nav>
        <button onClick={signOut} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '0.5rem 0.625rem', borderRadius: 7 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign out
        </button>
      </aside>
      <main style={{ flex: 1, overflowY: 'auto', minHeight: '100vh' }}>{children}</main>
    </div>
  )
}
