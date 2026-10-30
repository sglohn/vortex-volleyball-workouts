// FILE: lib/healthPatterns.ts
//
// Health Board → Watch tab. Looks through body checks (the body map every
// player fills in at sign-in), health reports and workout ratings for
// patterns nobody said out loud, at three levels:
//
//   Player   the same area sore again and again, an area that keeps coming
//            back after it was cleared, soreness at an old injury, more
//            soreness than usual for that player, workouts rated Hard
//            again and again
//   Team     more of the team sore than usual for that team, the same area
//            sore across several players (with the workouts and exercises
//            the team did just before), several injuries at once, a run of
//            Hard ratings
//   Club     the same team checks across the whole club (admins only), plus
//            a weekly picture
//
// Pure functions (no database), so the rules are easy to read and test.
// Data loading: lib/healthWatch.ts. Screen: app/coach/health (Watch tab).
//
// "Seen": a coach can mark a flag seen (health_watch_seen). It moves to the
// Seen list until it gets worse (its `evidence` number goes up) or 14 days
// pass.

// ─── Body areas ──────────────────────────────────────────────────────────────

/** Body check zone ids (components/BodyCheck.tsx) + 'general' (sore/injured with no area marked) */
const SPECIAL_LABELS: Record<string, string> = {
  head: 'Head', neck: 'Neck', chest: 'Chest', core: 'Core',
  upper_back: 'Upper Back', lower_back: 'Lower Back', general: 'General (no area marked)',
}

/** Joints and the low back: pain here that keeps coming back is flagged sooner */
const SENSITIVE = new Set(['knee', 'ankle', 'shoulder', 'hip', 'elbow', 'wrist', 'neck', 'head', 'lower_back'])

const title = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

/** "r_knee" → { area: 'knee', label: 'Right Knee', areaLabel: 'Knee' } */
export function zoneInfo(zone: string): { area: string; label: string; areaLabel: string } {
  if (SPECIAL_LABELS[zone]) return { area: zone, label: SPECIAL_LABELS[zone], areaLabel: SPECIAL_LABELS[zone] }
  const m = zone.match(/^([rl])_(.+)$/)
  if (m) return { area: m[2], label: `${m[1] === 'r' ? 'Right' : 'Left'} ${title(m[2])}`, areaLabel: title(m[2]) }
  return { area: zone, label: title(zone), areaLabel: title(zone) }
}

/**
 * Health report body_part → zone ids. Handles body-check zones ("r_knee"),
 * coach-logged parts ("Left Knee", "Bilateral Ankle", "Lower Back") and the
 * general report.
 */
export function bodyPartZones(bodyPart: string): string[] {
  const bp = bodyPart.trim().toLowerCase()
  if (/^[rl]_/.test(bp) || SPECIAL_LABELS[bp]) return [bp]
  if (bp.startsWith('general')) return ['general']
  const m = bp.match(/^(left|right|bilateral|both)\s+(.+)$/)
  const name = (m ? m[2] : bp).replace(/\s+/g, '_')
  if (SPECIAL_LABELS[name]) return [name]
  if (m?.[1] === 'left') return [`l_${name}`]
  if (m?.[1] === 'right') return [`r_${name}`]
  return [`l_${name}`, `r_${name}`]
}

/** Exercise library categories (app/coach/exercises) that load each area — used to point at likely exercises */
export const AREA_CATEGORIES: Record<string, string[]> = {
  quad: ['Lower - Quad'], knee: ['Lower - Quad', 'Power'],
  hamstring: ['Lower - Hamstring', 'Lower - Hip/Glute'], glute: ['Lower - Hip/Glute', 'Lower - Hamstring'],
  hip: ['Lower - Hip/Glute', 'Lower - Hamstring'], lower_back: ['Lower - Hamstring', 'Lower - Hip/Glute', 'Core'],
  calf: ['Power'], shin: ['Power'], ankle: ['Power'],
  chest: ['Upper - Push'], shoulder: ['Upper - Push', 'Upper - Pull'], elbow: ['Upper - Push', 'Upper - Pull'],
  wrist: ['Upper - Push'], upper_back: ['Upper - Pull'], neck: ['Upper - Pull'], core: ['Core'],
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface CheckRow { player_id: string; session_id: string | null; regions: Record<string, string> | null; checked_at: string }
export interface SessionRow { id: string; player_id: string; team_id: string | null; template_id: string | null; rating: string | null; checked_in_at: string }
export interface ReportRow {
  id: string; player_id: string; body_part: string; report_type: string; status: string
  availability: string | null; reported_at: string; resolved_at: string | null
}
export interface PlayerRow { id: string; name: string; teamIds: string[] }
export interface TeamRow { id: string; name: string }
export interface TemplateExercise { template_id: string; name: string; category: string | null }
export interface SeenRow { key: string; evidence: number; seen_at: string; coach_name: string | null; note: string | null }

export interface PatternInput {
  now: Date
  checks: CheckRow[]
  sessions: SessionRow[]
  reports: ReportRow[]
  players: PlayerRow[]
  teams: TeamRow[]
  templates: Record<string, string>
  templateExercises: TemplateExercise[]
  seen: SeenRow[]
  /** Club-wide section (admins only) */
  includeClub: boolean
}

// ─── Output ──────────────────────────────────────────────────────────────────

export type FlagLevel = 'watch' | 'concern'
export type FlagScope = 'player' | 'team' | 'club'

export interface WatchFlag {
  /** Stable id for "Seen", e.g. player:<id>:recurring:r_knee */
  key: string
  scope: FlagScope
  kind: string
  level: FlagLevel
  /** Grows when the pattern gets worse; a Seen flag comes back when it passes the seen value */
  evidence: number
  title: string
  detail: string
  suggestions: string[]
  playerId?: string
  playerName?: string
  teamId?: string
  teamName?: string
  /** Body part label for "Start tracking" (player flags) */
  bodyPart?: string
  /** The open health report for this area, if there is one */
  reportId?: string
  /** Dates (ISO) behind the flag, newest first */
  dates?: string[]
  /** Team/club area flags: workouts done just before the soreness, and exercises in them that load that area */
  workouts?: { name: string; count: number; exercises: string[] }[]
  seen?: { at: string; by: string | null; note: string | null }
}

export interface WeekPoint { weekStart: string; checks: number; soreRate: number | null; newInjuries: number; hardRate: number | null }

export interface AreaCount { area: string; label: string; players: number; prevPlayers: number }

export interface WatchResult {
  flags: WatchFlag[]
  /** Not yet seen */
  openCount: number
  club: null | {
    weeks: WeekPoint[]
    topAreas: AreaCount[]
    soreRate7: number | null
    soreRateBase: number | null
    playersChecked14: number
  }
  generatedAt: string
}

// ─── Settings (the rules, in one place) ──────────────────────────────────────

export const RULES = {
  /** Look-back for "keeps coming up" */
  recurDays: 21,
  /** Flags in recurDays to call it recurring: muscles vs joints/low back/general */
  recurMuscle: 3,
  recurSensitive: 2,
  /** Cleared reports this recent count as "came back" */
  cameBackDays: 60,
  /** Old injuries this recent count as "old injury area" */
  oldInjuryDays: 365,
  /** "Recent" window vs the baseline before it */
  recentDays: 7,
  baselineDays: 28,
  /** Team: share of body checks with soreness this week to flag */
  teamRateWatch: 0.4,
  teamRateConcern: 0.6,
  teamMinChecks: 6,
  /** Team: same area across players (14 days) */
  areaDays: 14,
  teamAreaMinPlayers: 3,
  teamAreaShare: 0.25,
  clubAreaMinPlayers: 5,
  clubAreaShare: 0.15,
  seenDays: 14,
}

const DAY = 24 * 60 * 60 * 1000

// ─── Helpers ─────────────────────────────────────────────────────────────────

function flagged(regions: Record<string, string> | null | undefined): [string, string][] {
  return Object.entries(regions ?? {}).filter(([, s]) => s === 'sore' || s === 'injured')
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'America/New_York' })
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function rate(checks: CheckRow[]): number | null {
  if (!checks.length) return null
  return checks.filter(c => flagged(c.regions).length > 0).length / checks.length
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function findPatterns(input: PatternInput): WatchResult {
  const now = input.now.getTime()
  const since = (days: number) => now - days * DAY
  const t = (iso: string) => new Date(iso).getTime()

  const sessionById = new Map(input.sessions.map(s => [s.id, s]))
  const playerById = new Map(input.players.map(p => [p.id, p]))
  const teamName = new Map(input.teams.map(tm => [tm.id, tm.name]))
  const seenByKey = new Map<string, SeenRow>()
  for (const s of input.seen) {
    const prev = seenByKey.get(s.key)
    if (!prev || prev.seen_at < s.seen_at) seenByKey.set(s.key, s)
  }

  // Which team a body check belongs to: the session's team, else the player's first team
  const checkTeam = (c: CheckRow): string | null => {
    const s = c.session_id ? sessionById.get(c.session_id) : undefined
    return s?.team_id ?? playerById.get(c.player_id)?.teamIds[0] ?? null
  }

  const checksByPlayer = new Map<string, CheckRow[]>()
  for (const c of input.checks) {
    if (!playerById.has(c.player_id)) continue
    const list = checksByPlayer.get(c.player_id) ?? []
    list.push(c)
    checksByPlayer.set(c.player_id, list)
  }
  for (const list of checksByPlayer.values()) list.sort((a, b) => b.checked_at.localeCompare(a.checked_at))

  const reportsByPlayer = new Map<string, ReportRow[]>()
  for (const r of input.reports) {
    const list = reportsByPlayer.get(r.player_id) ?? []
    list.push(r)
    reportsByPlayer.set(r.player_id, list)
  }

  const flags: WatchFlag[] = []

  // ── PLAYER ────────────────────────────────────────────────────────────────
  for (const player of input.players) {
    const checks = checksByPlayer.get(player.id) ?? []
    const reports = reportsByPlayer.get(player.id) ?? []
    const openReports = reports.filter(r => r.status === 'active' || r.status === 'monitoring')
    const base = { scope: 'player' as const, playerId: player.id, playerName: player.name, teamId: player.teamIds[0], teamName: player.teamIds[0] ? teamName.get(player.teamIds[0]) : undefined }

    const openFor = (zone: string) => openReports.find(r => bodyPartZones(r.body_part).includes(zone))
    const recent = checks.filter(c => t(c.checked_at) >= since(RULES.recurDays))

    // Per zone: when it was flagged (newest first), and how many were "injured"
    const zoneHits = new Map<string, { dates: string[]; injured: number }>()
    for (const c of recent) {
      for (const [zone, status] of flagged(c.regions)) {
        const z = zoneHits.get(zone) ?? { dates: [], injured: 0 }
        z.dates.push(c.checked_at)
        if (status === 'injured') z.injured++
        zoneHits.set(zone, z)
      }
    }
    const coveredZones = new Set<string>()

    for (const [zone, hits] of zoneHits) {
      const info = zoneInfo(zone)
      const open = openFor(zone)
      const sensitive = SENSITIVE.has(info.area) || zone === 'general'
      const need = sensitive ? RULES.recurSensitive : RULES.recurMuscle
      const count = hits.dates.length

      // 1. Came back after being cleared
      const cleared = reports
        .filter(r => r.status === 'resolved' && r.resolved_at && t(r.resolved_at) >= since(RULES.cameBackDays) && bodyPartZones(r.body_part).includes(zone))
        .sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''))[0]
      const afterClear = cleared ? hits.dates.filter(d => t(d) > t(cleared.resolved_at!)) : []
      if (cleared && afterClear.length) {
        coveredZones.add(zone)
        flags.push({
          ...base, key: `player:${player.id}:came_back:${zone}`, kind: 'came_back',
          level: 'concern', evidence: afterClear.length,
          title: `${info.label} is back`,
          detail: `Cleared ${shortDate(cleared.resolved_at!)}, flagged again ${plural(afterClear.length, 'time')} since (last ${shortDate(afterClear[0])}).`,
          suggestions: [
            'It may have been cleared too soon — check in with the player.',
            open ? 'Consider moving the open report to Modified.' : 'Consider reopening it as Modified until it settles.',
          ],
          bodyPart: info.label, reportId: open?.id, dates: afterClear,
        })
        continue
      }

      // Already being managed as Modified / Out / Return to Play: expected, don't nag
      if (open && open.availability && open.availability !== 'full') continue

      // 2. Old injury area
      const oldInjury = reports.find(r =>
        r.status === 'resolved' && r.resolved_at && t(r.resolved_at) >= since(RULES.oldInjuryDays) &&
        (r.report_type === 'major_injury' || (r.availability && r.availability !== 'full')) &&
        bodyPartZones(r.body_part).includes(zone))
      if (oldInjury) {
        coveredZones.add(zone)
        flags.push({
          ...base, key: `player:${player.id}:old_injury:${zone}`, kind: 'old_injury',
          level: count >= 2 || hits.injured ? 'concern' : 'watch', evidence: count,
          title: `Sore at an old injury: ${info.label}`,
          detail: `Injured here before (cleared ${shortDate(oldInjury.resolved_at!)}). Flagged ${plural(count, 'time')} in the last ${RULES.recurDays} days.`,
          suggestions: [
            'Soreness at an old injury is worth asking about before it turns into a new one.',
            'Consider easing the exercises that load this area for a session or two.',
          ],
          bodyPart: info.label, reportId: open?.id, dates: hits.dates,
        })
        continue
      }

      // 3. Same area again and again
      if (count >= need || hits.injured >= 2) {
        // Back-to-back: flagged in each of the player's latest N checks
        let streak = 0
        for (const c of checks) { if (flagged(c.regions).some(([z]) => z === zone)) streak++; else break }
        const concern = hits.injured > 0 || count >= need + 2 || streak >= 3
        coveredZones.add(zone)
        flags.push({
          ...base, key: `player:${player.id}:recurring:${zone}`, kind: 'recurring',
          level: concern ? 'concern' : 'watch', evidence: count,
          title: `${info.label} keeps coming up`,
          detail: `Flagged ${plural(count, 'time')} in the last ${RULES.recurDays} days`
            + (hits.injured ? ` (${hits.injured} as injured)` : '')
            + (streak >= 2 ? `, ${streak} sign-ins in a row` : '')
            + `. Last: ${shortDate(hits.dates[0])}.`,
          suggestions: [
            sensitive
              ? 'Joint or low-back pain that keeps coming back deserves a closer look — consider having it evaluated.'
              : 'Ask the player about it — it may be more than normal training soreness.',
            open ? 'Consider moving the report from Aches & Pains to Modified (lighter load or a swap for this area).'
              : 'Start tracking it on the board so it is followed.',
          ],
          bodyPart: info.label, reportId: open?.id, dates: hits.dates,
        })
      }
    }

    // 4. More soreness than usual for this player
    const last7 = checks.filter(c => t(c.checked_at) >= since(RULES.recentDays))
    const before = checks.filter(c => t(c.checked_at) < since(RULES.recentDays) && t(c.checked_at) >= since(RULES.recentDays + RULES.baselineDays))
    const r7 = rate(last7), rb = rate(before)
    const zones7 = new Set(last7.flatMap(c => flagged(c.regions).map(([z]) => z)))
    const newZones = [...zones7].filter(z => !coveredZones.has(z))
    if (last7.length >= 2 && r7 !== null && r7 >= 0.5 && newZones.length > 0 &&
        (rb === null ? last7.length >= 3 && r7 >= 0.75 : before.length >= 3 && rb <= 0.25)) {
      flags.push({
        ...base, key: `player:${player.id}:rising`, kind: 'rising',
        level: zones7.size >= 3 ? 'concern' : 'watch', evidence: Math.round(r7 * 10),
        title: 'More sore than usual',
        detail: `Sore at ${plural(last7.filter(c => flagged(c.regions).length).length, 'sign-in')} of ${last7.length} this week`
          + (rb !== null ? ` (usually ${pct(rb)} of sign-ins)` : '')
          + `: ${[...zones7].map(z => zoneInfo(z).label).join(', ')}.`,
        suggestions: [
          'Check in on sleep, school stress, other sports or a growth spurt.',
          'Consider a lighter day for this player.',
        ],
        dates: last7.filter(c => flagged(c.regions).length).map(c => c.checked_at),
      })
    }

    // 5. Workouts rated Hard again and again, with soreness
    const rated = input.sessions
      .filter(s => s.player_id === player.id && s.rating && t(s.checked_in_at) >= since(14))
      .sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at))
    if (rated.length >= 3 && rated.slice(0, 3).every(s => s.rating === 'hard') && zones7.size > 0) {
      flags.push({
        ...base, key: `player:${player.id}:workload`, kind: 'workload',
        level: 'watch', evidence: rated.filter(s => s.rating === 'hard').length,
        title: 'Rating every workout Hard',
        detail: `Last ${plural(Math.min(rated.length, 3), 'workout')} rated Hard, and sore this week (${[...zones7].map(z => zoneInfo(z).label).join(', ')}).`,
        suggestions: ['Check the weights being used — the load may be ahead of recovery.', 'Consider a lighter session.'],
        dates: rated.slice(0, 3).map(s => s.checked_in_at),
      })
    }
  }

  // ── GROUP (team or club) ──────────────────────────────────────────────────
  const exercisesByTemplate = new Map<string, TemplateExercise[]>()
  for (const e of input.templateExercises) {
    const list = exercisesByTemplate.get(e.template_id) ?? []
    list.push(e)
    exercisesByTemplate.set(e.template_id, list)
  }

  const sessionsByPlayer = new Map<string, SessionRow[]>()
  for (const s of input.sessions) {
    const list = sessionsByPlayer.get(s.player_id) ?? []
    list.push(s)
    sessionsByPlayer.set(s.player_id, list)
  }

  /** For checks that flag an area: the workout each player did last before that check */
  function workoutsBefore(checks: CheckRow[], area: string) {
    const counts = new Map<string, number>()
    for (const c of checks) {
      const prev = (sessionsByPlayer.get(c.player_id) ?? [])
        .filter(s => s.template_id && dayKey(s.checked_in_at) < dayKey(c.checked_at) && t(s.checked_in_at) >= t(c.checked_at) - 10 * DAY)
        .sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at))[0]
      if (prev?.template_id) counts.set(prev.template_id, (counts.get(prev.template_id) ?? 0) + 1)
    }
    const cats = AREA_CATEGORIES[area] ?? []
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tid, count]) => ({
      name: input.templates[tid] ?? 'Workout',
      count,
      exercises: [...new Set((exercisesByTemplate.get(tid) ?? []).filter(e => e.category && cats.includes(e.category)).map(e => e.name))],
    }))
  }

  function groupFlags(scope: 'team' | 'club', id: string, name: string, checks: CheckRow[], playerIds: Set<string>) {
    const out: WatchFlag[] = []
    const keyBase = scope === 'team' ? `team:${id}` : 'club'
    const tag = scope === 'team' ? { teamId: id, teamName: name } : {}
    const who = scope === 'team' ? name : 'The club'

    // a. More of the group sore than usual
    const last7 = checks.filter(c => t(c.checked_at) >= since(RULES.recentDays))
    const before = checks.filter(c => t(c.checked_at) < since(RULES.recentDays) && t(c.checked_at) >= since(RULES.recentDays + RULES.baselineDays))
    const r7 = rate(last7), rb = rate(before)
    if (r7 !== null && last7.length >= RULES.teamMinChecks && r7 >= RULES.teamRateWatch &&
        (rb === null || before.length < RULES.teamMinChecks || r7 >= Math.max(rb * 1.5, rb + 0.15))) {
      out.push({
        ...tag, scope, key: `${keyBase}:rate`, kind: 'rate',
        level: r7 >= RULES.teamRateConcern ? 'concern' : 'watch', evidence: Math.round(r7 * 10),
        title: `${who}: more soreness than usual`,
        detail: `${pct(r7)} of sign-ins this week reported soreness (${last7.filter(c => flagged(c.regions).length).length} of ${last7.length})`
          + (rb !== null && before.length >= RULES.teamMinChecks ? `, up from ${pct(rb)} over the 4 weeks before.` : '.'),
        suggestions: [
          'Could be the workload. Consider a lighter week or fewer sets on the main lifts.',
          'Check what changed: a new workout, a tournament weekend, extra practices.',
        ],
      })
    }

    // b. Same area across several players
    const areaChecks = checks.filter(c => t(c.checked_at) >= since(RULES.areaDays))
    const prevAreaChecks = checks.filter(c => t(c.checked_at) < since(RULES.areaDays) && t(c.checked_at) >= since(RULES.areaDays * 2))
    const checkedPlayers = new Set(areaChecks.map(c => c.player_id))
    const byArea = new Map<string, { players: Set<string>; checks: CheckRow[]; label: string }>()
    for (const c of areaChecks) {
      for (const [zone] of flagged(c.regions)) {
        if (zone === 'general') continue
        const info = zoneInfo(zone)
        const a = byArea.get(info.area) ?? { players: new Set(), checks: [], label: info.areaLabel }
        a.players.add(c.player_id)
        a.checks.push(c)
        byArea.set(info.area, a)
      }
    }
    const minPlayers = scope === 'team' ? RULES.teamAreaMinPlayers : RULES.clubAreaMinPlayers
    const minShare = scope === 'team' ? RULES.teamAreaShare : RULES.clubAreaShare
    for (const [area, a] of byArea) {
      const share = checkedPlayers.size ? a.players.size / checkedPlayers.size : 0
      if (a.players.size < minPlayers || share < minShare) continue
      const prevPlayers = new Set(prevAreaChecks.filter(c => flagged(c.regions).some(([z]) => zoneInfo(z).area === area)).map(c => c.player_id)).size
      const workouts = workoutsBefore(a.checks, area)
      const names = [...a.players].map(p => playerById.get(p)?.name ?? '').filter(Boolean)
      out.push({
        ...tag, scope, key: `${keyBase}:area:${area}`, kind: 'area',
        level: share >= (scope === 'team' ? 0.4 : 0.25) || a.players.size >= (scope === 'team' ? 5 : 10) ? 'concern' : 'watch',
        evidence: a.players.size,
        title: `${who}: ${a.label} sore across ${plural(a.players.size, 'player')}`,
        detail: `${a.players.size} of ${checkedPlayers.size} players who signed in over the last ${RULES.areaDays} days flagged their ${a.label.toLowerCase()} (${pct(share)})`
          + (prevPlayers ? `, ${prevPlayers} in the 2 weeks before.` : '.')
          + (scope === 'team' && names.length <= 8 ? ` ${names.join(', ')}.` : ''),
        suggestions: [
          workouts[0]?.exercises.length
            ? `Most often after ${workouts[0].name} — look at ${workouts[0].exercises.join(', ')} (load, form, or volume).`
            : 'Look at the exercises that load this area in recent workouts (load, form, or volume).',
          'If it is practice-related (jumping, landing, hitting volume), talk with the court coaches.',
        ],
        workouts,
        dates: a.checks.map(c => c.checked_at).sort().reverse(),
      })
    }

    // c. Several injuries at once
    const groupReports = input.reports.filter(r => playerIds.has(r.player_id))
    const openLimiting = groupReports.filter(r => (r.status === 'active' || r.status === 'monitoring') && r.availability && r.availability !== 'full')
    const newInjuries = groupReports.filter(r => r.report_type === 'major_injury' && t(r.reported_at) >= since(30))
    const limitNeed = scope === 'team' ? 2 : 5
    const newNeed = scope === 'team' ? 3 : 6
    if (openLimiting.length >= limitNeed || newInjuries.length >= newNeed) {
      const areas = [...new Set([...openLimiting, ...newInjuries].map(r => r.body_part))]
      out.push({
        ...tag, scope, key: `${keyBase}:injuries`, kind: 'injuries',
        level: openLimiting.length >= limitNeed + 1 || newInjuries.length >= newNeed + 2 ? 'concern' : 'watch',
        evidence: openLimiting.length + newInjuries.length,
        title: `${who}: ${plural(openLimiting.length, 'player')} limited right now`,
        detail: `${openLimiting.length} open as Modified, Out or Return to Play; ${plural(newInjuries.length, 'new injury', 'new injuries')} in 30 days. Areas: ${areas.slice(0, 6).join(', ')}.`,
        suggestions: [
          'Several injuries at once can point to workload. Compare with the training calendar.',
          'Check if the injuries share an area or a cause (landing, a specific lift, a tournament).',
        ],
      })
    }

    // d. Run of Hard ratings
    const groupSessions = input.sessions.filter(s => playerIds.has(s.player_id) && s.rating && (scope === 'club' || s.team_id === id || (!s.team_id && playerById.get(s.player_id)?.teamIds[0] === id)))
    const rated7 = groupSessions.filter(s => t(s.checked_in_at) >= since(RULES.recentDays))
    const ratedBefore = groupSessions.filter(s => t(s.checked_in_at) < since(RULES.recentDays) && t(s.checked_in_at) >= since(RULES.recentDays + RULES.baselineDays))
    const hard7 = rated7.length ? rated7.filter(s => s.rating === 'hard').length / rated7.length : 0
    const hardB = ratedBefore.length ? ratedBefore.filter(s => s.rating === 'hard').length / ratedBefore.length : null
    if (rated7.length >= RULES.teamMinChecks && hard7 >= 0.5 && (hardB === null || hard7 >= hardB + 0.2)) {
      out.push({
        ...tag, scope, key: `${keyBase}:workload`, kind: 'workload',
        level: hard7 >= 0.7 ? 'concern' : 'watch', evidence: Math.round(hard7 * 10),
        title: `${who}: workouts feeling Hard`,
        detail: `${pct(hard7)} of workouts this week were rated Hard` + (hardB !== null ? ` (was ${pct(hardB)}).` : '.'),
        suggestions: ['Consider backing the weights off a little or dropping a set until ratings come back down.'],
      })
    }
    return out
  }

  // ── TEAM ──────────────────────────────────────────────────────────────────
  const teamPlayers = new Map<string, Set<string>>()
  for (const p of input.players) for (const tid of p.teamIds) {
    const s = teamPlayers.get(tid) ?? new Set<string>()
    s.add(p.id)
    teamPlayers.set(tid, s)
  }
  const teamChecks = new Map<string, CheckRow[]>()
  for (const c of input.checks) {
    if (!playerById.has(c.player_id)) continue
    const tid = checkTeam(c)
    if (!tid) continue
    const list = teamChecks.get(tid) ?? []
    list.push(c)
    teamChecks.set(tid, list)
  }
  for (const team of input.teams) {
    flags.push(...groupFlags('team', team.id, team.name, teamChecks.get(team.id) ?? [], teamPlayers.get(team.id) ?? new Set()))
  }

  // ── CLUB ──────────────────────────────────────────────────────────────────
  let club: WatchResult['club'] = null
  if (input.includeClub) {
    const all = input.checks.filter(c => playerById.has(c.player_id))
    flags.push(...groupFlags('club', 'club', 'Club', all, new Set(input.players.map(p => p.id))))

    // Weekly picture, 6 weeks, Monday starts
    const monday = (d: Date) => {
      const x = new Date(d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) + 'T12:00:00')
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
      return x
    }
    const thisMonday = monday(input.now)
    const weeks: WeekPoint[] = []
    for (let i = 5; i >= 0; i--) {
      const start = new Date(thisMonday); start.setDate(start.getDate() - i * 7)
      const end = new Date(start); end.setDate(end.getDate() + 7)
      const s = dayKey(start.toISOString()), e = dayKey(end.toISOString())
      const inWeek = (iso: string) => { const k = dayKey(iso); return k >= s && k < e }
      const wc = all.filter(c => inWeek(c.checked_at))
      const ws = input.sessions.filter(x => x.rating && inWeek(x.checked_in_at))
      weeks.push({
        weekStart: s,
        checks: wc.length,
        soreRate: rate(wc),
        newInjuries: input.reports.filter(r => r.report_type === 'major_injury' && inWeek(r.reported_at)).length,
        hardRate: ws.length ? ws.filter(x => x.rating === 'hard').length / ws.length : null,
      })
    }

    const recent = all.filter(c => t(c.checked_at) >= since(RULES.areaDays))
    const prev = all.filter(c => t(c.checked_at) < since(RULES.areaDays) && t(c.checked_at) >= since(RULES.areaDays * 2))
    const count = (list: CheckRow[]) => {
      const m = new Map<string, { label: string; players: Set<string> }>()
      for (const c of list) for (const [z] of flagged(c.regions)) {
        const info = zoneInfo(z)
        const a = m.get(info.area) ?? { label: info.areaLabel, players: new Set() }
        a.players.add(c.player_id)
        m.set(info.area, a)
      }
      return m
    }
    const now14 = count(recent), prev14 = count(prev)
    const topAreas = [...now14.entries()]
      .map(([area, a]) => ({ area, label: a.label, players: a.players.size, prevPlayers: prev14.get(area)?.players.size ?? 0 }))
      .sort((a, b) => b.players - a.players)
      .slice(0, 8)

    const last7 = all.filter(c => t(c.checked_at) >= since(RULES.recentDays))
    const base = all.filter(c => t(c.checked_at) < since(RULES.recentDays) && t(c.checked_at) >= since(RULES.recentDays + RULES.baselineDays))
    club = {
      weeks, topAreas,
      soreRate7: rate(last7), soreRateBase: rate(base),
      playersChecked14: new Set(recent.map(c => c.player_id)).size,
    }
  }

  // ── Seen + order ──────────────────────────────────────────────────────────
  for (const f of flags) {
    const s = seenByKey.get(f.key)
    if (s && t(s.seen_at) >= since(RULES.seenDays) && f.evidence <= s.evidence) {
      f.seen = { at: s.seen_at, by: s.coach_name, note: s.note }
    }
  }
  const scopeRank: Record<FlagScope, number> = { club: 0, team: 1, player: 2 }
  flags.sort((a, b) =>
    (a.level === b.level ? 0 : a.level === 'concern' ? -1 : 1) ||
    scopeRank[a.scope] - scopeRank[b.scope] ||
    b.evidence - a.evidence)

  return { flags, openCount: flags.filter(f => !f.seen).length, club, generatedAt: input.now.toISOString() }
}
