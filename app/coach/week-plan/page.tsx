// FILE: app/coach/week-plan/page.tsx
//
// Coach Week Plan (lacrosse only; FEATURES.weekPlan). Replaces the dated
// Schedule page on the lacrosse site.
//
// Pick a team and a week, then set that week's workouts in order: Day 1,
// Day 2, ... (up to 7). Players do them in order, one per day, whenever
// they can that week; every Monday starts over at Day 1 (lib/weekPlan.ts).
//
// A week with no plan of its own uses the most recent earlier week that has
// workouts, so a plan keeps rolling forward until it's changed. Editing a
// rolled-forward week saves it as that week's own plan; later weeks then
// roll forward from it.
//
// Below the plan: each player's progress through that week.

'use client'
import { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

interface Team { id: string; name: string; color: string; is_open_gym?: boolean }
interface Template { id: string; name: string }
interface PlanSlot { slot: number; templateId: string; name: string }
interface WeekPlan { weekStart: string; fromWeek: string | null; ownPlan: boolean; slots: PlanSlot[] }
type DayState = 'done' | 'in_progress' | 'next' | 'locked'
interface PlayerDay { slot: number; name: string; state: DayState; startedOn: string | null; finishedOn: string | null }
interface PlayerRow { id: string; name: string; jerseyNumber: string | null; status: string; days: PlayerDay[] }
interface WeekData { weekStart: string; thisWeek: string; today: string; maxSlots: number; plan: WeekPlan; players: PlayerRow[] }

// Plain YYYY-MM-DD date maths (no time zones)
function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function short(date: string, withDay = false): string {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', ...(withDay ? { weekday: 'short' } : {}),
  })
}
function weekday(date: string): string {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' })
}

function PlanSourceLine({ data }: { data: WeekData }) {
  const { plan } = data
  let text: string
  let tone: 'info' | 'warn' | 'muted' = 'info'
  if (plan.ownPlan && plan.slots.length === 0) { text = 'Off week: no workouts this week.'; tone = 'warn' }
  else if (plan.ownPlan) text = 'This week has its own plan.'
  else if (plan.fromWeek) text = `No changes made, so this week repeats the plan from the week of ${short(plan.fromWeek)}.`
  else { text = 'No workouts set up yet. Players will see "No workouts posted yet."'; tone = 'warn' }
  const colors = {
    info: { bg: 'var(--carolina-light)', border: 'var(--carolina-border)', fg: 'var(--carolina-dark)' },
    warn: { bg: 'var(--warning-light)', border: '#fde68a', fg: 'var(--warning)' },
    muted: { bg: 'transparent', border: 'var(--gray-border)', fg: 'var(--text-muted)' },
  }[tone]
  return (
    <div style={{ background: colors.bg, border: `1.5px solid ${colors.border}`, color: colors.fg, borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.82rem', fontWeight: 600, marginBottom: '1rem' }}>
      {text}
    </div>
  )
}

function DayCell({ day }: { day: PlayerDay | undefined }) {
  if (!day) return <span style={{ color: 'var(--text-muted)' }}>·</span>
  if (day.state === 'done') {
    return (
      <span title={day.finishedOn ? `Finished ${short(day.finishedOn, true)}` : 'Finished'} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', color: 'var(--success)', fontWeight: 700 }}>
        <span aria-hidden>✓</span>
        <span style={{ fontSize: '0.68rem', fontWeight: 600 }}>{day.finishedOn ? weekday(day.finishedOn) : ''}</span>
      </span>
    )
  }
  if (day.state === 'in_progress') {
    return (
      <span title={day.startedOn ? `Started ${short(day.startedOn, true)}, not finished` : 'Started, not finished'} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', color: 'var(--warning)', fontWeight: 700 }}>
        <span aria-hidden style={{ display: 'inline-block', width: 12, height: 12, margin: '3px 0', borderRadius: '50%', border: '2px solid var(--warning)', background: 'linear-gradient(90deg, var(--warning) 50%, transparent 50%)' }} />
        <span style={{ fontSize: '0.68rem', fontWeight: 600 }}>{day.startedOn ? weekday(day.startedOn) : ''}</span>
      </span>
    )
  }
  return <span style={{ color: 'var(--gray-border)', fontWeight: 700 }} aria-label="Not started">–</span>
}

function statusLabel(p: PlayerRow): { text: string; color: string } {
  const done = p.days.filter(d => d.state === 'done').length
  if (p.status === 'no_plan') return { text: '—', color: 'var(--text-muted)' }
  if (p.status === 'week_done') return { text: 'All done', color: 'var(--success)' }
  if (p.status === 'done_today') return { text: `${done} of ${p.days.length} · done today`, color: 'var(--success)' }
  return { text: `${done} of ${p.days.length}`, color: done ? 'var(--carolina-dark)' : 'var(--text-muted)' }
}

function WeekPlanContent() {
  const searchParams = useSearchParams()
  const [teams, setTeams] = useState<Team[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [teamId, setTeamId] = useState<string>('')
  const [week, setWeek] = useState<string | null>(null)  // any date in the week; null = this week
  const [data, setData] = useState<WeekData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Editor: template ids in order
  const [draft, setDraft] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/coach/teams').then(r => r.json()),
      fetch('/api/coach/templates').then(r => r.json()),
    ]).then(([t, w]) => {
      const list: Team[] = (t.teams ?? []).filter((x: Team) => !x.is_open_gym)
      setTeams(list)
      setTemplates(w.templates ?? [])
      const wanted = searchParams.get('team')
      setTeamId(list.find(x => x.id === wanted)?.id ?? list[0]?.id ?? '')
      if (!list.length) setLoading(false)
    }).catch(() => { setError('Could not load teams'); setLoading(false) })
  }, [searchParams])

  const load = useCallback(async () => {
    if (!teamId) return
    setLoading(true); setError('')
    const params = new URLSearchParams({ teamId })
    if (week) params.set('week', week)
    try {
      const res = await fetch(`/api/coach/week-plan?${params}`)
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Could not load the week'); setLoading(false); return }
      setData(d)
      setDraft((d.plan as WeekPlan).slots.map(s => s.templateId))
      setConfirmClear(false)
    } catch { setError('Could not load the week') }
    setLoading(false)
  }, [teamId, week])

  useEffect(() => { load() }, [load])

  const original = useMemo(() => (data?.plan.slots ?? []).map(s => s.templateId), [data])
  const dirty = draft.length !== original.length || draft.some((t, i) => t !== original[i])
  const missingPick = draft.some(t => !t)

  async function save(templateIds: string[]) {
    if (!data) return
    setSaving(true); setError(''); setSaved('')
    try {
      const res = await fetch('/api/coach/week-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, weekStart: data.weekStart, templateIds }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Not saved'); setSaving(false); return }
      setSaved(templateIds.length ? 'Saved. Later weeks will repeat this plan until you change it.' : 'Saved as an off week.')
      await load()
    } catch { setError('Not saved') }
    setSaving(false)
  }

  async function clearOwnPlan() {
    if (!data) return
    setSaving(true); setError(''); setSaved('')
    try {
      const res = await fetch('/api/coach/week-plan', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, weekStart: data.weekStart }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Not changed'); setSaving(false); return }
      setSaved('This week now repeats the most recent earlier plan.')
      await load()
    } catch { setError('Not changed') }
    setSaving(false)
  }

  function move(i: number, by: number) {
    setDraft(d => {
      const j = i + by
      if (j < 0 || j >= d.length) return d
      const next = [...d]; [next[i], next[j]] = [next[j], next[i]]; return next
    })
  }

  const team = teams.find(t => t.id === teamId)
  const isThisWeek = data && data.weekStart === data.thisWeek
  const maxSlots = data?.maxSlots ?? 7

  return (
    <div style={{ padding: '2rem', maxWidth: 1000 }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>Week Plan</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 640 }}>
          Players do these in order, one per day, whenever they can during the week (Monday to Sunday). Every Monday starts over at Day 1.
        </p>
      </div>

      {/* Team picker */}
      {teams.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
          {teams.map(t => (
            <button key={t.id} onClick={() => { setTeamId(t.id); setSaved('') }}
              style={{ padding: '0.3rem 0.75rem', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${t.id === teamId ? t.color : 'var(--gray-border)'}`, background: t.id === teamId ? `${t.color}20` : 'transparent', color: t.id === teamId ? 'var(--black)' : 'var(--text-muted)' }}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      {!teams.length && !loading && <div className="card" style={{ padding: '1.25rem', color: 'var(--text-muted)' }}>Add a team on the Teams page first.</div>}

      {/* Week nav */}
      {data && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <button className="btn-ghost" aria-label="Previous week" onClick={() => { setWeek(addDays(data.weekStart, -7)); setSaved('') }} style={{ padding: '0.4rem 0.75rem' }}>←</button>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', whiteSpace: 'nowrap' }}>
            {short(data.weekStart)} – {short(addDays(data.weekStart, 6))}
          </span>
          <button className="btn-ghost" aria-label="Next week" onClick={() => { setWeek(addDays(data.weekStart, 7)); setSaved('') }} style={{ padding: '0.4rem 0.75rem' }}>→</button>
          {isThisWeek
            ? <span className="tag tag-yellow" style={{ fontSize: '0.72rem' }}>This week</span>
            : <button className="btn-ghost" onClick={() => { setWeek(null); setSaved('') }} style={{ padding: '0.4rem 0.875rem', fontSize: '0.8rem' }}>This week</button>}
        </div>
      )}

      {error && <div style={{ background: 'var(--danger-light)', border: '1.5px solid #fecaca', borderRadius: 8, padding: '0.625rem 0.875rem', marginBottom: '1rem', color: 'var(--danger)', fontSize: '0.88rem' }}>{error}</div>}
      {loading && !data && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}

      {data && (
        <>
          {/* ── Plan ── */}
          <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', opacity: loading ? 0.6 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.15rem' }}>{team?.name ?? 'Team'} workouts</h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{draft.length} of up to {maxSlots}</span>
            </div>
            <PlanSourceLine data={data} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.875rem' }}>
              {draft.map((tid, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', width: 54, flexShrink: 0 }}>Day {i + 1}</span>
                  <select className="input" value={tid} onChange={e => { const v = e.target.value; setDraft(d => d.map((x, j) => j === i ? v : x)) }}
                    style={{ flex: 1, minWidth: 0, padding: '0.5rem 0.75rem', fontSize: '0.9rem' }}>
                    <option value="">Pick a workout…</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button className="btn-ghost" aria-label={`Move Day ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} style={{ padding: '0.4rem 0.6rem', opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                  <button className="btn-ghost" aria-label={`Move Day ${i + 1} down`} disabled={i === draft.length - 1} onClick={() => move(i, 1)} style={{ padding: '0.4rem 0.6rem', opacity: i === draft.length - 1 ? 0.35 : 1 }}>↓</button>
                  <button className="btn-ghost" aria-label={`Remove Day ${i + 1}`} onClick={() => setDraft(d => d.filter((_, j) => j !== i))} style={{ padding: '0.4rem 0.6rem', color: 'var(--danger)', borderColor: '#fecaca' }}>✕</button>
                </div>
              ))}
              {draft.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', padding: '0.25rem 0' }}>No workouts in this week.</div>}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn-ghost" disabled={draft.length >= maxSlots} onClick={() => setDraft(d => [...d, ''])} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', opacity: draft.length >= maxSlots ? 0.4 : 1 }}>+ Add Day {draft.length + 1}</button>
              <button className="btn-volt" disabled={saving || missingPick || draft.length === 0 || !dirty} onClick={() => save(draft)} style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}>
                {saving ? 'Saving…' : 'Save week'}
              </button>
              {dirty && <button className="btn-ghost" onClick={() => setDraft(original)} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>Undo changes</button>}
              <span style={{ flex: 1 }} />
              {!(data.plan.ownPlan && data.plan.slots.length === 0) && (
                <button className="btn-ghost" disabled={saving} onClick={() => save([])} style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}>Make this an off week</button>
              )}
              {data.plan.ownPlan && (
                confirmClear ? (
                  <span style={{ display: 'inline-flex', gap: '0.375rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Drop this week&apos;s own plan?</span>
                    <button className="btn-ghost" disabled={saving} onClick={clearOwnPlan} style={{ padding: '0.45rem 0.875rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: '#fecaca' }}>Yes, drop it</button>
                    <button className="btn-ghost" onClick={() => setConfirmClear(false)} style={{ padding: '0.45rem 0.875rem', fontSize: '0.8rem' }}>Cancel</button>
                  </span>
                ) : (
                  <button className="btn-ghost" onClick={() => setConfirmClear(true)} style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}>Repeat an earlier week instead</button>
                )
              )}
            </div>
            {missingPick && <div style={{ fontSize: '0.78rem', color: 'var(--warning)', marginTop: '0.5rem' }}>Pick a workout for every Day before saving.</div>}
            {!data.plan.ownPlan && data.plan.slots.length > 0 && !dirty && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Nothing to save. Change a workout above to give this week its own plan.</div>
            )}
            {saved && <div style={{ fontSize: '0.82rem', color: 'var(--success)', fontWeight: 600, marginTop: '0.625rem' }}>{saved}</div>}
            {isThisWeek && data.players.some(p => p.days.some(d => d.state !== 'locked' && d.state !== 'next')) && dirty && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Players keep the Days they&apos;ve already finished. A workout someone has started stays as it was until she finishes it.
              </div>
            )}
          </div>

          {/* ── Progress ── */}
          <div className="card" style={{ padding: '1.25rem', opacity: loading ? 0.6 : 1 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.15rem', marginBottom: '0.25rem' }}>Players this week</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.875rem' }}>✓ finished (with the day) · half circle = started, not finished · – not yet</p>
            {data.players.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>No players on this team yet.</div>}
            {data.players.length > 0 && data.plan.slots.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>No workouts this week.</div>}
            {data.players.length > 0 && data.plan.slots.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1.5px solid var(--gray-border)' }}>Player</th>
                      {data.plan.slots.map(s => (
                        <th key={s.slot} title={s.name} style={{ padding: '0.4rem 0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1.5px solid var(--gray-border)', textAlign: 'center', whiteSpace: 'nowrap' }}>Day {s.slot}</th>
                      ))}
                      <th style={{ textAlign: 'right', padding: '0.4rem 0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1.5px solid var(--gray-border)' }}>Done</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.players.map(p => {
                      const label = statusLabel(p)
                      return (
                        <tr key={p.id}>
                          <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--gray-border)', fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                            {p.jerseyNumber ? <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginRight: '0.375rem' }}>#{p.jerseyNumber}</span> : null}{p.name}
                          </td>
                          {data.plan.slots.map(s => (
                            <td key={s.slot} style={{ padding: '0.5rem', borderBottom: '1px solid var(--gray-border)', textAlign: 'center' }}>
                              <DayCell day={p.days.find(d => d.slot === s.slot)} />
                            </td>
                          ))}
                          <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--gray-border)', textAlign: 'right', fontSize: '0.82rem', fontWeight: 600, color: label.color, whiteSpace: 'nowrap' }}>{label.text}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function WeekPlanPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>}>
      <WeekPlanContent />
    </Suspense>
  )
}
