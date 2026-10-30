// FILE: app/team/[teamId]/page.tsx
//
// Team Mode: one shared screen (tablet, laptop or a coach's phone) where
// players without their own phone, or with a dead one, check in with their
// PIN and log every set.
//
// Address: /team/<teamId> for one team, or /team/<id>,<id> for teams lifting
// together (Coach → Teams → Start Weight Room Session, or "+ Add team" on
// this screen). Old /session/<date>?teams=... links come here too.
//
// How it works:
//   - Roster: players already working out are at the top. Tap your name to
//     log your next set (on this device you only need your PIN the first
//     time; after a page reload, or if you started on your phone, enter it
//     once more). Not-yet-started players are below: tap to check in.
//     With more than one team, the team chips at the top show one team's
//     players at a time (or All), and each card carries its team color.
//   - Body check (components/BodyCheck.tsx): right after a player's first
//     check-in of the day, the same "How are you feeling?" screen as on a
//     phone. Every sore or hurt area goes to the coach Health Board.
//   - Workout: warm-up card (open until the first set is logged), then the
//     current exercise with its demo clip, the suggested weight, the weight
//     picker (bands show the band colors, med balls start on 10 lb) and reps.
//     "Log Set" saves and goes straight back to the roster for the next
//     player. The last set stays here for the Finish button.
//   - Ask Coach (components/ChangeRequestSheet.tsx): "Need a different
//     exercise?" sends a change request with the reason, same as on a phone.
//     The card shows "Waiting for Coach" (with Withdraw), and the coach's
//     answer the next time she taps in. Coach answers in Coach → Requests.
//   - Wrong number? Tap a logged set ("Set 1: 95 lb × 8 ✎") to fix it.
//   - Exercises the coach took out (Coach → Players replacements with no
//     new exercise) aren't shown and don't count toward the sets.
//   - Combine Day (lib/combine.ts): the same test screens as on a phone
//     (components/CombineDay.tsx), one player at a time, with
//     "Next player" to hand the screen on.
//   - If the wifi drops while saving, the set isn't lost from the screen:
//     it says it wasn't saved, and tapping Log Set again retries.
//
// Colors: the accent on the black bars is --yellow (the brand's accent role,
// lib/brand.ts). --volt isn't defined in globals.css, so it isn't used here.
//
// Band exercises show the band colors with the coach's pick and save the
// band; med ball exercises start on the 10 lb ball
// (components/WeightPicker.tsx, lib/loads.ts).
'use client'
import { useState, useEffect, useCallback, use, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { entryLogFields, entryPayload, entryText, entryValue, loadLabel, plateText, previousEntry, type Equipment } from '@/lib/loads'
import WeightPicker from '@/components/WeightPicker'
import BrandMark from '@/components/BrandMark'
import ExerciseClip from '@/components/ExerciseClip'
import WarmupCard, { type Warmup } from '@/components/WarmupCard'
import CombineDay from '@/components/CombineDay'
import BodyCheck from '@/components/BodyCheck'
import ChangeRequestSheet, { type ChangeRequestInput } from '@/components/ChangeRequestSheet'
import { reasonLabel, wantsLabel } from '@/lib/exerciseLevels'
import { BRAND } from '@/lib/brand'
import { withPass } from '@/lib/playerPass'

interface RosterPlayer {
  id: string
  name: string
  jerseyNumber?: string
  teamId: string
  checkedIn: boolean
  completed: boolean
  sessionId: string | null
  stats: { pct: number; completedSets: number; totalSets: number; totalWeightLbs: number; durationMin: number | null } | null
}

interface TeamInfo { id: string; name: string; age_group?: string | null; color: string; workoutName: string | null; templateId: string | null }

interface TeamData {
  teams: TeamInfo[]
  roster: RosterPlayer[]
  checkedInCount: number
  completedCount: number
}

interface PickTeam { id: string; name: string; age_group?: string | null; color: string; is_open_gym?: boolean; coaches?: string[] }

type Screen = 'main' | 'pin' | 'bodycheck' | 'workout' | 'combine'

interface SetLog { set_number: number; weight_lbs?: number; band?: string | null; reps_completed?: number; velocity_ms?: number; completed: boolean }

interface ChangeRequest { id: string; status: string; wants: string | null; reason: string | null; coachNote: string | null; applies: string | null; createdAt: string }

interface WorkoutExercise {
  id: string
  name: string
  logs_weight: boolean
  logs_velocity?: boolean
  equipment?: Equipment | null
  default_reps?: string
  customReps?: string | null
  customNotes?: string | null
  coaching_notes?: string | null
  clip_url?: string | null
  clip_poster_url?: string | null
  skipped?: boolean
  isReplaced?: boolean
  originalExerciseName?: string
  originalExerciseId?: string
  blockExerciseId?: string
  level?: { family: string; level: number; count: number } | null
  canRequestChange?: boolean
  changeRequest?: ChangeRequest | null
  targetVelocityMin?: number | null
  targetVelocityMax?: number | null
  recommendedBand?: string | null
  lastBand?: string | null
  recommendation?: { weight: number; percent: number; label: string; phaseNote?: string; best1RM: number; sourceLabel?: string; detail?: string; adjustmentMessage?: string } | null
  setLogs: SetLog[]
}

interface WorkoutBlock {
  id: string
  block_label: string
  sets: number
  exercises: WorkoutExercise[]
}

interface WorkoutData {
  id: string
  name: string
  description?: string | null
  warmup?: Warmup | null
  warmup_notes?: string | null
  blocks: WorkoutBlock[]
}

interface CombineInfo { name: string; description: string | null; warmup: Warmup | null; warmup_notes: string | null }

/** A player's sign-in on this device: her pass and which workout check-in gave her */
interface DeviceSignIn { pass: string; templateId: string | null }

interface Flash { text: string; tone: 'good' | 'info' }

type WorkoutReply = Record<string, unknown> & { source?: string; template?: WorkoutData }

// ── Workout helpers (module scope) ──

/** Real index of each exercise the player does (coach-skipped ones left out) */
function liveIndexes(block: WorkoutBlock): number[] {
  return block.exercises.map((e, i) => (e.skipped ? -1 : i)).filter(i => i >= 0)
}

function countSets(workout: WorkoutData): { done: number; total: number } {
  let done = 0, total = 0
  for (const b of workout.blocks) {
    for (const i of liveIndexes(b)) {
      total += b.sets
      done += b.exercises[i].setLogs.filter(l => l.completed).length
    }
  }
  return { done, total }
}

/** First set not logged yet for one exercise (1-based), or 0 when all are done */
function firstOpenSet(ex: WorkoutExercise, sets: number): number {
  for (let s = 1; s <= sets; s++) if (!ex.setLogs[s - 1]?.completed) return s
  return 0
}

/** Next step in superset order (set 1 of each exercise, then set 2...) within one block */
function firstOpenInBlock(block: WorkoutBlock): { exIdx: number; setNum: number } | null {
  const live = liveIndexes(block)
  for (let s = 1; s <= block.sets; s++) {
    for (const i of live) if (!block.exercises[i].setLogs[s - 1]?.completed) return { exIdx: i, setNum: s }
  }
  return null
}

function firstOpenStep(workout: WorkoutData): { blockId: string; exIdx: number; setNum: number } | null {
  for (const b of workout.blocks) {
    const step = firstOpenInBlock(b)
    if (step) return { blockId: b.id, ...step }
  }
  return null
}

/** Reps box starts on the target's first number ("8-10" → 8, "8 each leg" → 8) */
function targetRepsNumber(ex: WorkoutExercise): string {
  const m = String(ex.customReps ?? ex.default_reps ?? '').match(/\d+/)
  return m ? m[0] : ''
}

/** Workout reply → the screen's copy, one log slot per set */
function toWorkout(template: WorkoutData): WorkoutData {
  return {
    ...template,
    blocks: template.blocks.map(block => ({
      ...block,
      exercises: block.exercises.map(ex => ({
        ...ex,
        setLogs: Array.from({ length: block.sets }, (_, i) => {
          const existing = (ex.setLogs ?? []).find(l => l.set_number === i + 1)
          return existing ?? { set_number: i + 1, completed: false }
        }),
      })),
    })),
  }
}

function firstName(name: string): string {
  return name.split(' ')[0]
}

/** "16 Pallavolo" plus the age group only when the name doesn't start with it */
function teamLabel(t: { name: string; age_group?: string | null }): string {
  return t.age_group && !t.name.startsWith(t.age_group.replace(/\D/g, '')) ? `${t.name} · ${t.age_group}` : t.name
}

export default function TeamSessionPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId: teamParam } = use(params)
  const router = useRouter()
  // One team id, or several separated by commas
  const teamIds = useMemo(
    () => [...new Set(decodeURIComponent(teamParam).split(',').map(s => s.trim()).filter(Boolean))],
    [teamParam],
  )
  const teamKey = teamIds.join(',')

  const [data, setData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [screen, setScreen] = useState<Screen>('main')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  const [selected, setSelected] = useState<RosterPlayer | null>(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [checkingIn, setCheckingIn] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)   // player id while her workout loads
  // After a first check-in: the workout to open once the body check is answered
  const [afterBodyCheck, setAfterBodyCheck] = useState<{ player: RosterPlayer; sessionId: string; signIn: DeviceSignIn } | null>(null)

  // Add / remove teams
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickTeams, setPickTeams] = useState<PickTeam[]>([])
  const [todayIds, setTodayIds] = useState<Set<string>>(new Set())
  const [pickIds, setPickIds] = useState<string[]>([])
  const [pickLoading, setPickLoading] = useState(false)

  // Workout state
  const [workout, setWorkout] = useState<WorkoutData | null>(null)
  const [combine, setCombine] = useState<CombineInfo | null>(null)
  const [sessionInfo, setSessionInfo] = useState<{ sessionId: string; templateId: string | null } | null>(null)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [activeExIdx, setActiveExIdx] = useState(0)
  const [activeSetNum, setActiveSetNum] = useState(1)   // 0 = every set of this exercise is done
  const [weightInput, setWeightInput] = useState('')
  const [repsInput, setRepsInput] = useState('')
  const [velocityInput, setVelocityInput] = useState('')
  const [savingSet, setSavingSet] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedNote, setSavedNote] = useState('')
  const [finishArmed, setFinishArmed] = useState(false)

  // Ask Coach
  const [requestFor, setRequestFor] = useState<WorkoutExercise | null>(null)
  const [requestSaving, setRequestSaving] = useState(false)
  const [requestError, setRequestError] = useState('')

  // Message on the roster after a player hands the screen back
  const [flash, setFlash] = useState<Flash | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Each player's sign-in pass (lib/playerAuth.ts), kept only in this
  // device's memory. A player can tap back in between sets without her PIN;
  // after a page reload she enters her PIN again.
  const signIns = useRef<Map<string, DeviceSignIn>>(new Map())

  const showFlash = useCallback((f: Flash) => {
    setFlash(f)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 4000)
  }, [])

  const loadRoster = useCallback(async () => {
    try {
      const res = await fetch(`/api/team?teamId=${encodeURIComponent(teamKey)}`, { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !Array.isArray(d.teams)) {
        setLoadError(d.error === 'Team not found' ? 'Team not found' : 'Could not load the roster.')
      } else {
        setData(d as TeamData)
        setLoadError('')
      }
    } catch {
      // Keep showing the last roster; only matters before the first load
      setLoadError('Could not load the roster. Check the wifi.')
    }
    setLoading(false)
  }, [teamKey])

  useEffect(() => { setTeamFilter('all'); loadRoster() }, [loadRoster])

  // Poll roster every 15s
  useEffect(() => {
    const interval = setInterval(loadRoster, 15000)
    return () => clearInterval(interval)
  }, [loadRoster])

  function backToRoster(f?: Flash) {
    setScreen('main')
    setSelected(null)
    setWorkout(null)
    setCombine(null)
    setSessionInfo(null)
    setAfterBodyCheck(null)
    setRequestFor(null)
    setSaveError(''); setSavedNote(''); setFinishArmed(false)
    if (f) showFlash(f)
    loadRoster()
  }

  // ── Teams lifting together ──

  async function openPicker() {
    setPickIds(teamIds)
    setPickerOpen(true)
    setPickLoading(true)
    try {
      const [teamsRes, todayRes] = await Promise.all([
        fetch('/api/coach/teams?all=1', { cache: 'no-store' }),
        fetch('/api/display-teams', { cache: 'no-store' }).catch(() => null),   // volleyball only
      ])
      const td = await teamsRes.json().catch(() => ({}))
      setPickTeams(((td.teams ?? []) as PickTeam[]).filter(t => !t.is_open_gym))
      if (todayRes?.ok) {
        const dd = await todayRes.json().catch(() => ({}))
        setTodayIds(new Set(dd.todayOnly ? ((dd.teams ?? []) as { id: string }[]).map(t => t.id) : []))
      }
    } catch { /* the list just stays empty; Cancel still works */ }
    setPickLoading(false)
  }

  function applyTeams(ids: string[]) {
    if (!ids.length) return
    setPickerOpen(false)
    if (ids.join(',') !== teamKey) router.replace(`/team/${ids.join(',')}`)
  }

  // ── Moving around the workout ──

  function goTo(w: WorkoutData, blockId: string, exIdx: number, setNum: number) {
    const block = w.blocks.find(b => b.id === blockId)
    const ex = block?.exercises[exIdx]
    setActiveBlockId(blockId)
    setActiveExIdx(exIdx)
    setActiveSetNum(setNum)
    setSaveError('')
    const log = ex && setNum > 0 ? ex.setLogs[setNum - 1] : null
    if (ex && log?.completed) {
      // Fixing a logged set: start from what was saved
      setWeightInput(entryValue(log, ex.equipment))
      setRepsInput(log.reps_completed != null ? String(log.reps_completed) : '')
      setVelocityInput(log.velocity_ms != null ? String(log.velocity_ms) : '')
    } else {
      setWeightInput('')
      setVelocityInput('')
      setRepsInput(ex ? targetRepsNumber(ex) : '')
    }
  }

  function goToNextOpen(w: WorkoutData) {
    const step = firstOpenStep(w)
    if (step) { goTo(w, step.blockId, step.exIdx, step.setNum); return }
    // Everything logged: the Finish screen shows
    const first = w.blocks[0]
    if (first) goTo(w, first.id, liveIndexes(first)[0] ?? 0, 0)
  }

  function selectBlock(block: WorkoutBlock) {
    if (!workout) return
    const step = firstOpenInBlock(block)
    if (step) goTo(workout, block.id, step.exIdx, step.setNum)
    else goTo(workout, block.id, liveIndexes(block)[0] ?? 0, 0)
    setSavedNote('')
  }

  function selectExercise(block: WorkoutBlock, exIdx: number) {
    if (!workout) return
    goTo(workout, block.id, exIdx, firstOpenSet(block.exercises[exIdx], block.sets))
    setSavedNote('')
  }

  // ── Check in / open a player's workout ──

  function askForPin(player: RosterPlayer, message = '') {
    setSelected(player)
    setPin('')
    setPinError(message)
    setScreen('pin')
  }

  function selectPlayer(player: RosterPlayer) {
    if (player.completed || opening) return
    const signIn = signIns.current.get(player.id)
    if (player.checkedIn && player.sessionId && signIn) {
      setSelected(player)
      openWorkout(player, player.sessionId, signIn)
    } else {
      askForPin(player)
    }
  }

  function handleKey(k: string) {
    setPinError('')
    if (k === '←') { setPin(p => p.slice(0, -1)); return }
    if (pin.length >= 4) return
    setPin(p => p + k)
  }

  async function handleCheckin() {
    if (!selected || pin.length !== 4 || checkingIn) return
    setCheckingIn(true)
    setPinError('')

    let res: Response
    let d: Record<string, unknown> = {}
    try {
      res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: selected.id, pin }),
      })
      d = await res.json().catch(() => ({}))
    } catch {
      setPinError('Could not reach the server. Check the wifi and try again.')
      setCheckingIn(false)
      return
    }
    setCheckingIn(false)

    if (!res.ok) {
      setPinError(typeof d.error === 'string' ? d.error : 'Incorrect PIN')
      setPin('')
      return
    }

    const sessionId = typeof d.sessionId === 'string' ? d.sessionId : null
    if (!sessionId) {
      // Week plan teams with nothing waiting today (lib/checkin.ts)
      backToRoster({ text: `No workout waiting for ${firstName(selected.name)} today.`, tone: 'info' })
      return
    }
    const signIn: DeviceSignIn = {
      pass: String(d.playerPass ?? ''),
      templateId: typeof d.templateId === 'string' ? d.templateId : null,
    }
    signIns.current.set(selected.id, signIn)
    loadRoster() // so she moves to the top
    const player = { ...selected, checkedIn: true, sessionId }

    if (d.isResumed !== true) {
      // First check-in today: body check first, same as on a phone
      setSelected(player)
      setAfterBodyCheck({ player, sessionId, signIn })
      setScreen('bodycheck')
      return
    }
    await openWorkout(player, sessionId, signIn)
  }

  async function fetchWorkout(sessionId: string, signIn: DeviceSignIn): Promise<{ status: number; d: WorkoutReply } | null> {
    const qs = new URLSearchParams({ sessionId })
    if (signIn.templateId) qs.set('templateId', signIn.templateId)
    try {
      const res = await fetch(`/api/workout?${qs}`, withPass(signIn.pass, { cache: 'no-store' }))
      const d = await res.json().catch(() => ({}))
      return { status: res.status, d: d as WorkoutReply }
    } catch {
      return null
    }
  }

  async function openWorkout(player: RosterPlayer, sessionId: string, signIn: DeviceSignIn) {
    setOpening(player.id)
    const reply = await fetchWorkout(sessionId, signIn)
    setOpening(null)

    if (!reply) {
      backToRoster({ text: 'Could not load the workout. Check the wifi and tap your name again.', tone: 'info' })
      return
    }
    if (reply.status === 401) {
      // Pass missing or expired: ask for her PIN again
      signIns.current.delete(player.id)
      askForPin(player, 'Please enter your PIN again')
      return
    }
    const d = reply.d

    setSelected(player)
    setAfterBodyCheck(null)
    setSaveError(''); setSavedNote(''); setFinishArmed(false)

    if (d.source === 'combine' && d.template) {
      // Combine Day: same test screens as on a phone, with this player's pass
      setWorkout(null)
      setCombine({
        name: d.template.name,
        description: d.template.description ?? null,
        warmup: d.template.warmup ?? null,
        warmup_notes: d.template.warmup_notes ?? null,
      })
      setSessionInfo({ sessionId, templateId: signIn.templateId ?? d.template.id ?? null })
      setScreen('combine')
      return
    }
    if (d.source !== 'template' || !d.template) {
      backToRoster({ text: 'No workout is scheduled today for this team.', tone: 'info' })
      return
    }

    const w = toWorkout(d.template)
    setCombine(null)
    setWorkout(w)
    setSessionInfo({ sessionId, templateId: signIn.templateId })
    goToNextOpen(w)
    setScreen('workout')
  }

  /** Reload the workout (after Ask Coach), staying on the same exercise */
  async function refreshWorkout() {
    if (!selected || !sessionInfo) return
    const signIn = signIns.current.get(selected.id)
    if (!signIn) return
    const reply = await fetchWorkout(sessionInfo.sessionId, signIn)
    if (!reply || reply.status !== 200 || reply.d.source !== 'template' || !reply.d.template) return
    const w = toWorkout(reply.d.template)
    setWorkout(w)
    const block = w.blocks.find(b => b.id === activeBlockId)
    const ex = block?.exercises[activeExIdx]
    if (block && ex && !ex.skipped) goTo(w, block.id, activeExIdx, firstOpenSet(ex, block.sets))
    else goToNextOpen(w)
  }

  // ── Body check ──

  async function sendBodyCheck(quickStatus: string, regions: Record<string, string>) {
    if (!afterBodyCheck) return
    await fetch('/api/player/bodycheck', withPass(afterBodyCheck.signIn.pass, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: afterBodyCheck.sessionId, playerId: afterBodyCheck.player.id, quickStatus, regions }),
    }))
  }

  // ── Ask Coach ──

  async function sendChangeRequest(input: ChangeRequestInput) {
    if (!selected || !sessionInfo || !requestFor?.blockExerciseId) return
    const signIn = signIns.current.get(selected.id)
    setRequestSaving(true); setRequestError('')
    try {
      const res = await fetch('/api/player/change-request', withPass(signIn?.pass, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionInfo.sessionId,
          slot: requestFor.blockExerciseId,
          exerciseId: requestFor.id,
          originalExerciseId: requestFor.originalExerciseId ?? requestFor.id,
          templateId: sessionInfo.templateId ?? null,
          ...input,
        }),
      }))
      const d = await res.json().catch(() => ({}))
      if (res.status === 401) {
        setRequestSaving(false); setRequestFor(null)
        signIns.current.delete(selected.id)
        askForPin(selected, 'Your sign-in ran out. Enter your PIN, then ask Coach again.')
        return
      }
      if (!res.ok) { setRequestError(d.error ?? 'Request not sent'); setRequestSaving(false); return }
      await refreshWorkout()
      setRequestFor(null)
      setSavedNote(`✓ Sent to Coach. Keep going with the rest of your workout; ${requestFor.name} switches when Coach approves.`)
    } catch { setRequestError('Request not sent. Check the wifi and try again.') }
    setRequestSaving(false)
  }

  async function withdrawChangeRequest(requestId: string) {
    if (!selected || !sessionInfo) return
    const signIn = signIns.current.get(selected.id)
    await fetch('/api/player/change-request', withPass(signIn?.pass, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionInfo.sessionId, id: requestId }),
    })).catch(() => {})
    setSavedNote('')
    await refreshWorkout()
  }

  // ── Saving ──

  async function saveSet() {
    if (!sessionInfo || !workout || !activeBlockId || !selected || savingSet) return
    const block = workout.blocks.find(b => b.id === activeBlockId)
    const ex = block?.exercises[activeExIdx]
    if (!block || !ex || activeSetNum < 1) return
    const isFix = !!ex.setLogs[activeSetNum - 1]?.completed
    const signIn = signIns.current.get(selected.id)

    setSavingSet(true)
    setSaveError('')
    setSavedNote('')
    const reps = repsInput ? parseInt(repsInput, 10) : null
    const velocity = velocityInput ? parseFloat(velocityInput) : null
    let res: Response
    try {
      res = await fetch('/api/sets', withPass(signIn?.pass, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionInfo.sessionId,
          exerciseId: ex.id,
          setNumber: activeSetNum,
          ...entryPayload(ex.equipment, weightInput),   // weightLbs, or band for band exercises
          repsCompleted: Number.isFinite(reps) ? reps : null,
          velocityMs: velocity != null && Number.isFinite(velocity) ? velocity : null,
          targetReps: ex.customReps ?? ex.default_reps ?? null,
          targetVelocityMin: ex.targetVelocityMin ?? null,
          targetVelocityMax: ex.targetVelocityMax ?? null,
          completed: true,
        }),
      }))
    } catch {
      setSavingSet(false)
      setSaveError('Not saved. Check the wifi and tap the button again.')
      return
    }
    setSavingSet(false)

    if (res.status === 401) {
      signIns.current.delete(selected.id)
      askForPin(selected, 'Your sign-in ran out. Enter your PIN, then log that set again.')
      return
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setSaveError(`Not saved: ${err.error ?? res.status}. Tap the button to try again.`)
      return
    }

    // Update this screen's copy of the workout
    const saved: SetLog = {
      set_number: activeSetNum,
      ...entryLogFields(ex.equipment, weightInput),
      ...(reps != null && Number.isFinite(reps) ? { reps_completed: reps } : {}),
      ...(velocity != null && Number.isFinite(velocity) ? { velocity_ms: velocity } : {}),
      completed: true,
    }
    const next: WorkoutData = {
      ...workout,
      blocks: workout.blocks.map(b => b.id !== block.id ? b : {
        ...b,
        exercises: b.exercises.map((e, i) => i !== activeExIdx ? e : {
          ...e,
          setLogs: e.setLogs.map(l => l.set_number === activeSetNum ? saved : l),
        }),
      }),
    }
    setWorkout(next)
    const { done, total } = countSets(next)

    if (isFix) {
      setSavedNote(`✓ Set ${activeSetNum} of ${ex.name} fixed`)
      goToNextOpen(next)
      loadRoster()
      return
    }
    if (done >= total) {
      // Last set: stay here for the Finish button
      goToNextOpen(next)
      loadRoster()
      return
    }
    // Back to the roster right away so the next player can go
    backToRoster({ text: `✓ Set logged for ${firstName(selected.name)} — next player, tap your name!`, tone: 'good' })
  }

  async function finishWorkout() {
    if (!sessionInfo || !selected) return
    const signIn = signIns.current.get(selected.id)
    try {
      await fetch('/api/checkin', withPass(signIn?.pass, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionInfo.sessionId }),
      }))
    } catch { /* the roster refresh shows whether it went through */ }
    backToRoster({ text: `🎉 Great work, ${firstName(selected.name)}! Workout finished.`, tone: 'good' })
  }

  const handleCombineExit = useCallback((why: 'finished' | 'signin') => {
    const player = selected
    if (!player) { backToRoster(); return }
    if (why === 'signin') {
      signIns.current.delete(player.id)
      setCombine(null)
      askForPin(player, 'Your sign-in ran out. Enter your PIN again.')
      return
    }
    backToRoster({ text: `🎉 ${firstName(player.name)} finished the combine!`, tone: 'good' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const keys = ['1','2','3','4','5','6','7','8','9','←','0','✓']

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--page-bg)' }}>
      <div style={{ color: 'var(--text-muted)' }}>Loading roster…</div>
    </div>
  )

  if (!data) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', justifyContent: 'center', background: 'var(--page-bg)', padding: '2rem', textAlign: 'center' }}>
      <div style={{ color: 'var(--danger)' }}>{loadError || 'Team not found'}</div>
      {loadError !== 'Team not found' && (
        <button className="btn-volt" onClick={() => { setLoading(true); loadRoster() }} style={{ padding: '0.75rem 1.5rem' }}>Try again</button>
      )}
    </div>
  )

  const { teams, roster, checkedInCount, completedCount } = data
  const multi = teams.length > 1
  const teamById = new Map(teams.map(t => [t.id, t]))
  const inProgress = checkedInCount - completedCount
  const shown = teamFilter === 'all' ? roster : roster.filter(p => p.teamId === teamFilter)
  const working = shown.filter(p => p.checkedIn && !p.completed).sort((a, b) => a.name.localeCompare(b.name))
  const finished = shown.filter(p => p.completed).sort((a, b) => a.name.localeCompare(b.name))
  const notStarted = shown.filter(p => !p.checkedIn).sort((a, b) => a.name.localeCompare(b.name))
  // Medals for the most pounds moved today, across every team here (the
  // cards stay in name order so players find themselves fast)
  const medalFor = new Map(
    roster.filter(p => p.checkedIn && (p.stats?.totalWeightLbs ?? 0) > 0)
      .sort((a, b) => (b.stats?.totalWeightLbs ?? 0) - (a.stats?.totalWeightLbs ?? 0))
      .slice(0, 3)
      .map((p, i) => [p.id, ['🥇', '🥈', '🥉'][i]] as const),
  )
  const workoutNames = [...new Set(teams.map(t => t.workoutName).filter((n): n is string => !!n))]

  // ── PIN SCREEN ──
  if (screen === 'pin' && selected) {
    const t = teamById.get(selected.teamId)
    return (
      <div style={{ minHeight: '100vh', background: 'var(--page-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', color: 'var(--yellow)' }}>
              {selected.jerseyNumber || selected.name.charAt(0).toUpperCase()}
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--black)', marginBottom: '0.25rem' }}>{selected.name}</h2>
            {multi && t && <div style={{ fontSize: '0.8rem', fontWeight: 700, color: t.color, marginBottom: '0.2rem' }}>{t.name}</div>}
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{selected.checkedIn ? 'Enter your PIN to keep going' : 'Enter your PIN to check in'}</p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
            {[0,1,2,3].map(i => (
              <div key={i} className={`pin-digit ${i < pin.length ? 'filled' : ''}`}>{i < pin.length ? '●' : ''}</div>
            ))}
          </div>

          {pinError && (
            <div style={{ background: 'var(--danger-light)', border: '1.5px solid #fecaca', borderRadius: 8, padding: '0.625rem', marginBottom: '1rem', color: 'var(--danger)', textAlign: 'center', fontSize: '0.9rem' }}>
              {pinError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {keys.map(k => (
              <button key={k} className="pin-key"
                onClick={() => k === '✓' ? handleCheckin() : handleKey(k)}
                style={{ width: '100%', background: k === '✓' ? 'var(--carolina)' : 'var(--white)', color: k === '✓' ? 'var(--white)' : 'var(--black)', opacity: k === '✓' && pin.length !== 4 ? 0.4 : 1 }}
                disabled={checkingIn || !!opening}>{k === '✓' && (checkingIn || opening) ? '…' : k}</button>
            ))}
          </div>

          <button onClick={() => backToRoster()} className="btn-ghost" style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem' }}>
            ← Back to roster
          </button>
        </div>
      </div>
    )
  }

  // ── BODY CHECK (first check-in today) ──
  if (screen === 'bodycheck' && afterBodyCheck) {
    const next = afterBodyCheck
    return (
      <BodyCheck
        key={next.sessionId}
        playerName={next.player.name}
        onSend={sendBodyCheck}
        onDone={() => openWorkout(next.player, next.sessionId, next.signIn)}
        onBack={() => backToRoster({ text: `${firstName(next.player.name)} is checked in. Tap your name when you're ready.`, tone: 'info' })} />
    )
  }

  // ── COMBINE DAY ──
  if (screen === 'combine' && combine && sessionInfo && selected) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--page-bg)' }}>
        <div style={{ background: 'var(--black)', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'sticky', top: 0, zIndex: 5 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: '#0a0f0d', flexShrink: 0 }}>
            {selected.jerseyNumber || selected.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--yellow)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.name}</div>
          <button className="btn-volt" onClick={() => backToRoster({ text: `✓ ${firstName(selected.name)}'s numbers are saved — next player, tap your name!`, tone: 'good' })}
            style={{ padding: '0.55rem 0.9rem', fontSize: '0.85rem', flexShrink: 0 }}>
            Next player →
          </button>
        </div>
        <CombineDay
          key={sessionInfo.sessionId}
          session={{ sessionId: sessionInfo.sessionId, playerName: selected.name, templateId: sessionInfo.templateId ?? undefined }}
          name={combine.name} description={combine.description}
          warmup={combine.warmup} warmupNotes={combine.warmup_notes}
          pass={signIns.current.get(selected.id)?.pass ?? null}
          onExit={handleCombineExit} />
      </div>
    )
  }

  // ── WORKOUT SCREEN ──
  if (screen === 'workout' && workout && sessionInfo && selected) {
    const block = workout.blocks.find(b => b.id === activeBlockId)
    const ex = block?.exercises[activeExIdx]
    const { done: doneSets, total: totalSets } = countSets(workout)
    const allDone = doneSets >= totalSets
    const isFix = !!(ex && activeSetNum > 0 && ex.setLogs[activeSetNum - 1]?.completed)
    const isLastSet = !isFix && doneSets === totalSets - 1
    const nextStep = firstOpenStep(workout)
    const req = ex?.changeRequest ?? null

    return (
      <div style={{ minHeight: '100vh', background: 'var(--black)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => backToRoster()} aria-label="Back to roster"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, padding: '0.25rem' }}>← Roster</button>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: '#0a0f0d', flexShrink: 0 }}>
            {selected.jerseyNumber || selected.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--yellow)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.name}</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{workout.name}</div>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--carolina-light)', fontSize: '0.9rem', flexShrink: 0 }}>{doneSets}/{totalSets} sets</div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '1rem', maxWidth: 560, width: '100%', margin: '0 auto' }}>
          {savedNote && (
            <div style={{ background: 'rgba(74,222,128,0.12)', border: '1.5px solid rgba(74,222,128,0.5)', color: '#4ade80', borderRadius: 8, padding: '0.5rem 0.875rem', marginBottom: '0.75rem', fontSize: '0.85rem', fontWeight: 700 }}>
              {savedNote}
            </div>
          )}

          {allDone ? (
            <div style={{ textAlign: 'center', paddingTop: '2rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: 'var(--yellow)', marginBottom: '0.5rem' }}>Workout Done!</h2>
              <p style={{ color: 'rgba(255,255,255,0.55)', marginBottom: '1.5rem' }}>Great work, {firstName(selected.name)}! Tap Finish so you show as done.</p>
              <button className="btn-volt" onClick={finishWorkout} style={{ padding: '0.95rem 2.5rem', fontSize: '1.1rem' }}>✓ Finish & Return to Roster</button>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', marginTop: '1rem' }}>Need to fix a number first? Pick the block below and tap the set.</p>
            </div>
          ) : (
            <WarmupCard warmup={workout.warmup} notes={workout.warmup_notes} startOpen={doneSets === 0} />
          )}

          {/* Block tabs */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {workout.blocks.map(b => {
              const live = liveIndexes(b)
              if (live.length === 0) return null
              const done = live.reduce((s, i) => s + b.exercises[i].setLogs.filter(l => l.completed).length, 0)
              const total = live.length * b.sets
              const isActive = b.id === activeBlockId
              return (
                <button key={b.id} onClick={() => selectBlock(b)}
                  style={{ padding: '0.5rem 1rem', borderRadius: 8, border: `1.5px solid ${isActive ? 'var(--yellow)' : done === total ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.15)'}`, background: isActive ? 'var(--yellow)' : 'transparent', color: isActive ? '#0a0f0d' : done === total ? '#4ade80' : 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>
                  {b.block_label} {done === total && '✓'}
                </button>
              )
            })}
          </div>

          {block && ex && (
            <div className="card" style={{ padding: '1.25rem' }}>
              {/* Exercise tabs (superset) */}
              {liveIndexes(block).length > 1 && (
                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.875rem', flexWrap: 'wrap' }}>
                  {liveIndexes(block).map(i => {
                    const e = block.exercises[i]
                    const eDone = firstOpenSet(e, block.sets) === 0
                    return (
                      <button key={e.id + i} onClick={() => selectExercise(block, i)}
                        style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: `1.5px solid ${i === activeExIdx ? 'var(--carolina)' : 'var(--gray-border)'}`, background: i === activeExIdx ? 'var(--carolina-light)' : 'var(--white)', color: i === activeExIdx ? 'var(--carolina-deep)' : 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                        {eDone ? '✓ ' : ''}{e.changeRequest?.status === 'pending' ? '⏳ ' : ''}{e.name}
                      </button>
                    )
                  })}
                </div>
              )}

              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '0.2rem' }}>
                Block {block.block_label}
                {activeSetNum > 0 ? ` · ${isFix ? 'Fixing set' : 'Set'} ${activeSetNum}/${block.sets}` : ` · all ${block.sets} sets done`}
                {(ex.customReps ?? ex.default_reps) ? ` · ${ex.customReps ?? ex.default_reps}` : ''}
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>{ex.name}</h2>

              {/* Coach's answer to a change request / a coach replacement */}
              {req?.status === 'approved' ? (
                <div style={{ padding: '0.5rem 0.75rem', marginBottom: '0.6rem', background: 'rgba(22,163,74,0.08)', border: '1.5px solid rgba(22,163,74,0.35)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--success)' }}>✓ Coach changed this{ex.isReplaced && ex.originalExerciseName ? ` (was ${ex.originalExerciseName})` : ''}</strong>
                  {req.applies === 'today' ? ' for today.' : '.'}
                  {req.coachNote && <div style={{ marginTop: '0.2rem', fontStyle: 'italic' }}>“{req.coachNote}”</div>}
                </div>
              ) : ex.isReplaced && ex.originalExerciseName ? (
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--success)', marginBottom: '0.5rem' }}>✓ Coach changed this for you (was {ex.originalExerciseName})</div>
              ) : null}
              {req?.status === 'declined' && (
                <div style={{ padding: '0.5rem 0.75rem', marginBottom: '0.6rem', background: 'var(--court-raised)', border: '1.5px solid var(--gray-border)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <strong>Coach kept this exercise.</strong>
                  {req.coachNote && <div style={{ marginTop: '0.2rem', fontStyle: 'italic' }}>“{req.coachNote}”</div>}
                </div>
              )}

              {ex.clip_url && (
                <div style={{ borderRadius: 8, overflow: 'hidden', background: 'var(--court-raised)', height: 180, marginBottom: '0.75rem' }}>
                  <ExerciseClip src={ex.clip_url} poster={ex.clip_poster_url} alt={`${ex.name} demo`} />
                </div>
              )}

              {(ex.customNotes || ex.coaching_notes) && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontStyle: 'italic' }}>
                  💬 {ex.customNotes || ex.coaching_notes}
                </div>
              )}

              {/* Ask Coach for a change (team workouts) */}
              {ex.canRequestChange && (req?.status === 'pending' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.55rem 0.75rem', marginBottom: '0.875rem', background: 'rgba(245,158,11,0.1)', border: '1.5px solid rgba(245,158,11,0.45)', borderRadius: 8 }}>
                  <span aria-hidden style={{ fontSize: '1rem' }}>⏳</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#b45309' }}>Waiting for Coach</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Asked for {wantsLabel(req.wants).toLowerCase()} · {reasonLabel(req.reason)}. Do the rest of your workout for now.</div>
                  </div>
                  <button onClick={() => withdrawChangeRequest(req.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>Withdraw</button>
                </div>
              ) : (
                <button type="button" onClick={() => { setRequestError(''); setRequestFor(ex) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.875rem', marginBottom: '0.875rem', background: 'var(--warning-light)', border: '2px solid var(--warning)', borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}>
                  <span aria-hidden style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', background: 'var(--warning)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 800 }}>⇄</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '0.95rem', fontWeight: 800, color: '#92400e' }}>Need a different exercise?</span>
                    <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#b45309', marginTop: '0.1rem' }}>Sore or it hurts? Ask Coach to change it</span>
                  </span>
                  <span aria-hidden style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--warning)' }}>→</span>
                </button>
              ))}

              {activeSetNum === 0 ? (
                <div style={{ background: 'rgba(22,163,74,0.08)', border: '1.5px solid var(--success)', borderRadius: 10, padding: '0.75rem 0.875rem', marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 700, color: 'var(--success)', marginBottom: nextStep ? '0.6rem' : 0 }}>✓ All {block.sets} sets done. Tap a set below to fix it.</div>
                  {nextStep && (
                    <button className="btn-volt" onClick={() => goToNextOpen(workout)} style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}>Go to my next set →</button>
                  )}
                </div>
              ) : (
                <>
                  {!isFix && ex.recommendation?.adjustmentMessage && (
                    <div style={{ background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 8, padding: '0.45rem 0.875rem', marginBottom: '0.5rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--carolina-dark)' }}>
                      {ex.recommendation.adjustmentMessage}
                    </div>
                  )}
                  {!isFix && ex.recommendation && ex.recommendation.weight > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--carolina-light)', border: '1.5px solid var(--carolina-border)', borderRadius: 8, padding: '0.5rem 0.875rem', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--carolina-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Suggested</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--carolina)', lineHeight: 1 }}>{loadLabel(ex.recommendation.weight, ex.equipment)}</div>
                        {plateText(ex.recommendation.weight, ex.equipment) && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{plateText(ex.recommendation.weight, ex.equipment)}</div>
                        )}
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ex.recommendation.detail || `${ex.recommendation.percent}% of your best`}</div>
                        {ex.recommendation.sourceLabel && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{ex.recommendation.sourceLabel}</div>
                        )}
                      </div>
                      <div style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4, fontStyle: 'italic' }}>{ex.recommendation.label}</div>
                    </div>
                  )}
                  {!isFix && ex.recommendation && !(ex.recommendation.weight > 0) && ex.logs_weight && !ex.recommendation.adjustmentMessage && (
                    <div style={{ background: 'var(--yellow-mid)', border: '1px solid var(--yellow-border)', borderRadius: 8, padding: '0.4rem 0.875rem', marginBottom: '0.75rem', fontSize: '0.75rem', color: 'var(--black)' }}>
                      {ex.recommendation.phaseNote || 'Choose your own weight for now.'}
                    </div>
                  )}

                  {ex.logs_weight && (
                    <div style={{ marginBottom: '0.875rem' }}>
                      <WeightPicker big
                        // fresh picker per player, exercise and set, so bands / med balls start from the last set
                        key={`${sessionInfo.sessionId}:${ex.id}:${activeSetNum}`}
                        previous={previousEntry(ex.setLogs, ex.equipment)}
                        recommendedBand={ex.recommendedBand ?? null}
                        lastBand={ex.lastBand ?? null}
                        equipment={ex.equipment}
                        value={weightInput}
                        onChange={setWeightInput}
                        suggested={!isFix && ex.recommendation && ex.recommendation.weight > 0 ? ex.recommendation.weight : null} />
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: ex.logs_velocity ? '1fr 1fr' : '1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', fontWeight: 600 }}>Reps</label>
                      <div style={{ display: 'flex', alignItems: 'stretch', gap: '0.4rem' }}>
                        <button type="button" aria-label="One less rep" onClick={() => setRepsInput(r => String(Math.max(0, (parseInt(r, 10) || 0) - 1)))}
                          style={{ width: 52, borderRadius: 8, border: '1.5px solid var(--gray-border)', background: 'var(--white)', fontSize: '1.4rem', fontWeight: 800, cursor: 'pointer' }}>−</button>
                        <input className="input" type="number" inputMode="numeric" placeholder={ex.customReps ?? ex.default_reps ?? '—'} value={repsInput} onChange={e => setRepsInput(e.target.value)}
                          style={{ flex: 1, minWidth: 0, fontSize: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700 }} />
                        <button type="button" aria-label="One more rep" onClick={() => setRepsInput(r => String((parseInt(r, 10) || 0) + 1))}
                          style={{ width: 52, borderRadius: 8, border: '1.5px solid var(--gray-border)', background: 'var(--white)', fontSize: '1.4rem', fontWeight: 800, cursor: 'pointer' }}>+</button>
                      </div>
                    </div>
                    {ex.logs_velocity && (
                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', fontWeight: 600 }}>Bar speed (m/s)</label>
                        <input className="input" type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={velocityInput} onChange={e => setVelocityInput(e.target.value)}
                          style={{ fontSize: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700 }} />
                      </div>
                    )}
                  </div>

                  {saveError && (
                    <div style={{ background: 'var(--danger-light)', border: '1.5px solid #fecaca', borderRadius: 8, padding: '0.55rem 0.8rem', marginBottom: '0.75rem', color: 'var(--danger)', fontSize: '0.88rem', fontWeight: 600 }}>
                      {saveError}
                    </div>
                  )}

                  <button className="btn-volt" onClick={saveSet} disabled={savingSet}
                    style={{ width: '100%', padding: '0.95rem', fontSize: '1.1rem', letterSpacing: '0.04em' }}>
                    {savingSet ? 'Saving…' : isFix ? `✓ Save Fix to Set ${activeSetNum}` : isLastSet ? '✓ Log Last Set' : '✓ Log Set & Back to Roster'}
                  </button>
                  {isFix && (
                    <button onClick={() => { goToNextOpen(workout); setSavedNote('') }} className="btn-ghost" style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                      Cancel fix
                    </button>
                  )}
                </>
              )}

              {ex.setLogs.some(l => l.completed) && (
                <div style={{ marginTop: '0.875rem' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.35rem' }}>Logged · tap to fix</div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {ex.setLogs.filter(l => l.completed).map(log => {
                      const editing = isFix && log.set_number === activeSetNum
                      return (
                        <button key={log.set_number} onClick={() => { goTo(workout, block.id, activeExIdx, log.set_number); setSavedNote('') }}
                          style={{ background: editing ? 'var(--carolina)' : 'var(--carolina-light)', border: '1px solid var(--carolina-border)', borderRadius: 6, padding: '0.4rem 0.7rem', fontSize: '0.8rem', color: editing ? 'var(--white)' : 'var(--carolina-deep)', fontWeight: 600, cursor: 'pointer' }}>
                          Set {log.set_number}: {entryText(log, ex.equipment) ? `${entryText(log, ex.equipment)} × ` : ''}{log.reps_completed ?? '—'}{log.velocity_ms ? ` @ ${Number(log.velocity_ms).toFixed(2)} m/s` : ''} ✎
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Leaving before every set is done */}
          {!allDone && doneSets > 0 && (
            <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
              {finishArmed ? (
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Finish with {totalSets - doneSets} {totalSets - doneSets === 1 ? 'set' : 'sets'} not logged?</div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <button className="btn-volt" onClick={finishWorkout} style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}>Yes, finish</button>
                    <button onClick={() => setFinishArmed(false)} style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem', background: 'transparent', border: '1.5px solid rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.75)', borderRadius: 8, cursor: 'pointer' }}>Keep going</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setFinishArmed(true)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.82rem' }}>
                  Out of time? Finish my workout
                </button>
              )}
            </div>
          )}
        </div>

        {requestFor && (
          <ChangeRequestSheet
            target={{ name: requestFor.name, level: requestFor.level }}
            saving={requestSaving}
            error={requestError}
            onSend={sendChangeRequest}
            onClose={() => setRequestFor(null)} />
        )}
      </div>
    )
  }

  // ── MAIN SCREEN ──
  const cardTeamStyle = (p: RosterPlayer): React.CSSProperties => {
    const t = teamById.get(p.teamId)
    return multi && t ? { borderLeft: `6px solid ${t.color}` } : {}
  }
  const teamTag = (p: RosterPlayer) => {
    const t = teamById.get(p.teamId)
    if (!multi || !t || teamFilter !== 'all') return null
    return <div style={{ fontSize: '0.66rem', fontWeight: 800, color: t.color, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.15rem' }}>{t.name}</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ background: 'var(--black)', padding: '0.875rem clamp(0.875rem, 4vw, 1.5rem)', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <BrandMark size={32} tone="accent" />
        {/* Title hidden on phones so the team names get the room */}
        <div className="hide-phone">
          <div style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.08em', color: 'var(--yellow)', lineHeight: 1 }}>{BRAND.appTitle.toUpperCase()}</div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Team Mode</div>
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--white)' }}>
            {multi ? teams.map(t => t.name).join(' + ') : teamLabel(teams[0])}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)' }}>
            {workoutNames.length === 0 ? 'No workout scheduled today' : workoutNames.length === 1 ? workoutNames[0] : `${workoutNames.length} workouts today`}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--yellow)' }}>{checkedInCount}/{roster.length}</div>
          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Checked in</div>
        </div>
      </div>

      {/* Progress strip */}
      <div style={{ height: 4, background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ height: '100%', background: 'var(--carolina)', width: `${roster.length > 0 ? checkedInCount / roster.length * 100 : 0}%`, transition: 'width 0.5s ease' }} />
      </div>

      {/* Teams here: show one team / all, add or remove a team */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.75rem clamp(0.875rem, 4vw, 1.5rem) 0' }}>
        {multi && (
          <>
            <button onClick={() => setTeamFilter('all')}
              style={{ padding: '0.45rem 0.9rem', borderRadius: 20, border: `2px solid ${teamFilter === 'all' ? 'var(--black)' : 'var(--gray-border)'}`, background: teamFilter === 'all' ? 'var(--black)' : 'var(--white)', color: teamFilter === 'all' ? 'var(--white)' : 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
              All teams
            </button>
            {teams.map(t => {
              const on = teamFilter === t.id
              const players = roster.filter(p => p.teamId === t.id)
              return (
                <button key={t.id} onClick={() => setTeamFilter(t.id)}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: 20, border: `2px solid ${t.color}`, background: on ? t.color : 'var(--white)', color: on ? '#fff' : 'var(--black)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {!on && <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color }} />}
                  {t.name}
                  <span style={{ fontWeight: 600, opacity: 0.75, fontSize: '0.75rem' }}>{players.filter(p => p.checkedIn).length}/{players.length}</span>
                </button>
              )
            })}
          </>
        )}
        <button onClick={openPicker}
          style={{ padding: '0.45rem 0.9rem', borderRadius: 20, border: '2px dashed var(--carolina)', background: 'transparent', color: 'var(--carolina-dark)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
          {multi ? '± Teams' : '+ Add a team lifting with you'}
        </button>
      </div>

      {/* Flash message */}
      {flash && (
        <div style={{ background: flash.tone === 'good' ? 'var(--yellow)' : 'var(--yellow-mid)', padding: '0.7rem 1.5rem', textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', color: '#0a0f0d', letterSpacing: '0.03em', marginTop: '0.75rem' }}>
          {flash.text}
        </div>
      )}
      {loadError && (
        <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '0.45rem 1.5rem', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, marginTop: '0.5rem' }}>
          {loadError} Showing the last roster.
        </div>
      )}

      {/* Working out now — tap to log the next set */}
      {working.length > 0 && (
        <div style={{ padding: '1rem clamp(0.875rem, 4vw, 1.5rem) 0.5rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '0.625rem' }}>
            Working out · tap your name to log your next set
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.6rem' }}>
            {working.map(player => (
              <button key={player.id} onClick={() => selectPlayer(player)} disabled={!!opening}
                style={{
                  background: 'var(--carolina-light)', border: '2px solid var(--carolina-border)', borderRadius: 12,
                  padding: '0.75rem 0.8rem', position: 'relative', textAlign: 'left', cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.05)', opacity: opening && opening !== player.id ? 0.6 : 1,
                  ...cardTeamStyle(player),
                }}>
                {medalFor.has(player.id) && (
                  <div style={{ position: 'absolute', top: 6, right: 8, fontSize: '0.9rem' }}>{medalFor.get(player.id)}</div>
                )}
                {teamTag(player)}
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--carolina-deep)', marginBottom: '0.2rem', paddingRight: '1.25rem', lineHeight: 1.25 }}>
                  {player.name}
                </div>
                {player.stats && (
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                    {player.stats.completedSets}/{player.stats.totalSets || '—'} sets
                    {player.stats.totalWeightLbs > 0 ? ` · ${player.stats.totalWeightLbs.toLocaleString()} lbs` : ''}
                  </div>
                )}
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--carolina-dark)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {opening === player.id ? 'Opening…' : 'Next set →'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Finished */}
      {finished.length > 0 && (
        <div style={{ padding: '0.5rem clamp(0.875rem, 4vw, 1.5rem) 0.25rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '0.5rem' }}>
            Done today
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {finished.map(player => (
              <div key={player.id} style={{ background: 'rgba(74,222,128,0.1)', border: '1.5px solid rgba(74,222,128,0.45)', borderRadius: 20, padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--success)' }}>
                ✓ {player.name}{medalFor.has(player.id) ? ` ${medalFor.get(player.id)}` : ''}
                {player.stats && player.stats.totalWeightLbs > 0 && (
                  <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}> · {player.stats.totalWeightLbs.toLocaleString()} lbs</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Not started — tap to check in */}
      <div style={{ flex: 1, padding: '0.75rem clamp(0.875rem, 4vw, 1.5rem) 1.5rem' }}>
        {notStarted.length > 0 && (
          <>
            {(working.length > 0 || finished.length > 0) && <div style={{ height: 1, background: 'var(--gray-border)', marginBottom: '0.75rem' }} />}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '0.625rem' }}>
              Not checked in · no phone? Tap your name
            </div>
            {/* With several teams and All showing: one group per team so names are easy to find */}
            {(multi && teamFilter === 'all' ? teams.map(t => ({ t, list: notStarted.filter(p => p.teamId === t.id) })) : [{ t: null, list: notStarted }])
              .filter(g => g.list.length > 0)
              .map(g => (
                <div key={g.t?.id ?? 'one'} style={{ marginBottom: '0.875rem' }}>
                  {g.t && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 800, color: 'var(--black)', marginBottom: '0.45rem' }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: g.t.color }} />{g.t.name}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.6rem', alignContent: 'start' }}>
                    {g.list.map(player => (
                      <button key={player.id} onClick={() => selectPlayer(player)} disabled={!!opening}
                        style={{ background: 'var(--white)', border: '2px solid var(--gray-border)', borderRadius: 12, padding: '0.875rem 0.75rem', cursor: 'pointer', textAlign: 'center', opacity: 0.8, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', ...cardTeamStyle(player) }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.5rem', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--yellow)' }}>
                          {player.jerseyNumber || player.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--black)', lineHeight: 1.3, marginBottom: '0.2rem' }}>{player.name}</div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tap to check in</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </>
        )}

        {shown.length > 0 && notStarted.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Everyone is checked in! 🎉
          </div>
        )}
        {shown.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No players on this team yet.
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '0.875rem 1.5rem', background: 'var(--white)', borderTop: '1.5px solid var(--gray-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {completedCount} done · {inProgress} working · {roster.length - checkedInCount} not started
        </div>
        <a href="/coach/dashboard" style={{ fontSize: '0.8rem', color: 'var(--carolina-dark)', textDecoration: 'none', fontWeight: 500, flexShrink: 0 }}>Coach view →</a>
      </div>

      {/* Team picker */}
      {pickerOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 60 }}
          onClick={() => setPickerOpen(false)}>
          <div className="card" role="dialog" aria-label="Teams in the weight room"
            style={{ width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', padding: '1.25rem', borderRadius: '16px 16px 0 0' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.15rem' }}>Teams in the weight room</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Tap every team lifting now. Players already signed in on this screen stay signed in.</p>
              </div>
              <button onClick={() => setPickerOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            {pickLoading ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading teams…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {[...pickTeams].sort((a, b) => Number(todayIds.has(b.id)) - Number(todayIds.has(a.id))).map(t => {
                  const on = pickIds.includes(t.id)
                  return (
                    <button key={t.id} onClick={() => setPickIds(prev => on ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.8rem', borderRadius: 10, border: `2px solid ${on ? t.color : 'var(--gray-border)'}`, background: on ? `${t.color}14` : 'var(--white)', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${t.color}`, background: on ? t.color : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 800, flexShrink: 0 }}>{on ? '✓' : ''}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 700, fontSize: '0.92rem', color: 'var(--black)' }}>{teamLabel(t)}</span>
                        {!!t.coaches?.length && <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t.coaches.join(' · ')}</span>}
                      </span>
                      {todayIds.has(t.id) && <span style={{ fontSize: '0.66rem', fontWeight: 800, color: 'var(--carolina-dark)', background: 'var(--carolina-light)', border: '1px solid var(--carolina-border)', borderRadius: 20, padding: '0.1rem 0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>Lifting today</span>}
                    </button>
                  )
                })}
                {pickTeams.length === 0 && <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Could not load the team list. Check the wifi.</div>}
              </div>
            )}

            <button className="btn-volt" disabled={pickIds.length === 0} onClick={() => applyTeams(pickIds)}
              style={{ width: '100%', padding: '0.875rem', fontSize: '1rem', marginTop: '1rem' }}>
              {pickIds.length === 0 ? 'Pick at least one team' : `Show ${pickIds.length} ${pickIds.length === 1 ? 'team' : 'teams'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
