'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PHASE_CONFIG, PhaseType } from '@/lib/types'

interface SetLog { id?: string; set_number: number; reps_completed?: number; weight_lbs?: number; velocity_ms?: number; completed: boolean }
interface Exercise {
  id: string; name: string; default_reps?: string; coaching_notes?: string; demo_url?: string; demo_image_url?: string
  logs_weight: boolean; logs_velocity: boolean; blockExerciseId: string; customReps?: string; customNotes?: string
  skipped: boolean; setLogs: SetLog[]
  recommendation?: { weight: number; percent: number; label: string; phaseNote: string; best1RM: number }
}
interface Block { id: string; block_label: string; sets: number; exercises: Exercise[] }
interface WorkoutData { id: string; name: string; description?: string; warmup_notes?: string; blocks: Block[] }

export default function PlayerWorkoutPage() {
  const router = useRouter()
  const [session, setSession] = useState<{ sessionId: string; playerName: string; templateId?: string } | null>(null)
  const [workout, setWorkout] = useState<WorkoutData | null>(null)
  const [phase, setPhase] = useState<{ phase_type: string; name: string; description?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingSet, setEditingSet] = useState<{ blockIdx: number; exIdx: number; setIdx: number } | null>(null)
  const [weightInput, setWeightInput] = useState('')
  const [repsInput, setRepsInput] = useState('')
  const [velocityInput, setVelocityInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [finished, setFinished] = useState(false)
  const [demoEx, setDemoEx] = useState<Exercise | null>(null)
  const [showPhaseInfo, setShowPhaseInfo] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('vx_session')
    if (!stored) { router.push('/'); return }
    const s = JSON.parse(stored)
    setSession(s)
    const params = new URLSearchParams({ sessionId: s.sessionId })
    if (s.templateId) params.set('templateId', s.templateId)
    fetch(`/api/workout?${params}`)
      .then(r => r.json())
      .then(data => {
        if (data.source === 'template') setWorkout(data.template)
        else if (data.source === 'legacy' && data.workout) {
          // Wrap legacy format in template-like structure
          setWorkout({ id: data.workout.id, name: data.workout.title, description: data.workout.description, blocks: [{ id: 'legacy', block_label: 'Workout', sets: 0, exercises: data.workout.exercises.map((ex: Record<string, unknown>) => ({ ...ex, logs_weight: true, logs_velocity: false, skipped: false, setLogs: ex.setLogs })) }] })
        }
        setPhase(data.phase)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  const phaseConfig = phase ? PHASE_CONFIG[phase.phase_type as PhaseType] : null

  const totalSets = workout?.blocks.reduce((sum, b) => sum + b.exercises.filter(e => !e.skipped).reduce((s, e) => s + b.sets, 0), 0) ?? 0
  const completedSets = workout?.blocks.reduce((sum, b) => sum + b.exercises.reduce((s, e) => s + e.setLogs.filter(l => l.completed).length, 0), 0) ?? 0
  const progress = totalSets > 0 ? completedSets / totalSets : 0

  function openEdit(blockIdx: number, exIdx: number, setIdx: number) {
    const ex = workout!.blocks[blockIdx].exercises[exIdx]
    const log = ex.setLogs[setIdx]
    setWeightInput(log.weight_lbs?.toString() ?? '')
    setRepsInput(log.reps_completed?.toString() ?? ex.customReps ?? ex.default_reps ?? '')
    setVelocityInput(log.velocity_ms?.toString() ?? '')
    setEditingSet({ blockIdx, exIdx, setIdx })
  }

  const saveSet = useCallback(async (completed: boolean) => {
    if (!editingSet || !workout || !session) return
    setSaving(true)
    const block = workout.blocks[editingSet.blockIdx]
    const ex = block.exercises[editingSet.exIdx]
    const setNum = editingSet.setIdx + 1

    const res = await fetch('/api/sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.sessionId,
        exerciseId: ex.id,
        setNumber: setNum,
        weightLbs: weightInput ? parseFloat(weightInput) : null,
        repsCompleted: repsInput ? parseInt(repsInput) : null,
        velocityMs: velocityInput ? parseFloat(velocityInput) : null,
        completed,
      }),
    })
    const data = await res.json()

    setWorkout(prev => {
      if (!prev) return prev
      const updated = { ...prev, blocks: [...prev.blocks] }
      const block = { ...updated.blocks[editingSet.blockIdx] }
      const exercises = [...block.exercises]
      const ex = { ...exercises[editingSet.exIdx] }
      const setLogs = [...ex.setLogs]
      setLogs[editingSet.setIdx] = {
        ...setLogs[editingSet.setIdx],
        weight_lbs: weightInput ? parseFloat(weightInput) : undefined,
        reps_completed: repsInput ? parseInt(repsInput) : undefined,
        velocity_ms: velocityInput ? parseFloat(velocityInput) : undefined,
        completed,
        id: data.id,
      }
      if (data.recommendation) ex.recommendation = { ...data.recommendation, best1RM: data.newOneRepMax }
      ex.setLogs = setLogs
      exercises[editingSet.exIdx] = ex
      block.exercises = exercises
      updated.blocks[editingSet.blockIdx] = block
      return updated
    })
    setEditingSet(null)
    setSaving(false)
  }, [editingSet, workout, session, weightInput, repsInput, velocityInput])

  async function handleFinish() {
    if (!session) return
    await fetch('/api/checkin', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: session.sessionId }) })
    setFinished(true)
    localStorage.removeItem('vx_session')
  }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading workout…</div>

  if (!workout) return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>No workout scheduled for today.</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Check back after your coach assigns one.</p>
    </div>
  )

  if (finished) return (
    <div style={{ padding: '3rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }} className="fade-up">
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', border: '2px solid var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="pulse">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--volt)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: 'var(--volt)', marginBottom: '0.5rem' }}>WORKOUT DONE</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Great work, {session?.playerName}!</p>
      </div>
      <button className="btn-volt" onClick={() => router.push('/')} style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}>Sign Out</button>
    </div>
  )

  return (
    <div style={{ padding: '1rem', maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1rem' }} className="fade-up">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.625rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800 }}>{workout.name}</h1>
            {workout.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>{workout.description}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--volt)' }}>{completedSets}/{totalSets}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sets</div>
          </div>
        </div>
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress * 100}%` }} /></div>
      </div>

      {/* Phase banner */}
      {phaseConfig && (
        <div onClick={() => setShowPhaseInfo(!showPhaseInfo)} style={{ background: `${phaseConfig.color}12`, border: `1px solid ${phaseConfig.color}35`, borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.65rem', color: phaseConfig.color, background: `${phaseConfig.color}25`, padding: '0.2rem 0.5rem', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{phaseConfig.label} Phase</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{phase?.name}</span>
            </div>
            <span style={{ color: phaseConfig.color, fontSize: '0.8rem' }}>{showPhaseInfo ? '▲' : '▼'}</span>
          </div>
          {showPhaseInfo && (
            <div style={{ marginTop: '0.625rem', paddingTop: '0.625rem', borderTop: `1px solid ${phaseConfig.color}25` }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{phaseConfig.playerMessage}</p>
              {phase?.description && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem', fontStyle: 'italic' }}>{phase.description}</p>}
            </div>
          )}
        </div>
      )}

      {/* Warmup */}
      {workout.warmup_notes && (
        <div className="card" style={{ padding: '0.875rem', marginBottom: '1rem', borderLeft: '3px solid var(--volt)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--volt)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: '0.3rem' }}>Warmup</div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{workout.warmup_notes}</p>
        </div>
      )}

      {/* Blocks */}
      {workout.blocks.map((block, blockIdx) => (
        <div key={block.id} className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
            <div style={{ background: 'var(--volt)', color: '#0a0f0d', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', width: 28, height: 28, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {block.block_label.charAt(0)}
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem' }}>Block {block.block_label}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{block.sets}×</span>
          </div>

          {block.exercises.map((ex, exIdx) => {
            if (ex.skipped) return (
              <div key={ex.id} style={{ padding: '0.625rem', borderRadius: 8, background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                {ex.name} <span style={{ fontSize: '0.75rem', color: '#f87171' }}>(modified for you)</span>
              </div>
            )

            const reps = ex.customReps || ex.default_reps || ''
            const notes = ex.customNotes || ex.coaching_notes || ''
            const allDone = ex.setLogs.length === block.sets && ex.setLogs.every(s => s.completed)

            return (
              <div key={ex.id} style={{ marginBottom: '0.875rem', paddingBottom: '0.875rem', borderBottom: exIdx < block.exercises.length - 1 ? '1px solid var(--court-border)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{ex.name}</span>
                      {allDone && <span className="tag tag-volt" style={{ fontSize: '0.65rem' }}>✓</span>}
                      {(ex.demo_url || ex.demo_image_url) && (
                        <button onClick={() => setDemoEx(ex)} style={{ background: 'none', border: 'none', color: 'var(--volt)', cursor: 'pointer', padding: '0 0.25rem', lineHeight: 1 }} title="Show demo">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{block.sets} sets × {reps} reps</div>
                    {notes && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem', fontStyle: 'italic' }}>💬 {notes}</div>}
                  </div>
                  {ex.recommendation && ex.recommendation.best1RM > 0 && (
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.5rem' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--volt)', fontSize: '1rem' }}>{ex.recommendation.weight} lbs</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{ex.recommendation.percent}% · suggested</div>
                    </div>
                  )}
                </div>

                {/* Sets */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {Array.from({ length: block.sets }, (_, i) => {
                    const log = ex.setLogs[i] || { set_number: i + 1, completed: false }
                    return (
                      <div key={i} className={`set-row ${log.completed ? 'completed' : ''}`} onClick={() => openEdit(blockIdx, exIdx, i)} style={{ cursor: 'pointer', gridTemplateColumns: '28px 3rem 1fr 1fr' }}>
                        <div className={`check-circle ${log.completed ? 'done' : ''}`} style={{ width: 24, height: 24 }}>
                          {log.completed && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0f0d" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>SET {i + 1}</div>
                        <div style={{ fontSize: '0.85rem', color: log.weight_lbs ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {log.weight_lbs ? `${log.weight_lbs} lbs` : ex.logs_weight ? '— lbs' : '—'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                          {log.reps_completed ?? reps} reps
                          {log.velocity_ms ? <span style={{ color: '#60a5fa', marginLeft: '0.4rem' }}>{log.velocity_ms} m/s</span> : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {progress >= 0.5 && (
        <button className="btn-volt" onClick={handleFinish} style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', marginBottom: '1rem' }}>
          Finish Workout
        </button>
      )}

      {/* Set edit modal */}
      {editingSet && workout && (() => {
        const block = workout.blocks[editingSet.blockIdx]
        const ex = block.exercises[editingSet.exIdx]
        const setNum = editingSet.setIdx + 1
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
            onClick={e => { if (e.target === e.currentTarget) setEditingSet(null) }}>
            <div className="card" style={{ width: '100%', maxWidth: 480, padding: '1.5rem', borderRadius: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem' }}>{ex.name} — Set {setNum}</h3>
                  {ex.recommendation && ex.recommendation.best1RM > 0 && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Suggested: <strong style={{ color: 'var(--volt)' }}>{ex.recommendation.weight} lbs</strong>
                      <span style={{ marginLeft: '0.4rem' }}>({ex.recommendation.percent}% · {phaseConfig?.label ?? ''} phase)</span>
                    </p>
                  )}
                </div>
                <button onClick={() => setEditingSet(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
              </div>

              {ex.recommendation?.label && ex.recommendation.best1RM > 0 && (
                <div style={{ background: `${phaseConfig?.color ?? 'var(--volt)'}12`, border: `1px solid ${phaseConfig?.color ?? 'var(--volt)'}25`, borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: '0.875rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {ex.recommendation.label}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: ex.logs_weight && ex.logs_velocity ? '1fr 1fr 1fr' : ex.logs_weight ? '1fr 1fr' : '1fr', gap: '0.625rem', marginBottom: '1rem' }}>
                {ex.logs_weight && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Weight (lbs)</label>
                    <input className="input" type="number" placeholder="0" value={weightInput} onChange={e => setWeightInput(e.target.value)} style={{ fontSize: '1.2rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700 }} />
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Reps</label>
                  <input className="input" type="number" placeholder={ex.customReps ?? ex.default_reps ?? '—'} value={repsInput} onChange={e => setRepsInput(e.target.value)} style={{ fontSize: '1.2rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700 }} />
                </div>
                {ex.logs_velocity && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Velocity (m/s)</label>
                    <input className="input" type="number" step="0.01" placeholder="0.00" value={velocityInput} onChange={e => setVelocityInput(e.target.value)} style={{ fontSize: '1.2rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, borderColor: '#60a5fa40' }} />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn-ghost" onClick={() => saveSet(false)} disabled={saving} style={{ flex: 1, padding: '0.75rem', fontSize: '0.9rem' }}>Save only</button>
                <button className="btn-volt" onClick={() => saveSet(true)} disabled={saving} style={{ flex: 1, padding: '0.75rem', fontSize: '0.9rem' }}>{saving ? 'Saving…' : '✓ Mark done'}</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Exercise demo modal */}
      {demoEx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '1.5rem' }}
          onClick={() => setDemoEx(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 480, padding: '1.5rem', borderRadius: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>{demoEx.name}</h3>
              <button onClick={() => setDemoEx(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            {demoEx.demo_image_url && (
              <img src={demoEx.demo_image_url} alt={demoEx.name} style={{ width: '100%', borderRadius: 8, marginBottom: '1rem', objectFit: 'cover', maxHeight: 240 }} />
            )}
            {demoEx.demo_url && (
              <a href={demoEx.demo_url} target="_blank" rel="noopener noreferrer" className="btn-volt" style={{ display: 'block', padding: '0.75rem', textAlign: 'center', textDecoration: 'none', marginBottom: demoEx.coaching_notes ? '1rem' : 0, fontSize: '0.9rem' }}>
                ▶ Watch Demo Video
              </a>
            )}
            {demoEx.coaching_notes && (
              <div style={{ background: 'var(--court-raised)', borderRadius: 8, padding: '0.875rem', marginTop: '0.75rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--volt)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: '0.4rem' }}>Coaching Cues</div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{demoEx.coaching_notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
