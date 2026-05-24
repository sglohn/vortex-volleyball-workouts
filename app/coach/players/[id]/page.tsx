'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { inchesToFeetInches, painLevelColor, painLevelLabel } from '@/lib/fitness'

const MEASUREMENT_FIELDS = [
  { key: 'height_in', label: 'Height', showFt: true },
  { key: 'wingspan_in', label: 'Wingspan', showFt: true },
  { key: 'standing_reach_in', label: 'Standing Reach', showFt: true },
  { key: 'standing_vertical_in', label: 'Standing Vertical', showFt: false },
  { key: 'approach_vertical_in', label: 'Approach Vertical', showFt: false },
]

export default function CoachPlayerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [measForm, setMeasForm] = useState<Record<string, string>>({})
  const [showMeasForm, setShowMeasForm] = useState(false)
  const [savingMeas, setSavingMeas] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch(`/api/coach/players?playerId=${id}`).then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [id])

  async function saveMeasurement() {
    setSavingMeas(true)
    const res = await fetch('/api/player/measurements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId: id, ...measForm }) })
    if (res.ok) { setMsg('Measurements saved!'); setShowMeasForm(false); fetch(`/api/coach/players?playerId=${id}`).then(r => r.json()).then(setData) }
    setSavingMeas(false)
  }

  async function updateHealth(reportId: string, status: string, coachNotes: string) {
    await fetch('/api/player/health', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: reportId, confirmedByCoach: true, status, coachNotes }) })
    fetch(`/api/coach/players?playerId=${id}`).then(r => r.json()).then(setData)
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>
  if (!data) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Player not found</div>

  const player = data.player as Record<string, string>
  const team = data.team as Record<string, string> | null
  const exercises = (data.exerciseProgress as Array<Record<string, unknown>>) ?? []
  const measurements = (data.measurements as Array<Record<string, unknown>>) ?? []
  const healthReports = (data.healthReports as Array<Record<string, unknown>>) ?? []
  const sessions = (data.sessions as Array<Record<string, unknown>>) ?? []
  const latestMeas = measurements[0] as Record<string, number | string> | undefined
  const activeHealth = healthReports.filter(r => r.status === 'active' || r.status === 'monitoring')

  return (
    <div style={{ padding: '2rem', maxWidth: 960 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <a href="/coach/players" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}>← Players</a>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: team?.color ? `${team.color}25` : 'rgba(74,222,128,0.15)', border: `2px solid ${team?.color ?? 'var(--volt)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, color: team?.color ?? 'var(--volt)', flexShrink: 0 }}>
          {player.jersey_number || String(player.name).charAt(0)}
        </div>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800 }}>{player.name}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {team ? <span style={{ color: team.color }}>{team.name}</span> : 'No team assigned'}
            {player.position ? ` · ${player.position}` : ''}
          </p>
        </div>
        {activeHealth.length > 0 && <span className="tag tag-danger" style={{ marginLeft: 'auto' }}>⚠ {activeHealth.length} health flag{activeHealth.length > 1 ? 's' : ''}</span>}
      </div>

      {msg && <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', color: 'var(--volt)', fontSize: '0.9rem' }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Health reports */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', color: activeHealth.length ? '#f87171' : undefined }}>
            Health {activeHealth.length > 0 && <span className="tag tag-danger" style={{ fontSize: '0.65rem' }}>{activeHealth.length}</span>}
          </h2>
          {activeHealth.length === 0
            ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No active health concerns.</p>
            : activeHealth.map(r => (
                <div key={r.id as string} style={{ background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '0.75rem', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f87171' }}>{r.body_part as string}</span>
                    <span className={`tag ${r.report_type === 'major_injury' ? 'tag-danger' : 'tag-warn'}`}>{r.report_type === 'major_injury' ? 'Injury' : 'Pain'}</span>
                  </div>
                  {r.pain_level != null && <div style={{ fontSize: '0.8rem', color: painLevelColor(Number(r.pain_level)) }}>{String(r.pain_level)}/10 — {painLevelLabel(Number(r.pain_level))}</div>}
                  {r.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{r.description as string}</div>}
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                    <button onClick={() => updateHealth(r.id as string, 'monitoring', '')} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', borderColor: '#facc15', color: '#facc15' }}>Monitoring</button>
                    <button onClick={() => updateHealth(r.id as string, 'resolved', '')} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', borderColor: 'var(--volt)', color: 'var(--volt)' }}>Resolved</button>
                  </div>
                </div>
              ))
          }
        </div>

        {/* Measurements */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Measurements</h2>
            <button className="btn-ghost" onClick={() => setShowMeasForm(!showMeasForm)} style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>{showMeasForm ? 'Cancel' : '+ Record'}</button>
          </div>

          {showMeasForm && (
            <div style={{ marginBottom: '1rem' }}>
              {MEASUREMENT_FIELDS.map(f => (
                <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{f.label} (in)</label>
                  <input className="input" type="number" step="0.5" placeholder="0" value={measForm[f.key] ?? ''} onChange={e => setMeasForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ padding: '0.4rem', fontSize: '0.85rem', textAlign: 'center' }} />
                </div>
              ))}
              <button className="btn-volt" onClick={saveMeasurement} disabled={savingMeas} style={{ width: '100%', padding: '0.625rem', marginTop: '0.5rem', fontSize: '0.9rem' }}>{savingMeas ? 'Saving…' : 'Save Measurements'}</button>
            </div>
          )}

          {latestMeas ? (
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Recorded: {new Date(latestMeas.measured_at as string).toLocaleDateString()}</div>
              {MEASUREMENT_FIELDS.map(f => {
                const val = latestMeas[f.key] as number | undefined
                return (
                  <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--court-border)' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{f.label}</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--volt)', fontSize: '0.95rem' }}>
                      {val ? `${val}"${f.showFt ? ` (${inchesToFeetInches(val)})` : ''}` : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No measurements yet.</p>}
        </div>
      </div>

      {/* Recent sessions */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.875rem' }}>Recent Sessions</h2>
        {sessions.length === 0
          ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No sessions yet.</p>
          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {sessions.map((s: Record<string, unknown>) => (
                <div key={s.id as string} style={{ padding: '0.4rem 0.875rem', borderRadius: 6, background: s.completed_at ? 'rgba(74,222,128,0.1)' : 'var(--court-raised)', border: `1px solid ${s.completed_at ? 'var(--volt)' : 'var(--court-border)'}`, fontSize: '0.8rem', color: s.completed_at ? 'var(--volt)' : 'var(--text-secondary)' }}>
                  {new Date(s.checked_in_at as string).toLocaleDateString()}
                </div>
              ))}
            </div>
        }
      </div>

      {/* Strength charts */}
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
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{ex.exerciseName as string}</span>
                    <span style={{ fontSize: '0.8rem', color: trendColor }}>{trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {ex.current as number} lbs</span>
                  </div>
                  {history.length > 1
                    ? <ResponsiveContainer width="100%" height={120}>
                        <LineChart data={history} margin={{ top: 2, right: 2, left: -30, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(74,222,128,0.08)" />
                          <XAxis dataKey="date" tick={{ fill: '#6b7c6e', fontSize: 10 }} tickFormatter={d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                          <YAxis tick={{ fill: '#6b7c6e', fontSize: 10 }} />
                          <Tooltip contentStyle={{ background: 'var(--court-raised)', border: '1px solid var(--court-border)', borderRadius: 8, fontFamily: 'var(--font-body)', color: 'var(--text-primary)', fontSize: '0.8rem' }} formatter={(v: number) => [`${v} lbs`, 'Est. 1RM']} />
                          <Line type="monotone" dataKey="oneRepMax" stroke={trendColor} strokeWidth={2} dot={{ fill: trendColor, r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    : <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Need more sessions for trend</div>
                  }
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
