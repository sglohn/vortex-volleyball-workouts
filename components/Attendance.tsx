'use client'
// FILE: components/Attendance.tsx
//
// Small pieces for weight room attendance (lib/attendance.ts), used on
// Coach → Teams (each team, Season Report) and a team's roster.
//   AttendancePill    "86%  6/7" colored green 90+, amber 70–89, red under 70
//                     (the second number is workouts' worth of credit, e.g. 5.5/7)
//   DayStrip          every workout day so far: full / partial (sets X/Y) /
//                     signed in / missed / Out. With onDay, each day is a
//                     button (coaches open how far she got and the credit).
//   fmtCredit         3.5 → "3.5", 4 → "4"
//   SeasonHealth      "1 injury · 2 pain · 3 sore · 4 days Out" this season

import { DAY_STATUS, dayLabel, pctColor, type AttendanceDay, type HealthStat } from '@/lib/attendance'

export function AttendancePill({ pct, attended, counted, onClick, open }: { pct: number | null; /** workouts' worth of credit */ attended: number; counted: number; onClick?: () => void; open?: boolean }) {
  const color = pctColor(pct)
  const body = (
    <>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.92rem', color }}>{pct === null ? '—' : `${pct}%`}</span>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>{counted ? `${fmtCredit(attended)}/${counted}` : 'no workouts yet'}</span>
      {onClick && counted > 0 && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>}
    </>
  )
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'baseline', gap: '0.35rem', padding: '0.18rem 0.55rem', borderRadius: 20,
    border: `1.5px solid ${pct === null ? 'var(--gray-border)' : color}`, background: 'var(--white)', whiteSpace: 'nowrap',
  }
  if (!onClick) return <span style={style}>{body}</span>
  return <button type="button" onClick={onClick} style={{ ...style, cursor: 'pointer' }} title="Show each workout day">{body}</button>
}

export function fmtCredit(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '')
}

/** "12/24 sets" or "3/7 tests" for a day she checked in */
export function doneText(d: Pick<AttendanceDay, 'done' | 'planned' | 'combine'>): string | null {
  if (d.done === undefined) return null
  const unit = d.combine ? 'tests' : 'sets'
  return d.planned ? `${d.done}/${d.planned} ${unit}` : `${d.done} ${unit}`
}

function dayTitle(d: AttendanceDay): string {
  const s = DAY_STATUS[d.status]
  const parts = [`${dayLabel(d.date)}: ${s.label}`]
  const dt = doneText(d)
  if (dt) parts.push(dt)
  if (typeof d.credit === 'number' && d.status !== 'missed' && d.status !== 'out') parts.push(`${d.credit}% credit${d.decided ? ' (decided)' : ''}`)
  if (d.toReview) parts.push('to review')
  return parts.join(' · ')
}

export function DayStrip({ days, onDay, selected }: { days: AttendanceDay[]; onDay?: (d: AttendanceDay) => void; selected?: string | null }) {
  if (!days.length) return <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No team workouts yet this season.</div>
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
        {days.map(d => {
          const s = DAY_STATUS[d.status]
          const showDone = d.status === 'partial' || d.status === 'signedIn' || (d.status === 'today' && d.done !== undefined)
          const style: React.CSSProperties = {
            fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: 5, color: s.color, background: s.bg,
            border: `${selected === d.date ? 2 : 1}px solid ${selected === d.date ? s.color : `${s.color}40`}`, whiteSpace: 'nowrap',
          }
          const body = (
            <>
              {dayLabel(d.date)}
              {showDone && <span style={{ fontWeight: 600, marginLeft: '0.3rem' }}>{doneText(d)}</span>}
              {d.decided && d.status !== 'finished' && <span style={{ fontWeight: 600, marginLeft: '0.3rem' }}>{d.credit}%</span>}
              {d.toReview && <span style={{ marginLeft: '0.25rem' }}>•</span>}
            </>
          )
          return onDay && d.done !== undefined
            ? <button key={d.date} type="button" title={dayTitle(d)} onClick={() => onDay(d)} style={{ ...style, cursor: 'pointer', fontFamily: 'inherit' }}>{body}</button>
            : <span key={d.date} title={dayTitle(d)} style={style}>{body}</span>
        })}
      </div>
      <DayLegend />
    </div>
  )
}

export function DayLegend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.45rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
      {Object.values(DAY_STATUS).map(s => (
        <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, display: 'inline-block' }} />{s.label}
        </span>
      ))}
      <span>• = to review</span>
    </div>
  )
}

export function seasonHealthParts(h: HealthStat): string[] {
  const parts: string[] = []
  if (h.injuries) parts.push(`${h.injuries} injur${h.injuries === 1 ? 'y' : 'ies'}`)
  if (h.pains) parts.push(`${h.pains} pain`)
  if (h.soreness) parts.push(`${h.soreness} sore`)
  if (h.outDays) parts.push(`${h.outDays} day${h.outDays === 1 ? '' : 's'} Out`)
  return parts
}

export function SeasonHealth({ health, prefix = 'This season: ' }: { health: HealthStat; prefix?: string }) {
  const parts = seasonHealthParts(health)
  return (
    <span style={{ fontSize: '0.72rem', color: parts.length ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
      {prefix}{parts.length ? parts.join(' · ') : 'no health reports'}
    </span>
  )
}
