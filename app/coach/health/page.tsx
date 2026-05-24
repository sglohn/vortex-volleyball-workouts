'use client'
import { useState, useEffect } from 'react'
import { painLevelColor, painLevelLabel } from '@/lib/fitness'

interface HealthReport {
  id: string
  player_id: string
  report_type: 'major_injury' | 'nagging_pain'
  body_part: string
  description?: string
  pain_level?: number
  reported_at: string
  reported_by: string
  confirmed_by_coach: boolean
  coach_notes?: string
  expected_return?: string
  status: string
  players?: { name: string; jersey_number?: string }
}

const STATUS_LABELS: Record<string, string> = { active: 'Active', monitoring: 'Monitoring', resolved: 'Resolved' }
const STATUS_COLORS: Record<string, string> = { active: '#f87171', monitoring: '#facc15', resolved: '#4ade80' }

export default function CoachHealthPage() {
  const [unconfirmed, setUnconfirmed] = useState<HealthReport[]>([])
  const [active, setActive] = useState<HealthReport[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<HealthReport | null>(null)
  const [coachNotes, setCoachNotes] = useState('')
  const [expectedReturn, setExpectedReturn] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const res = await fetch('/api/coach/health')
    const data = await res.json()
    setUnconfirmed(data.unconfirmed ?? [])
    setActive(data.active ?? [])
    setLoading(false)
  }

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
    setMsg('Saved')
    setSelected(null)
    loadData()
    setSaving(false)
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  const ReportCard = ({ r, pending }: { r: HealthReport; pending?: boolean }) => (
    <div onClick={() => openReport(r)} className="card" style={{ padding: '1rem', cursor: 'pointer', borderColor: pending ? 'rgba(248,113,113,0.4)' : 'var(--court-border)', marginBottom: '0.625rem' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--volt)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = pending ? 'rgba(248,113,113,0.4)' : 'var(--court-border)')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{r.players?.name ?? 'Unknown'}</span>
            <span className={`tag ${r.report_type === 'major_injury' ? 'tag-danger' : 'tag-warn'}`}>
              {r.report_type === 'major_injury' ? 'Injury' : 'Pain'}
            </span>
            {pending && <span className="tag tag-danger">Needs review</span>}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
            <strong>{r.body_part}</strong>{r.description ? ` — ${r.description}` : ''}
          </div>
          {r.pain_level && (
            <div style={{ fontSize: '0.8rem', color: painLevelColor(r.pain_level) }}>
              Pain: {r.pain_level}/10 — {painLevelLabel(r.pain_level)}
            </div>
          )}
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
              Return: {new Date(r.expected_return).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
      {r.coach_notes && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', borderTop: '1px solid var(--court-border)', paddingTop: '0.5rem' }}>
          Note: {r.coach_notes}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ padding: '2rem', maxWidth: 800 }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>Health Board</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Track and manage player injuries and pain reports</p>
      </div>

      {msg && <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', color: 'var(--volt)', fontSize: '0.9rem' }}>{msg}</div>}

      {/* Pending review */}
      {unconfirmed.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f87171', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Needs Review <span className="tag tag-danger">{unconfirmed.length}</span>
          </h2>
          {unconfirmed.map(r => <ReportCard key={r.id} r={r} pending />)}
        </div>
      )}

      {/* Active confirmed */}
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          Active Reports ({active.length})
        </h2>
        {active.length === 0
          ? <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No active health reports.</div>
          : active.map(r => <ReportCard key={r.id} r={r} />)
        }
      </div>

      {/* Edit modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 500, padding: '1.5rem', borderRadius: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>{selected.players?.name}</h3>
                <p style={{ color: '#f87171', fontSize: '0.85rem' }}>{selected.body_part} · {selected.report_type === 'major_injury' ? 'Injury' : 'Nagging Pain'}</p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            {selected.description && (
              <div style={{ background: 'var(--court-raised)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                "{selected.description}"
              </div>
            )}

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Coach Notes</label>
              <textarea className="input" value={coachNotes} onChange={e => setCoachNotes(e.target.value)} rows={3} placeholder="Notes on modification, treatment, follow-up…" style={{ resize: 'vertical' }} />
            </div>

            {selected.report_type === 'major_injury' && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Expected Return Date</label>
                <input type="date" className="input" value={expectedReturn} onChange={e => setExpectedReturn(e.target.value)} />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <button className="btn-ghost" onClick={() => saveReport('active')} disabled={saving} style={{ padding: '0.625rem', fontSize: '0.8rem' }}>
                Confirm Active
              </button>
              <button className="btn-ghost" onClick={() => saveReport('monitoring')} disabled={saving} style={{ padding: '0.625rem', fontSize: '0.8rem', borderColor: '#facc15', color: '#facc15' }}>
                Monitoring
              </button>
              <button className="btn-volt" onClick={() => saveReport('resolved')} disabled={saving} style={{ padding: '0.625rem', fontSize: '0.8rem' }}>
                Mark Resolved
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
