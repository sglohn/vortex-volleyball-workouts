// FILE: components/CombineStation.tsx
//
// Coach station for Combine Day, opened from Team Mode (app/team/[teamId],
// "Coach station" button) on a tablet or laptop at one test.
//
//   1. Sign in   if this device isn't signed in as a coach yet: pick your
//                name (team coaches of the teams here, then admins) and enter
//                your coach PIN. Closing the station signs out again if it
//                signed you in, so the shared screen doesn't stay signed in.
//   2. Pick the test at your station (big buttons, with how many players
//      have a number). The pick is remembered on this device.
//   3. Tap the player in front of you. Her entry sheet opens: last time's
//      number, her tries today, and the entry box in the right units, with
//      the same read-back and double-checks as the phones (lib/combine.ts).
//      Jumps, sprints and swing stay open for her next try; Enter saves on a
//      keyboard. Height, wingspan and reach save and close.
//   4. The list shows "Still to go" (no number yet for this test) on top and
//      "Has a number" below, so the coach can see who's left at a glance.
//      It refreshes every 20 seconds, so numbers players enter on their own
//      phones show up too.
//
// Server side: app/api/coach/combine-station (team coaches: own teams only).
// A player who hasn't checked in is checked in when her first number is
// saved, and can keep going on her own phone afterwards.
'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  bestValue, checkCombineValue, combineMetric, combineText, feetInchesText, isTouchMetric, parseCombineEntry, verticalFrom,
  type CombineMetric, type CombineMetricKey,
} from '@/lib/combine'

interface Attempt { id: string; metric: CombineMetricKey; value: number; createdAt: string }
interface StationPlayer {
  id: string; name: string; jerseyNumber: string | null; teamId: string
  sessionId: string | null; completed: boolean
  attempts: Attempt[]
  previous: Partial<Record<CombineMetricKey, number>>
}
interface StationTeam { id: string; name: string; color: string; tests: CombineMetricKey[] }
interface StationData {
  coach: { name: string; isAdmin: boolean }
  teams: StationTeam[]
  hidden: { notYours: number; noCombine: number }
  tests: CombineMetricKey[]
  players: StationPlayer[]
}
interface CoachChoice { id: string; name: string; admin: boolean }

const TEST_KEY = 'vx_station_test'
const POLL_MS = 20_000
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '✓']

const label: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.06em', fontWeight: 800, marginBottom: '0.4rem',
}

function firstName(name: string) { return name.split(' ')[0] }

function triesOf(p: StationPlayer, key: CombineMetricKey) { return p.attempts.filter(a => a.metric === key) }

function bestOf(p: StationPlayer, key: CombineMetricKey): number | null {
  const m = combineMetric(key)
  return m ? bestValue(m, triesOf(p, key).map(a => a.value)) : null
}

// One entry box with its unit inside on the right
function UnitBox({ value, onChange, unit, placeholder, inputMode, step, autoFocus, ariaLabel, onEnter, inputRef }: {
  value: string; onChange: (v: string) => void; unit: string; placeholder: string
  inputMode: 'numeric' | 'decimal'; step: string; autoFocus?: boolean; ariaLabel: string
  onEnter: () => void; inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input ref={inputRef} className="input" type="number" inputMode={inputMode} step={step} min="0" placeholder={placeholder}
        aria-label={ariaLabel} autoFocus={autoFocus} value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }}
        style={{ width: '100%', fontSize: '2rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, padding: '0.7rem 2.6rem 0.7rem 0.6rem', boxSizing: 'border-box' }} />
      <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', fontWeight: 700, color: 'var(--text-muted)', pointerEvents: 'none' }}>{unit}</span>
    </div>
  )
}

// A player's row in the list for the picked test
function PlayerRow({ player, metric, team, multiTeam, onOpen }: {
  player: StationPlayer; metric: CombineMetric; team: StationTeam | undefined; multiTeam: boolean; onOpen: () => void
}) {
  const tries = triesOf(player, metric.key)
  const best = bestOf(player, metric.key)
  const done = best != null
  return (
    <button type="button" onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', textAlign: 'left', cursor: 'pointer', padding: '0.7rem 0.85rem', borderRadius: 12,
        background: done ? 'rgba(22,163,74,0.06)' : 'var(--white)', border: `2px solid ${done ? 'var(--success)' : 'var(--gray-border)'}`,
        borderLeft: multiTeam && team ? `7px solid ${team.color}` : undefined }}>
      <span aria-hidden style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800,
        background: done ? 'var(--success)' : 'var(--white)', color: '#fff', border: done ? 'none' : '2.5px dashed var(--gray-border)', boxSizing: 'border-box' }}>{done ? '✓' : ''}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {player.name}{player.jerseyNumber ? <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}> #{player.jerseyNumber}</span> : null}
        </span>
        <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          {multiTeam && team ? `${team.name} · ` : ''}
          {done
            ? (metric.maxAttempts > 1 ? `${tries.length} of ${metric.maxAttempts} tries` : 'Saved')
            : player.previous[metric.key] != null ? `Last time ${combineText(metric, player.previous[metric.key])}` : 'No number yet'}
        </span>
      </span>
      <span style={{ flexShrink: 0, textAlign: 'right' }}>
        {done
          ? <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.15rem', color: 'var(--success)' }}>{combineText(metric, best)}</span>
          : <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--carolina-dark)' }}>Enter →</span>}
      </span>
    </button>
  )
}

export default function CombineStation({ teamIds, onClose }: { teamIds: string[]; onClose: () => void }) {
  const [phase, setPhase] = useState<'checking' | 'signin' | 'station'>('checking')
  const [signedInHere, setSignedInHere] = useState(false)
  // Sign in
  const [choices, setChoices] = useState<CoachChoice[] | null>(null)
  const [pickCoach, setPickCoach] = useState<CoachChoice | null>(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  // Station
  const [data, setData] = useState<StationData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [testKey, setTestKey] = useState<CombineMetricKey | null>(null)
  const [teamFilter, setTeamFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [flash, setFlash] = useState('')
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Entry sheet
  const [feet, setFeet] = useState('')
  const [inches, setInches] = useState('')
  const [amount, setAmount] = useState('')
  const [warningOk, setWarningOk] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [justSaved, setJustSaved] = useState('')
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null)
  const firstBox = useRef<HTMLInputElement | null>(null)

  const teamKey = teamIds.join(',')

  const showFlash = useCallback((text: string) => {
    setFlash(text)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(''), 3500)
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/coach/combine-station?teams=${encodeURIComponent(teamKey)}`, { cache: 'no-store' })
      if (res.status === 401) { setPhase('signin'); return }
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(d.error ?? 'Could not load the station.'); return }
      setData(d as StationData)
      setLoadError('')
      setPhase('station')
    } catch { setLoadError('Could not load the station. Check the wifi.') }
  }, [teamKey])

  // Signed in already? Otherwise the sign-in list
  useEffect(() => {
    let gone = false
    ;(async () => {
      try {
        const me = await fetch('/api/coach', { cache: 'no-store' }).then(r => r.json()).catch(() => ({}))
        if (gone) return
        if (me.signedIn && !me.coach?.setup) { await load(); return }
      } catch { /* fall through to sign in */ }
      if (!gone) setPhase('signin')
    })()
    return () => { gone = true }
  }, [load])

  // Coaches to pick from: the teams' coaches, then admins
  useEffect(() => {
    if (phase !== 'signin' || choices) return
    ;(async () => {
      const list: CoachChoice[] = []
      const seen = new Set<string>()
      const rosters = await Promise.all(teamKey.split(',').filter(Boolean).map(id =>
        fetch(`/api/player/roster?teamId=${encodeURIComponent(id)}`).then(r => r.json()).catch(() => ({}))))
      for (const r of rosters) for (const c of (r.coaches ?? []) as { id: string; name: string }[]) {
        if (!seen.has(c.id)) { seen.add(c.id); list.push({ id: c.id, name: c.name, admin: false }) }
      }
      const admins = await fetch('/api/coach/signin-list').then(r => r.json()).catch(() => ({}))
      for (const a of (admins.admins ?? []) as { id: string; name: string }[]) {
        if (!seen.has(a.id)) { seen.add(a.id); list.push({ id: a.id, name: a.name, admin: true }) }
      }
      setChoices(list)
    })()
  }, [phase, choices, teamKey])

  // Remembered test, once the tests are known
  useEffect(() => {
    if (!data || testKey) return
    let saved: string | null = null
    try { saved = localStorage.getItem(TEST_KEY) } catch { /* private mode */ }
    if (saved && data.tests.includes(saved as CombineMetricKey)) setTestKey(saved as CombineMetricKey)
  }, [data, testKey])

  // Refresh the list (phones enter numbers too); not while a sheet is open
  useEffect(() => {
    if (phase !== 'station') return
    const t = setInterval(() => { if (!openId) load() }, POLL_MS)
    return () => clearInterval(t)
  }, [phase, openId, load])

  async function signIn() {
    if (!pickCoach || pin.length !== 4 || signingIn) return
    setSigningIn(true); setPinError('')
    try {
      const res = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coachId: pickCoach.id, pin }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setPinError(d.error ?? 'Wrong PIN'); setPin(''); setSigningIn(false); return }
      setSignedInHere(true)
      setPin('')
      await load()
    } catch { setPinError('Could not reach the server. Check the wifi.') }
    setSigningIn(false)
  }

  async function close() {
    if (signedInHere) await fetch('/api/coach', { method: 'DELETE' }).catch(() => {})
    onClose()
  }

  async function switchCoach() {
    await fetch('/api/coach', { method: 'DELETE' }).catch(() => {})
    setData(null); setPickCoach(null); setPin(''); setSignedInHere(false); setChoices(null)
    setPhase('signin')
  }

  function pickTest(key: CombineMetricKey) {
    setTestKey(key); setOpenId(null)
    try { localStorage.setItem(TEST_KEY, key) } catch { /* private mode */ }
  }

  function resetEntry() { setFeet(''); setInches(''); setAmount(''); setWarningOk(null); setSaveError('') }

  function openPlayer(id: string) {
    resetEntry(); setJustSaved(''); setDeleteArmed(null)
    setOpenId(id)
  }

  function closeSheet() {
    resetEntry(); setJustSaved(''); setDeleteArmed(null)
    setOpenId(null)
  }

  function replacePlayer(p: StationPlayer) {
    setData(d => d ? { ...d, players: d.players.map(x => x.id === p.id ? p : x) } : d)
  }

  const metric = testKey ? combineMetric(testKey) : null
  const teamById = useMemo(() => new Map((data?.teams ?? []).map(t => [t.id, t])), [data?.teams])

  // ── Sign in ──
  if (phase === 'checking') {
    return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Opening coach station…</div>
  }

  if (phase === 'signin') {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '1.5rem 1rem' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--carolina-dark)', fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: '1rem' }}>← Back to Team Mode</button>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>Coach station</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
          Enter combine numbers for a line of players at one test, no player PINs needed. Coaches sign in with their own PIN.
        </p>
        {!pickCoach ? (
          <>
            <span style={label}>Who&apos;s running this station?</span>
            {!choices ? <div style={{ color: 'var(--text-muted)' }}>Loading coaches…</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {choices.map(c => (
                  <button key={c.id} onClick={() => { setPickCoach(c); setPin(''); setPinError('') }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 1rem', borderRadius: 10, border: '2px solid var(--gray-border)', background: 'var(--white)', cursor: 'pointer', fontWeight: 700, fontSize: '0.98rem' }}>
                    {c.name}<span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.admin ? 'Admin' : 'Coach'}</span>
                  </button>
                ))}
                {choices.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>No coach accounts found for these teams.</div>}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{pickCoach.name}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Enter your coach PIN</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {[0, 1, 2, 3].map(i => <div key={i} className={`pin-digit ${i < pin.length ? 'filled' : ''}`}>{i < pin.length ? '●' : ''}</div>)}
            </div>
            {pinError && <div style={{ background: 'var(--danger-light)', borderRadius: 8, padding: '0.6rem', marginBottom: '1rem', color: 'var(--danger)', textAlign: 'center', fontSize: '0.9rem' }}>{pinError}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
              {keys.map(k => (
                <button key={k} className="pin-key" disabled={signingIn}
                  onClick={() => {
                    if (k === '✓') { signIn(); return }
                    setPinError('')
                    if (k === '←') setPin(p => p.slice(0, -1))
                    else setPin(p => (p.length >= 4 ? p : p + k))
                  }}
                  style={{ width: '100%', background: k === '✓' ? 'var(--carolina)' : 'var(--white)', color: k === '✓' ? 'var(--white)' : 'var(--black)', opacity: k === '✓' && pin.length !== 4 ? 0.4 : 1 }}>
                  {k === '✓' && signingIn ? '…' : k}
                </button>
              ))}
            </div>
            <button className="btn-ghost" onClick={() => setPickCoach(null)} style={{ width: '100%', padding: '0.75rem' }}>← Pick a different name</button>
          </>
        )}
      </div>
    )
  }

  // ── Station ──
  if (!data) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{loadError || 'Loading…'}</p>
        <button className="btn-volt" onClick={load} style={{ padding: '0.7rem 1.4rem', marginRight: '0.5rem' }}>Try again</button>
        <button className="btn-ghost" onClick={close} style={{ padding: '0.7rem 1.4rem' }}>Close</button>
      </div>
    )
  }

  const multiTeam = data.teams.length > 1
  const shown = data.players
    .filter(p => teamFilter === 'all' || p.teamId === teamFilter)
    .filter(p => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()) || (p.jerseyNumber ?? '') === search.trim())
    .filter(p => !metric || (teamById.get(p.teamId)?.tests ?? []).includes(metric.key))
  const waiting = metric ? shown.filter(p => bestOf(p, metric.key) == null) : []
  const entered = metric ? shown.filter(p => bestOf(p, metric.key) != null) : []
  const open = openId ? data.players.find(p => p.id === openId) ?? null : null

  const header = (
    <div style={{ background: 'var(--black)', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'sticky', top: 0, zIndex: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--yellow)', letterSpacing: '0.04em' }}>COACH STATION</div>
        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {data.coach.name} · {data.teams.map(t => t.name).join(' + ') || 'no combine teams'}
        </div>
      </div>
      <button onClick={switchCoach} style={{ background: 'none', border: '1.5px solid rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.8)', borderRadius: 8, padding: '0.45rem 0.7rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Switch coach</button>
      <button className="btn-volt" onClick={close} style={{ padding: '0.5rem 0.85rem', fontSize: '0.82rem', flexShrink: 0 }}>Close station</button>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)' }}>
      {header}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '1rem' }}>
        {(data.hidden.notYours > 0 || data.hidden.noCombine > 0) && (
          <div style={{ padding: '0.6rem 0.85rem', marginBottom: '0.875rem', borderRadius: 10, background: 'var(--gray-light)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {data.hidden.notYours > 0 && `${data.hidden.notYours} ${data.hidden.notYours === 1 ? 'team here isn’t' : 'teams here aren’t'} yours, so ${data.hidden.notYours === 1 ? 'it isn’t' : 'they aren’t'} shown. `}
            {data.hidden.noCombine > 0 && `${data.hidden.noCombine} ${data.hidden.noCombine === 1 ? 'team doesn’t' : 'teams don’t'} have a Combine Day today.`}
          </div>
        )}
        {data.teams.length === 0 && (
          <div className="card" style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            None of these teams has a Combine Day today{data.hidden.notYours > 0 ? ' that you coach' : ''}.
          </div>
        )}

        {/* Which test is this station? */}
        {data.tests.length > 0 && (
          <>
            <span style={label}>{metric ? 'Your station' : 'Which test is your station?'}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
              {data.tests.map(k => {
                const m = combineMetric(k)!
                const on = k === testKey
                const players = data.players.filter(p => (teamById.get(p.teamId)?.tests ?? []).includes(k))
                const have = players.filter(p => bestOf(p, k) != null).length
                return (
                  <button key={k} onClick={() => pickTest(k)}
                    style={{ padding: '0.7rem 0.75rem', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                      border: `2px solid ${on ? 'var(--black)' : 'var(--gray-border)'}`, background: on ? 'var(--black)' : 'var(--white)', color: on ? 'var(--yellow)' : 'var(--text-primary)' }}>
                    <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem' }}>{m.label}</span>
                    <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: on ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)' }}>{have}/{players.length} entered</span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {flash && (
          <div style={{ background: 'var(--yellow)', color: '#0a0f0d', padding: '0.6rem 1rem', borderRadius: 10, textAlign: 'center', fontWeight: 800, marginBottom: '0.875rem' }}>{flash}</div>
        )}
        {loadError && <div style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{loadError} Showing the last list.</div>}

        {metric && (
          <>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', background: 'var(--carolina-light)', border: '1px solid var(--carolina-border)', borderRadius: 10, padding: '0.6rem 0.8rem', marginBottom: '0.875rem' }}>
              <strong>{metric.label}:</strong> {metric.howTo}{metric.maxAttempts > 1 ? ` Best of ${metric.maxAttempts} counts.` : ''}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.875rem' }}>
              <input className="input" type="search" placeholder="Find a player (name or #)" value={search} onChange={e => setSearch(e.target.value)}
                style={{ flex: '1 1 200px', padding: '0.65rem 0.8rem', fontSize: '0.95rem' }} />
              {multiTeam && (
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {[{ id: 'all', name: 'All', color: 'var(--black)' }, ...data.teams].map(t => {
                    const on = teamFilter === t.id
                    return (
                      <button key={t.id} onClick={() => setTeamFilter(t.id)}
                        style={{ padding: '0.45rem 0.8rem', borderRadius: 20, border: `2px solid ${t.color}`, background: on ? t.color : 'var(--white)', color: on ? '#fff' : 'var(--black)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <span style={{ ...label, color: 'var(--carolina-dark)' }}>Still to go · {waiting.length}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {waiting.map(p => <PlayerRow key={p.id} player={p} metric={metric} team={teamById.get(p.teamId)} multiTeam={multiTeam} onOpen={() => openPlayer(p.id)} />)}
              {waiting.length === 0 && <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.9rem' }}>{shown.length ? `Everyone here has a ${metric.label} number. 🎉` : 'No players match.'}</div>}
            </div>

            {entered.length > 0 && (
              <>
                <span style={{ ...label, color: 'var(--success)' }}>Has a number · {entered.length}</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  {entered.map(p => <PlayerRow key={p.id} player={p} metric={metric} team={teamById.get(p.teamId)} multiTeam={multiTeam} onOpen={() => openPlayer(p.id)} />)}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {open && metric && (
        <EntrySheet
          key={`${open.id}-${metric.key}`}
          player={open} metric={metric} team={teamById.get(open.teamId)}
          feet={feet} inches={inches} amount={amount}
          setFeet={v => { setFeet(v); setWarningOk(null); setJustSaved('') }}
          setInches={v => { setInches(v); setWarningOk(null); setJustSaved('') }}
          setAmount={v => { setAmount(v); setWarningOk(null); setJustSaved('') }}
          warningOk={warningOk} setWarningOk={setWarningOk}
          saving={saving} saveError={saveError} justSaved={justSaved}
          deleteArmed={deleteArmed} firstBox={firstBox}
          onClose={closeSheet}
          onSave={async (value) => {
            setSaving(true); setSaveError('')
            try {
              const res = await fetch('/api/coach/combine-station', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId: open.id, metric: metric.key, value }),
              })
              const d = await res.json().catch(() => ({}))
              if (res.status === 401) { setSaving(false); setPhase('signin'); return }
              if (!res.ok) { setSaveError(d.error ?? 'Not saved. Try again.'); setSaving(false); return }
              const updated = d.player as StationPlayer
              replacePlayer(updated)
              const text = combineText(metric, value)
              const left = metric.maxAttempts - triesOf(updated, metric.key).length
              resetEntry()
              if (metric.maxAttempts > 1 && left > 0) {
                setJustSaved(`✓ Saved ${text}. ${left} ${left === 1 ? 'try' : 'tries'} left.`)
                setTimeout(() => firstBox.current?.focus(), 50)
              } else {
                setOpenId(null)
                showFlash(`✓ ${firstName(updated.name)}: ${text} saved${metric.maxAttempts > 1 ? ` · best ${combineText(metric, bestOf(updated, metric.key))}` : ''}`)
              }
            } catch { setSaveError('Not saved. Check the wifi and try again.') }
            setSaving(false)
          }}
          onDelete={async (id) => {
            if (deleteArmed !== id) { setDeleteArmed(id); return }
            setDeleteArmed(null); setJustSaved('')
            try {
              const res = await fetch('/api/coach/combine-station', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId: open.id, id }),
              })
              const d = await res.json().catch(() => ({}))
              if (!res.ok) { setSaveError(d.error ?? 'Not deleted. Try again.'); return }
              replacePlayer(d.player as StationPlayer)
            } catch { setSaveError('Not deleted. Check the wifi and try again.') }
          }}
        />
      )}
    </div>
  )
}

// The bottom sheet for one player at this test
function EntrySheet(props: {
  player: StationPlayer; metric: CombineMetric; team: StationTeam | undefined
  feet: string; inches: string; amount: string
  setFeet: (v: string) => void; setInches: (v: string) => void; setAmount: (v: string) => void
  warningOk: string | null; setWarningOk: (v: string | null) => void
  saving: boolean; saveError: string; justSaved: string; deleteArmed: string | null
  firstBox: React.MutableRefObject<HTMLInputElement | null>
  onClose: () => void; onSave: (value: number) => void; onDelete: (id: string) => void
}) {
  const { player, metric, team, feet, inches, amount, warningOk, saving, saveError, justSaved, deleteArmed, firstBox } = props
  const tries = triesOf(player, metric.key)
  const best = bestOf(player, metric.key)
  const previous = player.previous[metric.key] ?? null
  const isTouch = isTouchMetric(metric.key)
  const single = metric.maxAttempts === 1
  const left = single ? 1 : metric.maxAttempts - tries.length
  const reachToday = bestOf(player, 'standing_reach_in')
  const reach = reachToday ?? player.previous.standing_reach_in ?? null

  const parsed = parseCombineEntry(metric, { feet, inches, amount })
  const entered = parsed.value
  const check = entered != null
    ? checkCombineValue(metric, entered, {
        reach: metric.key === 'standing_reach_in' ? null : reach,
        reachIsToday: reachToday != null,
        blockTouch: bestOf(player, 'standing_vertical_in'),
        previous,
      })
    : null
  const blocking = parsed.error ?? check?.error ?? null
  const warning = !blocking ? check?.warning ?? null : null
  const needsSecondTap = !!warning && warningOk !== warning
  const vertical = isTouch && entered != null ? verticalFrom(entered, reach) : null
  const typed = feet !== '' || inches !== '' || amount !== ''

  function save() {
    if (entered == null || blocking || saving) return
    if (needsSecondTap) { props.setWarningOk(warning); return }
    props.onSave(entered)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 70 }} onClick={props.onClose}>
      <div className="card" role="dialog" aria-label={`${metric.label} for ${player.name}`} onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', padding: '1.1rem 1.1rem 1.4rem', borderRadius: '16px 16px 0 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--carolina)' }}>{metric.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', lineHeight: 1.15 }}>{player.name}</div>
            {team && <div style={{ fontSize: '0.78rem', fontWeight: 700, color: team.color }}>{team.name}</div>}
          </div>
          <button onClick={props.onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: '1.3rem', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
        </div>

        {(previous != null || (isTouch && reach != null)) && (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            {previous != null && <span>Last time: <strong style={{ color: 'var(--text-secondary)' }}>{combineText(metric, previous)}</strong></span>}
            {isTouch && reach != null && <span>Standing reach: <strong style={{ color: 'var(--text-secondary)' }}>{feetInchesText(reach)}</strong>{reachToday == null ? ' (last time)' : ' (today)'}</span>}
          </div>
        )}
        {isTouch && reach == null && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>No standing reach on file yet, so her vertical shows once Standing Reach is measured.</div>
        )}
        {player.completed && (
          <div style={{ fontSize: '0.8rem', color: '#92400e', background: 'var(--warning-light)', borderRadius: 8, padding: '0.45rem 0.7rem', marginBottom: '0.75rem' }}>She already tapped Finish. You can still add or fix her numbers.</div>
        )}

        {tries.length > 0 && (
          <div style={{ marginBottom: '0.875rem' }}>
            <span style={label}>{single ? 'Saved today' : 'Tries today'}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {tries.map((t, i) => {
                const isBest = !single && tries.length > 1 && best === t.value && tries.findIndex(x => x.value === best) === i
                const vert = isTouch ? verticalFrom(t.value, reach) : null
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', borderRadius: 10, background: isBest ? 'rgba(22,163,74,0.08)' : 'var(--gray-light)', border: `1.5px solid ${isBest ? 'var(--success)' : 'var(--gray-border)'}` }}>
                    {!single && <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', width: 40 }}>Try {i + 1}</span>}
                    <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.15rem' }}>
                      {combineText(metric, t.value)}
                      {vert != null && <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.74rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{vert}″ vertical</span>}
                    </span>
                    {isBest && <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--success)' }}>★ BEST</span>}
                    <button onClick={() => props.onDelete(t.id)}
                      style={{ background: deleteArmed === t.id ? 'var(--danger)' : 'none', color: deleteArmed === t.id ? '#fff' : 'var(--text-muted)', border: deleteArmed === t.id ? 'none' : '1px solid var(--gray-border)', borderRadius: 6, padding: '0.3rem 0.55rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                      {deleteArmed === t.id ? 'Delete?' : '✕'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {justSaved && (
          <div style={{ padding: '0.55rem 0.8rem', marginBottom: '0.75rem', borderRadius: 10, background: 'var(--success-light)', border: '1.5px solid var(--success)', color: 'var(--success)', fontWeight: 700, fontSize: '0.9rem' }}>{justSaved}</div>
        )}

        {left > 0 ? (
          <>
            <span style={label}>{single ? (tries.length ? 'Measure again (replaces it)' : 'Enter the number') : `Try ${tries.length + 1} of ${metric.maxAttempts}`}</span>
            {metric.unit === 'ft-in' ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <UnitBox inputRef={firstBox} value={feet} onChange={props.setFeet} unit="ft" ariaLabel="Feet" onEnter={save}
                  placeholder={previous != null ? String(Math.floor(previous / 12)) : '0'} inputMode="numeric" step="1" autoFocus />
                <UnitBox value={inches} onChange={props.setInches} unit="in" ariaLabel="Inches" onEnter={save}
                  placeholder="0" inputMode="decimal" step="0.5" />
              </div>
            ) : (
              <UnitBox inputRef={firstBox} value={amount} onChange={props.setAmount} unit={metric.unit === 'sec' ? 'sec' : 'mph'} ariaLabel={metric.label} onEnter={save}
                placeholder={metric.unit === 'sec' ? (metric.key === 'acceleration_sec' ? '1.12' : '5.38') : '45'} inputMode="decimal" step={String(metric.step)} autoFocus />
            )}
            {metric.unit === 'ft-in' && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>Half inches are fine: type 4.5 for 4½″.</div>}

            {entered != null && !parsed.error && (
              <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Saving for {firstName(player.name)}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '2.2rem', lineHeight: 1.1, color: blocking ? 'var(--danger)' : 'var(--text-primary)' }}>{combineText(metric, entered)}</div>
                {metric.unit === 'ft-in' && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{entered} inches</div>}
                {vertical != null && !blocking && <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--carolina-dark)' }}>= {vertical}″ {metric.key === 'approach_vertical_in' ? 'approach' : 'standing'} vertical</div>}
              </div>
            )}
            {blocking && typed && (
              <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--danger-light)', color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 600 }}>{blocking}</div>
            )}
            {warning && (
              <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--warning-light)', border: '1.5px solid var(--warning)', color: '#92400e', fontSize: '0.85rem', fontWeight: 600 }}>
                {warning}{warningOk === warning ? ' Tap Save again if it\'s right.' : ''}
              </div>
            )}
            {saveError && <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--danger-light)', color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 600 }}>{saveError}</div>}

            <button className="btn-volt" onClick={save} disabled={saving || entered == null || !!blocking}
              style={{ width: '100%', marginTop: '0.875rem', padding: '1rem', fontSize: '1.1rem' }}>
              {saving ? 'Saving…' : warningOk === warning && warning ? 'Yes, it\'s right. Save' : single ? 'Save' : `Save try ${tries.length + 1}`}
            </button>
          </>
        ) : (
          <div style={{ padding: '0.6rem 0.85rem', borderRadius: 10, background: 'var(--gray-light)', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
            All {metric.maxAttempts} tries are in; the best counts. Delete a try if one was entered wrong.
          </div>
        )}

        <button className="btn-ghost" onClick={props.onClose} style={{ width: '100%', marginTop: '0.6rem', padding: '0.8rem', fontSize: '0.95rem' }}>
          {best != null ? `Done with ${firstName(player.name)} · next player` : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
