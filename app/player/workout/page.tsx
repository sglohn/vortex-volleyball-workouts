'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PHASE_CONFIG, PhaseType } from '@/lib/types'

interface SetLog { id?: string; set_number: number; reps_completed?: number; weight_lbs?: number; velocity_ms?: number; completed: boolean }
interface Exercise {
  id: string; name: string; default_reps?: string; coaching_notes?: string
  demo_url?: string; demo_image_url?: string
  logs_weight: boolean; logs_velocity: boolean
  customReps?: string; customNotes?: string; skipped: boolean
  setLogs: SetLog[]
  recommendation?: { weight: number; percent: number; label: string; phaseNote: string; best1RM: number }
}
interface Block { id: string; block_label: string; sets: number; exercises: Exercise[] }
interface WorkoutData { id: string; name: string; description?: string; warmup_notes?: string; blocks: Block[] }

type WorkoutView = 'blocks' | 'active_block'

export default function PlayerWorkoutPage() {
  const router = useRouter()
  const [session, setSession] = useState<{ sessionId: string; playerName: string; templateId?: string; checkedInAt?: string; teamMode?: boolean; teamModeUrl?: string } | null>(null)
  const [workout, setWorkout] = useState<WorkoutData | null>(null)
  const [phase, setPhase] = useState<{ phase_type: string; name: string; description?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<WorkoutView>('blocks')
  const [activeBlockIdx, setActiveBlockIdx] = useState<number>(0)
  // Superset tracking: which set we're on, which exercise within the set
  const [currentSet, setCurrentSet] = useState(1)
  const [currentExIdx, setCurrentExIdx] = useState(0)
  const [editingSet, setEditingSet] = useState(false)
  const [weightInput, setWeightInput] = useState('')
  const [repsInput, setRepsInput] = useState('')
  const [velocityInput, setVelocityInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [finished, setFinished] = useState(false)
  const [demoEx, setDemoEx] = useState<Exercise | null>(null)
  const [showPhaseInfo, setShowPhaseInfo] = useState(false)
  const [startTimes, setStartTimes] = useState<Record<string, string>>({})

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
          setWorkout({ id: data.workout.id, name: data.workout.title, description: data.workout.description, warmup_notes: undefined, blocks: [{ id: 'legacy', block_label: 'Workout', sets: 3, exercises: data.workout.exercises.map((ex: Record<string, unknown>) => ({ ...ex, logs_weight: true, logs_velocity: false, skipped: false, setLogs: ex.setLogs })) }] })
        }
        setPhase(data.phase)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  const phaseConfig = phase ? PHASE_CONFIG[phase.phase_type as PhaseType] : null

  // Block completion helpers
  function blockCompletedSets(block: Block): number {
    return block.exercises.reduce((sum, ex) => sum + ex.setLogs.filter(l => l.completed).length, 0)
  }
  function blockTotalSets(block: Block): number {
    return block.exercises.filter(e => !e.skipped).length * block.sets
  }
  function isBlockComplete(block: Block): boolean {
    return blockCompletedSets(block) >= blockTotalSets(block)
  }

  const totalSets = workout?.blocks.reduce((sum, b) => sum + blockTotalSets(b), 0) ?? 0
  const completedSets = workout?.blocks.reduce((sum, b) => sum + blockCompletedSets(b), 0) ?? 0
  const allBlocksDone = workout?.blocks.every(b => isBlockComplete(b)) ?? false

  function startBlock(idx: number) {
    const block = workout!.blocks[idx]
    setActiveBlockIdx(idx)
    // Find the next incomplete set/exercise to resume
    let resumeSet = 1, resumeEx = 0
    outer: for (let s = 1; s <= block.sets; s++) {
      for (let e = 0; e < block.exercises.length; e++) {
        const log = block.exercises[e].setLogs[s - 1]
        if (!log?.completed) { resumeSet = s; resumeEx = e; break outer }
      }
    }
    setCurrentSet(resumeSet)
    setCurrentExIdx(resumeEx)
    setView('active_block')
    if (!startTimes[block.block_label]) {
      setStartTimes(prev => ({ ...prev, [block.block_label]: new Date().toISOString() }))
    }
    openEditForCurrent(block, resumeEx, resumeSet)
  }

  function openEditForCurrent(block: Block, exIdx: number, setNum: number) {
    const ex = block.exercises[exIdx]
    if (!ex) return
    const log = ex.setLogs[setNum - 1]
    setWeightInput(log?.weight_lbs?.toString() ?? '')
    setRepsInput(log?.reps_completed?.toString() ?? ex.customReps ?? ex.default_reps ?? '')
    setVelocityInput(log?.velocity_ms?.toString() ?? '')
    setEditingSet(true)
  }

  const saveSet = useCallback(async (completed: boolean) => {
    if (!workout || !session) return
    setSaving(true)
    const block = workout.blocks[activeBlockIdx]
    const ex = block.exercises[currentExIdx]

    const res = await fetch('/api/sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.sessionId,
        exerciseId: ex.id,
        setNumber: currentSet,
        weightLbs: weightInput ? parseFloat(weightInput) : null,
        repsCompleted: repsInput ? parseInt(repsInput) : null,
        velocityMs: velocityInput ? parseFloat(velocityInput) : null,
        completed,
      }),
    })
    const data = await res.json()

    // Update local state
    setWorkout(prev => {
      if (!prev) return prev
      const updated = { ...prev, blocks: prev.blocks.map((b, bi) => {
        if (bi !== activeBlockIdx) return b
        return { ...b, exercises: b.exercises.map((e, ei) => {
          if (ei !== currentExIdx) return e
          const logs = [...e.setLogs]
          logs[currentSet - 1] = {
            ...logs[currentSet - 1],
            set_number: currentSet,
            weight_lbs: weightInput ? parseFloat(weightInput) : undefined,
            reps_completed: repsInput ? parseInt(repsInput) : undefined,
            velocity_ms: velocityInput ? parseFloat(velocityInput) : undefined,
            completed,
            id: data.id,
          }
          return { ...e, setLogs: logs, recommendation: data.recommendation ? { ...data.recommendation, best1RM: data.newOneRepMax } : e.recommendation }
        })}
      })}
      return updated
    })

    if (!completed) { setSaving(false); return }

    // Advance superset — next exercise in this set, or next set
    const block2 = workout.blocks[activeBlockIdx]
    const activeExercises = block2.exercises.filter(e => !e.skipped)
    const nextExIdx = currentExIdx + 1

    if (nextExIdx < activeExercises.length) {
      // Move to next exercise in this set
      const nextRealIdx = block2.exercises.findIndex((e, i) => !e.skipped && block2.exercises.filter((e2, i2) => !e2.skipped && i2 <= i).length === nextExIdx + 1)
      const actualNext = block2.exercises.findIndex((e, i) => {
        const nonSkipped = block2.exercises.filter(e2 => !e2.skipped)
        return nonSkipped[nextExIdx] === e
      })
      setCurrentExIdx(actualNext >= 0 ? actualNext : nextExIdx)
      setWeightInput('')
      setRepsInput(block2.exercises[actualNext >= 0 ? actualNext : nextExIdx]?.customReps ?? block2.exercises[actualNext >= 0 ? actualNext : nextExIdx]?.default_reps ?? '')
      setVelocityInput('')
    } else if (currentSet < block2.sets) {
      // Move to next set, first exercise
      const firstNonSkipped = block2.exercises.findIndex(e => !e.skipped)
      setCurrentSet(s => s + 1)
      setCurrentExIdx(firstNonSkipped >= 0 ? firstNonSkipped : 0)
      setWeightInput('')
      setRepsInput(block2.exercises[firstNonSkipped >= 0 ? firstNonSkipped : 0]?.customReps ?? block2.exercises[firstNonSkipped >= 0 ? firstNonSkipped : 0]?.default_reps ?? '')
      setVelocityInput('')
    } else {
      // Block complete
      setEditingSet(false)
      setView('blocks')
    }

    setSaving(false)
  }, [workout, session, activeBlockIdx, currentExIdx, currentSet, weightInput, repsInput, velocityInput])

  async function handleFinish() {
    if (!session) return
    await fetch('/api/checkin', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: session.sessionId }) })

    const completedSets = workout?.blocks.reduce((sum, b) => sum + b.exercises.reduce((s, e) => s + e.setLogs.filter(l => l.completed).length, 0), 0) ?? 0
    const totalSets = workout?.blocks.reduce((sum, b) => sum + b.exercises.filter(e => !e.skipped).length * b.sets, 0) ?? 0
    const totalWeight = workout?.blocks.reduce((sum, b) =>
      sum + b.exercises.reduce((s, e) =>
        s + e.setLogs.filter(l => l.completed && l.weight_lbs).reduce((ws, l) => ws + (l.weight_lbs! * (l.reps_completed ?? 1)), 0), 0), 0) ?? 0
    const durationMin = Math.round((Date.now() - new Date(session.checkedInAt ?? Date.now()).getTime()) / 60000)
    const completionData = { name: session.playerName, totalWeight: Math.round(totalWeight), durationMin, completedSets, totalSets }

    const stored = localStorage.getItem('vx_session')
    const s = stored ? JSON.parse(stored) : {}
    if (s.teamMode && s.teamModeUrl) {
      localStorage.removeItem('vx_session')
      sessionStorage.setItem('vx_team_return', JSON.stringify(completionData))
      router.push(s.teamModeUrl)
      return
    }
    localStorage.removeItem('vx_session')
    setFinished(true)
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
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--carolina-light)', border: '2px solid var(--carolina)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="pulse">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--carolina)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: 'var(--black)', marginBottom: '0.5rem' }}>WORKOUT DONE</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Great work, {session?.playerName}!</p>
      </div>
      <button className="btn-black" onClick={() => router.push('/')} style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}>Sign Out</button>
    </div>
  )

  // ---- ACTIVE BLOCK VIEW ----
  if (view === 'active_block' && workout) {
    const block = workout.blocks[activeBlockIdx]
    const activeExercises = block.exercises.filter(e => !e.skipped)
    const ex = activeExercises[currentExIdx] ?? block.exercises[currentExIdx]
    if (!ex) { setView('blocks'); return null }

    const totalSteps = block.sets * activeExercises.length
    const completedSteps = block.exercises.reduce((sum, e) => sum + e.setLogs.filter(l => l.completed).length, 0)
    const blockProgress = totalSteps > 0 ? completedSteps / totalSteps : 0

    return (
      <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
        {/* Block header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <button onClick={() => setView('blocks')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem', padding: '0.25rem' }}>←</button>
          <div style={{ background: 'var(--volt)', color: '#0a0f0d', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {block.block_label.charAt(0)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem' }}>Block {block.block_label}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Set {currentSet} of {block.sets} · Exercise {currentExIdx + 1} of {activeExercises.length}</div>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--volt)', fontSize: '1.1rem' }}>{completedSteps}/{totalSteps}</div>
        </div>
        <div className="progress-bar" style={{ marginBottom: '1.25rem' }}><div className="progress-fill" style={{ width: `${blockProgress * 100}%` }} /></div>

        {/* Superset order indicator */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
          {Array.from({ length: block.sets }, (_, si) =>
            activeExercises.map((e, ei) => {
              const isThis = si + 1 === currentSet && ei === currentExIdx
              const isDone = e.setLogs[si]?.completed
              return (
                <div key={`${si}-${ei}`} style={{ minWidth: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0, background: isDone ? 'rgba(74,222,128,0.2)' : isThis ? 'var(--volt)' : 'var(--court-raised)', color: isDone ? 'var(--volt)' : isThis ? '#0a0f0d' : 'var(--text-muted)', border: isThis ? 'none' : '1px solid var(--court-border)' }}>
                  {isDone ? '✓' : `${si + 1}${String.fromCharCode(65 + ei)}`}
                </div>
              )
            })
          )}
        </div>

        {/* Current exercise card */}
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 800 }}>{ex.name}</h2>
                {(ex.demo_url || ex.demo_image_url) && (
                  <button onClick={() => setDemoEx(ex)} style={{ background: 'none', border: 'none', color: 'var(--volt)', cursor: 'pointer', padding: '0 0.25rem' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
                  </button>
                )}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Set {currentSet} · {ex.customReps ?? ex.default_reps ?? '—'} reps
              </div>
              {(ex.customNotes || ex.coaching_notes) && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem', fontStyle: 'italic' }}>
                  💬 {ex.customNotes || ex.coaching_notes}
                </div>
              )}
            </div>
            {ex.recommendation && ex.recommendation.best1RM > 0 && (
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.75rem' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--carolina)', fontSize: '1.25rem' }}>{ex.recommendation.weight} lbs</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{ex.recommendation.percent}% · suggested</div>
              </div>
            )}
            {ex.recommendation && ex.recommendation.best1RM === 0 && ex.logs_weight && (
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.75rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 100 }}>
                Log first set to get recommendations
              </div>
            )}
          </div>

          {ex.recommendation?.label && ex.recommendation.best1RM > 0 && phaseConfig && (
            <div style={{ background: `${phaseConfig.color}10`, border: `1px solid ${phaseConfig.color}25`, borderRadius: 8, padding: '0.5rem 0.875rem', marginBottom: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: phaseConfig.color, flexShrink: 0 }} />
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{ex.recommendation.label}</div>
            </div>
          )}

          {/* Input fields */}
          <div style={{ display: 'grid', gridTemplateColumns: ex.logs_weight && ex.logs_velocity ? '1fr 1fr 1fr' : ex.logs_weight ? '1fr 1fr' : '1fr', gap: '0.625rem', marginBottom: '1rem' }}>
            {ex.logs_weight && (
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>Weight (lbs)</label>
                <input className="input" type="number" inputMode="decimal" placeholder={ex.recommendation?.best1RM ? String(ex.recommendation.weight) : '0'} value={weightInput} onChange={e => setWeightInput(e.target.value)}
                  style={{ fontSize: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, padding: '0.75rem' }} autoFocus />
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>Reps</label>
              <input className="input" type="number" inputMode="numeric" placeholder={ex.customReps ?? ex.default_reps ?? '—'} value={repsInput} onChange={e => setRepsInput(e.target.value)}
                style={{ fontSize: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, padding: '0.75rem' }} />
            </div>
            {ex.logs_velocity && (
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>Velocity (m/s)</label>
                <input className="input" type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={velocityInput} onChange={e => setVelocityInput(e.target.value)}
                  style={{ fontSize: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, padding: '0.75rem', borderColor: '#60a5fa40' }} />
              </div>
            )}
          </div>

          <button className="btn-volt" onClick={() => saveSet(true)} disabled={saving}
            style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', letterSpacing: '0.05em' }}>
            {saving ? 'Saving…' : currentExIdx < activeExercises.length - 1 ? `Done → ${activeExercises[currentExIdx + 1]?.name}` : currentSet < block.sets ? `Done → Set ${currentSet + 1}` : 'Complete Block ✓'}
          </button>
        </div>

        {/* Previous sets for this exercise */}
        {ex.setLogs.filter(l => l.completed).length > 0 && (
          <div className="card" style={{ padding: '0.875rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Previous sets today</div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {ex.setLogs.filter(l => l.completed).map((log, i) => (
                <div key={i} style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 6, padding: '0.3rem 0.625rem', fontSize: '0.8rem', color: 'var(--volt)' }}>
                  Set {log.set_number}: {log.weight_lbs ? `${log.weight_lbs} lbs × ` : ''}{log.reps_completed} reps
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---- BLOCK SELECTION VIEW ----
  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
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
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${totalSets > 0 ? completedSets / totalSets * 100 : 0}%` }} /></div>
      </div>

      {/* Phase banner */}
      {phaseConfig && (
        <div onClick={() => setShowPhaseInfo(!showPhaseInfo)} style={{ background: `${phaseConfig.color}12`, border: `1px solid ${phaseConfig.color}35`, borderRadius: 10, padding: '0.625rem 0.875rem', marginBottom: '1rem', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.65rem', color: phaseConfig.color, background: `${phaseConfig.color}25`, padding: '0.15rem 0.5rem', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{phaseConfig.label}</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{phase?.name}</span>
            </div>
            <span style={{ color: phaseConfig.color, fontSize: '0.8rem' }}>{showPhaseInfo ? '▲' : '▼'}</span>
          </div>
          {showPhaseInfo && (
            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: `1px solid ${phaseConfig.color}25` }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{phaseConfig.playerMessage}</p>
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

      {/* Block cards */}
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        Choose any block to start. Complete each block fully before moving to the next.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {workout.blocks.map((block, idx) => {
          const done = isBlockComplete(block)
          const completed = blockCompletedSets(block)
          const total = blockTotalSets(block)
          const pct = total > 0 ? completed / total : 0
          const inProgress = completed > 0 && !done

          return (
            <button key={block.id} onClick={() => !done && startBlock(idx)}
              style={{ background: done ? 'rgba(74,222,128,0.06)' : 'var(--court-surface)', border: `1px solid ${done ? 'var(--volt)' : inProgress ? 'rgba(74,222,128,0.4)' : 'var(--court-border)'}`, borderRadius: 12, padding: '1rem', cursor: done ? 'default' : 'pointer', textAlign: 'left', transition: 'all 0.15s', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ background: done ? 'var(--volt)' : 'var(--court-raised)', color: done ? '#0a0f0d' : 'var(--volt)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {done ? '✓' : block.block_label.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem' }}>Block {block.block_label}</span>
                    <span style={{ fontSize: '0.8rem', color: done ? 'var(--volt)' : 'var(--text-muted)' }}>{completed}/{total}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                    {block.sets} sets × {block.exercises.filter(e => !e.skipped).map(e => e.name).join(' + ')}
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct * 100}%` }} /></div>
                </div>
                {!done && <div style={{ color: 'var(--volt)', fontSize: '1.2rem', flexShrink: 0 }}>→</div>}
              </div>
            </button>
          )
        })}
      </div>

      {allBlocksDone && (
        <button className="btn-volt" onClick={handleFinish} style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}>
          Finish Workout ✓
        </button>
      )}

      {/* Demo modal */}
      {demoEx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '1.5rem' }}
          onClick={() => setDemoEx(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 480, padding: '1.5rem', borderRadius: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>{demoEx.name}</h3>
              <button onClick={() => setDemoEx(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            {demoEx.demo_image_url && <img src={demoEx.demo_image_url} alt={demoEx.name} style={{ width: '100%', borderRadius: 8, marginBottom: '1rem', objectFit: 'cover', maxHeight: 240 }} />}
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
