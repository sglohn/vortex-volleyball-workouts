'use client'
// FILE: app/coach/teams/page.tsx
//
// Coach → Teams. "▶ Team Mode" opens one team's shared screen; "Start Weight
// Room Session" picks every team lifting together (usually two) and opens
// one shared screen for all of them (/team/<id>,<id>, app/team/[teamId]).
// The session picker lists every team, not just a team coach's own, since
// the other team in the room is often someone else's. Teams with a workout
// scheduled today are marked and listed first.
//
// Workouts to review (volleyball): every day before today a player checked
// in but didn't log every set (or logged none), that nobody has decided on.
// Shows how far she got; admins give Full / her % / No credit (or open the
// day for any % and a note: components/WorkoutCredit.tsx). Team coaches see
// their own players' list without the buttons.
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useIsAdmin } from '@/components/CoachContext'
import { teamInitial } from '@/lib/teamInitial'
import { FEATURES } from '@/lib/features'
import { TEAM_LEVELS, TEAM_RANKS, teamLevelLabel, teamRankLabel } from '@/lib/teamLevel'
import { AttendancePill, SeasonHealth } from '@/components/Attendance'
import WorkoutCredit, { saveCredit } from '@/components/WorkoutCredit'
import { dayLabel, pctColor, type TeamAttendance } from '@/lib/attendance'

interface ReviewItem { playerId: string; playerName: string; teamId: string; teamName: string; date: string; status: string; done: number; planned: number; combine: boolean; credit: number }
interface Team { id: string; name: string; age_group?: string; level?: string | null; club_rank?: number | null; color: string; is_active: boolean; playerCount?: number; is_open_gym?: boolean; coaches?: string[] }

const COLORS = ['#56a0d3','#111827','#ef4444','#f97316','#8b5cf6','#10b981','#f59e0b','#ec4899','#06b6d4','#84cc16']
// Season Report columns (lib/attendance.ts)
type ReportSort = 'team' | 'pct' | 'finished' | 'injuries' | 'pains' | 'outDays'
const REPORT_COLS: { key: ReportSort; label: string; title: string }[] = [
  { key: 'team',     label: 'Team',       title: 'Team name' },
  { key: 'pct',      label: 'Attendance', title: 'Credit earned ÷ workout days that count, whole roster (full workout = every set logged; partial = its % done unless an admin decided)' },
  { key: 'finished', label: 'Full',       title: 'Full workouts (every set logged, or given full credit) ÷ workout days that count' },
  { key: 'injuries', label: 'Injuries',   title: 'Injury reports this season (players injured)' },
  { key: 'pains',    label: 'Pain / Sore', title: 'Pain and soreness reports this season' },
  { key: 'outDays',  label: 'Days Out',   title: 'Player-days at Out this season, added up' },
]
function reportValue(t: TeamAttendance, k: ReportSort): number | string {
  switch (k) {
    case 'team': return t.teamName
    case 'pct': return t.pct ?? -1
    case 'finished': return t.finishedPct ?? -1
    case 'injuries': return t.health.injuries
    case 'pains': return t.health.pains + t.health.soreness
    case 'outDays': return t.health.outDays
  }
}

const AGE_GROUPS = ['12s','13s','14s','15s','16s','17s','18s','Boys 13s','Boys 14s','Boys 15s','Boys 16s','Boys 17s','Boys 18s','Open']

export default function CoachTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add'|'edit'|null>(null)
  const [editTarget, setEditTarget] = useState<Team|null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Team|null>(null)
  const [form, setForm] = useState({ name:'', age_group:'', level:'', club_rank:'', color:'#56a0d3' })
  const [msg, setMsg] = useState('')
  const [msgErr, setMsgErr] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sessionTeams, setSessionTeams] = useState<string[]>([])
  const [sessionUrl, setSessionUrl] = useState('')
  // Every team for the session picker, and which have a workout today
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [todayIds, setTodayIds] = useState<Set<string>>(new Set())
  // Team coaches see their own teams here; adding, editing and scheduling are admins only
  const isAdmin = useIsAdmin()
  // Weight room attendance + health this season, per team (volleyball only)
  const [att, setAtt] = useState<Record<string, TeamAttendance>>({})
  const [attList, setAttList] = useState<TeamAttendance[]>([])
  const [reportSort, setReportSort] = useState<{ key: ReportSort; desc: boolean }>({ key: 'pct', desc: true })
  // Partial / signed-in workouts waiting for a decision
  const [review, setReview] = useState<ReviewItem[]>([])
  const [reviewOpen, setReviewOpen] = useState<string | null>(null)   // playerId|date
  const [reviewMsg, setReviewMsg] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)

  function loadAttendance() {
    fetch('/api/coach/attendance').then(r => r.ok ? r.json() : null).then(d => {
      const list = (d?.teams ?? []) as TeamAttendance[]
      setAttList(list)
      setAtt(Object.fromEntries(list.map(t => [t.teamId, t])))
      setReview((d?.review ?? []) as ReviewItem[])
    }).catch(() => {})
  }

  async function decide(items: ReviewItem[], credit: number) {
    setReviewBusy(true); setReviewMsg('')
    const err = await saveCredit(items.map(i => ({ playerId: i.playerId, date: i.date })), credit)
    setReviewBusy(false)
    if (err) { setReviewMsg(err); return }
    loadAttendance()
  }

  useEffect(() => {
    fetch('/api/coach/teams').then(r => r.json()).then(d => { setTeams(d.teams ?? []); setLoading(false) })
    fetch('/api/coach/teams?all=1').then(r => r.json()).then(d => setAllTeams(((d.teams ?? []) as Team[]).filter(t => !t.is_open_gym))).catch(() => {})
    if (FEATURES.datedSchedule) loadAttendance()
    // Volleyball only (lib/features.ts); lacrosse just doesn't mark "today"
    fetch('/api/display-teams').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.todayOnly) setTodayIds(new Set(((d.teams ?? []) as { id: string }[]).map(t => t.id)))
    }).catch(() => {})
  }, [])

  function openAdd() { setForm({ name:'', age_group:'', level:'', club_rank:'', color:'#56a0d3' }); setEditTarget(null); setModal('add'); setMsg('') }
  function openEdit(t: Team) { setForm({ name:t.name, age_group:t.age_group??'', level:t.level??'', club_rank:t.club_rank ? String(t.club_rank) : '', color:t.color }); setEditTarget(t); setModal('edit'); setMsg('') }
  function closeModal() { setModal(null); setEditTarget(null); setMsg('') }

  async function save() {
    if (!form.name) { setMsg('Team name is required'); setMsgErr(true); return }
    setSaving(true)
    const method = modal === 'add' ? 'POST' : 'PUT'
    // Team level and number are volleyball only (Comparisons → Groups); lacrosse doesn't send them
    const { level, club_rank, ...rest } = form
    const fields = FEATURES.measurements ? { ...rest, level: level || null, club_rank: club_rank ? Number(club_rank) : null } : rest
    const body = modal === 'edit' && editTarget ? { id: editTarget.id, ...fields } : fields
    const res = await fetch('/api/coach/teams', { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    const data = await res.json()
    if (res.ok) {
      if (modal === 'add') setTeams(prev => [...prev, { ...data.team, playerCount: 0 }])
      else setTeams(prev => prev.map(t => t.id === data.team.id ? { ...t, ...data.team } : t))
      closeModal(); setMsg(`Team ${modal==='add'?'created':'updated'}`); setMsgErr(false); setTimeout(()=>setMsg(''),3000)
    } else { setMsg(data.error || 'Error'); setMsgErr(true) }
    setSaving(false)
  }

  async function deleteTeam() {
    if (!deleteConfirm) return
    await fetch('/api/coach/teams/delete', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: deleteConfirm.id }) })
    setTeams(prev => prev.filter(t => t.id !== deleteConfirm.id))
    setDeleteConfirm(null); setMsg('Team removed'); setMsgErr(false); setTimeout(()=>setMsg(''),3000)
  }

  function buildSessionUrl() {
    if (!sessionTeams.length) return
    setSessionUrl(`${window.location.origin}/team/${sessionTeams.join(',')}`)
  }

  if (loading) return <div style={{ padding:'2rem', color:'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding:'2rem', maxWidth:800 }}>
      <div className="wrap-phone" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'2rem', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:800 }}>Teams</h1>
          <p style={{ color:'var(--text-muted)', fontSize:'0.85rem' }}>{teams.length} active teams</p>
        </div>
        {isAdmin && <div style={{ display:'flex', gap:'0.625rem' }}>
          <a href="/coach/season-rollover" style={{ padding:'0.625rem 1.25rem', border:'1.5px solid var(--carolina)', borderRadius:8, color:'var(--carolina-dark)', fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.85rem', textDecoration:'none', display:'flex', alignItems:'center', gap:'0.4rem' }}>
            🔄 Season Rollover
          </a>
          <button className="btn-volt" onClick={openAdd} style={{ padding:'0.625rem 1.25rem' }}>+ New Team</button>
        </div>}
      </div>

      {msg && <div style={{ background: msgErr?'var(--danger-light)':'var(--carolina-light)', border:`1.5px solid ${msgErr?'#fecaca':'var(--carolina-border)'}`, borderRadius:8, padding:'0.75rem', marginBottom:'1rem', color: msgErr?'var(--danger)':'var(--carolina-deep)', fontSize:'0.9rem' }}>{msg}</div>}

      {/* ── WORKOUTS TO REVIEW ── */}
      {review.length > 0 && (
        <div className="card" style={{ padding:'1.1rem 1.25rem', marginBottom:'1.25rem', borderLeft:'4px solid #d97706' }}>
          <div className="wrap-phone" style={{ display:'flex', alignItems:'flex-start', gap:'0.75rem' }}>
            <div style={{ flex:1 }}>
              <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.1rem' }}>Workouts to review ({review.length})</h2>
              <p style={{ color:'var(--text-muted)', fontSize:'0.78rem', marginTop:'0.2rem' }}>
                Checked in but didn&apos;t log every set. Each counts as its % done until {isAdmin ? 'you decide' : 'an admin decides'}. Tap Details to see how far she got.
              </p>
            </div>
            {isAdmin && review.length > 1 && (
              <button disabled={reviewBusy} onClick={() => { if (confirmAll) { setConfirmAll(false); decide(review, 100) } else setConfirmAll(true) }}
                className="btn-ghost full-phone" style={{ padding:'0.4rem 0.8rem', fontSize:'0.78rem', flexShrink:0, color: confirmAll ? '#16a34a' : undefined }}>
                {confirmAll ? `Tap again: full credit for all ${review.length}` : `Full credit for all ${review.length}`}
              </button>
            )}
          </div>
          {reviewMsg && <div style={{ color:'var(--danger)', fontSize:'0.8rem', marginTop:'0.5rem' }}>{reviewMsg}</div>}
          <div style={{ marginTop:'0.6rem' }}>
            {review.map(r => {
              const key = `${r.playerId}|${r.date}`
              const pctDone = r.planned > 0 ? Math.min(100, Math.round(r.done / r.planned * 100)) : 0
              const btn: React.CSSProperties = { padding:'0.25rem 0.55rem', borderRadius:6, fontSize:'0.72rem', fontWeight:700, cursor:'pointer', background:'var(--white)' }
              return (
                <div key={key} style={{ borderTop:'1px solid var(--gray-border)', padding:'0.55rem 0' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', flexWrap:'wrap' }}>
                    <div style={{ flex:'1 1 220px', minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:'0.88rem' }}>{r.playerName} <span style={{ fontWeight:500, color:'var(--text-muted)', fontSize:'0.78rem' }}>· {r.teamName} · {dayLabel(r.date)}</span></div>
                      <div style={{ fontSize:'0.76rem', color: r.done ? '#b45309' : 'var(--danger)', fontWeight:600 }}>
                        {r.done ? `${r.done} of ${r.planned || '?'} ${r.combine ? 'tests' : 'sets'} (${pctDone}%)` : `Signed in, no ${r.combine ? 'tests' : 'sets'} logged`}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:'0.35rem', flexWrap:'wrap' }}>
                      {isAdmin && <>
                        <button disabled={reviewBusy} onClick={() => decide([r], 100)} style={{ ...btn, border:'1.5px solid #16a34a60', color:'#16a34a' }}>Full</button>
                        {pctDone > 0 && <button disabled={reviewBusy} onClick={() => decide([r], pctDone)} style={{ ...btn, border:'1.5px solid #d9770660', color:'#b45309' }}>Keep {pctDone}%</button>}
                        <button disabled={reviewBusy} onClick={() => decide([r], 0)} style={{ ...btn, border:'1.5px solid #dc262660', color:'#dc2626' }}>None</button>
                      </>}
                      <button onClick={() => setReviewOpen(reviewOpen === key ? null : key)} style={{ ...btn, border:'1.5px solid var(--carolina-border)', color:'var(--carolina-dark)' }}>{reviewOpen === key ? 'Hide' : 'Details'}</button>
                    </div>
                  </div>
                  {reviewOpen === key && (
                    <WorkoutCredit playerId={r.playerId} date={r.date} onClose={() => setReviewOpen(null)}
                      onChanged={() => { setReviewOpen(null); loadAttendance() }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
        {teams.length === 0 && <div className="card" style={{ padding:'2rem', textAlign:'center', color:'var(--text-muted)' }}>No teams yet. Add your first team above.</div>}
        {teams.map(t => (
          <div key={t.id} className="card wrap-phone" style={{ padding:'1.1rem 1.25rem', borderLeft:`4px solid ${t.color}`, display:'flex', alignItems:'center', gap:'1rem', rowGap:'0.75rem' }}>
            {/* Color swatch */}
            <div style={{ width:40, height:40, borderRadius:10, background:t.color, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1rem', color:'white' }}>
                {t.is_open_gym ? '⚡' : teamInitial(t.name)}
              </span>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                <Link href={`/coach/teams/${t.id}`} style={{ fontWeight:700, fontSize:'1rem', color:'var(--black)', textDecoration:'none' }}>{t.name} →</Link>
                {t.is_open_gym && <span style={{ fontSize:'0.7rem', fontWeight:700, background:'var(--carolina-light)', color:'var(--carolina-deep)', border:'1px solid var(--carolina-border)', borderRadius:20, padding:'0.1rem 0.5rem', letterSpacing:'0.04em', textTransform:'uppercase' }}>TV Display Only</span>}
              </div>
              <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:'0.1rem' }}>
                {t.is_open_gym
                  ? 'Schedule a workout to show on the TV — no player check-in'
                  : <>{t.age_group && <span>{t.age_group} · </span>}{FEATURES.measurements && teamLevelLabel(t.level) && <span>{teamLevelLabel(t.level)} · </span>}{FEATURES.measurements && teamRankLabel(t.club_rank) && <span>{teamRankLabel(t.club_rank)} · </span>}<span>{t.playerCount ?? 0} players</span></>
                }
              </div>
              {!t.is_open_gym && !!t.coaches?.length && (
                <div style={{ fontSize:'0.78rem', color:'var(--text-secondary)', marginTop:'0.1rem' }}>{t.coaches.join(' · ')}</div>
              )}
              {!t.is_open_gym && att[t.id] && (
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap', marginTop:'0.35rem' }}>
                  <AttendancePill pct={att[t.id].pct} attended={att[t.id].credit} counted={att[t.id].counted} />
                  <SeasonHealth health={att[t.id].health} prefix="" />
                </div>
              )}
            </div>
            <div className="full-phone" style={{ display:'flex', gap:'0.625rem', alignItems:'center', flexShrink:0, flexWrap:'wrap' }}>
              {!t.is_open_gym && (
                <a href={`/team/${t.id}`} target="_blank" rel="noopener noreferrer"
                  style={{ background:'var(--carolina)', color:'var(--white)', fontSize:'0.78rem', textDecoration:'none', fontWeight:700, padding:'0.35rem 0.75rem', borderRadius:6, letterSpacing:'0.03em' }}>
                  ▶ Team Mode
                </a>
              )}
              {isAdmin && <Link href={`/coach/schedule?team=${t.id}`}
                style={{ color:'var(--carolina-dark)', fontSize:'0.82rem', textDecoration:'none', fontWeight:600 }}>
                Schedule
              </Link>}
              {isAdmin && !t.is_open_gym && <>
                <button className="tap-phone" onClick={() => openEdit(t)} style={{ background:'none', border:'none', color:'var(--carolina-dark)', cursor:'pointer', fontSize:'0.82rem', fontWeight:600, padding:0 }}>Edit</button>
                <span className="hide-phone" style={{ color:'var(--gray-border)' }}>|</span>
                <button className="tap-phone" onClick={() => setDeleteConfirm(t)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:'0.82rem', fontWeight:600, padding:0 }}>Delete</button>
              </>}
            </div>
          </div>
        ))}
      </div>


      {/* ── SEASON REPORT: attendance next to injuries, team by team ── */}
      {attList.length > 0 && (() => {
        const rows = [...attList].sort((a, b) => {
          const va = reportValue(a, reportSort.key), vb = reportValue(b, reportSort.key)
          const c = typeof va === 'string' ? va.localeCompare(vb as string, undefined, { numeric: true }) : (va as number) - (vb as number)
          return (reportSort.desc ? -c : c) || a.teamName.localeCompare(b.teamName, undefined, { numeric: true })
        })
        const th: React.CSSProperties = { padding:'0.6rem 0.75rem', textAlign:'left', fontSize:'0.68rem', color:'var(--carolina-deep)', textTransform:'uppercase', letterSpacing:'0.05em', fontWeight:700, whiteSpace:'nowrap', cursor:'pointer', userSelect:'none' }
        const td: React.CSSProperties = { padding:'0.6rem 0.75rem', fontSize:'0.82rem', whiteSpace:'nowrap' }
        return (
          <div className="card" style={{ marginTop:'1.5rem', overflow:'hidden' }}>
            <div style={{ padding:'1.1rem 1.25rem 0.75rem' }}>
              <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.1rem' }}>Season Report</h2>
              <p style={{ color:'var(--text-muted)', fontSize:'0.78rem', marginTop:'0.2rem' }}>Weight room attendance next to health reports, since Aug 1. Tap a column to sort. A full workout is every set logged; a partial one counts its % done until an admin decides. Out means out of volleyball, so a missed workout while Out still counts as missed.</p>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table className="tbl-tight" style={{ width:'100%', borderCollapse:'collapse', minWidth:620 }}>
                <thead>
                  <tr style={{ background:'var(--carolina-light)', borderBottom:'1.5px solid var(--carolina-border)' }}>
                    {REPORT_COLS.map(c => (
                      <th key={c.key} title={c.title} style={th}
                        onClick={() => setReportSort(s => s.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: c.key !== 'team' })}>
                        {c.label}{reportSort.key === c.key ? (reportSort.desc ? ' ↓' : ' ↑') : ''}
                      </th>
                    ))}
                    <th style={{ ...th, cursor:'default' }}>Workouts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t, i) => (
                    <tr key={t.teamId} style={{ borderBottom:'1px solid var(--gray-border)', background: i % 2 === 0 ? 'var(--white)' : 'rgba(238,244,255,0.3)' }}>
                      <td style={{ ...td, fontWeight:700 }}><Link href={`/coach/teams/${t.teamId}`} style={{ color:'var(--black)', textDecoration:'none' }}>{t.teamName}</Link></td>
                      <td style={{ ...td, fontFamily:'var(--font-display)', fontWeight:800, color:pctColor(t.pct) }}>
                        {t.pct === null ? '—' : `${t.pct}%`}
                        {t.playersLow > 0 && <span style={{ fontFamily:'inherit', fontSize:'0.68rem', fontWeight:600, color:'var(--danger)', marginLeft:'0.4rem' }}>{t.playersLow} low</span>}
                      </td>
                      <td style={{ ...td, color:'var(--text-secondary)' }}>{t.finishedPct === null ? '—' : `${t.finishedPct}%`}</td>
                      <td style={{ ...td, color: t.health.injuries ? 'var(--danger)' : 'var(--text-muted)', fontWeight: t.health.injuries ? 700 : 400 }}>
                        {t.health.injuries}{t.health.playersInjured > 0 && <span style={{ fontSize:'0.7rem', fontWeight:500, color:'var(--text-muted)' }}> ({t.health.playersInjured} pl.)</span>}
                      </td>
                      <td style={{ ...td, color:'var(--text-secondary)' }}>{t.health.pains} / {t.health.soreness}</td>
                      <td style={{ ...td, color: t.health.outDays ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{t.health.outDays}</td>
                      <td style={{ ...td, color:'var(--text-muted)' }}>{t.workoutsSoFar} of {t.workoutsSeason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* ── SESSION LAUNCHER ── */}
      <div className="card" style={{ padding:'1.25rem', marginTop:'1.5rem', borderLeft:'4px solid var(--carolina)' }}>
        <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.1rem', marginBottom:'0.5rem' }}>Start Weight Room Session</h2>
        <p style={{ color:'var(--text-muted)', fontSize:'0.82rem', marginBottom:'0.875rem' }}>Pick every team lifting together (usually two). It opens one Team Mode screen for all of them, where players without a phone check in, do the body check, log sets and ask Coach for changes. Teams can also be added or removed on that screen.</p>
        {/* The tablet that stays in the gym: one link that always shows today's teams */}
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', flexWrap:'wrap', padding:'0.65rem 0.8rem', marginBottom:'0.875rem', borderRadius:8, background:'var(--carolina-light)', border:'1px solid var(--carolina-border)' }}>
          <div style={{ flex:'1 1 220px', fontSize:'0.8rem', color:'var(--text-secondary)' }}>
            <strong style={{ color:'var(--carolina-deep)' }}>Gym tablet:</strong> bookmark <a href="/team/today" target="_blank" rel="noopener noreferrer" style={{ color:'var(--carolina-dark)', fontWeight:700 }}>/team/today</a>. It always shows the teams scheduled today and switches to the next day&apos;s teams by itself.
          </div>
          <a href="/team/today" target="_blank" rel="noopener noreferrer" className="btn-black" style={{ padding:'0.45rem 0.85rem', fontSize:'0.8rem', textDecoration:'none', flexShrink:0 }}>Open →</a>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem', marginBottom:'0.875rem' }}>
          {[...(allTeams.length ? allTeams : teams.filter(t => !t.is_open_gym))]
            .sort((a, b) => Number(todayIds.has(b.id)) - Number(todayIds.has(a.id)))
            .map(t => (
            <button key={t.id} onClick={() => { setSessionUrl(''); setSessionTeams(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]) }}
              style={{ padding:'0.35rem 0.875rem', borderRadius:20, border:`2px solid ${sessionTeams.includes(t.id) ? t.color : 'var(--gray-border)'}`, background: sessionTeams.includes(t.id) ? `${t.color}18` : 'transparent', color: sessionTeams.includes(t.id) ? t.color : 'var(--text-muted)', fontSize:'0.82rem', fontWeight:600, cursor:'pointer' }}>
              {sessionTeams.includes(t.id) ? '✓ ' : ''}{t.name}{t.age_group && !t.name.startsWith(t.age_group.replace(/\D/g, '')) ? ` ${t.age_group}` : ''}
              {todayIds.has(t.id) && <span style={{ marginLeft:'0.35rem', fontSize:'0.62rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.04em', color:'var(--carolina-dark)' }}>· today</span>}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:'0.625rem', alignItems:'center', flexWrap:'wrap' }}>
          <button className="btn-volt" onClick={buildSessionUrl} disabled={!sessionTeams.length} style={{ padding:'0.5rem 1.25rem', fontSize:'0.85rem' }}>
            Get Link
          </button>
          {sessionUrl && (
            <>
              <input value={sessionUrl} readOnly style={{ flex:1, padding:'0.5rem 0.75rem', border:'1.5px solid var(--carolina-border)', borderRadius:7, fontSize:'0.78rem', background:'var(--carolina-light)', color:'var(--carolina-deep)', minWidth:200, fontFamily:'monospace' }} onClick={e => (e.target as HTMLInputElement).select()} />
              <button onClick={() => { navigator.clipboard.writeText(sessionUrl); }} className="btn-ghost" style={{ padding:'0.5rem 0.875rem', fontSize:'0.82rem', flexShrink:0 }}>Copy</button>
              <a href={sessionUrl} target="_blank" rel="noopener noreferrer" className="btn-black" style={{ padding:'0.5rem 0.875rem', fontSize:'0.82rem', textDecoration:'none', flexShrink:0 }}>Open →</a>
            </>
          )}
          {sessionUrl && (
            <div style={{ marginTop:'0.75rem', display:'flex', alignItems:'flex-start', gap:'1rem', flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginBottom:'0.35rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>QR Code for tablets</div>
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(sessionUrl)}`} alt="Session QR code" style={{ width:120, height:120, borderRadius:8, border:'2px solid var(--gray-border)' }} />
                <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:'0.3rem', maxWidth:120 }}>Scan to open on wall tablet</div>
              </div>
              <div style={{ flex:1, minWidth:200 }}>
                <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginBottom:'0.35rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>Bookmark this URL on each tablet</div>
                <div style={{ fontSize:'0.75rem', fontFamily:'monospace', background:'var(--carolina-light)', border:'1px solid var(--carolina-border)', borderRadius:6, padding:'0.5rem 0.75rem', wordBreak:'break-all', color:'var(--carolina-deep)' }}>{sessionUrl}</div>
                <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'0.3rem' }}>Players can check in directly from this page — no phone needed</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:'1rem' }}
          onClick={e => { if (e.target===e.currentTarget) closeModal() }}>
          <div className="card" style={{ width:'100%', maxWidth:440, padding:'1.75rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.25rem' }}>{modal==='add'?'New Team':`Edit — ${editTarget?.name}`}</h2>
              <button onClick={closeModal} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'1.3rem', lineHeight:1 }}>✕</button>
            </div>
            {msg && <div style={{ background:'var(--danger-light)', border:'1.5px solid #fecaca', borderRadius:8, padding:'0.625rem', marginBottom:'1rem', color:'var(--danger)', fontSize:'0.85rem' }}>{msg}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.875rem', marginBottom:'1.25rem' }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'block', fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.4rem', fontWeight:600 }}>Team Name *</label>
                <input className="input" placeholder="e.g. 14 Black" value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.4rem', fontWeight:600 }}>Age Group</label>
                <select className="input" value={form.age_group} onChange={e => setForm(p=>({...p,age_group:e.target.value}))}>
                  <option value="">Select…</option>
                  {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              {FEATURES.measurements && (
                <div>
                  <label style={{ display:'block', fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.4rem', fontWeight:600 }}>Team Level</label>
                  <select className="input" value={form.level} onChange={e => setForm(p=>({...p,level:e.target.value}))}>
                    <option value="">Not set</option>
                    {TEAM_LEVELS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                  </select>
                </div>
              )}
              {FEATURES.measurements && (
                <div>
                  <label style={{ display:'block', fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.4rem', fontWeight:600 }}>Team # in Age Group</label>
                  <select className="input" value={form.club_rank} onChange={e => setForm(p=>({...p,club_rank:e.target.value}))}>
                    <option value="">Not set</option>
                    {TEAM_RANKS.map(r => <option key={r} value={r}>{teamRankLabel(r)}</option>)}
                  </select>
                </div>
              )}
              <div style={FEATURES.measurements ? { gridColumn:'1/-1' } : undefined}>
                <label style={{ display:'block', fontSize:'0.75rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.5rem', fontWeight:600 }}>Team Color</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'0.5rem' }}>
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setForm(p=>({...p,color:c}))}
                      style={{ width:30, height:30, borderRadius:'50%', background:c, border: form.color===c ? '3px solid var(--black)' : '2px solid transparent', cursor:'pointer', transition:'all 0.12s', boxShadow: form.color===c ? '0 0 0 2px white inset' : 'none' }} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:'0.75rem' }}>
              <button className="btn-ghost" onClick={closeModal} style={{ flex:1, padding:'0.75rem' }}>Cancel</button>
              <button className="btn-volt" onClick={save} disabled={saving||!form.name} style={{ flex:2, padding:'0.75rem' }}>{saving?'Saving…':modal==='add'?'Create Team':'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:'1rem' }}
          onClick={e => { if (e.target===e.currentTarget) setDeleteConfirm(null) }}>
          <div className="card" style={{ width:'100%', maxWidth:400, padding:'1.75rem', textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'var(--danger-light)', border:'1.5px solid #fecaca', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </div>
            <h3 style={{ fontFamily:'var(--font-display)', fontSize:'1.25rem', fontWeight:800, marginBottom:'0.5rem' }}>Delete {deleteConfirm.name}?</h3>
            <p style={{ color:'var(--text-muted)', fontSize:'0.85rem', marginBottom:'1.5rem', lineHeight:1.6 }}>
              This removes the team and unassigns all players from it. Player data and workout history is preserved.
            </p>
            <div style={{ display:'flex', gap:'0.75rem' }}>
              <button className="btn-ghost" onClick={()=>setDeleteConfirm(null)} style={{ flex:1, padding:'0.75rem' }}>Cancel</button>
              <button onClick={deleteTeam} style={{ flex:1, padding:'0.75rem', background:'var(--danger)', color:'var(--white)', border:'none', borderRadius:8, fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.95rem', cursor:'pointer' }}>Delete Team</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
