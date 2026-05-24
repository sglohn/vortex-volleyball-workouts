'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const BODY_PARTS = [
  'Head/Neck','Left Shoulder','Right Shoulder','Left Elbow','Right Elbow',
  'Left Wrist/Hand','Right Wrist/Hand','Upper Back','Lower Back',
  'Left Hip','Right Hip','Left Knee','Right Knee',
  'Left Ankle/Foot','Right Ankle/Foot','General Fatigue','Other',
]

interface HealthReport {
  id: string; report_type: string; body_part: string; pain_level?: number; status: string; reported_at: string; description?: string
}

export default function PlayerHealthPage() {
  const router = useRouter()
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [activeReports, setActiveReports] = useState<HealthReport[]>([])
  const [loading, setLoading] = useState(true)
  const [reporting, setReporting] = useState(false)
  const [form, setForm] = useState({ reportType: 'nagging_pain', bodyPart: '', painLevel: 5, description: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [hasHealthFlags, setHasHealthFlags] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('vx_session')
    if (!stored) { router.push('/'); return }
    const s = JSON.parse(stored)
    setPlayerId(s.playerId)
    setHasHealthFlags(s.hasHealthFlags ?? false)
    fetch(`/api/player/health?playerId=${s.playerId}`)
      .then(r => r.json())
      .then(d => { setActiveReports((d.reports ?? []).filter((r: HealthReport) => r.status !== 'resolved')); setLoading(false) })
      .catch(() => setLoading(false))
  }, [router])

  async function submitReport() {
    if (!playerId || !form.bodyPart) { setMsg('Please select a body part'); return }
    setSaving(true)
    const res = await fetch('/api/player/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, reportType: form.reportType, bodyPart: form.bodyPart, painLevel: form.painLevel, description: form.description, reportedBy: 'player' }),
    })
    const data = await res.json()
    if (res.ok) {
      setActiveReports(prev => [data.report, ...prev])
      setReporting(false)
      setForm({ reportType: 'nagging_pain', bodyPart: '', painLevel: 5, description: '' })
      setMsg('Report submitted — your coach will review it.')
      // Update session so check-in screen knows
      const stored = localStorage.getItem('vx_session')
      if (stored) { const s = JSON.parse(stored); s.hasHealthFlags = true; localStorage.setItem('vx_session', JSON.stringify(s)) }
    }
    setSaving(false)
  }

  const painColors = ['','#4ade80','#4ade80','#86efac','#fde68a','#facc15','#facc15','#fb923c','#f97316','#f87171','#ef4444']

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }} className="fade-up">
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>Health</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Report injuries or pain to your coach</p>
      </div>

      {msg && (
        <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', color: 'var(--volt)', fontSize: '0.9rem' }}>{msg}</div>
      )}

      {/* If they were routed here due to existing flags */}
      {hasHealthFlags && activeReports.length > 0 && (
        <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
          <p style={{ color: '#f87171', fontSize: '0.9rem', fontWeight: 500, marginBottom: '0.75rem' }}>⚠ You have active health reports. Your coach has been notified.</p>
          <button className="btn-volt" onClick={() => router.push('/player/workout')} style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}>
            Continue to Workout →
          </button>
        </div>
      )}

      {/* Report new issue */}
      {!reporting ? (
        <button className="btn-ghost" onClick={() => setReporting(true)} style={{ width: '100%', padding: '0.875rem', marginBottom: '1.25rem', fontSize: '0.95rem', borderStyle: 'dashed' }}>
          + Report new pain or injury
        </button>
      ) : (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '1rem', fontSize: '1rem' }}>New Health Report</h3>

          {/* Type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.875rem' }}>
            {[{ v: 'nagging_pain', l: 'Nagging Pain' }, { v: 'major_injury', l: 'Injury' }].map(t => (
              <button key={t.v} onClick={() => setForm(p => ({ ...p, reportType: t.v }))}
                style={{ padding: '0.625rem', borderRadius: 8, border: `2px solid ${form.reportType === t.v ? (t.v === 'major_injury' ? '#f87171' : '#facc15') : 'var(--court-border)'}`, background: form.reportType === t.v ? (t.v === 'major_injury' ? 'rgba(248,113,113,0.1)' : 'rgba(250,204,21,0.1)') : 'transparent', color: form.reportType === t.v ? (t.v === 'major_injury' ? '#f87171' : '#facc15') : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                {t.l}
              </button>
            ))}
          </div>

          {/* Body part */}
          <div style={{ marginBottom: '0.875rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Where? *</label>
            <select className="input" value={form.bodyPart} onChange={e => setForm(p => ({ ...p, bodyPart: e.target.value }))}>
              <option value="">Select body part…</option>
              {BODY_PARTS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {/* Pain level */}
          <div style={{ marginBottom: '0.875rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              Pain Level: <span style={{ color: painColors[form.painLevel], fontWeight: 700 }}>{form.painLevel}/10</span>
            </label>
            <input type="range" min={1} max={10} value={form.painLevel} onChange={e => setForm(p => ({ ...p, painLevel: parseInt(e.target.value) }))}
              style={{ width: '100%', accentColor: painColors[form.painLevel] }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              <span>Mild</span><span>Moderate</span><span>Severe</span>
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Description (optional)</label>
            <textarea className="input" rows={2} placeholder="When did it start? What makes it worse?" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={{ resize: 'none' }} />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-ghost" onClick={() => setReporting(false)} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
            <button className="btn-volt" onClick={submitReport} disabled={saving || !form.bodyPart} style={{ flex: 2, padding: '0.75rem' }}>{saving ? 'Submitting…' : 'Submit Report'}</button>
          </div>
        </div>
      )}

      {/* Active reports */}
      {activeReports.length > 0 && (
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.625rem' }}>Your Active Reports</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {activeReports.map(r => (
              <div key={r.id} className="card" style={{ padding: '0.875rem', borderLeft: `3px solid ${r.report_type === 'major_injury' ? '#f87171' : '#facc15'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.2rem' }}>{r.body_part}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {r.report_type === 'major_injury' ? 'Injury' : 'Nagging pain'}
                      {r.pain_level ? ` · ${r.pain_level}/10` : ''}
                      {' · '}{new Date(r.reported_at).toLocaleDateString()}
                    </div>
                    {r.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem', fontStyle: 'italic' }}>{r.description}</div>}
                  </div>
                  <span className={`tag ${r.status === 'monitoring' ? 'tag-warn' : 'tag-danger'}`} style={{ fontSize: '0.65rem', flexShrink: 0 }}>
                    {r.status === 'monitoring' ? 'Monitoring' : 'Active'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasHealthFlags && activeReports.length === 0 && !reporting && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: '0.75rem' }}><polyline points="20 6 9 17 4 12"/></svg>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No health concerns reported.</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>Use the button above if something is bothering you.</p>
        </div>
      )}
    </div>
  )
}
