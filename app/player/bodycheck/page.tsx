'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Status = 'sore' | 'injured'
type RegionMap = Record<string, Status>

const SILHOUETTE = 'https://wlqmwqofworfazqzistx.supabase.co/storage/v1/object/public/exercise-media/body-silhouette.png'

// The image has 4 figures side by side: male front, male back, female front, female back
// We use male front (left quarter) and male back (second quarter)
// Coordinates in % of total image width/height
// l = left%, t = top%, w = width%, h = height%
// label positions: lx/ly = center of the label text in % (can be outside the zone for callout style)

const ZONES: Array<{
  id: string; label: string
  l: number; t: number; w: number; h: number
  // label anchor: which side of the zone to place text
  side: 'left' | 'right'
}> = [
  // ── FRONT figure occupies roughly x: 0–25% of image ──
  { id: 'head',            label: 'Head',          l: 8.5, t:  1,   w: 8,   h: 8.5,  side: 'right' },
  { id: 'neck',            label: 'Neck',          l: 10,  t:  9.5, w: 5.5, h: 3.5,  side: 'right' },
  { id: 'left_shoulder',   label: 'L. Shoulder',   l: 4,   t: 13,   w: 6,   h: 5,    side: 'left'  },
  { id: 'right_shoulder',  label: 'R. Shoulder',   l: 15.5,t: 13,   w: 6,   h: 5,    side: 'right' },
  { id: 'chest',           label: 'Chest',         l: 8,   t: 18,   w: 9.5, h: 7,    side: 'left'  },
  { id: 'left_elbow',      label: 'L. Elbow',      l: 1.5, t: 25,   w: 5,   h: 5,    side: 'left'  },
  { id: 'right_elbow',     label: 'R. Elbow',      l: 19,  t: 25,   w: 5,   h: 5,    side: 'right' },
  { id: 'core',            label: 'Core',          l: 8.5, t: 25,   w: 8.5, h: 8,    side: 'left'  },
  { id: 'left_wrist',      label: 'L. Wrist',      l: 0,   t: 33,   w: 4.5, h: 5,    side: 'left'  },
  { id: 'right_wrist',     label: 'R. Wrist',      l: 21,  t: 33,   w: 4.5, h: 5,    side: 'right' },
  { id: 'left_hip',        label: 'L. Hip',        l: 8,   t: 33.5, w: 4.5, h: 5.5,  side: 'left'  },
  { id: 'right_hip',       label: 'R. Hip',        l: 13,  t: 33.5, w: 4.5, h: 5.5,  side: 'right' },
  { id: 'left_quad',       label: 'L. Quad',       l: 8,   t: 39.5, w: 4.5, h: 11,   side: 'left'  },
  { id: 'right_quad',      label: 'R. Quad',       l: 13,  t: 39.5, w: 4.5, h: 11,   side: 'right' },
  { id: 'left_knee',       label: 'L. Knee',       l: 8,   t: 51,   w: 4.5, h: 5,    side: 'left'  },
  { id: 'right_knee',      label: 'R. Knee',       l: 13,  t: 51,   w: 4.5, h: 5,    side: 'right' },
  { id: 'left_shin',       label: 'L. Shin',       l: 8,   t: 56.5, w: 4,   h: 9,    side: 'left'  },
  { id: 'right_shin',      label: 'R. Shin',       l: 13,  t: 56.5, w: 4,   h: 9,    side: 'right' },
  { id: 'left_ankle',      label: 'L. Ankle',      l: 8,   t: 66,   w: 4.5, h: 5.5,  side: 'left'  },
  { id: 'right_ankle',     label: 'R. Ankle',      l: 13,  t: 66,   w: 4.5, h: 5.5,  side: 'right' },

  // ── BACK figure occupies roughly x: 25–50% of image ──
  { id: 'upper_back',      label: 'Upper Back',    l: 32,  t: 18,   w: 9.5, h: 6,    side: 'right' },
  { id: 'lower_back',      label: 'Lower Back',    l: 32,  t: 24.5, w: 9.5, h: 5.5,  side: 'right' },
  { id: 'left_glute',      label: 'L. Glute',      l: 32,  t: 33,   w: 4.5, h: 6,    side: 'left'  },
  { id: 'right_glute',     label: 'R. Glute',      l: 37,  t: 33,   w: 4.5, h: 6,    side: 'right' },
  { id: 'left_hamstring',  label: 'L. Hamstring',  l: 32,  t: 39.5, w: 4.5, h: 11,   side: 'left'  },
  { id: 'right_hamstring', label: 'R. Hamstring',  l: 37,  t: 39.5, w: 4.5, h: 11,   side: 'right' },
  { id: 'left_calf',       label: 'L. Calf',       l: 32,  t: 56.5, w: 4,   h: 9,    side: 'left'  },
  { id: 'right_calf',      label: 'R. Calf',       l: 37,  t: 56.5, w: 4,   h: 9,    side: 'right' },
]

function statusColor(s: Status) { return s === 'injured' ? '#ef4444' : '#facc15' }
function statusBg(s: Status)    { return s === 'injured' ? 'rgba(239,68,68,0.3)' : 'rgba(250,204,21,0.3)' }

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
      <div style={{ width: '100%', maxWidth: 560, marginBottom: '0.75rem' }} className="fade-up">
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
          Tap a body part · once = sore · twice = injured · three times = clear
        </p>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '0.5rem', alignSelf: 'flex-start', maxWidth: 560, width: '100%' }}>
        {[
          { color: 'rgba(74,222,128,0.4)', border: 'rgba(74,222,128,0.6)', label: 'Tap to mark' },
          { color: 'rgba(250,204,21,0.4)', border: '#facc15',              label: 'Sore' },
          { color: 'rgba(239,68,68,0.4)',  border: '#ef4444',              label: 'Injured' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color, border: `1.5px solid ${l.border}`, flexShrink: 0 }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* FRONT / BACK labels */}
      <div style={{ width: '100%', maxWidth: 560, display: 'flex', marginBottom: '0.2rem' }}>
        <div style={{ width: '50%', textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Front</div>
        <div style={{ width: '50%', textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Back</div>
      </div>

      {/* Image + hotspots — only show front half and back half (left 50% of image) */}
      <div style={{ width: '100%', maxWidth: 560, position: 'relative', marginBottom: '0.75rem', overflow: 'hidden' }}>

        {/* Crop to just the first two figures (left 50% of image) */}
        <div style={{ position: 'relative', paddingBottom: '100%' /* will be overridden */ }}>
          <img
            src={SILHOUETTE}
            alt="Body silhouette front and back"
            style={{
              width: '200%',        // show full image at 200% so left 50% fills container
              maxWidth: 'none',
              display: 'block',
              filter: 'brightness(0) invert(0.65)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
            draggable={false}
          />
        </div>

        {/* Hotspot zones — coordinates are % of the cropped container (left 50% of original) */}
        {/* So we multiply original l% by 2, and w% by 2 */}
        {ZONES.map(zone => {
          const status = regions[zone.id]
          const isHovered = hovered === zone.id
          const isActive = !!status || isHovered

          // Scale coords: original image l/w are % of full image, cropped shows left 50%
          // So in cropped space: l_cropped = zone.l * 2, w_cropped = zone.w * 2
          const lc = zone.l * 2
          const wc = zone.w * 2

          const activeColor = status ? statusColor(status) : 'rgba(74,222,128,0.9)'
          const activeBg = status ? statusBg(status) : 'rgba(74,222,128,0.18)'

          return (
            <div
              key={zone.id}
              onClick={() => tap(zone.id)}
              onMouseEnter={() => setHovered(zone.id)}
              onMouseLeave={() => setHovered(null)}
              onTouchStart={e => { e.preventDefault(); setHovered(zone.id); tap(zone.id) }}
              onTouchEnd={() => setTimeout(() => setHovered(null), 800)}
              style={{
                position: 'absolute',
                left: `${lc}%`,
                top: `${zone.t}%`,
                width: `${wc}%`,
                height: `${zone.h}%`,
                cursor: 'pointer',
                borderRadius: 3,
                background: isActive ? activeBg : 'transparent',
                border: `1px solid ${isActive ? activeColor : 'transparent'}`,
                transition: 'background 0.12s, border-color 0.12s',
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Always-visible label */}
              <span style={{
                position: 'absolute',
                // Place label to the side so it doesn't block the zone
                ...(zone.side === 'left'
                  ? { right: '105%', textAlign: 'right' }
                  : { left: '105%',  textAlign: 'left'  }
                ),
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '0.6rem',
                fontWeight: status ? 700 : 500,
                color: status ? statusColor(status) : isHovered ? 'var(--volt)' : 'rgba(160,185,165,0.75)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                lineHeight: 1.2,
                letterSpacing: '0.01em',
                transition: 'color 0.12s',
              }}>
                {zone.label}
              </span>

              {/* Status indicator dot in center of zone */}
              {status && (
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: statusColor(status),
                  flexShrink: 0,
                  boxShadow: `0 0 0 2px ${statusColor(status)}40`,
                }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Marked summary */}
      {markedCount > 0 && (
        <div style={{ width: '100%', maxWidth: 560, marginBottom: '0.875rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.35rem' }}>
            {Object.entries(regions).map(([id, status]) => {
              const zone = ZONES.find(z => z.id === id)
              return (
                <span key={id} onClick={() => tap(id)} style={{ fontSize: '0.75rem', padding: '0.2rem 0.625rem', borderRadius: 4, background: status === 'injured' ? 'rgba(239,68,68,0.15)' : 'rgba(250,204,21,0.15)', color: status === 'injured' ? '#ef4444' : '#ca8a04', fontWeight: 600, cursor: 'pointer', border: `1px solid ${status === 'injured' ? 'rgba(239,68,68,0.3)' : 'rgba(250,204,21,0.3)'}` }}>
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
      <div style={{ width: '100%', maxWidth: 560, display: 'flex', gap: '0.75rem' }}>
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
