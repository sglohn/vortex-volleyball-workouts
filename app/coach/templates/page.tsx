'use client'
import { useState, useEffect } from 'react'
import { PHASE_CONFIG, PhaseType } from '@/lib/types'

interface ExerciseLib { id: string; name: string; category?: string; default_sets: number; default_reps?: string; logs_weight: boolean }
interface BlockExercise { exercise_id: string; custom_reps: string; custom_notes: string; exercise?: ExerciseLib }
interface Block { block_label: string; sets: number; exercises: BlockExercise[] }
interface Template { id?: string; name: string; description: string; phase_type: string; warmup_notes: string; blocks: Block[] }

const PHASE_TYPES = Object.entries(PHASE_CONFIG).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))
const BLOCK_LABELS = ['A','B','C','D','E','F','Finisher','Warmup Circuit']

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [exercises, setExercises] = useState<ExerciseLib[]>([])
  const [editing, setEditing] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [exSearch, setExSearch] = useState('')
  const [addingTo, setAddingTo] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/coach/templates').then(r => r.json()),
      fetch('/api/coach/exercises').then(r => r.json()),
    ]).then(([t, e]) => { setTemplates(t.templates ?? []); setExercises(e.exercises ?? []); setLoading(false) })
  }, [])

  const blank = (): Template => ({ name: '', description: '', phase_type: 'general', warmup_notes: '', blocks: [{ block_label: 'A', sets: 3, exercises: [] }] })

  function addBlock() {
    setEditing(p => {
      if (!p) return p
      const used = new Set(p.blocks.map(b => b.block_label))
      const next = BLOCK_LABELS.find(l => !used.has(l)) ?? `Block ${p.blocks.length + 1}`
      return { ...p, blocks: [...p.blocks, { block_label: next, sets: 3, exercises: [] }] }
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
      block.exercises = [...block.exercises, { exercise_id: ex.id, custom_reps: ex.default_reps ?? '', custom_notes: '', exercise: ex }]
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

  function updateExercise(blockIdx: number, exIdx: number, field: 'custom_reps' | 'custom_notes', val: string) {
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
    setSaving(true)
    const method = editing.id ? 'PUT' : 'POST'
    const res = await fetch('/api/coach/templates', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) })
    const data = await res.json()
    if (res.ok) {
      setTemplates(prev => editing.id ? prev.map(t => t.id === data.template.id ? data.template : t) : [...prev, data.template])
      setEditing(null); setMsg('Saved!')
      setTimeout(() => setMsg(''), 3000)
    } else setMsg(data.error)
    setSaving(false)
  }

  const filteredEx = exercises.filter(e => e.name.toLowerCase().includes(exSearch.toLowerCase()))

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800 }}>Workout Templates</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{templates.length} templates</p>
        </div>
        <button className="btn-volt" onClick={() => setEditing(blank())} style={{ padding: '0.625rem 1.25rem' }}>+ New Template</button>
      </div>

      {msg && <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', color: 'var(--volt)', fontSize: '0.9rem' }}>{msg}</div>}

      {/* Editor */}
      {editing && (
        <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '1.25rem', fontSize: '1.1rem' }}>{editing.id ? 'Edit Template' : 'New Template'}</h2>

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

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Warmup Notes</label>
            <textarea className="input" rows={2} placeholder="e.g. 5 min row / bike, dynamic mobility…" value={editing.warmup_notes} onChange={e => setEditing(p => p ? { ...p, warmup_notes: e.target.value } : p)} style={{ resize: 'vertical' }} />
          </div>

          {/* Blocks */}
          {editing.blocks.map((block, bi) => (
            <div key={bi} className="card-raised" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div style={{ background: 'var(--volt)', color: '#0a0f0d', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {block.block_label.charAt(0)}
                </div>
                <select className="input" value={block.block_label} onChange={e => updateBlock(bi, 'block_label', e.target.value)} style={{ width: 140 }}>
                  {BLOCK_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Sets:</label>
                  <input type="number" className="input" min={1} max={10} value={block.sets} onChange={e => updateBlock(bi, 'sets', parseInt(e.target.value))} style={{ width: 60, textAlign: 'center' }} />
                </div>
                <div style={{ flex: 1 }} />
                <button onClick={() => removeBlock(bi)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
              </div>

              {/* Block exercises */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
                {block.exercises.map((be, ei) => (
                  <div key={ei} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>{be.exercise?.name ?? 'Exercise'}</div>
                    <input className="input" placeholder="Reps" value={be.custom_reps} onChange={e => updateExercise(bi, ei, 'custom_reps', e.target.value)} style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem', textAlign: 'center' }} />
                    <input className="input" placeholder="Custom note (optional)" value={be.custom_notes} onChange={e => updateExercise(bi, ei, 'custom_notes', e.target.value)} style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem' }} />
                    <button onClick={() => removeExercise(bi, ei)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                  </div>
                ))}
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
          ))}

          <button className="btn-ghost" onClick={addBlock} style={{ width: '100%', padding: '0.625rem', marginBottom: '1.25rem', fontSize: '0.9rem' }}>+ Add Block</button>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-ghost" onClick={() => setEditing(null)} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
            <button className="btn-volt" onClick={save} disabled={saving || !editing.name} style={{ flex: 2, padding: '0.75rem' }}>{saving ? 'Saving…' : 'Save Template'}</button>
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
                </div>
                {t.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.description}</div>}
              </div>
              <button onClick={() => {
                fetch(`/api/coach/templates?id=${t.id}`).then(r => r.json()).then(d => {
                  const tmpl = d.template
                  // Map exercise_library nested object to exercise field the editor expects
                  const mapped = {
                    ...tmpl,
                    blocks: (tmpl.blocks ?? []).map((b: Block & { exercises: Array<BlockExercise & { exercise_library?: ExerciseLib }> }) => ({
                      ...b,
                      exercises: (b.exercises ?? []).map(e => ({
                        exercise_id: e.exercise_id,
                        custom_reps: e.custom_reps ?? '',
                        custom_notes: e.custom_notes ?? '',
                        exercise: e.exercise_library ?? e.exercise,
                      }))
                    }))
                  }
                  setEditing(mapped)
                })
              }} className="btn-ghost" style={{ padding: '0.4rem 0.875rem', fontSize: '0.85rem', flexShrink: 0 }}>Edit</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
