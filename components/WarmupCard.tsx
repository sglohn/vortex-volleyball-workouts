// FILE: components/WarmupCard.tsx
//
// The Warm-Up card at the top of the player workout page.
// Shows every warm-up exercise with its demo clip playing (like a GIF), the
// reps/time, and any coach note, so players can see what to do on their
// phones. The TV only shows the names (app/coach/display), so it stays readable.
//
// - Nothing to log: the warm-up doesn't count toward sets or "Finish Workout".
// - Open when the player hasn't logged anything yet; folds up once they've
//   started lifting (tap the header to open or close it any time).
// - Clips only load and play while on screen (components/ExerciseClip.tsx),
//   so a long warm-up doesn't drain phone data or battery.
'use client'
import { useState } from 'react'
import ExerciseClip from '@/components/ExerciseClip'

export interface WarmupExercise {
  id: string
  exercise_id: string
  name: string
  reps: string | null
  notes: string | null
  coaching_notes: string | null
  clip_url: string | null
  clip_poster_url: string | null
}
export interface Warmup { rounds: number; exercises: WarmupExercise[] }

interface Props {
  warmup: Warmup | null | undefined
  notes?: string | null
  startOpen: boolean
}

export default function WarmupCard({ warmup, notes, startOpen }: Props) {
  const [open, setOpen] = useState(startOpen)
  const [cuesFor, setCuesFor] = useState<string | null>(null)
  const exercises = warmup?.exercises ?? []
  if (exercises.length === 0 && !notes) return null

  const rounds = warmup?.rounds ?? 1

  return (
    <div className="card" style={{ padding: 0, marginBottom: '1rem', borderLeft: '3px solid var(--volt)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.625rem', textAlign: 'left', color: 'inherit' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--volt)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Warm-Up</div>
          {exercises.length > 0 && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              {exercises.length} exercise{exercises.length === 1 ? '' : 's'}{rounds > 1 ? ` · ${rounds} rounds` : ''}
            </div>
          )}
        </div>
        <span style={{ color: 'var(--volt)', fontSize: '0.85rem', flexShrink: 0 }}>{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 0.875rem 0.875rem' }}>
          {notes && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: exercises.length ? '0.75rem' : 0, lineHeight: 1.45 }}>{notes}</p>
          )}
          {rounds > 1 && exercises.length > 0 && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Go through the list in order, then repeat — {rounds} times total.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {exercises.map((ex, i) => (
              <div key={ex.id} style={{ background: 'var(--court-raised)', borderRadius: 10, overflow: 'hidden' }}>
                {ex.clip_url ? (
                  <div style={{ width: '100%', aspectRatio: '16 / 9', background: 'var(--court-bg)' }}>
                    <ExerciseClip src={ex.clip_url} poster={ex.clip_poster_url} alt={`${ex.name} demo`} />
                  </div>
                ) : null}
                <div style={{ padding: '0.625rem 0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', flex: 1 }}>{ex.name}</span>
                    {ex.reps && <span style={{ fontSize: '0.85rem', color: 'var(--volt)', fontWeight: 700, flexShrink: 0 }}>{ex.reps}</span>}
                  </div>
                  {ex.notes && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.3rem', paddingLeft: '1.1rem' }}>{ex.notes}</div>}
                  {ex.coaching_notes && (
                    cuesFor === ex.id ? (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem', paddingLeft: '1.1rem', lineHeight: 1.45 }}>{ex.coaching_notes}</div>
                    ) : (
                      <button onClick={() => setCuesFor(ex.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', padding: '0.3rem 0 0 1.1rem', textDecoration: 'underline' }}>
                        Coaching cues
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
