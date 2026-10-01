// FILE: components/VbtPanel.tsx
'use client'
// ============================================================
// VBT PANEL — shown on the coach-side player profile page
//
// Displays:
//   - The player's VBT profile for each tested exercise
//   - "Log Test" → enter a test for any exercise with "Log velocity" on
//   - Test history
// VBT is exercise-specific: each profile only affects its own exercise.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { profileQualityLabel, profileNeedsRefresh, isProfileTrusted } from '@/lib/vbt'

// ------------------------------------------------------------
// TYPES
// ------------------------------------------------------------

interface VelocityExercise { id: string; name: string }

interface VbtProfile {
  id: string
  exercise_id: string
  slope: number | null
  v_intercept: number | null
  estimated_1rm_lbs: number | null
  mvt_used: number | null
  r_squared: number | null
  load_light_lbs: number | null
  load_heavy_lbs: number | null
  velocity_at_light: number | null
  velocity_at_heavy: number | null
  calculated_at: string
  exercise: { id: string; name: string } | null
}

interface DataPoint {
  load_lbs: number
  reps_performed: number
  best_velocity_ms: number
}

interface VbtTest {
  id: string
  tested_at: string
  notes: string | null
  mvt_override: number | null
  exercise: { id: string; name: string } | null
  vbt_data_points: DataPoint[]
}

// ------------------------------------------------------------
// LOG TEST MODAL
// ------------------------------------------------------------

function LogTestModal({
  exercises,
  profiles,
  initialExerciseId,
  playerId,
  onClose,
  onSaved,
}: {
  exercises: VelocityExercise[]
  profiles: VbtProfile[]
  initialExerciseId?: string
  playerId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [exerciseId, setExerciseId] = useState(initialExerciseId ?? exercises[0]?.id ?? '')
  const [testedAt, setTestedAt]     = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]           = useState('')
  const [mvt, setMvt]               = useState('')
  const [points, setPoints]         = useState<DataPoint[]>([
    { load_lbs: 0, reps_performed: 3, best_velocity_ms: 0 },
    { load_lbs: 0, reps_performed: 3, best_velocity_ms: 0 },
  ])
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [result, setResult]   = useState<{ ok: boolean; message: string } | null>(null)

  // Pre-fill the minimum velocity from this player's last test of the same exercise
  useEffect(() => {
    const prev = profiles.find(p => p.exercise_id === exerciseId)
    setMvt(prev?.mvt_used ? String(prev.mvt_used) : '')
  }, [exerciseId, profiles])

  function updatePoint(idx: number, field: keyof DataPoint, val: string) {
    setPoints(prev => prev.map((p, i) => i === idx ? { ...p, [field]: parseFloat(val) || 0 } : p))
  }
  function addPoint() {
    setPoints(prev => [...prev, { load_lbs: 0, reps_performed: 3, best_velocity_ms: 0 }])
  }
  function removePoint(idx: number) {
    if (points.length <= 1) return
    setPoints(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setError(null)
    if (!exerciseId) { setError('Choose an exercise.'); return }
    const validPoints = points.filter(p => p.load_lbs > 0 && p.best_velocity_ms > 0)
    if (validPoints.length < 1) { setError('Enter at least one load with its bar speed.'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/coach/vbt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: playerId,
          exercise_id: exerciseId,
          tested_at: testedAt,
          mvt: mvt ? parseFloat(mvt) : undefined,
          notes: notes || undefined,
          data_points: validPoints,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onSaved()
      setResult({ ok: !!data.profile_updated, message: data.message })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--carolina-dark)', fontSize: '1.25rem' }}>
            Log VBT Test
          </h2>
          <button className="btn-ghost text-sm" onClick={onClose}>✕ Close</button>
        </div>

        {result ? (
          <>
            <p className="text-sm mb-4" style={{ color: result.ok ? 'var(--carolina-dark)' : '#b45309' }}>{result.message}</p>
            <div className="flex justify-end">
              <button className="btn-volt" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            {exercises.length === 0 ? (
              <p className="text-sm mb-4" style={{ color: '#b45309' }}>
                No exercises have &quot;Log velocity&quot; turned on. Turn it on in the Exercise Library for any lift you want to test.
              </p>
            ) : (
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--carolina-dark)' }}>Exercise</label>
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--gray-border)' }}
                  value={exerciseId}
                  onChange={e => setExerciseId(e.target.value)}
                >
                  {exercises.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                </select>
                <p className="text-xs mt-1 opacity-60">This test only affects suggestions for this exercise.</p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--carolina-dark)' }}>Test Date</label>
              <input
                type="date"
                className="border rounded px-3 py-2 text-sm"
                style={{ borderColor: 'var(--gray-border)' }}
                value={testedAt}
                onChange={e => setTestedAt(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--carolina-dark)' }}>
                Loads
                <span className="ml-2 font-normal opacity-60 text-xs">
                  (at least 2 — one light, one heavy. Record the fastest rep at each.)
                </span>
              </label>

              <div className="grid text-xs font-semibold mb-1 opacity-60" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
                <span>Load (lbs)</span>
                <span>Reps done</span>
                <span>Best speed (m/s)</span>
                <span></span>
              </div>

              {points.map((p, idx) => (
                <div key={idx} className="grid gap-2 mb-2 items-center" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
                  <input type="number" placeholder="e.g. 95" className="border rounded px-2 py-1 text-sm"
                    style={{ borderColor: 'var(--gray-border)' }}
                    value={p.load_lbs || ''} onChange={e => updatePoint(idx, 'load_lbs', e.target.value)} />
                  <input type="number" placeholder="3" className="border rounded px-2 py-1 text-sm"
                    style={{ borderColor: 'var(--gray-border)' }}
                    value={p.reps_performed || ''} onChange={e => updatePoint(idx, 'reps_performed', e.target.value)} />
                  <input type="number" step="0.01" placeholder="e.g. 0.54" className="border rounded px-2 py-1 text-sm"
                    style={{ borderColor: 'var(--gray-border)' }}
                    value={p.best_velocity_ms || ''} onChange={e => updatePoint(idx, 'best_velocity_ms', e.target.value)} />
                  <button className="btn-ghost text-xs px-2 py-1" onClick={() => removePoint(idx)} disabled={points.length <= 1}>✕</button>
                </div>
              ))}

              <button className="btn-ghost text-xs mt-1" onClick={addPoint}>+ Add load</button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--carolina-dark)' }}>
                Minimum velocity (optional)
              </label>
              <input
                type="number" step="0.01" placeholder="e.g. 0.30"
                className="border rounded px-3 py-2 text-sm w-40"
                style={{ borderColor: 'var(--gray-border)' }}
                value={mvt} onChange={e => setMvt(e.target.value)}
              />
              <p className="text-xs mt-1 opacity-50">
                Bar speed at a true 1-rep max for this lift. Only needed for a 1RM estimate — speed targets work without it.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--carolina-dark)' }}>Notes (optional)</label>
              <textarea
                className="border rounded px-3 py-2 text-sm w-full"
                style={{ borderColor: 'var(--gray-border)' }}
                rows={2}
                placeholder="e.g. Post-practice, athlete was fatigued…"
                value={notes} onChange={e => setNotes(e.target.value)}
              />
            </div>

            {error && <p className="text-sm mb-3" style={{ color: '#dc2626' }}>{error}</p>}

            <div className="flex gap-2 justify-end">
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-volt" onClick={handleSave} disabled={saving || exercises.length === 0}>
                {saving ? 'Saving…' : 'Save Test'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// PROFILE CARD — one per tested exercise
// ------------------------------------------------------------

function ProfileCard({ profile, onLogTest }: { profile: VbtProfile; onLogTest: () => void }) {
  const trusted = isProfileTrusted(profile)
  const needsRefresh = profileNeedsRefresh(profile.calculated_at, profile.r_squared)
  const quality = profileQualityLabel(2, profile.r_squared)
  const date = new Date(profile.calculated_at).toLocaleDateString()

  return (
    <div className="card mb-3" style={{ borderLeft: `4px solid ${trusted ? 'var(--carolina)' : '#d97706'}` }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--carolina-dark)' }}>
              {profile.exercise?.name ?? 'Exercise'}
            </span>
            {!trusted && (
              <span className="tag text-xs" style={{ background: '#fef3c7', color: '#92400e' }}>
                {needsRefresh ? 'Retest needed — not used' : 'Not used'}
              </span>
            )}
          </div>
          {profile.estimated_1rm_lbs ? (
            <div className="text-2xl font-bold" style={{ color: 'var(--volt)', fontFamily: 'var(--font-display)' }}>
              {Math.round(profile.estimated_1rm_lbs)} lbs
              <span className="text-sm font-normal ml-1 opacity-60" style={{ color: 'inherit' }}>est. 1RM</span>
            </div>
          ) : (
            <div className="text-sm opacity-70">Speed profile only (no 1RM)</div>
          )}
        </div>
        <button className="btn-ghost text-xs whitespace-nowrap" onClick={onLogTest}>+ Retest</button>
      </div>

      <div className="mt-2 text-xs opacity-60 flex flex-wrap gap-x-4 gap-y-1">
        {profile.load_light_lbs && profile.velocity_at_light && (
          <span>{profile.load_light_lbs} lbs @ {profile.velocity_at_light} m/s</span>
        )}
        {profile.load_heavy_lbs && profile.velocity_at_heavy && (
          <span>{profile.load_heavy_lbs} lbs @ {profile.velocity_at_heavy} m/s</span>
        )}
        {profile.mvt_used && <span>Min velocity: {profile.mvt_used} m/s</span>}
        {profile.r_squared !== null && <span>R²: {profile.r_squared.toFixed(3)}</span>}
        <span>{quality}</span>
        <span>Tested {date}</span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// TEST HISTORY ROW
// ------------------------------------------------------------

function TestHistoryRow({ test }: { test: VbtTest }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'var(--gray-border)' }}>
      <button
        className="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="font-medium">{test.exercise?.name ?? 'Exercise'}</span>
        <span className="opacity-50 text-xs">
          {new Date(test.tested_at).toLocaleDateString()} {expanded ? '▲' : '▼'}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 text-xs">
          <div className="grid gap-1">
            {test.vbt_data_points.map((dp, i) => (
              <div key={i} className="flex gap-4 opacity-70">
                <span>{dp.load_lbs} lbs</span>
                <span>{dp.reps_performed} reps</span>
                <span>{dp.best_velocity_ms} m/s</span>
              </div>
            ))}
          </div>
          {test.notes && <p className="mt-1 opacity-50 italic">{test.notes}</p>}
          {test.mvt_override && <p className="mt-1 opacity-50">Min velocity: {test.mvt_override} m/s</p>}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// MAIN VBT PANEL
// ------------------------------------------------------------

export default function VbtPanel({ playerId }: { playerId: string }) {
  const [profiles, setProfiles]   = useState<VbtProfile[]>([])
  const [tests, setTests]         = useState<VbtTest[]>([])
  const [exercises, setExercises] = useState<VelocityExercise[]>([])
  const [loading, setLoading]     = useState(true)
  const [modalFor, setModalFor]   = useState<string | null>(null)   // exercise id, or '' for default
  const [showHistory, setShowHistory] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/coach/vbt?player_id=${playerId}`)
      const data = await res.json()
      setProfiles(data.profiles ?? [])
      setTests(data.tests ?? [])
      setExercises(data.exercises ?? [])
    } finally {
      setLoading(false)
    }
  }, [playerId])

  useEffect(() => { load() }, [load])

  const untested = exercises.filter(ex => !profiles.find(p => p.exercise_id === ex.id))

  return (
    <section className="card mt-4">
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--carolina-dark)', fontSize: '1.1rem' }}>
          Velocity-Based Training
        </h2>
        <button className="btn-volt text-sm" onClick={() => setModalFor('')}>+ Log Test</button>
      </div>

      {loading ? (
        <p className="text-sm opacity-50">Loading…</p>
      ) : (
        <>
          {profiles.length > 0 ? (
            profiles.map(p => (
              <ProfileCard key={p.id} profile={p} onLogTest={() => setModalFor(p.exercise_id)} />
            ))
          ) : (
            <p className="text-sm opacity-50 mb-3">No VBT profiles yet. Log a test to get started.</p>
          )}

          {untested.length > 0 && (
            <div className="text-xs opacity-50 mt-2 mb-3">
              Not yet tested: {untested.map(ex => ex.name).join(', ')}
            </div>
          )}

          {tests.length > 0 && (
            <div className="mt-4">
              <button className="btn-ghost text-xs" onClick={() => setShowHistory(v => !v)}>
                {showHistory ? '▲ Hide' : '▼ Show'} test history ({tests.length})
              </button>
              {showHistory && (
                <div className="mt-2 border rounded" style={{ borderColor: 'var(--gray-border)' }}>
                  {tests.map(t => <TestHistoryRow key={t.id} test={t} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {modalFor !== null && (
        <LogTestModal
          exercises={exercises}
          profiles={profiles}
          initialExerciseId={modalFor || undefined}
          playerId={playerId}
          onClose={() => setModalFor(null)}
          onSaved={load}
        />
      )}
    </section>
  )
}
