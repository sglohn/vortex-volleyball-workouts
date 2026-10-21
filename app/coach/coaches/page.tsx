// FILE: app/coach/coaches/page.tsx   (new file)
//
// Coach → Coaches (admins only). Add and manage coach and admin accounts.
//   Coach  signs in from the main screen under their team; sees only their
//          teams' players, health board, logs and exercise change requests;
//          can approve requests and add injuries / health notes.
//   Admin  signs in with the Admin link at the bottom of the main screen;
//          sees and changes everything.
// API: app/api/coach/coaches/route.ts

'use client'
import { useEffect, useState } from 'react'
import { useCoach } from '@/components/CoachContext'

interface Team { id: string; name: string; color: string; age_group?: string | null }
interface Account { id: string; name: string; role: 'admin' | 'coach'; isActive: boolean; lastSigninAt: string | null; teamIds: string[] }
interface Form { name: string; role: 'admin' | 'coach'; pin: string; teamIds: string[] }

const BLANK: Form = { name: '', role: 'coach', pin: '', teamIds: [] }

const label: React.CSSProperties = { display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', fontWeight: 600 }

function lastSeen(iso: string | null): string {
  if (!iso) return 'Never signed in'
  return `Last signed in ${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

function RoleTag({ role }: { role: 'admin' | 'coach' }) {
  return (
    <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: 6,
      background: role === 'admin' ? 'var(--black)' : 'var(--carolina-light)', color: role === 'admin' ? '#fff' : 'var(--carolina-deep)',
      border: role === 'admin' ? 'none' : '1px solid var(--carolina-border)' }}>
      {role === 'admin' ? 'Admin' : 'Coach'}
    </span>
  )
}

function AccountCard({ a, teams, onEdit, onToggle, onRemove, busy }: {
  a: Account; teams: Team[]; busy: boolean
  onEdit: () => void; onToggle: () => void; onRemove: () => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const mine = teams.filter(t => a.teamIds.includes(t.id))
  return (
    <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', opacity: a.isActive ? 1 : 0.6 }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--black)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, flexShrink: 0 }}>
        {a.name.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>{a.name}</span>
          <RoleTag role={a.role} />
          {!a.isActive && <span style={{ fontSize: '0.7rem', color: 'var(--danger)', fontWeight: 700 }}>OFF</span>}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
          {a.role === 'admin' ? 'Sees the whole club' : mine.length ? mine.map(t => t.name).join(', ') : 'No team yet — can’t see any players'}
          {' · '}{lastSeen(a.lastSigninAt)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', flexShrink: 0 }}>
        {!confirmRemove ? (
          <>
            <button onClick={onEdit} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--carolina-dark)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, padding: 0 }}>Edit</button>
            <span style={{ color: 'var(--gray-border)' }}>|</span>
            <button onClick={onToggle} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--carolina-dark)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, padding: 0 }}>{a.isActive ? 'Turn off' : 'Turn on'}</button>
            <span style={{ color: 'var(--gray-border)' }}>|</span>
            <button onClick={() => setConfirmRemove(true)} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, padding: 0 }}>Remove</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Remove {a.name}?</span>
            <button onClick={() => { setConfirmRemove(false); onRemove() }} disabled={busy} style={{ background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 6, padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>Yes, remove</button>
            <button onClick={() => setConfirmRemove(false)} className="btn-ghost" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>Cancel</button>
          </>
        )}
      </div>
    </div>
  )
}

export default function CoachesPage() {
  const me = useCoach()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form, setForm] = useState<Form>(BLANK)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/coach/coaches', { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setNotice({ text: d.error ?? `Couldn’t load accounts (${res.status})`, error: true }); setLoading(false); return }
    setAccounts(d.coaches ?? []); setTeams(d.teams ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  function flash(text: string, error = false) {
    setNotice({ text, error })
    if (!error) setTimeout(() => setNotice(n => (n?.text === text ? null : n)), 3500)
  }

  function openAdd() { setForm({ ...BLANK, role: me?.setup ? 'admin' : 'coach' }); setEditing(null); setFormError(''); setModal('add') }
  function openEdit(a: Account) { setForm({ name: a.name, role: a.role, pin: '', teamIds: a.teamIds }); setEditing(a); setFormError(''); setModal('edit') }
  function closeModal() { setModal(null); setEditing(null); setFormError('') }

  async function save() {
    if (!form.name.trim()) { setFormError('Name is required'); return }
    if (modal === 'add' && !/^\d{4}$/.test(form.pin)) { setFormError('PIN must be exactly 4 digits'); return }
    if (modal === 'edit' && form.pin && !/^\d{4}$/.test(form.pin)) { setFormError('New PIN must be exactly 4 digits'); return }
    setSaving(true); setFormError('')
    const body = modal === 'add'
      ? form
      : { id: editing!.id, name: form.name, role: form.role, teamIds: form.teamIds, ...(form.pin ? { pin: form.pin } : {}) }
    const res = await fetch('/api/coach/coaches', {
      method: modal === 'add' ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setFormError(d.error ?? `Couldn’t save (${res.status})`); return }
    const firstAdmin = me?.setup && form.role === 'admin'
    closeModal()
    if (firstAdmin) {
      // The club coach PIN stops working once an admin account exists
      localStorage.removeItem('vx_coach')
      window.location.href = '/coach'
      return
    }
    flash(modal === 'add' ? `${form.name.trim()} added` : 'Saved')
    load()
  }

  async function patch(a: Account, changes: Record<string, unknown>, done: string) {
    setBusyId(a.id)
    const res = await fetch('/api/coach/coaches', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, ...changes }) })
    const d = await res.json().catch(() => ({}))
    setBusyId(null)
    if (!res.ok) { flash(d.error ?? 'Couldn’t save', true); return }
    flash(done); load()
  }

  async function remove(a: Account) {
    setBusyId(a.id)
    const res = await fetch('/api/coach/coaches', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) })
    const d = await res.json().catch(() => ({}))
    setBusyId(null)
    if (!res.ok) { flash(d.error ?? 'Couldn’t remove', true); return }
    flash(`${a.name} removed`); load()
  }

  function toggleTeam(id: string) {
    setForm(f => ({ ...f, teamIds: f.teamIds.includes(id) ? f.teamIds.filter(t => t !== id) : [...f.teamIds, id] }))
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>

  const admins = accounts.filter(a => a.role === 'admin')
  const coaches = accounts.filter(a => a.role === 'coach')

  return (
    <div style={{ padding: '2rem', maxWidth: 820 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800 }}>Coaches</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {admins.length} admin{admins.length === 1 ? '' : 's'} · {coaches.length} coach{coaches.length === 1 ? '' : 'es'}
          </p>
        </div>
        <button className="btn-volt" onClick={openAdd} style={{ padding: '0.625rem 1.25rem' }}>+ Add Account</button>
      </div>

      {me?.setup && (
        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', borderLeft: '4px solid var(--warning)' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>First-time setup</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            You’re signed in with the club coach PIN. Add your own admin account first. Once an admin account exists, the club PIN stops
            working and you’ll sign in again with your name and PIN (Admin link at the bottom of the main screen).
          </div>
        </div>
      )}

      {notice && (
        <div style={{ background: notice.error ? 'var(--danger-light)' : 'var(--carolina-light)', border: `1.5px solid ${notice.error ? '#fecaca' : 'var(--carolina-border)'}`, borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', color: notice.error ? 'var(--danger)' : 'var(--carolina-deep)', fontSize: '0.9rem' }}>{notice.text}</div>
      )}

      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0.5rem 0 0.625rem' }}>Admins</h2>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>See and change everything. Sign in with the small Admin link at the bottom of the main screen.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.75rem' }}>
        {admins.length === 0 && <div className="card" style={{ padding: '1.25rem', color: 'var(--text-muted)', textAlign: 'center' }}>No admin accounts yet.</div>}
        {admins.map(a => (
          <AccountCard key={a.id} a={a} teams={teams} busy={busyId === a.id}
            onEdit={() => openEdit(a)}
            onToggle={() => patch(a, { isActive: !a.isActive }, a.isActive ? `${a.name} turned off` : `${a.name} turned on`)}
            onRemove={() => remove(a)} />
        ))}
      </div>

      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0.5rem 0 0.625rem' }}>Team coaches</h2>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        See only their own teams: players, health board, workout logs and exercise change requests. Can approve requests and add injuries or health notes.
        They can’t change workouts, schedules, rosters or the exercise library. They sign in from the main screen, listed under their team.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {coaches.length === 0 && <div className="card" style={{ padding: '1.25rem', color: 'var(--text-muted)', textAlign: 'center' }}>No team coaches yet.</div>}
        {coaches.map(a => (
          <AccountCard key={a.id} a={a} teams={teams} busy={busyId === a.id}
            onEdit={() => openEdit(a)}
            onToggle={() => patch(a, { isActive: !a.isActive }, a.isActive ? `${a.name} turned off` : `${a.name} turned on`)}
            onRemove={() => remove(a)} />
        ))}
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="card" style={{ width: '100%', maxWidth: 460, padding: '1.75rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem' }}>{modal === 'add' ? 'New Account' : `Edit — ${editing?.name}`}</h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>✕</button>
            </div>
            {formError && <div style={{ background: 'var(--danger-light)', border: '1.5px solid #fecaca', borderRadius: 8, padding: '0.625rem', marginBottom: '1rem', color: 'var(--danger)', fontSize: '0.85rem' }}>{formError}</div>}

            <div style={{ marginBottom: '1rem' }}>
              <label style={label}>Name shown on sign-in *</label>
              <input className="input" placeholder="e.g. Coach Mac" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoComplete="off" />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={label}>Access</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {(['coach', 'admin'] as const).map(r => (
                  <button key={r} type="button" onClick={() => setForm(f => ({ ...f, role: r }))}
                    style={{ flex: 1, padding: '0.6rem', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
                      border: `2px solid ${form.role === r ? 'var(--carolina)' : 'var(--gray-border)'}`,
                      background: form.role === r ? 'var(--carolina-light)' : 'var(--white)', color: form.role === r ? 'var(--carolina-deep)' : 'var(--text-secondary)' }}>
                    {r === 'admin' ? 'Admin' : 'Team coach'}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                {form.role === 'admin' ? 'Sees and changes everything.' : 'Sees only the teams picked below.'}
              </div>
            </div>

            {form.role === 'coach' && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={label}>Teams</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {teams.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No active teams.</span>}
                  {teams.map(t => {
                    const on = form.teamIds.includes(t.id)
                    return (
                      <button key={t.id} type="button" onClick={() => toggleTeam(t.id)}
                        style={{ padding: '0.35rem 0.875rem', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                          border: `2px solid ${on ? t.color : 'var(--gray-border)'}`, background: on ? `${t.color}18` : 'transparent', color: on ? t.color : 'var(--text-muted)' }}>
                        {on ? '✓ ' : ''}{t.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={label}>{modal === 'add' ? '4-digit PIN *' : 'New PIN (leave blank to keep)'}</label>
              <input className="input" inputMode="numeric" pattern="\d*" maxLength={4} placeholder="••••" value={form.pin}
                onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))} autoComplete="off" />
              {modal === 'edit' && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>A new PIN signs this person out on every device.</div>}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-ghost" onClick={closeModal} style={{ flex: 1, padding: '0.75rem' }}>Cancel</button>
              <button className="btn-volt" onClick={save} disabled={saving || !form.name.trim()} style={{ flex: 2, padding: '0.75rem' }}>
                {saving ? 'Saving…' : modal === 'add' ? 'Add Account' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
