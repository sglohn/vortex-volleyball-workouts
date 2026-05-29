'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PHASE_CONFIG, PhaseType } from '@/lib/types'

interface SessionDetail {
  session: { id: string; playerName: string; jerseyNumber?: string; checkedInAt: string; completedAt?: string; durationMin?: number }
  exercises: Array<{ exerciseId: string; name: string; category: string; logsWeight: boolean; firstLoggedAt: string; sets: Array<{ setNumber: number; weightLbs: number | null; repsCompleted: number | null; completed: boolean; loggedAt: string }> }>
  stats: { totalWeightMoved: number; totalSetsCompleted: number; exercisesHit: number }
  topLifts: Array<{ name: string; heaviest: number; repsAtHeaviest: number | null }>
}

interface DashboardData {
  todaySessions: Array<{ id: string; playerName: string; teamName?: string; checkedInAt: string; completedAt?: string; completionPct: number; hasHealthFlag: boolean }>
  unconfirmedHealth: Array<{ id: string; playerName: string; bodyPart: string; reportType: string; painLevel?: number }>
  activeInjuries: number
  totalPlayers: number
  sessionsTodayCount: number
  sessionsWeekCount: number
  teamsActive: Array<{ id: string; name: string; age_group?: string; color: string; phase?: { phase_type: string; name: string } }>
}

export default function CoachDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionModal, setSessionModal] = useState<SessionDetail | null>(null)
  const [loadingSession, setLoadingSession] = useState(false)

  async function openSession(sessionId: string) {
    setLoadingSession(true)
    setSessionModal(null)
    const res = await fetch(`/api/coach/session-detail?sessionId=${sessionId}`)
    const d = await res.json()
    setSessionModal(d)
    setLoadingSession(false)
  }

  useEffect(() => {
    fetch('/api/coach/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 1000 }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>Dashboard</h1>
        <p style={{ color: 'var(--text-muted)' }}>{today}</p>
      </div>

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { value: data?.sessionsTodayCount ?? 0, label: 'Checked in today' },
          { value: data?.sessionsWeekCount ?? 0, label: 'Sessions this week' },
          { value: data?.activeInjuries ?? 0, label: 'Active injuries', alert: (data?.activeInjuries ?? 0) > 0 },
          { value: data?.unconfirmedHealth?.length ?? 0, label: 'Pending health reports', alert: (data?.unconfirmedHealth?.length ?? 0) > 0 },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ borderColor: s.alert ? 'rgba(248,113,113,0.4)' : 'var(--court-border)' }}>
            <div className="stat-value" style={{ color: s.alert ? '#f87171' : 'var(--volt)' }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Today's check-ins */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today's Check-Ins</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{data?.sessionsTodayCount ?? 0} players</span>
          </div>
          {!data?.todaySessions?.length
            ? <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No check-ins yet.</p>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 320, overflowY: 'auto' }}>
                {data.todaySessions.map(s => (
                  <div key={s.id} onClick={() => openSession(s.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.375rem', borderBottom: '1px solid var(--court-border)', cursor: 'pointer', borderRadius: 6, transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--carolina-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: s.hasHealthFlag ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: s.hasHealthFlag ? '#f87171' : 'var(--volt)', flexShrink: 0 }}>
                      {s.playerName.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {s.playerName}
                        {s.hasHealthFlag && <span style={{ fontSize: '0.65rem', color: '#f87171' }}>⚠ health flag</span>}
                      </div>
                      {s.teamName && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.teamName}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {s.completedAt
                        ? <span className="tag tag-volt">Done</span>
                        : <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{s.completionPct}%</span>}
                      <span style={{ fontSize: '0.7rem', color: 'var(--carolina-dark)' }}>→</span>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Pending health reports */}
        <div className="card" style={{ padding: '1.25rem', borderColor: data?.unconfirmedHealth?.length ? 'rgba(248,113,113,0.3)' : 'var(--court-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: data?.unconfirmedHealth?.length ? '#f87171' : undefined }}>
              Pending Health Reports
            </h2>
            <Link href="/coach/health" style={{ fontSize: '0.8rem', color: 'var(--volt)', textDecoration: 'none' }}>View all →</Link>
          </div>
          {!data?.unconfirmedHealth?.length
            ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem', color: 'var(--text-muted)', gap: '0.5rem' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{ fontSize: '0.85rem' }}>No pending reports</span>
              </div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {data.unconfirmedHealth.map(r => (
                  <Link key={r.id} href="/coach/health" style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem', borderRadius: 8, background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)' }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(248,113,113,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#f87171', flexShrink: 0 }}>
                        {r.playerName.charAt(0)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{r.playerName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#f87171' }}>{r.bodyPart} · {r.reportType === 'major_injury' ? 'Injury' : 'Pain'}{r.painLevel ? ` · ${r.painLevel}/10` : ''}</div>
                      </div>
                      <span className="tag tag-danger">Review</span>
                    </div>
                  </Link>
                ))}
              </div>
          }
        </div>
      </div>

      {/* Active teams with phases */}
      {data?.teamsActive && data.teamsActive.length > 0 && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Teams</h2>
            <Link href="/coach/teams" style={{ fontSize: '0.8rem', color: 'var(--volt)', textDecoration: 'none' }}>Manage →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
            {data.teamsActive.map(team => {
              const phase = team.phase
              const phaseConfig = phase ? PHASE_CONFIG[phase.phase_type as PhaseType] : null
              return (
                <Link key={team.id} href={`/coach/schedule?team=${team.id}`} style={{ textDecoration: 'none' }}>
                  <div className="card-raised" style={{ padding: '0.875rem', borderLeft: `3px solid ${team.color}`, cursor: 'pointer' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{team.name}</div>
                    {team.age_group && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>{team.age_group}</div>}
                    {phaseConfig
                      ? <span style={{ fontSize: '0.7rem', color: phaseConfig.color, background: `${phaseConfig.color}20`, padding: '0.15rem 0.5rem', borderRadius: 4, fontWeight: 600 }}>{phaseConfig.label}</span>
                      : <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No phase set</span>
                    }
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ── SESSION DETAIL MODAL ── */}
      {(loadingSession || sessionModal) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem 1rem', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) { setSessionModal(null) } }}>
          <div className="card" style={{ width: '100%', maxWidth: 580, padding: '1.75rem', margin: 'auto' }}>

            {loadingSession && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading session…</div>
            )}

            {sessionModal && !loadingSession && (() => {
              const { session, exercises, stats, topLifts } = sessionModal
              const checkedIn = new Date(session.checkedInAt)
              const timeIn = checkedIn.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
              const timeOut = session.completedAt ? new Date(session.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null

              return (
                <>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                    <div>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', marginBottom: '0.2rem' }}>{session.playerName}</h2>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {timeIn}{timeOut ? ` → ${timeOut}` : ' · In progress'}
                        {session.durationMin && <span style={{ marginLeft: '0.5rem', color: 'var(--carolina-dark)', fontWeight: 600 }}>({session.durationMin} min)</span>}
                      </div>
                    </div>
                    <button onClick={() => setSessionModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>✕</button>
                  </div>

                  {/* Debug — remove once working */}
                  <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '0.625rem', marginBottom: '1rem', fontSize: '0.7rem', fontFamily: 'monospace', color: '#92400e', wordBreak: 'break-all' }}>
                    sessionId={session.id} · exercises={exercises.length} · sets={stats.totalSetsCompleted} · weight={stats.totalWeightMoved} · api={(sessionModal as Record<string,unknown>)._debug as string}
                    {exercises.length === 0 && ' · NO EXERCISES FOUND'}
                  </div>

                  {/* Summary stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.625rem', marginBottom: '1.25rem' }}>
                    {[
                      { label: 'Total Weight', value: stats.totalWeightMoved > 0 ? `${stats.totalWeightMoved.toLocaleString()} lbs` : '—' },
                      { label: 'Sets Completed', value: String(stats.totalSetsCompleted) },
                      { label: 'Exercises', value: String(stats.exercisesHit) },
                    ].map(s => (
                      <div key={s.label} style={{ background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem', color: 'var(--carolina)', lineHeight: 1 }}>{s.value}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginTop: '0.25rem' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Top lifts */}
                  {topLifts.length > 0 && (
                    <div style={{ marginBottom: '1.25rem' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--carolina-deep)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: '0.5rem' }}>Top Lifts</div>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {topLifts.slice(0, 4).map(l => (
                          <div key={l.name} style={{ background: 'var(--white)', border: '1.5px solid var(--gray-border)', borderRadius: 8, padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                            <span style={{ fontWeight: 600 }}>{l.name}</span>
                            <span style={{ color: 'var(--carolina)', fontFamily: 'var(--font-display)', fontWeight: 700, marginLeft: '0.4rem' }}>{l.heaviest} lbs</span>
                            {l.repsAtHeaviest && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}> × {l.repsAtHeaviest}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Exercise breakdown in order logged */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--carolina-deep)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: '0.625rem' }}>
                      Workout Log <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-muted)' }}>(in order completed)</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 320, overflowY: 'auto' }}>
                      {exercises.map((ex, i) => {
                        const completedSets = ex.sets.filter(s => s.completed)
                        const heaviest = ex.logsWeight ? Math.max(...completedSets.map(s => s.weightLbs ?? 0)) : 0
                        return (
                          <div key={ex.exerciseId} style={{ border: '1.5px solid var(--gray-border)', borderRadius: 8, overflow: 'hidden' }}>
                            <div style={{ background: 'var(--carolina-light)', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--carolina)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.75rem', color: '#fff', flexShrink: 0 }}>{i + 1}</div>
                              <div style={{ flex: 1, fontWeight: 600, fontSize: '0.88rem' }}>{ex.name}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ex.category}</div>
                              {heaviest > 0 && <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.88rem', color: 'var(--carolina)' }}>{heaviest} lbs max</div>}
                            </div>
                            <div style={{ padding: '0.4rem 0.75rem', display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                              {ex.sets.map((set, si) => (
                                <div key={si} style={{ background: set.completed ? 'rgba(22,163,74,0.08)' : 'rgba(239,68,68,0.05)', border: `1px solid ${set.completed ? 'rgba(22,163,74,0.25)' : 'rgba(239,68,68,0.2)'}`, borderRadius: 6, padding: '0.2rem 0.5rem', fontSize: '0.75rem', color: set.completed ? 'var(--success)' : 'var(--danger)', fontWeight: 500 }}>
                                  Set {set.setNumber}: {set.weightLbs ? `${set.weightLbs}lbs × ` : ''}{set.repsCompleted ?? '—'} reps
                                </div>
                              ))}
                              {ex.sets.length === 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No sets logged</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
