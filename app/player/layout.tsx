'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()

  const nav = [
    { href: '/player/workout', label: 'Workout', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6.5 6.5h11M6.5 12h11M6.5 17.5h11"/><rect x="2" y="4" width="3" height="16" rx="1"/><rect x="19" y="4" width="3" height="16" rx="1"/></svg>
    )},
    { href: '/player/profile', label: 'Profile', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
    )},
    { href: '/player/progress', label: 'Progress', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
    )},
  ]

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ background: 'var(--court-surface)', borderBottom: '1px solid var(--court-border)', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0f0d" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </div>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.08em', color: 'var(--volt)' }}>VORTEX</span>
        <div style={{ flex: 1 }} />
        <Link href="/" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textDecoration: 'none' }}>Sign out</Link>
      </div>

      {/* Page content */}
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: '5rem' }}>
        {children}
      </main>

      {/* Bottom nav */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--court-surface)', borderTop: '1px solid var(--court-border)', display: 'flex', justifyContent: 'space-around', padding: '0.5rem 0', zIndex: 10 }}>
        {nav.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${path === item.href ? 'active' : ''}`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
