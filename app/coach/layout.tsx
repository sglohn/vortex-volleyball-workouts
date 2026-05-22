'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

const NAV = [
  { href: '/coach/dashboard', label: 'Dashboard', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
  { href: '/coach/workouts', label: 'Workouts', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6.5 6.5h11M6.5 12h11M6.5 17.5h11"/><rect x="2" y="4" width="3" height="16" rx="1"/><rect x="19" y="4" width="3" height="16" rx="1"/></svg> },
  { href: '/coach/players', label: 'Players', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4"/><circle cx="17" cy="17" r="4"/><path d="M15 17h4m-2-2v4"/></svg> },
]

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!localStorage.getItem('vx_coach')) router.push('/coach')
  }, [router])

  function signOut() {
    localStorage.removeItem('vx_coach')
    router.push('/')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: 'var(--court-surface)', borderRight: '1px solid var(--court-border)', display: 'flex', flexDirection: 'column', padding: '1.5rem 1rem', flexShrink: 0, position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '2rem' }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0a0f0d" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.1em', color: 'var(--volt)' }}>VORTEX</span>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.625rem 0.75rem', borderRadius: 8,
                textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500,
                color: path.startsWith(item.href) ? 'var(--volt)' : 'var(--text-secondary)',
                background: path.startsWith(item.href) ? 'rgba(74,222,128,0.1)' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={signOut}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem', padding: '0.5rem 0.75rem', borderRadius: 8, transition: 'color 0.15s' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign out
        </button>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', minHeight: '100vh' }}>
        {children}
      </main>
    </div>
  )
}
