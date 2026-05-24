'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Body regions with their SVG click zones
const BODY_REGIONS: Array<{
  id: string
  label: string
  // SVG path or circle for the clickable zone
  shape: 'circle' | 'ellipse' | 'rect'
  x: number; y: number; w?: number; h?: number; r?: number
  front: boolean // true = front of body, false = back
}> = [
  // Front
  { id: 'head', label: 'Head/Neck', shape: 'circle', x: 100, y: 32, r: 22, front: true },
  { id: 'left_shoulder', label: 'Left Shoulder', shape: 'circle', x: 53, y: 78, r: 16, front: true },
  { id: 'right_shoulder', label: 'Right Shoulder', shape: 'circle', x: 147, y: 78, r: 16, front: true },
  { id: 'chest', label: 'Chest/Upper Back', shape: 'ellipse', x: 100, y: 100, w: 38, h: 28, front: true },
  { id: 'left_elbow', label: 'Left Elbow', shape: 'circle', x: 38, y: 115, r: 13, front: true },
  { id: 'right_elbow', label: 'Right Elbow', shape: 'circle', x: 162, y: 115, r: 13, front: true },
  { id: 'core', label: 'Core/Lower Back', shape: 'ellipse', x: 100, y: 145, w: 30, h: 22, front: true },
  { id: 'left_wrist', label: 'Left Wrist/Hand', shape: 'circle', x: 28, y: 152, r: 12, front: true },
  { id: 'right_wrist', label: 'Right Wrist/Hand', shape: 'circle', x: 172, y: 152, r: 12, front: true },
  { id: 'left_hip', label: 'Left Hip', shape: 'circle', x: 76, y: 175, r: 16, front: true },
  { id: 'right_hip', label: 'Right Hip', shape: 'circle', x: 124, y: 175, r: 16, front: true },
  { id: 'left_quad', label: 'Left Quad/Hamstring', shape: 'ellipse', x: 76, y: 215, w: 20, h: 30, front: true },
  { id: 'right_quad', label: 'Right Quad/Hamstring', shape: 'ellipse', x: 124, y: 215, w: 20, h: 30, front: true },
  { id: 'left_knee', label: 'Left Knee', shape: 'circle', x: 76, y: 255, r: 14, front: true },
  { id: 'right_knee', label: 'Right Knee', shape: 'circle', x: 124, y: 255, r: 14, front: true },
  { id: 'left_shin', label: 'Left Shin/Calf', shape: 'ellipse', x: 76, y: 290, w: 16, h: 28, front: true },
  { id: 'right_shin', label: 'Right Shin/Calf', shape: 'ellipse', x: 124, y: 290, w: 16, h: 28, front: true },
  { id: 'left_ankle', label: 'Left Ankle/Foot', shape: 'circle', x: 76, y: 328, r: 13, front: true },
  { id: 'right_ankle', label: 'Right Ankle/Foot', shape: 'circle', x: 124, y: 328, r: 13, front: true },
]

type RegionStatus = 'sore' | 'injured'
type RegionMap = Record<string, RegionStatus>

function getRegionColor(status: RegionStatus | undefined): string {
  if (status === 'injured') return '#ef4444'
  if (status === 'sore') return '#facc15'
  return 'rgba(74,222,128,0.15)'
}

function getRegionStroke(status: RegionStatus | undefined): string {
  if (status === 'injured') return '#ef4444'
  if (status === 'sore') return '#facc15'
  return 'rgba(74,222,128,0.3)'
}

export default function BodyCheckPage() {
  const router = useRouter()
  const [session, setSession] = useState<{ sessionId: string; playerId: string; playerName: string } | null>(null)
  const [regions, setRegions] = useState<RegionMap>({})
  const [saving, setSaving] = useState(false)
  const [tooltip, setTooltip] = useState<string | null>(null)
  const [isResumed, setIsResumed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('vx_session')
    if (!stored) { router.push('/'); return }
    const s = JSON.parse(stored)
    setSession(s)
    setIsResumed(s.isResumed ?? false)
  }, [router])

  function tapRegion(id: string) {
    setRegions(prev => {
      const current = prev[id]
      if (!current) return { ...prev, [id]: 'sore' }
      if (current === 'sore') return { ...prev, [id]: 'injured' }
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function submit() {
    if (!session) return
    setSaving(true)

    if (Object.keys(regions).length > 0) {
      await fetch('/api/player/bodycheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, playerId: session.playerId, regions }),
      })
      // Update session flags
      const stored = localStorage.getItem('vx_session')
      if (stored) {
        const s = JSON.parse(stored)
        s.hasHealthFlags = true
        localStorage.setItem('vx_session', JSON.stringify(s))
      }
    }

    router.push('/player/workout')
  }

  const markedCount = Object.keys(regions).length
  const injuredCount = Object.values(regions).filter(v => v === 'injured').length
  const soreCount = Object.values(regions).filter(v => v === 'sore').length

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem 1rem', background: 'var(--court-bg)' }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: 420, marginBottom: '1.25rem' }} className="fade-up">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0f0d" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.08em', color: 'var(--volt)' }}>VORTEX S&C</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>
          {isResumed ? 'Welcome back,' : 'How are you feeling,'} {session?.playerName?.split(' ')[0]}?
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Tap any area that feels sore or injured before you start.
        </p>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '1rem' }}>
        {[
          { color: 'rgba(74,222,128,0.15)', stroke: 'rgba(74,222,128,0.3)', label: 'Tap once = Sore' },
          { color: 'rgba(250,204,21,0.3)', stroke: '#facc15', label: 'Yellow = Sore' },
          { color: 'rgba(239,68,68,0.3)', stroke: '#ef4444', label: 'Red = Injured' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill={l.color} stroke={l.stroke} strokeWidth="1.5"/></svg>
            {l.label}
          </div>
        ))}
      </div>

      {/* Body map */}
      <div style={{ width: '100%', maxWidth: 260, marginBottom: '1rem', position: 'relative' }}>
        <svg viewBox="0 0 200 360" style={{ width: '100%', height: 'auto' }} xmlns="http://www.w3.org/2000/svg">
          {/* Body silhouette */}
          <g opacity="0.25">
            {/* Head */}
            <circle cx="100" cy="32" r="22" fill="none" stroke="#4ade80" strokeWidth="1"/>
            {/* Neck */}
            <rect x="92" y="52" width="16" height="12" rx="4" fill="none" stroke="#4ade80" strokeWidth="1"/>
            {/* Torso */}
            <path d="M62 64 L138 64 L148 170 L52 170 Z" fill="none" stroke="#4ade80" strokeWidth="1"/>
            {/* Left arm */}
            <path d="M62 64 L42 160" fill="none" stroke="#4ade80" strokeWidth="1"/>
            {/* Right arm */}
            <path d="M138 64 L158 160" fill="none" stroke="#4ade80" strokeWidth="1"/>
            {/* Left leg */}
            <path d="M80 170 L68 340" fill="none" stroke="#4ade80" strokeWidth="1"/>
            {/* Right leg */}
            <path d="M120 170 L132 340" fill="none" stroke="#4ade80" strokeWidth="1"/>
          </g>

          {/* Clickable regions */}
          {BODY_REGIONS.map(region => {
            const status = regions[region.id]
            const fill = status === 'injured' ? 'rgba(239,68,68,0.35)' : status === 'sore' ? 'rgba(250,204,21,0.35)' : 'rgba(74,222,128,0.08)'
            const stroke = getRegionStroke(status)
            return (
              <g key={region.id} onClick={() => tapRegion(region.id)}
                onMouseEnter={() => setTooltip(region.label)}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: 'pointer' }}>
                {region.shape === 'circle' && (
                  <circle cx={region.x} cy={region.y} r={region.r} fill={fill} stroke={stroke} strokeWidth={status ? 2 : 1} />
                )}
                {region.shape === 'ellipse' && (
                  <ellipse cx={region.x} cy={region.y} rx={region.w} ry={region.h} fill={fill} stroke={stroke} strokeWidth={status ? 2 : 1} />
                )}
                {status && (
                  <text x={region.x} y={region.y + 1} textAnchor="middle" dominantBaseline="middle"
                    fontSize="10" fill={status === 'injured' ? '#ef4444' : '#facc15'} fontWeight="700">
                    {status === 'injured' ? '!' : '~'}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div style={{ position: 'absolute', bottom: -28, left: '50%', transform: 'translateX(-50%)', background: 'var(--court-raised)', border: '1px solid var(--court-border)', borderRadius: 6, padding: '0.25rem 0.625rem', fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {tooltip}
          </div>
        )}
      </div>

      {/* Tap instruction */}
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', textAlign: 'center' }}>
        Tap once for sore · tap again for injured · tap again to clear
      </p>

      {/* Summary of marked regions */}
      {markedCount > 0 && (
        <div style={{ width: '100%', maxWidth: 420, marginBottom: '1rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {Object.entries(regions).map(([id, status]) => {
              const region = BODY_REGIONS.find(r => r.id === id)
              return (
                <span key={id} style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: 4, background: status === 'injured' ? 'rgba(239,68,68,0.15)' : 'rgba(250,204,21,0.15)', color: status === 'injured' ? '#ef4444' : '#facc15', fontWeight: 600 }}>
                  {status === 'injured' ? '⚠' : '~'} {region?.label ?? id}
                </span>
              )
            })}
          </div>
          {injuredCount > 0 && (
            <p style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: '0.5rem' }}>
              Your coach will be notified about {injuredCount} injured area{injuredCount > 1 ? 's' : ''}.
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={submit}
          className="btn-ghost"
          style={{ flex: markedCount > 0 ? 1 : 2, padding: '0.875rem', fontSize: '0.95rem' }}
          disabled={saving}>
          {markedCount === 0 ? 'All good — start workout' : 'Skip'}
        </button>
        {markedCount > 0 && (
          <button
            onClick={submit}
            className="btn-volt"
            style={{ flex: 2, padding: '0.875rem', fontSize: '0.95rem' }}
            disabled={saving}>
            {saving ? 'Saving…' : `Submit & start workout`}
          </button>
        )}
      </div>
    </div>
  )
}
