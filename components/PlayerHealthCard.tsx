// components/PlayerHealthCard.tsx
// Drop-in replacement for the Health card on the coach player profile page.
// Usage:
//   import PlayerHealthCard from '@/components/PlayerHealthCard'
//   <PlayerHealthCard healthReports={healthReports} playerId={id} onUpdate={() => reload()} />

'use client'
import { useState } from 'react'
import { painLevelColor, painLevelLabel } from '@/lib/fitness'

// ─── Body map data (mirrored from player/bodycheck) ───────────────────────────

const BODY_PATH = `M104.265,117.959c-0.304,3.58,2.126,22.529,3.38,29.959c0.597,3.52,2.234,9.255,1.645,12.3c-0.841,4.244-1.084,9.736-0.621,12.934c0.292,1.942,1.211,10.899-0.104,14.175c-0.688,1.718-1.949,10.522-1.949,10.522c-3.285,8.294-1.431,7.886-1.431,7.886c1.017,1.248,2.759,0.098,2.759,0.098c1.327,0.846,2.246-0.201,2.246-0.201c1.139,0.943,2.467-0.116,2.467-0.116c1.431,0.743,2.758-0.627,2.758-0.627c0.822,0.414,1.023-0.109,1.023-0.109c2.466-0.158-1.376-8.05-1.376-8.05c-0.92-7.088,0.913-11.033,0.913-11.033c6.004-17.805,6.309-22.53,3.909-29.24c-0.676-1.937-0.847-2.704-0.536-3.545c0.719-1.941,0.195-9.748,1.072-12.848c1.692-5.979,3.361-21.142,4.231-28.217c1.169-9.53-4.141-22.308-4.141-22.308c-1.163-5.2,0.542-23.727,0.542-23.727c2.381,3.705,2.29,10.245,2.29,10.245c-0.378,6.859,5.541,17.342,5.541,17.342c2.844,4.332,3.921,8.442,3.921,8.747c0,1.248-0.273,4.269-0.273,4.269l0.109,2.631c0.049,0.67,0.426,2.977,0.365,4.092c-0.444,6.862,0.646,5.571,0.646,5.571c0.92,0,1.931-5.522,1.931-5.522c0,1.424-0.348,5.687,0.42,7.295c0.919,1.918,1.595-0.329,1.607-0.78c0.243-8.737,0.768-6.448,0.768-6.448c0.511,7.088,1.139,8.689,2.265,8.135c0.853-0.407,0.073-8.506,0.073-8.506c1.461,4.811,2.569,5.577,2.569,5.577c2.411,1.693,0.92-2.983,0.585-3.909c-1.784-4.92-1.839-6.625-1.839-6.625c2.229,4.421,3.909,4.257,3.909,4.257c2.174-0.694-1.9-6.954-4.287-9.953c-1.218-1.528-2.789-3.574-3.245-4.789c-0.743-2.058-1.304-8.674-1.304-8.674c-0.225-7.807-2.155-11.198-2.155-11.198c-3.3-5.282-3.921-15.135-3.921-15.135l-0.146-16.635c-1.157-11.347-9.518-11.429-9.518-11.429c-8.451-1.258-9.627-3.988-9.627-3.988c-1.79-2.576-0.767-7.514-0.767-7.514c1.485-1.208,2.058-4.415,2.058-4.415c2.466-1.891,2.345-4.658,1.206-4.628c-0.914,0.024-0.707-0.733-0.707-0.733C115.068,0.636,104.01,0,104.01,0h-1.688c0,0-11.063,0.636-9.523,13.089c0,0,0.207,0.758-0.715,0.733c-1.136-0.03-1.242,2.737,1.215,4.628c0,0,0.572,3.206,2.058,4.415c0,0,1.023,4.938-0.767,7.514c0,0-1.172,2.73-9.627,3.988c0,0-8.375,0.082-9.514,11.429l-0.158,16.635c0,0-0.609,9.853-3.922,15.135c0,0-1.921,3.392-2.143,11.198c0,0-0.563,6.616-1.303,8.674c-0.451,1.209-2.021,3.255-3.249,4.789c-2.408,2.993-6.455,9.24-4.29,9.953c0,0,1.689,0.164,3.909-4.257c0,0-0.046,1.693-1.827,6.625c-0.35,0.914-1.839,5.59,0.573,3.909c0,0,1.117-0.767,2.569-5.577c0,0-0.779,8.099,0.088,8.506c1.133,0.555,1.751-1.047,2.262-8.135c0,0,0.524-2.289,0.767,6.448c0.012,0.451,0.673,2.698,1.596,0.78c0.779-1.608,0.429-5.864,0.429-7.295c0,0,0.999,5.522,1.933,5.522c0,0,1.099,1.291,0.648-5.571c-0.073-1.121,0.32-3.422,0.369-4.092l0.106-2.631c0,0-0.274-3.014-0.274-4.269c0-0.311,1.078-4.415,3.921-8.747c0,0,5.913-10.488,5.532-17.342c0,0-0.082-6.54,2.299-10.245c0,0,1.69,18.526,0.545,23.727c0,0-5.319,12.778-4.146,22.308c0.864,7.094,2.53,22.237,4.226,28.217c0.886,3.094,0.362,10.899,1.072,12.848c0.32,0.847,0.152,1.627-0.536,3.545c-2.387,6.71-2.083,11.436,3.921,29.24c0,0,1.848,3.945,0.914,11.033c0,0-3.836,7.892-1.379,8.05c0,0,0.192,0.523,1.023,0.109c0,0,1.327,1.37,2.761,0.627c0,0,1.328,1.06,2.463,0.116c0,0,0.91,1.047,2.237,0.201c0,0,1.742,1.175,2.777-0.098c0,0,1.839,0.408-1.435-7.886c0,0-1.254-8.793-1.945-10.522c-1.318-3.275-0.387-12.251-0.106-14.175c0.453-3.216,0.21-8.695-0.618-12.934c-0.606-3.038,1.035-8.774,1.641-12.3c1.245-7.423,3.685-26.373,3.38-29.959l1.008,0.354C103.809,118.312,104.265,117.959,104.265,117.959z`

interface ZoneDef { id: string; label: string; x: number; y: number; w: number; h: number }

const FRONT_ZONES: ZoneDef[] = [
  { id:'head',       label:'Head',        x:88,  y:2,   w:28, h:18 },
  { id:'neck',       label:'Neck',        x:92,  y:21,  w:20, h:9  },
  { id:'r_shoulder', label:'R. Shoulder', x:71,  y:30,  w:30, h:21 },
  { id:'l_shoulder', label:'L. Shoulder', x:103, y:30,  w:30, h:21 },
  { id:'chest',      label:'Chest',       x:85,  y:42,  w:34, h:28 },
  { id:'r_elbow',    label:'R. Elbow',    x:66,  y:64,  w:22, h:16 },
  { id:'l_elbow',    label:'L. Elbow',    x:116, y:64,  w:22, h:16 },
  { id:'core',       label:'Core',        x:86,  y:71,  w:32, h:22 },
  { id:'r_wrist',    label:'R. Wrist',    x:59,  y:86,  w:23, h:16 },
  { id:'l_wrist',    label:'L. Wrist',    x:122, y:86,  w:23, h:16 },
  { id:'r_hip',      label:'R. Hip',      x:77,  y:94,  w:24, h:20 },
  { id:'l_hip',      label:'L. Hip',      x:103, y:94,  w:24, h:20 },
  { id:'r_quad',     label:'R. Quad',     x:78,  y:115, w:23, h:26 },
  { id:'l_quad',     label:'L. Quad',     x:103, y:115, w:23, h:26 },
  { id:'r_knee',     label:'R. Knee',     x:73,  y:142, w:28, h:22 },
  { id:'l_knee',     label:'L. Knee',     x:103, y:142, w:28, h:22 },
  { id:'r_shin',     label:'R. Shin',     x:83,  y:165, w:18, h:22 },
  { id:'l_shin',     label:'L. Shin',     x:103, y:165, w:18, h:22 },
  { id:'r_ankle',    label:'R. Ankle',    x:72,  y:188, w:29, h:24 },
  { id:'l_ankle',    label:'L. Ankle',    x:103, y:188, w:29, h:24 },
]

const BACK_ZONES: ZoneDef[] = [
  { id:'upper_back',  label:'Upper Back',   x:85,  y:42,  w:34, h:28 },
  { id:'lower_back',  label:'Lower Back',   x:86,  y:71,  w:32, h:22 },
  { id:'r_glute',     label:'R. Glute',     x:77,  y:94,  w:24, h:20 },
  { id:'l_glute',     label:'L. Glute',     x:103, y:94,  w:24, h:20 },
  { id:'r_hamstring', label:'R. Hamstring', x:78,  y:115, w:23, h:26 },
  { id:'l_hamstring', label:'L. Hamstring', x:103, y:115, w:23, h:26 },
  { id:'r_calf',      label:'R. Calf',      x:83,  y:165, w:18, h:22 },
  { id:'l_calf',      label:'L. Calf',      x:103, y:165, w:18, h:22 },
]

const ALL_ZONES = [...FRONT_ZONES, ...BACK_ZONES]

// ─── Maps body_part strings from health_reports → zone ids ───────────────────
// Handles both coach-logged ("Left Knee") and player body-check ("r_knee") formats

function bodyPartToZoneIds(bodyPart: string): string[] {
  const bp = bodyPart.toLowerCase()

  // Player body-check format (already a zone id like "r_knee")
  if (ALL_ZONES.some(z => z.id === bp)) return [bp]

  // Coach-logged format: extract side + part
  const hasLeft  = bp.startsWith('left ')
  const hasRight = bp.startsWith('right ')
  const hasBoth  = bp.startsWith('bilateral ')
  const core = bp.replace(/^(left |right |bilateral )/, '').trim()

  const PART_MAP: Record<string, string[]> = {
    'knee':       ['r_knee',    'l_knee'],
    'ankle':      ['r_ankle',   'l_ankle'],
    'shoulder':   ['r_shoulder','l_shoulder'],
    'hip':        ['r_hip',     'l_hip'],
    'elbow':      ['r_elbow',   'l_elbow'],
    'wrist':      ['r_wrist',   'l_wrist'],
    'quad':       ['r_quad',    'l_quad'],
    'hamstring':  ['r_hamstring','l_hamstring'],
    'calf':       ['r_calf',    'l_calf'],
    'glute':      ['r_glute',   'l_glute'],
    'shin':       ['r_shin',    'l_shin'],
    'finger':     ['r_wrist',   'l_wrist'], // approximate
    'foot':       ['r_ankle',   'l_ankle'], // approximate
    'lower back': ['lower_back'],
    'upper back': ['upper_back'],
    'back':       ['upper_back','lower_back'],
    'neck':       ['neck'],
    'head':       ['head'],
    'chest':      ['chest'],
    'core':       ['core'],
  }

  const candidates = PART_MAP[core] ?? []
  if (!candidates.length) return []

  if (hasBoth || (!hasLeft && !hasRight && candidates.length === 2)) return candidates
  if (hasLeft)  return [candidates[1]] // l_ is index 1
  if (hasRight) return [candidates[0]] // r_ is index 0
  return candidates
}

// ─── Zone classification ──────────────────────────────────────────────────────

const JOINT_ZONE_IDS = new Set([
  'r_knee','l_knee','r_ankle','l_ankle','r_shoulder','l_shoulder',
  'r_hip','l_hip','r_elbow','l_elbow','r_wrist','l_wrist','neck','head',
])
const MUSCLE_ZONE_IDS = new Set([
  'r_quad','l_quad','r_hamstring','l_hamstring','r_calf','l_calf',
  'r_glute','l_glute','r_shin','l_shin','chest','core','upper_back','lower_back',
])

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthReport {
  id: string
  body_part: string
  report_type: string
  injury_type?: string
  severity?: string
  description?: string
  pain_level?: number
  coach_notes?: string
  expected_return?: string
  reported_at: string
  resolved_at?: string
  reported_by: string
  status: string
}

interface BodyCheck {
  regions: Record<string, string> // zone_id → 'sore' | 'injured'
  checked_at: string
}

type PlayerStatus = 'active' | 'adjusted' | 'inactive'

interface Props {
  healthReports: HealthReport[]
  bodyChecks: BodyCheck[]
  playerId: string
  onUpdate: () => void
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<PlayerStatus, { label: string; color: string; bg: string; border: string; desc: string }> = {
  active:   { label: 'Active',    color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.3)',  desc: 'Fully participating' },
  adjusted: { label: 'Adjusted',  color: '#facc15', bg: 'rgba(250,204,21,0.12)', border: 'rgba(250,204,21,0.35)', desc: 'Modified participation' },
  inactive: { label: 'Inactive',  color: '#f87171', bg: 'rgba(248,113,113,0.12)',border: 'rgba(248,113,113,0.3)', desc: 'Not participating' },
}

function deriveStatus(reports: HealthReport[]): PlayerStatus {
  const current = reports.filter(r => r.status === 'active' || r.status === 'monitoring')
  if (!current.length) return 'active'
  const hasSevere   = current.some(r => r.severity === 'severe')
  const hasModerate = current.some(r => r.severity === 'moderate' || r.report_type === 'major_injury')
  if (hasSevere) return 'inactive'
  if (hasModerate) return 'adjusted'
  return 'adjusted' // any current issue = at least adjusted
}

// ─── Figure sub-component ────────────────────────────────────────────────────

function Figure({ zones, redZones, orangeZones, yellowZones, recurringZones, mirror = false }: {
  zones: ZoneDef[]
  redZones: Set<string>
  orangeZones: Set<string>
  yellowZones: Set<string>
  recurringZones: Set<string>
  mirror?: boolean
}) {
  const VB = 206.326
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <path d={BODY_PATH} fill="#1e2736" stroke="#2d3f52" strokeWidth="0.8"
        transform={mirror ? `scale(-1,1) translate(-${VB},0)` : undefined} />
      {zones.map(z => {
        const isRed      = redZones.has(z.id)
        const isOrange   = orangeZones.has(z.id)
        const isYellow   = yellowZones.has(z.id)
        const isRecurring = recurringZones.has(z.id)
        // Priority: red > orange > yellow > recurring
        const fill   = isRed ? 'rgba(239,68,68,0.4)'
                     : isOrange ? 'rgba(249,115,22,0.4)'
                     : isYellow ? 'rgba(250,204,21,0.35)'
                     : isRecurring ? 'rgba(250,204,21,0.15)'
                     : null
        const stroke = isRed ? '#ef4444'
                     : isOrange ? '#f97316'
                     : isYellow ? '#facc15'
                     : isRecurring ? 'rgba(250,204,21,0.4)'
                     : null
        if (!fill) return null
        return (
          <rect key={z.id} x={z.x} y={z.y} width={z.w} height={z.h} rx={3}
            fill={fill} stroke={stroke!} strokeWidth={1.5} />
        )
      })}
    </svg>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlayerHealthCard({ healthReports, bodyChecks, playerId, onUpdate }: Props) {
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>(() => deriveStatus(healthReports))

  const currentReports  = healthReports.filter(r => r.status === 'active' || r.status === 'monitoring')
  const resolvedReports = healthReports.filter(r => r.status === 'resolved')

  // ── Muscle soreness pattern analysis from body_checks ────────────────────
  // Count how many times each muscle zone was flagged sore in the last 30 days
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const recentChecks = bodyChecks.filter(c => new Date(c.checked_at).getTime() > thirtyDaysAgo)

  // zone_id → count of sore flags in last 30 days (muscles only)
  const muscleSoreCounts: Record<string, number> = {}
  for (const check of recentChecks) {
    for (const [zoneId, status] of Object.entries(check.regions)) {
      if (!MUSCLE_ZONE_IDS.has(zoneId)) continue
      if (status === 'sore' || status === 'injured') {
        muscleSoreCounts[zoneId] = (muscleSoreCounts[zoneId] ?? 0) + 1
      }
    }
  }
  // Muscles flagged 4+ times in 30 days = recurring pattern worth noting
  const recurringMuscleSoreness = Object.entries(muscleSoreCounts)
    .filter(([, count]) => count >= 4)
    .sort((a, b) => b[1] - a[1])

  // Muscles flagged 1–3 times = routine soreness, show in awareness section only
  const routineMuscleSoreness = Object.entries(muscleSoreCounts)
    .filter(([, count]) => count >= 1 && count < 4)
    .sort((a, b) => b[1] - a[1])

  // Zone label lookup
  function zoneLabel(zoneId: string): string {
    return ALL_ZONES.find(z => z.id === zoneId)?.label ?? zoneId
  }

  // Classify each current report into red / orange / yellow
  // Red    = severe severity
  // Orange = moderate severity OR major_injury type with no severity set
  // Yellow = mild severity OR nagging_pain OR monitoring status
  function reportColor(r: HealthReport): 'red' | 'orange' | 'yellow' {
    if (r.severity === 'severe') return 'red'
    if (r.severity === 'moderate') return 'orange'
    if (r.report_type === 'major_injury' && !r.severity) return 'orange'
    return 'yellow'
  }

  const redZones    = new Set<string>()
  const orangeZones = new Set<string>()
  const yellowZones = new Set<string>()
  const recurringZones = new Set<string>()

  for (const r of currentReports) {
    const color = reportColor(r)
    for (const zid of bodyPartToZoneIds(r.body_part)) {
      if (color === 'red')    redZones.add(zid)
      else if (color === 'orange') orangeZones.add(zid)
      else yellowZones.add(zid)
    }
  }

  // Recurring = resolved history zones not currently flagged at any level
  const allCurrentZones = new Set([...redZones, ...orangeZones, ...yellowZones])
  for (const r of resolvedReports) {
    for (const zid of bodyPartToZoneIds(r.body_part)) {
      if (!allCurrentZones.has(zid)) recurringZones.add(zid)
    }
  }

  // Recurring muscle soreness (4+ times in 30 days) also gets yellow on map
  // — doesn't override a coach-logged report color if that zone is already classified
  for (const [zoneId] of recurringMuscleSoreness) {
    if (!allCurrentZones.has(zoneId)) yellowZones.add(zoneId)
  }

  const cfg = STATUS_CONFIG[playerStatus]

  async function updateReport(id: string, status: string) {
    setSaving(true)
    await fetch('/api/player/health', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, confirmedByCoach: true, status }),
    })
    onUpdate()
    setSaving(false)
  }

  async function deleteReport(id: string) {
    await fetch('/api/player/health', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    onUpdate()
  }

  async function savePlayerStatus(s: PlayerStatus) {
    setPlayerStatus(s)
    // Persist on player record if you add a player_status column later
    // For now it's derived + overrideable locally per page load
  }

  return (
    <div className="card" style={{ padding: '1.25rem' }}>

      {/* ── Header row: title + status badge ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '0.5rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: currentReports.length ? '#f87171' : undefined }}>
          Health {currentReports.length > 0 && <span className="tag tag-danger" style={{ fontSize: '0.65rem' }}>{currentReports.length}</span>}
        </h2>

        {/* Status picker */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Status</div>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {(Object.entries(STATUS_CONFIG) as [PlayerStatus, typeof cfg][]).map(([key, c]) => (
              <button key={key} onClick={() => savePlayerStatus(key)}
                style={{ padding: '0.2rem 0.55rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${playerStatus === key ? c.color : 'var(--court-border)'}`, background: playerStatus === key ? c.bg : 'transparent', color: playerStatus === key ? c.color : 'var(--text-muted)', transition: 'all 0.12s', letterSpacing: '0.02em' }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body map ── */}
      <div style={{ background: '#0d1117', borderRadius: 10, padding: '0.5rem', marginBottom: '0.875rem', border: '1px solid rgba(255,255,255,0.06)' }}>

        {/* Front/Back toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.25rem', marginBottom: '0.4rem' }}>
          {(['front', 'back'] as const).map(s => (
            <button key={s} onClick={() => setSide(s)}
              style={{ padding: '0.2rem 0.75rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, background: side === s ? 'rgba(86,160,211,0.3)' : 'transparent', color: side === s ? 'var(--carolina)' : 'rgba(255,255,255,0.3)', transition: 'all 0.12s' }}>
              {s === 'front' ? 'Front' : 'Back'}
            </button>
          ))}
        </div>

        {/* Figures side by side */}
        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
          <div style={{ width: '45%', maxWidth: 90 }}>
            <Figure
              zones={side === 'front' ? FRONT_ZONES : BACK_ZONES}
              redZones={redZones} orangeZones={orangeZones} yellowZones={yellowZones}
              recurringZones={recurringZones}
            />
          </div>
          <div style={{ width: '45%', maxWidth: 90 }}>
            <Figure
              zones={side === 'front' ? FRONT_ZONES : BACK_ZONES}
              redZones={redZones} orangeZones={orangeZones} yellowZones={yellowZones}
              recurringZones={recurringZones}
              mirror
            />
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { color: '#ef4444', bg: 'rgba(239,68,68,0.4)',    label: 'Stop' },
            { color: '#f97316', bg: 'rgba(249,115,22,0.4)',   label: 'Adjust' },
            { color: '#facc15', bg: 'rgba(250,204,21,0.35)',  label: 'Monitor' },
            { color: 'rgba(250,204,21,0.4)', bg: 'rgba(250,204,21,0.15)', label: 'History' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: l.bg, border: `1.5px solid ${l.color}` }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Active reports ── */}
      {currentReports.length === 0 && resolvedReports.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No health history.</p>
      )}

      {currentReports.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#f87171', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>Current</div>
          {currentReports.map(r => (
            <ReportRow key={r.id} r={r} expanded={expanded === r.id} onToggle={() => setExpanded(expanded === r.id ? null : r.id)} onUpdate={updateReport} onDelete={deleteReport} saving={saving} />
          ))}
        </div>
      )}

      {/* ── Resolved history ── */}
      {resolvedReports.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>History ({resolvedReports.length})</div>
          {resolvedReports.slice(0, 5).map(r => (
            <ReportRow key={r.id} r={r} expanded={expanded === r.id} onToggle={() => setExpanded(expanded === r.id ? null : r.id)} onUpdate={updateReport} onDelete={deleteReport} saving={saving} resolved />
          ))}
          {resolvedReports.length > 5 && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingLeft: '0.25rem' }}>+ {resolvedReports.length - 5} more resolved</div>
          )}
        </div>
      )}

      {/* ── Player-reported soreness awareness ── */}
      {(recurringMuscleSoreness.length > 0 || routineMuscleSoreness.length > 0) && (
        <div style={{ borderTop: '1px solid var(--court-border)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--carolina)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
            Player Self-Report — Last 30 Days
          </div>

          {recurringMuscleSoreness.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.68rem', color: '#facc15', fontWeight: 600, marginBottom: '0.3rem' }}>
                Recurring muscle soreness — consider adjusting load
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {recurringMuscleSoreness.map(([zoneId, count]) => (
                  <div key={zoneId} style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: 20, background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.3)', color: '#facc15', fontWeight: 600 }}>
                    {zoneLabel(zoneId)} <span style={{ opacity: 0.7 }}>×{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {routineMuscleSoreness.length > 0 && (
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.3rem' }}>
                Routine muscle soreness — normal training response
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {routineMuscleSoreness.map(([zoneId, count]) => (
                  <div key={zoneId} style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--court-border)', color: 'var(--text-muted)' }}>
                    {zoneLabel(zoneId)} <span style={{ opacity: 0.6 }}>×{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Report row sub-component ─────────────────────────────────────────────────

const SEVERITY_COLOR: Record<string, string> = { mild: '#facc15', moderate: '#f97316', severe: '#f87171' }

function ReportRow({ r, expanded, onToggle, onUpdate, onDelete, saving, resolved }: {
  r: HealthReport
  expanded: boolean
  onToggle: () => void
  onUpdate: (id: string, status: string) => void
  onDelete: (id: string) => void
  saving: boolean
  resolved?: boolean
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div style={{ background: resolved ? 'transparent' : 'rgba(248,113,113,0.06)', border: `1px solid ${resolved ? 'var(--court-border)' : 'rgba(248,113,113,0.18)'}`, borderRadius: 8, marginBottom: '0.4rem', overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ width: '100%', background: 'none', border: 'none', padding: '0.6rem 0.75rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: resolved ? 'var(--text-secondary)' : '#f87171', flexShrink: 0 }}>{r.body_part}</span>
          {r.injury_type && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.injury_type}</span>}
          {r.severity && <span style={{ fontSize: '0.7rem', fontWeight: 700, color: SEVERITY_COLOR[r.severity] ?? 'var(--text-muted)' }}>{r.severity}</span>}
          {resolved && <span style={{ fontSize: '0.68rem', color: '#4ade80', fontWeight: 600 }}>✓ Resolved</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{new Date(r.reported_at).toLocaleDateString()}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 0.75rem 0.75rem', borderTop: '1px solid var(--court-border)' }}>
          {r.description && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '0.5rem 0 0.25rem' }}>"{r.description}"</p>}
          {r.pain_level != null && <p style={{ fontSize: '0.78rem', color: painLevelColor(r.pain_level), margin: '0.25rem 0' }}>Pain: {r.pain_level}/10 — {painLevelLabel(r.pain_level)}</p>}
          {r.coach_notes && <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.25rem 0' }}>📋 {r.coach_notes}</p>}
          {r.expected_return && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>Est. return: {new Date(r.expected_return + 'T12:00:00').toLocaleDateString()}</p>}
          {r.resolved_at && <p style={{ fontSize: '0.75rem', color: '#4ade80', margin: '0.25rem 0' }}>Resolved: {new Date(r.resolved_at).toLocaleDateString()}</p>}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.625rem' }}>
            {!resolved ? (
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                <button onClick={() => onUpdate(r.id, 'monitoring')} disabled={saving} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', borderColor: '#facc15', color: '#facc15' }}>Monitoring</button>
                <button onClick={() => onUpdate(r.id, 'resolved')} disabled={saving} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', borderColor: '#4ade80', color: '#4ade80' }}>Mark Resolved</button>
              </div>
            ) : <div />}

            {/* Delete */}
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.4)', cursor: 'pointer', fontSize: '0.72rem', padding: '0.25rem 0.375rem', borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(248,113,113,0.4)')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                Delete
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Delete this report?</span>
                <button onClick={() => onDelete(r.id)} style={{ background: 'none', border: '1px solid #f87171', color: '#f87171', borderRadius: 4, padding: '0.2rem 0.5rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}>Yes</button>
                <button onClick={() => setConfirmDelete(false)} style={{ background: 'none', border: '1px solid var(--court-border)', color: 'var(--text-muted)', borderRadius: 4, padding: '0.2rem 0.5rem', fontSize: '0.72rem', cursor: 'pointer' }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
