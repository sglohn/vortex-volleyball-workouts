'use client'
import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { inchesToFeetInches, calcVertical } from '@/lib/fitness'

interface MeasRow {
  measured_at: string
  height_in?: number
  wingspan_in?: number
  standing_reach_in?: number
  standing_vertical_in?: number
  approach_vertical_in?: number
}

interface Props {
  playerId: string
  playerName: string
  statKey: string
  statLabel: string
  onClose: () => void
}

const DERIVED: Record<string, { label: string; compute: (row: MeasRow) => number | null }> = {
  block_vertical: {
    label: 'Block Vertical',
    compute: r => calcVertical(r.standing_vertical_in, r.standing_reach_in),
  },
  approach_vertical: {
    label: 'Approach Vertical',
    compute: r => calcVertical(r.approach_vertical_in, r.standing_reach_in),
  },
}

function fmtVal(inches: number, key: string): string {
  if (key === 'block_vertical' || key === 'approach_vertical') return `${inches}"`
  return inchesToFeetInches(inches)
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

export default function MeasurementHistoryModal({ playerId, playerName, statKey, statLabel, onClose }: Props) {
  const [rows, setRows] = useState<MeasRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/player/measurements?playerId=${playerId}`)
      .then(r => r.json())
      .then(d => { setRows((d.measurements ?? []).reverse()); setLoading(false) })
  }, [playerId])

  const isDerived = statKey in DERIVED

  const chartData = rows
    .map(row => {
      let val: number | null = null
      if (isDerived) {
        val = DERIVED[statKey].compute(row)
      } else {
        val = (row as Record<string, number | undefined>)[statKey] ?? null
      }
      return val !== null ? { date: fmtDate(row.measured_at), raw: row.measured_at, val } : null
    })
    .filter((d): d is { date: string; raw: string; val: number } => d !== null)

  const latest = chartData[chartData.length - 1]
  const first = chartData[0]
  const change = latest && first && chartData.length > 1 ? Math.round((latest.val - first.val) * 10) / 10 : null
  const min = chartData.length ? Math.min(...chartData.map(d => d.val)) : 0
  const max = chartData.length ? Math.max(...chartData.map(d => d.val)) : 0
  const padding = Math.max((max - min) * 0.15, 1)

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { date: string } }> }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'var(--white)', border: '1.5px solid var(--carolina-border)', borderRadius: 8, padding: '0.625rem 0.875rem', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{payload[0].payload.date}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--carolina)' }}>
          {fmtVal(payload[0].value, statKey)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: '100%', maxWidth: 560, padding: '1.75rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem', marginBottom: '0.15rem' }}>{statLabel}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{playerName} · all time</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, marginLeft: '1rem' }}>✕</button>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>}

        {!loading && chartData.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No measurements recorded yet for this stat.
          </div>
        )}

        {!loading && chartData.length > 0 && (
          <>
            {/* Summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.625rem', marginBottom: '1.5rem' }}>
              {[
                { label: 'Current', value: fmtVal(latest.val, statKey), color: 'var(--carolina)' },
                { label: 'Best', value: fmtVal(max, statKey), color: 'var(--success)' },
                { label: change !== null ? `Change (${chartData.length} measurements)` : 'Measurements', value: change !== null ? `${change > 0 ? '+' : ''}${change}"` : '1', color: change === null ? 'var(--text-muted)' : change > 0 ? 'var(--success)' : change < 0 ? 'var(--danger)' : 'var(--text-muted)' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 10, padding: '0.875rem', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.2rem', color: s.color, lineHeight: 1, marginBottom: '0.25rem' }}>{s.value}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Chart */}
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[min - padding, max + padding]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
                    tickFormatter={v => isDerived ? `${v}"` : `${Math.floor(v / 12)}'${Math.round(v % 12)}"`} width={40} />
                  <Tooltip content={<CustomTooltip />} />
                  {chartData.length > 1 && <ReferenceLine y={first.val} stroke="rgba(86,160,211,0.2)" strokeDasharray="4 4" />}
                  <Line type="monotone" dataKey="val" stroke="var(--carolina)" strokeWidth={2.5} dot={{ r: 5, fill: 'var(--carolina)', strokeWidth: 2, stroke: 'var(--white)' }} activeDot={{ r: 7 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ background: 'var(--carolina-light)', borderRadius: 10, padding: '1.5rem', textAlign: 'center', border: '1.5px solid var(--carolina-border)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '2rem', color: 'var(--carolina)' }}>{fmtVal(latest.val, statKey)}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Recorded {fmtDate(rows[rows.length - 1]?.measured_at ?? '')}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Record more measurements over time to see a trend chart.</div>
              </div>
            )}

            {/* Data table */}
            <div style={{ marginTop: '1.25rem', maxHeight: 180, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--gray-border)' }}>
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Value</th>
                    <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {[...chartData].reverse().map((d, i, arr) => {
                    const prev = arr[i + 1]
                    const diff = prev ? Math.round((d.val - prev.val) * 10) / 10 : null
                    return (
                      <tr key={d.raw} style={{ borderBottom: '1px solid var(--gray-border)', background: i === 0 ? 'var(--carolina-light)' : 'transparent' }}>
                        <td style={{ padding: '0.5rem', color: i === 0 ? 'var(--carolina-deep)' : 'var(--text-secondary)', fontWeight: i === 0 ? 600 : 400 }}>
                          {d.date}{i === 0 ? ' · Latest' : ''}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700, color: i === 0 ? 'var(--carolina)' : 'var(--text-primary)' }}>
                          {fmtVal(d.val, statKey)}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', color: diff === null ? 'var(--text-muted)' : diff > 0 ? 'var(--success)' : diff < 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 600 }}>
                          {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff}"`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
