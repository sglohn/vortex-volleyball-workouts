'use client'
import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'

interface RosterPlayer {
  id: string
  name: string
  jerseyNumber?: string
  checkedIn: boolean
  completed: boolean
  sessionId: string | null
  stats: { pct: number; completedSets: number; totalSets: number; totalWeightLbs: number; durationMin: number | null } | null
}

interface TeamData {
  team: { id: string; name: string; age_group?: string; color: string }
  roster: RosterPlayer[]
  workoutName: string | null
  templateId: string | null
  checkedInCount: number
  completedCount: number
}

type Screen = 'main' | 'pin' | 'workout'

interface WorkoutBlock {
  id: string
  block_label: string
  sets: number
  exercises: WorkoutExercise[]
}

interface WorkoutExercise {
  id: string
  name: string
  logs_weight: boolean
  default_reps?: string
  customReps?: string
  recommendation?: { weight: number; percent: number; label: string; best1RM: number } | null
  setLogs: Array<{ set_number: number; weight_lbs?: number; reps_completed?: number; completed: boolean }>
}

interface WorkoutData {
  id: string
  name: string
  blocks: WorkoutBlock[]
}

export default function TeamSessionPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = use(params)
  const router = useRouter()
  const [data, setData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [screen, setScreen] = useState<Screen>('main')
  const [selected, setSelected] = useState<RosterPlayer | null>(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [checkingIn, setCheckingIn] = useState(false)

  // Workout state
  const [workout, setWorkout] = useState<WorkoutData | null>(null)
  const [sessionInfo, setSessionInfo] = useState<{ sessionId: string; templateId?: string } | null>(null)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [activeExIdx, setActiveExIdx] = useState(0)
  const [activeSetNum, setActiveSetNum] = useState(1)
  const [weightInput, setWeightInput] = useState('')
  const [repsInput, setRepsInput] = useState('')
  const [savingSet, setSavingSet] = useState(false)

  // Flash message after returning from a set
  const [flashName, setFlashName] = useState<string | null>(null)

  const loadRoster = useCallback(async () => {
    const res = await fetch(`/api/team?teamId=${teamId}`)
    const d = await res.json()
    setData(d)
    setLoading(false)
  }, [teamId])

  useEffect(() => { loadRoster() }, [loadRoster])

  // Poll roster every 15s
  useEffect(() => {
    const interval = setInterval(loadRoster, 15000)
    return () => clearInterval(interval)
  }, [loadRoster])

  // Sort roster: checked-in (not complete) first, then completed, then not started
  function sortedRoster(roster: RosterPlayer[]): RosterPlayer[] {
    return [...roster].sort((a, b) => {
      // completed → 2, checked-in in-progress → 0, not checked in → 1
      const rank = (p: RosterPlayer) => p.completed ? 2 : p.checkedIn ? 0 : 1
      const ra = rank(a), rb = rank(b)
      if (ra !== rb) return ra - rb
      return a.name.localeCompare(b.name)
    })
  }

  function selectPlayer(player: RosterPlayer) {
    if (player.completed) return
    setSelected(player)
    setPin('')
    setPinError('')
    if (player.checkedIn && player.sessionId) {
      // Already checked in — go straight to workout
      loadWorkout(player, player.sessionId, data?.templateId ?? null)
    } else {
      setScreen('pin')
    }
  }

  function handleKey(k: string) {
    setPinError('')
    if (k === '←') { setPin(p => p.slice(0, -1)); return }
    if (pin.length >= 4) return
    setPin(p => p + k)
  }

  async function handleCheckin() {
    if (!selected || pin.length !== 4) return
    setCheckingIn(true)
    setPinError('')

    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: selected.id, pin }),
    })
    const d = await res.json()

    if (!res.ok) {
      setPinError(d.error || 'Incorrect PIN')
      setPin('')
      setCheckingIn(false)
      return
    }

    setCheckingIn(false)
    const templateId = d.templateId ?? data?.templateId ?? null
    const updatedPlayer = { ...selected, checkedIn: true, sessionId: d.sessionId }
    setSelected(updatedPlayer)
    loadRoster() // refresh roster so player moves to top
    await loadWorkout(updatedPlayer, d.sessionId, templateId)
  }

  async function loadWorkout(player: RosterPlayer, sessionId: string, templateId: string | null) {
    if (!templateId || !sessionId) {
      alert('No workout scheduled today for this team.')
      setScreen('main')
      return
    }
    const res = await fetch(`/api/workout?sessionId=${sessionId}&templateId=${templateId}`)
    const d = await res.json()
    if (d.source !== 'template' || !d.template) {
      alert('No workout scheduled today for this team.')
      setScreen('main')
      return
    }

    const templateWithLogs: WorkoutData = {
      ...d.template,
      blocks: d.template.blocks.map((block: WorkoutBlock) => ({
        ...block,
        exercises: block.exercises.map((ex: WorkoutExercise) => ({
          ...ex,
          setLogs: Array.from({ length: block.sets }, (_, i) => {
            const existing = (ex.setLogs ?? []).find((l) => l.set_number === i + 1)
            return existing ?? { set_number: i + 1, completed: false }
          })
        }))
      }))
    }

    // Find first incomplete step
    let startBlockId = templateWithLogs.blocks[0]?.id ?? null
    let startEx = 0
    let startSet = 1

    outerLoop: for (const block of templateWithLogs.blocks) {
      for (let si = 0; si < block.sets; si++) {
        for (let ei = 0; ei < block.exercises.length; ei++) {
          if (!block.exercises[ei].setLogs[si]?.completed) {
            startBlockId = block.id; startEx = ei; startSet = si + 1
            break outerLoop
          }
        }
      }
    }

    const startBlock = templateWithLogs.blocks.find(b => b.id === startBlockId)
    setWorkout(templateWithLogs)
    setSessionInfo({ sessionId, templateId: templateId ?? undefined })
    setActiveBlockId(startBlockId)
    setActiveExIdx(startEx)
    setActiveSetNum(startSet)
    setWeightInput('')
    setRepsInput(startBlock?.exercises[startEx]?.customReps ?? startBlock?.exercises[startEx]?.default_reps ?? '')
    setScreen('workout')
  }

  async function saveSet(completed: boolean) {
    if (!sessionInfo || !workout || !activeBlockId) return
    setSavingSet(true)
    const block = workout.blocks.find(b => b.id === activeBlockId)
    if (!block) { setSavingSet(false); return }
    const ex = block.exercises[activeExIdx]
    if (!ex) { setSavingSet(false); return }

    await fetch('/api/sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionInfo.sessionId,
        exerciseId: ex.id,
        setNumber: activeSetNum,
        weightLbs: weightInput ? parseFloat(weightInput) : null,
        repsCompleted: repsInput ? parseInt(repsInput) : null,
        completed,
      }),
    })

    setSavingSet(false)

    if (completed) {
      // Immediately return to main screen so next player can go
      const name = selected?.name.split(' ')[0] ?? null
      setScreen('main')
      setSelected(null)
      setWorkout(null)
      setSessionInfo(null)
      setFlashName(name)
      setTimeout(() => setFlashName(null), 3000)
      loadRoster()
    }
  }

  async function finishWorkout() {
    if (!sessionInfo) return
    await fetch('/api/checkin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionInfo.sessionId }),
    })
    const name = selected?.name.split(' ')[0] ?? null
    setScreen('main')
    setSelected(null)
    setWorkout(null)
    setSessionInfo(null)
    setFlashName(name)
    setTimeout(() => setFlashName(null), 3000)
    loadRoster()
  }

  const keys = ['1','2','3','4','5','6','7','8','9','←','0','✓']

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--page-bg)' }}>
      <div style={{ color: 'var(--text-muted)' }}>Loading roster…</div>
    </div>
  )

  if (!data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--page-bg)' }}>
      <div style={{ color: 'var(--danger)' }}>Team not found</div>
    </div>
  )

  const { team, roster, workoutName, checkedInCount, completedCount } = data
  const sorted = sortedRoster(roster)
  const inProgress = checkedInCount - completedCount

  // ── PIN SCREEN ──
  if (screen === 'pin' && selected) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--page-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', color: 'var(--volt)' }}>
              {selected.jerseyNumber || selected.name.charAt(0).toUpperCase()}
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--black)', marginBottom: '0.25rem' }}>{selected.name}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Enter your PIN to check in</p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
            {[0,1,2,3].map(i => (
              <div key={i} className={`pin-digit ${i < pin.length ? 'filled' : ''}`}>{i < pin.length ? '●' : ''}</div>
            ))}
          </div>

          {pinError && (
            <div style={{ background: 'var(--danger-light)', border: '1.5px solid #fecaca', borderRadius: 8, padding: '0.625rem', marginBottom: '1rem', color: 'var(--danger)', textAlign: 'center', fontSize: '0.9rem' }}>
              {pinError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {keys.map(k => (
              <button key={k} className="pin-key"
                onClick={() => k === '✓' ? handleCheckin() : handleKey(k)}
                style={{ width: '100%', background: k === '✓' ? 'var(--carolina)' : 'var(--white)', color: k === '✓' ? 'var(--white)' : 'var(--black)', opacity: k === '✓' && pin.length !== 4 ? 0.4 : 1 }}
                disabled={checkingIn}>{k}</button>
            ))}
          </div>

          <button onClick={() => { setScreen('main'); setSelected(null); setPin('') }} className="btn-ghost" style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem' }}>
            ← Back to roster
          </button>
        </div>
      </div>
    )
  }

  // ── WORKOUT SCREEN ──
  if (screen === 'workout' && workout && sessionInfo && selected) {
    const block = workout.blocks.find(b => b.id === activeBlockId)
    const ex = block?.exercises[activeExIdx]
    const doneSets = workout.blocks.reduce((sum, b) => sum + b.exercises.reduce((s, e) => s + e.setLogs.filter(l => l.completed).length, 0), 0)
    const totalSets = workout.blocks.reduce((sum, b) => sum + b.exercises.length * b.sets, 0)
    const allDone = doneSets >= totalSets

    return (
      <div style={{ minHeight: '100vh', background: 'var(--black)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => { setScreen('main'); setSelected(null); setWorkout(null); setSessionInfo(null); loadRoster() }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '1.1rem', padding: '0.25rem' }}>←</button>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: '#0a0f0d', flexShrink: 0 }}>
            {selected.jerseyNumber || selected.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--volt)' }}>{selected.name}</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>{workout.name}</div>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--carolina-light)', fontSize: '0.9rem' }}>{doneSets}/{totalSets} sets</div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '1rem', maxWidth: 520, width: '100%', margin: '0 auto' }}>
          {allDone ? (
            <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: 'var(--volt)', marginBottom: '0.5rem' }}>Workout Done!</h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '2rem' }}>Great work, {selected.name.split(' ')[0]}!</p>
              <button className="btn-volt" onClick={finishWorkout} style={{ padding: '0.875rem 2.5rem', fontSize: '1.1rem' }}>✓ Finish & Return to Roster</button>
            </div>
          ) : (
            <>
              {/* Block tabs */}
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {workout.blocks.map(b => {
                  const done = b.exercises.reduce((s, e) => s + e.setLogs.filter(l => l.completed).length, 0)
                  const total = b.exercises.length * b.sets
                  const isActive = b.id === activeBlockId
                  return (
                    <button key={b.id} onClick={() => { setActiveBlockId(b.id); setActiveExIdx(0); setActiveSetNum(1); setWeightInput(''); setRepsInput(b.exercises[0]?.default_reps ?? '') }}
                      style={{ padding: '0.4rem 0.875rem', borderRadius: 8, border: `1.5px solid ${isActive ? 'var(--volt)' : done === total ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.15)'}`, background: isActive ? 'var(--volt)' : 'transparent', color: isActive ? '#0a0f0d' : done === total ? 'var(--volt)' : 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                      {b.block_label} {done === total && '✓'}
                    </button>
                  )
                })}
              </div>

              {block && ex && (
                <div className="card" style={{ padding: '1.25rem' }}>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.2rem' }}>
                      Block {block.block_label} · Set {activeSetNum}/{block.sets} · Ex {activeExIdx + 1}/{block.exercises.length}
                    </div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.35rem' }}>{ex.name}</h2>

                    {ex.recommendation && ex.recommendation.best1RM > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 8, padding: '0.5rem 0.875rem', marginBottom: '0.75rem' }}>
                        <div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--carolina-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Suggested</div>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--carolina)', lineHeight: 1 }}>{ex.recommendation.weight} lbs</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ex.recommendation.percent}% of your best</div>
                        </div>
                        <div style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4, fontStyle: 'italic' }}>{ex.recommendation.label}</div>
                      </div>
                    )}
                  </div>

                  {/* Exercise tabs (superset) */}
                  {block.exercises.length > 1 && (
                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                      {block.exercises.map((e, i) => (
                        <button key={e.id} onClick={() => { setActiveExIdx(i); setWeightInput(''); setRepsInput(e.default_reps ?? '') }}
                          style={{ padding: '0.3rem 0.75rem', borderRadius: 6, border: `1.5px solid ${i === activeExIdx ? 'var(--carolina)' : 'var(--gray-border)'}`, background: i === activeExIdx ? 'var(--carolina-light)' : 'var(--white)', color: i === activeExIdx ? 'var(--carolina-deep)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>{e.name}</button>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: ex.logs_weight ? '1fr 1fr' : '1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                    {ex.logs_weight && (
                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', fontWeight: 600 }}>Weight (lbs)</label>
                        <input className="input" type="number" inputMode="decimal" placeholder="0" value={weightInput} onChange={e => setWeightInput(e.target.value)}
                          style={{ fontSize: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700 }} autoFocus />
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', fontWeight: 600 }}>Reps</label>
                      <input className="input" type="number" inputMode="numeric" placeholder={ex.customReps ?? ex.default_reps ?? '—'} value={repsInput} onChange={e => setRepsInput(e.target.value)}
                        style={{ fontSize: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700 }} />
                    </div>
                  </div>

                  <button className="btn-volt" onClick={() => saveSet(true)} disabled={savingSet}
                    style={{ width: '100%', padding: '0.875rem', fontSize: '1.1rem', letterSpacing: '0.04em' }}>
                    {savingSet ? 'Saving…' : '✓ Log Set & Back to Roster'}
                  </button>

                  {ex.setLogs.filter(l => l.completed).length > 0 && (
                    <div style={{ marginTop: '0.875rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {ex.setLogs.filter(l => l.completed).map((log, i) => (
                        <div key={i} style={{ background: 'var(--carolina-light)', border: '1px solid var(--carolina-border)', borderRadius: 6, padding: '0.25rem 0.625rem', fontSize: '0.78rem', color: 'var(--carolina-deep)', fontWeight: 600 }}>
                          Set {log.set_number}: {log.weight_lbs ? `${log.weight_lbs}lbs × ` : ''}{log.reps_completed}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ── MAIN SCREEN ──
  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ background: 'var(--black)', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--black)" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.08em', color: 'var(--volt)', lineHeight: 1 }}>VORTEX S&C</div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Team Mode</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--white)' }}>{team.name}{team.age_group ? ` · ${team.age_group}` : ''}</div>
          {workoutName && <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)' }}>{workoutName}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--volt)' }}>{checkedInCount}/{roster.length}</div>
          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Checked in</div>
        </div>
      </div>

      {/* Progress strip */}
      <div style={{ height: 4, background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ height: '100%', background: 'var(--carolina)', width: `${roster.length > 0 ? checkedInCount / roster.length * 100 : 0}%`, transition: 'width 0.5s ease' }} />
      </div>

      {/* Flash message */}
      {flashName && (
        <div style={{ background: 'var(--volt)', padding: '0.625rem 1.5rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: '#0a0f0d', letterSpacing: '0.04em' }}>
          ✓ Set logged for {flashName} — next player, tap your name!
        </div>
      )}

      {/* Leaderboard (checked-in players) */}
      {checkedInCount > 0 && (
        <div style={{ padding: '1rem 1.5rem 0.5rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '0.625rem' }}>
            🏆 Leaderboard · {inProgress} in progress · {completedCount} done
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
            {sorted.filter(p => p.checkedIn).map((player, i) => {
              const isDone = player.completed
              return (
                <div key={player.id} style={{
                  background: isDone ? 'rgba(74,222,128,0.08)' : 'var(--carolina-light)',
                  border: `1.5px solid ${isDone ? 'rgba(74,222,128,0.4)' : 'var(--carolina-border)'}`,
                  borderRadius: 10, padding: '0.625rem 0.75rem', position: 'relative',
                }}>
                  {i < 3 && !isDone && (
                    <div style={{ position: 'absolute', top: 6, right: 8, fontSize: '0.8rem' }}>
                      {['🥇','🥈','🥉'][i]}
                    </div>
                  )}
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: isDone ? 'var(--volt)' : 'var(--carolina-deep)', marginBottom: '0.2rem', paddingRight: '1rem' }}>
                    {isDone ? '✓ ' : ''}{player.name.split(' ')[0]}
                  </div>
                  {player.stats && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {player.stats.totalWeightLbs > 0 ? `${player.stats.totalWeightLbs.toLocaleString()} lbs` : `${player.stats.completedSets} sets`}
                      {' · '}{player.stats.pct}%
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Divider */}
      {checkedInCount > 0 && roster.length > checkedInCount && (
        <div style={{ padding: '0.5rem 1.5rem 0.25rem' }}>
          <div style={{ height: 1, background: 'var(--gray-border)' }} />
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginTop: '0.625rem' }}>
            Not yet checked in
          </div>
        </div>
      )}

      {/* Roster — tap to check in */}
      <div style={{ flex: 1, padding: '0.75rem 1.5rem 1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', alignContent: 'start' }}>
          {sorted.map(player => {
            const isCheckedIn = player.checkedIn
            const isDone = player.completed
            if (isCheckedIn) return null // already shown above in leaderboard, skip here

            return (
              <button
                key={player.id}
                onClick={() => selectPlayer(player)}
                style={{
                  background: 'var(--white)',
                  border: '2px solid var(--gray-border)',
                  borderRadius: 12,
                  padding: '1rem 0.875rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s',
                  opacity: 0.55,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '0.55'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.625rem', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--volt)' }}>
                  {player.jerseyNumber || player.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--black)', lineHeight: 1.3, marginBottom: '0.25rem' }}>
                  {player.name}
                </div>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Tap to check in
                </div>
              </button>
            )
          })}
        </div>

        {/* If everyone is checked in */}
        {roster.every(p => p.checkedIn) && (
          <div style={{ textAlign: 'center', paddingTop: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Everyone is checked in! 🎉
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '0.875rem 1.5rem', background: 'var(--white)', borderTop: '1.5px solid var(--gray-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {completedCount} completed · {inProgress} in progress · {roster.length - checkedInCount} not started
        </div>
        <a href="/coach/dashboard" style={{ fontSize: '0.8rem', color: 'var(--carolina-dark)', textDecoration: 'none', fontWeight: 500 }}>Coach view →</a>
      </div>
    </div>
  )
}
