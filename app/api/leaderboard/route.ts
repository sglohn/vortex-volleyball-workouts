// FILE: app/api/leaderboard/route.ts
//
// Weight Room Leaderboard feed for the TV displays (both Roku apps).
//
// The Roku apps poll this every 5 seconds and draw the three boards in
// `categories`. To make the board feel alive without a Roku update, this
// route decides what those three boards are:
//   - Columns 1–2 rotate every 15 seconds through pages: Today, Exercise of
//     the Day, Fastest Bar Speed, Team Battle, This Week, Streaks / Most
//     Improved. Pages with nothing to show yet are skipped.
//   - Column 3 is always New PRs (or the past week's PRs before anyone has
//     set one today).
//   - Girls are only compared with girls, boys only with boys.
//   - Coaches who join a team's workout (lib/coachWorkout.ts) show with that
//     team, on the boys board for a boys team and the girls board otherwise.
// The rules for each board live in lib/leaderboardBoards.ts.
//
// Optional query params:
//   ?teams=<id>,<id>   only these teams
//   ?gender=F | M      girls or boys only (each player's Girl / Boy setting)
//   ?limit=10          rows per board (1–15, default 10; the TV shows 8)
//   ?page=N            hold the board on page N (1 = Today) instead of rotating
//   ?key=...           required only if LEADERBOARD_DISPLAY_KEY is set in Vercel
//
// Pounds moved counts both dumbbells on 2-dumbbell exercises (lib/loads.ts).
// Med ball exercises count in pounds moved but not in PRs, Most Improved or
// Exercise of the Day (switching to a heavier ball isn't a PR). Band sets
// have no weight, so they only count as sets.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { coachBoardRows } from '@/lib/coachWorkout'
import { asEquipment, setLoad, setPoundsMoved, type Equipment } from '@/lib/loads'
import { CLUB_TIMEZONE, clubDateOf, clubDateString, clubDayBounds } from '@/lib/clubTime'
import {
  PAGE_SECONDS, ACCENTS, addDays, buildPages, byGender, findPRs, genderOf, lbsText,
  makeBoard, mostImproved, weekStart, weekStreak, weightText, withLabel,
  type Board, type Gender, type LiftSet, type Section,
} from '@/lib/leaderboardBoards'

type Db = ReturnType<typeof createServerClient>

type SessionRow = { id: string; player_id: string; checked_in_at: string; completed_at: string | null }
type LogRow = {
  session_id: string; exercise_id: string; weight_lbs: number | null; reps_completed: number | null
  completed: boolean; velocity_ms: number | null; logged_at: string | null
}
type PlayerJoin = { id: string; name: string; jersey_number?: string; is_active: boolean; gender?: string | null }
type TeamRow = { id: string; name: string; age_group?: string | null; color?: string | null }
type ExerciseInfo = { id: string; name: string; equipment: Equipment | null; logsWeight: boolean; logsVelocity: boolean }
type PoolPlayer = { id: string; name: string; team: TeamRow; gender: Gender; teamColor: string }

type Athlete = PoolPlayer & {
  completed: boolean; totalWeightLbs: number
  setsCompleted: number; totalSets: number; pct: number
}

const HISTORY_DAYS = 84          // 12 weeks, for streaks and most improved
const POOL_CACHE_MS = 2 * 60_000 // past days don't change mid-session
const PR_CACHE_MS = 10 * 60_000
const EXERCISE_CACHE_MS = 10 * 60_000
const IN_CHUNK = 100             // ids per .in() request (keeps URLs short)
const PAGE_ROWS = 1000           // Supabase returns at most 1000 rows per request

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** '#56a0d3' → '0x56a0d3ff' (Roku colour format). Falls back if the colour is missing or odd. */
function rokuColor(hex: string | null | undefined, fallback: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim())
  return m ? `0x${m[1].toLowerCase()}ff` : fallback
}

function clubTimeLabel(at: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: CLUB_TIMEZONE, hour: 'numeric', minute: '2-digit' }).format(at)
}

function clubDayLabel(at: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: CLUB_TIMEZONE, weekday: 'long', month: 'short', day: 'numeric' }).format(at)
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Runs a query page by page until every row is in (Supabase caps each reply at 1000 rows). */
async function allRows<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data } = await make(from, from + PAGE_ROWS - 1)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE_ROWS) return out
  }
}

/** Same as allRows, for a long list of ids split into several requests. */
async function rowsForIds<T>(ids: string[], make: (idChunk: string[], from: number, to: number) => PromiseLike<{ data: unknown[] | null }>): Promise<T[]> {
  const out: T[] = []
  for (const idChunk of chunk(ids, IN_CHUNK)) {
    out.push(...await allRows<T>((from, to) => make(idChunk, from, to)))
  }
  return out
}

// ── Caches (kept while the server stays warm; everything still works cold) ──

const exerciseCache = new Map<string, { at: number; info: ExerciseInfo }>()

async function exerciseInfo(db: Db, ids: string[]): Promise<Record<string, ExerciseInfo>> {
  const now = Date.now()
  const wanted = [...new Set(ids.filter(Boolean))]
  const missing = wanted.filter(id => {
    const hit = exerciseCache.get(id)
    return !hit || now - hit.at > EXERCISE_CACHE_MS
  })
  if (missing.length) {
    const rows = await rowsForIds<{ id: string; name: string; equipment: unknown; logs_weight: boolean | null; logs_velocity: boolean | null }>(
      missing,
      (idChunk, from, to) => db.from('exercise_library').select('id, name, equipment, logs_weight, logs_velocity').in('id', idChunk).range(from, to),
    )
    for (const r of rows) {
      exerciseCache.set(r.id, {
        at: now,
        info: { id: r.id, name: r.name, equipment: asEquipment(r.equipment), logsWeight: !!r.logs_weight, logsVelocity: !!r.logs_velocity },
      })
    }
  }
  const out: Record<string, ExerciseInfo> = {}
  for (const id of wanted) {
    const hit = exerciseCache.get(id)
    if (hit) out[id] = hit.info
  }
  return out
}

type PoolHistory = {
  /** player → club-local dates with a session before today */
  daysByPlayer: Map<string, Set<string>>
  /** completed sets before today within the last 6 weeks */
  logs: (LogRow & { player_id: string; date: string })[]
}
const poolCache = new Map<string, { at: number; data: PoolHistory }>()

/** Sessions and recent sets for everyone on the teams on the board, before today. */
async function poolHistory(db: Db, playerIds: string[], today: string, todayStart: string): Promise<PoolHistory> {
  const key = `${today}|${[...playerIds].sort().join(',')}`
  const hit = poolCache.get(key)
  if (hit && Date.now() - hit.at < POOL_CACHE_MS) return hit.data

  const since = clubDayBounds(addDays(today, -(HISTORY_DAYS - 1))).start
  const sessions = await rowsForIds<SessionRow>(playerIds, (ids, from, to) =>
    db.from('sessions').select('id, player_id, checked_in_at, completed_at')
      .in('player_id', ids).gte('checked_in_at', since).lt('checked_in_at', todayStart)
      .order('checked_in_at', { ascending: true }).range(from, to))

  const daysByPlayer = new Map<string, Set<string>>()
  const sessionInfo = new Map<string, { player_id: string; date: string }>()
  const logsFrom = addDays(today, -41)
  for (const s of sessions) {
    const date = clubDateOf(s.checked_in_at)
    if (!daysByPlayer.has(s.player_id)) daysByPlayer.set(s.player_id, new Set())
    daysByPlayer.get(s.player_id)!.add(date)
    if (date >= logsFrom) sessionInfo.set(s.id, { player_id: s.player_id, date })
  }

  const rawLogs = await rowsForIds<LogRow>([...sessionInfo.keys()], (ids, from, to) =>
    db.from('set_logs').select('session_id, exercise_id, weight_lbs, reps_completed, completed, velocity_ms, logged_at')
      .in('session_id', ids).eq('completed', true).order('id').range(from, to))

  const logs = rawLogs.map(l => ({ ...l, ...sessionInfo.get(l.session_id)! }))
  const data = { daysByPlayer, logs }
  poolCache.set(key, { at: Date.now(), data })
  if (poolCache.size > 20) poolCache.delete(poolCache.keys().next().value as string)
  return data
}

type RawLift = { exerciseId: string; date: string; at: string; entered: number; reps: number | null }
const prCache = new Map<string, { at: number; lifts: RawLift[] }>()

/** Every weighted set a player has ever logged before today (for PRs). */
async function priorLifts(db: Db, playerIds: string[], today: string, todayStart: string): Promise<Map<string, RawLift[]>> {
  const now = Date.now()
  const out = new Map<string, RawLift[]>()
  const missing: string[] = []
  for (const id of playerIds) {
    const hit = prCache.get(`${today}|${id}`)
    if (hit && now - hit.at < PR_CACHE_MS) out.set(id, hit.lifts)
    else missing.push(id)
  }
  if (!missing.length) return out

  const sessions = await rowsForIds<SessionRow>(missing, (ids, from, to) =>
    db.from('sessions').select('id, player_id, checked_in_at, completed_at')
      .in('player_id', ids).lt('checked_in_at', todayStart).order('id').range(from, to))
  const sessionById = new Map(sessions.map(s => [s.id, s]))

  const logs = await rowsForIds<LogRow>(sessions.map(s => s.id), (ids, from, to) =>
    db.from('set_logs').select('session_id, exercise_id, weight_lbs, reps_completed, completed, velocity_ms, logged_at')
      .in('session_id', ids).eq('completed', true).gt('weight_lbs', 0).order('id').range(from, to))

  for (const id of missing) out.set(id, [])
  for (const l of logs) {
    const s = sessionById.get(l.session_id)
    if (!s || !l.exercise_id) continue
    out.get(s.player_id)!.push({
      exerciseId: l.exercise_id,
      date: clubDateOf(s.checked_in_at),
      at: l.logged_at ?? s.checked_in_at,
      entered: Number(l.weight_lbs),
      reps: l.reps_completed,
    })
  }
  for (const id of missing) prCache.set(`${today}|${id}`, { at: now, lifts: out.get(id)! })
  if (prCache.size > 400) {
    for (const [k, v] of prCache) if (now - v.at > PR_CACHE_MS) prCache.delete(k)
  }
  return out
}

// ── Route ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams

  // ── Optional display key ──
  const requiredKey = process.env.LEADERBOARD_DISPLAY_KEY
  if (requiredKey && params.get('key') !== requiredKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const teamFilter = params.get('teams')?.split(',').filter(Boolean) ?? []
  const genderParam = params.get('gender')?.toUpperCase()
  const genderFilter = genderParam === 'M' || genderParam === 'F' ? genderParam : null
  const limit = Math.min(15, Math.max(1, Number(params.get('limit')) || 10))
  const pinnedPage = Number(params.get('page')) || 0

  const now = new Date()
  const date = clubDateString(now)
  const { start, end } = clubDayBounds(date)

  const db = createServerClient()

  // ── Everyone who checked in today ──
  const { data: sessionsRaw } = await db
    .from('sessions')
    .select('id, player_id, checked_in_at, completed_at')
    .gte('checked_in_at', start)
    .lt('checked_in_at', end)
    .order('checked_in_at', { ascending: true })

  const sessions = (sessionsRaw ?? []) as SessionRow[]
  const checkedInIds = [...new Set(sessions.map(s => s.player_id))]

  // ── Their primary teams ──
  const { data: playerTeams } = checkedInIds.length
    ? await db
        .from('player_teams')
        .select('player_id, team_id, players(id, name, jersey_number, is_active, gender)')
        .in('player_id', checkedInIds)
        .eq('is_primary', true)
    : { data: [] }

  // Coaches who joined a team's workout today go with that team (lib/coachWorkout.ts)
  const placedIds = new Set((playerTeams ?? []).map(pt => pt.player_id as string))
  const coachRows = await coachBoardRows(db, start, { playerIds: checkedInIds.filter(id => !placedIds.has(id)) })
  const boardRows = [...(playerTeams ?? []), ...coachRows]

  const checkedInTeamIds = [...new Set(boardRows.map(pt => pt.team_id as string))]

  const { data: teamsRaw } = checkedInTeamIds.length
    ? await db.from('teams').select('id, name, age_group, color').in('id', checkedInTeamIds)
    : { data: [] }

  const teamById: Record<string, TeamRow> = Object.fromEntries(((teamsRaw ?? []) as TeamRow[]).map(t => [t.id, t]))

  const toPoolPlayer = (p: PlayerJoin, team: TeamRow): PoolPlayer => ({
    id: p.id, name: p.name, team,
    gender: genderOf(p.gender),
    teamColor: rokuColor(team.color, ACCENTS.weight),
  })

  const players: PoolPlayer[] = boardRows
    .map(pt => {
      const p = one(pt.players as unknown as PlayerJoin | PlayerJoin[] | null)
      const team = teamById[pt.team_id as string]
      return p && team && p.is_active ? toPoolPlayer(p, team) : null
    })
    .filter((p): p is PoolPlayer => !!p)
    .filter(p => !teamFilter.length || teamFilter.includes(p.team.id))
    .filter(p => !genderFilter || p.gender === genderFilter)

  // ── Today's set logs ──
  const shownPlayerIds = new Set(players.map(p => p.id))
  const shownSessions = sessions.filter(s => shownPlayerIds.has(s.player_id))
  const sessionIds = shownSessions.map(s => s.id)

  const todayLogs = await rowsForIds<LogRow>(sessionIds, (ids, from, to) =>
    db.from('set_logs')
      .select('session_id, exercise_id, weight_lbs, reps_completed, completed, velocity_ms, logged_at')
      .in('session_id', ids).order('id').range(from, to))

  const sessionById = new Map(shownSessions.map(s => [s.id, s]))
  const completedToday = todayLogs
    .filter(l => l.completed && sessionById.has(l.session_id))
    .map(l => ({ ...l, player_id: sessionById.get(l.session_id)!.player_id }))

  const logsByPlayer = new Map<string, typeof completedToday>()
  for (const l of completedToday) {
    if (!logsByPlayer.has(l.player_id)) logsByPlayer.set(l.player_id, [])
    logsByPlayer.get(l.player_id)!.push(l)
  }

  const sessionsByPlayer: Record<string, SessionRow[]> = {}
  for (const s of shownSessions) {
    if (!sessionsByPlayer[s.player_id]) sessionsByPlayer[s.player_id] = []
    sessionsByPlayer[s.player_id].push(s)
  }

  // ── Today's workouts (for % complete and Exercise of the Day) ──
  const shownTeamIds = [...new Set(players.map(p => p.team.id))]
  const { data: schedules } = shownTeamIds.length
    ? await db.from('team_schedule').select('team_id, template_id').in('team_id', shownTeamIds).eq('scheduled_date', date)
    : { data: [] }

  const templateByTeam: Record<string, string> = {}
  for (const s of schedules ?? []) if (s.template_id) templateByTeam[s.team_id] = s.template_id

  const templateIds = [...new Set(Object.values(templateByTeam))]
  const totalSetsByTemplate: Record<string, number> = {}
  const mainLiftIds: string[] = []   // first exercise of each block, in block order

  if (templateIds.length) {
    const { data: blocks } = await db.from('template_blocks')
      .select('id, template_id, sets, sort_order').in('template_id', templateIds).order('sort_order')
    const blockIds = (blocks ?? []).map(b => b.id)
    const { data: blockExercises } = blockIds.length
      ? await db.from('template_block_exercises').select('block_id, exercise_id, sort_order').in('block_id', blockIds).order('sort_order')
      : { data: [] }

    const exercisesByBlock: Record<string, string[]> = {}
    for (const be of blockExercises ?? []) {
      if (!exercisesByBlock[be.block_id]) exercisesByBlock[be.block_id] = []
      exercisesByBlock[be.block_id].push(be.exercise_id)
    }
    for (const b of blocks ?? []) {
      const list = exercisesByBlock[b.id] ?? []
      totalSetsByTemplate[b.template_id] = (totalSetsByTemplate[b.template_id] ?? 0) + list.length * (b.sets ?? 0)
      if (list[0] && !mainLiftIds.includes(list[0])) mainLiftIds.push(list[0])
    }
  }

  // ── Everyone on the teams on the board (This Week includes players who missed today) ──
  const { data: rosterRaw } = shownTeamIds.length
    ? await db.from('player_teams')
        .select('player_id, team_id, players(id, name, jersey_number, is_active, gender)')
        .in('team_id', shownTeamIds).eq('is_primary', true)
    : { data: [] }

  // …and coaches who joined one of these teams' workouts in the last week
  const weekCoaches = await coachBoardRows(db, clubDayBounds(addDays(date, -6)).start, { teamIds: shownTeamIds })

  const pool = new Map<string, PoolPlayer>(players.map(p => [p.id, p]))
  for (const pt of [...(rosterRaw ?? []), ...weekCoaches]) {
    const p = one(pt.players as unknown as PlayerJoin | PlayerJoin[] | null)
    const team = teamById[pt.team_id as string]
    if (p && team && p.is_active && !pool.has(p.id)) pool.set(p.id, toPoolPlayer(p, team))
  }
  const poolPlayers = [...pool.values()]

  // ── History (cached between refreshes) ──
  const [history, prior] = players.length
    ? await Promise.all([
        poolHistory(db, poolPlayers.map(p => p.id), date, start),
        priorLifts(db, players.map(p => p.id), date, start),
      ])
    : [{ daysByPlayer: new Map<string, Set<string>>(), logs: [] }, new Map<string, RawLift[]>()]

  const exerciseIds = [
    ...completedToday.map(l => l.exercise_id),
    ...history.logs.map(l => l.exercise_id),
    ...[...prior.values()].flat().map(l => l.exerciseId),
    ...mainLiftIds,
  ]
  const exercises = await exerciseInfo(db, exerciseIds)
  const eq = (id: string) => exercises[id]?.equipment ?? null
  // Lifts ranked by how heavy they were (PRs, Most Improved, Exercise of the Day)
  const ranksByWeight = (id: string) => eq(id) !== 'medball'
  const exName = (id: string) => exercises[id]?.name ?? 'Lift'

  // ── Per-athlete totals for today ──
  const athletes: Athlete[] = players.map(p => {
    const playerSessions = sessionsByPlayer[p.id] ?? []
    const logs = logsByPlayer.get(p.id) ?? []
    const totalWeight = logs.reduce((sum, l) => sum + setPoundsMoved(l.weight_lbs, l.reps_completed, eq(l.exercise_id)), 0)
    const templateId = templateByTeam[p.team.id]
    const totalSets = templateId ? (totalSetsByTemplate[templateId] ?? 0) : 0
    return {
      ...p,
      completed: playerSessions.length > 0 && playerSessions.every(s => !!s.completed_at),
      totalWeightLbs: Math.round(totalWeight),
      setsCompleted: logs.length,
      totalSets,
      pct: totalSets > 0 ? Math.min(100, Math.round(logs.length / totalSets * 100)) : 0,
    }
  })
  const athleteById = new Map(athletes.map(a => [a.id, a]))
  const doneOf = (id: string) => athleteById.get(id)?.completed ?? false

  const sections: Section[] = []
  const common = {
    name: (a: { name: string }) => a.name,
    teamColor: (a: { teamColor: string }) => a.teamColor,
    limit,
  }

  // ── Page: Today ──
  {
    const boards: Board[] = []
    for (const g of byGender(athletes, a => a.gender)) {
      boards.push(makeBoard({
        ...common, key: 'weight', title: 'Most Weight Moved', sub: withLabel(g.label, 'Total lbs lifted today'),
        items: g.items, keepZero: true,
        score: a => a.totalWeightLbs, value: a => a.totalWeightLbs > 0 ? lbsText(a.totalWeightLbs) : '-',
        team: a => a.team.name, done: a => a.completed,
      }))
    }
    for (const g of byGender(athletes, a => a.gender)) {
      boards.push(makeBoard({
        ...common, key: 'pct', title: '% Complete', sub: withLabel(g.label, 'Furthest through the workout'),
        items: g.items, keepZero: true, barIsPct: true,
        score: a => a.pct, tieBreak: (a, b) => b.setsCompleted - a.setsCompleted,
        value: a => a.totalSets > 0 ? `${a.pct}%` : (a.setsCompleted > 0 ? `${a.setsCompleted} sets` : '-'),
        team: a => a.team.name, done: a => a.completed,
      }))
    }
    sections.push({ page: 'TODAY', boards })
  }

  // ── Page: Exercise of the Day (top set on each block's main lift) ──
  {
    const boards: Board[] = []
    const lifts = mainLiftIds.filter(id => exercises[id]?.logsWeight && ranksByWeight(id)).slice(0, 4)
    for (const exerciseId of lifts) {
      const best = new Map<string, { load: number; entered: number }>()
      for (const l of completedToday) {
        if (l.exercise_id !== exerciseId || !l.weight_lbs || l.weight_lbs <= 0) continue
        const load = setLoad(l.weight_lbs, eq(exerciseId))
        const prev = best.get(l.player_id)
        if (!prev || load > prev.load) best.set(l.player_id, { load, entered: Number(l.weight_lbs) })
      }
      const items = [...best.entries()].map(([id, b]) => ({ ...athleteById.get(id)!, ...b }))
      for (const g of byGender(items, a => a.gender)) {
        boards.push(makeBoard({
          ...common, key: 'exercise', title: exName(exerciseId), sub: withLabel(g.label, 'Top set today'),
          items: g.items, score: a => a.load, value: a => weightText(a.entered, eq(exerciseId)),
          team: a => a.team.name, done: a => a.completed,
        }))
      }
    }
    sections.push({ page: 'EXERCISE OF THE DAY', boards })
  }

  // ── Page: Fastest Bar Speed (the two most-used speed exercises today) ──
  {
    const boards: Board[] = []
    const counts = new Map<string, number>()
    for (const l of completedToday) {
      if ((l.velocity_ms ?? 0) > 0) counts.set(l.exercise_id, (counts.get(l.exercise_id) ?? 0) + 1)
    }
    const speedLifts = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id)
    for (const exerciseId of speedLifts) {
      const best = new Map<string, number>()
      for (const l of completedToday) {
        const v = Number(l.velocity_ms ?? 0)
        if (l.exercise_id !== exerciseId || v <= 0 || v > 2.5) continue
        best.set(l.player_id, Math.max(best.get(l.player_id) ?? 0, v))
      }
      const items = [...best.entries()].map(([id, speed]) => ({ ...athleteById.get(id)!, speed }))
      for (const g of byGender(items, a => a.gender)) {
        boards.push(makeBoard({
          ...common, key: 'speed', title: 'Fastest Bar Speed', sub: withLabel(g.label, exName(exerciseId)),
          items: g.items, score: a => a.speed, value: a => `${a.speed.toFixed(2)} m/s`,
          team: a => a.team.name, done: a => a.completed,
        }))
      }
    }
    sections.push({ page: 'FASTEST BAR SPEED', boards })
  }

  // ── Page: Team Battle (only when 2+ teams of the same group are lifting) ──
  {
    const boards: Board[] = []
    for (const g of byGender(athletes, a => a.gender)) {
      const teams = new Map<string, Athlete[]>()
      for (const a of g.items) {
        if (!teams.has(a.team.id)) teams.set(a.team.id, [])
        teams.get(a.team.id)!.push(a)
      }
      if (teams.size < 2) continue
      const items = [...teams.values()].map(list => ({
        name: list[0].team.name,
        teamColor: list[0].teamColor,
        lifters: list.length,
        total: list.reduce((s, a) => s + a.totalWeightLbs, 0),
        avgPct: Math.round(list.reduce((s, a) => s + a.pct, 0) / list.length),
      }))
      boards.push(makeBoard({
        ...common, key: 'team', title: 'Team Battle', sub: withLabel(g.label, 'Total lbs moved today'),
        items, keepZero: true, score: t => t.total, value: t => lbsText(t.total),
        team: t => `${t.lifters} lifting`,
      }))
      boards.push(makeBoard({
        ...common, key: 'team', title: 'Team Battle', sub: withLabel(g.label, 'Average % complete'),
        items, keepZero: true, barIsPct: true, score: t => t.avgPct, value: t => `${t.avgPct}%`,
        team: t => `${t.lifters} lifting`,
      }))
    }
    sections.push({ page: 'TEAM BATTLE', boards })
  }

  // ── Page: This Week (Monday through today, includes players who missed today) ──
  const monday = weekStart(date)
  {
    const weekLbs = new Map<string, number>()
    const weekDays = new Map<string, Set<string>>()
    const addDay = (id: string, d: string) => {
      if (!weekDays.has(id)) weekDays.set(id, new Set())
      weekDays.get(id)!.add(d)
    }
    for (const [id, days] of history.daysByPlayer) for (const d of days) if (d >= monday) addDay(id, d)
    for (const l of history.logs) {
      if (l.date < monday) continue
      weekLbs.set(l.player_id, (weekLbs.get(l.player_id) ?? 0) + setPoundsMoved(l.weight_lbs, l.reps_completed, eq(l.exercise_id)))
    }
    for (const a of athletes) {
      addDay(a.id, date)
      weekLbs.set(a.id, (weekLbs.get(a.id) ?? 0) + a.totalWeightLbs)
    }
    const items = poolPlayers.map(p => ({ ...p, lbs: Math.round(weekLbs.get(p.id) ?? 0), days: weekDays.get(p.id)?.size ?? 0 }))

    const boards: Board[] = []
    for (const g of byGender(items, a => a.gender)) {
      boards.push(makeBoard({
        ...common, key: 'week', title: 'This Week', sub: withLabel(g.label, 'Total lbs moved since Monday'),
        items: g.items, score: a => a.lbs, value: a => lbsText(a.lbs),
        team: a => a.team.name, done: a => doneOf(a.id),
      }))
    }
    for (const g of byGender(items, a => a.gender)) {
      boards.push(makeBoard({
        ...common, key: 'week', title: 'This Week', sub: withLabel(g.label, 'Days in the weight room'),
        items: g.items, score: a => a.days, tieBreak: (a, b) => b.lbs - a.lbs,
        value: a => `${a.days} ${a.days === 1 ? 'day' : 'days'}`,
        team: a => a.team.name, done: a => doneOf(a.id),
      }))
    }
    sections.push({ page: 'THIS WEEK', boards })
  }

  // ── Page: Streaks ──
  {
    const items = poolPlayers.map(p => {
      const days = new Set(history.daysByPlayer.get(p.id) ?? [])
      if (athleteById.has(p.id)) days.add(date)
      return { ...p, streak: weekStreak(days, date) }
    }).filter(p => p.streak >= 2)
    const boards: Board[] = []
    for (const g of byGender(items, a => a.gender)) {
      boards.push(makeBoard({
        ...common, key: 'streak', title: 'Streaks', sub: withLabel(g.label, 'Weeks in a row, 2+ days each'),
        items: g.items, score: a => a.streak, value: a => `${a.streak} wks`,
        team: a => a.team.name, done: a => doneOf(a.id),
      }))
    }
    sections.push({ page: 'STREAKS', boards })
  }

  // ── Page: Most Improved (last 2 weeks vs the 4 weeks before) ──
  {
    const sets: LiftSet[] = []
    for (const l of history.logs) {
      if (!l.weight_lbs || l.weight_lbs <= 0 || !ranksByWeight(l.exercise_id)) continue
      sets.push({ playerId: l.player_id, exerciseId: l.exercise_id, date: l.date, at: l.logged_at ?? l.date,
        entered: Number(l.weight_lbs), load: setLoad(l.weight_lbs, eq(l.exercise_id)), reps: l.reps_completed })
    }
    for (const l of completedToday) {
      if (!l.weight_lbs || l.weight_lbs <= 0 || !ranksByWeight(l.exercise_id)) continue
      sets.push({ playerId: l.player_id, exerciseId: l.exercise_id, date, at: l.logged_at ?? date,
        entered: Number(l.weight_lbs), load: setLoad(l.weight_lbs, eq(l.exercise_id)), reps: l.reps_completed })
    }
    const items = mostImproved(sets, date)
      .filter(i => pool.has(i.playerId))
      .map(i => ({ ...pool.get(i.playerId)!, exerciseId: i.exerciseId, pct: Math.round(i.pct * 100) }))
    const boards: Board[] = []
    for (const g of byGender(items, a => a.gender)) {
      boards.push(makeBoard({
        ...common, key: 'improved', title: 'Most Improved', sub: withLabel(g.label, 'Est. max, last 2 weeks'),
        items: g.items, score: a => a.pct, value: a => `+${a.pct}%`,
        team: a => exName(a.exerciseId), done: a => doneOf(a.id),
      }))
    }
    sections.push({ page: 'MOST IMPROVED', boards })
  }

  // ── Column 3: PRs (today's, or the past week's until someone sets one) ──
  const sevenDaysAgo = addDays(date, -6)
  const allLifts: LiftSet[] = []
  for (const p of players) {
    for (const r of prior.get(p.id) ?? []) {
      if (!ranksByWeight(r.exerciseId)) continue
      allLifts.push({ playerId: p.id, exerciseId: r.exerciseId, date: r.date, at: r.at, entered: r.entered,
        load: setLoad(r.entered, eq(r.exerciseId)), reps: r.reps })
    }
  }
  for (const l of completedToday) {
    if (!l.weight_lbs || l.weight_lbs <= 0 || !ranksByWeight(l.exercise_id)) continue
    allLifts.push({ playerId: l.player_id, exerciseId: l.exercise_id, date, at: l.logged_at ?? new Date().toISOString(),
      entered: Number(l.weight_lbs), load: setLoad(l.weight_lbs, eq(l.exercise_id)), reps: l.reps_completed })
  }
  const prs = findPRs(allLifts, sevenDaysAgo)
  const prsToday = prs.filter(p => p.date === date)
  const prList = prsToday.length ? prsToday : prs
  const prBoard: Board = {
    key: 'pr',
    title: prsToday.length ? 'New PRs Today' : 'New PRs',
    sub: prsToday.length
      ? `${prsToday.length} personal ${prsToday.length === 1 ? 'record' : 'records'} so far`
      : (prs.length ? 'Past 7 days - be the first today!' : 'None yet today - be the first!'),
    accent: ACCENTS.pr,
    rows: prList.slice(0, limit).map((p, i) => {
      const a = athleteById.get(p.playerId)
      return {
        rank: i + 1,
        name: a?.name ?? '',
        team: `${exName(p.exerciseId)}  +${Math.round(p.gain)}`,
        teamColor: a?.teamColor ?? ACCENTS.weight,
        done: false,
        value: weightText(p.entered, eq(p.exerciseId)),
        bar: 100,
      }
    }),
  }

  // ── Pick the page to show ──
  const pages = buildPages(sections)
  const pageIndex = pages.length
    ? (pinnedPage > 0 ? Math.min(pinnedPage, pages.length) - 1 : Math.floor(now.getTime() / (PAGE_SECONDS * 1000)) % pages.length)
    : 0
  const page = pages[pageIndex] ?? { name: 'TODAY', boards: [] }
  const categories = [...page.boards.slice(0, 2), prBoard]

  const totalLbs = athletes.reduce((sum, a) => sum + a.totalWeightLbs, 0)

  // The Roku apps print dayLabel first on the summary line, so it carries
  // the page name and the PR count.
  const prNote = prsToday.length ? `${prsToday.length} new ${prsToday.length === 1 ? 'PR' : 'PRs'}` : clubDayLabel(now)

  return NextResponse.json(
    {
      date,
      dayLabel: `${page.name}   |   ${prNote}`,
      asOf: clubTimeLabel(now),
      page: { index: pageIndex + 1, count: pages.length, name: page.name, seconds: PAGE_SECONDS },
      summary: {
        lifting: athletes.filter(a => !a.completed).length,
        checkedIn: athletes.length,
        finished: athletes.filter(a => a.completed).length,
        totalLbs,
        totalLbsLabel: totalLbs.toLocaleString('en-US'),
        prsToday: prsToday.length,
      },
      categories,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
