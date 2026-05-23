'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { inchesToFeetInches } from '@/lib/fitness'

interface Measurement {
  id: string
  measured_at: string
  height_in?: number
  wingspan_in?: number
  standing_reach_in?: number
  standing_vertical_in?: number
  approach_vertical_in?: number
  notes?: string
}

const FIELDS = [
  { key: 'height_in', label: 'Height', unit: 'in', showFt: true },
  { key: 'wingspan_in', label: 'Wingspan', unit: 'in', showFt: true },
  { key: 'standing_reach_in', label: 'Standing Reach', unit: 'in', showFt: true },
  { key: 'standing_vertical_in', label: 'Standing Vertical', unit: 'in', showFt: false },
  { key: 'approach_vertical_in', label: 'Approach Vertical', unit: 'in', showFt: false },
] as const

export default function ProfilePage() {
  const router = useRouter()
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('vx_session')
    if (!stored) { router.push('/'); return }
    const s = JSON.parse(stored)
    setPlayerId(s.playerId)
    setPlayerName(s.playerName)
    fetch(`/api/player/measurements?playerId=${s.playerId}`)
      .then(r => r.json())
      .then(data => { setMeasurements(data.measurements || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [router])

  const latest = measurements[0]

  function getTrend(key: string): string {
    if (measurements.length < 2) return ''
    const vals = measurements.map(m => (m as unknown as Record<string, unknown>)[key] as number).filter(Boolean)
    if (vals.length < 2) return ''
    const diff = vals[0] - vals[vals.length - 1]
    const pct = Math.abs(diff / vals[vals.length - 1] * 100)
    if (Math.abs(diff) < 0.5) return ''
    return diff > 0
      ? `↑ ${pct.toFixed(1)}% since first measured`
      : `↓ ${pct.toFixed(1)}% since first measured`
  }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '1rem', maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }} className="fade-up">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', border: '2px solid var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--volt)', flexShrink: 0 }}>
            {playerName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800 }}>{playerName}</h1>
            {latest && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>Last measured: {new Date(latest.measured_at).toLocaleDateString()}</p>}
          </div>
        </div>
      </div>

      {/* Current measurements */}
      {latest ? (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Measurements</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {FIELDS.map(f => {
              const val = (latest as Record<string, unknown>)[f.key] as number | undefined
              const trend = getTrend(f.key)
              return (
                <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid var(--court-border)' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{f.label}</div>
                    {trend && <div style={{ fontSize: '0.75rem', color: trend.startsWith('↑') ? 'var(--success)' : 'var(--danger)', marginTop: '0.2rem' }}>{trend}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {val ? (
                      <>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--volt)' }}>{val}"</div>
                        {f.showFt && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{inchesToFeetInches(val)}</div>}
                      </>
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Not recorded</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', marginBottom: '1rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>No measurements recorded yet.</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Your coach will add these after testing.</p>
        </div>
      )}

      {/* Measurement history */}
      {measurements.length > 1 && (
        <div className="card" style={{ padding: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>History</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {measurements.slice(1).map(m => (
              <div key={m.id} className="card-raised" style={{ padding: '0.75rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  {new Date(m.measured_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                  {FIELDS.map(f => {
                    const val = (m as Record<string, unknown>)[f.key] as number | undefined
                    if (!val) return null
                    return (
                      <div key={f.key}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-primary)' }}>{val}"</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
