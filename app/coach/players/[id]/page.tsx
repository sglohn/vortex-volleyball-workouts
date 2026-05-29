'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { inchesToFeetInches, painLevelColor, painLevelLabel } from '@/lib/fitness'
import FeetInchesInput from '@/components/FeetInchesInput'
import MeasurementHistoryModal from '@/components/MeasurementHistoryModal'

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
  const [historyModal, setHistoryModal] = useState<{ key: string; label: string } | null>(null)
  const [showMeasForm, setShowMeasForm] = useState(false)
  const [savingMeas, setSavingMeas] = useState(false)
  const [msg, setMsg] = useState('')
  const [overrides, setOverrides] = useState<Array<{ id: string; override_date: string; template_id: string; notes?: string }>>([])
  const [skips, setSkips] = useState<Array<{ id: string; exercise_id: string; reason?: string; ends_on?: string; exercise_library?: { name: string } }>>([])
  const [allTemplates, setAllTemplates] = useState<Array<{ id: string; name: string }>>([])
  const [allExercises, setAllExercises] = useState<Array<{ id: string; name: string; category: string }>>([])
  const [showOverrides, setShowOverrides] = useState(false)
  const [newOverride, setNewOverride] = useState({ date: '', templateId: '', notes: '' })
  const [newSkip, setNewSkip] = useState({ exerciseId: '', replacementId: '', reason: '', skipType: 'avoid', endsOn: '' })
  const [replacementSearch, setReplacementSearch] = useState('')
  const [skipSearch, setSkipSearch] = useState('')

  useEffect(() => {
    fetch(`/api/coach/players?playerId=${id}`).then(r => r.json()).then(d => { setData(d); setLoading(false) })
    fetch(`/api/coach/overrides?playerId=${id}`).then(r => r.json()).then(d => {
      setOverrides(d.overrides ?? [])
      setSkips(d.skips ?? [])
      setAllTemplates(d.templates ?? [])
    })
    fetch('/api/coach/exercises').then(r => r.json()).then(d => setAllExercises(d.exercises ?? []))
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
    <>
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
            : activeHealth.map(r => {
                const rid = r.id as string
                const bodyPart = r.body_part as string
                const reportType = r.report_type as string
                const painLevel = r.pain_level != null ? Number(r.pain_level) : null
                const description = r.description as string | undefined
                return (
                  <div key={rid} style={{ background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '0.75rem', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f87171' }}>{bodyPart}</span>
                      <span className={`tag ${reportType === 'major_injury' ? 'tag-danger' : 'tag-warn'}`}>{reportType === 'major_injury' ? 'Injury' : 'Pain'}</span>
                    </div>
                    {painLevel != null && <div style={{ fontSize: '0.8rem', color: painLevelColor(painLevel) }}>{painLevel}/10 — {painLevelLabel(painLevel)}</div>}
                    {description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{description}</div>}
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                      <button onClick={() => updateHealth(rid, 'monitoring', '')} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', borderColor: '#facc15', color: '#facc15' }}>Monitoring</button>
                      <button onClick={() => updateHealth(rid, 'resolved', '')} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', borderColor: 'var(--volt)', color: 'var(--volt)' }}>Resolved</button>
                    </div>
                  </div>
                )
              })
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
                <div key={f.key} style={{ marginBottom: '0.625rem' }}>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', fontWeight: 600 }}>{f.label}</label>
                  <FeetInchesInput
                    value={measForm[f.key] ?? ''}
                    onChange={val => setMeasForm(p => ({ ...p, [f.key]: val }))}
                  />
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
                  <div key={f.key} onClick={() => setHistoryModal({ key: f.key, label: f.label })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid var(--gray-border)', cursor: 'pointer' }}>
                    <div>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{f.label}</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--carolina)', marginLeft: '0.4rem', fontWeight: 500 }}>history →</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--carolina)', fontSize: '0.95rem' }}>
                      {val ? inchesToFeetInches(val) : '—'}
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

      {/* ── WORKOUT ADJUSTMENTS ── */}
      <div className="card" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showOverrides ? '1.25rem' : 0 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem' }}>Workout Adjustments</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.15rem' }}>
              {skips.length > 0 && `${skips.length} exercise skip${skips.length > 1 ? 's' : ''} active · `}
              {overrides.length > 0 && `${overrides.length} date override${overrides.length > 1 ? 's' : ''}`}
              {skips.length === 0 && overrides.length === 0 && 'No adjustments — player follows team workout'}
            </p>
          </div>
          <button onClick={() => setShowOverrides(o => !o)} className="btn-ghost" style={{ padding: '0.4rem 0.875rem', fontSize: '0.82rem' }}>
            {showOverrides ? 'Collapse' : 'Manage'}
          </button>
        </div>

        {showOverrides && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Exercise Skips */}
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--carolina-deep)', marginBottom: '0.625rem' }}>
                Skip Exercises (Injury / Limitation)
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                These exercises will be automatically removed from this player's workout. Other players are unaffected.
              </p>

              {skips.map(skip => {
                const skipAny = skip as Record<string, unknown>
                const repLib = skipAny.replacement_library as { name: string } | undefined
                const skipTypeLabel = skipAny.skip_type === 'rehab' ? 'Rehab/Modified' : 'Avoid Area'
                return (
                  <div key={skip.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.625rem 0.875rem', background: 'var(--danger-light)', border: '1px solid #fecaca', borderRadius: 8, marginBottom: '0.4rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{skip.exercise_library?.name ?? skip.exercise_id}</div>
                        <span style={{ fontSize: '0.65rem', background: skipAny.skip_type === 'rehab' ? 'rgba(139,92,246,0.1)' : 'rgba(239,68,68,0.1)', color: skipAny.skip_type === 'rehab' ? '#7c3aed' : 'var(--danger)', border: `1px solid ${skipAny.skip_type === 'rehab' ? '#c4b5fd' : '#fecaca'}`, borderRadius: 4, padding: '0.1rem 0.4rem', fontWeight: 600 }}>{skipTypeLabel}</span>
                      </div>
                      {skip.reason && <div style={{ fontSize: '0.72rem', color: 'var(--danger)', fontStyle: 'italic', marginBottom: '0.2rem' }}>{skip.reason}</div>}
                      {repLib && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                          Replaced with: {repLib.name}
                        </div>
                      )}
                      {!repLib && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No replacement — exercise removed</div>}
                      {skip.ends_on && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Expires {new Date(skip.ends_on + 'T12:00:00').toLocaleDateString()}</div>}
                    </div>
                    <button onClick={async () => {
                      await fetch('/api/coach/overrides', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'player_skip', id: skip.id }) })
                      setSkips(prev => prev.filter(s => s.id !== skip.id))
                    }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', flexShrink: 0 }}>Remove</button>
                  </div>
                )
              })}

              <div style={{ border: '1.5px solid var(--gray-border)', borderRadius: 10, padding: '1rem', marginTop: '0.75rem', background: 'rgba(255,255,255,0.6)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--carolina-deep)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.875rem' }}>Add New Modification</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>

                  {/* Skip type */}
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', fontWeight: 600 }}>Type of modification</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {[['avoid','Avoid Area Entirely','Move to different body part'],['rehab','Rehab / Modified','Different exercise for same area']] .map(([val, label, desc]) => (
                        <button key={val} onClick={() => setNewSkip(p => ({ ...p, skipType: val }))}
                          style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 8, border: `1.5px solid ${newSkip.skipType === val ? (val === 'rehab' ? '#7c3aed' : 'var(--danger)') : 'var(--gray-border)'}`, background: newSkip.skipType === val ? (val === 'rehab' ? 'rgba(139,92,246,0.08)' : 'var(--danger-light)') : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: newSkip.skipType === val ? (val === 'rehab' ? '#7c3aed' : 'var(--danger)') : 'var(--black)' }}>{label}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Exercise to skip */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', fontWeight: 600 }}>Exercise to remove</label>
                    <input className="input" placeholder="Search…" value={skipSearch} onChange={e => setSkipSearch(e.target.value)} style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }} />
                    {skipSearch && !newSkip.exerciseId && (
                      <div style={{ border: '1.5px solid var(--gray-border)', borderRadius: 8, maxHeight: 140, overflowY: 'auto', background: 'var(--white)', marginTop: '0.2rem', position: 'relative', zIndex: 10 }}>
                        {allExercises.filter(e => e.name.toLowerCase().includes(skipSearch.toLowerCase())).map(e => (
                          <button key={e.id} onClick={() => { setNewSkip(p => ({ ...p, exerciseId: e.id })); setSkipSearch(e.name) }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.45rem 0.75rem', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.82rem' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--carolina-light)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {e.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{e.category}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {newSkip.exerciseId && <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.2rem', fontWeight: 600 }}>✓ {skipSearch}</div>}
                  </div>

                  {/* Replacement exercise */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', fontWeight: 600 }}>Replace with <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                    <input className="input" placeholder="Search replacement…" value={replacementSearch} onChange={e => setReplacementSearch(e.target.value)} style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }} />
                    {replacementSearch && !newSkip.replacementId && (
                      <div style={{ border: '1.5px solid var(--gray-border)', borderRadius: 8, maxHeight: 140, overflowY: 'auto', background: 'var(--white)', marginTop: '0.2rem', position: 'relative', zIndex: 10 }}>
                        {allExercises.filter(e => e.name.toLowerCase().includes(replacementSearch.toLowerCase()) && e.id !== newSkip.exerciseId).map(e => (
                          <button key={e.id} onClick={() => { setNewSkip(p => ({ ...p, replacementId: e.id })); setReplacementSearch(e.name) }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.45rem 0.75rem', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.82rem' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--carolina-light)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {e.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{e.category}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {newSkip.replacementId && <div style={{ fontSize: '0.72rem', color: 'var(--success)', marginTop: '0.2rem', fontWeight: 600 }}>✓ {replacementSearch}</div>}
                  </div>

                  {/* Reason */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', fontWeight: 600 }}>Reason</label>
                    <input className="input" placeholder="e.g. Left knee pain" value={newSkip.reason} onChange={e => setNewSkip(p => ({ ...p, reason: e.target.value }))} style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }} />
                  </div>

                  {/* Expiry */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', fontWeight: 600 }}>Auto-expire on <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                    <input type="date" className="input" value={newSkip.endsOn} onChange={e => setNewSkip(p => ({ ...p, endsOn: e.target.value }))} style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }} />
                  </div>

                  <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                    <button className="btn-volt" disabled={!newSkip.exerciseId} onClick={async () => {
                      const res = await fetch('/api/coach/overrides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'player_skip', playerId: id, exerciseId: newSkip.exerciseId, replacementId: newSkip.replacementId || null, skipType: newSkip.skipType, reason: newSkip.reason, endsOn: newSkip.endsOn || null }) })
                      const d = await res.json()
                      if (d.skip) { setSkips(prev => [...prev, d.skip]); setNewSkip({ exerciseId: '', replacementId: '', reason: '', skipType: 'avoid', endsOn: '' }); setSkipSearch(''); setReplacementSearch('') }
                    }} style={{ padding: '0.625rem 1.5rem' }}>Save Modification</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Date Overrides */}
            <div style={{ borderTop: '1.5px solid var(--gray-border)', paddingTop: '1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--carolina-deep)', marginBottom: '0.625rem' }}>
                Date Overrides (Different Workout)
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Give this player a completely different workout template on a specific date. Useful for 2x/week players or returning from injury.
              </p>

              {overrides.map(ov => (
                <div key={ov.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 8, marginBottom: '0.4rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{new Date(ov.override_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{allTemplates.find(t => t.id === ov.template_id)?.name ?? 'Custom template'}</div>
                    {ov.notes && <div style={{ fontSize: '0.7rem', color: 'var(--carolina-dark)', fontStyle: 'italic' }}>{ov.notes}</div>}
                  </div>
                  <button onClick={async () => {
                    await fetch('/api/coach/overrides', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'player_template', id: ov.id }) })
                    setOverrides(prev => prev.filter(o => o.id !== ov.id))
                  }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>Remove</button>
                </div>
              ))}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', fontWeight: 600 }}>Date</label>
                  <input type="date" className="input" value={newOverride.date} onChange={e => setNewOverride(p => ({ ...p, date: e.target.value }))} style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', fontWeight: 600 }}>Template</label>
                  <select className="input" value={newOverride.templateId} onChange={e => setNewOverride(p => ({ ...p, templateId: e.target.value }))} style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}>
                    <option value="">Select template…</option>
                    {allTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1', display: 'flex', gap: '0.5rem' }}>
                  <input className="input" placeholder="Notes (optional)" value={newOverride.notes} onChange={e => setNewOverride(p => ({ ...p, notes: e.target.value }))} style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.85rem' }} />
                  <button className="btn-volt" disabled={!newOverride.date || !newOverride.templateId} onClick={async () => {
                    const res = await fetch('/api/coach/overrides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'player_template', playerId: id, date: newOverride.date, templateId: newOverride.templateId, notes: newOverride.notes }) })
                    const d = await res.json()
                    if (d.override) { setOverrides(prev => [...prev, d.override]); setNewOverride({ date: '', templateId: '', notes: '' }) }
                  }} style={{ padding: '0.5rem 1.25rem', flexShrink: 0 }}>Add Override</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {historyModal && (
        <MeasurementHistoryModal
          playerId={id as string}
          playerName={player?.name ?? ''}
          statKey={historyModal.key}
          statLabel={historyModal.label}
          onClose={() => setHistoryModal(null)}
        />
      )}
    </>
  )
}
