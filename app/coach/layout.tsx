'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV = [
  { href: '/coach/dashboard', label: 'Dashboard',       short: 'Home',      icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
  { href: '/coach/health',    label: 'Health Board',    short: 'Health',    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> },
  { href: '/coach/schedule',  label: 'Schedule',        short: 'Schedule',  icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { href: '/coach/phases',    label: 'Phases',          short: 'Phases',    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { href: '/coach/templates', label: 'Workouts',        short: 'Workouts',  icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6.5 6.5h11M6.5 12h11M6.5 17.5h7"/><rect x="2" y="4" width="3" height="16" rx="1"/><rect x="19" y="4" width="3" height="16" rx="1"/></svg> },
  { href: '/coach/exercises', label: 'Exercise Library',short: 'Exercises', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> },
  { href: '/coach/teams',     label: 'Teams',           short: 'Teams',     icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4"/><circle cx="17" cy="17" r="4"/><path d="M15 17h4m-2-2v4"/></svg> },
  { href: '/coach/players',   label: 'Players',         short: 'Players',   icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
  { href: '/coach/display',   label: 'TV Display',      short: 'TV',        icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
]

// Bottom nav shows these 5 on mobile — most used pages
const MOBILE_NAV = ['/coach/dashboard', '/coach/health', '/coach/teams', '/coach/players', '/coach/schedule']

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (path !== '/coach' && !localStorage.getItem('vx_coach')) router.push('/coach')
  }, [path, router])

  // Close menu on navigation
  useEffect(() => { setMenuOpen(false) }, [path])

  function signOut() { localStorage.removeItem('vx_coach'); router.push('/') }

  if (path === '/coach') return <>{children}</>
  if (path === '/coach/display') return <>{children}</>

  const mobileNavItems = NAV.filter(n => MOBILE_NAV.includes(n.href))

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .coach-sidebar { display: none !important; }
          .coach-main { padding-bottom: 4.5rem !important; }
          .coach-mobile-bar { display: flex !important; }
          .coach-mobile-topbar { display: flex !important; }
        }
        @media (min-width: 769px) {
          .coach-mobile-bar { display: none !important; }
          .coach-mobile-topbar { display: none !important; }
        }
      `}</style>

      <div style={{ minHeight: '100vh', display: 'flex' }}>

        {/* ── DESKTOP SIDEBAR ── */}
        <aside className="coach-sidebar" style={{ width: 215, background: 'var(--black)', display: 'flex', flexDirection: 'column', padding: '1.25rem 0.75rem', flexShrink: 0, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.75rem', padding: '0 0.25rem' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--black)" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.1em', color: 'var(--yellow)', lineHeight: 1 }}>VORTEX</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--carolina-light)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.7 }}>S&C Coach</div>
            </div>
          </div>
          <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {NAV.map(item => {
              const active = path.startsWith(item.href)
              return (
                <Link key={item.href} href={item.href} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.625rem', borderRadius: 7, textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500, color: active ? 'var(--black)' : 'rgba(255,255,255,0.65)', background: active ? 'var(--yellow)' : 'transparent', transition: 'all 0.15s' }}>
                  {item.icon}{item.label}
                </Link>
              )
            })}
          </nav>
          <button onClick={signOut} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.8rem', padding: '0.5rem 0.625rem', borderRadius: 7, marginTop: '0.5rem' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign out
          </button>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Mobile top bar */}
          <div className="coach-mobile-topbar" style={{ background: 'var(--black)', padding: '0.625rem 1rem', alignItems: 'center', gap: '0.75rem', position: 'sticky', top: 0, zIndex: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--black)" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              </div>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.08em', color: 'var(--yellow)' }}>VORTEX</span>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginLeft: '0.25rem' }}>
                {NAV.find(n => path.startsWith(n.href))?.label ?? 'Coach'}
              </span>
            </div>
            {/* Hamburger */}
            <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--yellow)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {menuOpen
                ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              }
            </button>
          </div>

          {/* Mobile dropdown menu */}
          {menuOpen && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 }} onClick={() => setMenuOpen(false)}>
              <div style={{ position: 'absolute', top: 54, left: 0, right: 0, background: 'var(--black)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '0.5rem 0.75rem', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
                {NAV.map(item => {
                  const active = path.startsWith(item.href)
                  return (
                    <Link key={item.href} href={item.href} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0.875rem', borderRadius: 8, textDecoration: 'none', fontSize: '0.95rem', fontWeight: 500, color: active ? 'var(--black)' : 'rgba(255,255,255,0.75)', background: active ? 'var(--yellow)' : 'transparent', marginBottom: '2px' }}>
                      {item.icon}{item.label}
                    </Link>
                  )
                })}
                <button onClick={signOut} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.9rem', padding: '0.75rem 0.875rem', borderRadius: 8, marginTop: '0.25rem' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Sign out
                </button>
              </div>
            </div>
          )}

          <main className="coach-main" style={{ flex: 1, overflowY: 'auto', background: 'var(--page-bg)' }}>
            {children}
          </main>
        </div>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="coach-mobile-bar" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--black)', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '0.3rem 0', zIndex: 20, justifyContent: 'space-around', boxShadow: '0 -2px 12px rgba(0,0,0,0.2)' }}>
        {mobileNavItems.map(item => {
          const active = path.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '0.35rem 0.5rem', borderRadius: 8, textDecoration: 'none', color: active ? 'var(--yellow)' : 'rgba(255,255,255,0.45)', fontSize: '0.6rem', fontWeight: active ? 700 : 500, textTransform: 'uppercase', letterSpacing: '0.04em', flex: 1, transition: 'color 0.12s' }}>
              {item.icon}{item.short}
            </Link>
          )
        })}
        {/* More button opens hamburger */}
        <button onClick={() => setMenuOpen(o => !o)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '0.35rem 0.5rem', background: 'none', border: 'none', color: menuOpen ? 'var(--yellow)' : 'rgba(255,255,255,0.45)', fontSize: '0.6rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', flex: 1, cursor: 'pointer' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>
          More
        </button>
      </nav>
    </>
  )
}
