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

function DisplayContent() {
  const searchParams = useSearchParams()
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(searchParams.get('team'))
  const [workout, setWorkout] = useState<WorkoutData | null>(null)
  const [phase, setPhase] = useState<{ phase_type: string; name: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [noWorkout, setNoWorkout] = useState(false)
  const [blockIdx, setBlockIdx] = useState(0)
  const [showAll, setShowAll] = useState(false)

  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  useEffect(() => {
    fetch('/api/coach/teams').then(r => r.json()).then(d => {
      setTeams(d.teams ?? [])
      if (!selectedTeamId && d.teams?.length) setSelectedTeamId(d.teams[0].id)
    })
  }, [])

  useEffect(() => {
    if (!selectedTeamId) return
    setLoading(true); setNoWorkout(false); setWorkout(null); setBlockIdx(0); setShowAll(false)

    fetch(`/api/coach/schedule?teamId=${selectedTeamId}`)
      .then(r => r.json())
      .then(async data => {
        const todayEntry = (data.schedule ?? []).find((s: { scheduled_date: string; template_id?: string }) => s.scheduled_date === today)
        if (!todayEntry?.template_id) { setNoWorkout(true); setLoading(false); return }
        const [phaseRes, tmplRes] = await Promise.all([
          fetch(`/api/coach/phases?teamId=${selectedTeamId}`).then(r => r.json()),
          fetch(`/api/coach/templates?id=${todayEntry.template_id}`).then(r => r.json()),
        ])
        const activePhase = (phaseRes.phases ?? []).find((p: { starts_on: string; ends_on: string }) => p.starts_on <= today && p.ends_on >= today)
        setPhase(activePhase ?? null)
        setWorkout(tmplRes.template)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [selectedTeamId, today])

  const phaseConfig = phase ? PHASE_CONFIG[phase.phase_type as PhaseType] : null
  const selectedTeam = teams.find(t => t.id === selectedTeamId)
  const blocks = workout?.blocks.filter(b => b.exercises.some(e => !e.skipped)) ?? []
  const activeBlock = blocks[blockIdx]

  const BG = '#0d1117'
  const YELLOW = '#fbbf24'
  const CAROLINA = '#56a0d3'

  return (
    <div style={{ height: '100vh', width: '100vw', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: BG, color: '#f0f4f8', fontFamily: 'var(--font-body)', userSelect: 'none' }}>

      {/* ── TOP BAR ── */}
      <div style={{ background: '#111827', borderBottom: `3px solid ${YELLOW}`, padding: '0.625rem 2rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: YELLOW, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem', letterSpacing: '0.1em', color: YELLOW }}>VORTEX S&C</div>
        </div>

        {/* Team pills */}
        <div style={{ display: 'flex', gap: '0.5rem', flex: 1, flexWrap: 'wrap' }}>
          {teams.map(t => (
            <button key={t.id} onClick={() => setSelectedTeamId(t.id)}
              style={{ padding: '0.375rem 1rem', borderRadius: 20, fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', border: `2px solid ${selectedTeamId === t.id ? YELLOW : 'rgba(255,255,255,0.2)'}`, background: selectedTeamId === t.id ? YELLOW : 'transparent', color: selectedTeamId === t.id ? '#111827' : 'rgba(255,255,255,0.6)', transition: 'all 0.15s' }}>
              {t.name}{t.age_group ? ` ${t.age_group}` : ''}
            </button>
          ))}
        </div>

        {/* Date */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          {phaseConfig && <div style={{ fontSize: '0.8rem', color: phaseConfig.color, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{phaseConfig.label} Phase</div>}
        </div>

        {/* Exit */}
        <a href="/coach/dashboard" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', textDecoration: 'none', flexShrink: 0, padding: '0.25rem 0.5rem' }}>✕</a>
      </div>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {loading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '2rem', color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
          </div>
        )}

        {noWorkout && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <div style={{ fontSize: '2.5rem', color: 'rgba(255,255,255,0.3)' }}>No workout scheduled today</div>
            <div style={{ fontSize: '1.25rem', color: 'rgba(255,255,255,0.2)' }}>for {selectedTeam?.name}</div>
          </div>
        )}

        {workout && blocks.length > 0 && (
          <>
            {/* Workout title strip */}
            <div style={{ padding: '1rem 2rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.25rem', fontWeight: 800, letterSpacing: '0.04em', color: '#fff', lineHeight: 1, marginBottom: '0.2rem' }}>
                  {workout.name}
                </h1>
                {workout.description && <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.5)' }}>{workout.description}</div>}
              </div>

              {/* View toggle */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setShowAll(false)}
                  style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: `2px solid ${!showAll ? YELLOW : 'rgba(255,255,255,0.2)'}`, background: !showAll ? YELLOW : 'transparent', color: !showAll ? '#111827' : 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', letterSpacing: '0.05em' }}>
                  ONE BLOCK
                </button>
                <button onClick={() => setShowAll(true)}
                  style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: `2px solid ${showAll ? CAROLINA : 'rgba(255,255,255,0.2)'}`, background: showAll ? CAROLINA : 'transparent', color: showAll ? '#fff' : 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', letterSpacing: '0.05em' }}>
                  ALL BLOCKS
                </button>
              </div>
            </div>

            {/* Warmup strip */}
            {workout.warmup_notes && (
              <div style={{ margin: '0 2rem 0.75rem', background: 'rgba(86,160,211,0.12)', border: `1px solid ${CAROLINA}40`, borderRadius: 10, padding: '0.75rem 1.25rem', display: 'flex', gap: '1rem', alignItems: 'flex-start', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: CAROLINA, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>WARMUP</div>
                <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>{workout.warmup_notes}</div>
              </div>
            )}

            {/* ── SINGLE BLOCK VIEW ── */}
            {!showAll && activeBlock && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0 2rem 1rem' }}>
                {/* Block nav */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexShrink: 0 }}>
                  <button onClick={() => setBlockIdx(i => Math.max(0, i - 1))} disabled={blockIdx === 0}
                    style={{ width: 48, height: 48, borderRadius: 10, border: '2px solid rgba(255,255,255,0.2)', background: blockIdx === 0 ? 'transparent' : 'rgba(255,255,255,0.08)', color: blockIdx === 0 ? 'rgba(255,255,255,0.2)' : '#fff', fontSize: '1.5rem', cursor: blockIdx === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    ‹
                  </button>

                  {/* Block label pills */}
                  <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                    {blocks.map((b, i) => (
                      <button key={b.id} onClick={() => setBlockIdx(i)}
                        style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: `2px solid ${i === blockIdx ? YELLOW : 'rgba(255,255,255,0.15)'}`, background: i === blockIdx ? YELLOW : 'rgba(255,255,255,0.05)', color: i === blockIdx ? '#111827' : 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', transition: 'all 0.12s', letterSpacing: '0.06em' }}>
                        BLOCK {b.block_label}
                      </button>
                    ))}
                  </div>

                  <button onClick={() => setBlockIdx(i => Math.min(blocks.length - 1, i + 1))} disabled={blockIdx === blocks.length - 1}
                    style={{ width: 48, height: 48, borderRadius: 10, border: '2px solid rgba(255,255,255,0.2)', background: blockIdx === blocks.length - 1 ? 'transparent' : 'rgba(255,255,255,0.08)', color: blockIdx === blocks.length - 1 ? 'rgba(255,255,255,0.2)' : '#fff', fontSize: '1.5rem', cursor: blockIdx === blocks.length - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    ›
                  </button>
                </div>

                {/* Block header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexShrink: 0 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 14, background: YELLOW, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '2rem', color: '#111827', flexShrink: 0 }}>
                    {activeBlock.block_label}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '2rem', letterSpacing: '0.04em', lineHeight: 1 }}>BLOCK {activeBlock.block_label}</div>
                    <div style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.2rem' }}>{activeBlock.sets} sets · superset in order</div>
                  </div>
                </div>

                {/* Exercises — big cards */}
                <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: `repeat(${Math.min(activeBlock.exercises.filter(e => !e.skipped).length, 3)}, 1fr)`, gap: '1.25rem', alignItems: 'stretch' }}>
                  {activeBlock.exercises.filter(e => !e.skipped).map((ex, ei) => {
                    const reps = ex.customReps || ex.default_reps || ''
                    const notes = ex.customNotes || ex.coaching_notes || ''
                    return (
                      <div key={ex.id} style={{ background: '#1a2030', border: `2px solid rgba(255,255,255,0.08)`, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {/* Exercise number badge */}
                        <div style={{ background: CAROLINA, padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>{ei + 1}</div>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: '#fff', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Exercise {ei + 1} of {activeBlock.exercises.filter(e => !e.skipped).length}</div>
                        </div>

                        {/* Image */}
                        {ex.demo_image_url ? (
                          <div style={{ width: '100%', paddingBottom: '56%', position: 'relative', flexShrink: 0 }}>
                            <img src={ex.demo_image_url} alt={ex.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ) : ex.demo_url ? (
                          <a href={ex.demo_url} target="_blank" rel="noopener noreferrer" style={{ width: '100%', paddingBottom: '56%', position: 'relative', flexShrink: 0, display: 'block', background: '#0d1117', textDecoration: 'none' }}>
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: CAROLINA }}>
                              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
                              <div style={{ fontSize: '1rem', fontWeight: 600 }}>Watch Demo</div>
                            </div>
                          </a>
                        ) : (
                          <div style={{ width: '100%', paddingBottom: '40%', position: 'relative', flexShrink: 0, background: '#111827' }}>
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.15)', fontSize: '1rem' }}>No image</div>
                          </div>
                        )}

                        {/* Exercise info */}
                        <div style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.75rem', lineHeight: 1.1, color: '#fff' }}>{ex.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: YELLOW }}>{activeBlock.sets} × {reps}</span>
                            {ex.logs_weight && <span style={{ fontSize: '1rem', color: CAROLINA, fontWeight: 600 }}>· Log weight</span>}
                          </div>
                          {notes && (
                            <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.625rem', marginTop: 'auto' }}>
                              {notes}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── ALL BLOCKS VIEW ── */}
            {showAll && (
              <div style={{ flex: 1, overflow: 'auto', padding: '0 2rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.25rem', alignContent: 'start' }}>
                {blocks.map(block => (
                  <div key={block.id} style={{ background: '#1a2030', border: '2px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden' }}>
                    {/* Block header */}
                    <div style={{ background: '#111827', borderBottom: `3px solid ${YELLOW}`, padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: YELLOW, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', color: '#111827', flexShrink: 0 }}>
                        {block.block_label}
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem', color: '#fff', letterSpacing: '0.04em' }}>BLOCK {block.block_label}</div>
                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)' }}>{block.sets} sets · superset</div>
                      </div>
                    </div>

                    {/* Exercise list */}
                    <div style={{ padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {block.exercises.filter(e => !e.skipped).map((ex, ei) => {
                        const reps = ex.customReps || ex.default_reps || ''
                        const notes = ex.customNotes || ex.coaching_notes || ''
                        return (
                          <div key={ex.id} style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start', paddingBottom: ei < block.exercises.filter(e => !e.skipped).length - 1 ? '0.75rem' : 0, borderBottom: ei < block.exercises.filter(e => !e.skipped).length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                            {ex.demo_image_url ? (
                              <img src={ex.demo_image_url} alt={ex.name} style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 96, height: 72, borderRadius: 8, background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.75rem', color: 'rgba(255,255,255,0.15)' }}>{ei + 1}</div>
                              </div>
                            )}
                            <div style={{ flex: 1 }}>
                              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem', color: '#fff', lineHeight: 1.1, marginBottom: '0.3rem' }}>{ex.name}</div>
                              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: YELLOW }}>{block.sets} × {reps} reps</div>
                              {notes && <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.3rem', fontStyle: 'italic', lineHeight: 1.4 }}>{notes}</div>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function CoachDisplayPage() {
  return (
    <Suspense fallback={<div style={{ height: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '1.5rem' }}>Loading…</div>}>
      <DisplayContent />
    </Suspense>
  )
}
