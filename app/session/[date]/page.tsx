'use client'
import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'

interface Team { id: string; name: string; age_group?: string; color: string }
interface PlayerRow {
  id: string; name: string; jerseyNumber?: string; teamId: string
  checkedIn: boolean; completed: boolean; sessionId: string | null
  checkedInAt: string | null; totalWeightLbs: number
  setsCompleted: number; totalSets: number; pct: number; avgWeightPerSet: number
}
interface LeaderboardData {
  byWeight: PlayerRow[]; bySets: PlayerRow[]; byPct: PlayerRow[]
}
interface SessionData {
  teams: Team[]; roster: PlayerRow[]
  leaderboard: LeaderboardData; templateByTeam: Record<string, { templateId: string; workoutName: string }>; date: string
}

type View = 'leaderboard' | 'team' | 'player_pin' | 'player_workout'

export default function SessionPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params)
  const router = useRouter()

  const [data, setData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null)
  const [view, setView] = useState<View>('leaderboard')

  // Player check-in flow
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRow | null>(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [checkingIn, setCheckingIn] = useState(false)

  // Player workout state
  const [workout, setWorkout] = useState<{ blocks: Array<{ id: string; block_label: string; sets: number; exercises: Array<{ id: string; name: string; logs_weight: boolean; default_reps?: string; recommendation?: { weight: number; percent: number; label: string; phaseNote: string; best1RM: number } | null; setLogs: Array<{ set_number: number; weight_lbs?: number; reps_completed?: number; completed: boolean }> }> }> } | null>(null)
  const [sessionInfo, setSessionInfo] = useState<{ sessionId: string; playerId: string; playerName: string; templateId?: string } | null>(null)
  const [activeBlock, setActiveBlock] = useState<string | null>(null)
  const [activeExIdx, setActiveExIdx] = useState(0)
  const [activeSetNum, setActiveSetNum] = useState(1)
  const [weightInput, setWeightInput] = useState('')
  const [repsInput, setRepsInput] = useState('')
  const [savingSet, setSavingSet] = useState(false)

  // Get team IDs from URL search params
  const [teamIds, setTeamIds] = useState<string[]>([])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ids = params.get('teams')?.split(',').filter(Boolean) ?? []
    setTeamIds(ids)
  }, [])

  const loadData = useCallback(async () => {
    if (!teamIds.length) return
    const localDate = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
    const res = await fetch(`/api/session?teams=${teamIds.join(',')}&date=${localDate}`)
    const d = await res.json()
    setData(d)
    if (!activeTeamId && d.teams?.length) setActiveTeamId(d.teams[0].id)
    setLoading(false)
  }, [teamIds, activeTeamId])

  useEffect(() => { if (teamIds.length) loadData() }, [teamIds, loadData])

  // Poll every 20s
  useEffect(() => {
    const t = setInterval(loadData, 5000)
    return () => clearInterval(t)
  }, [loadData])

  function selectTeam(teamId: string) {
    setActiveTeamId(teamId)
    setView('team')
  }

  async function selectPlayer(player: PlayerRow) {
    if (!player.checkedIn && player.completed) return
    setSelectedPlayer(player)
    setPin('')
    setPinError('')
    if (player.checkedIn && player.sessionId) {
      // Already checked in — go straight to workout
      await loadWorkout(player)
    } else {
      setView('player_pin')
    }
  }

  async function loadWorkout(player: PlayerRow) {
    const teamData = data?.templateByTeam[player.teamId]
    if (!teamData?.templateId || !player.sessionId) {
      alert(`No workout scheduled today for this team. Please assign one in Coach → Schedule.`)
      return
    }
    // Fetch template structure
    const res = await fetch(`/api/workout?sessionId=${player.sessionId}&templateId=${teamData.templateId}`)
    const d = await res.json()
    if (d.source === 'template' && d.template) {
      // Also fetch existing set logs so player can see what they've already done
      const logsRes = await fetch(`/api/sets?sessionId=${player.sessionId}`)
      const logsData = logsRes.ok ? await logsRes.json() : { logs: [] }
      const existingLogs: Array<{exercise_id: string; set_number: number; weight_lbs?: number; reps_completed?: number; completed: boolean}> = logsData.logs ?? []

      // Merge existing logs into template blocks
      const templateWithLogs = {
        ...d.template,
        blocks: d.template.blocks.map((block: {id: string; block_label: string; sets: number; exercises: Array<{id: string; name: string; logs_weight: boolean; default_reps?: string}>}) => ({
          ...block,
          exercises: block.exercises.map(ex => ({
            ...ex,
            setLogs: Array.from({ length: block.sets }, (_, i) => {
              const existing = existingLogs.find(l => l.exercise_id === ex.id && l.set_number === i + 1)
              return existing ?? { set_number: i + 1, completed: false }
            })
          }))
        }))
      }

      setWorkout(templateWithLogs)
      setSessionInfo({ sessionId: player.sessionId, playerId: player.id, playerName: player.name, templateId: teamData.templateId })
      // Find first incomplete set — superset order: set1-ex1, set1-ex2, set2-ex1, set2-ex2...
      // But respect block order — if they started block C, stay in block C
      let startBlock = templateWithLogs.blocks[0]?.id ?? null
      let startEx = 0
      let startSet = 1
      let found = false

      // First: find the block they've started but not finished
      for (const block of templateWithLogs.blocks) {
        const hasStarted = block.exercises.some((e: {setLogs: Array<{completed: boolean}>}) => e.setLogs.some(l => l.completed))
        const isFinished = block.exercises.every((e: {setLogs: Array<{completed: boolean}>}) => e.setLogs.every(l => l.completed))
        if (hasStarted && !isFinished) {
          startBlock = block.id
          // Find next incomplete step in superset order
          outerLoop: for (let si = 0; si < block.sets; si++) {
            for (let ei = 0; ei < block.exercises.length; ei++) {
              if (!block.exercises[ei].setLogs[si]?.completed) {
                startEx = ei; startSet = si + 1; found = true; break outerLoop
              }
            }
          }
          break
        }
      }

      // If no block started, find first incomplete anywhere
      if (!found) {
        outerLoop2: for (const block of templateWithLogs.blocks) {
          for (let si = 0; si < block.sets; si++) {
            for (let ei = 0; ei < block.exercises.length; ei++) {
              if (!block.exercises[ei].setLogs[si]?.completed) {
                startBlock = block.id; startEx = ei; startSet = si + 1; found = true; break outerLoop2
              }
            }
          }
        }
      }

      setActiveBlock(startBlock); setActiveExIdx(startEx); setActiveSetNum(startSet)
      const startBlockData = templateWithLogs.blocks.find((b: {id: string; exercises: Array<{default_reps?: string}>}) => b.id === startBlock)
      setWeightInput(''); setRepsInput(startBlockData?.exercises[startEx]?.default_reps ?? '')
      setView('player_workout')
    }
  }

  async function handleCheckin() {
    if (!selectedPlayer || pin.length !== 4) return
    setCheckingIn(true); setPinError('')
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: selectedPlayer.id, pin }),
    })
    const d = await res.json()
    if (!res.ok) { setPinError(d.error || 'Incorrect PIN'); setPin(''); setCheckingIn(false); return }
    const updatedPlayer = { ...selectedPlayer, checkedIn: true, sessionId: d.sessionId }
    setSelectedPlayer(updatedPlayer)
    setCheckingIn(false)
    await loadWorkout(updatedPlayer)
    loadData()
  }

  async function saveSet(completed: boolean) {
    if (!sessionInfo || !workout || !activeBlock) return
    setSavingSet(true)
    const block = workout.blocks.find(b => b.id === activeBlock)
    if (!block) { setSavingSet(false); return }
    const ex = block.exercises[activeExIdx]
    if (!ex) { setSavingSet(false); return }

    const res = await fetch('/api/sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionInfo.sessionId, exerciseId: ex.id, setNumber: activeSetNum,
        weightLbs: weightInput ? parseFloat(weightInput) : null,
        repsCompleted: repsInput ? parseInt(repsInput) : null, completed,
      }),
    })

    const result = await res.json()

    if (!res.ok || result.error) {
      alert(`Save failed: ${result.error ?? res.status} | sessionId=${sessionInfo.sessionId} exId=${ex.id}`)
      setSavingSet(false)
      return
    }

    // Update local workout state
    setWorkout(prev => {
      if (!prev) return prev
      return { ...prev, blocks: prev.blocks.map(b => b.id !== activeBlock ? b : {
        ...b, exercises: b.exercises.map((e, ei) => ei !== activeExIdx ? e : {
          ...e, setLogs: e.setLogs.map(l => l.set_number === activeSetNum ? { ...l, weight_lbs: weightInput ? parseFloat(weightInput) : undefined, reps_completed: repsInput ? parseInt(repsInput) : undefined, completed } : l)
        })
      })}
    })

    if (completed) {
      // Refresh data then return to leaderboard so next player can step up
      setSavingSet(false)
      loadData() // fire and forget — don't await, it'll update in background
      setView('leaderboard')
      setSelectedPlayer(null)
      setWorkout(null)
      setSessionInfo(null)
      return
    }
    setSavingSet(false)
  }

  async function finishWorkout() {
    if (!sessionInfo) return
    await fetch('/api/checkin', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionInfo.sessionId }) })
    await loadData()
    setView('leaderboard'); setSelectedPlayer(null); setWorkout(null); setSessionInfo(null)
  }

  const keys = ['1','2','3','4','5','6','7','8','9','←','0','✓']
  // Inject pulse animation once
  if (typeof document !== 'undefined' && !document.getElementById('session-styles')) {
    const style = document.createElement('style')
    style.id = 'session-styles'
    style.textContent = '@keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.4)} }'
    document.head.appendChild(style)
  }

  if (loading || !data) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--page-bg)' }}>
      <div style={{ color: 'var(--text-muted)' }}>Loading session…</div>
    </div>
  )

  const { teams, roster, leaderboard } = data
  const activeTeam = teams.find(t => t.id === activeTeamId)
  const teamRoster = roster.filter(p => p.teamId === activeTeamId)

  // ── PLAYER PIN ──
  if (view === 'player_pin' && selectedPlayer) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--page-bg)', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <button onClick={() => setView('team')} style={{ background: 'none', border: 'none', color: 'var(--carolina-dark)', cursor: 'pointer', marginBottom: '1.5rem', fontSize: '0.85rem', fontWeight: 500 }}>← Back</button>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', color: 'var(--yellow)' }}>
            {selectedPlayer.jerseyNumber || selectedPlayer.name.charAt(0)}
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800 }}>{selectedPlayer.name}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Enter your PIN to check in</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
          {[0,1,2,3].map(i => <div key={i} className={`pin-digit ${i < pin.length ? 'filled' : ''}`}>{i < pin.length ? '●' : ''}</div>)}
        </div>
        {pinError && <div style={{ background: 'var(--danger-light)', border: '1.5px solid #fecaca', borderRadius: 8, padding: '0.625rem', marginBottom: '1rem', color: 'var(--danger)', textAlign: 'center', fontSize: '0.9rem' }}>{pinError}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {keys.map(k => (
            <button key={k} className="pin-key" onClick={() => {
              if (k === '✓') { handleCheckin(); return }
              if (k === '←') { setPin(p => p.slice(0,-1)); return }
              if (pin.length < 4) setPin(p => p + k)
            }} style={{ width: '100%', background: k === '✓' ? 'var(--carolina)' : 'var(--white)', color: k === '✓' ? 'var(--white)' : 'var(--black)', opacity: k === '✓' && pin.length !== 4 ? 0.4 : 1 }} disabled={checkingIn}>{k}</button>
          ))}
        </div>
      </div>
    </div>
  )

  // ── PLAYER WORKOUT ──
  if (view === 'player_workout' && workout && sessionInfo) {
    const block = workout.blocks.find(b => b.id === activeBlock)
    const ex = block?.exercises[activeExIdx]
    const totalSets = workout.blocks.reduce((s, b) => s + b.exercises.length * b.sets, 0)
    const doneSets = workout.blocks.reduce((s, b) => s + b.exercises.reduce((s2, e) => s2 + e.setLogs.filter(l => l.completed).length, 0), 0)
    const allDone = doneSets >= totalSets

    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--page-bg)' }}>
        {/* Header */}
        <div style={{ background: 'var(--black)', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          <button onClick={() => setView('team')} style={{ background: 'none', border: 'none', color: 'var(--yellow)', cursor: 'pointer', fontSize: '1rem' }}>←</button>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--yellow)', letterSpacing: '0.06em' }}>{sessionInfo.playerName}</div>
          <div style={{ flex: 1 }} />
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--carolina-light)', fontSize: '0.9rem' }}>{doneSets}/{totalSets} sets</div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
          {allDone ? (
            <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Workout Done!</h2>
              <button className="btn-black" onClick={finishWorkout} style={{ padding: '0.875rem 2rem', fontSize: '1rem', marginTop: '1.5rem' }}>✓ I'm Done</button>
            </div>
          ) : (
            <>
              {/* Block tabs */}
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {workout.blocks.map(b => {
                  const done = b.exercises.reduce((s, e) => s + e.setLogs.filter(l => l.completed).length, 0)
                  const total = b.exercises.length * b.sets
                  const isActive = b.id === activeBlock
                  return (
                    <button key={b.id} onClick={() => { setActiveBlock(b.id); setActiveExIdx(0); setActiveSetNum(1); setWeightInput(''); setRepsInput(b.exercises[0]?.default_reps ?? '') }}
                      style={{ padding: '0.4rem 0.875rem', borderRadius: 8, border: `1.5px solid ${isActive ? 'var(--carolina)' : done === total ? 'var(--success)' : 'var(--gray-border)'}`, background: isActive ? 'var(--carolina)' : 'var(--white)', color: isActive ? 'var(--white)' : done === total ? 'var(--success)' : 'var(--black)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                      {b.block_label} {done === total && '✓'}
                    </button>
                  )
                })}
              </div>

              {/* Current exercise */}
              {block && ex && (
                <div className="card" style={{ padding: '1.25rem' }}>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.2rem' }}>Block {block.block_label} · Set {activeSetNum}/{block.sets} · Ex {activeExIdx+1}/{block.exercises.length}</div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.35rem' }}>{ex.name}</h2>
                    {ex.recommendation && ex.recommendation.best1RM > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 8, padding: '0.5rem 0.875rem' }}>
                        <div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--carolina-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Suggested weight</div>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--carolina)', lineHeight: 1 }}>{ex.recommendation.weight} lbs</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ex.recommendation.percent}% of your best</div>
                        </div>
                        <div style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4, fontStyle: 'italic' }}>
                          {ex.recommendation.label}
                        </div>
                      </div>
                    )}
                    {ex.recommendation && ex.recommendation.best1RM === 0 && ex.logs_weight && (
                      <div style={{ background: 'var(--yellow-mid)', border: '1px solid var(--yellow-border)', borderRadius: 8, padding: '0.4rem 0.875rem', fontSize: '0.75rem', color: 'var(--black)' }}>
                        No history yet — log this set to start tracking your progress.
                      </div>
                    )}
                  </div>

                  {/* Exercise list in this block */}
                  <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    {block.exercises.map((e, i) => (
                      <button key={e.id} onClick={() => { setActiveExIdx(i); setWeightInput(''); setRepsInput(e.default_reps ?? '') }}
                        style={{ padding: '0.3rem 0.75rem', borderRadius: 6, border: `1.5px solid ${i === activeExIdx ? 'var(--carolina)' : 'var(--gray-border)'}`, background: i === activeExIdx ? 'var(--carolina-light)' : 'var(--white)', color: i === activeExIdx ? 'var(--carolina-deep)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>{e.name}</button>
                    ))}
                  </div>

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
                      <input className="input" type="number" inputMode="numeric" placeholder={ex.default_reps ?? '—'} value={repsInput} onChange={e => setRepsInput(e.target.value)}
                        style={{ fontSize: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700 }} />
                    </div>
                  </div>

                  <button className="btn-volt" onClick={() => saveSet(true)} disabled={savingSet} style={{ width: '100%', padding: '0.875rem', fontSize: '1.1rem', letterSpacing: '0.04em' }}>
                    {savingSet ? 'Saving…' : '✓ Log Set & Return to Board'}
                  </button>


                  {/* Previous sets */}
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

  // ── MAIN LAYOUT ──
  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', background: 'var(--page-bg)' }}>

      {/* ── LEFT SIDEBAR — teams + player roster ── */}
      <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--black)', borderRight: '2px solid rgba(255,255,255,0.08)' }}>
        {/* Logo */}
        <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--black)" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.08em', color: 'var(--yellow)' }}>WEIGHT ROOM</span>
        </div>

        {/* Team tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={() => setView('leaderboard')}
            style={{ flex: 1, padding: '0.5rem', background: view === 'leaderboard' ? 'rgba(251,191,36,0.12)' : 'transparent', border: 'none', borderBottom: view === 'leaderboard' ? '2px solid var(--yellow)' : '2px solid transparent', color: view === 'leaderboard' ? 'var(--yellow)' : 'rgba(255,255,255,0.4)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            🏆 Board
          </button>
          {teams.map(t => (
            <button key={t.id} onClick={() => selectTeam(t.id)}
              style={{ flex: 1, padding: '0.5rem', background: activeTeamId === t.id && view === 'team' ? `${t.color}22` : 'transparent', border: 'none', borderBottom: activeTeamId === t.id && view === 'team' ? `2px solid ${t.color}` : '2px solid transparent', color: activeTeamId === t.id && view === 'team' ? t.color : 'rgba(255,255,255,0.4)', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.name}
            </button>
          ))}
        </div>

        {/* Player list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
          {view === 'leaderboard' && (
            <div style={{ padding: '0.5rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', textAlign: 'center' }}>Select a team to see players</div>
          )}
          {view === 'team' && activeTeam && (
            <>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, padding: '0.25rem 0.5rem 0.5rem' }}>
                {teamRoster.filter(p => p.checkedIn).length}/{teamRoster.length} checked in
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {teamRoster.sort((a, b) => (b.checkedIn ? 1 : 0) - (a.checkedIn ? 1 : 0) || a.name.localeCompare(b.name)).map(p => (
                  <button key={p.id} onClick={() => selectPlayer(p)}
                    style={{ background: p.completed ? `${activeTeam.color}22` : p.checkedIn ? 'rgba(255,255,255,0.06)' : 'transparent', border: `1px solid ${p.completed ? activeTeam.color : p.checkedIn ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}`, borderRadius: 8, padding: '0.5rem 0.625rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left', width: '100%' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: p.checkedIn ? activeTeam.color : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', color: p.checkedIn ? '#fff' : 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                      {p.completed ? '✓' : (p.jerseyNumber || p.name.charAt(0))}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: p.checkedIn ? '#fff' : 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      {p.checkedIn && (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                          {p.pct}% · {p.totalWeightLbs > 0 ? `${p.totalWeightLbs.toLocaleString()} lbs` : `${p.setsCompleted} sets`}
                        </div>
                      )}
                    </div>
                    {p.checkedIn && !p.completed && <div style={{ fontSize: '0.7rem', color: activeTeam.color, fontWeight: 700 }}>→</div>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── MAIN AREA — leaderboard ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: 'var(--white)', borderBottom: '1.5px solid var(--gray-border)', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800 }}>
              Weight Room Leaderboard
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 20, padding: '0.15rem 0.625rem' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', animation: 'pulse-dot 1.5s infinite' }} />
              <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 600 }}>LIVE</span>
            </div>
          </div>
        </div>

        {/* Leaderboard - three columns always visible */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.5rem' }}>
          {roster.filter(p => p.checkedIn).length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '4rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏋️</div>
              <p style={{ fontSize: '1.1rem', fontWeight: 500 }}>No one has checked in yet.</p>
              <p style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>Select a team on the left to get players started.</p>
            </div>
          ) : (() => {
            const active = [...roster].filter(p => p.checkedIn)
            const byWeight  = [...active].sort((a, b) => b.totalWeightLbs - a.totalWeightLbs)

            const boards = [
              { key: 'weight', icon: '⚡', title: 'Most Weight Moved', sub: 'Total lbs lifted this session', data: byWeight,
                value: (p: PlayerRow) => p.totalWeightLbs > 0 ? `${p.totalWeightLbs.toLocaleString()} lbs` : '—',
                bar: (p: PlayerRow) => { const max = byWeight[0]?.totalWeightLbs ?? 1; return max > 0 ? p.totalWeightLbs / max * 100 : 0 },
                accent: 'var(--carolina)' },
              { key: 'avg', icon: '🔥', title: 'Heaviest Average', sub: 'Avg lbs per set logged', data: [...active].sort((a,b) => b.avgWeightPerSet - a.avgWeightPerSet),
                value: (p: PlayerRow) => p.avgWeightPerSet > 0 ? `${p.avgWeightPerSet} lbs` : '—',
                bar: (p: PlayerRow) => { const max = [...active].sort((a,b) => b.avgWeightPerSet - a.avgWeightPerSet)[0]?.avgWeightPerSet ?? 1; return max > 0 ? p.avgWeightPerSet / max * 100 : 0 },
                accent: '#8b5cf6' },
              { key: 'pct', icon: '🎯', title: '% Complete', sub: 'Furthest through the workout', data: [...active].sort((a,b) => b.pct - a.pct || b.setsCompleted - a.setsCompleted),
                value: (p: PlayerRow) => p.totalSets > 0 ? `${p.pct}%` : '—',
                bar: (p: PlayerRow) => p.pct,
                accent: '#f97316' },
            ]

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', alignItems: 'start' }}>
                {boards.map(board => (
                  <div key={board.key} style={{ background: 'var(--white)', border: '1.5px solid var(--gray-border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                    {/* Board header */}
                    <div style={{ padding: '0.75rem 1rem', borderBottom: `3px solid ${board.accent}`, background: `${board.accent}08` }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--black)', letterSpacing: '0.03em' }}>
                        {board.icon} {board.title}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{board.sub}</div>
                    </div>

                    {/* Rows */}
                    <div style={{ padding: '0.5rem' }}>
                      {board.data.map((p, i) => {
                        const team = teams.find(t => t.id === p.teamId)
                        const medals = ['🥇','🥈','🥉']
                        return (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.5rem', borderRadius: 8, marginBottom: '0.25rem', background: i === 0 ? `${board.accent}08` : 'transparent', borderLeft: i < 3 ? `3px solid ${i === 0 ? board.accent : i === 1 ? board.accent+'80' : board.accent+'40'}` : '3px solid transparent' }}>
                            {/* Rank */}
                            <div style={{ width: 24, textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: i < 3 ? '1rem' : '0.8rem', color: i < 3 ? 'var(--black)' : 'var(--text-muted)', flexShrink: 0 }}>
                              {i < 3 ? medals[i] : `${i+1}`}
                            </div>

                            {/* Avatar */}
                            <div style={{ width: 30, height: 30, borderRadius: '50%', background: team?.color ?? board.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', color: '#fff', flexShrink: 0 }}>
                              {p.completed ? '✓' : (p.jerseyNumber || p.name.charAt(0))}
                            </div>

                            {/* Name + bar */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '0.2rem' }}>{p.name}</div>
                              <div style={{ height: 4, background: 'var(--gray-border)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${board.bar(p)}%`, background: board.accent, borderRadius: 2, transition: 'width 0.6s ease' }} />
                              </div>
                            </div>

                            {/* Value */}
                            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', color: i === 0 ? board.accent : 'var(--black)', flexShrink: 0, textAlign: 'right' }}>
                              {board.value(p)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
