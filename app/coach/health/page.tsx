'use client'
import { useState, useEffect } from 'react'
import { painLevelColor, painLevelLabel } from '@/lib/fitness'

interface HealthReport {
  id: string
  player_id: string
  report_type: 'major_injury' | 'nagging_pain'
  body_part: string
  injury_type?: string
  severity?: 'mild' | 'moderate' | 'severe'
  description?: string
  pain_level?: number
  reported_at: string
  reported_by: string
  confirmed_by_coach: boolean
  coach_notes?: string
  expected_return?: string
  resolved_at?: string
  status: string
  players?: { id: string; name: string; jersey_number?: string }
}

interface Player { id: string; name: string; jersey_number?: string; teamName?: string }

interface TrendData {
  byBodyPart: Record<string, number>
  byType: Record<string, number>
  bySeverity: Record<string, number>
  byMonth: Record<string, number>
  total: number
  avgDays: number | null
}

const BODY_PARTS = [
  'Ankle', 'Knee', 'Hip', 'Lower Back', 'Upper Back', 'Shoulder',
  'Elbow', 'Wrist', 'Finger', 'Neck', 'Hamstring', 'Quad', 'Calf', 'Foot', 'Other',
]
const INJURY_TYPES = ['Sprain', 'Strain', 'Overuse', 'Contusion', 'Tendinitis', 'Fracture', 'Other']
const SEVERITY_LEVELS = [
  { value: 'mild',     label: 'Mild',     color: '#facc15', desc: 'Plays through it' },
  { value: 'moderate', label: 'Moderate', color: '#f97316', desc: 'Limited participation' },
  { value: 'severe',   label: 'Severe',   color: '#f87171', desc: 'Cannot participate' },
]

const STATUS_LABELS: Record<string, string> = { active: 'Active', monitoring: 'Monitoring', resolved: 'Resolved' }
const STATUS_COLORS: Record<string, string> = { active: '#f87171', monitoring: '#facc15', resolved: '#4ade80' }

const BLANK_FORM = {
  playerId: '', bodyPart: '', injuryType: '', severity: '',
  reportType: 'major_injury' as 'major_injury' | 'nagging_pain',
  description: '', painLevel: '', expectedReturn: '', coachNotes: '',
}

export default function CoachHealthPage() {
  const [tab, setTab] = useState<'active' | 'history' | 'trends'>('active')
  const [unconfirmed, setUnconfirmed] = useState<HealthReport[]>([])
  const [active, setActive] = useState<HealthReport[]>([])
  const [history, setHistory] = useState<HealthReport[]>([])
  const [trends, setTrends] = useState<TrendData | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<HealthReport | null>(null)
  const [coachNotes, setCoachNotes] = useState('')
  const [expectedReturn, setExpectedReturn] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [newForm, setNewForm] = useState({ ...BLANK_FORM })
  const [savingNew, setSavingNew] = useState(false)
  const [playerSearch, setPlayerSearch] = useState('')

  useEffect(() => { loadActive() }, [])
  useEffect(() => {
    if (tab === 'history' && !history.length) loadHistory()
    if (tab === 'trends' && !trends) loadTrends()
  }, [tab])

  async function loadActive() {
    const res = await fetch('/api/coach/health')
    const data = await res.json()
    setUnconfirmed(data.unconfirmed ?? [])
    setActive(data.active ?? [])
    setLoading(false)
  }

  async function loadHistory() {
    const res = await fetch('/api/coach/health?mode=history')
    const data = await res.json()
    setHistory(data.resolved ?? [])
  }

  async function loadTrends() {
    const res = await fetch('/api/coach/health?mode=trends')
    const data = await res.json()
    setTrends(data)
  }

  useEffect(() => {
    fetch('/api/coach/players').then(r => r.json()).then(d => setPlayers(d.players ?? []))
  }, [])

  function openReport(r: HealthReport) {
    setSelected(r)
    setCoachNotes(r.coach_notes ?? '')
    setExpectedReturn(r.expected_return ?? '')
    setMsg('')
  }

  async function saveReport(status?: string) {
    if (!selected) return
    setSaving(true)
    await fetch('/api/player/health', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id, confirmedByCoach: true, coachNotes, expectedReturn: expectedReturn || null, status: status ?? selected.status }),
    })
    setSelected(null)
    loadActive()
    if (tab === 'history') { setHistory([]); loadHistory() }
    setSaving(false)
  }

  async function submitNew() {
    if (!newForm.playerId || !newForm.bodyPart) return
    setSavingNew(true)
    await fetch('/api/coach/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: newForm.playerId,
        bodyPart: newForm.bodyPart,
        injuryType: newForm.injuryType || null,
        severity: newForm.severity || null,
        reportType: newForm.reportType,
        description: newForm.description || null,
        painLevel: newForm.painLevel ? Number(newForm.painLevel) : null,
        expectedReturn: newForm.expectedReturn || null,
        coachNotes: newForm.coachNotes || null,
      }),
    })
    setShowNewModal(false)
    setNewForm({ ...BLANK_FORM })
    setPlayerSearch('')
    loadActive()
    setTrends(null)
    setSavingNew(false)
  }

  const filteredPlayers = players.filter(p =>
    p.name.toLowerCase().includes(playerSearch.toLowerCase()) ||
    (p.jersey_number ?? '').includes(playerSearch)
  )

  const totalActive = unconfirmed.length + active.length

  // ── Shared report card ──
  const ReportCard = ({ r, pending, showResolved }: { r: HealthReport; pending?: boolean; showResolved?: boolean }) => (
    <div onClick={() => openReport(r)} className="card" style={{ padding: '1rem', cursor: 'pointer', marginBottom: '0.625rem', borderColor: pending ? 'rgba(248,113,113,0.4)' : 'var(--court-border)' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--volt)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = pending ? 'rgba(248,113,113,0.4)' : 'var(--court-border)')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{r.players?.name ?? 'Unknown'}</span>
            {r.players?.jersey_number && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>#{r.players.jersey_number}</span>}
            <span className={`tag ${r.report_type === 'major_injury' ? 'tag-danger' : 'tag-warn'}`}>
              {r.report_type === 'major_injury' ? 'Injury' : 'Pain'}
            </span>
            {pending && <span className="tag tag-danger">Needs review</span>}
            {r.reported_by === 'coach' && <span style={{ fontSize: '0.68rem', background: 'rgba(86,160,211,0.15)', color: 'var(--carolina)', border: '1px solid rgba(86,160,211,0.3)', borderRadius: 4, padding: '0.1rem 0.4rem', fontWeight: 600 }}>Coach logged</span>}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
            <strong>{r.body_part}</strong>
            {r.injury_type && <span style={{ color: 'var(--text-muted)' }}> · {r.injury_type}</span>}
            {r.description ? ` — ${r.description}` : ''}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {r.severity && (
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: SEVERITY_LEVELS.find(s => s.value === r.severity)?.color ?? 'var(--text-muted)' }}>
                {r.severity.charAt(0).toUpperCase() + r.severity.slice(1)}
              </span>
            )}
            {r.pain_level != null && (
              <span style={{ fontSize: '0.78rem', color: painLevelColor(r.pain_level) }}>
                Pain {r.pain_level}/10
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.75rem', color: STATUS_COLORS[r.status] ?? 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600 }}>
            {STATUS_LABELS[r.status] ?? r.status}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {new Date(r.reported_at).toLocaleDateString()}
          </div>
          {r.expected_return && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Return: {new Date(r.expected_return + 'T12:00:00').toLocaleDateString()}
            </div>
          )}
          {showResolved && r.resolved_at && (
            <div style={{ fontSize: '0.7rem', color: '#4ade80' }}>
              Resolved: {new Date(r.resolved_at).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
      {r.coach_notes && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', borderTop: '1px solid var(--court-border)', paddingTop: '0.5rem' }}>
          {r.coach_notes}
        </div>
      )}
    </div>
  )

  // ── Bar chart helper ──
  function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
        <div style={{ width: 110, fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'right', flexShrink: 0 }}>{label}</div>
        <div style={{ flex: 1, background: 'var(--court-raised)', borderRadius: 4, overflow: 'hidden', height: 18 }}>
          <div style={{ width: `${(value / max) * 100}%`, background: color, height: '100%', borderRadius: 4, transition: 'width 0.4s ease', display: 'flex', alignItems: 'center', paddingLeft: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', color: '#111827', fontWeight: 700 }}>{value}</span>
          </div>
        </div>
      </div>
    )
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 860 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>Health Board</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Track player injuries, monitor recovery, and identify trends</p>
        </div>
        <button className="btn-volt" onClick={() => setShowNewModal(true)} style={{ padding: '0.625rem 1.25rem', flexShrink: 0 }}>
          + Log Injury
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', background: 'var(--court-raised)', borderRadius: 10, padding: '0.25rem', width: 'fit-content' }}>
        {([['active', `Active${totalActive ? ` (${totalActive})` : ''}`], ['history', 'History'], ['trends', 'Trends']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '0.4rem 1.1rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, background: tab === t ? 'var(--surface)' : 'transparent', color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.12)' : 'none', transition: 'all 0.12s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── ACTIVE TAB ── */}
      {tab === 'active' && (
        <>
          {unconfirmed.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f87171', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Player-Reported — Needs Review <span className="tag tag-danger">{unconfirmed.length}</span>
              </h2>
              {unconfirmed.map(r => <ReportCard key={r.id} r={r} pending />)}
            </div>
          )}
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              Active & Monitoring ({active.length})
            </h2>
            {active.length === 0
              ? <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No active health reports.{' '}
                  <button onClick={() => setShowNewModal(true)} style={{ background: 'none', border: 'none', color: 'var(--volt)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', padding: 0 }}>Log one →</button>
                </div>
              : active.map(r => <ReportCard key={r.id} r={r} />)
            }
          </div>
        </>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            Resolved Injuries ({history.length})
          </h2>
          {history.length === 0
            ? <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No resolved injuries yet.</div>
            : history.map(r => <ReportCard key={r.id} r={r} showResolved />)
          }
        </div>
      )}

      {/* ── TRENDS TAB ── */}
      {tab === 'trends' && (
        <div>
          {!trends
            ? <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading trends…</div>
            : trends.total === 0
            ? <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No injury data yet. Start logging to see trends.</div>
            : (
              <>
                {/* Summary stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.875rem', marginBottom: '1.75rem' }}>
                  {[
                    { label: 'Total Injuries', value: trends.total, color: '#f87171' },
                    { label: 'Avg Days to Resolve', value: trends.avgDays != null ? `${trends.avgDays}d` : '—', color: '#facc15' },
                    { label: 'Most Common Site', value: Object.entries(trends.byBodyPart).sort((a,b) => b[1]-a[1])[0]?.[0] ?? '—', color: 'var(--carolina)' },
                    { label: 'Most Common Type', value: Object.entries(trends.byType).sort((a,b) => b[1]-a[1])[0]?.[0] ?? '—', color: '#a78bfa' },
                  ].map(stat => (
                    <div key={stat.label} className="card" style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

                  {/* By body part */}
                  <div className="card" style={{ padding: '1.25rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', color: 'var(--text-secondary)' }}>By Body Part</h3>
                    {Object.entries(trends.byBodyPart).sort((a,b) => b[1]-a[1]).map(([part, count]) => (
                      <MiniBar key={part} label={part} value={count} max={Math.max(...Object.values(trends.byBodyPart))} color="#f87171" />
                    ))}
                  </div>

                  {/* By injury type */}
                  <div className="card" style={{ padding: '1.25rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', color: 'var(--text-secondary)' }}>By Injury Type</h3>
                    {Object.entries(trends.byType).sort((a,b) => b[1]-a[1]).map(([type, count]) => (
                      <MiniBar key={type} label={type} value={count} max={Math.max(...Object.values(trends.byType))} color="#a78bfa" />
                    ))}
                  </div>

                  {/* By severity */}
                  <div className="card" style={{ padding: '1.25rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', color: 'var(--text-secondary)' }}>By Severity</h3>
                    {['severe', 'moderate', 'mild', 'unspecified'].filter(s => trends.bySeverity[s]).map(s => (
                      <MiniBar key={s} label={s.charAt(0).toUpperCase()+s.slice(1)} value={trends.bySeverity[s]} max={Math.max(...Object.values(trends.bySeverity))} color={SEVERITY_LEVELS.find(sl => sl.value === s)?.color ?? '#6b7280'} />
                    ))}
                  </div>

                  {/* By month */}
                  <div className="card" style={{ padding: '1.25rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', color: 'var(--text-secondary)' }}>By Month</h3>
                    {Object.entries(trends.byMonth).sort((a,b) => a[0].localeCompare(b[0])).slice(-12).map(([month, count]) => {
                      const [y, m] = month.split('-')
                      const label = new Date(Number(y), Number(m)-1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
                      return <MiniBar key={month} label={label} value={count} max={Math.max(...Object.values(trends.byMonth))} color="var(--carolina)" />
                    })}
                  </div>
                </div>
              </>
            )
          }
        </div>
      )}

      {/* ── EDIT / REVIEW MODAL ── */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, padding: '1.5rem', borderRadius: 16, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>{selected.players?.name}</h3>
                <p style={{ color: '#f87171', fontSize: '0.85rem' }}>
                  {selected.body_part}
                  {selected.injury_type ? ` · ${selected.injury_type}` : ''}
                  {' · '}{selected.report_type === 'major_injury' ? 'Injury' : 'Nagging Pain'}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Reported {new Date(selected.reported_at).toLocaleDateString()} by {selected.reported_by}
                  {selected.severity && <span> · <strong style={{ color: SEVERITY_LEVELS.find(s => s.value === selected.severity)?.color }}>{selected.severity}</strong></span>}
                </p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            {selected.description && (
              <div style={{ background: 'var(--court-raised)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                "{selected.description}"
              </div>
            )}

            <div style={{ marginBottom: '0.875rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', fontWeight: 600 }}>Coach Notes</label>
              <textarea className="input" value={coachNotes} onChange={e => setCoachNotes(e.target.value)} rows={3} placeholder="Modifications, treatment plan, follow-up reminders…" style={{ resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', fontWeight: 600 }}>Expected Return Date</label>
              <input type="date" className="input" value={expectedReturn} onChange={e => setExpectedReturn(e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <button className="btn-ghost" onClick={() => saveReport('active')} disabled={saving} style={{ padding: '0.625rem', fontSize: '0.8rem' }}>
                Confirm Active
              </button>
              <button className="btn-ghost" onClick={() => saveReport('monitoring')} disabled={saving} style={{ padding: '0.625rem', fontSize: '0.8rem', borderColor: '#facc15', color: '#facc15' }}>
                Monitoring
              </button>
              <button className="btn-volt" onClick={() => saveReport('resolved')} disabled={saving} style={{ padding: '0.625rem', fontSize: '0.8rem' }}>
                Mark Resolved ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NEW INJURY MODAL ── */}
      {showNewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowNewModal(false); setNewForm({ ...BLANK_FORM }); setPlayerSearch('') } }}>
          <div className="card" style={{ width: '100%', maxWidth: 540, padding: '1.75rem', borderRadius: 16, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem' }}>Log Injury</h2>
              <button onClick={() => { setShowNewModal(false); setNewForm({ ...BLANK_FORM }); setPlayerSearch('') }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Player picker */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', fontWeight: 600 }}>Player *</label>
                {newForm.playerId ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--court-raised)', borderRadius: 8, padding: '0.625rem 0.875rem', border: '1.5px solid var(--volt)' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{players.find(p => p.id === newForm.playerId)?.name}</span>
                    <button onClick={() => setNewForm(f => ({ ...f, playerId: '' }))} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>Change</button>
                  </div>
                ) : (
                  <>
                    <input className="input" placeholder="Search players…" value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} style={{ marginBottom: '0.4rem' }} />
                    {playerSearch && (
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--court-border)', borderRadius: 8, maxHeight: 180, overflowY: 'auto' }}>
                        {filteredPlayers.slice(0, 8).map(p => (
                          <button key={p.id} onClick={() => { setNewForm(f => ({ ...f, playerId: p.id })); setPlayerSearch('') }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.625rem 0.875rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--court-border)', color: 'var(--text-primary)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--court-raised)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            <strong>{p.name}</strong>
                            {p.jersey_number && <span style={{ color: 'var(--text-muted)', marginLeft: '0.4rem' }}>#{p.jersey_number}</span>}
                            {p.teamName && <span style={{ color: 'var(--text-muted)', marginLeft: '0.4rem', fontSize: '0.78rem' }}>{p.teamName}</span>}
                          </button>
                        ))}
                        {filteredPlayers.length === 0 && <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No players found</div>}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Body part + type */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', fontWeight: 600 }}>Body Part *</label>
                  <select className="input" value={newForm.bodyPart} onChange={e => setNewForm(f => ({ ...f, bodyPart: e.target.value }))}>
                    <option value="">Select…</option>
                    {BODY_PARTS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', fontWeight: 600 }}>Injury Type</label>
                  <select className="input" value={newForm.injuryType} onChange={e => setNewForm(f => ({ ...f, injuryType: e.target.value }))}>
                    <option value="">Select…</option>
                    {INJURY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Severity */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', fontWeight: 600 }}>Severity</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {SEVERITY_LEVELS.map(s => (
                    <button key={s.value} onClick={() => setNewForm(f => ({ ...f, severity: f.severity === s.value ? '' : s.value }))}
                      style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: `2px solid ${newForm.severity === s.value ? s.color : 'var(--court-border)'}`, background: newForm.severity === s.value ? `${s.color}18` : 'transparent', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: s.color }}>{s.label}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Report type */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', fontWeight: 600 }}>Report Type</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[['major_injury', 'Injury'], ['nagging_pain', 'Nagging Pain']].map(([v, l]) => (
                    <button key={v} onClick={() => setNewForm(f => ({ ...f, reportType: v as 'major_injury' | 'nagging_pain' }))}
                      style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: `2px solid ${newForm.reportType === v ? (v === 'major_injury' ? '#f87171' : '#facc15') : 'var(--court-border)'}`, background: newForm.reportType === v ? (v === 'major_injury' ? 'rgba(248,113,113,0.1)' : 'rgba(250,204,21,0.1)') : 'transparent', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: newForm.reportType === v ? (v === 'major_injury' ? '#f87171' : '#facc15') : 'var(--text-muted)' }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description + notes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', fontWeight: 600 }}>Description</label>
                <input className="input" placeholder="Brief description of the injury…" value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', fontWeight: 600 }}>Coach Notes</label>
                <textarea className="input" rows={2} placeholder="Modification plan, treatment, follow-up…" value={newForm.coachNotes} onChange={e => setNewForm(f => ({ ...f, coachNotes: e.target.value }))} style={{ resize: 'vertical' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', fontWeight: 600 }}>Expected Return Date</label>
                <input type="date" className="input" value={newForm.expectedReturn} onChange={e => setNewForm(f => ({ ...f, expectedReturn: e.target.value }))} />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
                <button className="btn-ghost" onClick={() => { setShowNewModal(false); setNewForm({ ...BLANK_FORM }); setPlayerSearch('') }} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
                <button className="btn-volt" onClick={submitNew} disabled={savingNew || !newForm.playerId || !newForm.bodyPart} style={{ flex: 2, padding: '0.75rem' }}>
                  {savingNew ? 'Saving…' : 'Log Injury'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
