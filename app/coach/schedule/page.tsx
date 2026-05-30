'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PHASE_CONFIG, PhaseType } from '@/lib/types'

interface Team { id: string; name: string; age_group?: string; color: string }
interface Template { id: string; name: string; phase_type?: string }
interface ScheduleEntry { id: string; team_id: string; template_id?: string; scheduled_date: string; notes?: string; workout_templates?: Template }

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  d.setHours(0,0,0,0)
  return d
}
function addDays(date: Date, days: number): Date { const d = new Date(date); d.setDate(d.getDate() + days); return d }
function fmt(date: Date): string { return date.toISOString().split('T')[0] }
function localFmt(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const TODAY = localFmt(new Date())

// Which weekdays to show gym days (0=Mon..6=Sun)
const GYM_DAYS = [0,1,2,3,4] // Mon-Fri default

function ScheduleContent() {
  const searchParams = useSearchParams()
  const teamFilter = searchParams.get('team')

  const [teams, setTeams] = useState<Team[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set())
  type ScheduleTemplate = { id: string; name: string; warmup_notes?: string; blocks: Array<{ id: string; block_label: string; sets: number; exercises: Array<{ id: string; exercise_id: string; custom_reps?: string; custom_notes?: string; exercise_library?: { id: string; name: string; default_reps?: string } }> }> }
  const [view, setView] = useState<'week'|'season'>('week')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Assign modal
  const [assigning, setAssigning] = useState<{ teamId: string; date: string } | null>(null)
  const [form, setForm] = useState({ templateId: '', notes: '' })

  // Custom workout builder
  const [buildingCustom, setBuildingCustom] = useState(false)
  const [customFor, setCustomFor] = useState<{ teamId: string; date: string } | null>(null)
  const [customPhase, setCustomPhase] = useState<PhaseType>('general')
  const [customTemplate, setCustomTemplate] = useState<{
    name: string; warmupNotes: string
    blocks: Array<{ label: string; sets: number; exercises: Array<{ exId: string; name: string; reps: string; notes: string; logsWeight: boolean }> }>
  }>({ name: '', warmupNotes: '', blocks: [] })
  const [customExSearch, setCustomExSearch] = useState('')
  const [customAddingTo, setCustomAddingTo] = useState<number | null>(null)
  const [allExercises, setAllExercises] = useState<Array<{ id: string; name: string; category: string; default_reps?: string; logs_weight: boolean }>>([])
  const [savingCustom, setSavingCustom] = useState(false)

  const PHASE_GUIDANCE: Record<string, { label: string; repRange: string; loadPct: string; intent: string; color: string }> = {
    build:           { label: 'Build',          repRange: '6–10 reps', loadPct: '70–80% 1RM', intent: 'Hypertrophy — controlled tempo, feel the muscle work', color: '#56a0d3' },
    peak:            { label: 'Peak',           repRange: '3–6 reps',  loadPct: '85–92% 1RM', intent: 'Max strength — heavy and fast, no grinding',            color: '#111827' },
    pre_tournament:  { label: 'Pre-Tournament', repRange: '6–8 reps',  loadPct: '65–75% 1RM', intent: 'Stay sharp and fresh — lighter, explosive',             color: '#d97706' },
    recovery:        { label: 'Recovery',       repRange: '12–15 reps',loadPct: '50–60% 1RM', intent: 'Flush fatigue — light weight, perfect form',            color: '#dc2626' },
    general:         { label: 'General',        repRange: '8–12 reps', loadPct: '70–80% 1RM', intent: 'Balanced strength and volume',                          color: '#6b7280' },
  }

  async function openCustomBuilder(teamId: string, date: string) {
    setCustomFor({ teamId, date })
    // Detect current phase for this team
    const res = await fetch(`/api/coach/phases?teamId=${teamId}`)
    const d = await res.json()
    const today = date
    const active = (d.phases ?? []).find((p: { starts_on: string; ends_on: string; phase_type: string }) => p.starts_on <= today && p.ends_on >= today)
    const phase = (active?.phase_type ?? 'general') as PhaseType
    setCustomPhase(phase)
    const guidance = PHASE_GUIDANCE[phase]
    setCustomTemplate({
      name: `${teams.find(t => t.id === teamId)?.name ?? 'Team'} — ${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      warmupNotes: '',
      blocks: [
        { label: 'A', sets: 3, exercises: [] },
        { label: 'B', sets: 3, exercises: [] },
        { label: 'C', sets: 3, exercises: [] },
        { label: 'D', sets: 3, exercises: [] },
      ],
    })
    if (!allExercises.length) {
      const exRes = await fetch('/api/coach/exercises')
      const exData = await exRes.json()
      setAllExercises(exData.exercises ?? [])
    }
    setAssigning(null)
    setBuildingCustom(true)
  }

  async function saveCustomWorkout() {
    if (!customFor || !customTemplate.name) return
    setSavingCustom(true)
    // Create template
    const tmplRes = await fetch('/api/coach/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: customTemplate.name,
        warmup_notes: customTemplate.warmupNotes,
        phase_type: customPhase,
        description: `Custom workout — ${new Date(customFor.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`,
        blocks: customTemplate.blocks
          .filter(b => b.exercises.length > 0)
          .map((b, bi) => ({
            block_label: b.label,
            sets: b.sets,
            sort_order: bi,
            exercises: b.exercises.map((e, ei) => ({
              exercise_id: e.exId,
              custom_reps: e.reps,
              custom_notes: e.notes,
              sort_order: ei,
            })),
          })),
      }),
    })
    const tmplData = await tmplRes.json()
    if (!tmplData.template?.id) { setSavingCustom(false); alert('Failed to create template'); return }
    // Assign to schedule
    await fetch('/api/coach/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: customFor.teamId, templateId: tmplData.template.id, scheduledDate: customFor.date }),
    })
    setTemplates(prev => [...prev, tmplData.template])
    await loadSchedule()
    setBuildingCustom(false)
    setSavingCustom(false)
  }

  // Schedule workout editor
  const [editingSchedule, setEditingSchedule] = useState<{ entry: ScheduleEntry; template: ScheduleTemplate } | null>(null)
  const [exerciseSearch, setExerciseSearch] = useState('')
  const [swapping, setSwapping] = useState<{ blockExId: string; blockLabel: string; currentName: string } | null>(null)

  async function openEditSchedule(entry: ScheduleEntry) {
    if (!entry.template_id) return
    const [tmplRes, exRes] = await Promise.all([
      fetch(`/api/coach/templates?id=${entry.template_id}`).then(r => r.json()),
      allExercises.length ? Promise.resolve({ exercises: allExercises }) : fetch('/api/coach/exercises').then(r => r.json()),
    ])
    if (exRes.exercises?.length && !allExercises.length) setAllExercises(exRes.exercises)
    setEditingSchedule({ entry, template: tmplRes.template })
    setExerciseSearch('')
    setSwapping(null)
  }

  async function swapExercise(scheduleId: string, originalBlockExerciseId: string, replacementExerciseId: string, customReps: string) {
    await fetch('/api/coach/overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'schedule_exercise', scheduleId, originalBlockExerciseId, replacementExerciseId, customReps }),
    })
    setSwapping(null)
    // Reload the template view
    if (editingSchedule) await openEditSchedule(editingSchedule.entry)
  }

  // Season fill modal
  const [filling, setFilling] = useState(false)
  const [fillForm, setFillForm] = useState({
    teamId: '',
    templateId: '',
    startDate: TODAY,
    endDate: '',
    days: [1,3] as number[], // Tue, Thu default
    skipExisting: true,
  })
  const [fillPreview, setFillPreview] = useState<string[]>([])
  const [fillSaving, setFillSaving] = useState(false)
  const [fillDone, setFillDone] = useState('')

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

  useEffect(() => { loadSchedule() }, [weekStart, selectedTeams])

  async function loadSchedule() {
    if (!selectedTeams.size) return
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

  // Build preview of dates that would be filled
  function buildFillDates(): string[] {
    if (!fillForm.startDate || !fillForm.endDate || !fillForm.days.length) return []
    const dates: string[] = []
    const end = new Date(fillForm.endDate + 'T12:00:00')
    let cur = new Date(fillForm.startDate + 'T12:00:00')
    while (cur <= end) {
      // getDay(): 0=Sun,1=Mon...6=Sat; our days: 0=Mon..6=Sun
      const dayOfWeek = cur.getDay() === 0 ? 6 : cur.getDay() - 1
      if (fillForm.days.includes(dayOfWeek)) {
        dates.push(localFmt(cur))
      }
      cur.setDate(cur.getDate() + 1)
    }
    return dates
  }

  useEffect(() => {
    setFillPreview(buildFillDates())
  }, [fillForm.startDate, fillForm.endDate, fillForm.days])

  async function runFill() {
    if (!fillForm.teamId || !fillForm.templateId || !fillPreview.length) return
    setFillSaving(true)
    let added = 0
    for (const date of fillPreview) {
      // Skip if existing entry and skipExisting is true
      const existing = schedule.find(s => s.team_id === fillForm.teamId && s.scheduled_date === date)
      if (existing && fillForm.skipExisting) continue
      await fetch('/api/coach/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: fillForm.teamId, templateId: fillForm.templateId, scheduledDate: date }),
      })
      added++
    }
    setFillDone(`Added ${added} sessions`)
    setFillSaving(false)
    await loadSchedule()
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const visibleTeams = teams.filter(t => selectedTeams.has(t.id))
  function getEntry(teamId: string, date: Date): ScheduleEntry | undefined {
    return schedule.find(s => s.team_id === teamId && s.scheduled_date === fmt(date))
  }

  // Season view: 8 weeks from current week
  const seasonWeeks = Array.from({ length: 12 }, (_, i) => addDays(weekStart, i * 7))

  const Label = ({ children }: { children: React.ReactNode }) => (
    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', fontWeight: 600 }}>{children}</label>
  )

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>Schedule</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Assign workout templates to teams by day</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => { setFilling(true); setFillDone('') }} className="btn-volt" style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}>
            ⚡ Fill Season
          </button>
        </div>
      </div>

      {/* View toggle + week nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--carolina-light)', padding: '0.2rem', borderRadius: 8, border: '1.5px solid var(--carolina-border)' }}>
          {(['week','season'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: '0.35rem 0.875rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', background: view === v ? 'var(--carolina)' : 'transparent', color: view === v ? '#fff' : 'var(--carolina-dark)' }}>
              {v === 'week' ? 'Week' : '12-Week View'}
            </button>
          ))}
        </div>
        <button className="btn-ghost" onClick={() => setWeekStart(d => addDays(d, -7))} style={{ padding: '0.4rem 0.875rem' }}>← Prev</button>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem' }}>
          {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {addDays(weekStart, view === 'week' ? 6 : 83).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <button className="btn-ghost" onClick={() => setWeekStart(d => addDays(d, 7))} style={{ padding: '0.4rem 0.875rem' }}>Next →</button>
        <button className="btn-ghost" onClick={() => setWeekStart(getMonday(new Date()))} style={{ padding: '0.4rem 0.875rem', fontSize: '0.8rem' }}>Today</button>
      </div>

      {/* Team filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' }}>
        {teams.map(t => (
          <button key={t.id} onClick={() => setSelectedTeams(prev => { const s = new Set(prev); s.has(t.id) ? s.delete(t.id) : s.add(t.id); return s })}
            style={{ padding: '0.3rem 0.75rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${selectedTeams.has(t.id) ? t.color : 'var(--gray-border)'}`, background: selectedTeams.has(t.id) ? `${t.color}20` : 'transparent', color: selectedTeams.has(t.id) ? t.color : 'var(--text-muted)' }}>
            {t.name}
          </button>
        ))}
      </div>

      {/* ── WEEK VIEW ── */}
      {view === 'week' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ width: 140, padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1.5px solid var(--gray-border)' }}>Team</th>
                {weekDays.map((d, i) => (
                  <th key={i} style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.72rem', color: fmt(d) === TODAY ? 'var(--carolina)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1.5px solid var(--gray-border)', fontWeight: fmt(d) === TODAY ? 700 : 600, background: fmt(d) === TODAY ? 'var(--carolina-light)' : 'transparent' }}>
                    {DAY_LABELS[i]}<br /><span style={{ fontSize: '0.7rem', fontWeight: 400 }}>{d.getDate()}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleTeams.map(team => (
                <tr key={team.id} style={{ borderBottom: '1px solid var(--gray-border)' }}>
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
                      <td key={di} style={{ padding: '0.3rem', textAlign: 'center', verticalAlign: 'middle', background: fmt(d) === TODAY ? 'var(--carolina-light)' : 'transparent' }}>
                        {entry ? (
                          <div style={{ background: phaseConfig ? `${phaseConfig.color}18` : 'rgba(86,160,211,0.1)', border: `1px solid ${phaseConfig?.color ?? 'var(--carolina)'}40`, borderRadius: 6, padding: '0.3rem 0.4rem', position: 'relative', cursor: 'pointer' }}
                            onClick={() => entry.template_id ? openEditSchedule(entry) : (setAssigning({ teamId: team.id, date: fmt(d) }), setForm({ templateId: entry.template_id ?? '', notes: entry.notes ?? '' }))}>
                            <div style={{ fontWeight: 600, fontSize: '0.72rem', color: phaseConfig?.color ?? 'var(--carolina)', lineHeight: 1.2 }}>{entry.workout_templates?.name ?? 'Workout'}</div>
                            <button onClick={e => { e.stopPropagation(); remove(entry.id) }} style={{ position: 'absolute', top: 2, right: 2, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.65rem', lineHeight: 1 }}>✕</button>
                          </div>
                        ) : (
                          <button onClick={() => { setAssigning({ teamId: team.id, date: fmt(d) }); setForm({ templateId: '', notes: '' }) }}
                            style={{ width: '100%', minHeight: 36, background: 'transparent', border: '1px dashed var(--gray-border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', transition: 'all 0.12s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = team.color; e.currentTarget.style.color = team.color }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gray-border)'; e.currentTarget.style.color = 'var(--text-muted)' }}>+</button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SEASON VIEW ── */}
      {view === 'season' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ width: 120, padding: '0.4rem 0.75rem', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)', borderBottom: '1.5px solid var(--gray-border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team</th>
                {seasonWeeks.map((w, i) => (
                  <th key={i} style={{ padding: '0.4rem 0.25rem', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', borderBottom: '1.5px solid var(--gray-border)', fontWeight: 600, minWidth: 72 }}>
                    <div style={{ fontWeight: 700, color: 'var(--black)' }}>Wk {i+1}</div>
                    <div style={{ fontWeight: 400 }}>{w.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleTeams.map(team => (
                <tr key={team.id} style={{ borderBottom: '1px solid var(--gray-border)' }}>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: team.color, flexShrink: 0 }} />
                      {team.name}
                    </div>
                  </td>
                  {seasonWeeks.map((w, wi) => {
                    const weekEntries = Array.from({length:7},(_,i) => addDays(w,i))
                      .map(d => schedule.find(s => s.team_id === team.id && s.scheduled_date === fmt(d)))
                      .filter(Boolean) as ScheduleEntry[]
                    const count = weekEntries.length
                    const phaseTypes = [...new Set(weekEntries.map(e => e.workout_templates?.phase_type).filter(Boolean))]
                    const phaseConfig = phaseTypes.length === 1 ? PHASE_CONFIG[phaseTypes[0] as PhaseType] : null
                    return (
                      <td key={wi} style={{ padding: '0.3rem', textAlign: 'center', cursor: 'pointer' }}
                        onClick={() => { setView('week'); setWeekStart(w) }}>
                        {count > 0 ? (
                          <div style={{ background: phaseConfig ? `${phaseConfig.color}20` : `${team.color}15`, border: `1.5px solid ${phaseConfig?.color ?? team.color}50`, borderRadius: 6, padding: '0.3rem 0.4rem' }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: phaseConfig?.color ?? team.color, lineHeight: 1 }}>{count}</div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>{count === 1 ? 'session' : 'sessions'}</div>
                            {phaseConfig && <div style={{ fontSize: '0.6rem', color: phaseConfig.color, fontWeight: 700, marginTop: '0.1rem' }}>{phaseConfig.label}</div>}
                          </div>
                        ) : (
                          <div style={{ height: 36, border: '1px dashed var(--gray-border)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.65rem' }}>—</div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>Click any week to drill into the daily view.</p>
        </div>
      )}

      {/* ── ASSIGN MODAL ── */}
      {assigning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setAssigning(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: '1.5rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '0.25rem', fontSize: '1.1rem' }}>Assign Workout</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              {teams.find(t => t.id === assigning.teamId)?.name} · {new Date(assigning.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <div style={{ marginBottom: '0.75rem' }}>
              <Label>Workout Template</Label>
              <select className="input" value={form.templateId} onChange={e => setForm(p => ({ ...p, templateId: e.target.value }))}>
                <option value="">Select template…</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <Label>Notes (optional)</Label>
              <input className="input" placeholder="e.g. Focus on explosive work" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.625rem' }}>
              <button className="btn-ghost" onClick={() => setAssigning(null)} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
              <button className="btn-volt" onClick={assign} disabled={saving || !form.templateId} style={{ flex: 2, padding: '0.75rem' }}>{saving ? 'Saving…' : 'Assign'}</button>
            </div>
            <button onClick={() => openCustomBuilder(assigning!.teamId, assigning!.date)}
              style={{ width: '100%', padding: '0.625rem', background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 8, color: 'var(--carolina-dark)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
              ✏️ Build Custom Workout for This Day →
            </button>
          </div>
        </div>
      )}

      {/* ── SCHEDULE WORKOUT EDITOR ── */}
      {editingSchedule && !swapping && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 50, padding: '1rem', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setEditingSchedule(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 640, padding: '1.75rem', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem', marginBottom: '0.2rem' }}>
                  {editingSchedule.template?.name ?? 'Workout'}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  {teams.find(t => t.id === editingSchedule.entry.team_id)?.name} · {new Date(editingSchedule.entry.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
                <p style={{ color: 'var(--carolina-dark)', fontSize: '0.75rem', marginTop: '0.3rem' }}>Click any exercise to swap it for this date only. All other dates keep the original.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button onClick={() => { setAssigning({ teamId: editingSchedule.entry.team_id, date: editingSchedule.entry.scheduled_date }); setForm({ templateId: editingSchedule.entry.template_id ?? '', notes: editingSchedule.entry.notes ?? '' }); setEditingSchedule(null) }} className="btn-ghost" style={{ padding: '0.4rem 0.875rem', fontSize: '0.82rem' }}>Change Template</button>
                <button onClick={() => setEditingSchedule(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>✕</button>
              </div>
            </div>
            {editingSchedule.template?.warmup_notes && (
              <div style={{ background: 'var(--carolina-light)', border: '1px solid var(--carolina-border)', borderRadius: 8, padding: '0.625rem 0.875rem', marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--carolina-deep)' }}>
                <strong>Warmup:</strong> {editingSchedule.template.warmup_notes}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {(editingSchedule.template?.blocks ?? []).map(block => (
                <div key={block.id} style={{ border: '1.5px solid var(--gray-border)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ background: 'var(--black)', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--yellow)' }}>BLOCK {block.block_label}</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>{block.sets} sets · superset</div>
                  </div>
                  <div style={{ padding: '0.5rem' }}>
                    {block.exercises.map((ex, ei) => {
                      const lib = ex.exercise_library
                      return (
                        <div key={ex.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.625rem', borderRadius: 8, marginBottom: ei < block.exercises.length - 1 ? '0.25rem' : 0, background: 'var(--white)', border: '1px solid var(--gray-border)', cursor: 'pointer', transition: 'all 0.12s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--carolina)'; e.currentTarget.style.background = 'var(--carolina-light)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gray-border)'; e.currentTarget.style.background = 'var(--white)' }}
                          onClick={() => setSwapping({ blockExId: ex.id, blockLabel: block.block_label, currentName: lib?.name ?? 'Exercise' })}>
                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--carolina)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', color: '#fff', flexShrink: 0 }}>{ei + 1}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{lib?.name ?? ex.exercise_id}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{block.sets} × {ex.custom_reps ?? lib?.default_reps ?? '—'} reps</div>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--carolina-dark)', fontWeight: 600 }}>Swap →</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── EXERCISE SWAP PICKER ── */}
      {editingSchedule && swapping && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setSwapping(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 460, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem' }}>Swap Exercise</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Block {swapping.blockLabel} · replacing <strong>{swapping.currentName}</strong></p>
              </div>
              <button onClick={() => setSwapping(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            <input className="input" placeholder="Search exercises…" value={exerciseSearch} onChange={e => setExerciseSearch(e.target.value)} style={{ marginBottom: '0.75rem' }} autoFocus />
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {allExercises.filter(e => e.name.toLowerCase().includes(exerciseSearch.toLowerCase())).map(ex => (
                <button key={ex.id} onClick={() => swapExercise(editingSchedule.entry.id, swapping.blockExId, ex.id, ex.default_reps ?? '8')}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0.875rem', borderRadius: 8, border: '1.5px solid var(--gray-border)', background: 'var(--white)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--carolina)'; e.currentTarget.style.background = 'var(--carolina-light)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gray-border)'; e.currentTarget.style.background = 'var(--white)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{ex.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ex.category} · {ex.default_reps} reps</div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--carolina)', fontWeight: 600, flexShrink: 0 }}>Select</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CUSTOM WORKOUT BUILDER ── */}
      {buildingCustom && customFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 55, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setBuildingCustom(false) }}>
          <div className="card" style={{ width: '100%', maxWidth: 680, padding: '1.75rem', margin: 'auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem', marginBottom: '0.2rem' }}>Build Custom Workout</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  {teams.find(t => t.id === customFor.teamId)?.name} · {new Date(customFor.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <button onClick={() => setBuildingCustom(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.3rem' }}>✕</button>
            </div>

            {/* Phase guidance banner */}
            {(() => {
              const g = PHASE_GUIDANCE[customPhase]
              return (
                <div style={{ background: `${g.color}10`, border: `1.5px solid ${g.color}30`, borderRadius: 10, padding: '0.875rem 1rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', color: g.color }}>{g.label} Phase</span>
                    <select value={customPhase} onChange={e => setCustomPhase(e.target.value as PhaseType)}
                      style={{ marginLeft: 'auto', padding: '0.2rem 0.5rem', border: `1px solid ${g.color}40`, borderRadius: 6, fontSize: '0.75rem', color: g.color, background: 'transparent', cursor: 'pointer' }}>
                      {Object.entries(PHASE_GUIDANCE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Suggested Reps</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: g.color }}>{g.repRange}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Load</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: g.color }}>{g.loadPct}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Intent</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{g.intent}</div>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Workout name */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', fontWeight: 600 }}>Workout Name</label>
              <input className="input" value={customTemplate.name} onChange={e => setCustomTemplate(p => ({ ...p, name: e.target.value }))} />
            </div>

            {/* Warmup notes */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', fontWeight: 600 }}>Warmup Notes</label>
              <input className="input" placeholder="e.g. 10 min: Hip 90/90, glute bridge, lateral band walk…" value={customTemplate.warmupNotes} onChange={e => setCustomTemplate(p => ({ ...p, warmupNotes: e.target.value }))} />
            </div>

            {/* Blocks */}
            {customTemplate.blocks.map((block, bi) => (
              <div key={bi} style={{ border: '1.5px solid var(--gray-border)', borderRadius: 10, overflow: 'hidden', marginBottom: '0.875rem' }}>
                <div style={{ background: 'var(--black)', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--yellow)' }}>BLOCK {block.label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>Sets:</span>
                    <input type="number" min={1} max={6} value={block.sets}
                      onChange={e => setCustomTemplate(p => ({ ...p, blocks: p.blocks.map((b, i) => i === bi ? { ...b, sets: parseInt(e.target.value) || 3 } : b) }))}
                      style={{ width: 40, padding: '0.2rem', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.85rem', textAlign: 'center' }} />
                  </div>
                  <div style={{ flex: 1 }} />
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>{PHASE_GUIDANCE[customPhase].repRange}</div>
                </div>

                <div style={{ padding: '0.625rem' }}>
                  {/* Exercises */}
                  {block.exercises.map((ex, ei) => (
                    <div key={ei} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr auto', gap: '0.4rem', alignItems: 'center', marginBottom: '0.4rem', padding: '0.4rem 0.5rem', background: 'var(--carolina-light)', borderRadius: 6 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{ex.name}</div>
                      <input className="input" value={ex.reps} placeholder={PHASE_GUIDANCE[customPhase].repRange.split('–')[0] + ' reps'}
                        onChange={e => setCustomTemplate(p => ({ ...p, blocks: p.blocks.map((b, i) => i !== bi ? b : { ...b, exercises: b.exercises.map((x, j) => j !== ei ? x : { ...x, reps: e.target.value }) }) }))}
                        style={{ padding: '0.3rem 0.4rem', fontSize: '0.8rem', textAlign: 'center' }} />
                      <input className="input" value={ex.notes} placeholder="Notes…"
                        onChange={e => setCustomTemplate(p => ({ ...p, blocks: p.blocks.map((b, i) => i !== bi ? b : { ...b, exercises: b.exercises.map((x, j) => j !== ei ? x : { ...x, notes: e.target.value }) }) }))}
                        style={{ padding: '0.3rem 0.4rem', fontSize: '0.8rem' }} />
                      <button onClick={() => setCustomTemplate(p => ({ ...p, blocks: p.blocks.map((b, i) => i !== bi ? b : { ...b, exercises: b.exercises.filter((_, j) => j !== ei) }) }))}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                    </div>
                  ))}

                  {/* Exercise search */}
                  {customAddingTo === bi ? (
                    <div style={{ background: 'var(--carolina-light)', borderRadius: 8, padding: '0.625rem', border: '1.5px solid var(--carolina-border)' }}>
                      <input className="input" autoFocus placeholder="Search exercises…" value={customExSearch}
                        onChange={e => setCustomExSearch(e.target.value)} style={{ marginBottom: '0.5rem' }} />
                      <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {allExercises.filter(e => e.name.toLowerCase().includes(customExSearch.toLowerCase())).slice(0, 20).map(ex => (
                          <button key={ex.id} onClick={() => {
                            const defaultReps = PHASE_GUIDANCE[customPhase].repRange.split('–')[0]
                            setCustomTemplate(p => ({ ...p, blocks: p.blocks.map((b, i) => i !== bi ? b : { ...b, exercises: [...b.exercises, { exId: ex.id, name: ex.name, reps: defaultReps, notes: '', logsWeight: ex.logs_weight }] }) }))
                            setCustomExSearch('')
                            setCustomAddingTo(null)
                          }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.625rem', border: '1px solid var(--gray-border)', borderRadius: 6, background: 'var(--white)', cursor: 'pointer', fontSize: '0.82rem', textAlign: 'left' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--carolina-light)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--white)'}>
                            <span style={{ fontWeight: 500 }}>{ex.name}</span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ex.category}</span>
                          </button>
                        ))}
                      </div>
                      <button onClick={() => { setCustomAddingTo(null); setCustomExSearch('') }} style={{ marginTop: '0.4rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem' }}>Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => { setCustomAddingTo(bi); setCustomExSearch('') }}
                      style={{ width: '100%', padding: '0.4rem', background: 'transparent', border: '1px dashed var(--gray-border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.82rem' }}>
                      + Add Exercise to Block {block.label}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Save */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button className="btn-ghost" onClick={() => setBuildingCustom(false)} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
              <button className="btn-volt" onClick={saveCustomWorkout}
                disabled={savingCustom || !customTemplate.name || customTemplate.blocks.every(b => b.exercises.length === 0)}
                style={{ flex: 2, padding: '0.75rem' }}>
                {savingCustom ? 'Saving…' : 'Save & Schedule Workout'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FILL SEASON MODAL ── */}
      {filling && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) { setFilling(false); setFillDone('') } }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, padding: '1.75rem', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem' }}>⚡ Fill Season</h2>
              <button onClick={() => { setFilling(false); setFillDone('') }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.3rem' }}>✕</button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
              Pick a team, template, date range, and which days of the week. The app will schedule that workout on every matching day across the whole range in one shot.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Team</Label>
                <select className="input" value={fillForm.teamId} onChange={e => setFillForm(p => ({ ...p, teamId: e.target.value }))}>
                  <option value="">Select team…</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Workout Template</Label>
                <select className="input" value={fillForm.templateId} onChange={e => setFillForm(p => ({ ...p, templateId: e.target.value }))}>
                  <option value="">Select template…</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Season Start</Label>
                <input type="date" className="input" value={fillForm.startDate} onChange={e => setFillForm(p => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div>
                <Label>Season End</Label>
                <input type="date" className="input" value={fillForm.endDate} onChange={e => setFillForm(p => ({ ...p, endDate: e.target.value }))} />
              </div>
            </div>

            {/* Day picker */}
            <div style={{ marginBottom: '1rem' }}>
              <Label>Gym Days</Label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {DAY_LABELS.map((label, i) => (
                  <button key={i} onClick={() => setFillForm(p => ({
                    ...p, days: p.days.includes(i) ? p.days.filter(d => d !== i) : [...p.days, i].sort()
                  }))} style={{ flex: 1, padding: '0.5rem 0', borderRadius: 7, border: `1.5px solid ${fillForm.days.includes(i) ? 'var(--carolina)' : 'var(--gray-border)'}`, background: fillForm.days.includes(i) ? 'var(--carolina)' : 'transparent', color: fillForm.days.includes(i) ? '#fff' : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Skip existing toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={fillForm.skipExisting} onChange={e => setFillForm(p => ({ ...p, skipExisting: e.target.checked }))} />
              Skip dates that already have a workout assigned
            </label>

            {/* Preview */}
            {fillPreview.length > 0 && (
              <div style={{ background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--carolina-deep)', marginBottom: '0.3rem' }}>
                  {fillPreview.length} sessions will be scheduled
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxHeight: 80, overflowY: 'auto' }}>
                  {fillPreview.slice(0, 6).map(d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })).join(' · ')}
                  {fillPreview.length > 6 && ` · +${fillPreview.length - 6} more`}
                </div>
              </div>
            )}

            {fillDone && (
              <div style={{ background: 'rgba(22,163,74,0.1)', border: '1.5px solid rgba(22,163,74,0.3)', borderRadius: 8, padding: '0.625rem 1rem', marginBottom: '1rem', color: 'var(--success)', fontWeight: 600, fontSize: '0.85rem' }}>
                ✓ {fillDone}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-ghost" onClick={() => { setFilling(false); setFillDone('') }} style={{ flex: 1, padding: '0.75rem' }}>Close</button>
              <button className="btn-volt" onClick={runFill}
                disabled={fillSaving || !fillForm.teamId || !fillForm.templateId || !fillForm.startDate || !fillForm.endDate || fillPreview.length === 0}
                style={{ flex: 2, padding: '0.75rem' }}>
                {fillSaving ? 'Scheduling…' : `Schedule ${fillPreview.length} Sessions`}
              </button>
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
