'use client'
// components/VbtPanel.tsx
// ============================================================
// VBT PANEL — shown on the coach-side player profile page
//
// Displays:
//   - Current VBT profiles (1RM per anchor lift)
//   - "Log Test" button → modal to enter a new test session
//   - Test history per anchor
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { profileQualityLabel, profileNeedsRefresh } from '@/lib/vbt'

// ------------------------------------------------------------
// TYPES
// ------------------------------------------------------------

interface AnchorExercise {
  id: string
  name: string
  slug: string
  category: string
  mvt_default: number
  mvt_label: string
  notes: string | null
}

interface VbtProfile {
  id: string
  anchor_exercise_id: string
  estimated_1rm_lbs: number
  mvt_used: number
  r_squared: number | null
  load_light_lbs: number | null
  load_heavy_lbs: number | null
  velocity_at_light: number | null
  velocity_at_heavy: number | null
  calculated_at: string
  anchor_exercise: AnchorExercise
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
  anchor_exercise: { id: string; name: string; slug: string; category: string }
  vbt_data_points: DataPoint[]
}

// ------------------------------------------------------------
// LOG TEST MODAL
// ------------------------------------------------------------

function LogTestModal({
  anchors,
  playerId,
  onClose,
  onSaved,
}: {
  anchors: AnchorExercise[]
  playerId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [anchorId, setAnchorId]       = useState(anchors[0]?.id ?? '')
  const [testedAt, setTestedAt]       = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]             = useState('')
  const [mvtOverride, setMvtOverride] = useState('')
  const [points, setPoints]           = useState<DataPoint[]>([
    { load_lbs: 0, reps_performed: 3, best_velocity_ms: 0 },
    { load_lbs: 0, reps_performed: 3, best_velocity_ms: 0 },
  ])
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const selectedAnchor = anchors.find(a => a.id === anchorId)

  function updatePoint(idx: number, field: keyof DataPoint, val: string) {
    setPoints(prev => prev.map((p, i) =>
      i === idx ? { ...p, [field]: parseFloat(val) || 0 } : p
    ))
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

    // Validate
    const validPoints = points.filter(p => p.load_lbs > 0 && p.best_velocity_ms > 0)
    if (validPoints.length < 1) {
      setError('Enter at least one data point with load and velocity.')
      return
    }
    if (validPoints.length < 2) {
      setError('Two data points are recommended for an accurate 1RM estimate. Add a second point or proceed with one (less accurate).')
      // Allow saving with 1 point — just warn
    }

    setSaving(true)
    try {
      const res = await fetch('/api/coach/vbt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: playerId,
          anchor_exercise_id: anchorId,
          tested_at: testedAt,
          mvt_override: mvtOverride ? parseFloat(mvtOverride) : undefined,
          notes: notes || undefined,
          data_points: validPoints,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--carolina-dark)', fontSize: '1.25rem' }}>
            Log VBT Test
          </h2>
          <button className="btn-ghost text-sm" onClick={onClose}>✕ Cancel</button>
        </div>

        {/* Anchor selector */}
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--carolina-dark)' }}>
            Anchor Lift
          </label>
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            style={{ borderColor: 'var(--gray-border)' }}
            value={anchorId}
            onChange={e => setAnchorId(e.target.value)}
          >
            {anchors.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {selectedAnchor?.notes && (
            <p className="text-xs mt-1 opacity-60">{selectedAnchor.notes}</p>
          )}
        </div>

        {/* Test date */}
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--carolina-dark)' }}>
            Test Date
          </label>
          <input
            type="date"
            className="border rounded px-3 py-2 text-sm"
            style={{ borderColor: 'var(--gray-border)' }}
            value={testedAt}
            onChange={e => setTestedAt(e.target.value)}
          />
        </div>

        {/* Data points */}
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--carolina-dark)' }}>
            Data Points
            <span className="ml-2 font-normal opacity-60 text-xs">
              (3 reps per load — record the fastest rep)
            </span>
          </label>

          <div className="grid text-xs font-semibold mb-1 opacity-60"
               style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
            <span>Load (lbs)</span>
            <span>Reps done</span>
            <span>Best velocity (m/s)</span>
            <span></span>
          </div>

          {points.map((p, idx) => (
            <div key={idx} className="grid gap-2 mb-2 items-center"
                 style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
              <input
                type="number"
                placeholder="e.g. 95"
                className="border rounded px-2 py-1 text-sm"
                style={{ borderColor: 'var(--gray-border)' }}
                value={p.load_lbs || ''}
                onChange={e => updatePoint(idx, 'load_lbs', e.target.value)}
              />
              <input
                type="number"
                placeholder="3"
                className="border rounded px-2 py-1 text-sm"
                style={{ borderColor: 'var(--gray-border)' }}
                value={p.reps_performed || ''}
                onChange={e => updatePoint(idx, 'reps_performed', e.target.value)}
              />
              <input
                type="number"
                step="0.001"
                placeholder="e.g. 0.540"
                className="border rounded px-2 py-1 text-sm"
                style={{ borderColor: 'var(--gray-border)' }}
                value={p.best_velocity_ms || ''}
                onChange={e => updatePoint(idx, 'best_velocity_ms', e.target.value)}
              />
              <button
                className="btn-ghost text-xs px-2 py-1"
                onClick={() => removePoint(idx)}
                disabled={points.length <= 1}
              >✕</button>
            </div>
          ))}

          <button className="btn-ghost text-xs mt-1" onClick={addPoint}>
            + Add point
          </button>
        </div>

        {/* Optional MVT override */}
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--carolina-dark)' }}>
            Custom MVT Override
            <span className="ml-2 font-normal opacity-60 text-xs">
              (leave blank to use default: {selectedAnchor?.mvt_default} m/s)
            </span>
          </label>
          <input
            type="number"
            step="0.01"
            placeholder={`default: ${selectedAnchor?.mvt_default}`}
            className="border rounded px-3 py-2 text-sm w-40"
            style={{ borderColor: 'var(--gray-border)' }}
            value={mvtOverride}
            onChange={e => setMvtOverride(e.target.value)}
          />
          <p className="text-xs mt-1 opacity-50">{selectedAnchor?.mvt_label}</p>
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--carolina-dark)' }}>
            Notes (optional)
          </label>
          <textarea
            className="border rounded px-3 py-2 text-sm w-full"
            style={{ borderColor: 'var(--gray-border)' }}
            rows={2}
            placeholder="e.g. Post-practice, athlete was fatigued..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm mb-3" style={{ color: '#dc2626' }}>{error}</p>
        )}

        <div className="flex gap-2 justify-end">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-volt"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Test'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// PROFILE CARD — one per anchor lift
// ------------------------------------------------------------

function ProfileCard({
  profile,
  onLogTest,
}: {
  profile: VbtProfile
  onLogTest: () => void
}) {
  const needsRefresh = profileNeedsRefresh(
    profile.calculated_at,
    profile.r_squared
  )
  const quality = profileQualityLabel(
    profile.load_light_lbs && profile.load_heavy_lbs ? 2 : 1,
    profile.r_squared
  )
  const date = new Date(profile.calculated_at).toLocaleDateString()

  return (
    <div className="card mb-3" style={{ borderLeft: '4px solid var(--carolina)' }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--carolina-dark)' }}>
              {profile.anchor_exercise.name}
            </span>
            {needsRefresh && (
              <span className="tag text-xs" style={{ background: '#fef3c7', color: '#92400e' }}>
                Refresh recommended
              </span>
            )}
          </div>
          <div className="text-2xl font-bold" style={{ color: 'var(--volt)', fontFamily: 'var(--font-display)' }}>
            {Math.round(profile.estimated_1rm_lbs)} lbs
            <span className="text-sm font-normal ml-1 opacity-60" style={{ color: 'inherit' }}>
              est. 1RM
            </span>
          </div>
        </div>
        <button className="btn-ghost text-xs whitespace-nowrap" onClick={onLogTest}>
          + Update
        </button>
      </div>

      <div className="mt-2 text-xs opacity-60 flex flex-wrap gap-x-4 gap-y-1">
        {profile.load_light_lbs && profile.velocity_at_light && (
          <span>{profile.load_light_lbs} lbs @ {profile.velocity_at_light} m/s</span>
        )}
        {profile.load_heavy_lbs && profile.velocity_at_heavy && (
          <span>{profile.load_heavy_lbs} lbs @ {profile.velocity_at_heavy} m/s</span>
        )}
        <span>MVT: {profile.mvt_used} m/s</span>
        {profile.r_squared !== null && (
          <span>R²: {profile.r_squared.toFixed(3)}</span>
        )}
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
        <span className="font-medium">{test.anchor_exercise.name}</span>
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
          {test.notes && (
            <p className="mt-1 opacity-50 italic">{test.notes}</p>
          )}
          {test.mvt_override && (
            <p className="mt-1 opacity-50">Custom MVT: {test.mvt_override} m/s</p>
          )}
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
  const [anchors, setAnchors]     = useState<AnchorExercise[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/coach/vbt?player_id=${playerId}`)
      const data = await res.json()
      setProfiles(data.profiles ?? [])
      setTests(data.tests ?? [])
      setAnchors(data.anchors ?? [])
    } finally {
      setLoading(false)
    }
  }, [playerId])

  useEffect(() => { load() }, [load])

  // Anchors that don't yet have a profile
  const missingAnchors = anchors.filter(
    a => !profiles.find(p => p.anchor_exercise_id === a.id)
  )

  return (
    <section className="card mt-4">
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--carolina-dark)', fontSize: '1.1rem' }}>
          Velocity-Based Training
        </h2>
        <button className="btn-volt text-sm" onClick={() => setShowModal(true)}>
          + Log Test
        </button>
      </div>

      {loading ? (
        <p className="text-sm opacity-50">Loading…</p>
      ) : (
        <>
          {/* Active profiles */}
          {profiles.length > 0 ? (
            profiles.map(p => (
              <ProfileCard
                key={p.id}
                profile={p}
                onLogTest={() => setShowModal(true)}
              />
            ))
          ) : (
            <p className="text-sm opacity-50 mb-3">
              No VBT profiles yet. Log a test to get started.
            </p>
          )}

          {/* Missing anchors reminder */}
          {missingAnchors.length > 0 && (
            <div className="text-xs opacity-50 mt-2 mb-3">
              Not yet tested: {missingAnchors.map(a => a.name).join(', ')}
            </div>
          )}

          {/* Test history toggle */}
          {tests.length > 0 && (
            <div className="mt-4">
              <button
                className="btn-ghost text-xs"
                onClick={() => setShowHistory(v => !v)}
              >
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

      {showModal && (
        <LogTestModal
          anchors={anchors}
          playerId={playerId}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </section>
  )
}
