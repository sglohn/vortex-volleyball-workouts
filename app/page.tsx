// FILE: app/page.tsx
//
// Player sign-in: team → name → 4-digit PIN.
// Team list: team name, with its coaches in small type underneath
// ("Coach Emma Haddix"), and a search box (long lists only) that finds a
// team by team name or coach name.
// Team coaches sign in here too: their names are at the top of their team's
// list, tagged "Coach", and their PIN opens the coach side (app/api/coach).
// Admins use the small "Admin" link at the bottom (app/coach/page.tsx).
// Lacrosse (week plan teams, lib/weekPlan.ts): after the PIN, a "this week"
// card shows her Days in order — the one waiting, the ones done, the ones
// still locked — or why nothing is waiting (done today, done for the week,
// no workouts posted). Volleyball goes straight to the body check as before.
// Roster comes from /api/player/roster (names only). It used to come from
// /api/coach/team-detail, which is now coach-only.

'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BrandMark from '@/components/BrandMark'
import { BRAND } from '@/lib/brand'
import { teamInitial } from '@/lib/teamInitial'

interface Team { id: string; name: string; age_group?: string; color: string; coaches?: string[] }

// Show the team search box once the list is long enough to need it
const TEAM_SEARCH_MIN = 8

// Team or coach name contains what was typed ("nova", "haddix", "coach emma")
function teamMatches(team: Team, text: string): boolean {
  const s = text.trim().toLowerCase()
  if (!s) return true
  return team.name.toLowerCase().includes(s) || (team.coaches ?? []).some(c => c.toLowerCase().includes(s))
}
interface Player { id: string; name: string; jersey_number?: string; teamId: string }
interface TeamCoach { id: string; name: string }

type Step = 'team' | 'player' | 'pin' | 'week'

// From /api/checkin on week plan teams (publicWeek in lib/weekPlan.ts)
type DayState = 'done' | 'in_progress' | 'next' | 'locked'
interface WeekDay { slot: number; name: string; state: DayState; finishedOn: string | null }
interface WeekInfo {
  weekStart: string
  status: 'ready' | 'done_today' | 'week_done' | 'no_plan'
  total: number
  nextSlot: number | null
  resumed: boolean
  days: WeekDay[]
}

function dayName(date: string): string {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' })
}

function WeekDayRow({ day, onStart, resumed, starting }: { day: WeekDay; onStart: () => void; resumed: boolean; starting: boolean }) {
  const current = day.state === 'next' || day.state === 'in_progress'
  const done = day.state === 'done'
  const prev = day.slot - 1
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.875rem', padding: current ? '1rem' : '0.75rem 1rem', borderRadius: 12,
      background: current ? 'var(--white)' : done ? 'var(--success-light)' : 'var(--white)',
      border: current ? '2px solid var(--carolina)' : `1.5px solid ${done ? '#bbf7d0' : 'var(--gray-border)'}`,
      boxShadow: current ? '0 2px 10px rgba(0,0,0,0.08)' : 'none',
      opacity: day.state === 'locked' ? 0.55 : 1,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem',
        background: done ? 'var(--success)' : current ? 'var(--carolina)' : 'var(--gray-border)', color: '#fff' }}>
        {done ? '✓' : day.state === 'locked' ? <span aria-hidden style={{ fontSize: '0.95rem' }}>🔒</span> : day.slot}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--black)' }}>Day {day.slot}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{day.name}</div>
        {done && day.finishedOn && <div style={{ fontSize: '0.72rem', color: 'var(--success)', fontWeight: 600 }}>Done {dayName(day.finishedOn)}</div>}
        {day.state === 'locked' && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Finish Day {prev} first</div>}
      </div>
      {current && (
        <button className="btn-volt" onClick={onStart} disabled={starting} style={{ padding: '0.625rem 1.1rem', fontSize: '0.9rem', flexShrink: 0 }}>
          {resumed ? 'Keep going' : 'Start'}
        </button>
      )}
    </div>
  )
}

// A team coach in the "Who are you?" list
function CoachRow({ coach, color, onPick }: { coach: TeamCoach; color: string; onPick: () => void }) {
  return (
    <button onClick={onPick}
      style={{ background: 'var(--white)', border: `1.5px solid ${color}30`, borderRadius: 10, padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--black)', textAlign: 'left', transition: 'all 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = `${color}08` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = `${color}30`; e.currentTarget.style.background = 'var(--white)' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
        {coach.name.charAt(0).toUpperCase()}
      </div>
      <span style={{ fontWeight: 500 }}>{coach.name}</span>
      <span className="tag" style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: 6, background: 'var(--black)', color: '#fff' }}>Coach</span>
      <div style={{ marginLeft: 'auto', color, fontSize: '1.1rem' }}>›</div>
    </button>
  )
}

export default function HomePage() {
  const router = useRouter()
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState<Step>('team')
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [search, setSearch] = useState('')
  const [teamSearch, setTeamSearch] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [checkingIn, setCheckingIn] = useState(false)
  const [week, setWeek] = useState<WeekInfo | null>(null)

  useEffect(() => {
    localStorage.removeItem('vx_session')
    Promise.all([
      fetch('/api/coach/teams?all=1').then(r => r.json()),
      fetch('/api/player/list').then(r => r.json()),
    ]).then(([teamData, playerData]) => {
      setTeams(teamData.teams ?? [])
      setPlayers((playerData.players ?? []).map((p: { id: string; name: string; jersey_number?: string }) => ({
        id: p.id, name: p.name, jersey_number: p.jersey_number, teamId: '',
      })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Fetch players for selected team
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([])
  const [teamCoaches, setTeamCoaches] = useState<TeamCoach[]>([])
  const [loadingTeamPlayers, setLoadingTeamPlayers] = useState(false)
  // Set when the person signing in is one of the team's coaches, not a player
  const [selectedCoach, setSelectedCoach] = useState<TeamCoach | null>(null)

  async function selectTeam(team: Team) {
    setSelectedTeam(team)
    setSearch('')
    setStep('player')
    setLoadingTeamPlayers(true)
    // Fetch players for this specific team
    const res = await fetch(`/api/player/roster?teamId=${encodeURIComponent(team.id)}`)
    const d = await res.json()
    setTeamPlayers((d.roster ?? []).map((p: { id: string; name: string; jerseyNumber?: string }) => ({
      id: p.id, name: p.name, jersey_number: p.jerseyNumber, teamId: team.id,
    })))
    setTeamCoaches(d.coaches ?? [])
    setLoadingTeamPlayers(false)
  }

  function selectPlayer(player: Player) {
    setSelectedCoach(null)
    setSelectedPlayer(player)
    setPin('')
    setError('')
    setStep('pin')
  }

  function handleKey(k: string) {
    setError('')
    if (k === '←') { setPin(p => p.slice(0, -1)); return }
    if (pin.length >= 4) return
    setPin(p => p + k)
  }

  function selectCoach(c: TeamCoach) {
    setSelectedCoach(c)
    setSelectedPlayer({ id: c.id, name: c.name, teamId: selectedTeam?.id ?? '' })
    setPin('')
    setError('')
    setStep('pin')
  }

  async function coachSignIn() {
    if (!selectedCoach || pin.length !== 4) return
    setCheckingIn(true); setError('')
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId: selectedCoach.id, pin }),
      })
      if (res.ok) {
        localStorage.setItem('vx_coach', 'true')
        router.push('/coach/dashboard')
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data?.error || (res.status === 401 ? 'Wrong PIN' : `Server error (${res.status}). Try again in a minute.`))
      setPin(''); setCheckingIn(false)
    } catch { setError('Something went wrong'); setCheckingIn(false) }
  }

  async function handleCheckin() {
    if (selectedCoach) return coachSignIn()
    if (!selectedPlayer || pin.length !== 4) return
    setCheckingIn(true); setError('')
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: selectedPlayer.id, pin }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Invalid PIN'); setPin(''); setCheckingIn(false); return }
      if (data.week) {
        // Week plan team: show her week first. Only save a sign-in when
        // there's a workout waiting.
        if (data.sessionId) saveSession(data)
        setWeek(data.week as WeekInfo)
        setStep('week')
        setCheckingIn(false)
        return
      }
      saveSession(data)
      router.push('/player/bodycheck')
    } catch { setError('Something went wrong'); setCheckingIn(false) }
  }

  function saveSession(data: Record<string, unknown>) {
    if (!selectedPlayer) return
    localStorage.setItem('vx_session', JSON.stringify({
        sessionId: data.sessionId, playerId: selectedPlayer.id, playerName: selectedPlayer.name,
        teamId: data.teamId, templateId: data.templateId,
        hasHealthFlags: data.hasHealthFlags, healthReports: data.healthReports,
        isResumed: data.isResumed,
        playerPass: data.playerPass,
      }))
  }

  // Back to the start, signed out
  function doneWithWeek() {
    localStorage.removeItem('vx_session')
    setWeek(null); setSelectedPlayer(null); setPin(''); setError('')
    setStep(selectedTeam ? 'player' : 'team')
  }

  const keys = ['1','2','3','4','5','6','7','8','9','←','0','✓']
  const filteredPlayers = teamPlayers.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2.5rem 1rem', background: 'var(--page-bg)' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }} className="fade-up">
        <div style={{ display: 'flex', flexDirection: BRAND.markSrc ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <BrandMark size={BRAND.markSrc ? 88 : 44} tone="dark" />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: BRAND.markSrc ? 'clamp(1.6rem, 8vw, 2.25rem)' : '2.25rem', whiteSpace: 'nowrap', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--black)' }}>{BRAND.name}</h1>
        </div>
        <p style={{ color: 'var(--carolina-dark)', fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>Strength & Conditioning</p>
        <div style={{ height: 3, width: 60, background: 'linear-gradient(90deg, var(--black), var(--carolina))', borderRadius: 2, margin: '0.625rem auto 0' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 420 }} className="fade-up">

        {/* ── STEP 1: TEAM ── */}
        {step === 'team' && (
          <div>
            <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.95rem', marginBottom: '1rem', textAlign: 'center' }}>Which team are you on?</p>
            {loading && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Loading…</div>}
            {teams.length >= TEAM_SEARCH_MIN && (
              <input className="input" placeholder="Search team or coach…" value={teamSearch}
                onChange={e => setTeamSearch(e.target.value)} style={{ marginBottom: '0.75rem' }} autoComplete="off" />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {!loading && teamSearch && !teams.some(t => teamMatches(t, teamSearch)) && (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem', fontSize: '0.85rem' }}>No teams or coaches found</div>
              )}
              {teams.filter(t => teamMatches(t, teamSearch)).map(team => (
                <button key={team.id} onClick={() => selectTeam(team)}
                  style={{ background: 'var(--white)', border: `2px solid ${team.color}40`, borderRadius: 12, padding: '1rem 1.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left', transition: 'all 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = team.color; e.currentTarget.style.background = `${team.color}08` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = `${team.color}40`; e.currentTarget.style.background = 'var(--white)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: team.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.2rem', color: '#fff', flexShrink: 0 }}>
                    {teamInitial(team.name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--black)' }}>{team.name}</div>
                    {team.coaches?.length
                      ? <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{team.coaches.join(' · ')}</div>
                      : team.age_group && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{team.age_group}</div>}
                  </div>
                  <div style={{ marginLeft: 'auto', color: team.color, fontSize: '1.2rem' }}>›</div>
                </button>
              ))}
            </div>

            {/* Option for players not on a team */}
            <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--gray-border)', textAlign: 'center' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.625rem' }}>Not on a team roster?</p>
              <button onClick={() => { setSelectedTeam(null); setSearch(''); setTeamPlayers([]); setStep('player') }}
                style={{ background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 10, padding: '0.625rem 1.25rem', cursor: 'pointer', color: 'var(--carolina-dark)', fontSize: '0.85rem', fontWeight: 600 }}>
                Search all players →
              </button>
            </div>

            <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
              <a href="/coach" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textDecoration: 'none', letterSpacing: '0.05em', fontWeight: 500 }}>Admin</a>
            </div>
          </div>
        )}

        {/* ── STEP 2: PLAYER ── */}
        {step === 'player' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <button onClick={() => { setStep('team'); setSelectedTeam(null); setTeamPlayers([]); setTeamCoaches([]) }}
                style={{ background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 8, color: 'var(--carolina-dark)', cursor: 'pointer', padding: '0.35rem 0.875rem', fontSize: '0.85rem', fontWeight: 600, flexShrink: 0 }}>← Back</button>
              {selectedTeam ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: selectedTeam.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: '#fff', flexShrink: 0 }}>
                    {teamInitial(selectedTeam.name)}
                  </div>
                  <span style={{ fontWeight: 700, color: 'var(--black)' }}>{selectedTeam.name}</span>
                </div>
              ) : (
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>All Players</span>
              )}
            </div>

            <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.875rem' }}>Who are you?</p>
            <input className="input" placeholder="Search your name…" value={search}
              onChange={e => setSearch(e.target.value)} style={{ marginBottom: '0.75rem' }} autoComplete="off" autoFocus />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 380, overflowY: 'auto' }}>
              {loadingTeamPlayers && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Loading…</div>}
              {!loadingTeamPlayers && (() => {
                // Show team players if a team was selected, otherwise show all players filtered by search
                const displayList = selectedTeam
                  ? filteredPlayers
                  : players.filter(p => search.length >= 2 && p.name.toLowerCase().includes(search.toLowerCase()))
                const noResults = selectedTeam ? (!loadingTeamPlayers && filteredPlayers.length === 0) : (search.length >= 2 && displayList.length === 0)
                return (
                  <>
                    {!selectedTeam && search.length < 2 && (
                      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem', fontSize: '0.85rem' }}>Type at least 2 letters to search</div>
                    )}
                    {selectedTeam && teamCoaches
                      .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
                      .map(c => <CoachRow key={c.id} coach={c} color={selectedTeam.color} onPick={() => selectCoach(c)} />)}
                    {noResults && !(selectedTeam && teamCoaches.some(c => c.name.toLowerCase().includes(search.toLowerCase()))) && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem', fontSize: '0.85rem' }}>No players found</div>}
                    {displayList.sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                      <button key={p.id} onClick={() => selectPlayer(p)}
                        style={{ background: 'var(--white)', border: `1.5px solid ${selectedTeam ? `${selectedTeam.color}30` : 'var(--gray-border)'}`, borderRadius: 10, padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--black)', textAlign: 'left', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = selectedTeam?.color ?? 'var(--carolina)'; e.currentTarget.style.background = selectedTeam ? `${selectedTeam.color}08` : 'var(--carolina-light)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = selectedTeam ? `${selectedTeam.color}30` : 'var(--gray-border)'; e.currentTarget.style.background = 'var(--white)' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: selectedTeam?.color ?? 'var(--carolina)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {(p as unknown as { jersey_number?: string }).jersey_number || p.name.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500 }}>{p.name}</span>
                        <div style={{ marginLeft: 'auto', color: selectedTeam?.color ?? 'var(--carolina)', fontSize: '1.1rem' }}>›</div>
                      </button>
                    ))}
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {/* ── STEP 3: PIN ── */}
        {step === 'pin' && selectedPlayer && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
              <button onClick={() => { setStep('player'); setSelectedPlayer(null); setSelectedCoach(null); setPin(''); setError('') }}
                style={{ background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 8, color: 'var(--carolina-dark)', cursor: 'pointer', padding: '0.35rem 0.875rem', fontSize: '0.85rem', fontWeight: 600 }}>← Back</button>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                {selectedCoach ? 'Signing in as ' : 'Checking in as '}<strong style={{ color: 'var(--black)' }}>{selectedPlayer.name}</strong>
              </span>
            </div>

            {/* Player avatar */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: selectedTeam?.color ?? 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.75rem', color: '#fff', margin: '0 auto 0.625rem' }}>
                {(selectedPlayer as unknown as { jersey_number?: string }).jersey_number || selectedPlayer.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.2rem', color: 'var(--black)' }}>{selectedPlayer.name}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{selectedCoach ? `Coach · ${selectedTeam?.name ?? ''}` : selectedTeam?.name ?? 'Individual Program'}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
              {[0,1,2,3].map(i => (
                <div key={i} className={`pin-digit ${i < pin.length ? 'filled' : ''}`}>{i < pin.length ? '●' : ''}</div>
              ))}
            </div>

            {error && (
              <div style={{ background: 'var(--danger-light)', border: '1.5px solid #fecaca', borderRadius: 8, padding: '0.625rem', marginBottom: '1rem', color: 'var(--danger)', textAlign: 'center', fontSize: '0.9rem' }}>{error}</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
              {keys.map(k => (
                <button key={k} className="pin-key"
                  onClick={() => k === '✓' ? handleCheckin() : handleKey(k)}
                  style={{ width: '100%', background: k === '✓' ? (selectedTeam?.color ?? 'var(--carolina)') : 'var(--white)', color: k === '✓' ? '#fff' : 'var(--black)', fontWeight: k === '✓' ? 700 : 600, opacity: k === '✓' && pin.length !== 4 ? 0.4 : 1 }}
                  disabled={checkingIn}>{k}</button>
              ))}
            </div>
            {checkingIn && <div style={{ textAlign: 'center', color: 'var(--carolina-dark)', fontWeight: 500 }}>{selectedCoach ? 'Signing in…' : 'Checking in…'}</div>}
          </div>
        )}

        {/* ── STEP 4: THIS WEEK (week plan teams) ── */}
        {step === 'week' && week && selectedPlayer && (() => {
          const done = week.days.filter(d => d.state === 'done').length
          const next = week.days.find(d => d.slot === week.nextSlot)
          let heading: string
          let sub: string
          if (week.status === 'ready') {
            heading = week.resumed ? `Day ${week.nextSlot} is waiting` : `Day ${week.nextSlot} of ${week.total} is waiting`
            sub = week.resumed ? 'Pick up where you left off.' : done ? `${done} down, ${week.total - done} to go this week.` : 'Here\'s your week. Do them in order, one a day.'
          } else if (week.status === 'done_today') {
            heading = 'Nice work today!'
            sub = next ? `Day ${next.slot} will be ready tomorrow. One workout a day.` : 'Your next workout will be ready tomorrow.'
          } else if (week.status === 'week_done') {
            heading = 'You\'re done for the week!'
            sub = 'All workouts finished. New ones start Monday.'
          } else {
            heading = 'No workouts posted yet'
            sub = 'Check back later this week.'
          }
          return (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Hi, {selectedPlayer.name.split(' ')[0]}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--black)', lineHeight: 1.15 }}>{heading}</div>
                <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '0.375rem' }}>{sub}</div>
              </div>

              {week.days.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  {week.days.map(d => (
                    <WeekDayRow key={d.slot} day={d} resumed={week.resumed} starting={checkingIn}
                      onStart={() => { setCheckingIn(true); router.push('/player/bodycheck') }} />
                  ))}
                </div>
              )}

              <div style={{ textAlign: 'center' }}>
                <button className="btn-ghost" onClick={doneWithWeek} style={{ padding: '0.6rem 1.5rem', fontSize: '0.9rem' }}>
                  {week.status === 'ready' ? 'Not now' : 'Sign out'}
                </button>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
