'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type RegionStatus = 'sore' | 'injured'
type RegionMap = Record<string, RegionStatus>

interface Region {
  id: string
  label: string
  cx: number
  cy: number
  rx: number
  ry: number
}

// Regions mapped to a 200x400 viewBox human figure
const REGIONS: Region[] = [
  { id: 'head',          label: 'Head / Neck',         cx: 100, cy: 28,  rx: 18, ry: 20 },
  { id: 'left_shoulder', label: 'Left Shoulder',        cx: 68,  cy: 72,  rx: 14, ry: 13 },
  { id: 'right_shoulder',label: 'Right Shoulder',       cx: 132, cy: 72,  rx: 14, ry: 13 },
  { id: 'chest',         label: 'Chest',                cx: 100, cy: 95,  rx: 22, ry: 16 },
  { id: 'upper_back',    label: 'Upper Back',           cx: 100, cy: 118, rx: 18, ry: 12 },
  { id: 'left_elbow',    label: 'Left Elbow',           cx: 52,  cy: 118, rx: 12, ry: 11 },
  { id: 'right_elbow',   label: 'Right Elbow',          cx: 148, cy: 118, rx: 12, ry: 11 },
  { id: 'core',          label: 'Core / Abs',           cx: 100, cy: 148, rx: 18, ry: 15 },
  { id: 'lower_back',    label: 'Lower Back',           cx: 100, cy: 172, rx: 16, ry: 12 },
  { id: 'left_wrist',    label: 'Left Wrist / Hand',    cx: 38,  cy: 155, rx: 11, ry: 10 },
  { id: 'right_wrist',   label: 'Right Wrist / Hand',   cx: 162, cy: 155, rx: 11, ry: 10 },
  { id: 'left_hip',      label: 'Left Hip',             cx: 76,  cy: 192, rx: 14, ry: 13 },
  { id: 'right_hip',     label: 'Right Hip',            cx: 124, cy: 192, rx: 14, ry: 13 },
  { id: 'left_quad',     label: 'Left Quad',            cx: 76,  cy: 228, rx: 13, ry: 20 },
  { id: 'right_quad',    label: 'Right Quad',           cx: 124, cy: 228, rx: 13, ry: 20 },
  { id: 'left_hamstring',label: 'Left Hamstring',       cx: 76,  cy: 255, rx: 12, ry: 16 },
  { id: 'right_hamstring',label:'Right Hamstring',      cx: 124, cy: 255, rx: 12, ry: 16 },
  { id: 'left_knee',     label: 'Left Knee',            cx: 76,  cy: 282, rx: 12, ry: 11 },
  { id: 'right_knee',    label: 'Right Knee',           cx: 124, cy: 282, rx: 12, ry: 11 },
  { id: 'left_calf',     label: 'Left Calf / Shin',     cx: 76,  cy: 315, rx: 11, ry: 18 },
  { id: 'right_calf',    label: 'Right Calf / Shin',    cx: 124, cy: 315, rx: 11, ry: 18 },
  { id: 'left_ankle',    label: 'Left Ankle / Foot',    cx: 76,  cy: 348, rx: 12, ry: 10 },
  { id: 'right_ankle',   label: 'Right Ankle / Foot',   cx: 124, cy: 348, rx: 12, ry: 10 },
]

export default function BodyCheckPage() {
  const router = useRouter()
  const [session, setSession] = useState<{ sessionId: string; playerId: string; playerName: string; isResumed?: boolean } | null>(null)
  const [regions, setRegions] = useState<RegionMap>({})
  const [saving, setSaving] = useState(false)
  const [tooltip, setTooltip] = useState<{ label: string; x: number; y: number } | null>(null)

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
        const s = JSON.parse(stored)
        s.hasHealthFlags = true
        localStorage.setItem('vx_session', JSON.stringify(s))
      }
    }
    router.push('/player/workout')
  }

  const markedCount = Object.keys(regions).length
  const injuredCount = Object.values(regions).filter(v => v === 'injured').length

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.25rem 1rem', background: 'var(--court-bg)' }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: 440, marginBottom: '1rem' }} className="fade-up">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--volt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0a0f0d" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.08em', color: 'var(--volt)' }}>VORTEX S&C</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.2rem' }}>
          {session?.isResumed ? 'Welcome back' : 'Pre-workout check'}{session?.playerName ? `, ${session.playerName.split(' ')[0]}` : ''}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          Tap any area that feels off today. Tap once for sore, twice for injured, three times to clear.
        </p>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.875rem' }}>
        {[
          { color: 'rgba(74,222,128,0.15)', stroke: 'rgba(74,222,128,0.35)', label: 'Fine' },
          { color: 'rgba(250,204,21,0.4)',  stroke: '#facc15',               label: 'Sore' },
          { color: 'rgba(239,68,68,0.4)',   stroke: '#ef4444',               label: 'Injured' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill={l.color} stroke={l.stroke} strokeWidth="1.5"/></svg>
            {l.label}
          </div>
        ))}
      </div>

      {/* Body + tooltip wrapper */}
      <div style={{ position: 'relative', width: '100%', maxWidth: 300, marginBottom: '0.5rem' }}>
        <svg viewBox="0 0 200 380" style={{ width: '100%', height: 'auto', display: 'block' }} xmlns="http://www.w3.org/2000/svg">

          {/* ── Human silhouette ── */}
          <g fill="none" stroke="rgba(74,222,128,0.22)" strokeWidth="1.2" strokeLinejoin="round">
            {/* Head */}
            <ellipse cx="100" cy="28" rx="17" ry="20"/>
            {/* Neck */}
            <path d="M93 47 L93 58 L107 58 L107 47"/>
            {/* Torso */}
            <path d="M68 58 Q60 62 58 72 L52 170 Q60 178 100 180 Q140 178 148 170 L142 72 Q140 62 132 58 Z"/>
            {/* Left upper arm */}
            <path d="M68 68 Q54 72 48 90 L44 118 Q46 126 52 128 L58 100 Q62 80 72 74"/>
            {/* Left forearm */}
            <path d="M52 128 Q46 138 40 148 L36 158 Q38 164 44 164 L48 154 Q54 144 58 134"/>
            {/* Right upper arm */}
            <path d="M132 68 Q146 72 152 90 L156 118 Q154 126 148 128 L142 100 Q138 80 128 74"/>
            {/* Right forearm */}
            <path d="M148 128 Q154 138 160 148 L164 158 Q162 164 156 164 L152 154 Q146 144 142 134"/>
            {/* Left hand */}
            <path d="M36 158 Q32 162 34 168 Q36 172 42 170 L44 164"/>
            {/* Right hand */}
            <path d="M164 158 Q168 162 166 168 Q164 172 158 170 L156 164"/>
            {/* Left thigh */}
            <path d="M84 180 Q76 182 72 196 L66 248 Q68 258 76 260 L80 248 Q84 234 88 200 L92 182"/>
            {/* Right thigh */}
            <path d="M116 182 Q112 182 112 200 L116 248 Q124 258 124 260 L132 248 L128 196 Q124 182 124 180"/>
            {/* Left knee bump */}
            <path d="M66 248 Q62 268 64 278 Q68 290 76 292 Q84 290 86 278 Q88 268 84 258"/>
            {/* Right knee bump */}
            <path d="M116 258 Q112 268 114 278 Q118 290 124 292 Q132 290 134 278 Q136 268 132 248"/>
            {/* Left calf */}
            <path d="M64 278 Q60 300 62 320 L66 340 Q72 348 76 348 L80 340 L82 320 Q84 300 86 278"/>
            {/* Right calf */}
            <path d="M114 278 Q110 300 112 320 L116 340 Q122 348 124 348 L128 340 L132 320 Q134 300 134 278"/>
            {/* Left foot */}
            <path d="M62 340 Q58 350 60 356 Q64 360 76 360 L82 356 Q82 350 80 342"/>
            {/* Right foot */}
            <path d="M112 342 Q110 350 110 356 Q114 360 126 360 L132 356 Q134 350 130 340"/>
          </g>

          {/* ── Clickable hotspots ── */}
          {REGIONS.map(region => {
            const status = regions[region.id]
            const fill   = status === 'injured' ? 'rgba(239,68,68,0.45)'   : status === 'sore' ? 'rgba(250,204,21,0.45)'  : 'rgba(74,222,128,0.07)'
            const stroke = status === 'injured' ? '#ef4444'                : status === 'sore' ? '#facc15'                : 'rgba(74,222,128,0.2)'
            const sw     = status ? 2 : 1
            return (
              <g key={region.id}
                onClick={() => tapRegion(region.id)}
                onMouseEnter={e => {
                  const svg = (e.currentTarget.ownerSVGElement as SVGSVGElement)
                  const pt  = svg.createSVGPoint()
                  pt.x = region.cx; pt.y = region.cy - region.ry - 4
                  const screen = pt.matrixTransform(svg.getScreenCTM()!)
                  const container = svg.parentElement!.getBoundingClientRect()
                  setTooltip({ label: region.label, x: screen.x - container.left, y: screen.y - container.top })
                }}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: 'pointer' }}>
                <ellipse cx={region.cx} cy={region.cy} rx={region.rx} ry={region.ry}
                  fill={fill} stroke={stroke} strokeWidth={sw}/>
                {status && (
                  <text x={region.cx} y={region.cy} textAnchor="middle" dominantBaseline="central"
                    fontSize="11" fontWeight="800"
                    fill={status === 'injured' ? '#ef4444' : '#ca8a04'}>
                    {status === 'injured' ? '!' : '~'}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Floating tooltip */}
        {tooltip && (
          <div style={{ position: 'absolute', left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)', pointerEvents: 'none', background: 'var(--court-raised)', border: '1px solid var(--court-border)', borderRadius: 6, padding: '0.2rem 0.625rem', fontSize: '0.72rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
            {tooltip.label}
          </div>
        )}
      </div>

      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '1rem', textAlign: 'center' }}>
        Tap once = sore &nbsp;·&nbsp; tap again = injured &nbsp;·&nbsp; tap again = clear
      </p>

      {/* Marked summary */}
      {markedCount > 0 && (
        <div style={{ width: '100%', maxWidth: 440, marginBottom: '0.875rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
            {Object.entries(regions).map(([id, status]) => {
              const r = REGIONS.find(r => r.id === id)
              return (
                <span key={id} onClick={() => tapRegion(id)} style={{ fontSize: '0.75rem', padding: '0.2rem 0.625rem', borderRadius: 4, background: status === 'injured' ? 'rgba(239,68,68,0.15)' : 'rgba(250,204,21,0.15)', color: status === 'injured' ? '#ef4444' : '#ca8a04', fontWeight: 600, cursor: 'pointer' }}>
                  {status === 'injured' ? '⚠' : '~'} {r?.label ?? id}
                </span>
              )
            })}
          </div>
          {injuredCount > 0 && (
            <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.5rem' }}>
              Your coach will be notified about {injuredCount} injured area{injuredCount > 1 ? 's' : ''}.
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ width: '100%', maxWidth: 440, display: 'flex', gap: '0.75rem' }}>
        {markedCount === 0 ? (
          <button onClick={submit} className="btn-volt" style={{ flex: 1, padding: '0.875rem', fontSize: '0.95rem' }} disabled={saving}>
            All good — start workout →
          </button>
        ) : (
          <>
            <button onClick={submit} className="btn-ghost" style={{ flex: 1, padding: '0.875rem', fontSize: '0.9rem' }} disabled={saving}>
              Skip
            </button>
            <button onClick={submit} className="btn-volt" style={{ flex: 2, padding: '0.875rem', fontSize: '0.95rem' }} disabled={saving}>
              {saving ? 'Saving…' : 'Submit & start workout'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
