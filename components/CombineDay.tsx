// FILE: components/CombineDay.tsx
//
// Combine Day screen on the player's phone (app/player/workout shows it
// instead of the lifting blocks when today's template is a Combine Day,
// lib/combine.ts).
//
//   Test list   every Volleyball Performance Index test in this combine, as
//               big cards: done ones show the best try, the rest say "Not
//               done". Tap any card, in any order.
//   One test    how to do it, last time's number, the tries so far (best one
//               starred), and a big entry box in the right units: feet +
//               inches for heights and touches, seconds, or mph. The number
//               is read back in large type before saving, touches also show
//               the vertical they work out to, and anything unusual (outside
//               the normal range, a big change from last time, a touch below
//               standing reach) asks for a second tap or can't be saved.
//               A wrong try can be deleted (two taps).
//   Finish      marks the session done. Tests not done get a reminder first.
//
// Every try is saved right away (app/api/player/combine), and the best try
// for each test goes to today's measurements, so nothing is lost if the
// phone locks or the player signs out partway through.
'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { playerFetch } from '@/lib/playerPass'
import WarmupCard, { type Warmup } from '@/components/WarmupCard'
import {
  bestValue, checkCombineValue, combineMetric, combineText, feetInchesText, verticalFrom,
  type CombineMetric, type CombineMetricKey,
} from '@/lib/combine'

interface Attempt { id: string; metric: CombineMetricKey; value: number; createdAt: string }
interface CombineState {
  template: { id: string; name: string; description: string | null }
  metrics: CombineMetricKey[]
  attempts: Attempt[]
  previous: Partial<Record<CombineMetricKey, number>>
  previousDate: string | null
  playerName: string | null
  locked: string | null
}

export interface CombineSession {
  sessionId: string
  playerName: string
  templateId?: string
}

interface Props {
  session: CombineSession
  name: string
  description?: string | null
  warmup?: Warmup | null
  warmupNotes?: string | null
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.06em', fontWeight: 700, marginBottom: '0.35rem',
}

const bigInput: React.CSSProperties = {
  width: '100%', fontSize: '2rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800,
  padding: '0.7rem 2.6rem 0.7rem 0.6rem', boxSizing: 'border-box',
}

function shortDate(d: string | null): string {
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return ''
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// One box with its unit printed inside on the right
function UnitBox({ value, onChange, unit, placeholder, inputMode, step, autoFocus, ariaLabel }: {
  value: string; onChange: (v: string) => void; unit: string; placeholder: string
  inputMode: 'numeric' | 'decimal'; step: string; autoFocus?: boolean; ariaLabel: string
}) {
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input className="input" type="number" inputMode={inputMode} step={step} min="0" placeholder={placeholder}
        aria-label={ariaLabel} autoFocus={autoFocus}
        value={value} onChange={e => onChange(e.target.value)} style={bigInput} />
      <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', fontWeight: 700, color: 'var(--text-muted)', pointerEvents: 'none' }}>{unit}</span>
    </div>
  )
}

// The test list card
function TestCard({ metric, tries, best, onOpen, index }: {
  metric: CombineMetric; tries: number; best: number | null; onOpen: () => void; index: number
}) {
  const done = best != null
  return (
    <button type="button" onClick={onOpen}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.95rem 1rem', textAlign: 'left', cursor: 'pointer',
        background: done ? 'rgba(22,163,74,0.06)' : 'var(--white)', border: `1.5px solid ${done ? 'var(--success)' : 'var(--gray-border)'}`, borderRadius: 12 }}>
      <span aria-hidden style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem',
        background: done ? 'var(--success)' : 'var(--gray-light)', color: done ? '#fff' : 'var(--carolina)' }}>
        {done ? '✓' : index + 1}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.08rem', color: 'var(--text-primary)' }}>{metric.label}</span>
        <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
          {metric.short}{metric.maxAttempts > 1 ? ` · ${tries} of ${metric.maxAttempts} tries` : ''}
        </span>
      </span>
      <span style={{ flexShrink: 0, textAlign: 'right' }}>
        {done
          ? <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.15rem', color: 'var(--success)' }}>{combineText(metric, best)}</span>
          : <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--carolina)' }}>Start →</span>}
      </span>
    </button>
  )
}

export default function CombineDay({ session, name, description, warmup, warmupNotes }: Props) {
  const router = useRouter()
  const [state, setState] = useState<CombineState | null>(null)
  const [loadError, setLoadError] = useState('')
  const [openKey, setOpenKey] = useState<CombineMetricKey | null>(null)
  // Entry boxes
  const [feet, setFeet] = useState('')
  const [inches, setInches] = useState('')
  const [amount, setAmount] = useState('')
  const [warningOk, setWarningOk] = useState<string | null>(null)   // the warning already shown once
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [justSaved, setJustSaved] = useState<string | null>(null)
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null)
  const [finishArmed, setFinishArmed] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [finished, setFinished] = useState(false)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ sessionId: session.sessionId })
    if (session.templateId) params.set('templateId', session.templateId)
    try {
      const res = await playerFetch(`/api/player/combine?${params}`)
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(d.error ?? 'Could not load the combine'); return }
      setState(d as CombineState)
      setLoadError('')
    } catch { setLoadError('Could not load the combine. Check your connection.') }
  }, [session.sessionId, session.templateId])

  useEffect(() => { load() }, [load])

  const metrics = useMemo(
    () => (state?.metrics ?? []).map(k => combineMetric(k)).filter((m): m is CombineMetric => !!m),
    [state?.metrics],
  )
  const triesFor = useCallback(
    (key: CombineMetricKey) => (state?.attempts ?? []).filter(a => a.metric === key),
    [state?.attempts],
  )
  const bestFor = useCallback((key: CombineMetricKey): number | null => {
    const m = combineMetric(key)
    return m ? bestValue(m, triesFor(key).map(a => a.value)) : null
  }, [triesFor])

  const doneCount = metrics.filter(m => bestFor(m.key) != null).length
  const notDone = metrics.filter(m => bestFor(m.key) == null)
  // Standing reach for verticals and the touch check: today's, else last time's
  const reachToday = bestFor('standing_reach_in')
  const reach = reachToday ?? state?.previous.standing_reach_in ?? null

  function resetEntry() {
    setFeet(''); setInches(''); setAmount(''); setWarningOk(null); setSaveError('')
  }

  function openTest(key: CombineMetricKey) {
    resetEntry(); setJustSaved(null); setDeleteArmed(null); setFinishArmed(false)
    setOpenKey(key)
    window.scrollTo({ top: 0 })
  }

  function closeTest() {
    resetEntry(); setJustSaved(null); setDeleteArmed(null)
    setOpenKey(null)
    window.scrollTo({ top: 0 })
  }

  // ── Finish ──
  async function finish() {
    if (notDone.length > 0 && !finishArmed) { setFinishArmed(true); return }
    setFinishing(true)
    try {
      await playerFetch('/api/checkin', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: session.sessionId }) })
    } catch { /* still finish on this phone */ }
    const stored = localStorage.getItem('vx_session')
    const s = stored ? JSON.parse(stored) : {}
    localStorage.removeItem('vx_session')
    if (s.teamMode && s.teamModeUrl) {
      sessionStorage.setItem('vx_team_return', JSON.stringify({ name: session.playerName, totalWeight: 0, durationMin: 0, completedSets: doneCount, totalSets: metrics.length }))
      router.push(s.teamModeUrl)
      return
    }
    setFinishing(false)
    setFinished(true)
  }

  if (loadError && !state) return (
    <div style={{ padding: '2rem', textAlign: 'center', maxWidth: 500, margin: '0 auto' }}>
      <p style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{loadError}</p>
      <button className="btn-volt" onClick={load} style={{ padding: '0.75rem 1.5rem' }}>Try again</button>
    </div>
  )
  if (!state) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading combine…</div>

  // ── Done screen ──
  if (finished) return (
    <div style={{ padding: '2rem 1rem', maxWidth: 500, margin: '0 auto' }} className="fade-up">
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--carolina-light)', border: '2px solid var(--carolina)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--carolina)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', fontWeight: 800, marginBottom: '0.35rem' }}>COMBINE DONE</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Great work, {session.playerName}! Here are your best numbers.</p>
      </div>
      <div className="card" style={{ padding: '0.5rem 1rem', marginBottom: '1.5rem' }}>
        {metrics.map(m => {
          const best = bestFor(m.key)
          const isTouch = m.key === 'standing_vertical_in' || m.key === 'approach_vertical_in'
          const vert = isTouch ? verticalFrom(best, reach) : null
          return (
            <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--gray-border)' }}>
              <span style={{ fontWeight: 600 }}>{m.label}</span>
              <span style={{ textAlign: 'right' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: best != null ? 'var(--text-primary)' : 'var(--text-muted)' }}>{best != null ? combineText(m, best) : 'Not done'}</span>
                {vert != null && <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{vert}″ vertical</span>}
              </span>
            </div>
          )
        })}
      </div>
      <button className="btn-black" onClick={() => router.push('/')} style={{ width: '100%', padding: '0.85rem', fontSize: '1rem' }}>Sign Out</button>
    </div>
  )

  // ── One test ──
  const metric = openKey ? combineMetric(openKey) : null
  if (metric) {
    const tries = triesFor(metric.key)
    const best = bestFor(metric.key)
    const previous = state.previous[metric.key] ?? null
    const isTouch = metric.key === 'standing_vertical_in' || metric.key === 'approach_vertical_in'
    const single = metric.maxAttempts === 1
    const triesLeft = single ? 1 : metric.maxAttempts - tries.length
    const canEnter = !state.locked && triesLeft > 0
    const tryNumber = tries.length + 1

    // The number being entered, in the stored units (inches / sec / mph)
    let entered: number | null = null
    let entryError: string | null = null
    if (metric.unit === 'ft-in') {
      if (feet !== '' || inches !== '') {
        const f = parseFloat(feet), i = inches === '' ? 0 : parseFloat(inches)
        if (feet === '' || !Number.isFinite(f) || f < 0 || !Number.isInteger(f)) entryError = 'Enter the feet as a whole number, like 9.'
        else if (!Number.isFinite(i) || i < 0 || i >= 12) entryError = 'Inches go from 0 to 11½.'
        else entered = Math.round((f * 12 + i) * 2) / 2
      }
    } else if (amount !== '') {
      const a = parseFloat(amount)
      if (Number.isFinite(a)) entered = Math.round(a / metric.step) * metric.step
      else entryError = 'Enter a number.'
      if (entered != null) entered = Math.round(entered * 100) / 100
    }
    const check = entered != null
      ? checkCombineValue(metric, entered, {
          reach: metric.key === 'standing_reach_in' ? null : reach,
          blockTouch: bestFor('standing_vertical_in'),
          previous,
        })
      : null
    const blocking = entryError ?? check?.error ?? null
    const warning = !blocking ? check?.warning ?? null : null
    const needsSecondTap = !!warning && warningOk !== warning
    const vertical = isTouch && entered != null ? verticalFrom(entered, reach) : null
    const nextUndone = metrics.find(m => m.key !== metric.key && bestFor(m.key) == null) ?? null

    async function save() {
      if (!metric || entered == null || blocking) return
      if (needsSecondTap) { setWarningOk(warning); return }
      setSaving(true); setSaveError('')
      try {
        const res = await playerFetch('/api/player/combine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.sessionId, templateId: session.templateId ?? null, metric: metric.key, value: entered }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) { setSaveError(d.error ?? 'Not saved. Try again.'); setSaving(false); return }
        setState(d as CombineState)
        setJustSaved(combineText(metric, entered))
        resetEntry()
      } catch { setSaveError('Not saved. Check your connection and try again.') }
      setSaving(false)
    }

    async function removeTry(id: string) {
      if (deleteArmed !== id) { setDeleteArmed(id); return }
      setDeleteArmed(null); setJustSaved(null)
      try {
        const res = await playerFetch('/api/player/combine', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.sessionId, templateId: session.templateId ?? null, id }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) { setSaveError(d.error ?? 'Not deleted. Try again.'); return }
        setState(d as CombineState)
      } catch { setSaveError('Not deleted. Check your connection and try again.') }
    }

    return (
      <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
        <button onClick={closeTest} style={{ background: 'none', border: 'none', color: 'var(--carolina-dark)', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', padding: '0.25rem 0', marginBottom: '0.75rem' }}>
          ← All tests ({doneCount}/{metrics.length} done)
        </button>

        <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--carolina)' }}>Combine test</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', fontWeight: 800, lineHeight: 1.1, margin: '0.15rem 0 0.2rem' }}>{metric.label}</h1>
          <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            {metric.short} · {metric.unit === 'ft-in' ? 'feet and inches' : metric.unit === 'sec' ? 'seconds' : 'mph'}
            {!single && ` · best of ${metric.maxAttempts}`}
          </div>

          <div style={{ marginTop: '0.875rem', background: 'var(--carolina-light)', border: '1px solid var(--carolina-border)', borderRadius: 10, padding: '0.7rem 0.85rem', fontSize: '0.88rem', lineHeight: 1.45, color: 'var(--text-primary)' }}>
            {metric.howTo}
          </div>

          {(previous != null || (isTouch && reach != null)) && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {previous != null && <span>Last time{state.previousDate ? ` (${shortDate(state.previousDate)})` : ''}: <strong style={{ color: 'var(--text-secondary)' }}>{combineText(metric, previous)}</strong></span>}
              {isTouch && reach != null && <span>Standing reach: <strong style={{ color: 'var(--text-secondary)' }}>{feetInchesText(reach)}</strong>{reachToday == null ? ' (last time)' : ''}</span>}
            </div>
          )}
        </div>

        {/* Tries so far */}
        {tries.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <span style={labelStyle}>{single ? 'Saved' : 'Your tries'}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {tries.map((t, i) => {
                const isBest = !single && tries.length > 1 && best === t.value && tries.findIndex(x => x.value === best) === i
                const vert = isTouch ? verticalFrom(t.value, reach) : null
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 10, background: isBest ? 'rgba(22,163,74,0.08)' : 'var(--gray-light)', border: `1.5px solid ${isBest ? 'var(--success)' : 'var(--gray-border)'}` }}>
                    {!single && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', width: 42 }}>Try {i + 1}</span>}
                    <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.2rem' }}>
                      {combineText(metric, t.value)}
                      {vert != null && <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{vert}″ vertical</span>}
                    </span>
                    {isBest && <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--success)' }}>★ BEST</span>}
                    {!state.locked && (
                      <button onClick={() => removeTry(t.id)}
                        style={{ background: deleteArmed === t.id ? 'var(--danger)' : 'none', color: deleteArmed === t.id ? '#fff' : 'var(--text-muted)', border: deleteArmed === t.id ? 'none' : '1px solid var(--gray-border)', borderRadius: 6, padding: '0.3rem 0.55rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                        {deleteArmed === t.id ? 'Delete?' : '✕'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {justSaved && (
          <div style={{ padding: '0.6rem 0.85rem', marginBottom: '1rem', borderRadius: 10, background: 'var(--success-light)', border: '1.5px solid var(--success)', color: 'var(--success)', fontWeight: 700, fontSize: '0.9rem' }}>
            ✓ Saved {justSaved}{!single && triesLeft > 0 ? `. ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left.` : '.'}
          </div>
        )}

        {state.locked && (
          <div style={{ padding: '0.7rem 0.85rem', marginBottom: '1rem', borderRadius: 10, background: 'var(--warning-light)', border: '1.5px solid var(--warning)', color: '#92400e', fontSize: '0.88rem', fontWeight: 600 }}>{state.locked}</div>
        )}

        {/* Entry */}
        {canEnter && (
          <div className="card" style={{ padding: '1.1rem', marginBottom: '1rem' }}>
            <span style={labelStyle}>{single ? (tries.length > 0 ? 'Measure again (replaces it)' : 'Enter your number') : `Try ${tryNumber} of ${metric.maxAttempts}`}</span>
            {metric.unit === 'ft-in' ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <UnitBox value={feet} onChange={v => { setFeet(v); setWarningOk(null); setJustSaved(null) }} unit="ft" ariaLabel="Feet"
                  placeholder={previous != null ? String(Math.floor(previous / 12)) : '0'} inputMode="numeric" step="1" autoFocus />
                <UnitBox value={inches} onChange={v => { setInches(v); setWarningOk(null); setJustSaved(null) }} unit="in" ariaLabel="Inches"
                  placeholder="0" inputMode="decimal" step="0.5" />
              </div>
            ) : (
              <UnitBox value={amount} onChange={v => { setAmount(v); setWarningOk(null); setJustSaved(null) }} unit={metric.unit === 'sec' ? 'sec' : 'mph'} ariaLabel={metric.label}
                placeholder={metric.unit === 'sec' ? (metric.key === 'acceleration_sec' ? '1.12' : '5.38') : '45'} inputMode="decimal" step={String(metric.step)} autoFocus />
            )}
            {metric.unit === 'ft-in' && (
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>Half inches are fine: type 4.5 for 4½″.</div>
            )}

            {/* Read-back: exactly what will be saved */}
            {entered != null && !entryError && (
              <div style={{ textAlign: 'center', marginTop: '0.875rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>You&apos;re saving</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '2.3rem', lineHeight: 1.1, color: blocking ? 'var(--danger)' : 'var(--text-primary)' }}>{combineText(metric, entered)}</div>
                {metric.unit === 'ft-in' && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{entered} inches</div>}
                {vertical != null && !blocking && (
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--carolina-dark)', marginTop: '0.2rem' }}>= {vertical}″ {metric.key === 'approach_vertical_in' ? 'approach' : 'standing'} vertical</div>
                )}
              </div>
            )}

            {blocking && (feet !== '' || inches !== '' || amount !== '') && (
              <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--danger-light)', color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 600 }}>{blocking}</div>
            )}
            {warning && (
              <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--warning-light)', border: '1.5px solid var(--warning)', color: '#92400e', fontSize: '0.85rem', fontWeight: 600 }}>
                {warning}{warningOk === warning ? ' Tap Save again if it\'s right.' : ''}
              </div>
            )}
            {saveError && (
              <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--danger-light)', color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 600 }}>{saveError}</div>
            )}

            <button className="btn-volt" onClick={save} disabled={saving || entered == null || !!blocking}
              style={{ width: '100%', marginTop: '0.875rem', padding: '1rem', fontSize: '1.1rem' }}>
              {saving ? 'Saving…' : warningOk === warning && warning ? 'Yes, it\'s right. Save' : single ? 'Save' : `Save try ${tryNumber}`}
            </button>
          </div>
        )}

        {!canEnter && !state.locked && !single && (
          <div style={{ padding: '0.6rem 0.85rem', marginBottom: '1rem', borderRadius: 10, background: 'var(--gray-light)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            All {metric.maxAttempts} tries are in. Your best counts. Delete a try if one was entered wrong.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {best != null && nextUndone && (
            <button className="btn-volt" onClick={() => openTest(nextUndone.key)} style={{ width: '100%', padding: '0.9rem', fontSize: '1rem' }}>
              Next: {nextUndone.label} →
            </button>
          )}
          <button className="btn-ghost" onClick={closeTest} style={{ width: '100%', padding: '0.85rem', fontSize: '0.95rem' }}>
            Back to all tests
          </button>
        </div>
      </div>
    )
  }

  // ── Test list ──
  const pct = metrics.length > 0 ? doneCount / metrics.length : 0
  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem' }} className="fade-up">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.625rem' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--carolina)' }}>Combine Day</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800 }}>{name}</h1>
            {description && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>{description}</p>}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--volt)' }}>{doneCount}/{metrics.length}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tests</div>
          </div>
        </div>
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct * 100}%` }} /></div>
      </div>

      <WarmupCard warmup={warmup} notes={warmupNotes} startOpen={doneCount === 0} />

      {state.locked && (
        <div style={{ padding: '0.7rem 0.85rem', marginBottom: '1rem', borderRadius: 10, background: 'var(--warning-light)', border: '1.5px solid var(--warning)', color: '#92400e', fontSize: '0.88rem', fontWeight: 600 }}>{state.locked}</div>
      )}

      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        Do the tests in any order. Tap a test to enter your numbers. Have a partner or coach read the number for you.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
        {metrics.map((m, i) => (
          <TestCard key={m.key} metric={m} index={i} tries={triesFor(m.key).length} best={bestFor(m.key)} onOpen={() => openTest(m.key)} />
        ))}
      </div>

      {!state.locked && (
        <>
          {finishArmed && notDone.length > 0 && (
            <div style={{ padding: '0.7rem 0.85rem', marginBottom: '0.6rem', borderRadius: 10, background: 'var(--warning-light)', border: '1.5px solid var(--warning)', color: '#92400e', fontSize: '0.88rem', fontWeight: 600 }}>
              You haven&apos;t done {notDone.map(m => m.label).join(', ')}. Finish anyway?
            </div>
          )}
          <button className={notDone.length === 0 || finishArmed ? 'btn-volt' : 'btn-ghost'} onClick={finish} disabled={finishing}
            style={{ width: '100%', padding: '1rem', fontSize: '1.05rem' }}>
            {finishing ? 'Finishing…' : finishArmed && notDone.length > 0 ? 'Yes, finish combine' : 'Finish Combine ✓'}
          </button>
          {finishArmed && (
            <button onClick={() => setFinishArmed(false)} style={{ display: 'block', margin: '0.5rem auto 0', background: 'none', border: 'none', color: 'var(--text-muted)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}>
              Keep going
            </button>
          )}
        </>
      )}
    </div>
  )
}
