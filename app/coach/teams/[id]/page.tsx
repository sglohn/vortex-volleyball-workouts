'use client'
import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { inchesToFeetInches, painLevelColor, painLevelLabel } from '@/lib/fitness'
import { PHASE_CONFIG, PhaseType } from '@/lib/types'

interface Measurement { height_in?: number; wingspan_in?: number; standing_reach_in?: number; standing_vertical_in?: number; approach_vertical_in?: number; measured_at?: string }
interface HealthReport { id: string; report_type: string; body_part: string; pain_level?: number; status: string; confirmed_by_coach: boolean; description?: string; reported_at: string; coach_notes?: string }
interface StrengthEntry { exerciseId: string; exerciseName: string; best1RM: number; trend: string }
interface RosterPlayer { id: string; name: string; jerseyNumber?: string; position?: string; measurements: Measurement | null; healthReports: HealthReport[]; sessionCount: number; lastSeen: string | null; strength: StrengthEntry[] }
interface Team { id: string; name: string; age_group?: string; color: string }
interface Phase { id: string; phase_type: string; name: string; description?: string }

type Tab = 'roster' | 'stats' | 'health'

const MEAS_FIELDS = [
  { key: 'height_in',            label: 'Height',            showFt: true  },
  { key: 'wingspan_in',          label: 'Wingspan',          showFt: true  },
  { key: 'standing_reach_in',    label: 'Standing Reach',    showFt: true  },
  { key: 'standing_vertical_in', label: 'Standing Vertical', showFt: false },
  { key: 'approach_vertical_in', label: 'Approach Vertical', showFt: false },
]
const POSITIONS = ['Setter','Outside Hitter','Middle Blocker','Opposite','Libero','Defensive Specialist','Other']
const TREND_COLOR: Record<string, string> = { up: 'var(--success)', down: 'var(--danger)', flat: 'var(--text-muted)' }
const TREND_ICON: Record<string, string> = { up: '↑', down: '↓', flat: '→' }

function MeasField({ label, valIn, showFt }: { label: string; valIn?: number; showFt: boolean }) {
  if (!valIn) return <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>—</div>
  return (
    <div>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--carolina-deep)' }}>{valIn}"</span>
      {showFt && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '0.3rem' }}>({inchesToFeetInches(valIn)})</span>}
    </div>
  )
}

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: teamId } = use(params)
  const [team, setTeam] = useState<Team | null>(null)
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [phase, setPhase] = useState<Phase | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('roster')

  // Edit player modal
  const [editPlayer, setEditPlayer] = useState<RosterPlayer | null>(null)
  const [editForm, setEditForm] = useState({ name: '', jersey_number: '', position: '', pin: '' })
  const [editMeas, setEditMeas] = useState({ height_in: '', wingspan_in: '', standing_reach_in: '', standing_vertical_in: '', approach_vertical_in: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg, setEditMsg] = useState('')

  // Health modal
  const [healthPlayer, setHealthPlayer] = useState<RosterPlayer | null>(null)
  const [healthSaving, setHealthSaving] = useState(false)

  // Add player to team
  const [addingPlayer, setAddingPlayer] = useState(false)
  const [allPlayers, setAllPlayers] = useState<Array<{ id: string; name: string; teamName?: string }>>([])
  const [newPlayerSearch, setNewPlayerSearch] = useState('')

  useEffect(() => { loadData() }, [teamId])

  async function loadData() {
    const res = await fetch(`/api/coach/team-detail?teamId=${teamId}`)
    const d = await res.json()
    setTeam(d.team); setRoster(d.roster ?? []); setPhase(d.currentPhase ?? null)
    setLoading(false)
  }

  function openEdit(p: RosterPlayer) {
    setEditPlayer(p)
    setEditForm({ name: p.name, jersey_number: p.jerseyNumber ?? '', position: p.position ?? '', pin: '' })
    setEditMeas({
      height_in: p.measurements?.height_in?.toString() ?? '',
      wingspan_in: p.measurements?.wingspan_in?.toString() ?? '',
      standing_reach_in: p.measurements?.standing_reach_in?.toString() ?? '',
      standing_vertical_in: p.measurements?.standing_vertical_in?.toString() ?? '',
      approach_vertical_in: p.measurements?.approach_vertical_in?.toString() ?? '',
    })
    setEditMsg('')
  }

  async function saveEdit() {
    if (!editPlayer) return
    setEditSaving(true)
    const body: Record<string, string> = { id: editPlayer.id, name: editForm.name, jersey_number: editForm.jersey_number, position: editForm.position }
    if (editForm.pin) body.pin = editForm.pin
    const res = await fetch('/api/coach/players/delete', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) { const d = await res.json(); setEditMsg(d.error || 'Error'); setEditSaving(false); return }

    const hasMeas = Object.values(editMeas).some(v => v !== '')
    if (hasMeas) {
      await fetch('/api/player/measurements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId: editPlayer.id, ...editMeas }) })
    }
    setEditPlayer(null); setEditSaving(false)
    loadData()
  }

  async function updateHealth(reportId: string, status: string, coachNotes: string) {
    await fetch('/api/player/health', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: reportId, confirmedByCoach: true, status, coachNotes }) })
    loadData()
  }

  async function removeFromTeam(playerId: string) {
    await fetch('/api/coach/players/delete', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: playerId, team_id: '' }) })
    loadData()
  }

  async function openAddPlayer() {
    const res = await fetch('/api/coach/players')
    const d = await res.json()
    const onTeam = new Set(roster.map(r => r.id))
    setAllPlayers((d.players ?? []).filter((p: { id: string }) => !onTeam.has(p.id)))
    setNewPlayerSearch('')
    setAddingPlayer(true)
  }

  async function addToTeam(playerId: string) {
    await fetch('/api/coach/players/delete', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: playerId, team_id: teamId }) })
    setAddingPlayer(false); loadData()
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>
  if (!team) return <div style={{ padding: '2rem', color: 'var(--danger)' }}>Team not found</div>

  const phaseConfig = phase ? PHASE_CONFIG[phase.phase_type as PhaseType] : null
  const activeHealthCount = roster.reduce((sum, p) => sum + p.healthReports.filter(r => r.status === 'active').length, 0)
  const filteredPlayers = allPlayers.filter(p => p.name.toLowerCase().includes(newPlayerSearch.toLowerCase()))

  return (
    <div style={{ padding: '2rem', maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.75rem' }}>
        <Link href="/coach/teams" style={{ color: 'var(--carolina-dark)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500, marginTop: '0.4rem' }}>← Teams</Link>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: team.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem', color: 'white', flexShrink: 0 }}>
          {team.name.charAt(0)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800 }}>{team.name}</h1>
            {team.age_group && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>{team.age_group}</span>}
            {phaseConfig && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: phaseConfig.color, background: `${phaseConfig.color}18`, padding: '0.2rem 0.625rem', borderRadius: 5, border: `1px solid ${phaseConfig.color}30` }}>{phaseConfig.label} Phase</span>}
            {activeHealthCount > 0 && <span className="tag tag-danger">⚠ {activeHealthCount} health flag{activeHealthCount > 1 ? 's' : ''}</span>}
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.2rem' }}>{roster.length} players</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          <a href={`/team/${teamId}`} target="_blank" rel="noopener noreferrer" style={{ background: 'var(--carolina)', color: 'var(--white)', fontSize: '0.82rem', textDecoration: 'none', fontWeight: 700, padding: '0.5rem 1rem', borderRadius: 8 }}>▶ Team Mode</a>
          <button onClick={openAddPlayer} className="btn-volt" style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}>+ Add Player</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', background: 'var(--carolina-light)', padding: '0.25rem', borderRadius: 10, width: 'fit-content', border: '1.5px solid var(--carolina-border)' }}>
        {([['roster','Roster'], ['stats','Measurements & Stats'], ['health','Health Board']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '0.5rem 1.1rem', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.12s', background: tab === t ? 'var(--carolina)' : 'transparent', color: tab === t ? 'var(--white)' : 'var(--carolina-dark)' }}>
            {label}{t === 'health' && activeHealthCount > 0 ? ` (${activeHealthCount})` : ''}
          </button>
        ))}
      </div>

      {/* ── ROSTER TAB ── */}
      {tab === 'roster' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--carolina-light)', borderBottom: '1.5px solid var(--carolina-border)' }}>
                {['Player','Position','Sessions','Last Active','Health','Actions'].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.72rem', color: 'var(--carolina-deep)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 && <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No players on this team yet.</td></tr>}
              {roster.map((p, i) => {
                const activeHealth = p.healthReports.filter(r => r.status === 'active' || r.status === 'monitoring')
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--gray-border)', background: i % 2 === 0 ? 'var(--white)' : 'rgba(238,244,255,0.3)' }}>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${team.color}22`, border: `1.5px solid ${team.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, color: team.color, fontSize: '0.85rem', flexShrink: 0 }}>
                          {p.jerseyNumber || p.name.charAt(0)}
                        </div>
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{p.position || '—'}</td>
                    <td style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{p.sessionCount}</td>
                    <td style={{ padding: '0.875rem 1rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{p.lastSeen ? new Date(p.lastSeen).toLocaleDateString() : 'Never'}</td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      {activeHealth.length > 0
                        ? <button onClick={() => { setHealthPlayer(p); setTab('health') }} style={{ background: 'var(--danger-light)', border: '1px solid #fecaca', borderRadius: 5, padding: '0.2rem 0.6rem', fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 700, cursor: 'pointer' }}>⚠ {activeHealth.length}</button>
                        : <span style={{ color: 'var(--success)', fontSize: '0.82rem' }}>✓ Clear</span>
                      }
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.625rem' }}>
                        <button onClick={() => openEdit(p)} style={{ background: 'none', border: 'none', color: 'var(--carolina-dark)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, padding: 0 }}>Edit</button>
                        <span style={{ color: 'var(--gray-border)' }}>|</span>
                        <Link href={`/coach/players/${p.id}`} style={{ color: 'var(--carolina-dark)', fontSize: '0.82rem', textDecoration: 'none', fontWeight: 600 }}>Detail</Link>
                        <span style={{ color: 'var(--gray-border)' }}>|</span>
                        <button onClick={() => removeFromTeam(p.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, padding: 0 }}>Remove</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── STATS TAB ── */}
      {tab === 'stats' && (
        <div>
          {/* Comparison table */}
          <div className="card" style={{ overflow: 'auto', marginBottom: '1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ background: 'var(--carolina-light)', borderBottom: '1.5px solid var(--carolina-border)' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.72rem', color: 'var(--carolina-deep)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, position: 'sticky', left: 0, background: 'var(--carolina-light)' }}>Player</th>
                  {MEAS_FIELDS.map(f => <th key={f.key} style={{ padding: '0.75rem 0.875rem', textAlign: 'center', fontSize: '0.72rem', color: 'var(--carolina-deep)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, whiteSpace: 'nowrap' }}>{f.label}</th>)}
                  <th style={{ padding: '0.75rem 0.875rem', textAlign: 'center', fontSize: '0.72rem', color: 'var(--carolina-deep)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Top Lift</th>
                  <th style={{ padding: '0.75rem 0.875rem', fontSize: '0.72rem', color: 'var(--carolina-deep)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}></th>
                </tr>
              </thead>
              <tbody>
                {roster.length === 0 && <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No players yet.</td></tr>}
                {roster.map((p, i) => {
                  const m = p.measurements
                  const topLift = p.strength[0]
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--gray-border)', background: i % 2 === 0 ? 'var(--white)' : 'rgba(238,244,255,0.3)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, fontSize: '0.9rem', position: 'sticky', left: 0, background: i % 2 === 0 ? 'var(--white)' : 'rgba(238,244,255,0.3)' }}>
                        <div>{p.name}</div>
                        {p.position && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>{p.position}</div>}
                      </td>
                      {MEAS_FIELDS.map(f => {
                        const val = m?.[f.key as keyof Measurement] as number | undefined
                        return (
                          <td key={f.key} style={{ padding: '0.75rem 0.875rem', textAlign: 'center' }}>
                            {val ? (
                              <div>
                                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--carolina-deep)' }}>{val}"</div>
                                {f.showFt && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{inchesToFeetInches(val)}</div>}
                              </div>
                            ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>}
                          </td>
                        )
                      })}
                      <td style={{ padding: '0.75rem 0.875rem', textAlign: 'center' }}>
                        {topLift ? (
                          <div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--black)' }}>{topLift.exerciseName}</div>
                            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--carolina)' }}>
                              {topLift.best1RM} lbs
                              <span style={{ fontSize: '0.8rem', color: TREND_COLOR[topLift.trend] ?? 'var(--text-muted)', marginLeft: '0.25rem' }}>{TREND_ICON[topLift.trend] ?? '→'}</span>
                            </div>
                          </div>
                        ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data</span>}
                      </td>
                      <td style={{ padding: '0.75rem 0.875rem' }}>
                        <button onClick={() => openEdit(p)} style={{ background: 'none', border: 'none', color: 'var(--carolina-dark)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: 0 }}>Edit</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Team averages */}
          {roster.length > 0 && (() => {
            const avgs = MEAS_FIELDS.map(f => {
              const vals = roster.map(p => p.measurements?.[f.key as keyof Measurement] as number | undefined).filter((v): v is number => !!v)
              return { ...f, avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null, count: vals.length }
            })
            return (
              <div className="card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--carolina-deep)', marginBottom: '1rem' }}>Team Averages</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
                  {avgs.map(f => (
                    <div key={f.key} style={{ textAlign: 'center', background: 'var(--carolina-light)', borderRadius: 10, padding: '0.875rem', border: '1.5px solid var(--carolina-border)' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--carolina-deep)', lineHeight: 1 }}>
                        {f.avg ? `${f.avg}"` : '—'}
                      </div>
                      {f.avg && f.showFt && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{inchesToFeetInches(f.avg)}</div>}
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginTop: '0.3rem' }}>{f.label}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{f.count}/{roster.length} measured</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── HEALTH TAB ── */}
      {tab === 'health' && (
        <div>
          {roster.every(p => p.healthReports.length === 0) && (
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: '0.75rem' }}><polyline points="20 6 9 17 4 12"/></svg>
              <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>No active health reports for this team.</p>
            </div>
          )}
          {roster.filter(p => p.healthReports.length > 0).map(p => (
            <div key={p.id} className="card" style={{ marginBottom: '0.875rem', overflow: 'hidden', borderLeft: `4px solid ${p.healthReports.some(r => r.report_type === 'major_injury' && r.status === 'active') ? 'var(--danger)' : 'var(--warning)'}` }}>
              <div style={{ padding: '0.875rem 1rem', background: 'var(--carolina-light)', borderBottom: '1px solid var(--carolina-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${team.color}22`, border: `1.5px solid ${team.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, color: team.color, fontSize: '0.82rem' }}>
                    {p.jerseyNumber || p.name.charAt(0)}
                  </div>
                  <span style={{ fontWeight: 700 }}>{p.name}</span>
                  {p.position && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.position}</span>}
                </div>
                <Link href={`/coach/players/${p.id}`} style={{ fontSize: '0.8rem', color: 'var(--carolina-dark)', textDecoration: 'none', fontWeight: 500 }}>Full profile →</Link>
              </div>
              <div style={{ padding: '0.875rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {p.healthReports.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem', borderRadius: 8, background: r.report_type === 'major_injury' ? 'var(--danger-light)' : 'var(--warning-light)', border: `1px solid ${r.report_type === 'major_injury' ? '#fecaca' : '#fde68a'}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 700, color: r.report_type === 'major_injury' ? 'var(--danger)' : 'var(--warning)', fontSize: '0.9rem' }}>{r.body_part}</span>
                        <span className={`tag ${r.report_type === 'major_injury' ? 'tag-danger' : 'tag-warn'}`} style={{ fontSize: '0.65rem' }}>{r.report_type === 'major_injury' ? 'Injury' : 'Pain'}</span>
                        {!r.confirmed_by_coach && <span className="tag tag-muted" style={{ fontSize: '0.65rem' }}>Needs review</span>}
                      </div>
                      {r.pain_level && <div style={{ fontSize: '0.78rem', color: painLevelColor(r.pain_level) }}>{r.pain_level}/10 — {painLevelLabel(r.pain_level)}</div>}
                      {r.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem', fontStyle: 'italic' }}>{r.description}</div>}
                      {r.coach_notes && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Note: {r.coach_notes}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flexShrink: 0 }}>
                      {!r.confirmed_by_coach && (
                        <button onClick={() => updateHealth(r.id, 'active', '')} style={{ padding: '0.25rem 0.625rem', background: 'var(--warning)', color: 'var(--black)', border: 'none', borderRadius: 5, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>Confirm</button>
                      )}
                      <button onClick={() => updateHealth(r.id, 'monitoring', '')} style={{ padding: '0.25rem 0.625rem', background: 'var(--white)', color: 'var(--text-secondary)', border: '1px solid var(--gray-border)', borderRadius: 5, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>Monitoring</button>
                      <button onClick={() => updateHealth(r.id, 'resolved', '')} style={{ padding: '0.25rem 0.625rem', background: 'var(--success)', color: 'var(--white)', border: 'none', borderRadius: 5, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>Resolved</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── EDIT PLAYER MODAL ── */}
      {editPlayer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setEditPlayer(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, padding: '1.75rem', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem' }}>Edit — {editPlayer.name}</h2>
              <button onClick={() => setEditPlayer(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>✕</button>
            </div>
            {editMsg && <div style={{ background: 'var(--danger-light)', border: '1.5px solid #fecaca', borderRadius: 8, padding: '0.625rem', marginBottom: '1rem', color: 'var(--danger)', fontSize: '0.85rem' }}>{editMsg}</div>}

            {/* Basic info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', fontWeight: 600 }}>Full Name</label>
                <input className="input" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', fontWeight: 600 }}>Jersey #</label>
                <input className="input" value={editForm.jersey_number} onChange={e => setEditForm(p => ({ ...p, jersey_number: e.target.value }))} placeholder="e.g. 14" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', fontWeight: 600 }}>New PIN <span style={{ fontWeight: 400, textTransform: 'none' }}>(blank = keep)</span></label>
                <input className="input" type="number" maxLength={4} value={editForm.pin} onChange={e => setEditForm(p => ({ ...p, pin: e.target.value.slice(0, 4) }))} placeholder="4 digits" />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', fontWeight: 600 }}>Position</label>
                <select className="input" value={editForm.position} onChange={e => setEditForm(p => ({ ...p, position: e.target.value }))}>
                  <option value="">Select…</option>
                  {POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                </select>
              </div>
            </div>

            {/* Measurements */}
            <div style={{ borderTop: '1.5px solid var(--gray-border)', paddingTop: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--carolina-deep)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: '0.75rem' }}>Athletic Measurements (inches)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                {MEAS_FIELDS.map(f => (
                  <div key={f.key}>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', fontWeight: 600 }}>{f.label}</label>
                    <input className="input" type="number" step="0.5" placeholder={editPlayer.measurements?.[f.key as keyof Measurement]?.toString() ?? '0'}
                      value={(editMeas as Record<string, string>)[f.key]}
                      onChange={e => setEditMeas(prev => ({ ...prev, [f.key]: e.target.value }))}
                      style={{ padding: '0.5rem 0.75rem' }} />
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem', fontStyle: 'italic' }}>Placeholder shows current value. Fill in to update — blank fields are ignored.</p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-ghost" onClick={() => setEditPlayer(null)} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
              <button className="btn-volt" onClick={saveEdit} disabled={editSaving || !editForm.name} style={{ flex: 2, padding: '0.75rem' }}>{editSaving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD PLAYER MODAL ── */}
      {addingPlayer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setAddingPlayer(false) }}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.2rem' }}>Add Player to {team.name}</h2>
              <button onClick={() => setAddingPlayer(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>✕</button>
            </div>
            <input className="input" placeholder="Search players…" value={newPlayerSearch} onChange={e => setNewPlayerSearch(e.target.value)} style={{ marginBottom: '0.75rem' }} autoFocus />
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {filteredPlayers.length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem', fontSize: '0.85rem' }}>No available players found</div>}
              {filteredPlayers.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0.875rem', background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.name}</div>
                    {p.teamName && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Currently: {p.teamName}</div>}
                  </div>
                  <button onClick={() => addToTeam(p.id)} className="btn-volt" style={{ padding: '0.35rem 0.875rem', fontSize: '0.82rem' }}>Add</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
