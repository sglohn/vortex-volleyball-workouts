// FILE: app/coach/comparisons/groups/page.tsx
//
// Coach → Comparisons → Groups (admins, volleyball). Groups players by team,
// age group, age, position, team level, team # in its age group (1 team,
// 2 team, ...) or girls/boys and compares each
// group's average numbers. Data: /api/coach/comparisons/groups (each
// player's latest measurements, the same numbers as Coach → Players).
//
//   - Averages count only players with that number ("n" under each value).
//   - Green / red with + / − = better / worse than the average of everyone
//     shown (times: lower is better).
//   - Chart: one test, each group's average (dot) and its lowest-to-highest
//     player (line), with the everyone-shown average as a dashed line.
//   - Head to head: any two groups side by side.
//   - Tap a group to see its players.
'use client'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import ComparisonTabs from '@/components/ComparisonTabs'
import { POSITIONS } from '@/lib/features'
import { TEAM_LEVELS, TEAM_RANKS, teamLevelLabel, teamRankLabel } from '@/lib/teamLevel'

// ── Data ────────────────────────────────────────────────────────────────

type MetricKey =
  | 'height_in' | 'wingspan_in' | 'standing_reach_in' | 'block_touch' | 'standing_vert'
  | 'approach_touch' | 'max_vert' | 'acceleration_sec' | 'pro_agility_sec' | 'swing_velocity_mph' | 'score'

interface Player {
  id: string; name: string; gender: 'F' | 'M'; position: string | null; age: number | null
  teamId: string; teamName: string; teamColor: string; ageGroup: string | null; level: string | null; rank: number | null
  measuredAt: string | null
  metrics: Record<MetricKey, number | null>
}

type Unit = 'ftin' | 'in' | 'sec' | 'mph' | 'score'
interface Metric { key: MetricKey; label: string; short: string; unit: Unit; lower?: boolean }

const METRICS: Metric[] = [
  { key: 'height_in',          label: 'Height',          short: 'Height',    unit: 'ftin' },
  { key: 'wingspan_in',        label: 'Wingspan',        short: 'Wingspan',  unit: 'ftin' },
  { key: 'standing_reach_in',  label: 'Standing Reach',  short: 'Reach',     unit: 'ftin' },
  { key: 'block_touch',        label: 'Block Touch',     short: 'Blk Touch', unit: 'ftin' },
  { key: 'standing_vert',      label: 'Stand. Vertical', short: 'Stn Vert',  unit: 'in' },
  { key: 'approach_touch',     label: 'Approach Touch',  short: 'App Touch', unit: 'ftin' },
  { key: 'max_vert',           label: 'Max Vertical',    short: 'Max Vert',  unit: 'in' },
  { key: 'acceleration_sec',   label: 'Acceleration',    short: 'Accel',     unit: 'sec', lower: true },
  { key: 'pro_agility_sec',    label: 'Pro-Agility',     short: 'Pro-Agil',  unit: 'sec', lower: true },
  { key: 'swing_velocity_mph', label: 'Swing Velocity',  short: 'Swing',     unit: 'mph' },
  { key: 'score',              label: 'Athleticism Score', short: 'Score',   unit: 'score' },
]

// ── Grouping ────────────────────────────────────────────────────────────

type GroupBy = 'team' | 'ageGroup' | 'age' | 'position' | 'level' | 'rank' | 'gender'
const GROUP_BY: { key: GroupBy; label: string }[] = [
  { key: 'team',     label: 'Team' },
  { key: 'ageGroup', label: 'Age group' },
  { key: 'age',      label: 'Age' },
  { key: 'position', label: 'Position' },
  { key: 'level',    label: 'Team level' },
  { key: 'rank',     label: 'Team #' },
  { key: 'gender',   label: 'Girls vs boys' },
]

interface GroupDef { key: string; label: string; color?: string; order: string }

/** Age groups in age order, girls before boys: 12s, 13s … 18s, Boys 13s … */
function ageGroupOrder(g: string | null): string {
  if (!g) return 'z'
  const n = parseInt(g.replace(/\D/g, ''), 10)
  const boys = /boy/i.test(g) ? 1 : 0
  return `${boys}-${String(Number.isFinite(n) ? n : 99).padStart(2, '0')}-${g}`
}

function groupOf(p: Player, by: GroupBy): GroupDef {
  switch (by) {
    case 'team':
      return { key: p.teamId, label: p.teamName, color: p.teamColor, order: `${ageGroupOrder(p.ageGroup)}|${p.teamName}` }
    case 'ageGroup':
      return { key: p.ageGroup ?? '-', label: p.ageGroup ?? 'No age group', order: ageGroupOrder(p.ageGroup) }
    case 'age':
      return p.age == null
        ? { key: '-', label: 'No birthday', order: 'z' }
        : { key: String(p.age), label: `Age ${p.age}`, order: String(p.age).padStart(3, '0') }
    case 'position': {
      const i = p.position ? POSITIONS.indexOf(p.position) : -1
      return p.position
        ? { key: p.position, label: p.position, order: String(i < 0 ? 98 : i).padStart(2, '0') }
        : { key: '-', label: 'No position', order: '99' }
    }
    case 'level': {
      const i = TEAM_LEVELS.findIndex(l => l.key === p.level)
      return i < 0
        ? { key: '-', label: 'Level not set', order: '9' }
        : { key: p.level!, label: TEAM_LEVELS[i].label, order: String(i) }
    }
    case 'rank':
      return p.rank == null
        ? { key: '-', label: 'Team # not set', order: '9' }
        : { key: String(p.rank), label: teamRankLabel(p.rank)!, order: String(p.rank) }
    case 'gender':
      return p.gender === 'M' ? { key: 'M', label: 'Boys', order: '1' } : { key: 'F', label: 'Girls', order: '0' }
  }
}

interface Stat { avg: number | null; n: number; min: number | null; max: number | null }
interface Group extends GroupDef { players: Player[]; tested: number; stats: Record<MetricKey, Stat> }

function statOf(players: Player[], key: MetricKey): Stat {
  const vals = players.map(p => p.metrics[key]).filter((v): v is number => v != null)
  if (!vals.length) return { avg: null, n: 0, min: null, max: null }
  return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length, min: Math.min(...vals), max: Math.max(...vals) }
}

function buildGroup(def: GroupDef, players: Player[]): Group {
  const stats = {} as Record<MetricKey, Stat>
  for (const m of METRICS) stats[m.key] = statOf(players, m.key)
  const tested = players.filter(p => METRICS.some(m => p.metrics[m.key] != null)).length
  return { ...def, players, tested, stats }
}

// ── Formatting ──────────────────────────────────────────────────────────

/** Averages to a tenth of an inch: 5'10.3" */
function ftIn(v: number): string {
  const t = Math.round(v * 10) / 10
  let ft = Math.floor(t / 12)
  let rest = Math.round((t - ft * 12) * 10) / 10
  if (rest >= 12) { ft += 1; rest -= 12 }
  return `${ft}'${Number.isInteger(rest) ? rest : rest.toFixed(1)}"`
}

function fmt(m: Metric, v: number | null): string {
  if (v == null) return '—'
  switch (m.unit) {
    case 'ftin': return ftIn(v)
    case 'in': return `${(Math.round(v * 10) / 10).toFixed(1)}"`
    case 'sec': return `${v.toFixed(2)}s`
    case 'mph': return `${v.toFixed(1)} mph`
    case 'score': return String(Math.round(v))
  }
}

/** A difference, signed by better (+) / worse (−) */
function fmtDiff(m: Metric, diff: number): string {
  const better = m.lower ? diff < 0 : diff > 0
  const a = Math.abs(diff)
  const body =
    m.unit === 'sec' ? `${a.toFixed(2)}s`
    : m.unit === 'mph' ? `${a.toFixed(1)}`
    : m.unit === 'score' ? `${Math.round(a)}`
    : `${a.toFixed(1)}"`
  return `${better ? '+' : '−'}${body}`
}

/** better / worse / even for the colors (even = within a hair) */
function verdict(m: Metric, diff: number): 'better' | 'worse' | 'even' {
  const hair = m.unit === 'sec' ? 0.005 : m.unit === 'score' ? 0.5 : 0.05
  if (Math.abs(diff) < hair) return 'even'
  return (m.lower ? diff < 0 : diff > 0) ? 'better' : 'worse'
}

const VERDICT_COLOR = { better: 'var(--success)', worse: 'var(--danger)', even: 'var(--text-muted)' }

// ── Page ────────────────────────────────────────────────────────────────

const labelStyle: CSSProperties = { fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }

export default function GroupComparisonsPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [groupBy, setGroupBy] = useState<GroupBy>('team')
  const [gender, setGender] = useState<'F' | 'M' | 'all'>('F')
  const [levelFilter, setLevelFilter] = useState('')
  const [ageGroupFilter, setAgeGroupFilter] = useState('')
  const [rankFilter, setRankFilter] = useState('')
  const [minTested, setMinTested] = useState(1)
  const [sort, setSort] = useState<{ key: MetricKey | 'group' | 'tested'; best: boolean }>({ key: 'group', best: true })
  const [chartKey, setChartKey] = useState<MetricKey>('max_vert')
  const [open, setOpen] = useState<string | null>(null)
  const [pairA, setPairA] = useState('')
  const [pairB, setPairB] = useState('')

  useEffect(() => {
    fetch('/api/coach/comparisons/groups')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); setPlayers(d.players ?? []) })
      .catch(() => setError('Could not load players'))
      .finally(() => setLoading(false))
  }, [])

  // Filters
  const shown = useMemo(() => players.filter(p =>
    (groupBy === 'gender' || gender === 'all' || p.gender === gender) &&
    (!levelFilter || (levelFilter === '-' ? !p.level : p.level === levelFilter)) &&
    (!ageGroupFilter || p.ageGroup === ageGroupFilter) &&
    (!rankFilter || (rankFilter === '-' ? p.rank == null : String(p.rank) === rankFilter))
  ), [players, groupBy, gender, levelFilter, ageGroupFilter, rankFilter])

  const ageGroups = useMemo(() =>
    [...new Set(players.map(p => p.ageGroup).filter((g): g is string => !!g))].sort((a, b) => ageGroupOrder(a).localeCompare(ageGroupOrder(b))),
  [players])
  const anyLevelSet = players.some(p => p.level)
  const anyRankSet = players.some(p => p.rank != null)
  const anySwing = players.some(p => p.metrics.swing_velocity_mph != null)
  const metrics = METRICS.filter(m => m.key !== 'swing_velocity_mph' || anySwing)

  const everyone = useMemo(() => buildGroup({ key: '*', label: 'Everyone shown', order: '' }, shown), [shown])

  const groups = useMemo(() => {
    const byKey = new Map<string, { def: GroupDef; list: Player[] }>()
    for (const p of shown) {
      const def = groupOf(p, groupBy)
      const g = byKey.get(def.key) ?? { def, list: [] }
      g.list.push(p)
      byKey.set(def.key, g)
    }
    return [...byKey.values()].map(g => buildGroup(g.def, g.list)).filter(g => g.tested >= minTested)
  }, [shown, groupBy, minTested])

  const sorted = useMemo(() => {
    const list = [...groups]
    if (sort.key === 'group') {
      list.sort((a, b) => a.order.localeCompare(b.order))
      if (!sort.best) list.reverse()
    } else if (sort.key === 'tested') {
      list.sort((a, b) => (b.tested - a.tested) * (sort.best ? 1 : -1) || a.order.localeCompare(b.order))
    } else {
      const m = METRICS.find(x => x.key === sort.key)!
      list.sort((a, b) => {
        const va = a.stats[m.key].avg, vb = b.stats[m.key].avg
        if (va == null && vb == null) return a.order.localeCompare(b.order)
        if (va == null) return 1
        if (vb == null) return -1
        const bestFirst = m.lower ? va - vb : vb - va
        return sort.best ? bestFirst : -bestFirst
      })
    }
    return list
  }, [groups, sort])


  function clickSort(key: MetricKey | 'group' | 'tested') {
    setSort(s => s.key === key ? { key, best: !s.best } : { key, best: true })
  }
  const arrow = (key: string) => sort.key === key ? (sort.best ? ' ▼' : ' ▲') : ''

  const chartMetric = metrics.find(m => m.key === chartKey) ?? metrics[0]
  // Head to head: the picked pair, or the first two groups shown
  const groupA = sorted.find(g => g.key === pairA) ?? sorted[0]
  const groupB = sorted.find(g => g.key === pairB && g.key !== groupA?.key) ?? sorted.find(g => g.key !== groupA?.key)

  const sortHint = sort.key === 'group' ? `by ${GROUP_BY.find(g => g.key === groupBy)!.label.toLowerCase()}`
    : sort.key === 'tested' ? 'by players tested'
    : (() => { const m = METRICS.find(x => x.key === sort.key)!; return `by ${m.label}, ${sort.best ? 'best' : 'lowest'} first${m.lower ? (sort.best ? ' (fastest)' : ' (slowest)') : ''}` })()

  return (
    <div style={{ padding: '2rem', maxWidth: 1200 }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, marginBottom: '.25rem' }}>Group Comparisons</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>Average numbers by group, from each player's latest measurements</p>
      </div>
      <ComparisonTabs active="groups" />

      {/* Controls */}
      <div className="card" style={{ padding: '1rem 1.1rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ ...labelStyle, marginRight: 4 }}>Group by</span>
          {GROUP_BY.map(g => (
            <button key={g.key} onClick={() => { setGroupBy(g.key); setOpen(null); setSort({ key: 'group', best: true }) }}
              className={groupBy === g.key ? 'btn-volt' : 'btn-ghost'} style={{ fontSize: 13, padding: '0.3rem 0.8rem', borderRadius: 20 }}>
              {g.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {groupBy !== 'gender' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label style={labelStyle}>Players</label>
              <select className="input" value={gender} onChange={e => setGender(e.target.value as 'F' | 'M' | 'all')} style={{ fontSize: 13 }}>
                <option value="F">Girls</option>
                <option value="M">Boys</option>
                <option value="all">Girls and boys</option>
              </select>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={labelStyle}>Team level</label>
            <select className="input" value={levelFilter} onChange={e => setLevelFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="">All levels</option>
              {TEAM_LEVELS.map(l => <option key={l.key} value={l.key}>{l.label} only</option>)}
              <option value="-">Level not set</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={labelStyle}>Age group</label>
            <select className="input" value={ageGroupFilter} onChange={e => setAgeGroupFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="">All age groups</option>
              {ageGroups.map(g => <option key={g} value={g}>{g} only</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={labelStyle}>Team #</label>
            <select className="input" value={rankFilter} onChange={e => setRankFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="">All teams</option>
              {TEAM_RANKS.map(r => <option key={r} value={r}>{teamRankLabel(r)}s only</option>)}
              <option value="-">Team # not set</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={labelStyle}>Show groups with</label>
            <select className="input" value={minTested} onChange={e => setMinTested(Number(e.target.value))} style={{ fontSize: 13 }}>
              <option value={1}>1+ player tested</option>
              <option value={3}>3+ players tested</option>
              <option value={5}>5+ players tested</option>
            </select>
          </div>
        </div>
        {(!anyLevelSet || !anyRankSet) && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {!anyLevelSet ? 'No team levels' : 'No team numbers'}{!anyLevelSet && !anyRankSet ? ' or numbers' : ''} set yet. Set them on <strong>Coach → Teams → Edit</strong>.
          </div>
        )}
      </div>

      {loading ? <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading players…</div>
      : error ? <div style={{ color: 'var(--danger)', padding: '1rem' }}>{error}</div>
      : !groups.length ? <div className="card" style={{ padding: '2rem', color: 'var(--text-muted)', textAlign: 'center' }}>No players with numbers match these filters.</div>
      : <>
        {/* Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
          <div style={{ padding: '0.75rem 1rem', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--gray-border)' }}>
            {groups.length} group{groups.length === 1 ? '' : 's'} · {everyone.tested} of {shown.length} players tested · sorted {sortHint}.
            {' '}<span style={{ color: 'var(--success)', fontWeight: 600 }}>+ better</span> / <span style={{ color: 'var(--danger)', fontWeight: 600 }}>− worse</span> than everyone shown. Tap a group for its players.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--gray-light)' }}>
                  <Th sticky onClick={() => clickSort('group')}>Group{arrow('group')}</Th>
                  <Th onClick={() => clickSort('tested')}>Tested{arrow('tested')}</Th>
                  {metrics.map(m => (
                    <Th key={m.key} onClick={() => clickSort(m.key)} title={m.lower ? `${m.label} (lower is better)` : m.label}>{m.short}{arrow(m.key)}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <GroupRow group={everyone} metrics={metrics} base={null} isTotal />
                {sorted.map(g => (
                  <GroupRows key={g.key} group={g} metrics={metrics} base={everyone}
                    open={open === g.key} onToggle={() => setOpen(o => o === g.key ? null : g.key)} sortKey={sort.key} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Chart */}
        <div className="card" style={{ padding: '1rem 1.1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>Chart</h2>
            <select className="input" value={chartMetric.key} onChange={e => setChartKey(e.target.value as MetricKey)} style={{ fontSize: 13, width: 'auto' }}>
              {metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Dot = group average · line = lowest to highest player · dashed = everyone shown{chartMetric.lower ? ' · left is faster' : ''}
            </span>
          </div>
          <DotChart groups={sorted} metric={chartMetric} base={everyone.stats[chartMetric.key].avg} />
        </div>

        {/* Head to head */}
        {sorted.length >= 2 && groupA && groupB && (
          <div className="card" style={{ padding: '1rem 1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>Head to head</h2>
              <select className="input" value={groupA.key} onChange={e => setPairA(e.target.value)} style={{ fontSize: 13, width: 'auto' }}>
                {sorted.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>vs</span>
              <select className="input" value={groupB.key} onChange={e => setPairB(e.target.value)} style={{ fontSize: 13, width: 'auto' }}>
                {sorted.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </div>
            <HeadToHead a={groupA} b={groupB} metrics={metrics} />
          </div>
        )}
      </>}
    </div>
  )
}

// ── Table pieces ────────────────────────────────────────────────────────

function Th({ children, onClick, sticky, title }: { children: ReactNode; onClick: () => void; sticky?: boolean; title?: string }) {
  return (
    <th onClick={onClick} title={title}
      style={{
        padding: '0.55rem 0.7rem', textAlign: sticky ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
        borderBottom: '1px solid var(--gray-border)', background: 'var(--white)',
        ...(sticky ? { position: 'sticky', left: 0, zIndex: 1 } : {}),
      }}>
      {children}
    </th>
  )
}

function Cell({ metric, stat, base }: { metric: Metric; stat: Stat; base: Group | null }) {
  const baseAvg = base?.stats[metric.key].avg
  const diff = stat.avg != null && baseAvg != null ? stat.avg - baseAvg : null
  const v = diff != null ? verdict(metric, diff) : null
  return (
    <td style={{ padding: '0.5rem 0.7rem', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' }}
      title={stat.n ? `${stat.n} player${stat.n === 1 ? '' : 's'} · ${fmt(metric, stat.min)} to ${fmt(metric, stat.max)}` : 'No numbers'}>
      <div style={{ fontWeight: 600, color: stat.avg == null ? 'var(--text-muted)' : 'var(--black)' }}>{fmt(metric, stat.avg)}</div>
      {stat.n > 0 && (
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
          {diff != null && v && <span style={{ color: VERDICT_COLOR[v], fontWeight: 600 }}>{v === 'even' ? '±0' : fmtDiff(metric, diff)} </span>}
          n={stat.n}
        </div>
      )}
    </td>
  )
}

function GroupRow({ group, metrics, base, isTotal, open, onToggle }: {
  group: Group; metrics: Metric[]; base: Group | null; isTotal?: boolean; open?: boolean; onToggle?: () => void
}) {
  const bg = isTotal ? 'var(--carolina-light)' : open ? '#f8fafc' : 'var(--white)'
  return (
    <tr onClick={onToggle} style={{ borderBottom: '1px solid var(--gray-border)', background: bg, cursor: onToggle ? 'pointer' : 'default' }}>
      <td style={{ padding: '0.5rem 0.7rem', position: 'sticky', left: 0, background: bg, zIndex: 1, whiteSpace: 'nowrap', fontWeight: isTotal ? 700 : 600 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {group.color && <span style={{ width: 10, height: 10, borderRadius: 3, background: group.color, flexShrink: 0 }} />}
          {group.label}
          {onToggle && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{open ? '▾' : '▸'}</span>}
        </span>
      </td>
      <td style={{ padding: '0.5rem 0.7rem', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
        {group.tested}/{group.players.length}
      </td>
      {metrics.map(m => <Cell key={m.key} metric={m} stat={group.stats[m.key]} base={base} />)}
    </tr>
  )
}

/** A group's players: best first on the column the table is sorted by (else athleticism score); no number last */
function playerOrder(sortKey: MetricKey | 'group' | 'tested') {
  const m = METRICS.find(x => x.key === sortKey) ?? METRICS.find(x => x.key === 'score')!
  return (a: Player, b: Player) => {
    const va = a.metrics[m.key], vb = b.metrics[m.key]
    if (va == null || vb == null) return (va == null ? 1 : 0) - (vb == null ? 1 : 0) || a.name.localeCompare(b.name)
    return (m.lower ? va - vb : vb - va) || a.name.localeCompare(b.name)
  }
}

function GroupRows({ group, metrics, base, open, onToggle, sortKey }: {
  group: Group; metrics: Metric[]; base: Group; open: boolean; onToggle: () => void; sortKey: MetricKey | 'group' | 'tested'
}) {
  return (
    <>
      <GroupRow group={group} metrics={metrics} base={base} open={open} onToggle={onToggle} />
      {open && [...group.players]
        .sort(playerOrder(sortKey))
        .map(p => (
          <tr key={p.id} style={{ borderBottom: '1px solid var(--gray-border)', background: '#fcfcfd', fontSize: 12 }}>
            <td style={{ padding: '0.35rem 0.7rem 0.35rem 1.4rem', position: 'sticky', left: 0, background: '#fcfcfd', minWidth: 140, maxWidth: 220 }}>
              <a href={`/coach/players/${p.id}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--carolina-dark)', textDecoration: 'none', fontWeight: 600 }}>{p.name}</a>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.3 }}>{[p.teamName, p.position, teamLevelLabel(p.level), teamRankLabel(p.rank)].filter(Boolean).join(' · ')}</div>
            </td>
            <td style={{ padding: '0.35rem 0.7rem', textAlign: 'right', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {p.measuredAt ? new Date(p.measuredAt + (p.measuredAt.length <= 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'not tested'}
            </td>
            {metrics.map(m => (
              <td key={m.key} style={{ padding: '0.35rem 0.7rem', textAlign: 'right', whiteSpace: 'nowrap', color: p.metrics[m.key] == null ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                {fmt(m, p.metrics[m.key])}
              </td>
            ))}
          </tr>
        ))}
    </>
  )
}

// ── Chart: dot (average) + line (lowest–highest player) per group ───────

function DotChart({ groups, metric, base }: { groups: Group[]; metric: Metric; base: number | null }) {
  const rows = groups.filter(g => g.stats[metric.key].avg != null)
  const [hover, setHover] = useState<string | null>(null)
  if (!rows.length) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nobody shown has a {metric.label.toLowerCase()} yet.</div>

  const lo = Math.min(...rows.map(g => g.stats[metric.key].min!))
  const hi = Math.max(...rows.map(g => g.stats[metric.key].max!))
  const pad = (hi - lo) * 0.06 || 1
  const min = lo - pad, max = hi + pad
  // Times: faster (lower) on the right would read backwards next to the
  // other tests, so the axis stays low → high and the caption says so.
  const x = (v: number) => `${((v - min) / (max - min)) * 100}%`
  const ticks = [0, 0.5, 1].map(f => min + (max - min) * f)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(64px, 170px) minmax(120px, 1fr) auto', rowGap: 4, columnGap: 10, alignItems: 'center', fontSize: 12.5 }}>
      {rows.map(g => {
        const s = g.stats[metric.key]
        const on = hover === g.key
        return (
          <div key={g.key} style={{ display: 'contents' }}>
            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: on ? 700 : 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              {g.color && <span style={{ width: 9, height: 9, borderRadius: 2, background: g.color, flexShrink: 0 }} />}
              {g.label}
            </div>
            <div style={{ position: 'relative', height: 26 }}
              onMouseEnter={() => setHover(g.key)} onMouseLeave={() => setHover(null)}
              title={`${g.label}: average ${fmt(metric, s.avg)} · ${fmt(metric, s.min)} to ${fmt(metric, s.max)} · ${s.n} player${s.n === 1 ? '' : 's'}`}>
              {base != null && <div style={{ position: 'absolute', left: x(base), top: 0, bottom: 0, borderLeft: '1.5px dashed var(--text-muted)', opacity: 0.6 }} />}
              <div style={{ position: 'absolute', left: x(s.min!), width: `calc(${x(s.max!)} - ${x(s.min!)})`, top: 12, height: 2, background: 'var(--carolina)', opacity: on ? 0.6 : 0.3, borderRadius: 1 }} />
              <div style={{
                position: 'absolute', left: x(s.avg!), top: 13, width: on ? 14 : 11, height: on ? 14 : 11, borderRadius: '50%',
                background: 'var(--carolina-dark)', border: '2px solid var(--white)', transform: 'translate(-50%, -50%)',
              }} />
            </div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
              {fmt(metric, s.avg)} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>n={s.n}</span>
            </div>
          </div>
        )
      })}
      {/* Axis */}
      <div />
      <div style={{ position: 'relative', height: 18, borderTop: '1px solid var(--gray-border)' }}>
        {ticks.map((t, i) => (
          <span key={i} style={{ position: 'absolute', left: x(t), top: 3, transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)', fontSize: 10.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {fmt(metric, t)}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textAlign: 'right' }}>
        {base != null ? <>avg {fmt(metric, base)}</> : null}
      </div>
    </div>
  )
}

// ── Head to head ────────────────────────────────────────────────────────

function HeadToHead({ a, b, metrics }: { a: Group; b: Group; metrics: Metric[] }) {
  let winsA = 0, winsB = 0
  const rows = metrics.map(m => {
    const va = a.stats[m.key].avg, vb = b.stats[m.key].avg
    const diff = va != null && vb != null ? va - vb : null
    const v = diff != null ? verdict(m, diff) : null
    if (v === 'better') winsA++
    if (v === 'worse') winsB++
    return { m, va, vb, diff, v }
  })
  const cellHead: CSSProperties = { padding: '0.45rem 0.6rem', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700, borderBottom: '1px solid var(--gray-border)' }
  const cell: CSSProperties = { padding: '0.45rem 0.6rem', borderBottom: '1px solid var(--gray-border)', whiteSpace: 'nowrap' }
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--text-secondary)' }}>
        <strong>{a.label}</strong> better on {winsA} · <strong>{b.label}</strong> better on {winsB}
        <span style={{ color: 'var(--text-muted)' }}> · tested {a.tested} vs {b.tested}</span>
      </div>
      <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 420 }}>
        <thead>
          <tr>
            <th style={{ ...cellHead, textAlign: 'left' }}>Test</th>
            <th style={{ ...cellHead, textAlign: 'right' }}>{a.label}</th>
            <th style={{ ...cellHead, textAlign: 'right' }}>{b.label}</th>
            <th style={{ ...cellHead, textAlign: 'right' }}>Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ m, va, vb, diff, v }) => (
            <tr key={m.key}>
              <td style={{ ...cell, fontWeight: 600 }}>{m.label}</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: v === 'better' ? 700 : 400 }}>{fmt(m, va)} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>n={a.stats[m.key].n}</span></td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: v === 'worse' ? 700 : 400 }}>{fmt(m, vb)} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>n={b.stats[m.key].n}</span></td>
              <td style={{ ...cell, textAlign: 'right', color: v && v !== 'even' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 600 }}>
                {diff == null ? '—' : v === 'even' ? 'even' : `${(v === 'better' ? a : b).label} ${fmtDiff(m, v === 'better' ? diff : -diff)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
