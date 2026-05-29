'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Team { id: string; name: string; age_group?: string; color: string }
interface Player { id: string; name: string; jersey_number?: string; teamId: string }

type Step = 'team' | 'player' | 'pin'

export default function HomePage() {
  const router = useRouter()
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState<Step>('team')
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [search, setSearch] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [checkingIn, setCheckingIn] = useState(false)

  useEffect(() => {
    localStorage.removeItem('vx_session')
    Promise.all([
      fetch('/api/coach/teams').then(r => r.json()),
      fetch('/api/player/list').then(r => r.json()),
    ]).then(([teamData, playerData]) => {
      setTeams(teamData.teams ?? [])
      // player/list doesn't return teamId — fetch from player_teams via teams API
      // We'll match using the player_teams join we already have
      setPlayers(playerData.players ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Fetch players for selected team
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([])
  const [loadingTeamPlayers, setLoadingTeamPlayers] = useState(false)

  async function selectTeam(team: Team) {
    setSelectedTeam(team)
    setSearch('')
    setStep('player')
    setLoadingTeamPlayers(true)
    // Fetch players for this specific team
    const res = await fetch(`/api/coach/team-detail?teamId=${team.id}`)
    const d = await res.json()
    setTeamPlayers((d.roster ?? []).map((p: { id: string; name: string; jerseyNumber?: string }) => ({
      id: p.id, name: p.name, jersey_number: p.jerseyNumber, teamId: team.id,
    })))
    setLoadingTeamPlayers(false)
  }

  function selectPlayer(player: Player) {
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

  async function handleCheckin() {
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
      localStorage.setItem('vx_session', JSON.stringify({
        sessionId: data.sessionId, playerId: selectedPlayer.id, playerName: selectedPlayer.name,
        teamId: data.teamId, templateId: data.templateId,
        hasHealthFlags: data.hasHealthFlags, healthReports: data.healthReports,
        isResumed: data.isResumed,
      }))
      router.push('/player/bodycheck')
    } catch { setError('Something went wrong'); setCheckingIn(false) }
  }

  const keys = ['1','2','3','4','5','6','7','8','9','←','0','✓']
  const filteredPlayers = teamPlayers.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2.5rem 1rem', background: 'var(--page-bg)' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }} className="fade-up">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.25rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--black)' }}>VORTEX</h1>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {teams.map(team => (
                <button key={team.id} onClick={() => selectTeam(team)}
                  style={{ background: 'var(--white)', border: `2px solid ${team.color}40`, borderRadius: 12, padding: '1rem 1.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left', transition: 'all 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = team.color; e.currentTarget.style.background = `${team.color}08` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = `${team.color}40`; e.currentTarget.style.background = 'var(--white)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: team.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.2rem', color: '#fff', flexShrink: 0 }}>
                    {team.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--black)' }}>{team.name}</div>
                    {team.age_group && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{team.age_group}</div>}
                  </div>
                  <div style={{ marginLeft: 'auto', color: team.color, fontSize: '1.2rem' }}>›</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: '1.75rem', textAlign: 'center' }}>
              <a href="/coach" style={{ color: 'var(--carolina-dark)', fontSize: '0.8rem', textDecoration: 'none', letterSpacing: '0.05em', fontWeight: 500 }}>Coach Dashboard →</a>
            </div>
          </div>
        )}

        {/* ── STEP 2: PLAYER ── */}
        {step === 'player' && selectedTeam && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <button onClick={() => { setStep('team'); setSelectedTeam(null); setTeamPlayers([]) }}
                style={{ background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 8, color: 'var(--carolina-dark)', cursor: 'pointer', padding: '0.35rem 0.875rem', fontSize: '0.85rem', fontWeight: 600, flexShrink: 0 }}>← Teams</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: selectedTeam.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: '#fff', flexShrink: 0 }}>
                  {selectedTeam.name.charAt(0)}
                </div>
                <span style={{ fontWeight: 700, color: 'var(--black)' }}>{selectedTeam.name}</span>
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.875rem' }}>Who are you?</p>
            <input className="input" placeholder="Search your name…" value={search}
              onChange={e => setSearch(e.target.value)} style={{ marginBottom: '0.75rem' }} autoComplete="off" autoFocus />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 380, overflowY: 'auto' }}>
              {loadingTeamPlayers && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Loading roster…</div>}
              {!loadingTeamPlayers && filteredPlayers.length === 0 && (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem', fontSize: '0.85rem' }}>No players found</div>
              )}
              {filteredPlayers.sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                <button key={p.id} onClick={() => selectPlayer(p)}
                  style={{ background: 'var(--white)', border: `1.5px solid ${selectedTeam.color}30`, borderRadius: 10, padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--black)', textAlign: 'left', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = selectedTeam.color; e.currentTarget.style.background = `${selectedTeam.color}08` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = `${selectedTeam.color}30`; e.currentTarget.style.background = 'var(--white)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: selectedTeam.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {(p as unknown as { jersey_number?: string }).jersey_number || p.name.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                  <div style={{ marginLeft: 'auto', color: selectedTeam.color, fontSize: '1.1rem' }}>›</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 3: PIN ── */}
        {step === 'pin' && selectedPlayer && selectedTeam && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
              <button onClick={() => { setStep('player'); setSelectedPlayer(null); setPin(''); setError('') }}
                style={{ background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 8, color: 'var(--carolina-dark)', cursor: 'pointer', padding: '0.35rem 0.875rem', fontSize: '0.85rem', fontWeight: 600 }}>← Back</button>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Checking in as <strong style={{ color: 'var(--black)' }}>{selectedPlayer.name}</strong>
              </span>
            </div>

            {/* Player avatar */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: selectedTeam.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.75rem', color: '#fff', margin: '0 auto 0.625rem' }}>
                {(selectedPlayer as unknown as { jersey_number?: string }).jersey_number || selectedPlayer.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.2rem', color: 'var(--black)' }}>{selectedPlayer.name}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{selectedTeam.name}</div>
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
                  style={{ width: '100%', background: k === '✓' ? selectedTeam.color : 'var(--white)', color: k === '✓' ? '#fff' : 'var(--black)', fontWeight: k === '✓' ? 700 : 600, opacity: k === '✓' && pin.length !== 4 ? 0.4 : 1 }}
                  disabled={checkingIn}>{k}</button>
              ))}
            </div>
            {checkingIn && <div style={{ textAlign: 'center', color: 'var(--carolina-dark)', fontWeight: 500 }}>Checking in…</div>}
          </div>
        )}
      </div>
    </div>
  )
}
