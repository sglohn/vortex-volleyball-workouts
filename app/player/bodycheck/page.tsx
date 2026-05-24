'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Status = 'sore' | 'injured'
type RegionMap = Record<string, Status>

interface Region {
  id: string; label: string
  fx: number; fy: number  // front silhouette coords (viewBox 0-100)
  bx: number; by: number  // back silhouette coords
}

const REGIONS: Region[] = [
  { id: 'head',           label: 'Head',            fx: 50,  fy: 7,   bx: 50,  by: 7   },
  { id: 'neck',           label: 'Neck',            fx: 50,  fy: 14,  bx: 50,  by: 14  },
  { id: 'left_shoulder',  label: 'L. Shoulder',     fx: 36,  fy: 21,  bx: 36,  by: 21  },
  { id: 'right_shoulder', label: 'R. Shoulder',     fx: 64,  fy: 21,  bx: 64,  by: 21  },
  { id: 'chest',          label: 'Chest',           fx: 50,  fy: 27,  bx: 999, by: 999 },
  { id: 'upper_back',     label: 'Upper back',      fx: 999, fy: 999, bx: 50,  by: 24  },
  { id: 'left_elbow',     label: 'L. Elbow',        fx: 30,  fy: 35,  bx: 30,  by: 35  },
  { id: 'right_elbow',    label: 'R. Elbow',        fx: 70,  fy: 35,  bx: 70,  by: 35  },
  { id: 'core',           label: 'Core / Abs',      fx: 50,  fy: 36,  bx: 999, by: 999 },
  { id: 'lower_back',     label: 'Lower back',      fx: 999, fy: 999, bx: 50,  by: 36  },
  { id: 'left_wrist',     label: 'L. Wrist',        fx: 26,  fy: 47,  bx: 26,  by: 47  },
  { id: 'right_wrist',    label: 'R. Wrist',        fx: 74,  fy: 47,  bx: 74,  by: 47  },
  { id: 'left_hip',       label: 'L. Hip',          fx: 40,  fy: 48,  bx: 40,  by: 48  },
  { id: 'right_hip',      label: 'R. Hip',          fx: 60,  fy: 48,  bx: 60,  by: 48  },
  { id: 'left_quad',      label: 'L. Quad',         fx: 39,  fy: 60,  bx: 999, by: 999 },
  { id: 'right_quad',     label: 'R. Quad',         fx: 61,  fy: 60,  bx: 999, by: 999 },
  { id: 'left_hamstring', label: 'L. Hamstring',    fx: 999, fy: 999, bx: 39,  by: 60  },
  { id: 'right_hamstring',label: 'R. Hamstring',    fx: 999, fy: 999, bx: 61,  by: 60  },
  { id: 'left_knee',      label: 'L. Knee',         fx: 39,  fy: 73,  bx: 39,  by: 73  },
  { id: 'right_knee',     label: 'R. Knee',         fx: 61,  fy: 73,  bx: 61,  by: 73  },
  { id: 'left_calf',      label: 'L. Calf',         fx: 38,  fy: 83,  bx: 38,  by: 83  },
  { id: 'right_calf',     label: 'R. Calf',         fx: 62,  fy: 83,  bx: 62,  by: 83  },
  { id: 'left_ankle',     label: 'L. Ankle',        fx: 37,  fy: 94,  bx: 37,  by: 94  },
  { id: 'right_ankle',    label: 'R. Ankle',        fx: 63,  fy: 94,  bx: 63,  by: 94  },
]

// Human body path data for front and back silhouettes
// All paths drawn in a 100×100 unit space, scaled by SVG
const FRONT_PATH = `
M 50 2
C 45 2 42 5 42 9 C 42 14 45 16 50 17 C 55 16 58 14 58 9 C 58 5 55 2 50 2 Z
M 47 17 C 44 17 41 18 40 20
L 35 19 C 32 18 29 20 28 23 L 25 35 C 24 38 26 40 28 40 L 30 32 L 31 44
C 28 44 26 46 26 48 L 26 50 C 25 52 26 54 28 54 L 29 50 L 30 48
L 31 58 C 28 60 27 63 28 66 L 29 70 C 27 72 26 75 27 79 L 29 91
C 29 93 31 95 33 95 L 35 95 C 37 95 38 93 38 91 L 37 79 L 38 71
L 40 55 L 41 45
L 43 17 Z
M 53 17 L 57 17
L 59 45 L 60 55 L 62 71 L 63 79 L 62 91
C 62 93 63 95 65 95 L 67 95 C 69 95 71 93 71 91 L 73 79
C 74 75 73 72 71 70 L 72 66 C 73 63 72 60 69 58 L 70 48 L 71 50 L 72 54
C 74 54 75 52 74 50 L 74 48 C 74 46 72 44 69 44 L 70 32 L 72 40
C 74 40 76 38 75 35 L 72 23 C 71 20 68 18 65 19 L 60 20 C 59 18 56 17 53 17 Z
M 40 55 L 36 55 L 36 73 C 36 73 38 75 39 73 Z
M 60 55 L 64 55 L 64 73 C 64 73 62 75 61 73 Z
`

const BACK_PATH = `
M 50 2
C 45 2 42 5 42 9 C 42 14 45 16 50 17 C 55 16 58 14 58 9 C 58 5 55 2 50 2 Z
M 47 17 C 44 17 41 18 40 20
L 35 19 C 32 18 29 20 28 23 L 25 35 C 24 38 26 40 28 40 L 30 32 L 31 44
C 28 44 26 46 26 48 L 26 50 C 25 52 26 54 28 54 L 29 50 L 30 48
L 31 58 C 28 60 27 63 28 66 L 29 70 C 27 72 26 75 27 79 L 29 91
C 29 93 31 95 33 95 L 35 95 C 37 95 38 93 38 91 L 37 79 L 38 71
L 40 55 L 41 45
L 43 17 Z
M 53 17 L 57 17
L 59 45 L 60 55 L 62 71 L 63 79 L 62 91
C 62 93 63 95 65 95 L 67 95 C 69 95 71 93 71 91 L 73 79
C 74 75 73 72 71 70 L 72 66 C 73 63 72 60 69 58 L 70 48 L 71 50 L 72 54
C 74 54 75 52 74 50 L 74 48 C 74 46 72 44 69 44 L 70 32 L 72 40
C 74 40 76 38 75 35 L 72 23 C 71 20 68 18 65 19 L 60 20 C 59 18 56 17 53 17 Z
M 40 55 L 36 55 L 36 73 C 36 73 38 75 39 73 Z
M 60 55 L 64 55 L 64 73 C 64 73 62 75 61 73 Z
`

function regionColor(status: Status | undefined) {
  if (status === 'injured') return '#ef4444'
  if (status === 'sore')    return '#facc15'
  return 'rgba(160,180,165,0.35)'
}

function BodySilhouette({ side, regions: regionMap, onTap }: {
  side: 'front' | 'back'
  regions: RegionMap
  onTap: (id: string) => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const relevant = REGIONS.filter(r => side === 'front' ? r.fx < 900 : r.bx < 900)

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <div style={{ fontSize: '0.68rem', color: 'rgba(160,180,165,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center', marginBottom: '0.4rem', fontWeight: 600 }}>
        {side}
      </div>
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: 'auto', display: 'block' }} xmlns="http://www.w3.org/2000/svg">
        {/* Silhouette base */}
        <path d={side === 'front' ? FRONT_PATH : BACK_PATH}
          fill="rgba(90,110,95,0.55)" stroke="rgba(74,222,128,0.25)" strokeWidth="0.4" fillRule="evenodd"/>

        {/* Clickable hotspots */}
        {relevant.map(r => {
          const cx = side === 'front' ? r.fx : r.bx
          const cy = side === 'front' ? r.fy : r.by
          const status = regionMap[r.id]
          const isHovered = hovered === r.id
          const hasStatus = !!status
          return (
            <g key={r.id}
              onClick={() => onTap(r.id)}
              onMouseEnter={() => setHovered(r.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}>
              <circle
                cx={cx} cy={cy} r={isHovered ? 5 : 4}
                fill={hasStatus ? regionColor(status) : isHovered ? 'rgba(74,222,128,0.5)' : 'rgba(74,222,128,0.15)'}
                stroke={hasStatus ? regionColor(status) : isHovered ? 'rgba(74,222,128,0.9)' : 'rgba(74,222,128,0.4)'}
                strokeWidth="0.5"
                style={{ transition: 'all 0.12s' }}/>
              {/* Label for hovered or marked */}
              {(isHovered || hasStatus) && (
                <>
                  <line
                    x1={cx} y1={cy - (isHovered ? 5 : 4)}
                    x2={cx} y2={cy - 9}
                    stroke={hasStatus ? regionColor(status) : 'rgba(74,222,128,0.7)'}
                    strokeWidth="0.4"/>
                  <rect
                    x={cx - 13} y={cy - 16} width={26} height={6} rx="1"
                    fill="rgba(10,15,13,0.85)"
                    stroke={hasStatus ? regionColor(status) : 'rgba(74,222,128,0.4)'}
                    strokeWidth="0.3"/>
                  <text
                    x={cx} y={cy - 12}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="3.2" fontWeight="600"
                    fill={hasStatus ? regionColor(status) : 'rgba(200,220,205,0.95)'}
                    fontFamily="system-ui, sans-serif">
                    {r.label}
                  </text>
                </>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function BodyCheckPage() {
  const router = useRouter()
  const [session, setSession] = useState<{ sessionId: string; playerId: string; playerName: string; isResumed?: boolean } | null>(null)
  const [regions, setRegions] = useState<RegionMap>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('vx_session')
    if (!stored) { router.push('/'); return }
    setSession(JSON.parse(stored))
  }, [router])

  function tapRegion(id: string) {
    setRegions(prev => {
      const cur = prev[id]
      if (!cur) return { ...prev, [id]: 'sore' }
      if (cur === 'sore') return { ...prev, [id]: 'injured' }
      const next = { ...prev }; delete next[id]; return next
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
      const stored = localStorage.getItem('vx_session')
      if (stored) {
        const s = JSON.parse(stored); s.hasHealthFlags = true
        localStorage.setItem('vx_session', JSON.stringify(s))
      }
    }
    router.push('/player/workout')
  }

  const markedCount = Object.keys(regions).length
  const injuredCount = Object.values(regions).filter(v => v === 'injured').length
  const firstName = session?.playerName?.split(' ')[0] ?? ''

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.25rem 1rem', background: 'var(--court-bg)' }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: 500, marginBottom: '1rem' }} className="fade-up">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0f0d" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.08em', color: 'var(--volt)' }}>VORTEX S&C</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.2rem' }}>
          {session?.isResumed ? `Welcome back${firstName ? ', ' + firstName : ''}` : `Pre-workout check${firstName ? ', ' + firstName : ''}`}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          Tap any area that feels off. Once = sore, twice = injured, three times = clear.
        </p>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem' }}>
        {[
          { color: 'rgba(74,222,128,0.5)', label: 'Fine' },
          { color: '#facc15', label: 'Sore' },
          { color: '#ef4444', label: 'Injured' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Dual silhouette */}
      <div style={{ width: '100%', maxWidth: 460, display: 'flex', gap: '1.5rem', marginBottom: '1rem', alignItems: 'flex-start' }}>
        <BodySilhouette side="front" regions={regions} onTap={tapRegion} />
        {/* Divider */}
        <div style={{ width: 1, background: 'var(--court-border)', alignSelf: 'stretch', flexShrink: 0, marginTop: '1.5rem' }} />
        <BodySilhouette side="back" regions={regions} onTap={tapRegion} />
      </div>

      {/* Marked summary */}
      {markedCount > 0 && (
        <div style={{ width: '100%', maxWidth: 460, marginBottom: '0.875rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.4rem' }}>
            {Object.entries(regions).map(([id, status]) => {
              const r = REGIONS.find(r => r.id === id)
              return (
                <span key={id} onClick={() => tapRegion(id)} style={{ fontSize: '0.75rem', padding: '0.2rem 0.625rem', borderRadius: 4, background: status === 'injured' ? 'rgba(239,68,68,0.15)' : 'rgba(250,204,21,0.15)', color: status === 'injured' ? '#ef4444' : '#ca8a04', fontWeight: 600, cursor: 'pointer' }}>
                  {status === 'injured' ? '⚠ ' : '~ '}{r?.label ?? id}
                </span>
              )
            })}
          </div>
          {injuredCount > 0 && (
            <p style={{ fontSize: '0.75rem', color: '#ef4444' }}>
              Your coach will be notified about {injuredCount} injured area{injuredCount > 1 ? 's' : ''}.
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ width: '100%', maxWidth: 460, display: 'flex', gap: '0.75rem' }}>
        {markedCount === 0 ? (
          <button onClick={submit} className="btn-volt" style={{ flex: 1, padding: '0.875rem', fontSize: '0.95rem' }} disabled={saving}>
            All good — start workout →
          </button>
        ) : (
          <>
            <button onClick={submit} className="btn-ghost" style={{ flex: 1, padding: '0.875rem', fontSize: '0.9rem' }} disabled={saving}>Skip</button>
            <button onClick={submit} className="btn-volt" style={{ flex: 2, padding: '0.875rem', fontSize: '0.95rem' }} disabled={saving}>
              {saving ? 'Saving…' : 'Submit & start workout'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
