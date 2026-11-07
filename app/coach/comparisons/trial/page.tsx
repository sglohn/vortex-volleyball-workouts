// FILE: app/coach/comparisons/trial/page.tsx
//
// Coach → Comparisons → Score Trial (admins, volleyball). TRIAL: shows the
// decathlon-style points score (lib/athleticPoints.ts) next to the current
// athleticism score (lib/athleticism.ts) for every player, so Steve can see
// how the leaderboard would change before switching. Nothing else changes:
// every other page still shows the current score and all the usual numbers.
//
// Data: /api/coach/comparisons/groups (each player's latest measurements,
// the same numbers as Coach → Players, plus her current score).
//
//   - Ranks are within the players shown (Girls / Boys / both, age group).
//   - Move = places up (▲) or down (▼) from her rank on the current score.
//   - Each trait cell shows its points and the numbers behind them.
//   - Agility from before the net-shuttle course (Nov 2) isn't counted.
'use client'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import ComparisonTabs from '@/components/ComparisonTabs'
import {
  POINTS_EXPONENT, POINTS_TESTS, TRAITS, AGILITY_COURSE_START,
  athleticPoints, agilityCounts, type PointsResult, type PointsTest, type TraitKey,
} from '@/lib/athleticPoints'

// ── Data ────────────────────────────────────────────────────────────────

interface Player {
  id: string; name: string; gender: 'F' | 'M'
  teamId: string; teamName: string; teamColor: string; ageGroup: string | null
  measuredAt: string | null
  metrics: {
    standing_reach_in: number | null; standing_vert: number | null; max_vert: number | null
    acceleration_sec: number | null; pro_agility_sec: number | null; score: number | null
  }
}

interface Row {
  p: Player
  pts: PointsResult
  oldAgility: boolean
  newRank: number | null
  curRank: number | null
}

type SortKey = 'new' | 'current' | TraitKey

// ── Formatting ──────────────────────────────────────────────────────────

function ftIn(v: number): string {
  const t = Math.round(v * 2) / 2
  const ft = Math.floor(t / 12)
  const rest = t - ft * 12
  return `${ft}'${Number.isInteger(rest) ? rest : `${Math.floor(rest)}½`}"`
}

function mark(test: PointsTest, v: number | null | undefined): string {
  if (v == null) return '—'
  if (test.unit === 'ftin') return ftIn(v)
  if (test.unit === 'in') return `${Number.isInteger(v) ? v : v.toFixed(1)}"`
  return `${v.toFixed(2)}s`
}

const pts = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString())

/** Competition ranking (ties share a place) by a value, highest first */
function ranks(rows: Row[], value: (r: Row) => number | null): Map<string, number> {
  const scored = rows.map(r => ({ id: r.p.id, v: value(r) })).filter((x): x is { id: string; v: number } => x.v != null)
  scored.sort((a, b) => b.v - a.v)
  const out = new Map<string, number>()
  scored.forEach((x, i) => out.set(x.id, i > 0 && x.v === scored[i - 1].v ? out.get(scored[i - 1].id)! : i + 1))
  return out
}

const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }
const cellHead: CSSProperties = { padding: '0.5rem 0.6rem', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700, borderBottom: '1px solid var(--gray-border)', whiteSpace: 'nowrap' }
const cell: CSSProperties = { padding: '0.45rem 0.6rem', borderBottom: '1px solid var(--gray-border)', whiteSpace: 'nowrap', verticalAlign: 'top' }
const sub: CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginTop: 1 }

// ── Page ────────────────────────────────────────────────────────────────

export default function ScoreTrialPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gender, setGender] = useState<'F' | 'M' | 'all'>('all')
  const [ageGroup, setAgeGroup] = useState('')
  const [sort, setSort] = useState<SortKey>('new')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetch('/api/coach/comparisons/groups')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); setPlayers(d.players ?? []) })
      .catch(() => setError('Could not load players'))
      .finally(() => setLoading(false))
  }, [])

  const ageGroups = useMemo(() => [...new Set(players.map(p => p.ageGroup).filter((g): g is string => !!g))].sort(), [players])

  const rows: Row[] = useMemo(() => {
    const shown = players.filter(p => (gender === 'all' || p.gender === gender) && (!ageGroup || p.ageGroup === ageGroup))
    const base = shown.map(p => {
      const m = p.metrics
      const agilityOk = agilityCounts(p.measuredAt)
      const pr = athleticPoints({
        standing_reach_in: m.standing_reach_in,
        standing_vert: m.standing_vert,
        max_vert: m.max_vert,
        acceleration_sec: m.acceleration_sec,
        pro_agility_sec: agilityOk ? m.pro_agility_sec : null,
      })
      return { p, pts: pr, oldAgility: !agilityOk && m.pro_agility_sec != null, newRank: null, curRank: null } as Row
    }).filter(r => r.pts.total != null || r.p.metrics.score != null)
    const nr = ranks(base, r => r.pts.total)
    const cr = ranks(base, r => r.p.metrics.score)
    return base.map(r => ({ ...r, newRank: nr.get(r.p.id) ?? null, curRank: cr.get(r.p.id) ?? null }))
  }, [players, gender, ageGroup])

  const sorted = useMemo(() => {
    const val = (r: Row): number | null =>
      sort === 'new' ? r.pts.total : sort === 'current' ? r.p.metrics.score : r.pts.traits[sort]
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b)
      if (va == null || vb == null) return (va == null ? 1 : 0) - (vb == null ? 1 : 0) || a.p.name.localeCompare(b.p.name)
      return vb - va || a.p.name.localeCompare(b.p.name)
    })
  }, [rows, sort])

  const movers = useMemo(() => {
    const both = rows.filter(r => r.newRank != null && r.curRank != null).map(r => ({ r, move: r.curRank! - r.newRank! }))
    return {
      up: [...both].filter(x => x.move > 0).sort((a, b) => b.move - a.move).slice(0, 5),
      down: [...both].filter(x => x.move < 0).sort((a, b) => a.move - b.move).slice(0, 5),
      count: both.length,
    }
  }, [rows])

  const topOf = (g: 'F' | 'M', by: 'new' | 'current') => {
    const list = players.filter(p => p.gender === g && (!ageGroup || p.ageGroup === ageGroup))
      .map(p => {
        const m = p.metrics
        const total = athleticPoints({
          standing_reach_in: m.standing_reach_in, standing_vert: m.standing_vert, max_vert: m.max_vert,
          acceleration_sec: m.acceleration_sec, pro_agility_sec: agilityCounts(p.measuredAt) ? m.pro_agility_sec : null,
        }).total
        return { p, v: by === 'new' ? total : m.score }
      })
      .filter((x): x is { p: Player; v: number } => x.v != null)
      .sort((a, b) => b.v - a.v)
    return list[0] ?? null
  }

  const limit = showAll ? sorted.length : 40
  const oldAgilityCount = rows.filter(r => r.oldAgility).length

  return (
    <div style={{ padding: '2rem', maxWidth: 1200 }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, marginBottom: '.25rem' }}>Score Trial</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>
          A points-table athleticism score, side by side with the current score. Trial only: nothing else in the app uses it yet.
        </p>
      </div>
      <ComparisonTabs active="trial" />

      {/* How it works */}
      <div className="card" style={{ padding: '1rem 1.1rem', marginBottom: '1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>How the trial score works</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>
          Three traits, each counted once: <strong>Size</strong> (standing reach), <strong>Jumping</strong> (standing vertical and max vertical, averaged)
          and <strong>Quickness</strong> (acceleration and agility, averaged). Each test has a fixed points table, like the decathlon: the 0-point mark
          and the 1,000-point mark are set, and the curve gets steeper toward the top, so every extra inch or hundredth is worth more the better you
          already are. There's no cap. Total = Size + Jumping + Quickness. Scores don't move when someone else tests, and girls and boys are on the
          same scale.
          {oldAgilityCount > 0 && <> Agility from before {new Date(AGILITY_COURSE_START + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (the
            boys&apos; tryout 5-10-5) isn&apos;t counted: {oldAgilityCount} player{oldAgilityCount === 1 ? '' : 's'} shown score Quickness on acceleration only.</>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ ...cellHead, textAlign: 'left' }}>Test</th>
                <th style={{ ...cellHead, textAlign: 'right' }}>0 pts</th>
                {[250, 500, 750].map(p => <th key={p} style={{ ...cellHead, textAlign: 'right' }}>{p} pts</th>)}
                <th style={{ ...cellHead, textAlign: 'right' }}>1,000 pts</th>
                <th style={{ ...cellHead, textAlign: 'right' }}>1,200 pts</th>
              </tr>
            </thead>
            <tbody>
              {POINTS_TESTS.map(t => {
                // The mark worth P points: zero ± span × (P/1000)^(1/C)
                const at = (p: number) => {
                  const span = Math.abs(t.elite - t.zero) * Math.pow(p / 1000, 1 / POINTS_EXPONENT)
                  return t.lower ? t.zero - span : t.zero + span
                }
                return (
                  <tr key={t.key}>
                    <td style={{ ...cell, fontWeight: 600 }}>{t.label}</td>
                    <td style={{ ...cell, textAlign: 'right', color: 'var(--text-muted)' }}>{mark(t, t.zero)}</td>
                    {[250, 500, 750].map(p => <td key={p} style={{ ...cell, textAlign: 'right' }}>{mark(t, at(p))}</td>)}
                    <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{mark(t, t.elite)}</td>
                    <td style={{ ...cell, textAlign: 'right', color: 'var(--text-muted)' }}>{mark(t, at(1200))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={{ padding: '0.9rem 1.1rem', marginBottom: '1rem', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={labelStyle}>Players</label>
          <select className="input" value={gender} onChange={e => setGender(e.target.value as 'F' | 'M' | 'all')} style={{ fontSize: 13 }}>
            <option value="all">Girls and boys</option>
            <option value="F">Girls</option>
            <option value="M">Boys</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={labelStyle}>Age group</label>
          <select className="input" value={ageGroup} onChange={e => setAgeGroup(e.target.value)} style={{ fontSize: 13 }}>
            <option value="">All age groups</option>
            {ageGroups.map(g => <option key={g} value={g}>{g} only</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={labelStyle}>Sort by</label>
          <select className="input" value={sort} onChange={e => setSort(e.target.value as SortKey)} style={{ fontSize: 13 }}>
            <option value="new">Trial score</option>
            <option value="current">Current score</option>
            {TRAITS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading players…</div>
      : error ? <div style={{ color: 'var(--danger)', padding: '1rem' }}>{error}</div>
      : !rows.length ? <div className="card" style={{ padding: '2rem', color: 'var(--text-muted)', textAlign: 'center' }}>No players with numbers match these filters.</div>
      : (
        <>
          {/* Top girl vs top boy, and the biggest moves */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div className="card" style={{ padding: '0.9rem 1.1rem' }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Top girl vs top boy</div>
              {(['current', 'new'] as const).map(by => {
                const g = topOf('F', by), b = topOf('M', by)
                return (
                  <div key={by} style={{ fontSize: 13, marginBottom: 6 }}>
                    <strong>{by === 'new' ? 'Trial' : 'Current'}:</strong>{' '}
                    {g ? <>{g.p.name} {pts(g.v)}</> : 'no girls'} · {b ? <>{b.p.name} {pts(b.v)}</> : 'no boys'}
                  </div>
                )
              })}
            </div>
            <div className="card" style={{ padding: '0.9rem 1.1rem' }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Biggest moves up</div>
              {movers.up.length ? movers.up.map(({ r, move }) => (
                <div key={r.p.id} style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--success, #16a34a)', fontWeight: 700 }}>▲{move}</span> {r.p.name}{' '}
                  <span style={{ color: 'var(--text-muted)' }}>#{r.curRank} → #{r.newRank}</span>
                </div>
              )) : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nobody moves up.</div>}
            </div>
            <div className="card" style={{ padding: '0.9rem 1.1rem' }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Biggest moves down</div>
              {movers.down.length ? movers.down.map(({ r, move }) => (
                <div key={r.p.id} style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--danger, #dc2626)', fontWeight: 700 }}>▼{-move}</span> {r.p.name}{' '}
                  <span style={{ color: 'var(--text-muted)' }}>#{r.curRank} → #{r.newRank}</span>
                </div>
              )) : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nobody moves down.</div>}
            </div>
          </div>

          {/* The list */}
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={{ ...cellHead, textAlign: 'right' }}>Trial #</th>
                  <th style={{ ...cellHead, textAlign: 'right' }}>Move</th>
                  <th style={{ ...cellHead, textAlign: 'left' }}>Player</th>
                  {TRAITS.map(t => <th key={t.key} style={{ ...cellHead, textAlign: 'right' }}>{t.label}</th>)}
                  <th style={{ ...cellHead, textAlign: 'right' }}>Trial score</th>
                  <th style={{ ...cellHead, textAlign: 'right' }}>Current score</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, limit).map(r => {
                  const m = r.p.metrics
                  const move = r.newRank != null && r.curRank != null ? r.curRank - r.newRank : null
                  const t = (k: 'standing_reach_in' | 'standing_vert' | 'max_vert' | 'acceleration_sec' | 'pro_agility_sec') => POINTS_TESTS.find(x => x.key === k)!
                  return (
                    <tr key={r.p.id}>
                      <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{r.newRank ?? '—'}</td>
                      <td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: move == null || move === 0 ? 'var(--text-muted)' : move > 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>
                        {move == null ? '' : move === 0 ? '–' : move > 0 ? `▲${move}` : `▼${-move}`}
                      </td>
                      <td style={cell}>
                        <a href={`/coach/players/${r.p.id}`} style={{ fontWeight: 600, color: 'inherit' }}>{r.p.name}</a>
                        <span style={sub}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: r.p.teamColor, marginRight: 5 }} />
                          {r.p.teamName}
                        </span>
                      </td>
                      <td style={{ ...cell, textAlign: 'right' }}>
                        {pts(r.pts.traits.size)}
                        <span style={sub}>{mark(t('standing_reach_in'), m.standing_reach_in)}</span>
                      </td>
                      <td style={{ ...cell, textAlign: 'right' }}>
                        {pts(r.pts.traits.jumping)}
                        <span style={sub}>SV {mark(t('standing_vert'), m.standing_vert)} · MV {mark(t('max_vert'), m.max_vert)}</span>
                      </td>
                      <td style={{ ...cell, textAlign: 'right' }}>
                        {pts(r.pts.traits.quickness)}
                        <span style={sub}>
                          {mark(t('acceleration_sec'), m.acceleration_sec)} · {r.oldAgility
                            ? <span title="Old course (5-10-5), not counted">{mark(t('pro_agility_sec'), m.pro_agility_sec)} old</span>
                            : mark(t('pro_agility_sec'), m.pro_agility_sec)}
                        </span>
                      </td>
                      <td style={{ ...cell, textAlign: 'right', fontWeight: 800, fontSize: 14 }}>
                        {pts(r.pts.total)}
                        {r.pts.total == null && <span style={sub}>needs {r.pts.missing.map(k => TRAITS.find(x => x.key === k)!.label.toLowerCase()).join(', ')}</span>}
                      </td>
                      <td style={{ ...cell, textAlign: 'right' }}>
                        {pts(m.score)}
                        {r.curRank != null && <span style={sub}>#{r.curRank}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {sorted.length > 40 && (
            <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
              <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => setShowAll(s => !s)}>
                {showAll ? 'Show top 40' : `Show all ${sorted.length}`}
              </button>
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: '0.75rem' }}>
            {movers.count} players have both scores. Ranks are among the players shown. Points per test: {POINTS_TESTS.map(t => `${t.label} ${mark(t, t.zero)} = 0, ${mark(t, t.elite)} = 1,000`).join('; ')}.
          </div>
        </>
      )}
    </div>
  )
}

