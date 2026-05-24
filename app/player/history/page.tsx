'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface SessionSummary {
  id: string
  checkedInAt: string
  completedAt?: string
  workoutName: string
  totalSets: number
  completedSets: number
  duration?: number
  exercises: Array<{ name: string; bestWeight?: number; reps?: number }>
}

export default function PlayerHistoryPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [resuming, setResuming] = useState(false)
  const [playerId, setPlayerId] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('vx_session')
    if (!stored) { router.push('/'); return }
    const s = JSON.parse(stored)
    setPlayerId(s.playerId)
    fetch(`/api/player/history?playerId=${s.playerId}`)
      .then(r => r.json())
      .then(d => { setSessions(d.sessions ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [router])

  async function resumeSession(sessionId: string) {
    const stored = localStorage.getItem('vx_session')
    if (!stored) return
    setResuming(true)
    const s = JSON.parse(stored)
    s.sessionId = sessionId
    s.isResumed = true
    localStorage.setItem('vx_session', JSON.stringify(s))
    router.push('/player/workout')
  }

  const today = new Date().toISOString().split('T')[0]
  const todaySession = sessions.find(s => s.checkedInAt.startsWith(today))
  const pastSessions = sessions.filter(s => !s.checkedInAt.startsWith(today))

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading history…</div>

  const SessionCard = ({ s, isToday }: { s: SessionSummary; isToday?: boolean }) => {
    const isComplete = !!s.completedAt
    const pct = s.totalSets > 0 ? Math.round(s.completedSets / s.totalSets * 100) : 0
    const isOpen = expanded === s.id
    const date = new Date(s.checkedInAt)

    return (
      <div className="card" style={{ marginBottom: '0.625rem', overflow: 'hidden', borderColor: isToday ? 'rgba(74,222,128,0.4)' : isComplete ? 'var(--court-border)' : 'rgba(250,204,21,0.3)' }}>
        <div onClick={() => setExpanded(isOpen ? null : s.id)} style={{ padding: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          {/* Status icon */}
          <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isComplete ? 'rgba(74,222,128,0.15)' : 'rgba(250,204,21,0.1)', border: `2px solid ${isComplete ? 'var(--volt)' : '#facc15'}` }}>
            {isComplete
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--volt)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            }
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.2rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, marginRight: '0.5rem' }}>
                {isToday ? '📅 Today — ' : ''}{s.workoutName}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <div className="progress-bar" style={{ flex: 1, height: 3 }}>
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <span style={{ fontSize: '0.75rem', color: isComplete ? 'var(--volt)' : '#facc15', fontWeight: 600, flexShrink: 0 }}>
                {isComplete ? `${pct}% · ${s.duration ? `${s.duration}min` : 'Done'}` : `${pct}% · In progress`}
              </span>
            </div>
          </div>

          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</div>
        </div>

        {/* Expanded detail */}
        {isOpen && (
          <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--court-border)' }}>
            <div style={{ paddingTop: '0.875rem', marginBottom: '0.875rem' }}>
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Check-in</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
                {s.completedAt && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Finished</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {new Date(s.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                )}
                {s.duration && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duration</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--volt)' }}>{s.duration} min</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sets</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-primary)' }}>{s.completedSets}/{s.totalSets}</div>
                </div>
              </div>

              {/* Exercise summary */}
              {s.exercises.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {s.exercises.map((ex, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '0.3rem 0', borderBottom: '1px solid var(--court-border)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{ex.name}</span>
                      {ex.bestWeight
                        ? <span style={{ color: 'var(--volt)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>{ex.bestWeight} lbs × {ex.reps}</span>
                        : <span style={{ color: 'var(--text-muted)' }}>Logged</span>
                      }
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Resume / restart buttons */}
            {isToday && !isComplete && (
              <button onClick={() => resumeSession(s.id)} disabled={resuming} className="btn-volt" style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem' }}>
                {resuming ? 'Loading…' : 'Resume this workout →'}
              </button>
            )}
            {isToday && isComplete && (
              <button onClick={() => resumeSession(s.id)} disabled={resuming} className="btn-ghost" style={{ width: '100%', padding: '0.625rem', fontSize: '0.82rem' }}>
                Something went wrong — restart today's session
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }} className="fade-up">
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>WORKOUT HISTORY</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{sessions.length} session{sessions.length !== 1 ? 's' : ''} this season</p>
      </div>

      {sessions.length === 0 && (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>No workouts yet.</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Your completed sessions will appear here.</p>
        </div>
      )}

      {todaySession && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--volt)', marginBottom: '0.5rem' }}>Today</h2>
          <SessionCard s={todaySession} isToday />
        </div>
      )}

      {pastSessions.length > 0 && (
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Previous Sessions</h2>
          {pastSessions.map(s => <SessionCard key={s.id} s={s} />)}
        </div>
      )}
    </div>
  )
}
