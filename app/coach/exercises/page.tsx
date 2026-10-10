// FILE: app/coach/exercises/page.tsx
//
// Demo clips: an exercise can have a short looping clip (components/ClipPicker.tsx
// on this form). Players and the TV see the clip instead of the start/finish
// photos; the photos are kept. The clip goes straight from the browser to
// Supabase with a one-time upload link (app/api/coach/exercise-clip/route.ts),
// and its still picture goes through app/api/coach/exercise-media/route.ts.
//
// Easier & harder versions (lib/exerciseLevels.ts): exercises that are
// versions of one movement share a family name and a level (1 = easiest),
// e.g. Bulgarian Split Squat: 1 Bodyweight → 2 Dumbbell → 3 Barbell. Each is
// still its own exercise. An exercise can also name a recommended backup.
// These are what the coach picks from when approving a player's change
// request, and what self-guided players are offered first when sore.
'use client'
import { useState, useEffect, useRef } from 'react'
import { EQUIPMENT_OPTIONS, asEquipment } from '@/lib/loads'
import { FEATURES } from '@/lib/features'
import ExerciseImport from '@/components/ExerciseImport'
import ClipPicker, { type PickedClip } from '@/components/ClipPicker'
import { FULL_BODY_AREAS, SELF_GUIDED_ROLE_COLUMNS, roleTag } from '@/lib/fullBodyWorkout'
import { familyKey, familyOf } from '@/lib/exerciseLevels'

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
  clip_url?: string | null
  clip_poster_url?: string | null
  logs_weight: boolean
  logs_velocity: boolean
  equipment?: string | null
  self_guided_roles?: string[] | null
  variation_family?: string | null
  variation_level?: number | null
  backup_exercise_id?: string | null
}

const BLANK = {
  name: '', category: 'Upper - Push', default_sets: 3, default_reps: '8',
  coaching_notes: '', demo_url: '', logs_weight: true, logs_velocity: false,
  equipment: '' as string,   // '' = not set yet
  self_guided_roles: [] as string[],   // self-guided workout spots (lib/fullBodyWorkout.ts)
  variation_family: '',                // easier/harder family (lib/exerciseLevels.ts)
  variation_level: '' as string,       // '' = not set; 1 = easiest
  backup_exercise_id: '',              // recommended backup exercise
}

// Short label for a tag, e.g. 'quad_main' → 'A Quad · Main'
function roleTagLabel(tag: string): string {
  const [area, role] = tag.split('_')
  const a = FULL_BODY_AREAS.find(x => x.area === area)
  const r = SELF_GUIDED_ROLE_COLUMNS.find(x => x.role === role)
  return a && r ? `${a.label} ${a.title} · ${r.label}` : tag
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
  const [showFamilies, setShowFamilies] = useState(false)

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

  // Demo clip state
  const [newClip, setNewClip]             = useState<PickedClip | null>(null)
  const [clipRemoved, setClipRemoved]     = useState(false)
  const [uploadingClip, setUploadingClip] = useState(false)

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
    setNewClip(null); setClipRemoved(false)
    setModal('add'); setMsg('')
  }

  function openEdit(ex: Exercise) {
    setForm({
      name: ex.name, category: ex.category,
      default_sets: ex.default_sets ?? 3, default_reps: ex.default_reps ?? '8',
      coaching_notes: ex.coaching_notes ?? '', demo_url: ex.demo_url ?? '',
      logs_weight: ex.logs_weight, logs_velocity: ex.logs_velocity,
      equipment: ex.equipment ?? '',
      self_guided_roles: ex.self_guided_roles ?? [],
      variation_family: ex.variation_family ?? '',
      variation_level: ex.variation_level ? String(ex.variation_level) : '',
      backup_exercise_id: ex.backup_exercise_id ?? '',
    })
    setStartImg(null); setEndImg(null)
    setStartPreview(ex.start_image_url ?? ex.demo_image_url ?? '')
    setEndPreview(ex.end_image_url ?? '')
    setStartPos(ex.start_image_position ?? '50% 50%')
    setEndPos(ex.end_image_position ?? '50% 50%')
    setNewClip(null); setClipRemoved(false)
    setEditTarget(ex); setModal('edit'); setMsg('')
  }

  function closeModal() { setModal(null); setEditTarget(null); setMsg(''); setNewClip(null); setClipRemoved(false) }

  // Clip shown in the form: a newly picked one, else the saved one (unless removed)
  const clipPreview = newClip?.previewUrl ?? (clipRemoved ? '' : editTarget?.clip_url ?? '')
  const clipPosterPreview = newClip?.posterUrl ?? (clipRemoved ? '' : editTarget?.clip_poster_url ?? '')

  // Uploads the clip straight to Supabase, then its still picture.
  // Returns the two public URLs, or null if something failed.
  async function uploadClip(clip: PickedClip, exerciseId: string): Promise<{ clipUrl: string; posterUrl: string } | null> {
    const linkRes = await fetch('/api/coach/exercise-clip', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseId, contentType: clip.contentType }),
    })
    const link = await linkRes.json().catch(() => ({}))
    if (!linkRes.ok || !link.uploadUrl) { console.error('Clip link error:', link.error ?? linkRes.status); return null }

    const put = await fetch(link.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': clip.contentType, 'cache-control': 'max-age=31536000', 'x-upsert': 'false' },
      body: clip.file,
    })
    if (!put.ok) { console.error('Clip upload error:', put.status, await put.text().catch(() => '')); return null }

    const body = new FormData()
    body.append('file', clip.poster, 'poster.jpg')
    body.append('exerciseId', exerciseId)
    body.append('which', 'poster')
    const res = await fetch('/api/coach/exercise-media', { method: 'POST', body })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.url) { console.error('Clip picture error:', data.error ?? res.status); return null }

    return { clipUrl: link.publicUrl as string, posterUrl: data.url as string }
  }

  // Removes old clip files from storage (failures are ignored)
  async function deleteClipFiles(exerciseId: string, urls: (string | null | undefined)[]) {
    for (const url of urls) {
      if (!url) continue
      await fetch('/api/coach/exercise-clip', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId, url }),
      }).catch(() => {})
    }
  }

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
      // Level fields are only sent when used, so saving still works before
      // the levels migration has been run
      const { variation_family, variation_level, backup_exercise_id, ...rest } = form
      const usesLevels = !!(variation_family.trim() || backup_exercise_id || editTarget?.variation_family || editTarget?.backup_exercise_id)
      const fields = usesLevels
        ? { ...rest, variation_family, variation_level: variation_level ? Number(variation_level) : null, backup_exercise_id: backup_exercise_id || null }
        : rest
      const body = modal === 'edit' && editTarget ? { id: editTarget.id, ...fields } : fields
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

      // Demo clip: upload a new one, or clear a removed one
      let clipUrl: string | null = editTarget?.clip_url ?? null
      let clipPosterUrl: string | null = editTarget?.clip_poster_url ?? null
      const oldClip = { url: editTarget?.clip_url, poster: editTarget?.clip_poster_url }
      if (exerciseId && (newClip || (clipRemoved && oldClip.url))) {
        let ok = true
        if (newClip) {
          setUploadingClip(true)
          const up = await uploadClip(newClip, exerciseId)
          setUploadingClip(false)
          if (up) { clipUrl = up.clipUrl; clipPosterUrl = up.posterUrl }
          else { ok = false; alert('Clip upload failed. Try again. If it keeps failing, make sure the clip migration has been run in Supabase.') }
        } else {
          clipUrl = null; clipPosterUrl = null
        }
        if (ok) {
          const clipRes = await fetch('/api/coach/exercises', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: exerciseId, clip_url: clipUrl, clip_poster_url: clipPosterUrl }),
          })
          if (clipRes.ok) await deleteClipFiles(exerciseId, [oldClip.url, oldClip.poster])
          else {
            clipUrl = oldClip.url ?? null; clipPosterUrl = oldClip.poster ?? null
            alert('The clip could not be saved. Make sure the clip migration has been run in Supabase.')
          }
        }
      }

      const updated: Exercise = {
        ...data.exercise,
        start_image_url: startUrl,
        end_image_url:   endUrl,
        demo_image_url:  startUrl || data.exercise?.demo_image_url || '',
        clip_url:        clipUrl,
        clip_poster_url: clipPosterUrl,
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

  // Families for the name suggestions and the "Easier & harder" view
  const familyNames = [...new Map(
    exercises.filter(e => e.variation_family?.trim()).map(e => [familyKey(e.variation_family), e.variation_family!.trim()]),
  ).values()].sort((a, b) => a.localeCompare(b))
  const families = familyNames.map(name => ({ name, members: familyOf(exercises, { id: '', name, variation_family: name }) }))
  const nameById = new Map(exercises.map(e => [e.id, e.name]))

  // Ladder shown in the form: the family's other exercises plus this one at the chosen level
  const formLadder = (() => {
    if (!form.variation_family.trim()) return []
    const others = familyOf(exercises, { id: '', name: '', variation_family: form.variation_family })
      .filter(e => e.id !== editTarget?.id)
      .map(e => ({ id: e.id, name: e.name, level: e.variation_level ?? null, isThis: false }))
    const me = { id: editTarget?.id ?? 'new', name: form.name || 'This exercise', level: form.variation_level ? Number(form.variation_level) : null, isThis: true }
    return [...others, me].sort((a, b) => (a.level ?? 99) - (b.level ?? 99))
  })()
  const levelClash = formLadder.some(r => !r.isThis && r.level != null && r.level === (form.variation_level ? Number(form.variation_level) : -1))

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
          <button onClick={() => setShowFamilies(v => !v)} title="Exercises that are easier or harder versions of the same movement"
            style={{ padding: '0.35rem 0.875rem', borderRadius: 20, border: `1.5px solid ${showFamilies ? 'var(--carolina-dark)' : 'var(--gray-border)'}`, background: showFamilies ? 'var(--carolina-dark)' : 'transparent', color: showFamilies ? '#fff' : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
            ↕ Easier &amp; harder{families.length ? ` (${families.length})` : ''}
          </button>
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

      {/* Easier & harder: each family as a ladder, easiest on the left */}
      {showFamilies && (
        <div className="card" style={{ padding: '1rem 1.125rem', marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--carolina-dark)', marginBottom: '0.25rem' }}>Easier &amp; Harder Versions</div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.875rem', lineHeight: 1.45 }}>
            Each one is its own exercise, and together they show how to make the movement easier or harder. To add one, edit an exercise and give it a family name and level.
          </p>
          {families.length === 0 && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No families yet. Example: give Bodyweight, DB and Barbell Bulgarian Split Squat the family &quot;Bulgarian Split Squat&quot; with levels 1, 2 and 3.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {families.map(f => (
              <div key={f.name}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.375rem' }}>{f.name}</div>
                <div style={{ display: 'flex', alignItems: 'stretch', gap: '0.375rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                  {f.members.map((m, i) => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                      {i > 0 && <span aria-hidden style={{ color: 'var(--carolina)', fontWeight: 800 }}>→</span>}
                      <button onClick={() => openEdit(m)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0.625rem 0.375rem 0.375rem', borderRadius: 8, border: '1.5px solid var(--carolina-border)', background: 'var(--carolina-light)', cursor: 'pointer', textAlign: 'left' }}>
                        {(m.clip_poster_url || m.start_image_url || m.demo_image_url)
                          ? <img src={m.clip_poster_url || m.start_image_url || m.demo_image_url || ''} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 5 }} />
                          : <div style={{ width: 40, height: 40, borderRadius: 5, background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>💪</div>}
                        <span>
                          <span style={{ display: 'block', fontSize: '0.62rem', fontWeight: 800, color: 'var(--carolina-dark)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {m.variation_level ? `Level ${m.variation_level}` : 'No level'}{i === 0 ? ' · easiest' : i === f.members.length - 1 ? ' · hardest' : ''}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{m.name}</span>
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                    {ex.clip_url && <span style={{ color: 'var(--carolina-dark)', fontWeight: 600 }}> · 🎬 clip</span>}
                  </div>
                  {ex.logs_weight && !ex.equipment && (
                    <select value="" onChange={e => setEquipmentInline(ex, e.target.value)}
                      style={{ marginBottom: '0.375rem', fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: 6, border: '1.5px solid #f59e0b', background: 'rgba(245,158,11,0.08)', color: '#b45309', fontWeight: 600, cursor: 'pointer' }}>
                      <option value="" disabled>Set equipment…</option>
                      {EQUIPMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  {ex.coaching_notes && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{ex.coaching_notes}</div>}
                  {(ex.self_guided_roles ?? []).length > 0 && (
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                      {(ex.self_guided_roles ?? []).map(tag => (
                        <span key={tag} title="Self-guided workout spot" style={{ fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 4, background: 'var(--carolina-light)', color: 'var(--carolina-dark)', border: '1px solid var(--carolina-border)' }}>{roleTagLabel(tag)}</span>
                      ))}
                    </div>
                  )}
                  {(ex.variation_family || ex.backup_exercise_id) && (() => {
                    const fam = familyOf(exercises, ex)
                    return (
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                        {fam.length > 0 && (
                          <button onClick={() => setShowFamilies(true)} title={fam.map(m => `${m.variation_level ?? '?'}. ${m.name}`).join('\n')}
                            style={{ fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 4, background: 'var(--white)', color: 'var(--carolina-deep)', border: '1px solid var(--carolina)', cursor: 'pointer' }}>
                            ↕ {families.find(f => familyKey(f.name) === familyKey(ex.variation_family))?.name ?? ex.variation_family} · {ex.variation_level ? `Lv ${ex.variation_level} of ${fam.length}` : 'no level'}
                          </button>
                        )}
                        {ex.backup_exercise_id && nameById.get(ex.backup_exercise_id) && (
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 4, background: 'var(--white)', color: 'var(--text-secondary)', border: '1px solid var(--gray-border)' }}>
                            Backup: {nameById.get(ex.backup_exercise_id)}
                          </span>
                        )}
                      </div>
                    )
                  })()}
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

            {/* Self-guided workout spots */}
            <div style={{ borderTop: '1.5px solid var(--gray-border)', paddingTop: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--carolina-deep)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: '0.375rem' }}>Self-Guided Workouts</div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.45 }}>
                Where this exercise can go in auto-built workouts. <strong>Main</strong> = the bigger/heavier lift that starts the block, <strong>Secondary</strong> = what it&apos;s paired with, <strong>Easier option</strong> = offered to sore players (less weight or shorter range). If nothing is ticked for a spot, the app picks from the exercise category.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: `minmax(90px, 1.2fr) repeat(${SELF_GUIDED_ROLE_COLUMNS.length}, minmax(0, 1fr))`, gap: '0.35rem 0.5rem', alignItems: 'center' }}>
                <span />
                {SELF_GUIDED_ROLE_COLUMNS.map(c => (
                  <span key={c.role} style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>{c.label}</span>
                ))}
                {FULL_BODY_AREAS.map(a => (
                  <div key={a.area} style={{ display: 'contents' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{a.label} · {a.title}</span>
                    {SELF_GUIDED_ROLE_COLUMNS.map(c => {
                      const tag = roleTag(a.area, c.role)
                      const checked = form.self_guided_roles.includes(tag)
                      return (
                        <label key={tag} style={{ display: 'flex', justifyContent: 'center', cursor: 'pointer', padding: '0.2rem 0' }}>
                          <input type="checkbox" checked={checked} aria-label={`${a.title} ${c.label}`}
                            onChange={e => setForm(p => ({
                              ...p,
                              self_guided_roles: e.target.checked
                                ? [...p.self_guided_roles, tag]
                                : p.self_guided_roles.filter(t => t !== tag),
                            }))} />
                        </label>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Easier & harder versions + backup */}
            <div style={{ borderTop: '1.5px solid var(--gray-border)', paddingTop: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--carolina-deep)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: '0.375rem' }}>Easier &amp; Harder Versions</div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.45 }}>
                Versions of the same movement share a family name. Level 1 is the easiest. When a player asks for a change, you can step them down or up a level, or use the backup.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '0.75rem' }}>
                <div>
                  <Label>Family</Label>
                  <input className="input" list="variation-families" placeholder="e.g. Bulgarian Split Squat" value={form.variation_family}
                    onChange={e => setForm(p => ({ ...p, variation_family: e.target.value }))} />
                  <datalist id="variation-families">
                    {familyNames.map(n => <option key={n} value={n} />)}
                  </datalist>
                </div>
                <div>
                  <Label>Level</Label>
                  <input className="input" type="number" min="1" max="20" inputMode="numeric" placeholder="1 = easiest" disabled={!form.variation_family.trim()}
                    value={form.variation_level} onChange={e => setForm(p => ({ ...p, variation_level: e.target.value }))} />
                </div>
              </div>
              {formLadder.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.625rem' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginRight: '0.2rem' }}>Easier</span>
                  {formLadder.map((r, i) => (
                    <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      {i > 0 && <span aria-hidden style={{ color: 'var(--carolina)' }}>→</span>}
                      <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem', borderRadius: 5, fontWeight: r.isThis ? 800 : 600, background: r.isThis ? 'var(--carolina)' : 'var(--carolina-light)', color: r.isThis ? '#fff' : 'var(--carolina-deep)', border: '1px solid var(--carolina-border)' }}>
                        {r.level ?? '?'}. {r.name}
                      </span>
                    </span>
                  ))}
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginLeft: '0.2rem' }}>Harder</span>
                </div>
              )}
              {form.variation_family.trim() && !form.variation_level && (
                <p style={{ fontSize: '0.75rem', color: '#b45309', margin: '0.4rem 0 0' }}>Give it a level so the app knows which versions are easier and harder.</p>
              )}
              {levelClash && (
                <p style={{ fontSize: '0.75rem', color: '#b45309', margin: '0.4rem 0 0' }}>Another exercise in this family already has level {form.variation_level}.</p>
              )}
              <div style={{ marginTop: '0.875rem' }}>
                <Label>Recommended backup</Label>
                <select className="input" value={form.backup_exercise_id} onChange={e => setForm(p => ({ ...p, backup_exercise_id: e.target.value }))}>
                  <option value="">None</option>
                  {CATEGORIES.map(cat => {
                    const opts = exercises.filter(e => e.category === cat && e.id !== editTarget?.id)
                    return opts.length ? (
                      <optgroup key={cat} label={cat}>
                        {opts.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </optgroup>
                    ) : null
                  })}
                </select>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.35rem 0 0' }}>
                  A different movement for the same area, for when no version of this one works (e.g. Step-Ups for a split squat).
                </p>
              </div>
            </div>

            {/* Photos */}
            <div style={{ borderTop: '1.5px solid var(--gray-border)', paddingTop: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--carolina-deep)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: '0.75rem' }}>Exercise Photos</div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.875rem' }}>Add a start and end position photo. Tap a square to take a photo or choose from your camera roll.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                <PhotoUpload which="start" preview={startPreview} uploading={uploadingStart} inputRef={startRef} pos={startPos} onPosChange={setStartPos} />
                <PhotoUpload which="end" preview={endPreview} uploading={uploadingEnd} inputRef={endRef} pos={endPos} onPosChange={setEndPos} />
              </div>
              <div style={{ marginTop: '1rem' }}>
                <ClipPicker
                  previewUrl={clipPreview}
                  posterUrl={clipPosterPreview}
                  uploading={uploadingClip}
                  onPick={clip => { setNewClip(clip); setClipRemoved(false) }}
                  onRemove={() => { setNewClip(null); setClipRemoved(true) }}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.4rem 0 0', lineHeight: 1.45 }}>
                  A short silent loop of one rep. When an exercise has a clip, players and the TV see the clip instead of the photos (the photos are kept). Film sideways (landscape), then run the video through the clip converter.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-ghost" onClick={closeModal} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
              <button className="btn-volt" onClick={save} disabled={saving || uploadingStart || uploadingEnd || uploadingClip || !form.name} style={{ flex: 2, padding: '0.75rem' }}>
                {saving || uploadingStart || uploadingEnd || uploadingClip ? 'Saving…' : modal === 'add' ? 'Add Exercise' : 'Save Changes'}
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
