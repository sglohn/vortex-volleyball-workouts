'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import FeetInchesInput from '@/components/FeetInchesInput'

interface Team { id: string; name: string; age_group?: string; color: string }
interface Player {
  id: string; name: string; jersey_number?: string; position?: string
  is_active: boolean; teamName?: string; teamColor?: string; teamId?: string
  age_group?: string; gender?: string
  sessionCount?: number; lastSeen?: string; hasHealthFlag?: boolean
  height_in?: number | null
  standing_reach_in?: number | null
  standing_vertical_in?: number | null   // stored as standing JUMP TOUCH height (ft/in)
  approach_vertical_in?: number | null   // stored as approach TOUCH height (ft/in)
}

// Calculated fields — not stored, derived at display time
function standingVertical(p: Player): number | null {
  if (!p.standing_vertical_in || !p.standing_reach_in) return null
  return Math.round((p.standing_vertical_in - p.standing_reach_in) * 10) / 10
}
function maxVertical(p: Player): number | null {
  if (!p.approach_vertical_in || !p.standing_reach_in) return null
  return Math.round((p.approach_vertical_in - p.standing_reach_in) * 10) / 10
}

type SortKey = 'name' | 'age_group' | 'position' | 'height_in' | 'standing_vertical_in' | 'approach_vertical_in' | 'standingVert' | 'maxVert' | 'sessionCount'
type SortDir = 'asc' | 'desc'
type ViewMode = 'leaderboard' | 'grouped'
type ScopeKey = 'all' | 'ageGroup' | 'position' | 'team'

const POSITIONS = ['Setter','Outside Hitter','Middle Blocker','Opposite','Libero','Defensive Specialist','Other']

// Column definitions — fmt drives display formatting in the row
const COLUMNS: { key: SortKey; label: string; short: string; numeric?: boolean; fmt: 'text' | 'fi' | 'in' }[] = [
  { key: 'name',                 label: 'Player',            short: 'Player',      fmt: 'text' },
  { key: 'age_group',            label: 'Age Group',         short: 'Age Grp',     fmt: 'text' },
  { key: 'position',             label: 'Position',          short: 'Position',    fmt: 'text' },
  { key: 'height_in',            label: 'Height',            short: 'Height',      numeric: true, fmt: 'fi' },
  { key: 'standing_vertical_in', label: 'Stand. Jump Touch', short: 'Stn Touch',   numeric: true, fmt: 'fi' },
  { key: 'standingVert',         label: 'Stand. Vertical',   short: 'Stn Vert',    numeric: true, fmt: 'in' },
  { key: 'approach_vertical_in', label: 'App. Touch',        short: 'App Touch',   numeric: true, fmt: 'fi' },
  { key: 'maxVert',              label: 'Max Vertical',      short: 'Max Vert',    numeric: true, fmt: 'in' },
  { key: 'sessionCount',         label: 'Sessions',          short: 'Sessions',    numeric: true, fmt: 'text' },
]

// ft/in display: 67 → 5'7"
function fi(inches: number | null | undefined): string {
  if (!inches) return '—'
  const total = Math.round(inches)
  return `${Math.floor(total / 12)}'${total % 12}"`
}

// inches display: 24.5 → 24.5"
function fmtIn(val: number | null | undefined): string {
  if (val == null) return '—'
  return `${val}"`
}

function FF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.4rem', fontWeight:600 }}>{label}</label>
      {children}
    </div>
  )
}

export default function CoachPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add'|'edit'|null>(null)
  const [editTarget, setEditTarget] = useState<Player|null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Player|null>(null)
  const [form, setForm] = useState({ name:'', jersey_number:'', position:'', pin:'', team_id:'' })
  const [msg, setMsg] = useState('')
  const [msgErr, setMsgErr] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('leaderboard')
  const [sortKey, setSortKey] = useState<SortKey>('approach_vertical_in')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [scopeKey, setScopeKey] = useState<ScopeKey>('all')
  const [scopeValue, setScopeValue] = useState<string>('')
  const [genderFilter, setGenderFilter] = useState<'all' | 'M' | 'F'>('all')
  const [measurements, setMeasurements] = useState({
    height_in: '', wingspan_in: '', standing_reach_in: '',
    standing_vertical_in: '', approach_vertical_in: '',
  })

  useEffect(() => {
    Promise.all([
      fetch('/api/coach/players').then(r => r.json()),
      fetch('/api/coach/teams').then(r => r.json()),
    ]).then(([p, t]) => {
      setPlayers(p.players ?? [])
      setTeams(t.teams ?? [])
      setLoading(false)
    })
  }, [])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir(COLUMNS.find(c => c.key === key)?.numeric ? 'desc' : 'asc')
    }
  }

  const ageGroupOptions = useMemo(() => [...new Set(players.map(p => p.age_group).filter(Boolean))].sort() as string[], [players])
  const positionOptions = useMemo(() => [...new Set(players.map(p => p.position).filter(Boolean))].sort() as string[], [players])

  function setScope(key: ScopeKey) { setScopeKey(key); setScopeValue('') }

  const scopedPlayers = useMemo(() => {
    let r = players
    if (genderFilter !== 'all') r = r.filter(p => p.gender === genderFilter)
    if (scopeKey === 'ageGroup' && scopeValue) r = r.filter(p => p.age_group === scopeValue)
    if (scopeKey === 'position' && scopeValue) r = r.filter(p => p.position  === scopeValue)
    if (scopeKey === 'team'     && scopeValue) r = r.filter(p => p.teamId    === scopeValue)
    if (search) r = r.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    return r
  }, [players, scopeKey, scopeValue, search, genderFilter])

  const sortedPlayers = useMemo(() => {
    return [...scopedPlayers].sort((a, b) => {
      const col = COLUMNS.find(c => c.key === sortKey)

      // Calculated columns
      if (sortKey === 'standingVert') {
        const av = standingVertical(a) ?? -1
        const bv = standingVertical(b) ?? -1
        return sortDir === 'desc' ? bv - av : av - bv
      }
      if (sortKey === 'maxVert') {
        const av = maxVertical(a) ?? -1
        const bv = maxVertical(b) ?? -1
        return sortDir === 'desc' ? bv - av : av - bv
      }

      // Stored numeric columns
      if (col?.numeric) {
        const an = (a[sortKey as keyof Player] as number | null) ?? -1
        const bn = (b[sortKey as keyof Player] as number | null) ?? -1
        return sortDir === 'desc' ? bn - an : an - bn
      }

      // Text columns
      const as_ = (a[sortKey as keyof Player] as string | null) ?? ''
      const bs_ = (b[sortKey as keyof Player] as string | null) ?? ''
      return sortDir === 'asc' ? as_.localeCompare(bs_) : bs_.localeCompare(as_)
    })
  }, [scopedPlayers, sortKey, sortDir])

  function openAdd() {
    setForm({ name:'', jersey_number:'', position:'', pin:'', team_id:'' })
    setEditTarget(null); setModal('add'); setMsg('')
  }
  function openEdit(p: Player) {
    setForm({ name: p.name, jersey_number: p.jersey_number ?? '', position: p.position ?? '', pin: '', team_id: p.teamId ?? '' })
    setMeasurements({ height_in:'', wingspan_in:'', standing_reach_in:'', standing_vertical_in:'', approach_vertical_in:'' })
    setEditTarget(p); setModal('edit'); setMsg('')
    fetch(`/api/player/measurements?playerId=${p.id}`)
      .then(r => r.json())
      .then(d => {
        const m = d.measurements?.[0]
        if (m) setMeasurements({
          height_in:            m.height_in?.toString()            ?? '',
          wingspan_in:          m.wingspan_in?.toString()          ?? '',
          standing_reach_in:    m.standing_reach_in?.toString()    ?? '',
          standing_vertical_in: m.standing_vertical_in?.toString() ?? '',
          approach_vertical_in: m.approach_vertical_in?.toString() ?? '',
        })
      })
  }
  function closeModal() { setModal(null); setEditTarget(null); setMsg('') }

  async function save() {
    setSaving(true); setMsg('')
    if (!form.name) { setMsg('Name is required'); setMsgErr(true); setSaving(false); return }
    if (modal === 'add') {
      if (!/^\d{4}$/.test(form.pin)) { setMsg('PIN must be exactly 4 digits'); setMsgErr(true); setSaving(false); return }
      const res = await fetch('/api/coach/players', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) })
      const data = await res.json()
      if (res.ok) {
        const team = teams.find(t => t.id === form.team_id)
        setPlayers(prev => [...prev, { ...data.player, teamName: team?.name, teamColor: team?.color, teamId: team?.id }])
        closeModal()
      } else { setMsg(data.error || 'Error saving'); setMsgErr(true) }
    } else if (modal === 'edit' && editTarget) {
      if (form.pin && !/^\d{4}$/.test(form.pin)) { setMsg('New PIN must be 4 digits, or leave blank'); setMsgErr(true); setSaving(false); return }
      const body: Record<string,string> = { id: editTarget.id, name: form.name, jersey_number: form.jersey_number, position: form.position, team_id: form.team_id }
      if (form.pin) body.pin = form.pin
      const res = await fetch('/api/coach/players/delete', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      const data = await res.json()
      if (res.ok) {
        const team = teams.find(t => t.id === form.team_id)
        setPlayers(prev => prev.map(p => p.id === editTarget.id
          ? { ...p, ...data.player, teamName: team?.name, teamColor: team?.color, teamId: team?.id }
          : p
        ))
        const hasMeasurements = Object.values(measurements).some(v => v !== '')
        if (hasMeasurements) {
          await fetch('/api/player/measurements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: editTarget.id, ...measurements }),
          })
        }
        closeModal(); setMsg('Player updated'); setMsgErr(false); setTimeout(() => setMsg(''), 3000)
      } else { setMsg(data.error || 'Error saving'); setMsgErr(true) }
    }
    setSaving(false)
  }

  async function deletePlayer() {
    if (!deleteConfirm) return
    await fetch('/api/coach/players/delete', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: deleteConfirm.id }) })
    setPlayers(prev => prev.filter(p => p.id !== deleteConfirm.id))
    setDeleteConfirm(null); setMsg('Player removed'); setMsgErr(false); setTimeout(() => setMsg(''), 3000)
  }

  const groupedView = useMemo(() => {
    const teamIds = teams.map(t => t.id)
    const groups: { label: string; color?: string; players: Player[] }[] = []
    for (const team of teams) {
      const tp = sortedPlayers.filter(p => p.teamId === team.id)
      if (tp.length) groups.push({ label: `${team.name}${team.age_group ? ` ${team.age_group}` : ''}`, color: team.color, players: tp })
    }
    const unassigned = sortedPlayers.filter(p => !p.teamId || !teamIds.includes(p.teamId))
    if (unassigned.length) groups.push({ label: 'Unassigned', players: unassigned })
    return groups
  }, [teams, sortedPlayers])

  const scopeLabel = useMemo(() => {
    if (scopeKey === 'all')      return 'Whole Club'
    if (scopeKey === 'ageGroup') return scopeValue ? `Age Group: ${scopeValue}` : 'By Age Group'
    if (scopeKey === 'position') return scopeValue ? `Position: ${scopeValue}` : 'By Position'
    if (scopeKey === 'team') {
      const t = teams.find(t => t.id === scopeValue)
      return t ? `Team: ${t.name}` : 'By Team'
    }
    return ''
  }, [scopeKey, scopeValue, teams])

  // ── Sortable header ──────────────────────────────────────────────────────────
  function SortTh({ col }: { col: typeof COLUMNS[number] }) {
    const active = sortKey === col.key
    return (
      <th onClick={() => handleSort(col.key)} style={{
        padding: '0.7rem 0.75rem',
        textAlign: col.numeric ? 'right' : 'left',
        fontSize: '0.7rem',
        color: active ? 'var(--carolina-deep)' : 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        fontWeight: active ? 800 : 600,
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        background: active ? 'var(--carolina-light)' : 'transparent',
        borderBottom: active ? '2px solid var(--carolina)' : '1.5px solid var(--gray-border)',
      }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem' }}>
          {col.short}
          <span style={{ fontSize:'0.8rem', opacity: active ? 0.8 : 0.25 }}>
            {active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
          </span>
        </span>
      </th>
    )
  }

  // ── Player row ───────────────────────────────────────────────────────────────
  function PlayerRow({ p, rank }: { p: Player; rank: number }) {
    const sv = standingVertical(p)
    const mv = maxVertical(p)
    function cellStyle(key: SortKey) {
      const active = sortKey === key
      return { padding:'0.75rem', textAlign:'right' as const, fontSize:'0.85rem', fontWeight: active ? 700 : 400, color: active ? 'var(--carolina-dark)' : 'var(--text-secondary)', fontFamily:'var(--font-display)' }
    }
    return (
      <tr style={{ borderBottom:'1px solid var(--gray-border)' }}>
        {/* Rank */}
        <td style={{ padding:'0.75rem 0.5rem 0.75rem 0.875rem', textAlign:'center', width:38 }}>
          <span style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:26, height:26, borderRadius:'50%',
            background: rank===1 ? '#f59e0b' : rank===2 ? '#9ca3af' : rank===3 ? '#cd7c2f' : 'transparent',
            color: rank<=3 ? '#fff' : 'var(--text-muted)',
            fontWeight: rank<=3 ? 800 : 500, fontSize:'0.72rem', fontFamily:'var(--font-display)',
          }}>{rank}</span>
        </td>
        {/* Name */}
        <td style={{ padding:'0.75rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem' }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background: p.teamColor ? `${p.teamColor}22` : 'var(--carolina-light)', border:`1.5px solid ${p.teamColor ?? 'var(--carolina-border)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-display)', fontWeight:700, color: p.teamColor ?? 'var(--carolina-deep)', fontSize:'0.8rem', flexShrink:0 }}>
              {p.jersey_number || p.name.charAt(0)}
            </div>
            <div>
              <Link href={`/coach/players/${p.id}`} style={{ fontWeight:700, color:'var(--carolina-dark)', textDecoration:'none', fontSize:'0.9rem' }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration='underline')}
                onMouseLeave={e => (e.currentTarget.style.textDecoration='none')}>
                {p.name}
              </Link>
              <div style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>
                {[p.teamName, p.age_group].filter(Boolean).join(' · ')}
                {p.hasHealthFlag && <span style={{ color:'var(--danger)', marginLeft:'0.35rem' }}>⚠</span>}
              </div>
            </div>
          </div>
        </td>
        {/* Age Group */}
        <td style={{ padding:'0.75rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>{p.age_group || '—'}</td>
        {/* Position */}
        <td style={{ padding:'0.75rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>{p.position || '—'}</td>
        {/* Height — ft/in */}
        <td style={cellStyle('height_in')}>{fi(p.height_in)}</td>
        {/* Standing Jump Touch — ft/in */}
        <td style={cellStyle('standing_vertical_in')}>{fi(p.standing_vertical_in)}</td>
        {/* Standing Vertical (calculated) — inches */}
        <td style={cellStyle('standingVert')}>{fmtIn(sv)}</td>
        {/* Approach Touch — ft/in */}
        <td style={cellStyle('approach_vertical_in')}>{fi(p.approach_vertical_in)}</td>
        {/* Max Vertical (calculated) — inches */}
        <td style={cellStyle('maxVert')}>{fmtIn(mv)}</td>
        {/* Sessions */}
        <td style={{ padding:'0.75rem', textAlign:'right', fontSize:'0.82rem', color:'var(--text-muted)' }}>{p.sessionCount ?? 0}</td>
        {/* Actions */}
        <td style={{ padding:'0.75rem 0.875rem', whiteSpace:'nowrap' }}>
          <button onClick={() => openEdit(p)} style={{ background:'none', border:'none', color:'var(--carolina-dark)', cursor:'pointer', fontSize:'0.8rem', fontWeight:600, padding:0 }}>Edit</button>
          <span style={{ color:'var(--gray-border)', margin:'0 0.4rem' }}>|</span>
          <button onClick={() => setDeleteConfirm(p)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:'0.8rem', fontWeight:600, padding:0 }}>Remove</button>
        </td>
      </tr>
    )
  }

  // ── Scope pill row ───────────────────────────────────────────────────────────
  function ScopePills({ options, render }: {
    options: { value: string; label: string; color?: string }[]
    render?: (o: { value: string; label: string; color?: string }) => React.ReactNode
  }) {
    return (
      <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>Filter:</span>
        {[{ value:'', label:'All' }, ...options].map(o => (
          <button key={o.value} onClick={() => setScopeValue(o.value)} style={{
            padding:'0.3rem 0.65rem', borderRadius:20,
            border:`1.5px solid ${scopeValue===o.value ? (o.color ?? 'var(--carolina)') : 'var(--gray-border)'}`,
            background: scopeValue===o.value ? (o.color ? `${o.color}22` : 'var(--carolina-light)') : 'transparent',
            cursor:'pointer', fontSize:'0.78rem',
            fontWeight: scopeValue===o.value ? 700 : 400,
            color: scopeValue===o.value ? (o.color ?? 'var(--carolina-deep)') : 'var(--text-secondary)',
            display:'flex', alignItems:'center', gap:'0.35rem',
          }}>
            {render ? render(o) : o.label}
          </button>
        ))}
      </div>
    )
  }

  // ── Table wrapper (shared by both view modes) ────────────────────────────────
  function PlayerTable({ rows }: { rows: Player[] }) {
    return (
      <div className="card" style={{ overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
          <thead>
            <tr style={{ background:'var(--carolina-light)' }}>
              <th style={{ padding:'0.7rem 0.5rem 0.7rem 0.875rem', width:38, borderBottom:'1.5px solid var(--gray-border)' }} />
              {COLUMNS.map(col => <SortTh key={col.key} col={col} />)}
              <th style={{ padding:'0.7rem 0.875rem', textAlign:'left', fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:600, borderBottom:'1.5px solid var(--gray-border)', whiteSpace:'nowrap' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => <PlayerRow key={p.id} p={p} rank={i + 1} />)}
          </tbody>
        </table>
      </div>
    )
  }

  if (loading) return <div style={{ padding:'2rem', color:'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding:'2rem', maxWidth:1100 }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:800 }}>Players</h1>
          <p style={{ color:'var(--text-muted)', fontSize:'0.85rem' }}>{players.length} active players · {teams.length} teams</p>
        </div>
        <button className="btn-volt" onClick={openAdd} style={{ padding:'0.625rem 1.25rem' }}>+ Add Player</button>
      </div>

      {msg && (
        <div style={{ background: msgErr ? 'var(--danger-light)' : 'var(--carolina-light)', border:`1.5px solid ${msgErr ? '#fecaca' : 'var(--carolina-border)'}`, borderRadius:8, padding:'0.75rem', marginBottom:'1rem', color: msgErr ? 'var(--danger)' : 'var(--carolina-deep)', fontSize:'0.9rem' }}>
          {msg}
        </div>
      )}

      {/* ── Controls bar ───────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:'0.75rem', marginBottom:'0.875rem', flexWrap:'wrap', alignItems:'center' }}>
        <input className="input" placeholder="Search players…" value={search} onChange={e => setSearch(e.target.value)} style={{ width:200 }} />

        <div style={{ display:'flex', border:'1.5px solid var(--gray-border)', borderRadius:8, overflow:'hidden' }}>
          {(['leaderboard','grouped'] as ViewMode[]).map((v, i) => (
            <button key={v} onClick={() => setViewMode(v)} style={{ padding:'0.45rem 0.875rem', background: viewMode===v ? 'var(--carolina-light)' : 'transparent', color: viewMode===v ? 'var(--carolina-deep)' : 'var(--text-muted)', border:'none', borderRight: i===0 ? '1.5px solid var(--gray-border)' : 'none', cursor:'pointer', fontSize:'0.8rem', fontWeight: viewMode===v ? 700 : 500 }}>
              {v === 'leaderboard' ? '📊 Leaderboard' : '👥 By Team'}
            </button>
          ))}
        </div>

        {viewMode === 'leaderboard' && (
          <div style={{ display:'flex', gap:'0.4rem', alignItems:'center', marginLeft:'auto', flexWrap:'wrap' }}>
            <span style={{ fontSize:'0.78rem', color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>Scope:</span>
            {([
              { key:'all',      label:'Whole Club' },
              { key:'ageGroup', label:'Age Group' },
              { key:'position', label:'Position' },
              { key:'team',     label:'Team' },
            ] as { key: ScopeKey; label: string }[]).map(s => (
              <button key={s.key} onClick={() => setScope(s.key)} style={{ padding:'0.35rem 0.7rem', borderRadius:6, border:`1.5px solid ${scopeKey===s.key ? 'var(--carolina)' : 'var(--gray-border)'}`, background: scopeKey===s.key ? 'var(--carolina-light)' : 'transparent', color: scopeKey===s.key ? 'var(--carolina-deep)' : 'var(--text-secondary)', cursor:'pointer', fontSize:'0.78rem', fontWeight: scopeKey===s.key ? 700 : 500 }}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Gender toggle ──────────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.75rem' }}>
        <span style={{ fontSize:'0.78rem', color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>Gender:</span>
        {([
          { value: 'all', label: 'Both' },
          { value: 'F',   label: '♀ Girls' },
          { value: 'M',   label: '♂ Boys' },
        ] as { value: 'all' | 'M' | 'F'; label: string }[]).map(opt => (
          <button key={opt.value} onClick={() => setGenderFilter(opt.value)} style={{
            padding: '0.3rem 0.75rem', borderRadius: 20,
            border: `1.5px solid ${genderFilter === opt.value ? 'var(--carolina)' : 'var(--gray-border)'}`,
            background: genderFilter === opt.value ? 'var(--carolina-light)' : 'transparent',
            color: genderFilter === opt.value ? 'var(--carolina-deep)' : 'var(--text-secondary)',
            fontWeight: genderFilter === opt.value ? 700 : 500,
            fontSize: '0.82rem', cursor: 'pointer',
          }}>{opt.label}</button>
        ))}
        {genderFilter !== 'all' && (
          <span style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginLeft:'0.25rem' }}>
            — {sortedPlayers.length} player{sortedPlayers.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>


      {viewMode === 'leaderboard' && scopeKey !== 'all' && (
        <div style={{ marginBottom:'0.875rem' }}>
          {scopeKey === 'ageGroup' && <ScopePills options={ageGroupOptions.map(g => ({ value:g, label:g }))} />}
          {scopeKey === 'position' && <ScopePills options={positionOptions.map(p => ({ value:p, label:p }))} />}
          {scopeKey === 'team' && (
            <ScopePills
              options={teams.map(t => ({ value:t.id, label:`${t.name}${t.age_group ? ` ${t.age_group}` : ''}`, color:t.color }))}
              render={o => <><span style={{ width:8, height:8, borderRadius:'50%', background:o.color, display:'inline-block' }} />{o.label}</>}
            />
          )}
        </div>
      )}

      {/* ── Status line ────────────────────────────────────────────────────── */}
      {viewMode === 'leaderboard' && (
        <div style={{ marginBottom:'0.75rem', fontSize:'0.8rem', color:'var(--text-muted)' }}>
          Showing <strong style={{ color:'var(--carolina-deep)' }}>{sortedPlayers.length}</strong> players
          {' '}ranked by <strong style={{ color:'var(--carolina-deep)' }}>{COLUMNS.find(c => c.key === sortKey)?.label}</strong>
          {' '}({sortDir === 'desc' ? 'highest first' : 'lowest first'}) · {scopeLabel}
        </div>
      )}

      {sortedPlayers.length === 0 && (
        <div className="card" style={{ padding:'2rem', textAlign:'center', color:'var(--text-muted)' }}>No players found.</div>
      )}

      {/* ── LEADERBOARD VIEW ───────────────────────────────────────────────── */}
      {viewMode === 'leaderboard' && sortedPlayers.length > 0 && (
        <PlayerTable rows={sortedPlayers} />
      )}

      {/* ── GROUPED BY TEAM VIEW ───────────────────────────────────────────── */}
      {viewMode === 'grouped' && groupedView.map(group => (
        <div key={group.label} style={{ marginBottom:'1.5rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'0.5rem' }}>
            {group.color && <div style={{ width:10, height:10, borderRadius:'50%', background:group.color, flexShrink:0 }} />}
            <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'0.85rem', color: group.color ?? 'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>{group.label}</span>
            <span style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontWeight:500 }}>— {group.players.length} player{group.players.length !== 1 ? 's' : ''}</span>
          </div>
          <PlayerTable rows={group.players} />
        </div>
      ))}

      {/* ── Add / Edit Modal ──────────────────────────────────────────────── */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:'1rem' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="card" style={{ width:'100%', maxWidth:500, padding:'1.75rem', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.25rem' }}>{modal==='add' ? 'Add Player' : `Edit — ${editTarget?.name}`}</h2>
              <button onClick={closeModal} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'1.3rem', lineHeight:1 }}>✕</button>
            </div>
            {msg && <div style={{ background:'var(--danger-light)', border:'1.5px solid #fecaca', borderRadius:8, padding:'0.625rem', marginBottom:'1rem', color:'var(--danger)', fontSize:'0.85rem' }}>{msg}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.875rem', marginBottom:'0.875rem' }}>
              <div style={{ gridColumn:'1/-1' }}>
                <FF label="Full Name *">
                  <input className="input" placeholder="Player's full name" value={form.name} onChange={e => setForm(p => ({ ...p, name:e.target.value }))} />
                </FF>
              </div>
              <FF label={modal==='add' ? '4-Digit PIN *' : 'New PIN (blank = keep current)'}>
                <input className="input" type="number" placeholder="e.g. 1234" value={form.pin} onChange={e => setForm(p => ({ ...p, pin:e.target.value.slice(0,4) }))} />
              </FF>
              <FF label="Jersey #">
                <input className="input" placeholder="e.g. 14" value={form.jersey_number} onChange={e => setForm(p => ({ ...p, jersey_number:e.target.value }))} />
              </FF>
              <FF label="Team">
                <select className="input" value={form.team_id} onChange={e => setForm(p => ({ ...p, team_id:e.target.value }))}>
                  <option value="">No team assigned</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}{t.age_group ? ` (${t.age_group})` : ''}</option>)}
                </select>
              </FF>
              <FF label="Position">
                <select className="input" value={form.position} onChange={e => setForm(p => ({ ...p, position:e.target.value }))}>
                  <option value="">Select…</option>
                  {POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                </select>
              </FF>
            </div>

            {modal === 'edit' && (
              <div style={{ borderTop:'1.5px solid var(--gray-border)', paddingTop:'1rem', marginBottom:'0.875rem' }}>
                <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:700, marginBottom:'0.75rem' }}>Measurements (leave blank to keep current)</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
                  <FF label="Height">
                    <FeetInchesInput value={measurements.height_in} onChange={v => setMeasurements(m => ({ ...m, height_in: v }))} placeholder="e.g. 67" />
                  </FF>
                  <FF label="Wingspan">
                    <FeetInchesInput value={measurements.wingspan_in} onChange={v => setMeasurements(m => ({ ...m, wingspan_in: v }))} placeholder="e.g. 68" />
                  </FF>
                  <FF label="Standing Reach">
                    <FeetInchesInput value={measurements.standing_reach_in} onChange={v => setMeasurements(m => ({ ...m, standing_reach_in: v }))} placeholder="e.g. 84" />
                  </FF>
                  <FF label="Stand. Jump Touch">
                    <FeetInchesInput value={measurements.standing_vertical_in} onChange={v => setMeasurements(m => ({ ...m, standing_vertical_in: v }))} placeholder="e.g. 96" />
                  </FF>
                  <FF label="Approach Touch">
                    <FeetInchesInput value={measurements.approach_vertical_in} onChange={v => setMeasurements(m => ({ ...m, approach_vertical_in: v }))} placeholder="e.g. 108" />
                  </FF>
                </div>
                <p style={{ fontSize:'0.73rem', color:'var(--text-muted)', marginTop:'0.6rem', fontStyle:'italic' }}>
                  Standing vertical and max vertical are calculated automatically from touch height minus standing reach.
                </p>
              </div>
            )}

            <div style={{ display:'flex', gap:'0.75rem' }}>
              <button className="btn-ghost" onClick={closeModal} style={{ flex:1, padding:'0.75rem' }}>Cancel</button>
              <button className="btn-volt" onClick={save} disabled={saving||!form.name} style={{ flex:2, padding:'0.75rem' }}>{saving ? 'Saving…' : modal==='add' ? 'Add Player' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ────────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:'1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}>
          <div className="card" style={{ width:'100%', maxWidth:400, padding:'1.75rem', textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'var(--danger-light)', border:'1.5px solid #fecaca', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </div>
            <h3 style={{ fontFamily:'var(--font-display)', fontSize:'1.25rem', fontWeight:800, marginBottom:'0.5rem' }}>Remove {deleteConfirm.name}?</h3>
            <p style={{ color:'var(--text-muted)', fontSize:'0.85rem', marginBottom:'1.5rem', lineHeight:1.6 }}>
              This removes them from the active roster. All their workout history and data is preserved.
            </p>
            <div style={{ display:'flex', gap:'0.75rem' }}>
              <button className="btn-ghost" onClick={() => setDeleteConfirm(null)} style={{ flex:1, padding:'0.75rem' }}>Cancel</button>
              <button onClick={deletePlayer} style={{ flex:1, padding:'0.75rem', background:'var(--danger)', color:'var(--white)', border:'none', borderRadius:8, fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.95rem', cursor:'pointer' }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
