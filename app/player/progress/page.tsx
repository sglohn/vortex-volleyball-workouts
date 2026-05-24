'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface ExerciseProgress {
  exerciseId: string; exerciseName: string
  history: Array<{ date: string; oneRepMax: number; weight: number; reps: number }>
  trend: 'up'|'down'|'flat'; current: number; change: number
}
interface MeasurementProgress {
  key: string; label: string; history: Array<{ date: string; value: number }>; trend: 'up'|'down'|'flat'
}

const TREND_COLOR = { up: 'var(--success)', down: 'var(--danger)', flat: 'var(--text-muted)' }
const TREND_ICON = { up: '↑', down: '↓', flat: '→' }

export default function PlayerProgressPage() {
  const router = useRouter()
  const [exerciseProgress, setExerciseProgress] = useState<ExerciseProgress[]>([])
  const [measurementProgress, setMeasurementProgress] = useState<MeasurementProgress[]>([])
  const [sessionCount, setSessionCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeEx, setActiveEx] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('vx_session')
    if (!stored) { router.push('/'); return }
    const s = JSON.parse(stored)
    fetch(`/api/player/progress?playerId=${s.playerId}`)
      .then(r => r.json())
      .then(d => {
        setExerciseProgress(d.exerciseProgress ?? [])
        setMeasurementProgress(d.measurementProgress ?? [])
        setSessionCount(d.sessionCount ?? 0)
        if (d.exerciseProgress?.length) setActiveEx(d.exerciseProgress[0].exerciseId)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading progress…</div>

  const selectedEx = exerciseProgress.find(e => e.exerciseId === activeEx)

  return (
    <div style={{ padding: '1rem', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }} className="fade-up">
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800 }}>MY PROGRESS</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{sessionCount} workouts completed</p>
      </div>

      {exerciseProgress.length === 0 && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', marginBottom: '1.5rem' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>No workout data yet.</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Complete some workouts to see your strength progress here.</p>
        </div>
      )}

      {/* Strength summary */}
      {exerciseProgress.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.625rem', marginBottom: '1.25rem' }}>
            {exerciseProgress.map(ex => (
              <div key={ex.exerciseId} onClick={() => setActiveEx(ex.exerciseId)}
                className="stat-card"
                style={{ cursor: 'pointer', borderColor: activeEx === ex.exerciseId ? 'var(--volt)' : 'var(--court-border)', background: activeEx === ex.exerciseId ? 'rgba(74,222,128,0.06)' : 'var(--court-surface)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ex.exerciseName}</div>
                <div className="stat-value">{ex.current} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>lbs</span></div>
                <div style={{ fontSize: '0.72rem', color: TREND_COLOR[ex.trend], marginTop: '0.2rem' }}>
                  {TREND_ICON[ex.trend]} {ex.trend === 'flat' ? 'Holding steady' : `${ex.change > 0 ? '+' : ''}${ex.change} lbs`}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Est. 1RM</div>
              </div>
            ))}
          </div>

          {selectedEx && selectedEx.history.length > 1 && (
            <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {selectedEx.exerciseName} — Strength Trend
              </h2>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={selectedEx.history} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(74,222,128,0.08)" />
                  <XAxis dataKey="date" tick={{ fill: '#6b7c6e', fontSize: 11 }} tickFormatter={d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                  <YAxis tick={{ fill: '#6b7c6e', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'var(--court-raised)', border: '1px solid var(--court-border)', borderRadius: 8, fontFamily: 'var(--font-body)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                    formatter={(v: number) => [`${v} lbs`, 'Est. 1RM']}
                    labelFormatter={l => new Date(l).toLocaleDateString()} />
                  <Line type="monotone" dataKey="oneRepMax" stroke="#4ade80" strokeWidth={2.5} dot={{ fill: '#4ade80', r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* Measurement progress */}
      {measurementProgress.filter(m => m.history.length > 0).length > 0 && (
        <div className="card" style={{ padding: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Athletic Measurements</h2>
          {measurementProgress.filter(m => m.history.length > 0).map(m => {
            const latest = m.history[0]
            const first = m.history[m.history.length - 1]
            const diff = latest && first ? +(latest.value - first.value).toFixed(1) : 0
            return (
              <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--court-border)' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{m.label}</div>
                  {m.history.length > 1 && diff !== 0 && (
                    <div style={{ fontSize: '0.72rem', color: diff > 0 ? 'var(--success)' : 'var(--danger)', marginTop: '0.15rem' }}>
                      {diff > 0 ? '+' : ''}{diff}" since first measured
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--volt)' }}>
                  {latest?.value ?? '—'}"
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
