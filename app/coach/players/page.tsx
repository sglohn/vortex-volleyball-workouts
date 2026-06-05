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
  approach_vertical_in?: number | null
  standing_vertical_in?: number | null
  best_squat?: number | null
  best_bench?: number | null
  best_deadlift?: number | null
}

type SortKey = 'name' | 'age_group' | 'position' | 'height_in' | 'approach_vertical_in' | 'standing_vertical_in' | 'best_squat' | 'best_bench' | 'best_deadlift' | 'sessionCount'
type SortDir = 'asc' | 'desc'
type ViewMode = 'leaderboard' | 'grouped'
type ScopeKey = 'all' | 'gender' | 'ageGroup' | 'position' | 'team'

const POSITIONS = ['Setter','Outside Hitter','Middle Blocker','Opposite','Libero','Defensive Specialist','Other']

const COLUMNS: { key: SortKey; label: string; short?: string; numeric?: boolean; unit?: string }[] = [
  { key: 'name',                 label: 'Player',      short: 'Player' },
  { key: 'age_group',            label: 'Age Group',   short: 'Age Grp' },
  { key: 'position',             label: 'Position',    short: 'Pos' },
  { key: 'height_in',            label: 'Height',      short: 'Ht',  numeric: true },
  { key: 'approach_vertical_in', label: 'App. Touch',  short: 'App', numeric: true },
  { key: 'standing_vertical_in', label: 'Stand. Vert', short: 'Svert', numeric: true, unit: '"' },
  { key: 'best_squat',           label: 'Squat 1RM',   short: 'Squat', numeric: true, unit: 'lbs' },
  { key: 'best_bench',           label: 'Bench 1RM',   short: 'Bench', numeric: true, unit: 'lbs' },
  { key: 'best_deadlift',        label: 'DL 1RM',      short: 'Dead',  numeric: true, unit: 'lbs' },
  { key: 'sessionCount',         label: 'Sessions',    short: 'Sess',  numeric: true },
]

function fi(inches: number | null | undefined): string {
  if (!inches) return '—'
  const totalInches = Math.round(inches)
  const ft = Math.floor(totalInches / 12)
  const ins = totalInches % 12
  return `${ft}'${ins}"`
}

function fmtNum(val: number | null | undefined, unit = ''): string {
  if (!val) return '—'
  return unit ? `${val} ${unit}` : `${val}`
}

function getRank(players: Player[], key: SortKey, value: number | string | null | undefined): number {
  if (value == null || value === '') return 0
  const col = COLUMNS.find(c => c.key === key)
  if (!col?.numeric) return 0
  const vals = players.map(p => p[key] as number | null).filter((v): v is number => v != null && v > 0)
  const sorted = [...vals].sort((a, b) => b - a)
  return sorted.indexOf(value as number) + 1
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
  const [sortKey, setSortKey] = useState<SortKey>('height_in')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [scopeKey, setScopeKey] = useState<ScopeKey>('all')
  const [scopeValue, setScopeValue] = useState<string>('')
  const [measurements, setMeasurements] = useState({ height_in:'', wingspan_in:'', standing_reach_in:'', standing_vertical_in:'', approach_vertical_in:'' })

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
      const col = COLUMNS.find(c => c.key === key)
      setSortDir(col?.numeric ? 'desc' : 'asc')
    }
  }

  // Scope options derived from player data
  const genderOptions = useMemo(() => [...new Set(players.map(p => p.gender).filter(Boolean))].sort() as string[], [players])
  const ageGroupOptions = useMemo(() => [...new Set(players.map(p => p.age_group).filter(Boolean))].sort() as string[], [players])
  const positionOptions = useMemo(() => [...new Set(players.map(p => p.position).filter(Boolean))].sort() as string[], [players])
  const teamOptions = useMemo(() => teams, [teams])

  // Reset scope value when scope type changes
  function setScope(key: ScopeKey) {
    setScopeKey(key)
    setScopeValue('')
  }

  const scopedPlayers = useMemo(() => {
    let result = players
    if (scopeKey === 'gender' && scopeValue) result = result.filter(p => p.gender === scopeValue)
    else if (scopeKey === 'ageGroup' && scopeValue) result = result.filter(p => p.age_group === scopeValue)
    else if (scopeKey === 'position' && scopeValue) result = result.filter(p => p.position === scopeValue)
    else if (scopeKey === 'team' && scopeValue) result = result.filter(p => p.teamId === scopeValue)
    if (search) result = result.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    return result
  }, [players, scopeKey, scopeValue, search])

  const sortedPlayers = useMemo(() => {
    return [...scopedPlayers].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const col = COLUMNS.find(c => c.key === sortKey)
      if (col?.numeric) {
        const an = (av as number | null) ?? -1
        const bn = (bv as number | null) ?? -1
        return sortDir === 'desc' ? bn - an : an - bn
      }
      const as_ = (av as string | null) ?? ''
      const bs_ = (bv as string | null) ?? ''
      return sortDir === 'asc' ? as_.localeCompare(bs_) : bs_.localeCompare(as_)
    })
  }, [scopedPlayers, sortKey, sortDir])

  function openAdd() { setForm({ name:'', jersey_number:'', position:'', pin:'', team_id:'' }); setEditTarget(null); setModal('add'); setMsg('') }
  function openEdit(p: Player) {
    setForm({ name: p.name, jersey_number: p.jersey_number ?? '', position: p.position ?? '', pin: '', team_id: p.teamId ?? '' })
    setMeasurements({ height_in:'', wingspan_in:'', standing_reach_in:'', standing_vertical_in:'', approach_vertical_in:'' })
    setEditTarget(p)
    setModal('edit')
    setMsg('')
    fetch(`/api/player/measurements?playerId=${p.id}`)
      .then(r => r.json())
      .then(d => {
        const latest = d.measurements?.[0]
        if (latest) setMeasurements({
          height_in: latest.height_in?.toString() ?? '',
          wingspan_in: latest.wingspan_in?.toString() ?? '',
          standing_reach_in: latest.standing_reach_in?.toString() ?? '',
          standing_vertical_in: latest.standing_vertical_in?.toString() ?? '',
          approach_vertical_in: latest.approach_vertical_in?.toString() ?? '',
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
        setPlayers(prev => prev.map(p => p.id === editTarget.id ? { ...p, ...data.player, teamName: team?.name, teamColor: team?.color, teamId: team?.id } : p))
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

  // Grouped view data
  const groupedView = useMemo(() => {
    const teamOrder = teams.map(t => t.id)
    const groups: { label: string; color?: string; players: Player[] }[] = []
    for (const team of teams) {
      const tp = sortedPlayers.filter(p => p.teamId === team.id)
      if (tp.length > 0) groups.push({ label: `${team.name}${team.age_group ? ` ${team.age_group}` : ''}`, color: team.color, players: tp })
    }
    const unassigned = sortedPlayers.filter(p => !p.teamId || !teamOrder.includes(p.teamId))
    if (unassigned.length > 0) groups.push({ label: 'Unassigned', color: undefined, players: unassigned })
    return groups
  }, [teams, sortedPlayers])

  const scopeLabel = useMemo(() => {
    if (scopeKey === 'all') return 'Whole Club'
    if (scopeKey === 'gender') return scopeValue ? `${scopeValue === 'M' ? 'Boys' : 'Girls'} Only` : 'By Gender'
    if (scopeKey === 'ageGroup') return scopeValue ? `Age Group: ${scopeValue}` : 'By Age Group'
    if (scopeKey === 'position') return scopeValue ? `Position: ${scopeValue}` : 'By Position'
    if (scopeKey === 'team') {
      const t = teams.find(t => t.id === scopeValue)
      return t ? `Team: ${t.name}` : 'By Team'
    }
    return ''
  }, [scopeKey, scopeValue, teams])

  const needsScopeValue = scopeKey !== 'all' && !scopeValue

  function SortTh({ col }: { col: typeof COLUMNS[number] }) {
    const active = sortKey === col.key
    return (
      <th
        onClick={() => handleSort(col.key)}
        style={{
          padding:'0.7rem 0.75rem',
          textAlign: col.numeric ? 'right' : 'left',
          fontSize:'0.7rem',
          color: active ? 'var(--carolina-deep)' : 'var(--text-muted)',
          textTransform:'uppercase',
          letterSpacing:'0.05em',
          fontWeight: active ? 800 : 600,
          cursor:'pointer',
          userSelect:'none',
          whiteSpace:'nowrap',
          background: active ? 'var(--carolina-light)' : 'transparent',
          borderBottom: active ? '2px solid var(--carolina)' : '1.5px solid var(--gray-border)',
          transition:'background 0.15s',
        }}
      >
        <span style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem' }}>
          {col.short ?? col.label}
          {active && (
            <span style={{ fontSize:'0.8rem', opacity:0.8 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>
          )}
          {!active && <span style={{ fontSize:'0.75rem', opacity:0.25 }}>↕</span>}
        </span>
      </th>
    )
  }

  function PlayerRow({ p, rank }: { p: Player; rank: number }) {
    const col = COLUMNS.find(c => c.key === sortKey)
    const isNumericSort = col?.numeric && sortKey !== 'sessionCount'
    return (
      <tr style={{ borderBottom:'1px solid var(--gray-border)' }}>
        {/* Rank */}
        <td style={{ padding:'0.75rem 0.5rem 0.75rem 0.875rem', textAlign:'center', width:38 }}>
          <span style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:26, height:26, borderRadius:'50%',
            background: rank === 1 ? '#f59e0b' : rank === 2 ? '#9ca3af' : rank === 3 ? '#cd7c2f' : 'transparent',
            color: rank <= 3 ? '#fff' : 'var(--text-muted)',
            fontWeight: rank <= 3 ? 800 : 500,
            fontSize: '0.72rem',
            fontFamily: 'var(--font-display)',
          }}>
            {rank}
          </span>
        </td>
        {/* Player */}
        <td style={{ padding:'0.75rem 0.75rem' }}>
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
        {/* Height */}
        <td style={{ padding:'0.75rem', textAlign:'right', fontSize:'0.85rem', fontWeight: sortKey==='height_in' ? 700 : 400, color: sortKey==='height_in' ? 'var(--carolina-dark)' : 'var(--text-secondary)', fontFamily:'var(--font-display)' }}>
          {fi(p.height_in)}
        </td>
        {/* App Touch */}
        <td style={{ padding:'0.75rem', textAlign:'right', fontSize:'0.85rem', fontWeight: sortKey==='approach_vertical_in' ? 700 : 400, color: sortKey==='approach_vertical_in' ? 'var(--carolina-dark)' : 'var(--text-secondary)', fontFamily:'var(--font-display)' }}>
          {fi(p.approach_vertical_in)}
        </td>
        {/* Stand Vert */}
        <td style={{ padding:'0.75rem', textAlign:'right', fontSize:'0.85rem', fontWeight: sortKey==='standing_vertical_in' ? 700 : 400, color: sortKey==='standing_vertical_in' ? 'var(--carolina-dark)' : 'var(--text-secondary)', fontFamily:'var(--font-display)' }}>
          {fmtNum(p.standing_vertical_in, '"')}
        </td>
        {/* Squat */}
        <td style={{ padding:'0.75rem', textAlign:'right', fontSize:'0.85rem', fontWeight: sortKey==='best_squat' ? 700 : 400, color: sortKey==='best_squat' ? 'var(--carolina-dark)' : 'var(--text-secondary)', fontFamily:'var(--font-display)' }}>
          {fmtNum(p.best_squat, 'lbs')}
        </td>
        {/* Bench */}
        <td style={{ padding:'0.75rem', textAlign:'right', fontSize:'0.85rem', fontWeight: sortKey==='best_bench' ? 700 : 400, color: sortKey==='best_bench' ? 'var(--carolina-dark)' : 'var(--text-secondary)', fontFamily:'var(--font-display)' }}>
          {fmtNum(p.best_bench, 'lbs')}
        </td>
        {/* Deadlift */}
        <td style={{ padding:'0.75rem', textAlign:'right', fontSize:'0.85rem', fontWeight: sortKey==='best_deadlift' ? 700 : 400, color: sortKey==='best_deadlift' ? 'var(--carolina-dark)' : 'var(--text-secondary)', fontFamily:'var(--font-display)' }}>
          {fmtNum(p.best_deadlift, 'lbs')}
        </td>
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

  if (loading) return <div style={{ padding:'2rem', color:'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding:'2rem', maxWidth:1100 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:800 }}>Players</h1>
          <p style={{ color:'var(--text-muted)', fontSize:'0.85rem' }}>{players.length} active players · {teams.length} teams</p>
        </div>
        <button className="btn-volt" onClick={openAdd} style={{ padding:'0.625rem 1.25rem' }}>+ Add Player</button>
      </div>

      {msg && <div style={{ background: msgErr ? 'var(--danger-light)' : 'var(--carolina-light)', border:`1.5px solid ${msgErr ? '#fecaca' : 'var(--carolina-border)'}`, borderRadius:8, padding:'0.75rem', marginBottom:'1rem', color: msgErr ? 'var(--danger)' : 'var(--carolina-deep)', fontSize:'0.9rem' }}>{msg}</div>}

      {/* Controls bar */}
      <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem', flexWrap:'wrap', alignItems:'center' }}>
        {/* Search */}
        <input className="input" placeholder="Search players…" value={search} onChange={e => setSearch(e.target.value)} style={{ width:200 }} />

        {/* View mode toggle */}
        <div style={{ display:'flex', gap:0, border:'1.5px solid var(--gray-border)', borderRadius:8, overflow:'hidden' }}>
          {(['leaderboard','grouped'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setViewMode(v)} style={{ padding:'0.45rem 0.875rem', background: viewMode===v ? 'var(--carolina-light)' : 'transparent', color: viewMode===v ? 'var(--carolina-deep)' : 'var(--text-muted)', border:'none', cursor:'pointer', fontSize:'0.8rem', fontWeight: viewMode===v ? 700 : 500, borderRight: v==='leaderboard' ? '1.5px solid var(--gray-border)' : 'none' }}>
              {v === 'leaderboard' ? '📊 Leaderboard' : '👥 By Team'}
            </button>
          ))}
        </div>

        {/* Scope selector — only meaningful in leaderboard mode */}
        {viewMode === 'leaderboard' && (
          <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', marginLeft:'auto' }}>
            <span style={{ fontSize:'0.78rem', color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>Scope:</span>
            {([
              { key:'all', label:'Whole Club' },
              { key:'gender', label:'Gender' },
              { key:'ageGroup', label:'Age Group' },
              { key:'position', label:'Position' },
              { key:'team', label:'Team' },
            ] as { key: ScopeKey; label: string }[]).map(s => (
              <button key={s.key} onClick={() => setScope(s.key)} style={{ padding:'0.35rem 0.7rem', borderRadius:6, border:`1.5px solid ${scopeKey===s.key ? 'var(--carolina)' : 'var(--gray-border)'}`, background: scopeKey===s.key ? 'var(--carolina-light)' : 'transparent', color: scopeKey===s.key ? 'var(--carolina-deep)' : 'var(--text-secondary)', cursor:'pointer', fontSize:'0.78rem', fontWeight: scopeKey===s.key ? 700 : 500 }}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scope value picker */}
      {viewMode === 'leaderboard' && scopeKey !== 'all' && (
        <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem', flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>Filter by:</span>
          {scopeKey === 'gender' && (
            <>
              <button onClick={() => setScopeValue('')} style={{ padding:'0.3rem 0.65rem', borderRadius:20, border:`1.5px solid ${!scopeValue ? 'var(--carolina)' : 'var(--gray-border)'}`, background:!scopeValue ? 'var(--carolina-light)' : 'transparent', cursor:'pointer', fontSize:'0.78rem', fontWeight:!scopeValue ? 700 : 400, color:!scopeValue ? 'var(--carolina-deep)' : 'var(--text-secondary)' }}>All</button>
              {genderOptions.map(g => (
                <button key={g} onClick={() => setScopeValue(g)} style={{ padding:'0.3rem 0.65rem', borderRadius:20, border:`1.5px solid ${scopeValue===g ? 'var(--carolina)' : 'var(--gray-border)'}`, background:scopeValue===g ? 'var(--carolina-light)' : 'transparent', cursor:'pointer', fontSize:'0.78rem', fontWeight:scopeValue===g ? 700 : 400, color:scopeValue===g ? 'var(--carolina-deep)' : 'var(--text-secondary)' }}>
                  {g === 'M' ? '♂ Boys' : '♀ Girls'}
                </button>
              ))}
            </>
          )}
          {scopeKey === 'ageGroup' && (
            <>
              <button onClick={() => setScopeValue('')} style={{ padding:'0.3rem 0.65rem', borderRadius:20, border:`1.5px solid ${!scopeValue ? 'var(--carolina)' : 'var(--gray-border)'}`, background:!scopeValue ? 'var(--carolina-light)' : 'transparent', cursor:'pointer', fontSize:'0.78rem', fontWeight:!scopeValue ? 700 : 400, color:!scopeValue ? 'var(--carolina-deep)' : 'var(--text-secondary)' }}>All</button>
              {ageGroupOptions.map(ag => (
                <button key={ag} onClick={() => setScopeValue(ag)} style={{ padding:'0.3rem 0.65rem', borderRadius:20, border:`1.5px solid ${scopeValue===ag ? 'var(--carolina)' : 'var(--gray-border)'}`, background:scopeValue===ag ? 'var(--carolina-light)' : 'transparent', cursor:'pointer', fontSize:'0.78rem', fontWeight:scopeValue===ag ? 700 : 400, color:scopeValue===ag ? 'var(--carolina-deep)' : 'var(--text-secondary)' }}>
                  {ag}
                </button>
              ))}
            </>
          )}
          {scopeKey === 'position' && (
            <>
              <button onClick={() => setScopeValue('')} style={{ padding:'0.3rem 0.65rem', borderRadius:20, border:`1.5px solid ${!scopeValue ? 'var(--carolina)' : 'var(--gray-border)'}`, background:!scopeValue ? 'var(--carolina-light)' : 'transparent', cursor:'pointer', fontSize:'0.78rem', fontWeight:!scopeValue ? 700 : 400, color:!scopeValue ? 'var(--carolina-deep)' : 'var(--text-secondary)' }}>All</button>
              {positionOptions.map(pos => (
                <button key={pos} onClick={() => setScopeValue(pos)} style={{ padding:'0.3rem 0.65rem', borderRadius:20, border:`1.5px solid ${scopeValue===pos ? 'var(--carolina)' : 'var(--gray-border)'}`, background:scopeValue===pos ? 'var(--carolina-light)' : 'transparent', cursor:'pointer', fontSize:'0.78rem', fontWeight:scopeValue===pos ? 700 : 400, color:scopeValue===pos ? 'var(--carolina-deep)' : 'var(--text-secondary)' }}>
                  {pos}
                </button>
              ))}
            </>
          )}
          {scopeKey === 'team' && (
            <>
              <button onClick={() => setScopeValue('')} style={{ padding:'0.3rem 0.65rem', borderRadius:20, border:`1.5px solid ${!scopeValue ? 'var(--carolina)' : 'var(--gray-border)'}`, background:!scopeValue ? 'var(--carolina-light)' : 'transparent', cursor:'pointer', fontSize:'0.78rem', fontWeight:!scopeValue ? 700 : 400, color:!scopeValue ? 'var(--carolina-deep)' : 'var(--text-secondary)' }}>All</button>
              {teamOptions.map(t => (
                <button key={t.id} onClick={() => setScopeValue(t.id)} style={{ padding:'0.3rem 0.65rem', borderRadius:20, border:`1.5px solid ${scopeValue===t.id ? (t.color ?? 'var(--carolina)') : 'var(--gray-border)'}`, background:scopeValue===t.id ? `${t.color}22` : 'transparent', cursor:'pointer', fontSize:'0.78rem', fontWeight:scopeValue===t.id ? 700 : 400, color:scopeValue===t.id ? (t.color ?? 'var(--carolina-deep)') : 'var(--text-secondary)', display:'flex', alignItems:'center', gap:'0.35rem' }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:t.color, display:'inline-block' }} />
                  {t.name}{t.age_group ? ` ${t.age_group}` : ''}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Status line */}
      {viewMode === 'leaderboard' && (
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.75rem' }}>
          <span style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>
            Showing <strong style={{ color:'var(--carolina-deep)' }}>{sortedPlayers.length}</strong> players
            {' '}ranked by <strong style={{ color:'var(--carolina-deep)' }}>{COLUMNS.find(c => c.key === sortKey)?.label}</strong>
            {' '}({sortDir === 'desc' ? 'highest first' : 'lowest first'}) · {scopeLabel}
          </span>
        </div>
      )}

      {sortedPlayers.length === 0 && (
        <div className="card" style={{ padding:'2rem', textAlign:'center', color:'var(--text-muted)' }}>No players found.</div>
      )}

      {/* LEADERBOARD VIEW */}
      {viewMode === 'leaderboard' && sortedPlayers.length > 0 && (
        <div className="card" style={{ overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
            <thead>
              <tr style={{ background:'var(--carolina-light)' }}>
                <th style={{ padding:'0.7rem 0.5rem 0.7rem 0.875rem', width:38, borderBottom:'1.5px solid var(--gray-border)' }}></th>
                {COLUMNS.map(col => <SortTh key={col.key} col={col} />)}
                <th style={{ padding:'0.7rem 0.875rem', textAlign:'left', fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:600, borderBottom:'1.5px solid var(--gray-border)', whiteSpace:'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((p, i) => (
                <PlayerRow key={p.id} p={p} rank={i + 1} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* GROUPED BY TEAM VIEW */}
      {viewMode === 'grouped' && groupedView.map(group => (
        <div key={group.label} style={{ marginBottom:'1.5rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'0.5rem' }}>
            {group.color && <div style={{ width:10, height:10, borderRadius:'50%', background:group.color, flexShrink:0 }} />}
            <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'0.85rem', color: group.color ?? 'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>{group.label}</span>
            <span style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontWeight:500 }}>— {group.players.length} player{group.players.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="card" style={{ overflow:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
              <thead>
                <tr style={{ borderBottom:'1.5px solid var(--gray-border)', background:'var(--carolina-light)' }}>
                  <th style={{ padding:'0.7rem 0.5rem 0.7rem 0.875rem', width:38 }}></th>
                  {COLUMNS.map(col => <SortTh key={col.key} col={col} />)}
                  <th style={{ padding:'0.7rem 0.875rem', textAlign:'left', fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:600, whiteSpace:'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.players.map((p, i) => (
                  <PlayerRow key={p.id} p={p} rank={i + 1} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Add/Edit Modal */}
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
                <FF label="Full Name *"><input className="input" placeholder="Player's full name" value={form.name} onChange={e => setForm(p => ({ ...p, name:e.target.value }))} /></FF>
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
              <>
                <div style={{ borderTop:'1.5px solid var(--gray-border)', margin:'0.5rem 0 1rem', paddingTop:'1rem' }}>
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
                    <FF label="Stand. Vertical">
                      <input className="input" type="number" step="0.5" placeholder="e.g. 20" value={measurements.standing_vertical_in} onChange={e => setMeasurements(m => ({ ...m, standing_vertical_in: e.target.value }))} />
                    </FF>
                    <FF label="App. Touch Height">
                      <FeetInchesInput value={measurements.approach_vertical_in} onChange={v => setMeasurements(m => ({ ...m, approach_vertical_in: v }))} placeholder="e.g. 108" />
                    </FF>
                  </div>
                </div>
              </>
            )}
            <div style={{ display:'flex', gap:'0.75rem' }}>
              <button className="btn-ghost" onClick={closeModal} style={{ flex:1, padding:'0.75rem' }}>Cancel</button>
              <button className="btn-volt" onClick={save} disabled={saving||!form.name} style={{ flex:2, padding:'0.75rem' }}>{saving ? 'Saving…' : modal==='add' ? 'Add Player' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
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
              <button onClick={deletePlayer} style={{ flex:1, padding:'0.75rem', background:'var(--danger)', color:'var(--white)', border:'none', borderRadius:8, fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.95rem', cursor:'pointer', letterSpacing:'0.04em' }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
