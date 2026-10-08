// FILE: app/coach/exercises/page.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { EQUIPMENT_OPTIONS, asEquipment } from '@/lib/loads'
import { FEATURES } from '@/lib/features'
import ExerciseImport from '@/components/ExerciseImport'

const CATEGORIES = [
  'Upper - Push',
  'Upper - Pull',
  'Lower - Quad',
  'Lower - Hamstring',
  'Lower - Hip/Glute',
  'Core',
  'Power',
  'Conditioning',
  'Mobility',
  'Other',
]

const CATEGORY_GROUPS = [
  { label: 'Upper Body', categories: ['Upper - Push', 'Upper - Pull'] },
  { label: 'Lower Body', categories: ['Lower - Quad', 'Lower - Hamstring', 'Lower - Hip/Glute'] },
  { label: 'Other', categories: ['Core', 'Power', 'Conditioning', 'Mobility', 'Other'] },
]

interface Exercise {
  id: string
  name: string
  category: string
  default_sets?: number
  default_reps?: string
  coaching_notes?: string
  demo_url?: string
  demo_image_url?: string
  start_image_url?: string
  end_image_url?: string
  start_image_position?: string
  end_image_position?: string
  logs_weight: boolean
  logs_velocity: boolean
  equipment?: string | null
}

const BLANK = {
  name: '', category: 'Upper - Push', default_sets: 3, default_reps: '8',
  coaching_notes: '', demo_url: '', logs_weight: true, logs_velocity: false,
  equipment: '' as string,   // '' = not set yet
}

function equipmentLabel(value: string | null | undefined): string {
  return EQUIPMENT_OPTIONS.find(o => o.value === value)?.label ?? ''
}

export default function ExercisesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState<'add' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<Exercise | null>(null)
  const [form, setForm]           = useState<typeof BLANK & { demo_url?: string }>(BLANK)
  const [filterCat, setFilterCat] = useState('all')
  const [search, setSearch]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<Exercise | null>(null)
  const [onlyMissingEquipment, setOnlyMissingEquipment] = useState(false)

  // Photo upload state
  const [startImg, setStartImg]           = useState<File | null>(null)
  const [endImg, setEndImg]               = useState<File | null>(null)
  const [startPreview, setStartPreview]   = useState('')
  const [endPreview, setEndPreview]       = useState('')
  const [startPos, setStartPos]           = useState('50% 50%')
  const [endPos, setEndPos]               = useState('50% 50%')
  const [uploadingStart, setUploadingStart] = useState(false)
  const [uploadingEnd, setUploadingEnd]     = useState(false)
  const startRef = useRef<HTMLInputElement>(null)
  const endRef   = useRef<HTMLInputElement>(null)

  function loadExercises() {
    fetch('/api/coach/exercises').then(r => r.json()).then(d => {
      setExercises(d.exercises ?? [])
      setLoading(false)
    })
  }
  useEffect(() => { loadExercises() }, [])

  function openAdd() {
    setForm(BLANK); setEditTarget(null)
    setStartImg(null); setEndImg(null); setStartPreview(''); setEndPreview('')
    setStartPos('50% 50%'); setEndPos('50% 50%')
    setModal('add'); setMsg('')
  }

  function openEdit(ex: Exercise) {
    setForm({
      name: ex.name, category: ex.category,
      default_sets: ex.default_sets ?? 3, default_reps: ex.default_reps ?? '8',
      coaching_notes: ex.coaching_notes ?? '', demo_url: ex.demo_url ?? '',
      logs_weight: ex.logs_weight, logs_velocity: ex.logs_velocity,
      equipment: ex.equipment ?? '',
    })
    setStartImg(null); setEndImg(null)
    setStartPreview(ex.start_image_url ?? ex.demo_image_url ?? '')
    setEndPreview(ex.end_image_url ?? '')
    setStartPos(ex.start_image_position ?? '50% 50%')
    setEndPos(ex.end_image_position ?? '50% 50%')
    setEditTarget(ex); setModal('edit'); setMsg('')
  }

  function closeModal() { setModal(null); setEditTarget(null); setMsg('') }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>, which: 'start' | 'end') {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    if (which === 'start') { setStartImg(file); setStartPreview(url) }
    else { setEndImg(file); setEndPreview(url) }
  }

  async function resizeImage(file: File, maxSize = 1800): Promise<Blob> {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const { width, height } = img
        const scale = Math.min(1, maxSize / Math.max(width, height))
        const w = Math.round(width * scale)
        const h = Math.round(height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, w, h)
        canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.92)
      }
      img.src = url
    })
  }

  // Photos go through the server (app/api/coach/exercise-media/route.ts),
  // so the browser never needs a Supabase key.
  async function uploadPhoto(file: File, exerciseId: string, which: 'start' | 'end'): Promise<string | null> {
    const blob = await resizeImage(file, 1800)
    const body = new FormData()
    body.append('file', blob, `${which}.jpg`)
    body.append('exerciseId', exerciseId)
    body.append('which', which)
    const res = await fetch('/api/coach/exercise-media', { method: 'POST', body })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.url) { console.error('Upload error:', data.error ?? res.status); return null }
    return data.url as string
  }

  async function save() {
    if (!form.name) { setMsg('Name is required'); return }
    setSaving(true); setMsg('')

    try {
      const method = modal === 'add' ? 'POST' : 'PUT'
      const body = modal === 'edit' && editTarget ? { id: editTarget.id, ...form } : form
      const res  = await fetch('/api/coach/exercises', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error || 'Error saving'); setSaving(false); return }

      const exerciseId = data.exercise?.id ?? editTarget?.id
      let startUrl = editTarget?.start_image_url ?? editTarget?.demo_image_url ?? ''
      let endUrl   = editTarget?.end_image_url ?? ''

      if (startImg && exerciseId) {
        setUploadingStart(true)
        const url = await uploadPhoto(startImg, exerciseId, 'start')
        if (url) startUrl = url
        else alert('Start photo upload failed. Try again, or use a smaller photo.')
        setUploadingStart(false)
      }
      if (endImg && exerciseId) {
        setUploadingEnd(true)
        const url = await uploadPhoto(endImg, exerciseId, 'end')
        if (url) endUrl = url
        else alert('End photo upload failed. Try again, or use a smaller photo.')
        setUploadingEnd(false)
      }

      if ((startImg || endImg) && exerciseId) {
        await fetch('/api/coach/exercises', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: exerciseId, start_image_url: startUrl, end_image_url: endUrl, demo_image_url: startUrl || '', start_image_position: startPos, end_image_position: endPos }),
        })
      }

      const updated: Exercise = {
        ...data.exercise,
        start_image_url: startUrl,
        end_image_url:   endUrl,
        demo_image_url:  startUrl || data.exercise?.demo_image_url || '',
      }

      if (modal === 'add') setExercises(prev => [...prev, updated])
      else setExercises(prev => prev.map(e => e.id === exerciseId ? { ...e, ...updated } : e))

      closeModal()
    } catch (e) {
      setMsg('Unexpected error — check console')
      console.error(e)
    }
    setSaving(false)
  }

  async function deleteExercise() {
    if (!deleteConfirm) return
    await fetch('/api/coach/exercises', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteConfirm.id }) })
    setExercises(prev => prev.filter(e => e.id !== deleteConfirm.id))
    setDeleteConfirm(null)
  }

  const filtered = exercises.filter(e => {
    const matchCat    = filterCat === 'all' || e.category === filterCat
    if (onlyMissingEquipment && !(e.logs_weight && !e.equipment)) return false
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const grouped = CATEGORIES.reduce<Record<string, Exercise[]>>((acc, cat) => {
    const items = filtered.filter(e => e.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  const Label = ({ children }: { children: React.ReactNode }) => (
    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', fontWeight: 600 }}>{children}</label>
  )

  const PhotoUpload = ({ which, preview, uploading, inputRef, pos, onPosChange }: {
    which: 'start' | 'end'; preview: string; uploading: boolean
    inputRef: React.RefObject<HTMLInputElement | null>; pos: string; onPosChange: (p: string) => void
  }) => {
    function handleClick(e: React.MouseEvent<HTMLDivElement>) {
      if (!preview) { inputRef.current?.click(); return }
      const rect = e.currentTarget.getBoundingClientRect()
      const x = Math.round(((e.clientX - rect.left) / rect.width) * 100)
      const y = Math.round(((e.clientY - rect.top) / rect.height) * 100)
      onPosChange(`${x}% ${y}%`)
    }
    return (
      <div>
        <Label>{which === 'start' ? 'Start Position Photo' : 'End Position Photo'}</Label>
        <div onClick={handleClick}
          style={{ width: '100%', aspectRatio: '1/1', borderRadius: 10, overflow: 'hidden', border: `2px dashed ${preview ? 'var(--carolina)' : 'var(--gray-border)'}`, cursor: preview ? 'crosshair' : 'pointer', position: 'relative', background: 'var(--carolina-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color 0.15s' }}>
          {preview ? (
            <img src={preview} alt={which} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos, display: 'block', pointerEvents: 'none' }} />
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>📷</div>
              <div style={{ fontSize: '0.75rem', fontWeight: 500 }}>Tap to add photo</div>
              <div style={{ fontSize: '0.65rem', marginTop: '0.2rem' }}>from camera or files</div>
            </div>
          )}
          {preview && (() => {
            const [px, py] = pos.split(' ').map(p => parseFloat(p))
            return <div style={{ position: 'absolute', width: 18, height: 18, borderRadius: '50%', border: '2.5px solid white', boxShadow: '0 0 0 1.5px var(--carolina)', pointerEvents: 'none', left: `${px}%`, top: `${py}%`, transform: 'translate(-50%,-50%)', transition: 'left 0.1s, top 0.1s' }} />
          })()}
          {uploading && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(86,160,211,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: '0.85rem' }}>Uploading…</div>
          )}
          {preview && !uploading && (
            <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
              <div style={{ background: 'rgba(0,0,0,0.55)', borderRadius: 5, padding: '0.15rem 0.4rem', fontSize: '0.6rem', color: 'rgba(255,255,255,0.7)' }}>Tap to reframe</div>
              <button onClick={e => { e.stopPropagation(); inputRef.current?.click() }} style={{ background: 'var(--carolina)', border: 'none', borderRadius: 5, padding: '0.15rem 0.4rem', fontSize: '0.6rem', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Change</button>
            </div>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => pickFile(e, which)} />
      </div>
    )
  }

  // Quick equipment setting straight from the list
  async function setEquipmentInline(ex: Exercise, value: string) {
    const equipment = asEquipment(value)
    setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, equipment } : e))
    const res = await fetch('/api/coach/exercises', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ex.id, equipment }),
    })
    if (!res.ok) {
      setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, equipment: ex.equipment ?? null } : e))
      alert('Could not save equipment for ' + ex.name)
    }
  }

  const missingEquipmentCount = exercises.filter(e => e.logs_weight && !e.equipment).length

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800 }}>Exercise Library</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{exercises.length} exercises</p>
          {missingEquipmentCount > 0 && (
            <button onClick={() => setOnlyMissingEquipment(v => !v)}
              style={{ marginTop: '0.375rem', padding: '0.25rem 0.75rem', borderRadius: 20, border: '1.5px solid #f59e0b', background: onlyMissingEquipment ? '#f59e0b' : 'rgba(245,158,11,0.1)', color: onlyMissingEquipment ? '#111827' : '#b45309', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
              {onlyMissingEquipment ? 'Showing' : 'Show'} {missingEquipmentCount} weighted exercise{missingEquipmentCount === 1 ? '' : 's'} with no equipment set
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <ExerciseImport onDone={loadExercises} />
          <button className="btn-volt" onClick={openAdd} style={{ padding: '0.625rem 1.25rem' }}>+ Add Exercise</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input className="input" placeholder="Search exercises…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          <button onClick={() => setFilterCat('all')} style={{ padding: '0.35rem 0.875rem', borderRadius: 20, border: `1.5px solid ${filterCat === 'all' ? 'var(--carolina)' : 'var(--gray-border)'}`, background: filterCat === 'all' ? 'var(--carolina)' : 'transparent', color: filterCat === 'all' ? '#fff' : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>All</button>
          {CATEGORY_GROUPS.map(g => (
            <details key={g.label} style={{ position: 'relative' }}>
              <summary style={{ padding: '0.35rem 0.875rem', borderRadius: 20, border: `1.5px solid ${g.categories.includes(filterCat) ? 'var(--carolina)' : 'var(--gray-border)'}`, background: g.categories.includes(filterCat) ? 'var(--carolina-light)' : 'transparent', color: g.categories.includes(filterCat) ? 'var(--carolina-dark)' : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', listStyle: 'none', userSelect: 'none' }}>{g.label} ▾</summary>
              <div style={{ position: 'absolute', top: '110%', left: 0, background: 'var(--white)', border: '1.5px solid var(--gray-border)', borderRadius: 10, padding: '0.375rem', zIndex: 20, minWidth: 160, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
                {g.categories.map(c => (
                  <button key={c} onClick={() => setFilterCat(c)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.75rem', borderRadius: 6, border: 'none', background: filterCat === c ? 'var(--carolina-light)' : 'transparent', color: filterCat === c ? 'var(--carolina-dark)' : 'var(--text-primary)', fontSize: '0.82rem', cursor: 'pointer', fontWeight: filterCat === c ? 600 : 400 }}>{c}</button>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>

      {/* Exercise groups */}
      {Object.entries(grouped).map(([cat, exs]) => (
        <div key={cat} style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--carolina-dark)', marginBottom: '0.5rem', paddingBottom: '0.375rem', borderBottom: '2px solid var(--carolina-border)' }}>{cat}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.625rem' }}>
            {exs.map(ex => (
              <div key={ex.id} className="card" style={{ padding: '0.875rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                  {(ex.start_image_url || ex.demo_image_url) ? (
                    <img src={ex.start_image_url || ex.demo_image_url} alt="start" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6 }} />
                  ) : (
                    <div style={{ width: 52, height: 52, borderRadius: 6, background: 'var(--carolina-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '1.3rem' }}>💪</div>
                  )}
                  {ex.end_image_url && (
                    <img src={ex.end_image_url} alt="end" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6 }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.2rem' }}>{ex.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>
                    {ex.default_sets}×{ex.default_reps}
                    {ex.logs_weight && (ex.equipment ? ` · ${equipmentLabel(ex.equipment)}` : ' · weight')}
                    {FEATURES.vbt && ex.logs_velocity && <span style={{ color: 'var(--carolina)', fontWeight: 600 }}> · ⚡ bar speed</span>}
                  </div>
                  {ex.logs_weight && !ex.equipment && (
                    <select value="" onChange={e => setEquipmentInline(ex, e.target.value)}
                      style={{ marginBottom: '0.375rem', fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: 6, border: '1.5px solid #f59e0b', background: 'rgba(245,158,11,0.08)', color: '#b45309', fontWeight: 600, cursor: 'pointer' }}>
                      <option value="" disabled>Set equipment…</option>
                      {EQUIPMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  {ex.coaching_notes && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{ex.coaching_notes}</div>}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button onClick={() => openEdit(ex)} style={{ background: 'none', border: 'none', color: 'var(--carolina-dark)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, padding: 0 }}>Edit</button>
                    <span style={{ color: 'var(--gray-border)' }}>|</span>
                    <button onClick={() => setDeleteConfirm(ex)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, padding: 0 }}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No exercises found.</div>}

      {/* Add/Edit Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 50, padding: '1rem', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="card" style={{ width: '100%', maxWidth: 560, padding: '1.75rem', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem' }}>{modal === 'add' ? 'Add Exercise' : `Edit — ${editTarget?.name}`}</h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>✕</button>
            </div>
            {msg && <div style={{ background: 'var(--danger-light)', border: '1.5px solid #fecaca', borderRadius: 8, padding: '0.625rem', marginBottom: '1rem', color: 'var(--danger)', fontSize: '0.85rem' }}>{msg}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1rem' }}>
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Exercise Name *</Label>
                <input className="input" placeholder="e.g. Back Squat" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Category</Label>
                <select className="input" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {CATEGORY_GROUPS.map(g => (
                    <optgroup key={g.label} label={g.label}>
                      {g.categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <Label>Default Sets</Label>
                <input className="input" type="number" min="1" max="10" value={form.default_sets} onChange={e => setForm(p => ({ ...p, default_sets: parseInt(e.target.value) }))} />
              </div>
              <div>
                <Label>Default Reps</Label>
                <input className="input" placeholder="e.g. 8 or 6-8" value={form.default_reps} onChange={e => setForm(p => ({ ...p, default_reps: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Coaching Notes</Label>
                <textarea className="input" rows={2} placeholder="Cues, technique notes…" value={form.coaching_notes} onChange={e => setForm(p => ({ ...p, coaching_notes: e.target.value }))} style={{ resize: 'vertical' }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Demo Video URL (optional)</Label>
                <input className="input" placeholder="https://youtube.com/..." value={form.demo_url} onChange={e => setForm(p => ({ ...p, demo_url: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: '1rem', gridColumn: '1/-1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
                  <input type="checkbox" checked={form.logs_weight} onChange={e => setForm(p => ({ ...p, logs_weight: e.target.checked }))} />
                  Log weight
                </label>
                {FEATURES.vbt && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
                    <input type="checkbox" checked={form.logs_velocity} onChange={e => setForm(p => ({ ...p, logs_velocity: e.target.checked }))} />
                    Log velocity
                  </label>
                )}
              </div>
              {form.logs_weight && (
                <div style={{ gridColumn: '1/-1' }}>
                  <Label>Equipment</Label>
                  <select className="input" value={form.equipment} onChange={e => setForm(p => ({ ...p, equipment: e.target.value }))}>
                    <option value="">Not set</option>
                    {EQUIPMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}: {o.hint}</option>)}
                  </select>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.35rem 0 0' }}>
                    Dumbbell exercises: players enter the number on the dumbbell and suggestions are given the same way (5–50 by 5s). With 2 dumbbells, pounds moved count both. Barbell suggestions are always loadable on a 45 lb bar.
                  </p>
                </div>
              )}
              {FEATURES.vbt && form.logs_velocity && (
                <p style={{ gridColumn: '1/-1', fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                  Players can enter bar speed for this exercise, you can run VBT tests on it from a player&apos;s page, and you can set a target speed when adding it to a workout.
                </p>
              )}
            </div>

            {/* Photos */}
            <div style={{ borderTop: '1.5px solid var(--gray-border)', paddingTop: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--carolina-deep)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: '0.75rem' }}>Exercise Photos</div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.875rem' }}>Add a start and end position photo. Tap a square to take a photo or choose from your camera roll.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                <PhotoUpload which="start" preview={startPreview} uploading={uploadingStart} inputRef={startRef} pos={startPos} onPosChange={setStartPos} />
                <PhotoUpload which="end" preview={endPreview} uploading={uploadingEnd} inputRef={endRef} pos={endPos} onPosChange={setEndPos} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-ghost" onClick={closeModal} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
              <button className="btn-volt" onClick={save} disabled={saving || uploadingStart || uploadingEnd || !form.name} style={{ flex: 2, padding: '0.75rem' }}>
                {saving || uploadingStart || uploadingEnd ? 'Saving…' : modal === 'add' ? 'Add Exercise' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 400, padding: '1.75rem', textAlign: 'center' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>Delete {deleteConfirm.name}?</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>This will remove it from the library. Existing workout logs are preserved.</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-ghost" onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
              <button onClick={deleteExercise} style={{ flex: 1, padding: '0.75rem', background: 'var(--danger)', color: 'var(--white)', border: 'none', borderRadius: 8, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
