// FILE: app/coach/requests/page.tsx   (new file)
//
// Coach → Requests
//   Waiting for you   players asking to change an exercise in a team workout.
//                     Approve with an easier/harder level of the same movement,
//                     the exercise's backup, or any exercise (rehab/prehab),
//                     for today only or until you end it. Or decline.
//   Self-guided swaps easier options self-guided players picked themselves,
//                     with their reason. Mark them seen.
//   Answered          the last 14 days.
// Data: app/api/coach/change-requests. Approved changes also show on the
// player's page under Exercise Skips & Replacements, where they can be ended.
'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Ex { id: string; name: string; level?: number | null }
interface RequestItem {
  id: string
  kind: 'request' | 'self_guided_swap'
  status: 'pending' | 'approved' | 'declined' | 'noted'
  open: boolean
  createdAt: string
  sessionDate: string
  player: { id: string; name: string; jersey: string | null }
  requestsLast30Days: number
  exercise: Ex | null
  originalExercise: Ex | null
  wants: string | null
  wantsLabel: string
  reasonLabel: string
  bodyPart: string | null
  painLevel: number | null
  note: string | null
  replacement: Ex | null
  applies: 'today' | 'ongoing' | null
  coachNote: string | null
  resolvedAt: string | null
  options: { family: string | null; level: number | null; levelCount: number; easier: Ex[]; harder: Ex[]; backup: Ex | null } | null
}
interface LibraryEx { id: string; name: string; category: string | null }

const FREQUENT = 3   // requests in 30 days that gets flagged

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const sectionTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem',
}

function PainTag({ level }: { level: number | null }) {
  if (level == null) return null
  const bad = level >= 7, mid = level >= 4
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: 5, color: '#fff', background: bad ? 'var(--danger)' : mid ? '#f59e0b' : 'var(--carolina)' }}>
      Pain {level}/10
    </span>
  )
}

// ── One pending request ─────────────────────────────────────────
// Lives at module scope (not inside the page) so typing in it doesn't remount it.
function PendingCard({ r, library, onDone }: { r: RequestItem; library: LibraryEx[]; onDone: () => void }) {
  const o = r.options
  const inPlaceOf = r.originalExercise && r.exercise && r.originalExercise.id !== r.exercise.id ? r.originalExercise : null

  const preset = r.wants === 'easier' ? o?.easier[0] ?? o?.backup
    : r.wants === 'harder' ? o?.harder[0] ?? (inPlaceOf ?? undefined)
    : o?.backup ?? o?.easier[0]
  const [choice, setChoice] = useState<Ex | null>(preset ?? null)
  const [applies, setApplies] = useState<'today' | 'ongoing'>('today')
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(!preset)
  const [saving, setSaving] = useState<'approve' | 'decline' | null>(null)
  const [error, setError] = useState('')

  async function send(action: 'approve' | 'decline') {
    setSaving(action); setError('')
    const res = await fetch('/api/coach/change-requests', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, action, replacementId: choice?.id, applies, coachNote: note }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(null)
    if (!res.ok) { setError(d.error ?? 'Not saved'); if (res.status === 409) onDone(); return }
    onDone()
  }

  const optionBtn = (ex: Ex, label: string, key: string) => {
    const active = choice?.id === ex.id
    return (
      <button key={key} onClick={() => { setChoice(ex); setShowSearch(false) }}
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.5rem 0.7rem', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
          border: `1.5px solid ${active ? 'var(--carolina)' : 'var(--gray-border)'}`, background: active ? 'var(--carolina-light)' : 'transparent' }}>
        <span style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${active ? 'var(--carolina)' : 'var(--gray-border)'}`, background: active ? 'var(--carolina)' : 'transparent', flexShrink: 0 }} />
        <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--carolina-dark)', minWidth: 92 }}>{label}</span>
        <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>{ex.name}</span>
      </button>
    )
  }

  const matches = search.trim()
    ? library.filter(e => e.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : []
  const choiceIsListed = !!choice && [...(o?.easier ?? []), ...(o?.harder ?? []), ...(o?.backup ? [o.backup] : []), ...(inPlaceOf ? [inPlaceOf] : [])].some(e => e.id === choice.id)
  const frequent = r.requestsLast30Days >= FREQUENT

  return (
    <div className="card" style={{ padding: '1.125rem', borderColor: 'rgba(245,158,11,0.45)' }}>
      {/* Who / when */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link href={`/coach/players/${r.player.id}`} style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', textDecoration: 'none' }}>
          {r.player.name}{r.player.jersey ? <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}> #{r.player.jersey}</span> : null}
        </Link>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{timeAgo(r.createdAt)}</span>
      </div>
      {frequent && (
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#b45309', marginTop: '0.2rem' }}>
          {r.requestsLast30Days} changes in the last 30 days
        </div>
      )}

      {/* What and why */}
      <div style={{ marginTop: '0.625rem', fontSize: '0.88rem' }}>
        Wants <strong>{r.wantsLabel.toLowerCase() || 'a change'}</strong> instead of <strong>{r.exercise?.name ?? 'an exercise'}</strong>
        {o?.level && o.levelCount > 1 ? <span style={{ color: 'var(--text-muted)' }}> (level {o.level} of {o.levelCount})</span> : null}
        {inPlaceOf && <span style={{ color: 'var(--text-muted)' }}> — already in place of {inPlaceOf.name}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{r.reasonLabel}</span>
        {r.bodyPart && <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: 5, background: 'var(--carolina-light)', color: 'var(--carolina-deep)', border: '1px solid var(--carolina-border)' }}>{r.bodyPart}</span>}
        <PainTag level={r.painLevel} />
      </div>
      {r.note && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '0.35rem' }}>“{r.note}”</div>}

      {/* Choices */}
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, margin: '0.875rem 0 0.4rem' }}>Have them do</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {o?.easier.map((e, i) => optionBtn(e, i === 0 ? '↓ Step down' : `↓ ${i + 1} levels`, `e-${e.id}`))}
        {o?.harder.map((e, i) => optionBtn(e, i === 0 ? '↑ Step up' : `↑ ${i + 1} levels`, `h-${e.id}`))}
        {o?.backup && optionBtn(o.backup, 'Backup', `b-${o.backup.id}`)}
        {inPlaceOf && optionBtn(inPlaceOf, 'Back to plan', `o-${inPlaceOf.id}`)}
        {choice && !choiceIsListed && optionBtn(choice, 'Other', `c-${choice.id}`)}
        {!showSearch ? (
          <button onClick={() => setShowSearch(true)}
            style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1.5px dashed var(--gray-border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
            Something else (rehab, prehab, any exercise)…
          </button>
        ) : (
          <div>
            <input className="input" autoFocus placeholder="Search the exercise library…" value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }} />
            {matches.length > 0 && (
              <div style={{ border: '1.5px solid var(--gray-border)', borderRadius: 8, marginTop: '0.25rem', maxHeight: 200, overflowY: 'auto', background: 'var(--white)' }}>
                {matches.map(e => (
                  <button key={e.id} onClick={() => { setChoice({ id: e.id, name: e.name }); setSearch(''); setShowSearch(false) }}
                    style={{ display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '0.45rem 0.75rem', border: 'none', background: 'transparent', fontSize: '0.84rem', cursor: 'pointer' }}>
                    <span>{e.name}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{e.category}</span>
                  </button>
                ))}
              </div>
            )}
            {!o?.easier.length && !o?.harder.length && !o?.backup && (
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                Tip: give this exercise easier/harder levels or a backup in the Exercise Library, and they’ll show here as one-tap choices.
              </p>
            )}
          </div>
        )}
      </div>

      {/* How long */}
      <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.75rem' }}>
        {(['today', 'ongoing'] as const).map(a => (
          <button key={a} onClick={() => setApplies(a)}
            style={{ flex: 1, padding: '0.45rem', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${applies === a ? 'var(--carolina-dark)' : 'var(--gray-border)'}`,
              background: applies === a ? 'var(--carolina-dark)' : 'transparent', color: applies === a ? '#fff' : 'var(--text-secondary)' }}>
            {a === 'today' ? 'Today only' : 'Until I end it'}
          </button>
        ))}
      </div>

      <input className="input" placeholder="Note to the player (optional)" value={note} maxLength={500} onChange={e => setNote(e.target.value)} style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }} />

      {error && <div style={{ background: 'var(--danger-light)', borderRadius: 8, padding: '0.45rem 0.7rem', marginTop: '0.5rem', color: 'var(--danger)', fontSize: '0.8rem' }}>{error}</div>}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button className="btn-ghost" onClick={() => send('decline')} disabled={!!saving} style={{ flex: 1, padding: '0.6rem' }}>
          {saving === 'decline' ? 'Saving…' : 'Keep as planned'}
        </button>
        <button className="btn-volt" onClick={() => send('approve')} disabled={!!saving || !choice} style={{ flex: 2, padding: '0.6rem' }}>
          {saving === 'approve' ? 'Saving…' : choice ? `Approve: ${choice.name}` : 'Pick an exercise'}
        </button>
      </div>
    </div>
  )
}

export default function CoachRequestsPage() {
  const [requests, setRequests] = useState<RequestItem[]>([])
  const [library, setLibrary] = useState<LibraryEx[]>([])
  const [loading, setLoading] = useState(true)
  const [notReady, setNotReady] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/coach/change-requests')
    const d = await res.json().catch(() => ({}))
    if (!res.ok) setNotReady(d.error ?? 'Could not load requests')
    else { setRequests(d.requests ?? []); setLibrary(d.exercises ?? []); setNotReady('') }
    setLoading(false)
    window.dispatchEvent(new Event('vx-requests-changed'))   // refresh the nav badge
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  async function markSeen(id?: string) {
    await fetch('/api/coach/change-requests', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { id, action: 'seen' } : { action: 'seen_all' }),
    }).catch(() => {})
    load()
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  const pending = requests.filter(r => r.kind === 'request' && r.status === 'pending')
  const swaps = requests.filter(r => r.kind === 'self_guided_swap' && r.open)
  const answered = requests.filter(r => !r.open)

  return (
    <div style={{ padding: '2rem', maxWidth: 820 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, marginBottom: '0.2rem' }}>Requests</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Players asking to change an exercise, and easier options self-guided players picked.</p>
      </div>

      {notReady && (
        <div className="card" style={{ padding: '1rem', borderColor: '#f59e0b', color: '#b45309', fontSize: '0.88rem', marginBottom: '1.5rem' }}>{notReady}</div>
      )}

      {/* Waiting for you */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ ...sectionTitle, color: pending.length ? '#b45309' : undefined }}>Waiting for you{pending.length ? ` (${pending.length})` : ''}</h2>
        {pending.length === 0 ? (
          <div className="card" style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>Nothing waiting.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {pending.map(r => <PendingCard key={r.id} r={r} library={library} onDone={load} />)}
          </div>
        )}
      </section>

      {/* Self-guided swaps */}
      {swaps.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={sectionTitle}>Self-guided swaps ({swaps.length})</h2>
            <button onClick={() => markSeen()} style={{ background: 'none', border: 'none', color: 'var(--carolina-dark)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>Mark all seen</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {swaps.map(r => (
              <div key={r.id} className="card" style={{ padding: '0.75rem 0.875rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem' }}>
                    <Link href={`/coach/players/${r.player.id}`} style={{ fontWeight: 800, color: 'var(--text-primary)', textDecoration: 'none' }}>{r.player.name}</Link>
                    {' '}swapped <strong>{r.originalExercise?.name ?? r.exercise?.name}</strong> → <strong>{r.replacement?.name ?? '?'}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.2rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>{r.reasonLabel}</span>
                    {r.bodyPart && <span>· {r.bodyPart}</span>}
                    <span>· {timeAgo(r.createdAt)}</span>
                    {r.requestsLast30Days >= FREQUENT && <span style={{ color: '#b45309', fontWeight: 700 }}>· {r.requestsLast30Days} in 30 days</span>}
                  </div>
                </div>
                <button className="btn-ghost" onClick={() => markSeen(r.id)} style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>Seen</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Answered */}
      <section>
        <h2 style={sectionTitle}>Answered · last 14 days</h2>
        {answered.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>None yet.</div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {answered.map((r, i) => (
              <div key={r.id} style={{ padding: '0.625rem 0.875rem', borderTop: i ? '1px solid var(--gray-border)' : 'none', fontSize: '0.82rem', display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
                <span style={{ minWidth: 72, fontSize: '0.72rem', color: 'var(--text-muted)' }}>{new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{r.player.name}</strong>{' '}
                  {r.status === 'declined'
                    ? <>· kept <strong>{r.exercise?.name}</strong></>
                    : <>· {r.originalExercise?.name ?? r.exercise?.name} → <strong>{r.replacement?.name ?? '?'}</strong></>}
                  <span style={{ color: 'var(--text-muted)' }}> · {r.reasonLabel}{r.bodyPart ? ` (${r.bodyPart})` : ''}</span>
                  {r.coachNote && <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}> · “{r.coachNote}”</span>}
                </span>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                  color: r.status === 'declined' ? 'var(--text-muted)' : r.status === 'noted' ? 'var(--carolina-dark)' : 'var(--success)' }}>
                  {r.status === 'declined' ? 'Kept' : r.status === 'noted' ? 'Self-guided' : r.applies === 'ongoing' ? 'Ongoing' : 'Today'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
