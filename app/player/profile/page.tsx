'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { inchesToFeetInches, calcVertical } from '@/lib/fitness'
import MeasurementHistoryModal from '@/components/MeasurementHistoryModal'

interface Measurement {
  id: string; measured_at: string
  height_in?: number; wingspan_in?: number; standing_reach_in?: number
  standing_vertical_in?: number; approach_vertical_in?: number
}
type MeasurementKey = 'height_in'|'wingspan_in'|'standing_reach_in'|'standing_vertical_in'|'approach_vertical_in'

const FIELDS: Array<{ key: MeasurementKey; label: string; showFt: boolean }> = [
  { key: 'height_in',            label: 'Height',         showFt: true  },
  { key: 'wingspan_in',          label: 'Wingspan',        showFt: true  },
  { key: 'standing_reach_in',    label: 'Standing Reach',  showFt: true  },
  { key: 'standing_vertical_in', label: 'Block Touch',     showFt: true  },
  { key: 'approach_vertical_in', label: 'Approach Touch',  showFt: true  },
]

export default function PlayerProfilePage() {
  const router = useRouter()
  const [playerName, setPlayerName] = useState('')
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [loading, setLoading] = useState(true)
  const [historyModal, setHistoryModal] = useState<{ key: string; label: string } | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('vx_session')
    if (!stored) { router.push('/'); return }
    const s = JSON.parse(stored)
    setPlayerName(s.playerName)
    fetch(`/api/player/measurements?playerId=${s.playerId}`)
      .then(r => r.json())
      .then(d => { setMeasurements(d.measurements ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [router])

  const latest = measurements[0]

  function getTrend(key: MeasurementKey): string {
    if (measurements.length < 2) return ''
    const vals = measurements.map(m => m[key] as number | undefined).filter((v): v is number => v != null)
    if (vals.length < 2) return ''
    const diff = vals[0] - vals[vals.length - 1]
    const pct = Math.abs(diff / vals[vals.length - 1] * 100)
    if (Math.abs(diff) < 0.5) return ''
    return diff > 0 ? `↑ +${diff.toFixed(1)}" since you started` : `↓ ${diff.toFixed(1)}" since you started`
  }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: '1rem', maxWidth: 500, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }} className="fade-up">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', border: '2px solid var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--volt)', flexShrink: 0 }}>
            {playerName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800 }}>{playerName}</h1>
            {latest && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>Last measured: {new Date(latest.measured_at).toLocaleDateString()}</p>}
          </div>
        </div>
      </div>

      {latest ? (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Measurements</h2>
          {FIELDS.map(f => {
            const val = latest[f.key]
            const trend = getTrend(f.key)
            return (
              <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid var(--court-border)' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{f.label}</div>
                  {trend && <div style={{ fontSize: '0.72rem', color: trend.startsWith('↑') ? 'var(--success)' : 'var(--danger)', marginTop: '0.15rem' }}>{trend}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {val ? (
                    <>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--volt)' }}>{val}"</div>
                      {f.showFt && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{inchesToFeetInches(val)}</div>}
                    </>
                  ) : <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Not recorded</div>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>No measurements recorded yet.</p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Your coach will add these after testing.</p>
        </div>
      )}

      {measurements.length > 1 && (
        <div className="card" style={{ padding: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>History</h2>
          {measurements.slice(1).map(m => (
            <div key={m.id} className="card-raised" style={{ padding: '0.75rem', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>{new Date(m.measured_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                {FIELDS.map(f => { const val = m[f.key]; if (!val) return null; return (
                  <div key={f.key}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{f.label}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{val}"</div>
                  </div>
                )})}
              </div>
            </div>
          ))}
        </div>
      )}
      {historyModal && session && (
        <MeasurementHistoryModal
          playerId={session.playerId}
          playerName={session.playerName}
          statKey={historyModal.key}
          statLabel={historyModal.label}
          onClose={() => setHistoryModal(null)}
        />
      )}
    </div>
  )
}
