'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Status = 'sore' | 'injured'
type RegionMap = Record<string, Status>

const SILHOUETTE = 'https://wlqmwqofworfazqzistx.supabase.co/storage/v1/object/public/exercise-media/body-silhouette.png'

// Hotspot positions as % of the image container
// Image has front figure on left half, back figure on right half
// Each zone: { id, label, left%, top%, width%, height% }
const ZONES = [
  // ── FRONT (left half of image, 0–50%) ──
  { id: 'head',            label: 'Head / Neck',      l: 12, t:  2, w: 10, h:  9 },
  { id: 'left_shoulder',   label: 'Left Shoulder',    l:  5, t: 13, w:  7, h:  6 },
  { id: 'right_shoulder',  label: 'Right Shoulder',   l: 20, t: 13, w:  7, h:  6 },
  { id: 'chest',           label: 'Chest',            l:  9, t: 19, w: 14, h:  8 },
  { id: 'left_elbow',      label: 'Left Elbow',       l:  3, t: 27, w:  6, h:  5 },
  { id: 'right_elbow',     label: 'Right Elbow',      l: 23, t: 27, w:  6, h:  5 },
  { id: 'core',            label: 'Core / Abs',       l:  9, t: 28, w: 14, h:  8 },
  { id: 'left_wrist',      label: 'Left Wrist',       l:  1, t: 36, w:  5, h:  5 },
  { id: 'right_wrist',     label: 'Right Wrist',      l: 26, t: 36, w:  5, h:  5 },
  { id: 'left_hip',        label: 'Left Hip',         l:  9, t: 37, w:  6, h:  6 },
  { id: 'right_hip',       label: 'Right Hip',        l: 17, t: 37, w:  6, h:  6 },
  { id: 'left_quad',       label: 'Left Quad',        l:  9, t: 44, w:  6, h: 12 },
  { id: 'right_quad',      label: 'Right Quad',       l: 17, t: 44, w:  6, h: 12 },
  { id: 'left_knee',       label: 'Left Knee',        l:  9, t: 57, w:  6, h:  5 },
  { id: 'right_knee',      label: 'Right Knee',       l: 17, t: 57, w:  6, h:  5 },
  { id: 'left_shin',       label: 'Left Shin',        l:  9, t: 63, w:  5, h: 10 },
  { id: 'right_shin',      label: 'Right Shin',       l: 17, t: 63, w:  5, h: 10 },
  { id: 'left_ankle',      label: 'Left Ankle / Foot',l:  9, t: 74, w:  6, h:  6 },
  { id: 'right_ankle',     label: 'Right Ankle / Foot',l:17, t: 74, w:  6, h:  6 },

  // ── BACK (right half of image, 50–100%) ──
  { id: 'upper_back',      label: 'Upper Back',       l: 59, t: 19, w: 14, h:  8 },
  { id: 'lower_back',      label: 'Lower Back',       l: 59, t: 28, w: 14, h:  7 },
  { id: 'left_hamstring',  label: 'Left Hamstring',   l: 59, t: 44, w:  6, h: 12 },
  { id: 'right_hamstring', label: 'Right Hamstring',  l: 67, t: 44, w:  6, h: 12 },
  { id: 'left_glute',      label: 'Left Glute',       l: 59, t: 37, w:  6, h:  7 },
  { id: 'right_glute',     label: 'Right Glute',      l: 67, t: 37, w:  6, h:  7 },
  { id: 'left_calf',       label: 'Left Calf',        l: 59, t: 63, w:  5, h: 10 },
  { id: 'right_calf',      label: 'Right Calf',       l: 67, t: 63, w:  5, h: 10 },
]

function statusColor(s: Status) {
  return s === 'injured' ? '#ef4444' : '#facc15'
}
function statusBg(s: Status) {
  return s === 'injured' ? 'rgba(239,68,68,0.35)' : 'rgba(250,204,21,0.35)'
}

export default function BodyCheckPage() {
  const router = useRouter()
  const [session, setSession] = useState<{ sessionId: string; playerId: string; playerName: string; isResumed?: boolean } | null>(null)
  const [regions, setRegions] = useState<RegionMap>({})
  const [hovered, setHovered] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('vx_session')
    if (!stored) { router.push('/'); return }
    setSession(JSON.parse(stored))
  }, [router])

  function tap(id: string) {
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
      <div style={{ width: '100%', maxWidth: 520, marginBottom: '0.875rem' }} className="fade-up">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0f0d" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.08em', color: 'var(--volt)' }}>VORTEX S&C</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.15rem' }}>
          {session?.isResumed ? `Welcome back${firstName ? ', ' + firstName : ''}` : `Pre-workout check${firstName ? ', ' + firstName : ''}`}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Tap any area that feels off. Once = sore · twice = injured · three times = clear.
        </p>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '0.75rem', alignSelf: 'flex-start', maxWidth: 520, width: '100%' }}>
        {[
          { color: 'rgba(74,222,128,0.6)', border: 'rgba(74,222,128,0.4)', label: 'Fine (hover to see)' },
          { color: 'rgba(250,204,21,0.5)', border: '#facc15', label: 'Sore' },
          { color: 'rgba(239,68,68,0.5)',  border: '#ef4444', label: 'Injured' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color, border: `1.5px solid ${l.border}`, flexShrink: 0 }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Labels: FRONT / BACK */}
      <div style={{ width: '100%', maxWidth: 520, display: 'flex', marginBottom: '0.3rem' }}>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Front</div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Back</div>
      </div>

      {/* Silhouette + hotspots */}
      <div style={{ width: '100%', maxWidth: 520, position: 'relative', marginBottom: '0.875rem' }}>
        {/* The actual silhouette image */}
        <img
          src={SILHOUETTE}
          alt="Body silhouette front and back"
          style={{ width: '100%', display: 'block', userSelect: 'none', WebkitUserSelect: 'none', filter: 'brightness(0) invert(0.7)' }}
          draggable={false}
        />

        {/* Invisible hotspot zones layered on top */}
        {ZONES.map(zone => {
          const status = regions[zone.id]
          const isHovered = hovered === zone.id
          const isActive = !!status || isHovered

          return (
            <div
              key={zone.id}
              onClick={() => tap(zone.id)}
              onMouseEnter={() => setHovered(zone.id)}
              onMouseLeave={() => setHovered(null)}
              onTouchStart={() => setHovered(zone.id)}
              onTouchEnd={() => setHovered(null)}
              style={{
                position: 'absolute',
                left: `${zone.l}%`,
                top: `${zone.t}%`,
                width: `${zone.w}%`,
                height: `${zone.h}%`,
                cursor: 'pointer',
                borderRadius: 4,
                background: status ? statusBg(status) : isHovered ? 'rgba(74,222,128,0.25)' : 'transparent',
                border: isActive ? `1.5px solid ${status ? statusColor(status) : 'rgba(74,222,128,0.7)'}` : '1.5px solid transparent',
                transition: 'background 0.1s, border-color 0.1s',
                zIndex: 2,
              }}
            >
              {/* Tooltip label shown on hover or when marked */}
              {isActive && (
                <div style={{
                  position: 'absolute',
                  bottom: '110%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(10,15,13,0.92)',
                  border: `1px solid ${status ? statusColor(status) : 'rgba(74,222,128,0.5)'}`,
                  borderRadius: 5,
                  padding: '2px 7px',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  color: status ? statusColor(status) : '#d4ddd5',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 10,
                }}>
                  {status === 'injured' ? '⚠ ' : status === 'sore' ? '~ ' : ''}{zone.label}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Marked summary chips */}
      {markedCount > 0 && (
        <div style={{ width: '100%', maxWidth: 520, marginBottom: '0.875rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.35rem' }}>
            {Object.entries(regions).map(([id, status]) => {
              const zone = ZONES.find(z => z.id === id)
              return (
                <span
                  key={id}
                  onClick={() => tap(id)}
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.625rem', borderRadius: 4, background: status === 'injured' ? 'rgba(239,68,68,0.15)' : 'rgba(250,204,21,0.15)', color: status === 'injured' ? '#ef4444' : '#ca8a04', fontWeight: 600, cursor: 'pointer', border: `1px solid ${status === 'injured' ? 'rgba(239,68,68,0.3)' : 'rgba(250,204,21,0.3)'}` }}>
                  {status === 'injured' ? '⚠ ' : '~ '}{zone?.label ?? id}
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
      <div style={{ width: '100%', maxWidth: 520, display: 'flex', gap: '0.75rem' }}>
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
