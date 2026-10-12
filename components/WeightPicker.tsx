// FILE: components/WeightPicker.tsx
//
// Tap-to-enter weight for logging a set, so players don't have to do gym math.
// What it shows depends on the exercise's equipment (lib/loads.ts):
//
//   Barbell     - "Tap each plate ONCE: it goes on both sides." The drawing
//                 shows the whole bar loaded on both ends; the total (bar
//                 included) is shown big and is what gets saved.
//   Landmine    - Tap the plates on the end of the bar (drawing shows that one
//                 end). Saves plates only
//                 (the bar's felt weight is added in pounds-moved math).
//   1 dumbbell  - Tap the number printed on the dumbbell.
//   2 dumbbells - Tap the number on ONE dumbbell; shows "2 × 30 = 60 lbs".
//   Other/unset - A plain number box (machine, med ball, etc.).
//
// Every mode keeps a small "Type a number instead" link as a fallback.
// `value` / `onChange` are the same string the pages already keep in
// weightInput, so saving works exactly as before.

'use client'

import { useEffect, useState } from 'react'
import {
  BAR_LBS, DUMBBELLS_LBS, PLATES_LBS, LANDMINE_BAR_LBS,
  loadLabel, platesPerSide, type Equipment,
} from '@/lib/loads'

interface Props {
  equipment: Equipment | null | undefined
  value: string
  onChange: (value: string) => void
  /** Suggested weight in entered units (already loadable); shows a "Use" button. */
  suggested?: number | null
  /** Larger buttons for the shared kiosk screen. */
  big?: boolean
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.05em', fontWeight: 600,
}

// Plate look on the bar drawing: heavier plates are taller.
const PLATE_LOOK: Record<string, { h: number; w: number; bg: string; fg: string }> = {
  '45':  { h: 64, w: 14, bg: 'var(--carolina-deep)', fg: '#fff' },
  '35':  { h: 56, w: 13, bg: 'var(--carolina-dark)', fg: '#fff' },
  '25':  { h: 48, w: 12, bg: 'var(--carolina)',      fg: '#fff' },
  '10':  { h: 38, w: 10, bg: 'var(--black-soft)',    fg: '#fff' },
  '5':   { h: 30, w: 9,  bg: 'var(--gray-mid)',      fg: '#fff' },
  '2.5': { h: 24, w: 8,  bg: 'var(--text-muted)',    fg: '#fff' },
}

function sum(list: number[]): number {
  return list.reduce((a, b) => a + b, 0)
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// ── Module-scope pieces (kept out of WeightPicker so they don't remount) ──

function SuggestButton({ suggested, equipment, onUse }: { suggested: number; equipment: Equipment | null | undefined; onUse: () => void }) {
  return (
    <button type="button" onClick={onUse}
      style={{ fontSize: '0.72rem', color: 'var(--carolina)', fontWeight: 700, background: 'var(--carolina-light)', border: '1px solid var(--carolina-border)', borderRadius: 5, padding: '0.2rem 0.55rem', cursor: 'pointer' }}>
      Use {loadLabel(suggested, equipment)} →
    </button>
  )
}

function TotalBox({ main, sub }: { main: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '0.5rem', background: 'var(--surface)', border: '2px solid var(--carolina)', borderRadius: 10 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '2rem', lineHeight: 1, color: 'var(--carolina-deep)' }}>{main}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginTop: '0.2rem' }}>{sub}</div>}
    </div>
  )
}

function Plate({ p }: { p: number }) {
  const look = PLATE_LOOK[String(p)] ?? PLATE_LOOK['5']
  return <div title={`${p}`} style={{ width: look.w, height: look.h, background: look.bg, borderRadius: 3, flexShrink: 1, minWidth: 4 }} />
}

/**
 * Barbell: the whole bar with the same plates on BOTH ends, heaviest
 * (first tapped) closest to the middle, so one tap visibly loads both sides.
 */
function FullBarDrawing({ plates }: { plates: number[] }) {
  const end = <div style={{ width: 14, height: 10, background: 'var(--gray-mid)', borderRadius: 3, flexShrink: 0 }} />
  const collar = <div style={{ width: 6, height: 26, background: 'var(--black-soft)', borderRadius: 2, flexShrink: 0 }} />
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, height: 72, padding: '0 0.5rem', overflow: 'hidden' }}>
      {end}
      {[...plates].reverse().map((p, i) => <Plate key={`l${i}`} p={p} />)}
      {collar}
      <div style={{ flex: 1, minWidth: 40, maxWidth: 140, height: 8, background: 'var(--gray-border)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!plates.length && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap', marginTop: 22 }}>empty bar</span>}
      </div>
      {collar}
      {plates.map((p, i) => <Plate key={`r${i}`} p={p} />)}
      {end}
    </div>
  )
}

/** Landmine / Viking Press: one end of the bar, plates only on that end. */
function LandmineDrawing({ plates }: { plates: number[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, height: 72, padding: '0 0.5rem', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 30, maxWidth: 160, height: 10, background: 'var(--gray-border)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap', marginTop: 22 }}>← wall end</span>
      </div>
      <div style={{ width: 6, height: 26, background: 'var(--black-soft)', borderRadius: 2, flexShrink: 0 }} />
      {plates.map((p, i) => <Plate key={i} p={p} />)}
      <div style={{ width: 40, height: 10, background: 'var(--gray-mid)', borderRadius: 3, flexShrink: 0 }} />
      {!plates.length && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, marginLeft: 6 }}>no plates</span>}
    </div>
  )
}

function PlateButtons({ onAdd, big, bothSides }: { onAdd: (p: number) => void; big?: boolean; bothSides?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
      {PLATES_LBS.map(p => {
        const look = PLATE_LOOK[String(p)]
        return (
          <button key={p} type="button" onClick={() => onAdd(p)}
            style={{ padding: big ? '0.85rem 0' : '0.65rem 0', borderRadius: 10, border: 'none', background: look.bg, color: look.fg, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: big ? '1.4rem' : '1.2rem', cursor: 'pointer' }}>
            + {p}
            {bothSides && <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.62rem', fontWeight: 700, opacity: 0.85, letterSpacing: '0.03em' }}>both sides</span>}
          </button>
        )
      })}
    </div>
  )
}

function UndoClear({ onUndo, onClear, disabled }: { onUndo: () => void; onClear: () => void; disabled: boolean }) {
  const s: React.CSSProperties = { flex: 1, padding: '0.45rem', borderRadius: 8, border: '1.5px solid var(--gray-border)', background: 'var(--white)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.82rem', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1 }
  return (
    <div style={{ display: 'flex', gap: '0.4rem' }}>
      <button type="button" style={s} onClick={onUndo} disabled={disabled}>↶ Take last plate off</button>
      <button type="button" style={s} onClick={onClear} disabled={disabled}>Clear</button>
    </div>
  )
}

function TypedInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input className="input" type="number" inputMode="decimal" placeholder={placeholder}
      value={value} onChange={e => onChange(e.target.value)}
      style={{ fontSize: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, padding: '0.75rem' }} />
  )
}

function SwitchLink({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', textDecoration: 'underline', cursor: 'pointer', padding: '0.25rem 0', alignSelf: 'center' }}>
      {text}
    </button>
  )
}

// ── The picker ────────────────────────────────────────────────────────────

export default function WeightPicker({ equipment, value, onChange, suggested, big }: Props) {
  const isBar = equipment === 'barbell'
  const isLandmine = equipment === 'landmine'
  const isDb = equipment === 'dumbbell_1' || equipment === 'dumbbell_2'
  const tapMode = isBar || isLandmine || isDb

  const [typing, setTyping] = useState(false)
  // Plates on ONE side (barbell) or on the end (landmine), in the order tapped.
  const [plates, setPlates] = useState<number[]>([])

  // Keep the plate list in step with value when it's set from outside
  // ("Use suggested", "Same as last set", switching exercises).
  const num = value === '' ? null : Number(value)
  useEffect(() => {
    if (!(isBar || isLandmine)) return
    if (num === null || Number.isNaN(num)) { if (plates.length) setPlates([]); return }
    const current = isBar ? BAR_LBS + 2 * sum(plates) : sum(plates)
    if (Math.abs(current - num) < 1e-6) return
    if (isBar) setPlates(num > BAR_LBS ? platesPerSide(num) : [])
    else setPlates(num > 0 ? platesPerSide(num * 2 + BAR_LBS) : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, equipment])

  // Back to tap mode whenever the exercise changes.
  useEffect(() => { setTyping(false) }, [equipment])

  const setFromPlates = (next: number[]) => {
    setPlates(next)
    if (isBar) onChange(next.length ? fmt(BAR_LBS + 2 * sum(next)) : String(BAR_LBS))
    else onChange(fmt(sum(next)))
  }

  const showSuggest = suggested && suggested > 0 && value === ''

  // ── Header line: what to do, in plain words ──
  let title = 'Weight (lbs)'
  let help = 'Enter the weight you used.'
  if (isBar) { title = 'Barbell'; help = `The bar is ${BAR_LBS} lbs and already counted. Tap each plate ONCE: it goes on both sides.` }
  if (isLandmine) { title = 'Landmine'; help = 'Tap the plates on the end of the bar. Nothing on it? Tap "Empty bar".' }
  if (equipment === 'dumbbell_1') { title = '1 dumbbell'; help = 'Tap the number printed on the dumbbell.' }
  if (equipment === 'dumbbell_2') { title = '2 dumbbells'; help = 'Holding two? Tap the number on ONE of them. We add both up for you.' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <span style={labelStyle}>{title}</span>
        {showSuggest && <SuggestButton suggested={suggested!} equipment={equipment} onUse={() => onChange(String(suggested))} />}
      </div>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.35, marginTop: '-0.2rem' }}>{help}</div>

      {/* ── Barbell / landmine: tap plates ── */}
      {(isBar || isLandmine) && !typing && (
        <>
          <div style={{ background: 'var(--gray-light)', borderRadius: 10, padding: '0.25rem 0' }}>
            {isBar ? <FullBarDrawing plates={plates} /> : <LandmineDrawing plates={plates} />}
          </div>
          {value === '' ? (
            <button type="button" onClick={() => setFromPlates([])}
              style={{ padding: '0.55rem', borderRadius: 10, border: '2px dashed var(--carolina-border)', background: 'var(--carolina-light)', color: 'var(--carolina-dark)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
              {isBar ? `Just the empty bar (${BAR_LBS} lbs)` : 'Empty bar (no plates)'}
            </button>
          ) : isBar ? (
            <TotalBox
              main={`${fmt(BAR_LBS + 2 * sum(plates))} lbs`}
              sub={plates.length ? `${BAR_LBS} bar + ${plates.join(' + ')} each side` : 'Empty bar'} />
          ) : (
            <TotalBox
              main={plates.length ? `${fmt(sum(plates))} lbs of plates` : 'Empty bar'}
              sub={plates.length ? `${plates.join(' + ')} on the end · bar counts as ~${LANDMINE_BAR_LBS}` : `Bar counts as ~${LANDMINE_BAR_LBS} lbs`} />
          )}
          <PlateButtons big={big} bothSides={isBar} onAdd={p => setFromPlates([...plates, p])} />
          <UndoClear disabled={value === ''}
            onUndo={() => setFromPlates(plates.slice(0, -1))}
            onClear={() => { setPlates([]); onChange('') }} />
        </>
      )}

      {/* ── Dumbbells: tap the number on the bell ── */}
      {isDb && !typing && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>
            {DUMBBELLS_LBS.map(w => {
              const on = num === w
              return (
                <button key={w} type="button" onClick={() => onChange(on ? '' : String(w))}
                  style={{ padding: big ? '0.85rem 0' : '0.65rem 0', borderRadius: 10, border: `2px solid ${on ? 'var(--carolina)' : 'var(--gray-border)'}`, background: on ? 'var(--carolina)' : 'var(--white)', color: on ? '#fff' : 'var(--text-primary)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: big ? '1.4rem' : '1.2rem', cursor: 'pointer' }}>
                  {w}
                </button>
              )
            })}
          </div>
          {num !== null && !Number.isNaN(num) && num > 0 && (
            equipment === 'dumbbell_2'
              ? <TotalBox main={`Two ${fmt(num)}s`} sub={`2 × ${fmt(num)} = ${fmt(num * 2)} lbs total`} />
              : <TotalBox main={`${fmt(num)} lb dumbbell`} />
          )}
        </>
      )}

      {/* ── Typed number: "other" equipment, or the fallback ── */}
      {(!tapMode || typing) && (
        <>
          <TypedInput value={value} onChange={onChange}
            placeholder={suggested ? String(suggested) : '0'} />
          {typing && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              {isBar && 'Type the TOTAL: bar + all plates on both sides.'}
              {isLandmine && 'Type only the plates on the end (0 = empty bar).'}
              {equipment === 'dumbbell_2' && 'Type the number on ONE dumbbell.'}
              {equipment === 'dumbbell_1' && 'Type the number on the dumbbell.'}
            </div>
          )}
        </>
      )}

      {tapMode && (
        <SwitchLink text={typing ? (isDb ? '← Back to tapping a dumbbell' : '← Back to tapping plates') : 'Type a number instead'}
          onClick={() => setTyping(t => !t)} />
      )}
    </div>
  )
}
