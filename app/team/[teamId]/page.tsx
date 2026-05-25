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

type Screen = 'roster' | 'pin' | 'done'

export default function TeamSessionPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = use(params)
  const router = useRouter()
  const [data, setData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [screen, setScreen] = useState<Screen>('roster')
  const [selected, setSelected] = useState<RosterPlayer | null>(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [checkingIn, setCheckingIn] = useState(false)
  const [completionData, setCompletionData] = useState<{ name: string; totalWeight: number; durationMin: number | null; completedSets: number; totalSets: number } | null>(null)

  const loadRoster = useCallback(async () => {
    const res = await fetch(`/api/team?teamId=${teamId}`)
    const d = await res.json()
    setData(d)
    setLoading(false)
  }, [teamId])

  useEffect(() => { loadRoster() }, [loadRoster])

  // Poll roster every 15s to pick up changes
  useEffect(() => {
    const interval = setInterval(loadRoster, 15000)
    return () => clearInterval(interval)
  }, [loadRoster])

  function selectPlayer(player: RosterPlayer) {
    if (player.completed) return // already done
    setSelected(player)
    setPin('')
    setPinError('')
    setScreen('pin')
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

    // Store session and go through individual flow
    localStorage.setItem('vx_session', JSON.stringify({
      sessionId: d.sessionId,
      playerId: selected.id,
      playerName: selected.name,
      teamId: d.teamId,
      templateId: d.templateId ?? data?.templateId,
      hasHealthFlags: d.hasHealthFlags,
      healthReports: d.healthReports,
      isResumed: d.isResumed,
      teamMode: true,          // flag so workout page knows to return here
      teamModeUrl: `/team/${teamId}`,
    }))

    setCheckingIn(false)
    router.push('/player/bodycheck')
  }

  // Check if we're returning from a completed workout
  useEffect(() => {
    const returning = sessionStorage.getItem('vx_team_return')
    if (returning) {
      sessionStorage.removeItem('vx_team_return')
      const d = JSON.parse(returning)
      setCompletionData(d)
      setScreen('done')
      loadRoster()
    }
  }, [loadRoster])

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

  // ── COMPLETION SCREEN ──
  if (screen === 'done' && completionData) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--page-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div className="card" style={{ maxWidth: 420, width: '100%', padding: '2rem', textAlign: 'center' }}>
          {/* All block checkmarks */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {['A','B','C','D','E','F'].slice(0, 4).map(label => (
              <div key={label} style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--carolina)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--white)', lineHeight: 1 }}>Block</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--yellow)', lineHeight: 1 }}>{label}</div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--white)" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            ))}
          </div>

          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: 'var(--black)', marginBottom: '0.25rem' }}>
            WORKOUT DONE
          </h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Great work, {completionData.name.split(' ')[0]}!
          </p>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.75rem' }}>
            {[
              { value: completionData.durationMin ? `${completionData.durationMin}min` : '—', label: 'Time' },
              { value: `${completionData.completedSets}/${completionData.totalSets}`, label: 'Sets done' },
              { value: completionData.totalWeight > 0 ? `${completionData.totalWeight.toLocaleString()} lbs` : '—', label: 'Total weight' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--carolina-light)', borderRadius: 10, padding: '0.75rem 0.5rem', border: '1.5px solid var(--carolina-border)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--carolina-deep)', lineHeight: 1, marginBottom: '0.25rem' }}>{s.value}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <button
            onClick={() => { setScreen('roster'); setCompletionData(null); loadRoster() }}
            className="btn-black"
            style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}>
            ✓ I'm done — back to roster
          </button>
        </div>
      </div>
    )
  }

  // ── PIN SCREEN ──
  if (screen === 'pin' && selected) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--page-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', color: 'var(--yellow)' }}>
              {selected.jerseyNumber || selected.name.charAt(0).toUpperCase()}
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--black)', marginBottom: '0.25rem' }}>{selected.name}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Enter your PIN to check in</p>
          </div>

          {/* PIN dots */}
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

          {/* Numpad */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {keys.map(k => (
              <button key={k} className="pin-key"
                onClick={() => k === '✓' ? handleCheckin() : handleKey(k)}
                style={{ width: '100%', background: k === '✓' ? 'var(--carolina)' : 'var(--white)', color: k === '✓' ? 'var(--white)' : 'var(--black)', opacity: k === '✓' && pin.length !== 4 ? 0.4 : 1 }}
                disabled={checkingIn}>{k}</button>
            ))}
          </div>

          <button
            onClick={() => { setScreen('roster'); setSelected(null); setPin('') }}
            className="btn-ghost"
            style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem' }}>
            ← Back to roster
          </button>
        </div>
      </div>
    )
  }

  // ── ROSTER SCREEN ──
  const { team, roster, workoutName, checkedInCount, completedCount } = data

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ background: 'var(--black)', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--black)" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.08em', color: 'var(--yellow)', lineHeight: 1 }}>VORTEX S&C</div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Team Mode</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--white)' }}>{team.name}{team.age_group ? ` · ${team.age_group}` : ''}</div>
          {workoutName && <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)' }}>{workoutName}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--yellow)' }}>{checkedInCount}/{roster.length}</div>
          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Checked in</div>
        </div>
      </div>

      {/* Progress strip */}
      <div style={{ height: 4, background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ height: '100%', background: 'var(--carolina)', width: `${roster.length > 0 ? checkedInCount / roster.length * 100 : 0}%`, transition: 'width 0.5s ease' }} />
      </div>

      {/* Instruction */}
      <div style={{ padding: '1rem 1.5rem 0.5rem', textAlign: 'center' }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
          Tap your name to check in and start your workout
        </p>
      </div>

      {/* Roster grid */}
      <div style={{ flex: 1, padding: '0.75rem 1.5rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', alignContent: 'start' }}>
        {roster.map(player => {
          const isCheckedIn = player.checkedIn
          const isDone = player.completed

          return (
            <button
              key={player.id}
              onClick={() => selectPlayer(player)}
              disabled={isDone}
              style={{
                background: isDone ? 'var(--carolina)' : isCheckedIn ? 'var(--carolina-light)' : 'var(--white)',
                border: `2px solid ${isDone ? 'var(--carolina)' : isCheckedIn ? 'var(--carolina-border)' : 'var(--gray-border)'}`,
                borderRadius: 12,
                padding: '1rem 0.875rem',
                cursor: isDone ? 'default' : 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s',
                boxShadow: isDone ? '0 2px 8px rgba(86,160,211,0.3)' : '0 1px 4px rgba(0,0,0,0.06)',
                transform: 'translateY(0)',
              }}
              onMouseEnter={e => { if (!isDone) e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
            >
              {/* Avatar */}
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: isDone ? 'rgba(255,255,255,0.25)' : isCheckedIn ? 'var(--carolina)' : 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.625rem', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: isDone ? 'var(--white)' : isCheckedIn ? 'var(--white)' : 'var(--yellow)' }}>
                {isDone
                  ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  : (player.jerseyNumber || player.name.charAt(0).toUpperCase())
                }
              </div>

              {/* Name */}
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: isDone ? 'var(--white)' : 'var(--black)', lineHeight: 1.3, marginBottom: '0.25rem' }}>
                {player.name}
              </div>

              {/* Status */}
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: isDone ? 'rgba(255,255,255,0.8)' : isCheckedIn ? 'var(--carolina-dark)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {isDone ? 'Done ✓' : isCheckedIn ? 'In progress' : 'Tap to check in'}
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '0.875rem 1.5rem', background: 'var(--white)', borderTop: '1.5px solid var(--gray-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {completedCount} completed · {checkedInCount - completedCount} in progress · {roster.length - checkedInCount} not started
        </div>
        <a href="/coach/dashboard" style={{ fontSize: '0.8rem', color: 'var(--carolina-dark)', textDecoration: 'none', fontWeight: 500 }}>Coach view →</a>
      </div>
    </div>
  )
}
