'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { getTrend } from '@/lib/fitness'

interface ProgressData {
  exerciseProgress: Array<{
    exerciseId: string
    exerciseName: string
    history: Array<{ date: string; oneRepMax: number; weight: number; reps: number }>
    trend: 'up' | 'down' | 'flat'
    current: number
    change: number
  }>
  sessionCount: number
  measurementProgress: Array<{
    key: string
    label: string
    history: Array<{ date: string; value: number }>
    trend: 'up' | 'down' | 'flat'
  }>
}

const TREND_ICON = { up: '↑', down: '↓', flat: '→' }
const TREND_COLOR = { up: 'var(--success)', down: 'var(--danger)', flat: 'var(--text-muted)' }

export default function ProgressPage() {
  const router = useRouter()
  const [data, setData] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeExercise, setActiveExercise] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('vx_session')
    if (!stored) { router.push('/'); return }
    const s = JSON.parse(stored)
    fetch(`/api/player/progress?playerId=${s.playerId}`)
      .then(r => r.json())
      .then(d => {
        setData(d)
        if (d?.exerciseProgress?.length) setActiveExercise(d.exerciseProgress[0].exerciseId)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading progress…</div>

  if (!data || !data.exerciseProgress.length) return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>No workout data yet.</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Complete some workouts to see your progress here.</p>
    </div>
  )

  const activeEx = data.exerciseProgress.find(e => e.exerciseId === activeExercise)

  return (
    <div style={{ padding: '1rem', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }} className="fade-up">
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800 }}>MY PROGRESS</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{data.sessionCount} workouts completed</p>
      </div>

      {/* Strength summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {data.exerciseProgress.map(ex => (
          <div
            key={ex.exerciseId}
            className={`stat-card`}
            onClick={() => setActiveExercise(ex.exerciseId)}
            style={{ cursor: 'pointer', border: activeExercise === ex.exerciseId ? '1px solid var(--volt)' : '1px solid var(--court-border)', background: activeExercise === ex.exerciseId ? 'rgba(74,222,128,0.06)' : 'var(--court-surface)' }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{ex.exerciseName}</div>
            <div className="stat-value">{ex.current} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>lbs</span></div>
            <div style={{ fontSize: '0.75rem', color: TREND_COLOR[ex.trend], marginTop: '0.25rem' }}>
              {TREND_ICON[ex.trend]} {ex.trend === 'flat' ? 'Holding steady' : `${Math.abs(ex.change)} lbs ${ex.trend === 'up' ? 'gained' : 'lost'}`}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Est. 1RM</div>
          </div>
        ))}
      </div>

      {/* Detail chart */}
      {activeEx && activeEx.history.length > 1 && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {activeEx.exerciseName} — 1RM Trend
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={activeEx.history} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(74,222,128,0.08)" />
              <XAxis dataKey="date" tick={{ fill: '#6b7c6e', fontSize: 11 }} tickFormatter={d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
              <YAxis tick={{ fill: '#6b7c6e', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--court-raised)', border: '1px solid var(--court-border)', borderRadius: 8, fontFamily: 'var(--font-body)', color: 'var(--text-primary)' }}
                formatter={(v: number) => [`${v} lbs`, 'Est. 1RM']}
                labelFormatter={l => new Date(l).toLocaleDateString()}
              />
              <Line type="monotone" dataKey="oneRepMax" stroke="#4ade80" strokeWidth={2.5} dot={{ fill: '#4ade80', r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Measurement progress */}
      {data.measurementProgress.filter(m => m.history.length > 1).length > 0 && (
        <div className="card" style={{ padding: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Athletic Measurements
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {data.measurementProgress.filter(m => m.history.length > 0).map(m => {
              const latest = m.history[0]
              const first = m.history[m.history.length - 1]
              const diff = latest && first ? latest.value - first.value : 0
              return (
                <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid var(--court-border)' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{m.label}</div>
                    {m.history.length > 1 && diff !== 0 && (
                      <div style={{ fontSize: '0.75rem', color: diff > 0 ? 'var(--success)' : 'var(--danger)', marginTop: '0.2rem' }}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}" since start
                      </div>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--volt)' }}>
                    {latest?.value ?? '—'}"
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
