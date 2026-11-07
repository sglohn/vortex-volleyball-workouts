// FILE: components/ComparisonTabs.tsx
//
// The views under Coach → Comparisons: one player against the net
// (app/coach/comparisons), group averages (app/coach/comparisons/groups) and
// the trial points score (app/coach/comparisons/trial).
'use client'
import Link from 'next/link'

export default function ComparisonTabs({ active }: { active: 'player' | 'groups' | 'trial' }) {
  const tab = (key: 'player' | 'groups' | 'trial', href: string, label: string) => (
    <Link href={href} className={active === key ? 'btn-volt' : 'btn-ghost'}
      style={{ fontSize: 13, padding: '0.4rem 0.9rem', borderRadius: 20, textDecoration: 'none' }}>
      {label}
    </Link>
  )
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
      {tab('player', '/coach/comparisons', 'One player')}
      {tab('groups', '/coach/comparisons/groups', 'Groups')}
      {tab('trial', '/coach/comparisons/trial', 'Score Trial')}
    </div>
  )
}
