'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PHASE_CONFIG, PhaseType } from '@/lib/types'

interface Exercise {
  id: string; name: string; default_reps?: string; customReps?: string
  coaching_notes?: string; customNotes?: string
  demo_image_url?: string; demo_url?: string
  logs_weight: boolean; skipped: boolean
}
interface Block { id: string; block_label: string; sets: number; exercises: Exercise[] }
interface WorkoutData { id: string; name: string; description?: string; warmup_notes?: string; blocks: Block[] }
interface Team { id: string; name: string; age_group?: string; color: string }

const BG      = '#0d1117'
const SURFACE = '#161d2a'
const CARD    = '#1e2736'
const YELLOW  = '#fbbf24'
const CAROLINA= '#56a0d3'
const BORDER  = 'rgba(255,255,255,0.07)'

function DisplayContent() {
  const searchParams = useSearchParams()
  const [teams, setTeams]             = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(searchParams.get('team'))
  const [workout, setWorkout]         = useState<WorkoutData | null>(null)
  const [phase, setPhase]             = useState<{ phase_type: string; name: string } | null>(null)
  const [loading, setLoading]         = useState(false)
  const [noWorkout, setNoWorkout]     = useState(false)

  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  })()

  useEffect(() => {
    fetch('/api/coach/teams').then(r => r.json()).then(d => {
      setTeams(d.teams ?? [])
      if (!selectedTeamId && d.teams?.length) setSelectedTeamId(d.teams[0].id)
    })
  }, [])

  useEffect(() => {
    if (!selectedTeamId) return
    setLoading(true); setNoWorkout(false); setWorkout(null)

    fetch(`/api/coach/schedule?teamId=${selectedTeamId}`)
      .then(r => r.json())
      .then(async data => {
        const entry = (data.schedule ?? []).find((s: { scheduled_date: string; template_id?: string }) => s.scheduled_date === today)
        if (!entry?.template_id) { setNoWorkout(true); setLoading(false); return }
        const [phaseData, tmplData] = await Promise.all([
          fetch(`/api/coach/phases?teamId=${selectedTeamId}`).then(r => r.json()),
          fetch(`/api/coach/templates?id=${entry.template_id}`).then(r => r.json()),
        ])
        const activePhase = (phaseData.phases ?? []).find((p: { starts_on: string; ends_on: string }) => p.starts_on <= today && p.ends_on >= today)
        setPhase(activePhase ?? null)
        setWorkout(tmplData.template)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [selectedTeamId, today])

  const phaseConfig = phase ? PHASE_CONFIG[phase.phase_type as PhaseType] : null
  const allBlocks = workout?.blocks.filter(b => b.exercises.some(e => !e.skipped)) ?? []
  // Warmup block = labeled W, Warmup, or WU (case-insensitive)
  const isWarmupBlock = (label: string) => /^w(armup|u)?$/i.test(label.trim())
  const warmupBlock  = allBlocks.find(b => isWarmupBlock(b.block_label))
  const blocks       = allBlocks.filter(b => !isWarmupBlock(b.block_label))

  // Grid layout: 1–2 blocks = side by side, 3–4 = 2×2
  const cols = blocks.length <= 2 ? blocks.length : 2
  const rows = Math.ceil(blocks.length / cols)

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      background: BG, color: '#f0f4f8',
      fontFamily: 'var(--font-body)',
    }}>

      {/* ── TOP BAR — compact ── */}
      <div style={{ background: '#111827', borderBottom: `3px solid ${YELLOW}`, padding: '0.4vh 1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <div style={{ width: '3.5vh', height: '3.5vh', borderRadius: '50%', background: YELLOW, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="55%" height="55%" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '2.2vh', letterSpacing: '0.1em', color: YELLOW }}>VORTEX S&C</span>
        </div>

        {/* Team pills */}
        <div style={{ display: 'flex', gap: '0.4rem', flex: 1 }}>
          {teams.map(t => (
            <button key={t.id} onClick={() => setSelectedTeamId(t.id)} style={{ padding: '0.2vh 0.8rem', borderRadius: 20, fontSize: '1.8vh', fontWeight: 700, cursor: 'pointer', border: `2px solid ${selectedTeamId === t.id ? YELLOW : 'rgba(255,255,255,0.15)'}`, background: selectedTeamId === t.id ? YELLOW : 'transparent', color: selectedTeamId === t.id ? '#111827' : 'rgba(255,255,255,0.5)', transition: 'all 0.12s' }}>
              {t.name}{t.age_group ? ` ${t.age_group}` : ''}
            </button>
          ))}
        </div>

        {/* Workout name + date */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {workout && <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '2vh', color: '#fff', letterSpacing: '0.04em' }}>{workout.name}</div>}
          <div style={{ fontSize: '1.6vh', color: 'rgba(255,255,255,0.45)' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {phaseConfig && <span style={{ color: phaseConfig.color, marginLeft: '0.75rem', fontWeight: 600 }}>· {phaseConfig.label} Phase</span>}
          </div>
        </div>

        <a href="/coach/dashboard" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '1.8vh', textDecoration: 'none', flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '0.4vh', padding: '0.3vh 0.75rem', fontWeight: 600 }}>✕ Exit TV</a>
      </div>



      {/* ── WARMUP BLOCK STRIP ── */}
      {(warmupBlock || workout?.warmup_notes) && !loading && !noWorkout && workout && (
        <div style={{ background: `${CAROLINA}15`, borderBottom: `1px solid ${CAROLINA}25`, padding: '0.4vh 1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5vh', color: CAROLINA, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>WARMUP</span>
          {warmupBlock && (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {warmupBlock.exercises.filter(e => !e.skipped).map((ex, ei) => (
                <span key={ex.id} style={{ fontSize: '1.5vh', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
                  {ei > 0 && <span style={{ color: 'rgba(255,255,255,0.25)', marginRight: '1rem' }}>·</span>}
                  {ex.name}
                  {(ex.customReps || ex.default_reps) && (
                    <span style={{ color: YELLOW, marginLeft: '0.35rem', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                      {warmupBlock.sets}×{ex.customReps || ex.default_reps}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
          {workout.warmup_notes && (
            <span style={{ fontSize: '1.4vh', color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '30vw' }}>
              {workout.warmup_notes}
            </span>
          )}
        </div>
      )}

      {/* ── STATES ── */}
      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '3vh', color: 'rgba(255,255,255,0.3)' }}>Loading…</span>
        </div>
      )}

      {noWorkout && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
          <div style={{ fontSize: '3vh', color: 'rgba(255,255,255,0.3)' }}>No workout scheduled today</div>
          <div style={{ fontSize: '2vh', color: 'rgba(255,255,255,0.2)' }}>Assign one in the Schedule page</div>
        </div>
      )}

      {/* ── BLOCKS GRID — fills all remaining space ── */}
      {workout && blocks.length > 0 && (
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: '0.6vh',
          padding: '0.6vh',
          minHeight: 0,
          overflow: 'hidden',
        }}>
          {blocks.map(block => {
            const exs = block.exercises.filter(e => !e.skipped)
            return (
              <div key={block.id} style={{ background: CARD, border: `1.5px solid ${BORDER}`, borderRadius: '0.8vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

                {/* Block header */}
                <div style={{ background: SURFACE, borderBottom: `2.5px solid ${YELLOW}`, padding: '0.5vh 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                  <div style={{ width: '4.5vh', height: '4.5vh', borderRadius: '0.5vh', background: YELLOW, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '2.8vh', color: '#111827', flexShrink: 0, lineHeight: 1 }}>
                    {block.block_label}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '2.5vh', color: '#fff', letterSpacing: '0.04em', lineHeight: 1 }}>
                    BLOCK {block.block_label}
                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '1.6vh', color: 'rgba(255,255,255,0.4)', marginLeft: '0.75rem' }}>{block.sets} sets · superset</span>
                  </div>
                </div>

                {/* Exercises — split space equally */}
                <div style={{ flex: 1, display: 'flex', flexDirection: exs.length > 2 ? 'row' : 'column', minHeight: 0, overflow: 'hidden', gap: '1px' }}>
                  {exs.map((ex, ei) => {
                    const reps  = ex.customReps || ex.default_reps || ''
                    const notes = ex.customNotes || ex.coaching_notes || ''
                    return (
                      <div key={ex.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, borderTop: ei > 0 && exs.length <= 2 ? `1px solid ${BORDER}` : 'none', borderLeft: ei > 0 && exs.length > 2 ? `1px solid ${BORDER}` : 'none', overflow: 'hidden' }}>

                        {/* Image */}
                        <div style={{ flex: '1 1 50%', position: 'relative', overflow: 'hidden', minHeight: 0 }}>
                          {ex.demo_image_url ? (
                            <img src={ex.demo_image_url} alt={ex.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          ) : ex.demo_url ? (
                            <a href={ex.demo_url} target="_blank" rel="noopener noreferrer" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', textDecoration: 'none', gap: '0.5rem', flexDirection: 'column', color: CAROLINA }}>
                              <svg width="5vh" height="5vh" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
                              <span style={{ fontSize: '1.6vh', fontWeight: 600 }}>Watch Demo</span>
                            </a>
                          ) : (
                            <div style={{ width: '100%', height: '100%', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '6vh', color: 'rgba(255,255,255,0.06)' }}>{ei + 1}</span>
                            </div>
                          )}
                          {/* Exercise number overlay */}
                          <div style={{ position: 'absolute', top: '0.5vh', left: '0.5vh', background: CAROLINA, borderRadius: '0.4vh', width: '3vh', height: '3vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8vh', color: '#fff' }}>
                            {ei + 1}
                          </div>
                        </div>

                        {/* Text info */}
                        <div style={{ flexShrink: 0, padding: '0.5vh 0.75rem', background: CARD }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(0.8rem, 2.2vh, 1.6rem)', color: '#fff', lineHeight: 1.1, marginBottom: '0.2vh' }}>{ex.name}</div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(0.75rem, 2vh, 1.4rem)', color: YELLOW }}>{block.sets} × {reps} reps</span>
                            {ex.logs_weight && <span style={{ fontSize: 'clamp(0.6rem, 1.4vh, 0.9rem)', color: CAROLINA, fontWeight: 600 }}>log weight</span>}
                          </div>
                          {notes && <div style={{ fontSize: 'clamp(0.6rem, 1.3vh, 0.85rem)', color: 'rgba(255,255,255,0.42)', fontStyle: 'italic', lineHeight: 1.3, marginTop: '0.2vh', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{notes}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function CoachDisplayPage() {
  return (
    <Suspense fallback={<div style={{ width: '100vw', height: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '2rem' }}>Loading…</div>}>
      <DisplayContent />
    </Suspense>
  )
}
