'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { inchesToFeetInches } from '@/lib/fitness'

const MEASUREMENT_FIELDS = [
  { key: 'height_in', label: 'Height' },
  { key: 'wingspan_in', label: 'Wingspan' },
  { key: 'standing_reach_in', label: 'Standing Reach' },
  { key: 'standing_vertical_in', label: 'Standing Vertical' },
  { key: 'approach_vertical_in', label: 'Approach Vertical' },
]

export default function CoachPlayerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [measForm, setMeasForm] = useState<Record<string, string>>({})
  const [savingMeas, setSavingMeas] = useState(false)
  const [measMsg, setMeasMsg] = useState('')
  const [showMeasForm, setShowMeasForm] = useState(false)

  useEffect(() => {
    fetch(`/api/coach/players?playerId=${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [id])

  async function saveMeasurement() {
    setSavingMeas(true)
    const res = await fetch('/api/player/measurements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: id, ...measForm }),
    })
    const d = await res.json()
    if (res.ok) {
      setMeasMsg('Saved!')
      setShowMeasForm(false)
      // Refresh
      fetch(`/api/coach/players?playerId=${id}`).then(r => r.json()).then(setData)
    } else setMeasMsg(d.error)
    setSavingMeas(false)
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>
  if (!data) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Player not found</div>

  const player = data.player as Record<string, string>
  const exercises = (data.exerciseProgress as Array<Record<string, unknown>>) || []
  const measurements = (data.measurements as Array<Record<string, unknown>>) || []
  const sessions = (data.recentSessions as Array<Record<string, unknown>>) || []
  const latestMeas = measurements[0] as Record<string, number | string> | undefined

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <a href="/coach/players" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}>← Players</a>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', border: '2px solid var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--volt)' }}>
          {player.jersey_number || String(player.name).charAt(0)}
        </div>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800 }}>{player.name}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{player.position || 'No position set'}</p>
        </div>
      </div>

      {measMsg && <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', color: 'var(--volt)', fontSize: '0.9rem' }}>{measMsg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Measurements */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Measurements</h2>
            <button className="btn-ghost" onClick={() => setShowMeasForm(!showMeasForm)} style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>
              {showMeasForm ? 'Cancel' : '+ Record'}
            </button>
          </div>

          {showMeasForm && (
            <div style={{ marginBottom: '1rem' }}>
              {MEASUREMENT_FIELDS.map(f => (
                <div key={f.key} style={{ marginBottom: '0.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>{f.label} (inches)</label>
                  <input className="input" type="number" step="0.5" placeholder={latestMeas?.[f.key]?.toString() ?? '0'} value={measForm[f.key] || ''} onChange={e => setMeasForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ padding: '0.4rem 0.75rem', fontSize: '0.9rem' }} />
                </div>
              ))}
              <button className="btn-volt" onClick={saveMeasurement} disabled={savingMeas} style={{ width: '100%', padding: '0.625rem', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                {savingMeas ? 'Saving…' : 'Save Measurements'}
              </button>
            </div>
          )}

          {latestMeas ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {MEASUREMENT_FIELDS.map(f => {
                const val = latestMeas[f.key] as number | undefined
                return (
                  <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--court-border)' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{f.label}</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--volt)' }}>{val ? `${val}"` : '—'}</span>
                  </div>
                )
              })}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Recorded: {new Date(latestMeas.measured_at as string).toLocaleDateString()}
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No measurements recorded yet.</p>
          )}
        </div>

        {/* Recent sessions */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Recent Sessions</h2>
          {sessions.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No sessions yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {sessions.map((s: Record<string, unknown>) => (
                <div key={s.id as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--court-border)' }}>
                  <div style={{ fontSize: '0.85rem' }}>{new Date(s.checked_in_at as string).toLocaleDateString()}</div>
                  {s.completed_at ? (
                    <span className="tag tag-volt">Complete</span>
                  ) : (
                    <span className="tag tag-warn">Partial</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Strength progress charts */}
      {exercises.length > 0 && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.25rem' }}>Strength Progress</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
            {exercises.map((ex: Record<string, unknown>) => {
              const history = ex.history as Array<{ date: string; oneRepMax: number }>
              if (!history?.length) return null
              const trend = ex.trend as string
              const trendColor = trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--danger)' : 'var(--text-muted)'
              return (
                <div key={ex.exerciseId as string}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{ex.exerciseName as string}</div>
                    <div style={{ fontSize: '0.75rem', color: trendColor }}>
                      {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {ex.current as number} lbs 1RM
                    </div>
                  </div>
                  {history.length > 1 ? (
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={history} margin={{ top: 2, right: 2, left: -30, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(74,222,128,0.08)" />
                        <XAxis dataKey="date" tick={{ fill: '#6b7c6e', fontSize: 10 }} tickFormatter={d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                        <YAxis tick={{ fill: '#6b7c6e', fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: 'var(--court-raised)', border: '1px solid var(--court-border)', borderRadius: 8, fontFamily: 'var(--font-body)', color: 'var(--text-primary)', fontSize: '0.8rem' }} formatter={(v: number) => [`${v} lbs`, 'Est. 1RM']} />
                        <Line type="monotone" dataKey="oneRepMax" stroke={trendColor} strokeWidth={2} dot={{ fill: trendColor, r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Need more sessions for trend</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
