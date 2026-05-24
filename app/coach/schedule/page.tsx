'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PHASE_CONFIG, PhaseType } from '@/lib/types'

interface Team { id: string; name: string; age_group?: string; color: string }
interface Template { id: string; name: string; phase_type?: string }
interface ScheduleEntry { id: string; team_id: string; template_id?: string; scheduled_date: string; notes?: string; teams?: Team; workout_templates?: Template }

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff); d.setHours(0,0,0,0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + days); return d
}

function fmt(date: Date): string { return date.toISOString().split('T')[0] }

const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function ScheduleContent() {
  const searchParams = useSearchParams()
  const teamFilter = searchParams.get('team')

  const [teams, setTeams] = useState<Team[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set())
  const [assigning, setAssigning] = useState<{ teamId: string; date: string } | null>(null)
  const [form, setForm] = useState({ templateId: '', notes: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/coach/teams').then(r => r.json()),
      fetch('/api/coach/templates').then(r => r.json()),
    ]).then(([t, tm]) => {
      setTeams(t.teams ?? [])
      setTemplates(tm.templates ?? [])
      if (teamFilter) setSelectedTeams(new Set([teamFilter]))
      else setSelectedTeams(new Set((t.teams ?? []).map((t: Team) => t.id)))
      setLoading(false)
    })
  }, [teamFilter])

  useEffect(() => { loadSchedule() }, [weekStart])

  async function loadSchedule() {
    const res = await fetch(`/api/coach/schedule?weekOf=${fmt(weekStart)}`)
    const data = await res.json()
    setSchedule(data.schedule ?? [])
  }

  async function assign() {
    if (!assigning) return
    setSaving(true)
    await fetch('/api/coach/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: assigning.teamId, templateId: form.templateId || null, scheduledDate: assigning.date, notes: form.notes }),
    })
    await loadSchedule()
    setAssigning(null); setSaving(false)
  }

  async function remove(id: string) {
    await fetch('/api/coach/schedule', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setSchedule(prev => prev.filter(s => s.id !== id))
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const visibleTeams = teams.filter(t => selectedTeams.has(t.id))

  function getEntry(teamId: string, date: Date): ScheduleEntry | undefined {
    return schedule.find(s => s.team_id === teamId && s.scheduled_date === fmt(date))
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>Schedule</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Assign workout templates to teams by day</p>
      </div>

      {/* Week nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
        <button className="btn-ghost" onClick={() => setWeekStart(d => addDays(d, -7))} style={{ padding: '0.4rem 0.875rem' }}>← Prev</button>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem' }}>
          {weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – {addDays(weekStart, 6).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </span>
        <button className="btn-ghost" onClick={() => setWeekStart(d => addDays(d, 7))} style={{ padding: '0.4rem 0.875rem' }}>Next →</button>
        <button className="btn-ghost" onClick={() => setWeekStart(getMonday(new Date()))} style={{ padding: '0.4rem 0.875rem', fontSize: '0.8rem' }}>Today</button>
      </div>

      {/* Team filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' }}>
        {teams.map(t => (
          <button key={t.id} onClick={() => setSelectedTeams(prev => { const s = new Set(prev); s.has(t.id) ? s.delete(t.id) : s.add(t.id); return s })}
            style={{ padding: '0.3rem 0.75rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${selectedTeams.has(t.id) ? t.color : 'var(--court-border)'}`, background: selectedTeams.has(t.id) ? `${t.color}20` : 'transparent', color: selectedTeams.has(t.id) ? t.color : 'var(--text-muted)', transition: 'all 0.15s' }}>
            {t.name}
          </button>
        ))}
      </div>

      {/* Schedule grid */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ width: 140, padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--court-border)' }}>Team</th>
              {weekDays.map((d, i) => (
                <th key={i} style={{ padding: '0.5rem 0.5rem', textAlign: 'center', fontSize: '0.75rem', color: fmt(d) === fmt(new Date()) ? 'var(--volt)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--court-border)', fontWeight: fmt(d) === fmt(new Date()) ? 700 : 600 }}>
                  {DAY_LABELS[i]}<br /><span style={{ fontSize: '0.7rem', fontWeight: 400 }}>{d.getDate()}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleTeams.map(team => (
              <tr key={team.id} style={{ borderBottom: '1px solid var(--court-border)' }}>
                <td style={{ padding: '0.625rem 0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: team.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{team.name}</div>
                      {team.age_group && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{team.age_group}</div>}
                    </div>
                  </div>
                </td>
                {weekDays.map((d, di) => {
                  const entry = getEntry(team.id, d)
                  const phaseConfig = entry?.workout_templates?.phase_type ? PHASE_CONFIG[entry.workout_templates.phase_type as PhaseType] : null
                  return (
                    <td key={di} style={{ padding: '0.4rem', textAlign: 'center', verticalAlign: 'middle' }}>
                      {entry ? (
                        <div style={{ background: phaseConfig ? `${phaseConfig.color}18` : 'rgba(74,222,128,0.08)', border: `1px solid ${phaseConfig?.color ?? 'var(--volt)'}40`, borderRadius: 6, padding: '0.3rem 0.4rem', fontSize: '0.72rem', cursor: 'pointer', position: 'relative' }}
                          title={entry.notes ?? ''}>
                          <div style={{ fontWeight: 600, color: phaseConfig?.color ?? 'var(--volt)', lineHeight: 1.2, marginBottom: '0.15rem' }}>{entry.workout_templates?.name ?? 'Workout'}</div>
                          <button onClick={() => remove(entry.id)} style={{ position: 'absolute', top: 2, right: 2, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.7rem', lineHeight: 1 }}>✕</button>
                        </div>
                      ) : (
                        <button onClick={() => { setAssigning({ teamId: team.id, date: fmt(d) }); setForm({ templateId: '', notes: '' }) }}
                          style={{ width: '100%', minHeight: 36, background: 'transparent', border: '1px dashed var(--court-muted)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--volt)'; e.currentTarget.style.color = 'var(--volt)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--court-muted)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
                          +
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Assign modal */}
      {assigning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setAssigning(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: '1.5rem', borderRadius: 16 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '0.25rem', fontSize: '1.1rem' }}>Assign Workout</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              {teams.find(t => t.id === assigning.teamId)?.name} · {new Date(assigning.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Workout Template</label>
              <select className="input" value={form.templateId} onChange={e => setForm(p => ({ ...p, templateId: e.target.value }))}>
                <option value="">Select template…</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Notes (optional)</label>
              <input className="input" placeholder="e.g. Focus on explosive work today" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-ghost" onClick={() => setAssigning(null)} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
              <button className="btn-volt" onClick={assign} disabled={saving} style={{ flex: 2, padding: '0.75rem' }}>{saving ? 'Saving…' : 'Assign'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SchedulePage() {
  return <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>}><ScheduleContent /></Suspense>
}
