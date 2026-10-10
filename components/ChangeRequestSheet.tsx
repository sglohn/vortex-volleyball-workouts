// FILE: components/ChangeRequestSheet.tsx   (new file)
//
// Bottom sheet on the player workout page: ask the coach to change one
// exercise in a team workout (easier, harder or something different), and
// say why. Sends to app/api/player/change-request. The coach answers in
// Coach → Requests.
'use client'
import { useState } from 'react'
import {
  BODY_AREAS, CHANGE_REASONS, CHANGE_WANTS,
  type ChangeReason, type ChangeWants,
} from '@/lib/exerciseLevels'

// Which reasons make sense for each kind of change
const REASONS_FOR: Record<ChangeWants, ChangeReason[]> = {
  easier:    ['sore', 'painful', 'too_hard', 'equipment', 'other'],
  harder:    ['too_easy', 'other'],
  different: ['painful', 'sore', 'too_hard', 'equipment', 'other'],
}

export interface ChangeRequestTarget {
  name: string
  level?: { family: string; level: number; count: number } | null
}

export interface ChangeRequestInput {
  wants: ChangeWants
  reason: ChangeReason
  bodyPart: string | null
  painLevel: number | null
  note: string
}

export default function ChangeRequestSheet({ target, saving, error, onSend, onClose }: {
  target: ChangeRequestTarget
  saving: boolean
  error: string
  onSend: (input: ChangeRequestInput) => void
  onClose: () => void
}) {
  const [wants, setWants] = useState<ChangeWants | null>(null)
  const [reason, setReason] = useState<ChangeReason | null>(null)
  const [bodyPart, setBodyPart] = useState<string | null>(null)
  const [painLevel, setPainLevel] = useState<number | null>(null)
  const [note, setNote] = useState('')

  const reasonInfo = CHANGE_REASONS.find(r => r.value === reason)
  const asksWhere = reasonInfo?.asksWhere ?? false
  const asksPain = reason === 'sore' || reason === 'painful'
  const lv = target.level
  const atBottom = lv ? lv.level <= 1 : false
  const atTop = lv ? lv.level >= lv.count : false

  const ready = !!wants && !!reason && (!asksWhere || !!bodyPart) && (reason !== 'other' || note.trim().length > 0)

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '0.45rem 0.75rem', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
    border: `1.5px solid ${active ? 'var(--carolina)' : 'var(--gray-border)'}`,
    background: active ? 'var(--carolina)' : 'transparent',
    color: active ? '#fff' : 'var(--text-primary)',
  })
  const stepLabel: React.CSSProperties = {
    fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, margin: '1rem 0 0.45rem',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 60 }}
      onClick={() => !saving && onClose()}>
      <div className="card" role="dialog" aria-label="Ask coach for a change"
        style={{ width: '100%', maxWidth: 500, maxHeight: '88vh', overflowY: 'auto', padding: '1.25rem', borderRadius: '16px 16px 0 0' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem' }}>Ask Coach for a change</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem', lineHeight: 1.4 }}>
              For <strong>{target.name}</strong>{lv ? ` (level ${lv.level} of ${lv.count})` : ''}. Your coach decides what you do instead.
            </p>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        <div style={{ background: 'var(--danger-light)', borderRadius: 8, padding: '0.5rem 0.75rem', marginTop: '0.75rem', color: 'var(--danger)', fontSize: '0.78rem', fontWeight: 600 }}>
          If something hurts, stop this exercise now. Don’t push through pain while you wait.
        </div>

        <div style={stepLabel}>What do you need?</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
          {CHANGE_WANTS.map(w => {
            const active = wants === w.value
            const hint = w.value === 'easier' && atBottom ? 'Already the easiest' : w.value === 'harder' && atTop ? 'Already the hardest' : w.hint
            return (
              <button key={w.value} onClick={() => { setWants(w.value); if (reason && !REASONS_FOR[w.value].includes(reason)) setReason(null) }}
                style={{ padding: '0.6rem 0.4rem', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                  border: `1.5px solid ${active ? 'var(--carolina)' : 'var(--gray-border)'}`,
                  background: active ? 'var(--carolina-light)' : 'transparent' }}>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: active ? 'var(--carolina-deep)' : 'var(--text-primary)' }}>{w.label}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.15rem', lineHeight: 1.25 }}>{hint}</div>
              </button>
            )
          })}
        </div>

        {wants && (
          <>
            <div style={stepLabel}>Why?</div>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {CHANGE_REASONS.filter(r => REASONS_FOR[wants].includes(r.value)).map(r => (
                <button key={r.value} onClick={() => { setReason(r.value); if (!r.asksWhere) setBodyPart(null) }} style={chip(reason === r.value)}>{r.label}</button>
              ))}
            </div>
          </>
        )}

        {asksWhere && (
          <>
            <div style={stepLabel}>Where?</div>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {BODY_AREAS.map(a => (
                <button key={a} onClick={() => setBodyPart(a)} style={chip(bodyPart === a)}>{a}</button>
              ))}
            </div>
          </>
        )}

        {asksPain && (
          <>
            <div style={stepLabel}>How bad? {painLevel != null && <span style={{ color: 'var(--carolina-dark)' }}>{painLevel}/10</span>}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: '0.2rem' }}>
              {Array.from({ length: 11 }, (_, n) => (
                <button key={n} onClick={() => setPainLevel(n)} aria-label={`${n} out of 10`}
                  style={{ padding: '0.4rem 0', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                    border: `1.5px solid ${painLevel === n ? 'var(--carolina)' : 'var(--gray-border)'}`,
                    background: painLevel === n ? (n >= 7 ? 'var(--danger)' : 'var(--carolina)') : 'transparent',
                    color: painLevel === n ? '#fff' : 'var(--text-secondary)' }}>{n}</button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              <span>None</span><span>Worst</span>
            </div>
          </>
        )}

        {reason && (
          <>
            <div style={stepLabel}>Anything else? {reason === 'other' ? '' : <span style={{ textTransform: 'none', fontWeight: 500 }}>(optional)</span>}</div>
            <textarea className="input" rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)}
              placeholder={reason === 'other' ? 'Tell your coach what’s going on' : 'e.g. sharp pain at the bottom of the rep'} style={{ resize: 'vertical' }} />
          </>
        )}

        {error && <div style={{ background: 'var(--danger-light)', borderRadius: 8, padding: '0.5rem 0.75rem', marginTop: '0.75rem', color: 'var(--danger)', fontSize: '0.82rem' }}>{error}</div>}

        <button className="btn-volt" disabled={!ready || saving}
          onClick={() => wants && reason && onSend({ wants, reason, bodyPart: asksWhere ? bodyPart : null, painLevel: asksPain ? painLevel : null, note: note.trim() })}
          style={{ width: '100%', padding: '0.875rem', marginTop: '1rem', fontSize: '1rem' }}>
          {saving ? 'Sending…' : 'Send to Coach'}
        </button>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
          Keep going with the rest of your workout. The exercise switches here when your coach approves.
        </p>
      </div>
    </div>
  )
}
