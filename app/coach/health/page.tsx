'use client'
// app/coach/health/page.tsx
//
// Health Board. Every report has an availability level — Aches & Pains,
// Work Around It, Out, Return to Play — and a timeline of changes, so a big
// injury can be followed from Out → Return to Play → Cleared
// (lib/availability.ts).
import { useState, useEffect, type CSSProperties } from 'react'
import { painLevelColor } from '@/lib/fitness'
import {
  AVAILABILITY_LEVELS, BOARD_ORDER, CLEARED, availabilityLevel, describeUpdate, formatDays,
  daysBetween, isAvailability, stageTotals, type Availability, type HealthUpdate,
} from '@/lib/availability'

type ReportType = 'major_injury' | 'nagging_pain' | 'soreness'

interface HealthReport {
  id: string
  player_id: string
  report_type: ReportType
  body_part: string
  injury_type?: string
  severity?: 'mild' | 'moderate' | 'severe'
  description?: string
  pain_level?: number
  reported_at: string
  last_reported_at?: string
  report_count?: number
  reported_by: string
  confirmed_by_coach: boolean
  coach_notes?: string
  expected_return?: string
  resolved_at?: string
  status: string
  availability?: Availability
  availability_since?: string
  health_report_updates?: HealthUpdate[]
  players?: { id: string; name: string; jersey_number?: string }
}

interface Player { id: string; name: string; jersey_number?: string; teamName?: string }

interface TrendData {
  byBodyPart: Record<string, number>
  byType: Record<string, number>
  bySeverity: Record<string, number>
  byAvailability?: Record<string, number>
  outStats?: { cases: number; stillOpen: number; avgDaysOut: number | null; avgDaysReturnToPlay: number | null; avgDaysToFull: number | null }
  byMonth: Record<string, number>
  total: number
  avgDays: number | null
}

const BODY_PARTS = [
  'Ankle', 'Knee', 'Hip', 'Lower Back', 'Upper Back', 'Shoulder',
  'Elbow', 'Wrist', 'Finger', 'Neck', 'Hamstring', 'Quad', 'Calf', 'Foot', 'Other',
]
const BILATERAL_PARTS = new Set([
  'Ankle', 'Knee', 'Hip', 'Shoulder', 'Elbow', 'Wrist', 'Finger', 'Hamstring', 'Quad', 'Calf', 'Foot',
])
const SIDES = [
  { value: 'Left',      label: 'Left' },
  { value: 'Right',     label: 'Right' },
  { value: 'Bilateral', label: 'Both' },
]
const INJURY_TYPES = ['Sprain', 'Strain', 'Overuse', 'Contusion', 'Tendinitis', 'Fracture', 'Other']

const TYPE_LABELS: Record<string, string> = { major_injury: 'Injury', nagging_pain: 'Nagging Pain', soreness: 'Soreness' }
const TYPE_COLORS: Record<string, string> = { major_injury: '#f87171', nagging_pain: '#f97316', soreness: '#facc15' }
function typeTagClass(t: string) { return t === 'major_injury' ? 'tag-danger' : 'tag-warn' }

const LABEL_STYLE: CSSProperties = { display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', fontWeight: 600 }

const BLANK_FORM = {
  playerId: '', bodyPart: '', side: '', injuryType: '', availability: '' as Availability | '',
  reportType: 'major_injury' as ReportType,
  description: '', painLevel: '', expectedReturn: '', coachNotes: '',
}

// ── Small pieces (module scope so they don't remount on every render) ──

function LevelBadge({ r, big }: { r: HealthReport; big?: boolean }) {
  if (r.status === 'resolved') {
    return (
      <span style={{ fontSize: big ? '0.78rem' : '0.7rem', fontWeight: 700, color: CLEARED.color, background: CLEARED.bg, border: `1px solid ${CLEARED.border}`, borderRadius: 20, padding: '0.15rem 0.55rem', whiteSpace: 'nowrap' }}>
        ✓ {CLEARED.label}
      </span>
    )
  }
  const l = availabilityLevel(r.availability)
  return (
    <span style={{ fontSize: big ? '0.78rem' : '0.7rem', fontWeight: 700, color: l.color, background: l.bg, border: `1px solid ${l.border}`, borderRadius: 20, padding: '0.15rem 0.55rem', whiteSpace: 'nowrap' }}>
      {l.label}
    </span>
  )
}

/** "Out 12 days" / "Return to Play 4 days · out 12 days before" — open reports */
function TimeAtLevel({ r }: { r: HealthReport }) {
  if (r.status === 'resolved') {
    const t = stageTotals(r, r.health_report_updates)
    const parts: string[] = []
    if (t.days.out > 0) parts.push(`Out ${formatDays(t.days.out)}`)
    if (t.days.return_to_play > 0) parts.push(`RTP ${formatDays(t.days.return_to_play)}`)
    parts.push(`${formatDays(t.totalDays)} total`)
    return <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{parts.join(' · ')}</span>
  }
  const l = availabilityLevel(r.availability)
  const since = r.availability_since ?? r.reported_at
  const t = stageTotals(r, r.health_report_updates)
  const outBefore = r.availability !== 'out' && t.days.out >= 1 ? ` · was out ${formatDays(t.days.out)}` : ''
  return (
    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
      <span style={{ color: l.color, fontWeight: 600 }}>{l.short}</span> {formatDays(daysBetween(since, Date.now()))}{outBefore}
    </span>
  )
}

function ReportCard({ r, pending, showResolved, onOpen }: { r: HealthReport; pending?: boolean; showResolved?: boolean; onOpen: (r: HealthReport) => void }) {
  const level = availabilityLevel(r.availability)
  const edge = r.status === 'resolved' ? CLEARED.color : level.color
  const restBorder = pending ? 'rgba(248,113,113,0.4)' : 'var(--court-border)'
  return (
    <div onClick={() => onOpen(r)} className="card" style={{ padding: '1rem', cursor: 'pointer', marginBottom: '0.625rem', borderColor: restBorder, borderLeft: `4px solid ${edge}` }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--volt)')}
      onMouseLeave={e => { e.currentTarget.style.borderColor = restBorder; e.currentTarget.style.borderLeftColor = edge }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{r.players?.name ?? 'Unknown'}</span>
            {r.players?.jersey_number && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>#{r.players.jersey_number}</span>}
            <span className={`tag ${typeTagClass(r.report_type)}`}>
              {TYPE_LABELS[r.report_type] ?? r.report_type}
            </span>
            {(r.report_count ?? 1) > 1 && (
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#facc15', border: '1px solid rgba(250,204,21,0.4)', borderRadius: 4, padding: '0.1rem 0.4rem' }}>
                Reported {r.report_count}×
              </span>
            )}
            {pending && <span className="tag tag-danger">Needs review</span>}
            {r.reported_by === 'coach' && <span style={{ fontSize: '0.68rem', background: 'rgba(86,160,211,0.15)', color: 'var(--carolina)', border: '1px solid rgba(86,160,211,0.3)', borderRadius: 4, padding: '0.1rem 0.4rem', fontWeight: 600 }}>Coach logged</span>}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
            <strong>{r.body_part}</strong>
            {r.injury_type && <span style={{ color: 'var(--text-muted)' }}> · {r.injury_type}</span>}
            {r.description ? ` — ${r.description}` : ''}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <TimeAtLevel r={r} />
            {r.pain_level != null && (
              <span style={{ fontSize: '0.78rem', color: painLevelColor(r.pain_level) }}>
                Pain {r.pain_level}/10
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
          {!pending && <LevelBadge r={r} />}
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {(r.report_count ?? 1) > 1 && r.last_reported_at
              ? `Last: ${new Date(r.last_reported_at).toLocaleDateString()}`
              : new Date(r.reported_at).toLocaleDateString()}
          </div>
          {r.expected_return && r.status !== 'resolved' && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Return: {new Date(r.expected_return + 'T12:00:00').toLocaleDateString()}
            </div>
          )}
          {showResolved && r.resolved_at && (
            <div style={{ fontSize: '0.7rem', color: '#4ade80' }}>
              Cleared: {new Date(r.resolved_at).toLocaleDateString()}
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
}

/** Picker used by both modals: the four levels, plus Cleared when allowed. */
function LevelPicker({ value, onChange, allowCleared }: { value: Availability | 'cleared' | ''; onChange: (v: Availability | 'cleared') => void; allowCleared?: boolean }) {
  const options = [
    ...AVAILABILITY_LEVELS.map(l => ({ value: l.value as Availability | 'cleared', label: l.label, desc: l.desc, color: l.color, bg: l.bg })),
    ...(allowCleared ? [{ value: 'cleared' as const, label: `✓ ${CLEARED.label}`, desc: CLEARED.desc, color: CLEARED.color, bg: CLEARED.bg }] : []),
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
      {options.map(o => {
        const on = value === o.value
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            style={{ padding: '0.55rem 0.5rem', borderRadius: 8, border: `2px solid ${on ? o.color : 'var(--court-border)'}`, background: on ? o.bg : 'transparent', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: o.color }}>{o.label}</div>
            <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: '0.15rem', lineHeight: 1.25 }}>{o.desc}</div>
          </button>
        )
      })}
    </div>
  )
}

function Timeline({ r }: { r: HealthReport }) {
  const updates = [...(r.health_report_updates ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const t = stageTotals(r, r.health_report_updates)
  const rows: { at: string; text: string; color: string; who?: string | null; note?: string | null }[] = []
  if (!updates.some(u => u.kind === 'logged')) {
    rows.push({ at: r.reported_at, text: `Reported by ${r.reported_by}`, color: 'var(--text-muted)' })
  }
  for (const u of updates) {
    const color = u.kind === 'cleared' ? CLEARED.color
      : u.kind === 'note' ? 'var(--text-muted)'
      : availabilityLevel(u.to_availability).color
    rows.push({ at: u.created_at, text: describeUpdate(u), color, who: u.coach_name, note: u.note })
  }

  return (
    <div>
      {/* Days at each level */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {BOARD_ORDER.filter(a => t.days[a] > 0 || r.availability === a).map(a => {
          const l = availabilityLevel(a)
          return (
            <div key={a} style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: 20, background: l.bg, border: `1px solid ${l.border}`, color: l.color, fontWeight: 600 }}>
              {l.label}: {formatDays(t.days[a])}
            </div>
          )
        })}
        <div style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: 20, border: '1px solid var(--court-border)', color: 'var(--text-secondary)', fontWeight: 600 }}>
          {t.cleared ? 'Start to cleared' : 'So far'}: {formatDays(t.totalDays)}
        </div>
      </div>

      <div style={{ borderLeft: '2px solid var(--court-border)', marginLeft: '0.35rem', paddingLeft: '0.85rem' }}>
        {rows.map((row, i) => (
          <div key={i} style={{ position: 'relative', marginBottom: '0.6rem' }}>
            <div style={{ position: 'absolute', left: '-1.2rem', top: '0.3rem', width: 10, height: 10, borderRadius: '50%', background: row.color }} />
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: row.color }}>{row.text}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {new Date(row.at).toLocaleDateString()}{row.who ? ` · ${row.who}` : ''}
            </div>
            {row.note && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{row.note}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

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

const SECTION_H2: CSSProperties = { fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }

export default function CoachHealthPage() {
  const [tab, setTab] = useState<'active' | 'history' | 'trends'>('active')
  const [unconfirmed, setUnconfirmed] = useState<HealthReport[]>([])
  const [active, setActive] = useState<HealthReport[]>([])
  const [history, setHistory] = useState<HealthReport[]>([])
  const [trends, setTrends] = useState<TrendData | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<HealthReport | null>(null)
  const [level, setLevel] = useState<Availability | 'cleared'>('full')
  const [progressNote, setProgressNote] = useState('')
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
    setLevel(r.status === 'resolved' ? 'cleared' : (isAvailability(r.availability) ? r.availability : 'full'))
    setProgressNote('')
    setCoachNotes(r.coach_notes ?? '')
    setExpectedReturn(r.expected_return ?? '')
    setMsg('')
  }

  async function saveReport() {
    if (!selected) return
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/player/health', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selected.id,
        confirmedByCoach: true,
        coachNotes,
        expectedReturn: expectedReturn || null,
        status: level === 'cleared' ? 'resolved' : 'active',
        ...(level !== 'cleared' ? { availability: level } : {}),
        progressNote: progressNote.trim() || null,
      }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMsg(d.error ?? 'Could not save — try again')
      setSaving(false)
      return
    }
    setSelected(null)
    loadActive()
    setHistory([])
    if (tab === 'history') loadHistory()
    setTrends(null)
    if (tab === 'trends') loadTrends()
    setSaving(false)
  }

  async function submitNew() {
    if (!newForm.playerId || !newForm.bodyPart || !newForm.availability) return
    setSavingNew(true)
    const fullBodyPart = newForm.side ? `${newForm.side} ${newForm.bodyPart}` : newForm.bodyPart
    await fetch('/api/coach/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: newForm.playerId,
        bodyPart: fullBodyPart,
        injuryType: newForm.injuryType || null,
        availability: newForm.availability,
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
  const byLevel = (a: Availability) => active.filter(r => (isAvailability(r.availability) ? r.availability : 'full') === a)

  // What the Save button will do, in words
  const currentLevel: Availability | 'cleared' | null = selected
    ? (selected.status === 'resolved' ? 'cleared' : (isAvailability(selected.availability) ? selected.availability : 'full'))
    : null
  const saveLabel = !selected ? 'Save'
    : level !== currentLevel
      ? (level === 'cleared' ? 'Clear for Full Competition ✓' : selected.status === 'resolved' ? `Reopen as ${availabilityLevel(level).label}` : `Move to ${availabilityLevel(level).label}`)
      : !selected.confirmed_by_coach ? 'Confirm & Save' : 'Save'

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 860 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>Health Board</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Every player report — soreness, pain, or injury — shows up here for review</p>
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
          {/* Counts by level */}
          {active.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {BOARD_ORDER.map(a => {
                const l = availabilityLevel(a)
                const n = byLevel(a).length
                return (
                  <div key={a} className="card" style={{ padding: '0.65rem 0.75rem', borderLeft: `4px solid ${l.color}`, opacity: n ? 1 : 0.55 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', color: l.color, lineHeight: 1 }}>{n}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{l.label}</div>
                  </div>
                )
              })}
            </div>
          )}

          {unconfirmed.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ ...SECTION_H2, color: '#f87171' }}>
                Player-Reported — Needs Review <span className="tag tag-danger">{unconfirmed.length}</span>
              </h2>
              {unconfirmed.map(r => <ReportCard key={r.id} r={r} pending onOpen={openReport} />)}
            </div>
          )}

          {active.length === 0
            ? <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No active health reports.{' '}
                <button onClick={() => setShowNewModal(true)} style={{ background: 'none', border: 'none', color: 'var(--volt)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', padding: 0 }}>Log one →</button>
              </div>
            : BOARD_ORDER.map(a => {
                const list = byLevel(a)
                if (!list.length) return null
                const l = availabilityLevel(a)
                return (
                  <div key={a} style={{ marginBottom: '1.75rem' }}>
                    <h2 style={{ ...SECTION_H2, color: l.color }}>
                      {l.label} ({list.length})
                      <span style={{ fontFamily: 'inherit', textTransform: 'none', letterSpacing: 0, fontWeight: 500, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.desc}</span>
                    </h2>
                    {list.map(r => <ReportCard key={r.id} r={r} onOpen={openReport} />)}
                  </div>
                )
              })
          }
        </>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div>
          <h2 style={{ ...SECTION_H2, color: 'var(--text-secondary)' }}>
            Cleared ({history.length})
          </h2>
          {history.length === 0
            ? <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nothing cleared yet.</div>
            : history.map(r => <ReportCard key={r.id} r={r} showResolved onOpen={openReport} />)
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

                {/* Out and back */}
                {trends.outStats && trends.outStats.cases > 0 && (
                  <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Out and Back</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.875rem' }}>
                      Injuries that kept a player out: {trends.outStats.cases}{trends.outStats.stillOpen ? ` (${trends.outStats.stillOpen} not cleared yet)` : ''}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(95px, 1fr))', gap: '0.75rem' }}>
                      {[
                        { label: 'Avg Days Out', value: trends.outStats.avgDaysOut, color: availabilityLevel('out').color },
                        { label: 'Avg Days Return to Play', value: trends.outStats.avgDaysReturnToPlay, color: availabilityLevel('return_to_play').color },
                        { label: 'Avg Days to Cleared', value: trends.outStats.avgDaysToFull, color: CLEARED.color },
                      ].map(stat => (
                        <div key={stat.label} style={{ textAlign: 'center', background: 'var(--court-raised)', borderRadius: 8, padding: '0.75rem' }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', color: stat.color, lineHeight: 1 }}>{stat.value != null ? `${stat.value}d` : '—'}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>

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

                  {/* Right now, by level */}
                  {trends.byAvailability && Object.keys(trends.byAvailability).length > 0 && (
                    <div className="card" style={{ padding: '1.25rem' }}>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Right Now</h3>
                      {BOARD_ORDER.filter(a => trends.byAvailability?.[a]).map(a => (
                        <MiniBar key={a} label={availabilityLevel(a).label} value={trends.byAvailability![a]} max={Math.max(...Object.values(trends.byAvailability!))} color={availabilityLevel(a).color} />
                      ))}
                    </div>
                  )}

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
          <div className="card" style={{ width: '100%', maxWidth: 560, padding: '1.5rem', borderRadius: 16, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', gap: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>{selected.players?.name}</h3>
                  <LevelBadge r={selected} big />
                </div>
                <p style={{ color: '#f87171', fontSize: '0.85rem' }}>
                  {selected.body_part}
                  {selected.injury_type ? ` · ${selected.injury_type}` : ''}
                  {' · '}{TYPE_LABELS[selected.report_type] ?? selected.report_type}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Reported {new Date(selected.reported_at).toLocaleDateString()} by {selected.reported_by}
                  {(selected.report_count ?? 1) > 1 && selected.last_reported_at && (
                    <span> · reported {selected.report_count}×, last {new Date(selected.last_reported_at).toLocaleDateString()}</span>
                  )}
                  {selected.pain_level != null && <span> · pain {selected.pain_level}/10</span>}
                </p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            {selected.description && (
              <div style={{ background: 'var(--court-raised)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                "{selected.description}"
              </div>
            )}

            {/* Level */}
            <div style={{ marginBottom: '0.875rem' }}>
              <label style={LABEL_STYLE}>Where is the player right now?</label>
              <LevelPicker value={level} onChange={setLevel} allowCleared />
            </div>

            <div style={{ marginBottom: '0.875rem' }}>
              <label style={LABEL_STYLE}>Progress Note <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(goes on the timeline)</span></label>
              <input className="input" value={progressNote} onChange={e => setProgressNote(e.target.value)}
                placeholder={level === 'return_to_play' ? 'e.g. Cleared by PT for jumping, no blocking yet' : level === 'cleared' ? 'e.g. Full practice all week, no pain' : 'e.g. Saw doctor — 2 weeks in a boot'} />
            </div>

            <div style={{ marginBottom: '0.875rem' }}>
              <label style={LABEL_STYLE}>Coach Notes <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(the current plan)</span></label>
              <textarea className="input" value={coachNotes} onChange={e => setCoachNotes(e.target.value)} rows={2} placeholder="Modifications, treatment plan, follow-up reminders…" style={{ resize: 'vertical' }} />
            </div>

            {level !== 'cleared' && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={LABEL_STYLE}>Expected Return Date</label>
                <input type="date" className="input" value={expectedReturn} onChange={e => setExpectedReturn(e.target.value)} />
              </div>
            )}

            {msg && <p style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{msg}</p>}

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <button className="btn-ghost" onClick={() => setSelected(null)} disabled={saving} style={{ flex: 1, padding: '0.7rem', fontSize: '0.85rem' }}>Cancel</button>
              <button className="btn-volt" onClick={saveReport} disabled={saving} style={{ flex: 2, padding: '0.7rem', fontSize: '0.85rem' }}>
                {saving ? 'Saving…' : saveLabel}
              </button>
            </div>

            {/* Timeline */}
            <div style={{ borderTop: '1px solid var(--court-border)', paddingTop: '1rem' }}>
              <label style={LABEL_STYLE}>Timeline</label>
              <Timeline r={selected} />
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
                  <select className="input" value={newForm.bodyPart} onChange={e => setNewForm(f => ({ ...f, bodyPart: e.target.value, side: BILATERAL_PARTS.has(e.target.value) ? f.side : '' }))}>
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

              {/* Side selector — only for bilateral body parts */}
              {BILATERAL_PARTS.has(newForm.bodyPart) && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', fontWeight: 600 }}>Side</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {SIDES.map(s => (
                      <button key={s.value} onClick={() => setNewForm(f => ({ ...f, side: f.side === s.value ? '' : s.value }))}
                        style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: `2px solid ${newForm.side === s.value ? 'var(--carolina)' : 'var(--court-border)'}`, background: newForm.side === s.value ? 'rgba(86,160,211,0.15)' : 'transparent', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, color: newForm.side === s.value ? 'var(--carolina)' : 'var(--text-muted)' }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Availability */}
              <div>
                <label style={LABEL_STYLE}>Where is the player right now? *</label>
                <LevelPicker value={newForm.availability} onChange={v => { if (v !== 'cleared') setNewForm(f => ({ ...f, availability: v })) }} />
              </div>

              {/* Report type */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', fontWeight: 600 }}>Report Type</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['major_injury', 'nagging_pain', 'soreness'] as ReportType[]).map(v => [v, TYPE_LABELS[v]] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setNewForm(f => ({ ...f, reportType: v }))}
                      style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: `2px solid ${newForm.reportType === v ? TYPE_COLORS[v] : 'var(--court-border)'}`, background: newForm.reportType === v ? `${TYPE_COLORS[v]}1a` : 'transparent', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: newForm.reportType === v ? TYPE_COLORS[v] : 'var(--text-muted)' }}>
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
                <button className="btn-volt" onClick={submitNew} disabled={savingNew || !newForm.playerId || !newForm.bodyPart || !newForm.availability} style={{ flex: 2, padding: '0.75rem' }}>
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
