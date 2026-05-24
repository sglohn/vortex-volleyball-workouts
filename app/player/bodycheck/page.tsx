'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Status = 'sore' | 'injured'
type RegionMap = Record<string, Status>

// SVG viewBox is 0 0 206.326 206.326
// Zones calibrated directly on that coordinate space
// Symmetrical: L/R zones mirror each other across center x=100
const ZONES = [
  // Center zones
  { id:'head',       label:'Head',        x:88,  y:1,   w:24, h:16, side:'right' as const },
  { id:'neck',       label:'Neck',        x:91,  y:17,  w:18, h:10, side:'right' as const },
  { id:'chest',      label:'Chest',       x:84,  y:28,  w:32, h:20, side:'left' as const  },
  { id:'core',       label:'Core',        x:84,  y:58,  w:32, h:24, side:'left' as const  },
  // Arms — beside torso
  { id:'r_shoulder', label:'R. Shoulder', x:70,  y:26,  w:28, h:22, side:'left' as const  },
  { id:'l_shoulder', label:'L. Shoulder', x:102, y:26,  w:28, h:22, side:'right' as const },
  { id:'r_elbow',    label:'R. Elbow',    x:64,  y:59,  w:18, h:18, side:'left' as const  },
  { id:'l_elbow',    label:'L. Elbow',    x:118, y:59,  w:18, h:18, side:'right' as const },
  { id:'r_wrist',    label:'R. Wrist',    x:64,  y:92,  w:16, h:10, side:'left' as const  },
  { id:'l_wrist',    label:'L. Wrist',    x:120, y:92,  w:16, h:10, side:'right' as const },
  // Lower body — split at midline
  { id:'r_hip',      label:'R. Hip',      x:81,  y:90,  w:18, h:14, side:'left' as const  },
  { id:'l_hip',      label:'L. Hip',      x:101, y:90,  w:18, h:14, side:'right' as const },
  { id:'r_quad',     label:'R. Quad',     x:82,  y:105, w:17, h:28, side:'left' as const  },
  { id:'l_quad',     label:'L. Quad',     x:101, y:105, w:17, h:28, side:'right' as const },
  { id:'r_knee',     label:'R. Knee',     x:83,  y:134, w:16, h:16, side:'left' as const  },
  { id:'l_knee',     label:'L. Knee',     x:101, y:134, w:16, h:16, side:'right' as const },
  { id:'r_shin',     label:'R. Shin',     x:86,  y:151, w:13, h:28, side:'left' as const  },
  { id:'l_shin',     label:'L. Shin',     x:101, y:151, w:13, h:28, side:'right' as const },
  { id:'r_ankle',    label:'R. Ankle',    x:84,  y:180, w:15, h:18, side:'left' as const  },
  { id:'l_ankle',    label:'L. Ankle',    x:101, y:180, w:15, h:18, side:'right' as const },
]

// Back-only zones (shown on right figure)
const BACK_ZONES = [
  { id:'upper_back',     label:'Upper back',    x:84,  y:28,  w:32, h:20, side:'right' as const },
  { id:'lower_back',     label:'Lower back',    x:84,  y:58,  w:32, h:24, side:'right' as const },
  { id:'r_glute',        label:'R. Glute',      x:81,  y:90,  w:18, h:14, side:'left' as const  },
  { id:'l_glute',        label:'L. Glute',      x:101, y:90,  w:18, h:14, side:'right' as const },
  { id:'r_hamstring',    label:'R. Hamstring',  x:82,  y:105, w:17, h:28, side:'left' as const  },
  { id:'l_hamstring',    label:'L. Hamstring',  x:101, y:105, w:17, h:28, side:'right' as const },
  { id:'r_calf',         label:'R. Calf',       x:86,  y:151, w:13, h:28, side:'left' as const  },
  { id:'l_calf',         label:'L. Calf',       x:101, y:151, w:13, h:28, side:'right' as const },
]

const BODY_PATH = `M104.265,117.959c-0.304,3.58,2.126,22.529,3.38,29.959c0.597,3.52,2.234,9.255,1.645,12.3c-0.841,4.244-1.084,9.736-0.621,12.934c0.292,1.942,1.211,10.899-0.104,14.175c-0.688,1.718-1.949,10.522-1.949,10.522c-3.285,8.294-1.431,7.886-1.431,7.886c1.017,1.248,2.759,0.098,2.759,0.098c1.327,0.846,2.246-0.201,2.246-0.201c1.139,0.943,2.467-0.116,2.467-0.116c1.431,0.743,2.758-0.627,2.758-0.627c0.822,0.414,1.023-0.109,1.023-0.109c2.466-0.158-1.376-8.05-1.376-8.05c-0.92-7.088,0.913-11.033,0.913-11.033c6.004-17.805,6.309-22.53,3.909-29.24c-0.676-1.937-0.847-2.704-0.536-3.545c0.719-1.941,0.195-9.748,1.072-12.848c1.692-5.979,3.361-21.142,4.231-28.217c1.169-9.53-4.141-22.308-4.141-22.308c-1.163-5.2,0.542-23.727,0.542-23.727c2.381,3.705,2.29,10.245,2.29,10.245c-0.378,6.859,5.541,17.342,5.541,17.342c2.844,4.332,3.921,8.442,3.921,8.747c0,1.248-0.273,4.269-0.273,4.269l0.109,2.631c0.049,0.67,0.426,2.977,0.365,4.092c-0.444,6.862,0.646,5.571,0.646,5.571c0.92,0,1.931-5.522,1.931-5.522c0,1.424-0.348,5.687,0.42,7.295c0.919,1.918,1.595-0.329,1.607-0.78c0.243-8.737,0.768-6.448,0.768-6.448c0.511,7.088,1.139,8.689,2.265,8.135c0.853-0.407,0.073-8.506,0.073-8.506c1.461,4.811,2.569,5.577,2.569,5.577c2.411,1.693,0.92-2.983,0.585-3.909c-1.784-4.92-1.839-6.625-1.839-6.625c2.229,4.421,3.909,4.257,3.909,4.257c2.174-0.694-1.9-6.954-4.287-9.953c-1.218-1.528-2.789-3.574-3.245-4.789c-0.743-2.058-1.304-8.674-1.304-8.674c-0.225-7.807-2.155-11.198-2.155-11.198c-3.3-5.282-3.921-15.135-3.921-15.135l-0.146-16.635c-1.157-11.347-9.518-11.429-9.518-11.429c-8.451-1.258-9.627-3.988-9.627-3.988c-1.79-2.576-0.767-7.514-0.767-7.514c1.485-1.208,2.058-4.415,2.058-4.415c2.466-1.891,2.345-4.658,1.206-4.628c-0.914,0.024-0.707-0.733-0.707-0.733C115.068,0.636,104.01,0,104.01,0h-1.688c0,0-11.063,0.636-9.523,13.089c0,0,0.207,0.758-0.715,0.733c-1.136-0.03-1.242,2.737,1.215,4.628c0,0,0.572,3.206,2.058,4.415c0,0,1.023,4.938-0.767,7.514c0,0-1.172,2.73-9.627,3.988c0,0-8.375,0.082-9.514,11.429l-0.158,16.635c0,0-0.609,9.853-3.922,15.135c0,0-1.921,3.392-2.143,11.198c0,0-0.563,6.616-1.303,8.674c-0.451,1.209-2.021,3.255-3.249,4.789c-2.408,2.993-6.455,9.24-4.29,9.953c0,0,1.689,0.164,3.909-4.257c0,0-0.046,1.693-1.827,6.625c-0.35,0.914-1.839,5.59,0.573,3.909c0,0,1.117-0.767,2.569-5.577c0,0-0.779,8.099,0.088,8.506c1.133,0.555,1.751-1.047,2.262-8.135c0,0,0.524-2.289,0.767,6.448c0.012,0.451,0.673,2.698,1.596,0.78c0.779-1.608,0.429-5.864,0.429-7.295c0,0,0.999,5.522,1.933,5.522c0,0,1.099,1.291,0.648-5.571c-0.073-1.121,0.32-3.422,0.369-4.092l0.106-2.631c0,0-0.274-3.014-0.274-4.269c0-0.311,1.078-4.415,3.921-8.747c0,0,5.913-10.488,5.532-17.342c0,0-0.082-6.54,2.299-10.245c0,0,1.69,18.526,0.545,23.727c0,0-5.319,12.778-4.146,22.308c0.864,7.094,2.53,22.237,4.226,28.217c0.886,3.094,0.362,10.899,1.072,12.848c0.32,0.847,0.152,1.627-0.536,3.545c-2.387,6.71-2.083,11.436,3.921,29.24c0,0,1.848,3.945,0.914,11.033c0,0-3.836,7.892-1.379,8.05c0,0,0.192,0.523,1.023,0.109c0,0,1.327,1.37,2.761,0.627c0,0,1.328,1.06,2.463,0.116c0,0,0.91,1.047,2.237,0.201c0,0,1.742,1.175,2.777-0.098c0,0,1.839,0.408-1.435-7.886c0,0-1.254-8.793-1.945-10.522c-1.318-3.275-0.387-12.251-0.106-14.175c0.453-3.216,0.21-8.695-0.618-12.934c-0.606-3.038,1.035-8.774,1.641-12.3c1.245-7.423,3.685-26.373,3.38-29.959l1.008,0.354C103.809,118.312,104.265,117.959,104.265,117.959z`

function statusColor(s: Status) { return s === 'injured' ? '#ef4444' : '#facc15' }
function statusBg(s: Status)    { return s === 'injured' ? 'rgba(239,68,68,0.32)' : 'rgba(250,204,21,0.32)' }

interface ZoneDef { id: string; label: string; x: number; y: number; w: number; h: number; side: 'left'|'right' }

function BodyFigure({
  zones, regions, hovered, onTap, onHover, onLeave, mirror
}: {
  zones: ZoneDef[], regions: RegionMap, hovered: string|null
  onTap: (id:string)=>void, onHover:(id:string)=>void, onLeave:()=>void
  mirror?: boolean
}) {
  const vb = '0 0 206.326 206.326'
  const transform = mirror ? `scale(-1,1) translate(-206.326,0)` : undefined

  return (
    <svg viewBox={vb} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      {/* Silhouette */}
      <path d={BODY_PATH} fill="#3a5240" stroke="#527554" strokeWidth="0.5" transform={transform}/>

      {/* Zones */}
      {zones.map(z => {
        const status = regions[z.id]
        const isHov = hovered === z.id
        const active = !!status || isHov
        // Mirror zone x for back figure
        const zx = mirror ? (206.326 - z.x - z.w) : z.x
        const labelX = mirror
          ? (z.side === 'left' ? zx + z.w + 2 : zx - 2)
          : (z.side === 'right' ? z.x + z.w + 2 : z.x - 2)
        const labelAnchor = mirror
          ? (z.side === 'left' ? 'start' : 'end')
          : (z.side === 'right' ? 'start' : 'end')

        return (
          <g key={z.id}
            onClick={() => onTap(z.id)}
            onMouseEnter={() => onHover(z.id)}
            onMouseLeave={onLeave}
            style={{ cursor: 'pointer' }}>
            <rect
              x={zx} y={z.y} width={z.w} height={z.h} rx={2}
              fill={active ? statusBg(status ?? 'sore').replace('0.32', isHov && !status ? '0.18' : '0.32') : 'rgba(74,222,128,0.06)'}
              stroke={active ? (status ? statusColor(status) : 'rgba(74,222,128,0.8)') : 'rgba(74,222,128,0.22)'}
              strokeWidth={active ? 0.8 : 0.5}
            />
            {/* Always-visible label */}
            <text
              x={labelX}
              y={z.y + z.h / 2}
              textAnchor={labelAnchor}
              dominantBaseline="middle"
              fontSize="6"
              fontFamily="system-ui, sans-serif"
              fontWeight={status ? '700' : '500'}
              fill={status ? statusColor(status) : isHov ? '#4ade80' : 'rgba(160,190,165,0.75)'}
            >
              {z.label}
            </text>
            {/* Dot when marked */}
            {status && (
              <circle
                cx={zx + z.w / 2} cy={z.y + z.h / 2} r={2.5}
                fill={statusColor(status)}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function BodyCheckPage() {
  const router = useRouter()
  const [session, setSession] = useState<{ sessionId: string; playerId: string; playerName: string; isResumed?: boolean }|null>(null)
  const [regions, setRegions] = useState<RegionMap>({})
  const [hovered, setHovered] = useState<string|null>(null)
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
      if (stored) { const s = JSON.parse(stored); s.hasHealthFlags = true; localStorage.setItem('vx_session', JSON.stringify(s)) }
    }
    router.push('/player/workout')
  }

  const markedCount = Object.keys(regions).length
  const injuredCount = Object.values(regions).filter(v => v === 'injured').length
  const firstName = session?.playerName?.split(' ')[0] ?? ''

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.25rem 1rem', background: 'var(--court-bg)' }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: 500, marginBottom: '0.75rem' }} className="fade-up">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0f0d" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.08em', color: 'var(--volt)' }}>VORTEX S&C</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.15rem' }}>
          {session?.isResumed ? `Welcome back${firstName ? ', '+firstName : ''}` : `Pre-workout check${firstName ? ', '+firstName : ''}`}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Tap a body part · once = sore · twice = injured · three times = clear
        </p>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '0.625rem', alignSelf: 'flex-start', maxWidth: 500, width: '100%' }}>
        {[
          { color: 'rgba(74,222,128,0.4)', border: 'rgba(74,222,128,0.7)', label: 'Tap to mark' },
          { color: 'rgba(250,204,21,0.4)', border: '#facc15', label: 'Sore' },
          { color: 'rgba(239,68,68,0.4)',  border: '#ef4444', label: 'Injured' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color, border: `1.5px solid ${l.border}`, flexShrink: 0 }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Front / Back labels */}
      <div style={{ display: 'flex', width: '100%', maxWidth: 500, marginBottom: '0.2rem' }}>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Front</div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Back</div>
      </div>

      {/* Dual figure */}
      <div style={{ display: 'flex', gap: '1rem', width: '100%', maxWidth: 500, marginBottom: '0.875rem' }}>
        <div style={{ flex: 1 }}>
          <BodyFigure zones={ZONES} regions={regions} hovered={hovered} onTap={tap} onHover={setHovered} onLeave={() => setHovered(null)} />
        </div>
        <div style={{ width: 1, background: 'var(--court-border)', alignSelf: 'stretch', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <BodyFigure zones={BACK_ZONES} regions={regions} hovered={hovered} onTap={tap} onHover={setHovered} onLeave={() => setHovered(null)} mirror />
        </div>
      </div>

      {/* Marked summary */}
      {markedCount > 0 && (
        <div style={{ width: '100%', maxWidth: 500, marginBottom: '0.875rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.35rem' }}>
            {Object.entries(regions).map(([id, status]) => {
              const zone = [...ZONES, ...BACK_ZONES].find(z => z.id === id)
              return (
                <span key={id} onClick={() => tap(id)} style={{ fontSize: '0.75rem', padding: '0.2rem 0.625rem', borderRadius: 4, background: status === 'injured' ? 'rgba(239,68,68,0.15)' : 'rgba(250,204,21,0.15)', color: status === 'injured' ? '#ef4444' : '#ca8a04', fontWeight: 600, cursor: 'pointer', border: `1px solid ${status === 'injured' ? 'rgba(239,68,68,0.3)' : 'rgba(250,204,21,0.3)'}` }}>
                  {status === 'injured' ? '⚠ ' : '~ '}{zone?.label ?? id}
                </span>
              )
            })}
          </div>
          {injuredCount > 0 && (
            <p style={{ fontSize: '0.75rem', color: '#ef4444' }}>Your coach will be notified about {injuredCount} injured area{injuredCount > 1 ? 's' : ''}.</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ width: '100%', maxWidth: 500, display: 'flex', gap: '0.75rem' }}>
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
