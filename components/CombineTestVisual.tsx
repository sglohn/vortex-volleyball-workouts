// FILE: components/CombineTestVisual.tsx
//
// A small line drawing for each Combine Day test (lib/combine.ts), so
// players can see at a glance what's being measured:
//   Height          shoes on, standing tall against the wall, floor to top of head
//   Wingspan        arms straight out, fingertip to fingertip
//   Standing Reach  side-on, heels flat, one hand up
//   Block Touch     no steps, two-hand jump like a block
//   Approach Touch  full approach, one-hand reach at the top
//   Acceleration    ready stance, 5-yard sprint, timed
//   Agility         start at the net, 3 m to one attack line, 6 m to the other, 3 m back to the net
//   Swing Velocity  (optional test) arm swing past the radar gun
//
// The orange arrow is always what gets measured. Plain inline SVG using the
// site's colors, so it works on phones, Team Mode and the coach station with
// nothing to load.
//
// Used in components/CombineDay.tsx (big on the test screen, small on the
// test cards), components/CombineStation.tsx (next to the how-to) and the
// TV Display page on Combine Day (app/coach/display, `fit` in each tile,
// on a white panel; the Roku TV Display snapshot shows them too).
'use client'
import { useId } from 'react'
import type { CombineMetricKey } from '@/lib/combine'

const INK = 'var(--text-primary, #0f172a)'   // the athlete
const WALL = 'var(--gray-border, #cbd5e1)'   // wall, floor, lines on the floor
const MEASURE = '#f97316'                    // what's being measured (orange)
const TEXT = 'var(--text-muted, #64748b)'

const fig = { stroke: INK, strokeWidth: 4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
const head = { fill: INK }
const wall = { stroke: WALL, strokeWidth: 3, strokeLinecap: 'round' as const, fill: 'none' }
const label = { fill: TEXT, fontSize: 11, fontWeight: 700, fontFamily: 'system-ui, sans-serif' }
const measureLabel = { ...label, fill: MEASURE }

/** Orange measuring line with arrowheads at both ends */
function Measure({ x1, y1, x2, y2, m }: { x1: number; y1: number; x2: number; y2: number; m: string }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={MEASURE} strokeWidth={3} markerStart={`url(#${m})`} markerEnd={`url(#${m})`} />
}

/** Dashed guide from a body point to the measuring line */
function Guide({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={MEASURE} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.8} />
}

/** Floor line */
const Floor = () => <line x1={8} y1={136} x2={232} y2={136} {...wall} />

function Drawing({ test, m, p }: { test: CombineMetricKey; m: string; p: string }) {
  switch (test) {
    case 'height_in':
      return (
        <>
          <Floor />
          <line x1={64} y1={10} x2={64} y2={136} {...wall} />
          {/* head board */}
          <line x1={64} y1={17} x2={108} y2={17} stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <circle cx={86} cy={29} r={11} {...head} />
          <path d="M86 40 V92 M86 52 L74 86 M86 52 L98 86 M86 92 L78 128 M86 92 L94 128" {...fig} />
          {/* shoes on */}
          <path d="M71 128 h11 a3 3 0 0 1 3 3 v3 h-14 z M88 128 h11 a3 3 0 0 1 3 3 v3 h-14 z" fill={MEASURE} />
          <Guide x1={108} y1={17} x2={150} y2={17} />
          <Measure x1={150} y1={20} x2={150} y2={133} m={m} />
          <text x={160} y={72} {...measureLabel}>Height</text>
          <text x={160} y={88} {...label}>shoes on,</text>
          <text x={160} y={101} {...label}>back to wall</text>
        </>
      )

    case 'wingspan_in':
      return (
        <>
          <Floor />
          <rect x={50} y={28} width={140} height={108} rx={2} fill="var(--gray-light, #f1f5f9)" />
          <circle cx={120} cy={42} r={11} {...head} />
          {/* arms about as long as she is tall, like a real wingspan */}
          <path d="M120 53 V100 M68 64 H172 M120 100 L111 134 M120 100 L129 134" {...fig} />
          <Guide x1={68} y1={64} x2={68} y2={24} />
          <Guide x1={172} y1={64} x2={172} y2={24} />
          <Measure x1={71} y1={24} x2={169} y2={24} m={m} />
          <text x={120} y={12} textAnchor="middle" {...measureLabel}>Fingertip to fingertip</text>
          <text x={184} y={128} textAnchor="end" {...label} fontSize={9}>back to wall</text>
        </>
      )

    case 'standing_reach_in':
      return (
        <>
          <Floor />
          <line x1={64} y1={6} x2={64} y2={136} {...wall} />
          <circle cx={88} cy={46} r={10} {...head} />
          {/* side-on: reaching arm straight up in front of the face, heels flat */}
          <path d="M90 56 V100 M92 62 L102 10 M90 64 L84 92 M90 100 L86 134 L98 134 M90 100 L94 134" {...fig} />
          <Guide x1={102} y1={10} x2={146} y2={10} />
          <Measure x1={146} y1={13} x2={146} y2={133} m={m} />
          <text x={156} y={64} {...measureLabel}>Reach</text>
          <text x={156} y={80} {...label}>heels flat,</text>
          <text x={156} y={93} {...label}>one hand</text>
        </>
      )

    case 'standing_vertical_in':
      return (
        <>
          <Floor />
          {/* Vertec vanes */}
          <path d="M158 6 V40 M134 10 H158 M138 16 H158 M142 22 H158 M146 28 H158" stroke={WALL} strokeWidth={3} strokeLinecap="round" />
          <circle cx={112} cy={50} r={9} {...head} />
          {/* in the air, both hands up like a block */}
          <path d="M112 60 V98 M106 66 L92 18 M118 66 L132 18 M112 98 L104 112 L110 124 M112 98 L120 112 L116 124" {...fig} />
          {/* jump lines */}
          <path d="M98 130 h8 M118 130 h8" stroke={WALL} strokeWidth={2} strokeLinecap="round" />
          <Guide x1={132} y1={18} x2={186} y2={18} />
          <Measure x1={186} y1={21} x2={186} y2={133} m={m} />
          <text x={14} y={60} {...measureLabel}>Touch</text>
          <text x={14} y={76} {...label}>no steps,</text>
          <text x={14} y={89} {...label}>two hands</text>
        </>
      )

    case 'approach_vertical_in':
      return (
        <>
          <Floor />
          <path d="M184 6 V40 M160 10 H184 M164 16 H184 M168 22 H184 M172 28 H184" stroke={WALL} strokeWidth={3} strokeLinecap="round" />
          {/* footsteps of the approach */}
          {[[16, 131], [42, 127], [66, 131], [86, 127]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx={7} ry={3.5} fill={WALL} />
          ))}
          <path d="M20 118 Q80 96 116 112" stroke={WALL} strokeWidth={2} strokeDasharray="4 4" fill="none" markerEnd={`url(#${p})`} />
          <circle cx={133} cy={49} r={10} {...head} />
          {/* in the air: hitting hand up, other arm down */}
          <path d="M138 58 L140 96 M144 62 L158 16 M136 64 L126 88 M140 96 L132 110 L138 122 M140 96 L148 110 L146 124" {...fig} />
          <Guide x1={158} y1={16} x2={214} y2={16} />
          <Measure x1={214} y1={19} x2={214} y2={133} m={m} />
          <text x={14} y={30} {...measureLabel}>Touch</text>
          <text x={14} y={46} {...label}>full approach,</text>
          <text x={14} y={59} {...label}>hitting hand</text>
        </>
      )

    case 'acceleration_sec':
      return (
        <>
          <Floor />
          <line x1={40} y1={82} x2={40} y2={136} stroke={INK} strokeWidth={3} />
          <line x1={210} y1={82} x2={210} y2={136} stroke={INK} strokeWidth={3} strokeDasharray="5 4" />
          <text x={40} y={76} textAnchor="middle" {...label}>START</text>
          <text x={210} y={76} textAnchor="middle" {...label}>FINISH</text>
          {/* ready stance */}
          <circle cx={66} cy={86} r={9} {...head} />
          <path d="M62 94 L52 112 M60 98 L72 110 M58 100 L70 104 M52 112 L62 122 L58 134 M52 112 L46 134" {...fig} />
          <path d="M84 100 h20 M80 110 h28 M86 120 h16" stroke={WALL} strokeWidth={2} strokeLinecap="round" />
          <Measure x1={124} y1={110} x2={204} y2={110} m={m} />
          <text x={164} y={102} textAnchor="middle" {...measureLabel}>5 yards</text>
          {/* stopwatch */}
          <circle cx={120} cy={34} r={16} fill="none" stroke={MEASURE} strokeWidth={3} />
          <path d="M120 34 V24 M120 34 L127 38 M116 14 h8" stroke={MEASURE} strokeWidth={3} strokeLinecap="round" />
          <text x={146} y={39} {...measureLabel}>time</text>
        </>
      )

    case 'pro_agility_sec':
      return (
        <>
          <Floor />
          {/* attack lines 3 m each side of the net */}
          {[40, 200].map(x => <line key={x} x1={x} y1={56} x2={x} y2={136} stroke={INK} strokeWidth={3} />)}
          {/* the net: posts + mesh, in the middle */}
          <line x1={120} y1={44} x2={120} y2={136} stroke={INK} strokeWidth={4} />
          <rect x={115} y={46} width={10} height={30} fill="none" stroke={INK} strokeWidth={1.5} strokeDasharray="2 2" />
          <text x={80} y={50} textAnchor="middle" {...label}>3 m</text>
          <text x={160} y={50} textAnchor="middle" {...label}>3 m</text>
          <text x={40} y={144} textAnchor="middle" {...label} fontSize={8}>attack line</text>
          <text x={200} y={144} textAnchor="middle" {...label} fontSize={8}>attack line</text>
          <text x={120} y={18} textAnchor="middle" {...measureLabel}>3 – 6 – 3 m, touch each line</text>
          {/* the run: middle → right, right → left, left → middle */}
          <path d="M124 124 H194" stroke={MEASURE} strokeWidth={3} fill="none" markerEnd={`url(#${p}o)`} />
          <path d="M196 104 H46" stroke={MEASURE} strokeWidth={3} fill="none" markerEnd={`url(#${p}o)`} />
          <path d="M44 84 H114" stroke={MEASURE} strokeWidth={3} fill="none" markerEnd={`url(#${p}o)`} />
          <text x={158} y={120} textAnchor="middle" {...label} fontSize={10}>1</text>
          <text x={160} y={100} textAnchor="middle" {...label} fontSize={10}>2</text>
          <text x={80} y={80} textAnchor="middle" {...label} fontSize={10}>3</text>
          <circle cx={120} cy={124} r={5} fill={INK} />
          <text x={120} y={36} textAnchor="middle" {...label}>start &amp; finish at the net</text>
        </>
      )

    case 'swing_velocity_mph':
      return (
        <>
          <Floor />
          <circle cx={70} cy={40} r={11} {...head} />
          <path d="M70 51 V96 M70 58 L52 74 M70 96 L62 134 M70 96 L80 134" {...fig} />
          {/* swinging arm and its path */}
          <path d="M72 56 L98 26" {...fig} />
          <path d="M70 14 Q112 8 118 52" stroke={WALL} strokeWidth={2} strokeDasharray="4 4" fill="none" markerEnd={`url(#${p})`} />
          <circle cx={108} cy={22} r={8} fill="none" stroke={INK} strokeWidth={2.5} />
          {/* radar gun */}
          <path d="M176 70 h36 v16 h-22 l-4 14 h-8 l2 -14 h-4 z" fill={INK} />
          <path d="M170 74 q-6 4 0 8 M162 70 q-10 8 0 16" stroke={MEASURE} strokeWidth={2.5} fill="none" strokeLinecap="round" />
          <text x={194} y={114} textAnchor="middle" {...measureLabel}>mph</text>
          <text x={194} y={128} textAnchor="middle" {...label}>radar</text>
        </>
      )
  }
}

/**
 * The drawing for one test. `size` is the width in px (height follows);
 * `compact` (small thumbnails) drops the padding and the words.
 */
export default function CombineTestVisual({ test, size, compact, fit, title }: {
  test: CombineMetricKey; size?: number | string; compact?: boolean
  /** Fill the box it's in (both width and height), keeping its shape; for the TV tiles */
  fit?: boolean
  title?: string
}) {
  const id = useId().replace(/:/g, '')
  const m = `m${id}`, p = `p${id}`
  return (
    <svg className={`cv-${id}`} viewBox="0 0 240 144" width={fit ? '100%' : size ?? '100%'} height={fit ? '100%' : undefined}
      role="img" aria-label={title ?? 'How the test is measured'}
      style={fit
        ? { display: 'block', width: '100%', height: '100%' }
        : { display: 'block', maxWidth: '100%', height: 'auto', padding: compact ? 0 : '0.25rem 0' }}>
      {/* Thumbnails: the words are too small to read, so just the drawing */}
      {compact && <style>{`.cv-${id} text { display: none; }`}</style>}
      <defs>
        <marker id={m} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={MEASURE} />
        </marker>
        <marker id={p} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill={WALL} />
        </marker>
        <marker id={`${p}o`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill={MEASURE} />
        </marker>
      </defs>
      <Drawing test={test} m={m} p={p} />
    </svg>
  )
}
