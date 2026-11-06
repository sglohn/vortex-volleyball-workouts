'use client'
// FILE: app/player/page.tsx
//
// The player's own home page, right after she signs in on her phone
// (volleyball). Signing in only opens this page: no workout is started, so
// looking at her stats doesn't count as coming in (lib/attendance.ts).
//
// Top: today's workout.
//   Scheduled, not begun   "Begin today's workout" → starts it
//                          (POST /api/checkin with her pass, lib/checkin.ts)
//                          → body check → workout
//   Begun, not finished    "Keep going" (body check first if she hasn't done it)
//   Finished               "Done for today"
//   Nothing today          "No workout today" + her next one
// Then: her season attendance (the same numbers coaches see), her latest
// numbers, her last few workouts, and links to Progress / History / Health.
// Data: app/api/player/home. Lacrosse keeps its week card on the sign-in
// screen, so this page sends lacrosse players to the workout.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { playerFetch } from '@/lib/playerPass'
import { FEATURES } from '@/lib/features'
import { DayStrip } from '@/components/Attendance'
import { pctColor, type AttendanceStat } from '@/lib/attendance'
import { feetInchesText, verticalFrom } from '@/lib/combine'

interface Home {
  today: {
    date: string
    workoutName: string | null
    isCombine: boolean
    hasWorkout: boolean
    session: { id: string; finished: boolean; bodyCheckDone: boolean; setsDone: number; name: string } | null
  }
  player: { id: string; name: string; team: { id: string; name: string; color: string } | null }
  next: { date: string; name: string } | null
  attendance: AttendanceStat | null
  season: { workouts: number; finished: number; setsLogged: number }
  recent: Array<{ id: string; date: string; name: string; finished: boolean; setsDone: number }>
  numbers: Record<string, { value: number; date: string }> | null
}

function niceDate(date: string, withWeekday = true): string {
  return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', ...(withWeekday ? { weekday: 'short' } : {}),
  })
}

function readStored(): Record<string, unknown> | null {
  try { const s = localStorage.getItem('vx_session'); return s ? JSON.parse(s) : null } catch { return null }
}

const cardTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0,
}

function Tile({ label, value, sub, standalone }: { label: string; value: string; sub?: string; standalone?: boolean }) {
  return (
    <div style={{ background: standalone ? 'var(--white)' : 'var(--page-bg)', border: standalone ? '1.5px solid var(--gray-border)' : 'none', borderRadius: 10, padding: '0.6rem 0.7rem', minWidth: 0 }}>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.2rem', color: 'var(--black)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

export default function PlayerHomePage() {
  const router = useRouter()
  const [home, setHome] = useState<Home | null>(null)
  const [loadError, setLoadError] = useState('')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')

  const load = useCallback(() => {
    const s = readStored()
    if (!s?.playerId) { router.push('/'); return }
    setLoadError('')
    playerFetch(`/api/player/home?playerId=${encodeURIComponent(String(s.playerId))}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || `Could not load (${r.status})`)
        setHome(d as Home)
      })
      .catch(e => setLoadError((e as Error).message || 'Could not load'))
  }, [router])

  useEffect(() => {
    // Lacrosse: week card on the sign-in screen, then the workout
    if (FEATURES.weekPlan) { router.replace('/player/workout'); return }
    load()
  }, [router, load])

  // Begin (or pick back up) today's workout, then the body check
  async function begin() {
    const s = readStored()
    if (!s?.playerId || starting) return
    setStarting(true); setStartError('')
    try {
      const res = await playerFetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: s.playerId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.sessionId) {
        setStartError(data.error || 'Couldn’t start your workout. Try again.')
        setStarting(false)
        return
      }
      localStorage.setItem('vx_session', JSON.stringify({
        ...s,
        sessionId: data.sessionId,
        playerName: data.playerName ?? s.playerName,
        teamId: data.teamId, templateId: data.templateId,
        hasHealthFlags: data.hasHealthFlags, healthReports: data.healthReports,
        isResumed: data.isResumed,
        bodyCheckDone: data.bodyCheckDone === true,
        playerPass: data.playerPass ?? s.playerPass,
      }))
      router.push(data.bodyCheckDone ? '/player/workout' : '/player/bodycheck')
    } catch {
      setStartError('Couldn’t reach the server. Check your connection and try again.')
      setStarting(false)
    }
  }

  if (loadError && !home) return (
    <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
      <p style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{loadError}</p>
      <button className="btn-volt" onClick={load} style={{ padding: '0.75rem 1.5rem' }}>Try again</button>
    </div>
  )
  if (!home) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>

  const { today, attendance, season, recent, numbers, next, player } = home
  const firstName = player.name.split(' ')[0]
  const teamColor = player.team?.color ?? 'var(--carolina)'
  const sess = today.session

  // ── Today card ──
  let todayCard: React.ReactNode
  if (sess && !sess.finished) {
    todayCard = (
      <>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--carolina-dark)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Today’s workout · in progress</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.35rem', color: 'var(--black)', margin: '0.2rem 0 0.15rem' }}>{sess.name}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.9rem' }}>
          {sess.setsDone ? `${sess.setsDone} set${sess.setsDone === 1 ? '' : 's'} logged so far` : 'Started — nothing logged yet'}
        </div>
        <button className="btn-volt" onClick={begin} disabled={starting} style={{ width: '100%', padding: '0.95rem', fontSize: '1.05rem' }}>
          {starting ? 'Opening…' : 'Keep going →'}
        </button>
      </>
    )
  } else if (sess && sess.finished) {
    todayCard = (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--success)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, flexShrink: 0 }}>✓</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.2rem', color: 'var(--black)' }}>Done for today!</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {sess.name}{sess.setsDone ? ` · ${sess.setsDone} sets` : ''}
          </div>
          {next && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Next: <strong>{niceDate(next.date)}</strong> · {next.name}</div>}
        </div>
      </div>
    )
  } else if (today.hasWorkout) {
    todayCard = (
      <>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--carolina-dark)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Today’s workout</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.35rem', color: 'var(--black)', margin: '0.2rem 0 0.9rem' }}>{today.workoutName}</div>
        <button className="btn-volt" onClick={begin} disabled={starting} style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}>
          {starting ? 'Starting…' : today.isCombine ? 'Begin Combine Day' : 'Begin today’s workout'}
        </button>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>Quick body check first, then your workout.</div>
      </>
    )
  } else {
    todayCard = (
      <>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.15rem', color: 'var(--black)' }}>No workout today</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
          {next ? <>Next: <strong>{niceDate(next.date)}</strong> · {next.name}</> : 'Nothing else on your schedule yet.'}
        </div>
      </>
    )
  }

  // ── Numbers ──
  const n = numbers ?? {}
  const val = (k: string) => n[k]?.value ?? null
  const reach = val('standing_reach_in')
  const tiles: Array<{ label: string; value: string; sub?: string }> = []
  const approach = val('approach_vertical_in')
  if (approach != null) {
    const v = verticalFrom(approach, reach)
    tiles.push({ label: 'Approach Touch', value: feetInchesText(approach), sub: v != null ? `${v}″ max vertical` : undefined })
  }
  const block = val('standing_vertical_in')
  if (block != null) {
    const v = verticalFrom(block, reach)
    tiles.push({ label: 'Block Touch', value: feetInchesText(block), sub: v != null ? `${v}″ standing vertical` : undefined })
  }
  if (val('acceleration_sec') != null) tiles.push({ label: 'Acceleration', value: `${val('acceleration_sec')!.toFixed(2)}s` })
  if (val('pro_agility_sec') != null) tiles.push({ label: 'Pro-Agility', value: `${val('pro_agility_sec')!.toFixed(2)}s` })
  if (val('height_in') != null) tiles.push({ label: 'Height', value: feetInchesText(val('height_in')!) })
  if (reach != null) tiles.push({ label: 'Standing Reach', value: feetInchesText(reach) })
  if (val('wingspan_in') != null) tiles.push({ label: 'Wingspan', value: feetInchesText(val('wingspan_in')!) })

  return (
    <div style={{ padding: '1rem', maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.875rem' }} className="fade-up">
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Hi, {firstName}</h1>
        {player.team && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{player.team.name}</div>}
      </div>

      {/* Today */}
      <div className="card" style={{ padding: '1.1rem', borderLeft: `5px solid ${sess?.finished ? 'var(--success)' : today.hasWorkout || sess ? teamColor : 'var(--gray-border)'}` }}>
        {todayCard}
        {startError && <div style={{ marginTop: '0.75rem', color: 'var(--danger)', fontSize: '0.85rem', textAlign: 'center' }}>{startError}</div>}
      </div>

      {/* Attendance */}
      {attendance && (
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem' }}>
            <h2 style={cardTitle}>Weight room this season</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '2.2rem', lineHeight: 1, color: pctColor(attendance.pct) }}>
              {attendance.pct === null ? '—' : `${attendance.pct}%`}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {attendance.counted
                ? <>Came to <strong>{attendance.attended}</strong> of {attendance.counted} team workouts<br />Finished <strong>{attendance.finished}</strong>{attendance.extra ? ` · ${attendance.extra} extra` : ''}</>
                : 'No team workouts yet this season.'}
            </div>
          </div>
          {attendance.days.length > 0 && <DayStrip days={attendance.days.slice(-12)} />}
        </div>
      )}

      {/* Season totals (also for players not on a team) */}
      {season.workouts > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          <Tile standalone label="Workouts" value={String(season.workouts)} sub="this season" />
          <Tile standalone label="Finished" value={String(season.finished)} />
          <Tile standalone label="Sets logged" value={String(season.setsLogged)} />
        </div>
      )}

      {/* Numbers */}
      {FEATURES.measurements && (
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem' }}>
            <h2 style={cardTitle}>My numbers</h2>
            <Link href="/player/profile" style={{ fontSize: '0.8rem', color: 'var(--carolina-dark)', fontWeight: 600, textDecoration: 'none' }}>All →</Link>
          </div>
          {tiles.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
              {tiles.map(t => <Tile key={t.label} {...t} />)}
            </div>
          ) : <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No numbers yet. They show up here after your Combine Day.</div>}
        </div>
      )}

      {/* Recent workouts */}
      <div className="card" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
          <h2 style={cardTitle}>Recent workouts</h2>
          <Link href="/player/history" style={{ fontSize: '0.8rem', color: 'var(--carolina-dark)', fontWeight: 600, textDecoration: 'none' }}>History →</Link>
        </div>
        {recent.length ? recent.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0', borderBottom: '1px solid var(--gray-border)' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#fff', background: r.finished ? 'var(--success)' : 'var(--warning)' }}>{r.finished ? '✓' : '…'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{r.finished ? 'Finished' : 'Not finished'}{r.setsDone ? ` · ${r.setsDone} sets` : ''}</div>
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>{niceDate(r.date)}</span>
          </div>
        )) : <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No workouts yet this season.</div>}
      </div>

      {/* More */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
        <Link href="/player/progress" className="card" style={{ padding: '0.85rem', textDecoration: 'none', color: 'var(--black)' }}>
          <div style={{ fontWeight: 700 }}>📈 Progress</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Strength over time</div>
        </Link>
        <Link href="/player/health" className="card" style={{ padding: '0.85rem', textDecoration: 'none', color: 'var(--black)' }}>
          <div style={{ fontWeight: 700 }}>❤️ Health</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tell your coach about pain</div>
        </Link>
      </div>
    </div>
  )
}
