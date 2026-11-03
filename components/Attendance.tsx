'use client'
// FILE: components/Attendance.tsx
//
// Small pieces for weight room attendance (lib/attendance.ts), used on
// Coach → Teams (each team, Season Report) and a team's roster.
//   AttendancePill    "86%  6/7" colored green 90+, amber 70–89, red under 70
//   DayStrip          every workout day so far: finished / came / missed / Out
//   SeasonHealth      "1 injury · 2 pain · 3 sore · 4 days Out" this season

import { DAY_STATUS, dayLabel, pctColor, type AttendanceDay, type HealthStat } from '@/lib/attendance'

export function AttendancePill({ pct, attended, counted, onClick, open }: { pct: number | null; attended: number; counted: number; onClick?: () => void; open?: boolean }) {
  const color = pctColor(pct)
  const body = (
    <>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.92rem', color }}>{pct === null ? '—' : `${pct}%`}</span>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>{counted ? `${attended}/${counted}` : 'no workouts yet'}</span>
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

export function DayStrip({ days }: { days: AttendanceDay[] }) {
  if (!days.length) return <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No team workouts yet this season.</div>
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
        {days.map(d => {
          const s = DAY_STATUS[d.status]
          return (
            <span key={d.date} title={`${dayLabel(d.date)}: ${s.label}`}
              style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: 5, color: s.color, background: s.bg, border: `1px solid ${s.color}40`, whiteSpace: 'nowrap' }}>
              {dayLabel(d.date)}
            </span>
          )
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
