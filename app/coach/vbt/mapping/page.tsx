'use client'
// app/coach/vbt/mapping/page.tsx
// ============================================================
// VBT EXERCISE MAPPING PAGE
// Bulk view to assign anchor lifts + ratios to all exercises
// ============================================================

import { useState, useEffect, useCallback } from 'react'

interface Exercise {
  id: string
  name: string
  category: string
  logs_weight: boolean
  anchor_exercise_id: string | null
  vbt_ratio: number | null
  vbt_confidence: string | null
}

interface AnchorExercise {
  id: string
  name: string
  slug: string
  category: string
}

// Suggested default ratios by exercise category vs anchor category
// These are starting points — coach can override any
const SUGGESTED_RATIOS: Record<string, { anchor_slug: string; ratio: number; confidence: string }> = {
  'Lower - Quad':        { anchor_slug: 'squat',              ratio: 0.85, confidence: 'high'   },
  'Lower - Hamstring':   { anchor_slug: 'deadlift',           ratio: 0.80, confidence: 'medium' },
  'Lower - Hip/Glute':   { anchor_slug: 'deadlift',           ratio: 0.75, confidence: 'medium' },
  'Upper - Push':        { anchor_slug: 'bench_press',        ratio: 0.85, confidence: 'medium' },
  'Upper - Pull':        { anchor_slug: 'bench_press',        ratio: 0.80, confidence: 'medium' },
  'Power':               { anchor_slug: 'trap_bar_high_pull', ratio: 0.70, confidence: 'medium' },
}

const CONFIDENCE_OPTIONS = [
  { value: 'high',   label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low' },
]

const CATEGORIES = [
  'Upper - Push', 'Upper - Pull',
  'Lower - Quad', 'Lower - Hamstring', 'Lower - Hip/Glute',
  'Core', 'Power', 'Conditioning', 'Mobility', 'Other',
]

export default function VbtMappingPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [anchors, setAnchors]     = useState<AnchorExercise[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState<Record<string, boolean>>({})
  const [saved, setSaved]         = useState<Record<string, boolean>>({})
  const [filterCat, setFilterCat] = useState('all')
  const [filterMapped, setFilterMapped] = useState<'all' | 'mapped' | 'unmapped'>('all')

  // Local edits tracked per exercise id
  const [edits, setEdits] = useState<Record<string, {
    anchor_exercise_id: string
    vbt_ratio: string
    vbt_confidence: string
  }>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const [exRes, ancRes] = await Promise.all([
      fetch('/api/coach/exercises').then(r => r.json()),
      fetch('/api/coach/vbt/anchors').then(r => r.json()),
    ])
    const exList: Exercise[] = exRes.exercises ?? []
    setExercises(exList)
    setAnchors(ancRes.anchors ?? [])

    // Pre-fill edits from existing data
    const initial: typeof edits = {}
    for (const ex of exList) {
      initial[ex.id] = {
        anchor_exercise_id: ex.anchor_exercise_id ?? '',
        vbt_ratio:          ex.vbt_ratio != null ? String(ex.vbt_ratio) : '',
        vbt_confidence:     ex.vbt_confidence ?? 'medium',
      }
    }
    setEdits(initial)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function getEdit(id: string) {
    return edits[id] ?? { anchor_exercise_id: '', vbt_ratio: '', vbt_confidence: 'medium' }
  }

  function updateEdit(id: string, field: string, value: string) {
    setEdits(prev => ({ ...prev, [id]: { ...getEdit(id), [field]: value } }))
    setSaved(prev => ({ ...prev, [id]: false }))
  }

  function applySuggestion(ex: Exercise) {
    const suggestion = SUGGESTED_RATIOS[ex.category]
    if (!suggestion) return
    const anchor = anchors.find(a => a.slug === suggestion.anchor_slug)
    if (!anchor) return
    setEdits(prev => ({
      ...prev,
      [ex.id]: {
        anchor_exercise_id: anchor.id,
        vbt_ratio:          String(suggestion.ratio),
        vbt_confidence:     suggestion.confidence,
      },
    }))
    setSaved(prev => ({ ...prev, [ex.id]: false }))
  }

  async function saveRow(ex: Exercise) {
    const edit = getEdit(ex.id)
    setSaving(prev => ({ ...prev, [ex.id]: true }))

    try {
      if (edit.anchor_exercise_id && edit.vbt_ratio) {
        await fetch('/api/coach/vbt/ratios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exercise_id:        ex.id,
            anchor_exercise_id: edit.anchor_exercise_id,
            ratio:              parseFloat(edit.vbt_ratio),
            confidence:         edit.vbt_confidence,
          }),
        })
      } else {
        // Clear the mapping
        await fetch('/api/coach/vbt/ratios', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exercise_id: ex.id }),
        })
      }
      setSaved(prev => ({ ...prev, [ex.id]: true }))
      // Update local exercise state
      setExercises(prev => prev.map(e => e.id === ex.id ? {
        ...e,
        anchor_exercise_id: edit.anchor_exercise_id || null,
        vbt_ratio:          edit.vbt_ratio ? parseFloat(edit.vbt_ratio) : null,
        vbt_confidence:     edit.vbt_confidence,
      } : e))
    } finally {
      setSaving(prev => ({ ...prev, [ex.id]: false }))
    }
  }

  const filtered = exercises.filter(ex => {
    if (!ex.logs_weight) return false // only show exercises that track weight
    if (filterCat !== 'all' && ex.category !== filterCat) return false
    const isMapped = !!(getEdit(ex.id).anchor_exercise_id && getEdit(ex.id).vbt_ratio)
    if (filterMapped === 'mapped'   && !isMapped) return false
    if (filterMapped === 'unmapped' && isMapped)  return false
    return true
  })

  const grouped = CATEGORIES.reduce<Record<string, Exercise[]>>((acc, cat) => {
    const items = filtered.filter(e => e.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  const mappedCount   = exercises.filter(ex => ex.logs_weight && ex.anchor_exercise_id && ex.vbt_ratio).length
  const weightedCount = exercises.filter(ex => ex.logs_weight).length

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <a href="/coach/exercises" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}>← Exercises</a>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800 }}>⚡ VBT Exercise Mapping</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Link exercises to anchor lifts so VBT-based 1RM estimates drive weight suggestions.
            {' '}<strong style={{ color: 'var(--carolina-dark)' }}>{mappedCount} of {weightedCount}</strong> weighted exercises mapped.
          </p>
        </div>
      </div>

      {/* Anchor key */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--carolina-deep)', marginBottom: '0.5rem' }}>
          Your 4 Anchor Lifts
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {anchors.map(a => (
            <div key={a.id} style={{ padding: '0.3rem 0.875rem', borderRadius: 20, border: '1.5px solid var(--carolina)', background: 'var(--carolina-light)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--carolina-dark)' }}>
              {a.name}
            </div>
          ))}
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          The ratio is what fraction of the anchor&apos;s 1RM a typical athlete can lift on this exercise.
          Example: if ratio = 0.85 and squat 1RM = 200 lbs → exercise suggestion = 170 lbs.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {(['all', 'mapped', 'unmapped'] as const).map(f => (
            <button key={f} onClick={() => setFilterMapped(f)}
              style={{ padding: '0.35rem 0.875rem', borderRadius: 20, border: `1.5px solid ${filterMapped === f ? 'var(--carolina)' : 'var(--gray-border)'}`, background: filterMapped === f ? 'var(--carolina)' : 'transparent', color: filterMapped === f ? '#fff' : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
              {f}
            </button>
          ))}
        </div>
        <select
          style={{ padding: '0.35rem 0.75rem', borderRadius: 20, border: '1.5px solid var(--gray-border)', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)', background: 'transparent', cursor: 'pointer' }}
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
        >
          <option value="all">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Exercise rows by category */}
      {Object.entries(grouped).map(([cat, exs]) => (
        <div key={cat} style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--carolina-dark)', marginBottom: '0.5rem', paddingBottom: '0.375rem', borderBottom: '2px solid var(--carolina-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{cat}</span>
            {SUGGESTED_RATIOS[cat] && (
              <button
                onClick={() => exs.forEach(ex => applySuggestion(ex))}
                style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--carolina)', background: 'none', border: '1px solid var(--carolina)', borderRadius: 6, padding: '0.2rem 0.5rem', cursor: 'pointer', textTransform: 'none', letterSpacing: 'normal' }}
              >
                Auto-fill category defaults
              </button>
            )}
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 100px 120px 80px', gap: '0.5rem', padding: '0 0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Exercise</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Anchor Lift</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Ratio</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Confidence</span>
            <span></span>
          </div>

          {exs.map(ex => {
            const edit       = getEdit(ex.id)
            const isMapped   = !!(edit.anchor_exercise_id && edit.vbt_ratio)
            const isDirty    = edit.anchor_exercise_id !== (ex.anchor_exercise_id ?? '') ||
                               edit.vbt_ratio !== (ex.vbt_ratio != null ? String(ex.vbt_ratio) : '') ||
                               edit.vbt_confidence !== (ex.vbt_confidence ?? 'medium')
            const hasSuggest = !!SUGGESTED_RATIOS[ex.category]
            const anchorName = anchors.find(a => a.id === edit.anchor_exercise_id)?.name

            return (
              <div key={ex.id} className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 180px 100px 120px 80px', gap: '0.5rem', padding: '0.625rem 0.75rem', marginBottom: '0.375rem', alignItems: 'center', borderLeft: `3px solid ${isMapped ? 'var(--carolina)' : 'var(--gray-border)'}` }}>
                {/* Exercise name */}
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{ex.name}</div>
                  {isMapped && anchorName && (
                    <div style={{ fontSize: '0.68rem', color: 'var(--carolina)', marginTop: '0.1rem' }}>
                      → {anchorName} × {edit.vbt_ratio}
                    </div>
                  )}
                  {!isMapped && hasSuggest && (
                    <button onClick={() => applySuggestion(ex)}
                      style={{ fontSize: '0.68rem', color: 'var(--carolina-dark)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', marginTop: '0.1rem' }}>
                      Use default
                    </button>
                  )}
                </div>

                {/* Anchor selector */}
                <select
                  style={{ padding: '0.35rem 0.5rem', border: '1.5px solid var(--gray-border)', borderRadius: 7, fontSize: '0.8rem', background: 'var(--white)', color: edit.anchor_exercise_id ? 'var(--text-primary)' : 'var(--text-muted)' }}
                  value={edit.anchor_exercise_id}
                  onChange={e => updateEdit(ex.id, 'anchor_exercise_id', e.target.value)}
                >
                  <option value="">— None —</option>
                  {anchors.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>

                {/* Ratio input */}
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="2.0"
                  placeholder="e.g. 0.85"
                  style={{ padding: '0.35rem 0.5rem', border: '1.5px solid var(--gray-border)', borderRadius: 7, fontSize: '0.8rem', background: edit.anchor_exercise_id ? 'var(--white)' : 'var(--carolina-light)', opacity: edit.anchor_exercise_id ? 1 : 0.5 }}
                  value={edit.vbt_ratio}
                  onChange={e => updateEdit(ex.id, 'vbt_ratio', e.target.value)}
                  disabled={!edit.anchor_exercise_id}
                />

                {/* Confidence */}
                <select
                  style={{ padding: '0.35rem 0.5rem', border: '1.5px solid var(--gray-border)', borderRadius: 7, fontSize: '0.8rem', background: 'var(--white)', opacity: edit.anchor_exercise_id ? 1 : 0.5 }}
                  value={edit.vbt_confidence}
                  onChange={e => updateEdit(ex.id, 'vbt_confidence', e.target.value)}
                  disabled={!edit.anchor_exercise_id}
                >
                  {CONFIDENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                {/* Save button */}
                <button
                  onClick={() => saveRow(ex)}
                  disabled={saving[ex.id] || !isDirty}
                  style={{
                    padding: '0.35rem 0.625rem',
                    borderRadius: 7,
                    border: 'none',
                    background: saved[ex.id] ? 'rgba(22,163,74,0.12)' : isDirty ? 'var(--volt)' : 'var(--carolina-light)',
                    color: saved[ex.id] ? 'var(--success)' : isDirty ? '#000' : 'var(--text-muted)',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    cursor: isDirty ? 'pointer' : 'default',
                    transition: 'background 0.15s',
                  }}
                >
                  {saving[ex.id] ? '…' : saved[ex.id] ? '✓ Saved' : isDirty ? 'Save' : 'Saved'}
                </button>
              </div>
            )
          })}
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No exercises match the current filters.
        </div>
      )}
    </div>
  )
}
