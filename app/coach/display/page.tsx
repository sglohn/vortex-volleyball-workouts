'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PHASE_CONFIG, PhaseType } from '@/lib/types'

interface Exercise {
  id: string; name: string; default_reps?: string; customReps?: string
  coaching_notes?: string; customNotes?: string
  demo_image_url?: string; demo_url?: string
  logs_weight: boolean; logs_velocity: boolean; skipped: boolean
}
interface Block { id: string; block_label: string; sets: number; exercises: Exercise[] }
interface WorkoutData { id: string; name: string; description?: string; warmup_notes?: string; blocks: Block[] }

interface Team { id: string; name: string; age_group?: string; color: string }

function DisplayContent() {
  const searchParams = useSearchParams()
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(searchParams.get('team'))
  const [workout, setWorkout] = useState<WorkoutData | null>(null)
  const [phase, setPhase] = useState<{ phase_type: string; name: string; description?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeBlock, setActiveBlock] = useState<number | null>(null)
  const [noWorkout, setNoWorkout] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    fetch('/api/coach/teams')
      .then(r => r.json())
      .then(d => {
        setTeams(d.teams ?? [])
        if (!selectedTeamId && d.teams?.length) setSelectedTeamId(d.teams[0].id)
      })
  }, [])

  useEffect(() => {
    if (!selectedTeamId) return
    setLoading(true)
    setNoWorkout(false)
    setWorkout(null)
    setActiveBlock(null)

    // Get team schedule for today
    fetch(`/api/coach/schedule?teamId=${selectedTeamId}&weekOf=${today}`)
      .then(r => r.json())
      .then(async data => {
        const todayEntry = (data.schedule ?? []).find((s: { scheduled_date: string; template_id?: string }) => s.scheduled_date === today)
        if (!todayEntry?.template_id) { setNoWorkout(true); setLoading(false); return }

        // Get phase
        const phaseRes = await fetch(`/api/coach/phases?teamId=${selectedTeamId}`)
        const phaseData = await phaseRes.json()
        const activePhase = (phaseData.phases ?? []).find((p: { starts_on: string; ends_on: string }) => p.starts_on <= today && p.ends_on >= today)
        setPhase(activePhase ?? null)

        // Get template
        const tmplRes = await fetch(`/api/coach/templates?id=${todayEntry.template_id}`)
        const tmplData = await tmplRes.json()
        setWorkout(tmplData.template)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [selectedTeamId, today])

  const phaseConfig = phase ? PHASE_CONFIG[phase.phase_type as PhaseType] : null
  const selectedTeam = teams.find(t => t.id === selectedTeamId)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--court-bg)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-body)' }}>

      {/* Top bar */}
      <div style={{ background: 'var(--court-surface)', borderBottom: '1px solid var(--court-border)', padding: '0.875rem 2rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginRight: '0.5rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0a0f0d" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.08em', color: 'var(--volt)', lineHeight: 1 }}>VORTEX</div>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Strength & Conditioning</div>
          </div>
        </div>

        {/* Team selector */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', flex: 1 }}>
          {teams.map(t => (
            <button key={t.id} onClick={() => setSelectedTeamId(t.id)}
              style={{ padding: '0.35rem 0.875rem', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${selectedTeamId === t.id ? t.color : 'var(--court-border)'}`, background: selectedTeamId === t.id ? `${t.color}20` : 'transparent', color: selectedTeamId === t.id ? t.color : 'var(--text-muted)', transition: 'all 0.15s' }}>
              {t.name}{t.age_group ? ` · ${t.age_group}` : ''}
            </button>
          ))}
        </div>

        {/* Date + phase */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          {phaseConfig && (
            <div style={{ fontSize: '0.72rem', color: phaseConfig.color, fontWeight: 600, letterSpacing: '0.04em' }}>
              {phaseConfig.label.toUpperCase()} PHASE
            </div>
          )}
        </div>

        {/* Close / back link */}
        <a href="/coach/dashboard" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textDecoration: 'none', flexShrink: 0 }}>✕ Exit</a>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: '2rem', overflow: 'auto' }}>
        {loading && <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: '4rem', fontSize: '1.1rem' }}>Loading…</div>}

        {noWorkout && (
          <div style={{ textAlign: 'center', paddingTop: '4rem' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.25rem', marginBottom: '0.5rem' }}>No workout scheduled for {selectedTeam?.name} today.</p>
            <p style={{ color: 'var(--text-muted)' }}>Go to Schedule to assign one.</p>
          </div>
        )}

        {workout && (
          <>
            {/* Workout title + phase message */}
            <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.75rem', fontWeight: 800, letterSpacing: '0.02em', marginBottom: '0.25rem', lineHeight: 1 }}>{workout.name}</h1>
                {workout.description && <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>{workout.description}</p>}
              </div>
              {phaseConfig && (
                <div style={{ background: `${phaseConfig.color}15`, border: `1px solid ${phaseConfig.color}35`, borderRadius: 10, padding: '0.875rem 1.25rem', maxWidth: 340, textAlign: 'right', flexShrink: 0, marginLeft: '2rem' }}>
                  <div style={{ fontSize: '0.7rem', color: phaseConfig.color, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: '0.35rem' }}>{phaseConfig.label} Phase</div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{phaseConfig.intensityNote}</p>
                </div>
              )}
            </div>

            {/* Warmup */}
            {workout.warmup_notes && (
              <div style={{ background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.75rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--volt)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0, marginTop: '0.1rem' }}>WARMUP</div>
                <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{workout.warmup_notes}</p>
              </div>
            )}

            {/* Block tabs */}
            <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {workout.blocks.map((block, idx) => (
                <button key={block.id} onClick={() => setActiveBlock(activeBlock === idx ? null : idx)}
                  style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: `2px solid ${activeBlock === idx ? 'var(--volt)' : 'var(--court-border)'}`, background: activeBlock === idx ? 'rgba(74,222,128,0.12)' : 'var(--court-surface)', color: activeBlock === idx ? 'var(--volt)' : 'var(--text-secondary)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', letterSpacing: '0.05em', cursor: 'pointer', transition: 'all 0.15s' }}>
                  BLOCK {block.block_label}
                </button>
              ))}
              {activeBlock !== null && (
                <button onClick={() => setActiveBlock(null)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid var(--court-border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer' }}>
                  Show all
                </button>
              )}
            </div>

            {/* Blocks grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
              {workout.blocks.map((block, idx) => {
                if (activeBlock !== null && activeBlock !== idx) return null
                return (
                  <div key={block.id} className="card" style={{ padding: '1.5rem', borderColor: activeBlock === idx ? 'rgba(74,222,128,0.4)' : 'var(--court-border)' }}>
                    {/* Block header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1.25rem' }}>
                      <div style={{ background: 'var(--volt)', color: '#0a0f0d', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', width: 48, height: 48, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {block.block_label.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.2rem', letterSpacing: '0.04em' }}>BLOCK {block.block_label}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{block.sets} sets · superset</div>
                      </div>
                    </div>

                    {/* Exercises */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {block.exercises.filter(e => !e.skipped).map((ex, ei) => {
                        const reps = ex.customReps || ex.default_reps || ''
                        const notes = ex.customNotes || ex.coaching_notes || ''
                        return (
                          <div key={ex.id} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', paddingBottom: ei < block.exercises.filter(e => !e.skipped).length - 1 ? '1rem' : 0, borderBottom: ei < block.exercises.filter(e => !e.skipped).length - 1 ? '1px solid var(--court-border)' : 'none' }}>
                            {/* Demo image */}
                            {ex.demo_image_url ? (
                              <img src={ex.demo_image_url} alt={ex.name} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                            ) : ex.demo_url ? (
                              <a href={ex.demo_url} target="_blank" rel="noopener noreferrer" style={{ width: 80, height: 80, borderRadius: 8, background: 'var(--court-raised)', border: '1px solid var(--court-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, textDecoration: 'none', color: 'var(--volt)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
                              </a>
                            ) : (
                              <div style={{ width: 80, height: 80, borderRadius: 8, background: 'var(--court-raised)', border: '1px solid var(--court-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-muted)', fontSize: '0.65rem', textAlign: 'center', padding: '0.5rem' }}>
                                No image
                              </div>
                            )}

                            <div style={{ flex: 1 }}>
                              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.2rem' }}>{ex.name}</div>
                              <div style={{ fontSize: '0.9rem', color: 'var(--volt)', fontWeight: 600, marginBottom: notes ? '0.35rem' : 0 }}>
                                {block.sets} × {reps} reps
                                {ex.logs_weight && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>· log weight</span>}
                              </div>
                              {notes && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>{notes}</div>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function CoachDisplayPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading display…</div>}>
      <DisplayContent />
    </Suspense>
  )
}
