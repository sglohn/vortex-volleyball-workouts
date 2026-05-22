'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface DashboardData {
  todaySessions: Array<{
    id: string
    playerName: string
    checkedInAt: string
    completedAt?: string
    completionPct: number
  }>
  flaggedPlayers: Array<{
    id: string
    name: string
    reason: string
    severity: 'warn' | 'danger'
  }>
  totalPlayers: number
  totalWorkoutsThisWeek: number
  avgCompletionPct: number
}

export default function CoachDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/coach/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading dashboard…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <div style={{ marginBottom: '2rem' }} className="fade-up">
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>Dashboard</h1>
        <p style={{ color: 'var(--text-muted)' }}>{dateStr}</p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-value">{data?.todaySessions.length ?? 0}</div>
          <div className="stat-label">Checked in today</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data?.totalWorkoutsThisWeek ?? 0}</div>
          <div className="stat-label">Sessions this week</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data?.avgCompletionPct ?? 0}%</div>
          <div className="stat-label">Avg completion</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Today's check-ins */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today's Check-Ins</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{data?.todaySessions.length ?? 0} of {data?.totalPlayers ?? 0}</span>
          </div>

          {!data?.todaySessions.length && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No check-ins yet today.</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {data?.todaySessions.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid var(--court-border)' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: 'var(--volt)', flexShrink: 0 }}>
                  {s.playerName.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.playerName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(s.checkedInAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {s.completedAt ? (
                    <span className="tag tag-volt">Done</span>
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{s.completionPct}%</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Flagged players */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: data?.flaggedPlayers.length ? '#f87171' : undefined }}>
              Needs Attention
            </h2>
            {data?.flaggedPlayers.length ? (
              <span className="tag tag-danger">{data.flaggedPlayers.length}</span>
            ) : null}
          </div>

          {!data?.flaggedPlayers.length && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: '0.5rem' }}><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontSize: '0.9rem' }}>All players on track</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {data?.flaggedPlayers.map(p => (
              <Link key={p.id} href={`/coach/players/${p.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem', borderRadius: 8, background: p.severity === 'danger' ? 'rgba(248,113,113,0.08)' : 'rgba(250,204,21,0.06)', border: `1px solid ${p.severity === 'danger' ? 'rgba(248,113,113,0.2)' : 'rgba(250,204,21,0.2)'}`, cursor: 'pointer', transition: 'opacity 0.15s' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--court-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: p.severity === 'danger' ? '#f87171' : '#facc15', flexShrink: 0 }}>
                    {p.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{p.name}</div>
                    <div style={{ fontSize: '0.75rem', color: p.severity === 'danger' ? '#f87171' : '#facc15' }}>{p.reason}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
