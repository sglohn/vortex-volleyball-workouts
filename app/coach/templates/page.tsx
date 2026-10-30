// FILE: app/coach/templates/page.tsx
//
// Workout templates. Band exercises (Large band / Hip band in Coach →
// Exercises) get a "Recommended band" pick; players see it as the coach
// pick when they log the set (components/WeightPicker.tsx).
//
// Combine Day (volleyball, lib/combine.ts): tick "Combine Day" and pick the
// tests. Players then enter their Volleyball Performance Index numbers on
// their phones instead of lifting (components/CombineDay.tsx). A combine
// can still have a warm-up; it has no lifting blocks.
'use client'
import { useState, useEffect } from 'react'
import { PHASE_CONFIG, PhaseType } from '@/lib/types'
import { isWarmupLabel, WARMUP_LABEL } from '@/lib/warmup'
import { asEquipment, bandInfo, bandsFor, isBandEquipment } from '@/lib/loads'
import { FEATURES } from '@/lib/features'
import { COMBINE_KEYS, COMBINE_METRICS } from '@/lib/combine'

interface ExerciseLib { id: string; name: string; category?: string; default_sets: number; default_reps?: string; logs_weight: boolean; logs_velocity?: boolean; equipment?: string | null }
interface BlockExercise { exercise_id: string; custom_reps: string; custom_notes: string; target_velocity_min: string; target_velocity_max: string; recommended_band: string; exercise?: ExerciseLib }
interface Block { block_label: string; sets: number; exercises: BlockExercise[] }
interface Template {
  id?: string; name: string; description: string; phase_type: string; warmup_notes: string; blocks: Block[]
  is_combine?: boolean
  combine_metrics?: string[] | null   // tests in this combine; null = all
}

const PHASE_TYPES = Object.entries(PHASE_CONFIG).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))
// Lifting block labels. The warm-up has its own section (lib/warmup.ts).
const BLOCK_LABELS = ['A','B','C','D','E','F','Finisher']

// Warm-up block first, then the lifting blocks in their order
function warmupFirst<T extends { block_label: string }>(blocks: T[]): T[] {
  return [...blocks.filter(b => isWarmupLabel(b.block_label)), ...blocks.filter(b => !isWarmupLabel(b.block_label))]
}

// After blocks are moved: warm-up stays on top, and lettered blocks (A–F)
// take the letters in their new order, so the top lifting block is always A.
// Finisher keeps its name wherever it sits.
const LETTERS = ['A','B','C','D','E','F']
function reletter<T extends { block_label: string }>(blocks: T[]): T[] {
  let n = 0
  return warmupFirst(blocks).map(b => LETTERS.includes(b.block_label)
    ? { ...b, block_label: LETTERS[n++] ?? b.block_label }
    : b)
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [exercises, setExercises] = useState<ExerciseLib[]>([])
  const [editing, setEditing] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Template | null>(null)
  const [msg, setMsg] = useState('')
  const [exSearch, setExSearch] = useState('')
  const [addingTo, setAddingTo] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/coach/templates').then(r => r.json()),
      fetch('/api/coach/exercises').then(r => r.json()),
    ]).then(([t, e]) => { setTemplates(t.templates ?? []); setExercises(e.exercises ?? []); setLoading(false) })
  }, [])

  const blank = (): Template => ({ name: '', description: '', phase_type: 'general', warmup_notes: '', blocks: [{ block_label: 'A', sets: 3, exercises: [] }], is_combine: false, combine_metrics: null })

  // Combine Day on/off. Turning it off with no lifting blocks adds Block A back.
  function setCombine(on: boolean) {
    setEditing(p => {
      if (!p) return p
      if (on) return { ...p, is_combine: true, combine_metrics: p.combine_metrics ?? null }
      const hasLifting = p.blocks.some(b => !isWarmupLabel(b.block_label))
      return { ...p, is_combine: false, blocks: hasLifting ? p.blocks : [...p.blocks, { block_label: 'A', sets: 3, exercises: [] }] }
    })
  }

  // Tick or untick one combine test (all ticked is saved as "all")
  function toggleCombineMetric(key: string) {
    setEditing(p => {
      if (!p) return p
      const current = new Set<string>(p.combine_metrics ?? COMBINE_KEYS)
      if (current.has(key)) current.delete(key); else current.add(key)
      const list = COMBINE_KEYS.filter(k => current.has(k))
      return { ...p, combine_metrics: list }
    })
  }

  function addBlock() {
    setEditing(p => {
      if (!p) return p
      const used = new Set(p.blocks.map(b => b.block_label))
      const next = BLOCK_LABELS.find(l => !used.has(l)) ?? `Block ${p.blocks.length + 1}`
      return { ...p, blocks: [...p.blocks, { block_label: next, sets: 3, exercises: [] }] }
    })
  }

  function addWarmup() {
    setEditing(p => {
      if (!p || p.blocks.some(b => isWarmupLabel(b.block_label))) return p
      return { ...p, blocks: [{ block_label: WARMUP_LABEL, sets: 1, exercises: [] }, ...p.blocks] }
    })
  }

  // Up/down arrows on each block (the warm-up always stays on top)
  function moveBlock(i: number, dir: -1 | 1) {
    setEditing(p => {
      if (!p) return p
      const j = i + dir
      if (j < 0 || j >= p.blocks.length) return p
      if (isWarmupLabel(p.blocks[i].block_label) || isWarmupLabel(p.blocks[j].block_label)) return p
      const blocks = [...p.blocks]
      ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
      return { ...p, blocks: reletter(blocks) }
    })
  }

  // Block name picker. Picking Warm-Up turns that block into the warm-up
  // (moved to the top, the blocks below re-lettered); picking a letter on
  // the warm-up turns it back into a lifting block.
  function changeLabel(i: number, label: string) {
    setEditing(p => {
      if (!p) return p
      const wasWarmup = isWarmupLabel(p.blocks[i].block_label)
      const toWarmup = isWarmupLabel(label)
      if (toWarmup && !wasWarmup && p.blocks.some(b => isWarmupLabel(b.block_label))) return p
      const blocks = [...p.blocks]
      blocks[i] = { ...blocks[i], block_label: label, ...(toWarmup && !wasWarmup ? { sets: 1 } : {}) }
      return { ...p, blocks: toWarmup !== wasWarmup ? reletter(blocks) : blocks }
    })
  }

  function removeBlock(i: number) { setEditing(p => p ? { ...p, blocks: p.blocks.filter((_, idx) => idx !== i) } : p) }

  function updateBlock(i: number, field: keyof Block, val: unknown) {
    setEditing(p => {
      if (!p) return p
      const blocks = [...p.blocks]
      blocks[i] = { ...blocks[i], [field]: val }
      return { ...p, blocks }
    })
  }

  function addExerciseToBlock(blockIdx: number, ex: ExerciseLib) {
    setEditing(p => {
      if (!p) return p
      const blocks = [...p.blocks]
      const block = { ...blocks[blockIdx] }
      block.exercises = [...block.exercises, { exercise_id: ex.id, custom_reps: ex.default_reps ?? '', custom_notes: '', target_velocity_min: '', target_velocity_max: '', recommended_band: '', exercise: ex }]
      blocks[blockIdx] = block
      return { ...p, blocks }
    })
    setAddingTo(null); setExSearch('')
  }

  function removeExercise(blockIdx: number, exIdx: number) {
    setEditing(p => {
      if (!p) return p
      const blocks = [...p.blocks]
      const block = { ...blocks[blockIdx] }
      block.exercises = block.exercises.filter((_, i) => i !== exIdx)
      blocks[blockIdx] = block
      return { ...p, blocks }
    })
  }

  function updateExercise(blockIdx: number, exIdx: number, field: 'custom_reps' | 'custom_notes' | 'target_velocity_min' | 'target_velocity_max' | 'recommended_band', val: string) {
    setEditing(p => {
      if (!p) return p
      const blocks = [...p.blocks]
      const block = { ...blocks[blockIdx] }
      const exs = [...block.exercises]
      exs[exIdx] = { ...exs[exIdx], [field]: val }
      block.exercises = exs
      blocks[blockIdx] = block
      return { ...p, blocks }
    })
  }

  async function save() {
    if (!editing?.name) return
    const isCombine = FEATURES.measurements && editing.is_combine === true
    if (isCombine && editing.combine_metrics && editing.combine_metrics.length === 0) { setMsg('Pick at least one combine test.'); return }
    const badSpeed = editing.blocks.some(b => b.exercises.some(e => {
      const lo = parseFloat(e.target_velocity_min), hi = parseFloat(e.target_velocity_max)
      return lo > 0 && hi > 0 && hi <= lo
    }))
    if (badSpeed) { setMsg('Fix the target bar speed: max must be higher than min.'); return }
    setSaving(true)
    const method = editing.id ? 'PUT' : 'POST'
    // A Combine Day keeps only its warm-up (players enter test numbers instead of lifting)
    const blocks = warmupFirst(isCombine ? editing.blocks.filter(b => isWarmupLabel(b.block_label)) : editing.blocks)
    const res = await fetch('/api/coach/templates', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...editing, is_combine: isCombine, blocks }) })
    const data = await res.json()
    if (res.ok) {
      setTemplates(prev => editing.id ? prev.map(t => t.id === data.template.id ? data.template : t) : [...prev, data.template])
      setEditing(null); setMsg('Saved!')
      setTimeout(() => setMsg(''), 3000)
    } else setMsg(data.error)
    setSaving(false)
  }


  async function deleteTemplate(t: Template) {
    if (!t.id) return
    const res = await fetch('/api/coach/templates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id }),
    })
    if (res.ok) {
      setTemplates(prev => prev.filter(x => x.id !== t.id))
      setDeleteConfirm(null)
      setMsg('Template deleted.')
      setTimeout(() => setMsg(''), 3000)
    } else {
      const d = await res.json()
      setMsg(d.error ?? 'Delete failed')
      setDeleteConfirm(null)
    }
  }

  const filteredEx = exercises.filter(e => e.name.toLowerCase().includes(exSearch.toLowerCase()))

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <div className="wrap-phone" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800 }}>Workout Templates</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{templates.length} templates</p>
        </div>
        <button className="btn-volt" onClick={() => setEditing(blank())} style={{ padding: '0.625rem 1.25rem' }}>+ New Template</button>
      </div>

      {msg && <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', color: 'var(--success)', fontSize: '0.9rem' }}>{msg}</div>}

      {/* Editor — modal overlay */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem 1rem', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setEditing(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 680, padding: '1.75rem', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem' }}>{editing.id ? 'Edit Template' : 'New Template'}</h2>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>✕</button>
            </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Template Name *</label>
              <input className="input" placeholder="e.g. Pre-Tournament Strength" value={editing.name} onChange={e => setEditing(p => p ? { ...p, name: e.target.value } : p)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Phase Type</label>
              <select className="input" value={editing.phase_type} onChange={e => setEditing(p => p ? { ...p, phase_type: e.target.value } : p)}>
                {PHASE_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Description</label>
            <input className="input" placeholder="Brief description of this workout" value={editing.description} onChange={e => setEditing(p => p ? { ...p, description: e.target.value } : p)} />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Warm-Up Notes (optional)</label>
            <textarea className="input" rows={2} placeholder="e.g. 5 min row / bike, dynamic mobility…" value={editing.warmup_notes} onChange={e => setEditing(p => p ? { ...p, warmup_notes: e.target.value } : p)} style={{ resize: 'vertical' }} />
          </div>

          {/* Combine Day (volleyball only) */}
          {FEATURES.measurements && (() => {
            const picked = new Set<string>(editing.combine_metrics ?? COMBINE_KEYS)
            const nonePicked = !!editing.combine_metrics && editing.combine_metrics.length === 0
            const droppedBlocks = editing.blocks.filter(b => !isWarmupLabel(b.block_label) && b.exercises.length > 0).length
            return (
              <div className="card-raised" style={{ padding: '0.875rem 1rem', marginBottom: '1rem', borderLeft: editing.is_combine ? '3px solid var(--volt)' : undefined }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={editing.is_combine === true} onChange={e => setCombine(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--carolina)', flexShrink: 0 }} />
                  <span>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem' }}>Combine Day</span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Players enter their Volleyball Performance Index numbers on their phones instead of lifting.</span>
                  </span>
                </label>
                {editing.is_combine && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Tests in this combine</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {COMBINE_METRICS.map(m => {
                        const on = picked.has(m.key)
                        return (
                          <button key={m.key} type="button" onClick={() => toggleCombineMetric(m.key)}
                            style={{ padding: '0.35rem 0.7rem', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--carolina)' : 'var(--gray-border)'}`, background: on ? 'var(--carolina)' : 'transparent', color: on ? '#fff' : 'var(--text-secondary)' }}>
                            {on ? '✓ ' : ''}{m.label}
                          </button>
                        )
                      })}
                    </div>
                    {nonePicked && <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.4rem' }}>Pick at least one test.</p>}
                    {droppedBlocks > 0 && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '0.5rem', fontWeight: 600 }}>
                        The lifting blocks below will be removed when you save. The warm-up stays.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Warm-up section (players see the clips on their phones; TV shows names only) */}
          {!editing.blocks.some(b => isWarmupLabel(b.block_label)) && (
            <button className="btn-ghost" onClick={addWarmup} style={{ width: '100%', padding: '0.625rem', marginBottom: '0.75rem', fontSize: '0.9rem' }}>+ Add Warm-Up</button>
          )}

          {/* Blocks */}
          {editing.blocks.map((block, bi) => {
            const isWarmup = isWarmupLabel(block.block_label)
            if (FEATURES.measurements && editing.is_combine && !isWarmup) return null
            const hasWarmup = editing.blocks.some(b => isWarmupLabel(b.block_label))
            const canUp = !isWarmup && bi > 0 && !isWarmupLabel(editing.blocks[bi - 1].block_label)
            const canDown = !isWarmup && bi < editing.blocks.length - 1
            const arrow = (on: boolean): React.CSSProperties => ({ background: 'none', border: '1px solid var(--court-border)', borderRadius: 6, width: 30, height: 30, cursor: on ? 'pointer' : 'default', color: on ? 'var(--text-primary)' : 'var(--text-muted)', opacity: on ? 1 : 0.35, fontSize: '0.8rem', lineHeight: 1, flexShrink: 0 })
            return (
            <div key={bi} className="card-raised" style={{ padding: '1rem', marginBottom: '0.75rem', borderLeft: isWarmup ? '3px solid var(--carolina)' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: isWarmup ? '0.4rem' : '0.75rem' }}>
                <div style={{ background: isWarmup ? 'var(--carolina)' : 'var(--yellow)', color: '#0a0f0d', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {block.block_label.charAt(0)}
                </div>
                <select className="input" value={isWarmup ? WARMUP_LABEL : block.block_label} onChange={e => changeLabel(bi, e.target.value)} style={{ width: 140 }}>
                  {(isWarmup || !hasWarmup) && <option value={WARMUP_LABEL}>Warm-Up</option>}
                  {!isWarmup && !BLOCK_LABELS.includes(block.block_label) && <option value={block.block_label}>{block.block_label}</option>}
                  {BLOCK_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{isWarmup ? 'Rounds:' : 'Sets:'}</label>
                  <input type="number" className="input" min={1} max={10} value={block.sets} onChange={e => updateBlock(bi, 'sets', parseInt(e.target.value))} style={{ width: 60, textAlign: 'center' }} />
                </div>
                <div style={{ flex: 1 }} />
                {!isWarmup && (
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button onClick={() => moveBlock(bi, -1)} disabled={!canUp} title="Move block up" aria-label="Move block up" style={arrow(canUp)}>▲</button>
                    <button onClick={() => moveBlock(bi, 1)} disabled={!canDown} title="Move block down" aria-label="Move block down" style={arrow(canDown)}>▼</button>
                  </div>
                )}
                <button onClick={() => removeBlock(bi)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
              </div>
              {isWarmup && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Players see each exercise's video on their phones, with nothing to log. The TV shows the names only.
                </p>
              )}

              {/* Block exercises */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
                {block.exercises.map((be, ei) => {
                  const speedMin = parseFloat(be.target_velocity_min)
                  const speedMax = parseFloat(be.target_velocity_max)
                  const speedError = speedMin > 0 && speedMax > 0 && speedMax <= speedMin
                  return (
                  <div key={ei}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>{be.exercise?.name ?? 'Exercise'}</div>
                      <input className="input" placeholder={isWarmup ? 'Reps / time' : 'Reps'} value={be.custom_reps} onChange={e => updateExercise(bi, ei, 'custom_reps', e.target.value)} style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem', textAlign: 'center' }} />
                      <input className="input" placeholder="Custom note (optional)" value={be.custom_notes} onChange={e => updateExercise(bi, ei, 'custom_notes', e.target.value)} style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem' }} />
                      <button onClick={() => removeExercise(bi, ei)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                    </div>
                    {be.exercise?.logs_velocity && !isWarmup && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', paddingLeft: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target bar speed (m/s):</span>
                        <input className="input" type="number" step="0.01" min="0" placeholder="Min" value={be.target_velocity_min} onChange={e => updateExercise(bi, ei, 'target_velocity_min', e.target.value)} style={{ width: 80, fontSize: '0.8rem', padding: '0.35rem 0.5rem', textAlign: 'center' }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>to</span>
                        <input className="input" type="number" step="0.01" min="0" placeholder="Max" value={be.target_velocity_max} onChange={e => updateExercise(bi, ei, 'target_velocity_max', e.target.value)} style={{ width: 80, fontSize: '0.8rem', padding: '0.35rem 0.5rem', textAlign: 'center' }} />
                        <span style={{ fontSize: '0.72rem', color: speedError ? 'var(--danger)' : 'var(--text-muted)' }}>
                          {speedError ? 'Max must be higher than min' : 'Optional. Leave blank for a normal weight suggestion.'}
                        </span>
                      </div>
                    )}
                    {!isWarmup && be.exercise?.logs_weight && isBandEquipment(asEquipment(be.exercise?.equipment)) && (() => {
                      const choices = bandsFor(asEquipment(be.exercise?.equipment))
                      const picked = bandInfo(be.recommended_band)
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', paddingLeft: '0.75rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Recommended band:</span>
                          <span aria-hidden style={{ width: 14, height: 14, borderRadius: '50%', background: picked?.swatch ?? 'transparent', border: picked ? '1px solid rgba(0,0,0,0.25)' : '1.5px dashed var(--gray-border)', flexShrink: 0 }} />
                          <select className="input" value={choices.some(c => c.key === be.recommended_band) ? be.recommended_band : ''} onChange={e => updateExercise(bi, ei, 'recommended_band', e.target.value)}
                            style={{ width: 'auto', minWidth: 170, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}>
                            <option value="">No pick (player chooses)</option>
                            {choices.map(c => <option key={c.key} value={c.key}>{c.color} ({c.level.toLowerCase()})</option>)}
                          </select>
                        </div>
                      )
                    })()}
                  </div>
                  )
                })}
              </div>

              {/* Add exercise picker */}
              {addingTo === bi ? (
                <div style={{ background: 'var(--court-bg)', borderRadius: 8, padding: '0.75rem', border: '1px solid var(--court-border)' }}>
                  <input className="input" autoFocus placeholder="Search exercises…" value={exSearch} onChange={e => setExSearch(e.target.value)} style={{ marginBottom: '0.5rem' }} />
                  <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {filteredEx.slice(0, 20).map(ex => (
                      <button key={ex.id} onClick={() => addExerciseToBlock(bi, ex)}
                        style={{ background: 'var(--court-surface)', border: '1px solid var(--court-border)', borderRadius: 6, padding: '0.4rem 0.75rem', cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{ex.name}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ex.category}</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { setAddingTo(null); setExSearch('') }} style={{ marginTop: '0.5rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                </div>
              ) : (
                <button className="btn-ghost" onClick={() => { setAddingTo(bi); setExSearch('') }} style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', width: '100%' }}>+ Add Exercise</button>
              )}
            </div>
            )
          })}

          {FEATURES.measurements && editing.is_combine
            ? <div style={{ marginBottom: '1.25rem' }} />
            : <button className="btn-ghost" onClick={addBlock} style={{ width: '100%', padding: '0.625rem', marginBottom: '1.25rem', fontSize: '0.9rem' }}>+ Add Block</button>}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-ghost" onClick={() => setEditing(null)} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
            <button className="btn-volt" onClick={save} disabled={saving || !editing.name} style={{ flex: 2, padding: '0.75rem' }}>{saving ? 'Saving…' : 'Save Template'}</button>
          </div>
          </div>
        </div>
      )}

      {/* Template list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {templates.length === 0 && !editing && (
          <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No templates yet. Create your first one above.</div>
        )}
        {templates.map(t => {
          const phaseConfig = t.phase_type ? PHASE_CONFIG[t.phase_type as PhaseType] : null
          return (
            <div key={t.id} className="card" style={{ padding: '1.1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                  {phaseConfig && <span style={{ fontSize: '0.7rem', color: phaseConfig.color, background: `${phaseConfig.color}20`, padding: '0.15rem 0.5rem', borderRadius: 4, fontWeight: 600 }}>{phaseConfig.label}</span>}
                  {FEATURES.measurements && t.is_combine && <span style={{ fontSize: '0.7rem', color: 'var(--carolina-dark)', background: 'var(--carolina-light)', border: '1px solid var(--carolina-border)', padding: '0.1rem 0.5rem', borderRadius: 4, fontWeight: 700 }}>Combine Day</span>}
                </div>
                {t.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.description}</div>}
              </div>
              <button onClick={() => setDeleteConfirm(t)} style={{ padding: '0.4rem 0.875rem', fontSize: '0.85rem', flexShrink: 0, background: 'none', border: '1.5px solid rgba(248,113,113,0.4)', borderRadius: 8, color: '#f87171', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
              <button onClick={() => {
                fetch(`/api/coach/templates?id=${t.id}`).then(r => r.json()).then(d => {
                  const tmpl = d.template
                  if (!tmpl) { alert('Could not load template — try again'); return }
                  const mapped = {
                    ...tmpl,
                    blocks: warmupFirst((tmpl.blocks ?? []).map((b: { block_label: string; sets: number; exercises: Array<{ exercise_id: string; custom_reps?: string; custom_notes?: string; target_velocity_min?: number | null; target_velocity_max?: number | null; recommended_band?: string | null; exercise?: ExerciseLib; exercise_library?: ExerciseLib }> }) => ({
                      ...b,
                      exercises: (b.exercises ?? []).map(e => ({
                        exercise_id: e.exercise_id,
                        custom_reps: e.custom_reps ?? '',
                        custom_notes: e.custom_notes ?? '',
                        target_velocity_min: e.target_velocity_min != null ? String(e.target_velocity_min) : '',
                        target_velocity_max: e.target_velocity_max != null ? String(e.target_velocity_max) : '',
                        recommended_band: e.recommended_band ?? '',
                        exercise: e.exercise_library ?? e.exercise,
                      }))
                    })))
                  }
                  setEditing(mapped)
                  // Scroll to editor
                  setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50)
                }).catch(err => { console.error('Edit load error:', err); alert('Error loading template') })
              }} className="btn-ghost" style={{ padding: '0.4rem 0.875rem', fontSize: '0.85rem', flexShrink: 0 }}>Edit</button>
            </div>
          )
        })}
      </div>

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: '1.75rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Delete "{deleteConfirm.name}"?</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
              This will permanently remove the template and all its blocks. Any schedule entries that used this template will remain but lose their template reference.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-ghost" onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
              <button onClick={() => deleteTemplate(deleteConfirm)} style={{ flex: 1, padding: '0.75rem', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
