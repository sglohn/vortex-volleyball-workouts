'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Team { id: string; name: string; color: string; age_group?: string; is_open_gym?: boolean }
interface Player { id: string; name: string; jersey_number?: string; position?: string; teamId?: string; teamName?: string; teamColor?: string }

export default function SeasonRolloverPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [assignments, setAssignments] = useState<Record<string, string | null>>({}) // playerId → teamId | null
  const [filter, setFilter] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/coach/teams').then(r => r.json()),
      fetch('/api/coach/players').then(r => r.json()),
    ]).then(([td, pd]) => {
      const activeTeams = (td.teams ?? []).filter((t: Team) => !t.is_open_gym)
      setTeams(activeTeams)
      const allPlayers = pd.players ?? []
      setPlayers(allPlayers)
      // Seed assignments from current state
      const init: Record<string, string | null> = {}
      for (const p of allPlayers) init[p.id] = p.teamId ?? null
      setAssignments(init)
      setLoading(false)
    })
  }, [])

  async function assignPlayer(playerId: string, teamId: string | null) {
    setAssignments(prev => ({ ...prev, [playerId]: teamId }))
    setSaving(prev => ({ ...prev, [playerId]: true }))
    setSaved(prev => ({ ...prev, [playerId]: false }))

    await fetch('/api/coach/players/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, teamId }),
    })

    setSaving(prev => ({ ...prev, [playerId]: false }))
    setSaved(prev => ({ ...prev, [playerId]: true }))
    setTimeout(() => setSaved(prev => ({ ...prev, [playerId]: false })), 2000)

    // Update local player list to reflect new team
    setPlayers(prev => prev.map(p => {
      if (p.id !== playerId) return p
      const team = teams.find(t => t.id === teamId)
      return { ...p, teamId: teamId ?? undefined, teamName: team?.name, teamColor: team?.color }
    }))
  }

  const activeTeams = teams.filter(t => !t.is_open_gym)
  const filteredPlayers = players.filter(p =>
    !filter || p.name.toLowerCase().includes(filter.toLowerCase())
  )

  // Group by current assignment
  const byTeam: Record<string, Player[]> = { unassigned: [] }
  for (const t of activeTeams) byTeam[t.id] = []
  for (const p of filteredPlayers) {
    const tid = assignments[p.id]
    if (tid && byTeam[tid]) byTeam[tid].push(p)
    else byTeam.unassigned.push(p)
  }

  const unassignedCount = players.filter(p => !assignments[p.id]).length

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <Link href="/coach/teams" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}>← Teams</Link>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800 }}>Season Rollover</h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6 }}>
          Reassign players to their new teams for the upcoming season. All player data, measurements, and workout history carry over automatically.
          {unassignedCount > 0 && (
            <span style={{ marginLeft: '0.5rem', color: 'var(--danger)', fontWeight: 600 }}>
              ⚠ {unassignedCount} player{unassignedCount !== 1 ? 's' : ''} not yet assigned.
            </span>
          )}
        </p>
      </div>

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {activeTeams.map(t => {
          const count = Object.values(assignments).filter(tid => tid === t.id).length
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.75rem', borderRadius: 20, background: `${t.color}14`, border: `1.5px solid ${t.color}40`, fontSize: '0.8rem', fontWeight: 600, color: t.color }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color }} />
              {t.name} · {count}
            </div>
          )
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.75rem', borderRadius: 20, background: 'var(--court-raised)', border: '1.5px solid var(--gray-border)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          Unassigned · {unassignedCount}
        </div>
      </div>

      {/* Search */}
      <input
        className="input"
        placeholder="Search players…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        style={{ marginBottom: '1.5rem', padding: '0.625rem 0.875rem', fontSize: '0.9rem', maxWidth: 340 }}
      />

      {/* Player table by team group */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Unassigned players first — most urgent */}
        {byTeam.unassigned.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--danger)' }} />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--danger)' }}>
                Unassigned ({byTeam.unassigned.length})
              </span>
            </div>
            <PlayerTable players={byTeam.unassigned} teams={activeTeams} assignments={assignments} saving={saving} saved={saved} onAssign={assignPlayer} />
          </div>
        )}

        {/* Teams in order */}
        {activeTeams.map(t => {
          if (!byTeam[t.id]?.length) return null
          return (
            <div key={t.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.color }} />
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: t.color }}>
                  {t.name} ({byTeam[t.id].length})
                </span>
                {t.age_group && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.age_group}</span>}
              </div>
              <PlayerTable players={byTeam[t.id]} teams={activeTeams} assignments={assignments} saving={saving} saved={saved} onAssign={assignPlayer} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Module-level component to avoid remounting bugs
function PlayerTable({ players, teams, assignments, saving, saved, onAssign }: {
  players: Player[]
  teams: Team[]
  assignments: Record<string, string | null>
  saving: Record<string, boolean>
  saved: Record<string, boolean>
  onAssign: (playerId: string, teamId: string | null) => void
}) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {players.map((p, i) => {
            const currentTeamId = assignments[p.id]
            const currentTeam = teams.find(t => t.id === currentTeamId)
            const isSaving = saving[p.id]
            const isSaved = saved[p.id]
            return (
              <tr key={p.id} style={{ borderTop: i > 0 ? '1px solid var(--gray-border)' : 'none' }}>
                <td style={{ padding: '0.625rem 1rem', width: 32 }}>
                  {p.jersey_number
                    ? <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: currentTeam?.color ?? 'var(--text-muted)' }}>#{p.jersey_number}</span>
                    : <span style={{ width: 28, height: 28, borderRadius: '50%', background: currentTeam?.color ? `${currentTeam.color}20` : 'var(--court-raised)', border: `1.5px solid ${currentTeam?.color ?? 'var(--gray-border)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.75rem', color: currentTeam?.color ?? 'var(--text-muted)' }}>{p.name.charAt(0)}</span>
                  }
                </td>
                <td style={{ padding: '0.625rem 0.5rem' }}>
                  <Link href={`/coach/players/${p.id}`} style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', textDecoration: 'none' }}>
                    {p.name}
                  </Link>
                  {p.position && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.position}</div>}
                </td>
                <td style={{ padding: '0.625rem 1rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', justifyContent: 'flex-end' }}>
                    {isSaved && <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>✓ Saved</span>}
                    <select
                      value={currentTeamId ?? ''}
                      disabled={isSaving}
                      onChange={e => onAssign(p.id, e.target.value || null)}
                      style={{
                        padding: '0.35rem 0.625rem',
                        border: `1.5px solid ${currentTeam?.color ?? 'var(--gray-border)'}`,
                        borderRadius: 7,
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        background: currentTeam?.color ? `${currentTeam.color}10` : 'var(--white)',
                        color: currentTeam?.color ?? 'var(--text-muted)',
                        cursor: 'pointer',
                        minWidth: 160,
                        opacity: isSaving ? 0.6 : 1,
                      }}
                    >
                      <option value="">— Unassigned —</option>
                      {teams.map(t => (
                        <option key={t.id} value={t.id}>{t.name}{t.age_group ? ` (${t.age_group})` : ''}</option>
                      ))}
                    </select>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
