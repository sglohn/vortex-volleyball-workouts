// FILE: lib/combineLeaderboard.ts
//
// Live Combine Day boards for the TV leaderboard (app/api/leaderboard, shown
// by both Roku apps). Used whenever a team on the board has a Combine Day
// template scheduled today (lib/combine.ts).
//
// One page per test. Each page pairs that test's board for TODAY (tries
// entered today, combine_attempts, best try per test) with its CLUB TOP 5
// (the five best numbers in the club right now), so players can see the
// numbers to shoot for:
//   COMBINE SCORE      the athleticism score (lib/athleticism.ts) from each
//                      player's latest numbers, today's included. Today's
//                      board waits until she has done at least 4 of the
//                      score tests today (so nobody is ranked on last
//                      season's numbers after a single test)
//   MAX VERTICAL       approach touch minus standing reach
//   APPROACH TOUCH
//   STANDING VERTICAL  block touch minus standing reach
//   BLOCK TOUCH
//   ACCELERATION       fastest time first
//   AGILITY            net shuttle (3-6-3 m), fastest time first
//   SWING VELOCITY     only when someone entered a swing today (optional test)
//   WINGSPAN
//   STANDING REACH
// Girls are only ranked against girls and boys against boys, as on every
// other board; with both at the combine, each page has girls' today + club
// boards, then boys'. Height isn't ranked. Before anyone has a number today,
// the pages show the Club Top 5 boards on their own.
//
// CLUB TOP 5: every active player on a team (not Open Gym, not coaches'
// workout profiles), each with her current numbers: her latest
// measurements, or her best try today if she's testing. Verticals use that
// player's own reach. A player testing today shows "TODAY" after her team,
// so a new club top-5 number stands out.
//
// The third column on combine pages is New Bests Today: every jump, sprint
// or swing where a player beat her number from before today, newest first
// (height, wingspan and reach don't count; growing isn't a best). Until someone
// does, it shows the latest entries instead.
//
// Values are plain ASCII (tvText in lib/combine.ts) because the Roku can't
// draw the ′ ″ ½ marks the phones use.

import { createServerClient } from '@/lib/supabase'
import { buildPopulationStats, calculateAthleticismScore, type AthleticismInputs } from '@/lib/athleticism'
import {
  COMBINE_KEYS, bestValue, combineMetric, isBetter, tvGain, tvText, verticalFrom,
  type CombineMetric, type CombineMetricKey,
} from '@/lib/combine'
import { ACCENTS, genderOf, makeBoard, withLabel, type Board, type Gender, type Section } from '@/lib/leaderboardBoards'

type Db = ReturnType<typeof createServerClient>

export type CombineAthlete = {
  id: string
  name: string
  team: { id: string; name: string }
  gender: Gender
  teamColor: string
  completed: boolean
}

export type CombineBoards = {
  sections: Section[]
  /** Third column on combine pages */
  bests: Board
  /** Shown when nobody has entered anything yet */
  waiting: Board
  testing: number
  finished: number
  newBests: number
}

// Short test names for the small line under a player's name on the TV
const TV_SHORT: Record<CombineMetricKey, string> = {
  height_in: 'Height', wingspan_in: 'Wingspan', standing_reach_in: 'Reach',
  standing_vertical_in: 'Block Touch', approach_vertical_in: 'Appr Touch',
  acceleration_sec: 'Accel', pro_agility_sec: 'Agility', swing_velocity_mph: 'Swing',
}

// Tests that go into the athleticism score (wingspan doesn't)
const SCORE_TESTS: CombineMetricKey[] = [
  'height_in', 'standing_reach_in', 'standing_vertical_in', 'approach_vertical_in',
  'acceleration_sec', 'pro_agility_sec', 'swing_velocity_mph',
]

const IN_CHUNK = 100
const CLUB_TOP = 5
const PAGE_ROWS = 1000
const POOL_CACHE_MS = 60_000

type AttemptRow = { session_id: string; player_id: string; metric: string; value: number; created_at: string }
type MeasurementRow = Record<string, unknown> & { player_id: string; measured_at: string }

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

// Every player's latest measurements (the athleticism score's comparison
// pool, same as app/api/coach/players). Cached briefly between refreshes.
let poolCache: { at: number; map: Map<string, MeasurementRow> } | null = null

async function latestMeasurementPool(db: Db): Promise<Map<string, MeasurementRow>> {
  if (poolCache && Date.now() - poolCache.at < POOL_CACHE_MS) return poolCache.map
  const map = new Map<string, MeasurementRow>()
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await db
      .from('measurements')
      .select('player_id, measured_at, created_at, height_in, wingspan_in, standing_reach_in, standing_vertical_in, approach_vertical_in, acceleration_sec, pro_agility_sec, swing_velocity_mph')
      .order('measured_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_ROWS - 1)
    if (error) break
    const rows = (data ?? []) as MeasurementRow[]
    for (const r of rows) if (r.player_id && !map.has(r.player_id)) map.set(r.player_id, r)
    if (rows.length < PAGE_ROWS) break
  }
  poolCache = { at: Date.now(), map }
  return map
}

// Every active player on a team, for the Club Top 5. Cached like the pool.
type ClubPlayer = { id: string; name: string; gender: Gender; teamName: string; teamColor: string }
let clubCache: { at: number; list: ClubPlayer[] } | null = null

function rokuColor(hex: unknown): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim())
  return m ? `0x${m[1].toLowerCase()}ff` : ACCENTS.length
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

async function clubPlayers(db: Db): Promise<ClubPlayer[]> {
  if (clubCache && Date.now() - clubCache.at < POOL_CACHE_MS) return clubCache.list
  type Join = { id: string; name: string; is_active: boolean; gender?: string | null; coach_id?: string | null }
  type TeamJoin = { name: string; color?: string | null; is_open_gym?: boolean | null }
  const list: ClubPlayer[] = []
  const seen = new Set<string>()
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await db
      .from('player_teams')
      .select('player_id, players(*), teams(*)')
      .eq('is_primary', true)
      .order('player_id')
      .range(from, from + PAGE_ROWS - 1)
    if (error) break
    const rows = data ?? []
    for (const r of rows) {
      const p = one(r.players as unknown as Join | Join[] | null)
      const t = one(r.teams as unknown as TeamJoin | TeamJoin[] | null)
      if (!p || !t || !p.is_active || p.coach_id || t.is_open_gym || seen.has(p.id)) continue
      seen.add(p.id)
      list.push({ id: p.id, name: p.name, gender: genderOf(p.gender), teamName: t.name, teamColor: rokuColor(t.color) })
    }
    if (rows.length < PAGE_ROWS) break
  }
  clubCache = { at: Date.now(), list }
  return list
}

function athleticismInputs(m: MeasurementRow | undefined): AthleticismInputs {
  return {
    height_in: num(m?.height_in),
    standing_reach_in: num(m?.standing_reach_in),
    standing_vertical_in: num(m?.standing_vertical_in),
    approach_vertical_in: num(m?.approach_vertical_in),
    acceleration_sec: num(m?.acceleration_sec),
    pro_agility_sec: num(m?.pro_agility_sec),
    swing_velocity_mph: num(m?.swing_velocity_mph),
  }
}

/**
 * Builds the combine boards for the athletes on combine teams today.
 * `sessionIds` are their sessions today; `date` is the club date.
 */
export async function buildCombineBoards(db: Db, opts: {
  date: string
  athletes: CombineAthlete[]
  sessionIds: string[]
  limit: number
}): Promise<CombineBoards> {
  const { date, athletes, sessionIds, limit } = opts
  const byId = new Map(athletes.map(a => [a.id, a]))

  // ── Today's tries ──
  const attempts: AttemptRow[] = []
  for (const ids of chunk(sessionIds, IN_CHUNK)) {
    const { data, error } = await db
      .from('combine_attempts')
      .select('session_id, player_id, metric, value, created_at')
      .in('session_id', ids)
      .order('created_at', { ascending: true })
    if (error) break   // e.g. before the Combine Day migration
    attempts.push(...((data ?? []) as AttemptRow[]))
  }

  // Best and latest try per player per test
  const tries = new Map<string, Map<CombineMetricKey, { values: number[]; lastAt: string }>>()
  for (const a of attempts) {
    if (!byId.has(a.player_id)) continue
    const metric = combineMetric(a.metric)
    const v = num(a.value)
    if (!metric || v == null) continue
    if (!tries.has(a.player_id)) tries.set(a.player_id, new Map())
    const forPlayer = tries.get(a.player_id)!
    const entry = forPlayer.get(metric.key) ?? { values: [], lastAt: a.created_at }
    entry.values.push(v)
    if (a.created_at > entry.lastAt) entry.lastAt = a.created_at
    forPlayer.set(metric.key, entry)
  }
  const best = (playerId: string, key: CombineMetricKey): number | null => {
    const e = tries.get(playerId)?.get(key)
    const m = combineMetric(key)
    return e && m ? bestValue(m, e.values) : null
  }
  const testers = athletes.filter(a => tries.has(a.id))

  // ── Their numbers from before today ──
  const previous = new Map<string, MeasurementRow>()
  for (const ids of chunk(testers.map(a => a.id), IN_CHUNK)) {
    const { data } = await db
      .from('measurements')
      .select('*')
      .in('player_id', ids)
      .lt('measured_at', date)
      .order('measured_at', { ascending: false })
    for (const r of (data ?? []) as MeasurementRow[]) if (!previous.has(r.player_id)) previous.set(r.player_id, r)
  }
  const reachOf = (playerId: string): number | null =>
    best(playerId, 'standing_reach_in') ?? num(previous.get(playerId)?.standing_reach_in)

  const common = {
    name: (a: { name: string }) => a.name,
    team: (a: { team: { name: string } }) => a.team.name,
    teamColor: (a: { teamColor: string }) => a.teamColor,
    done: (a: { completed: boolean }) => a.completed,
    limit,
  }

  // Genders at the combine today, girls first. A label ("Girls") only when
  // both are here, as on the other boards.
  const genders: Gender[] = (['F', 'M'] as Gender[]).filter(g => athletes.some(a => a.gender === g))
  const todayLabel = (g: Gender) => (genders.length > 1 ? (g === 'F' ? 'Girls' : 'Boys') : null)
  const clubLabel = (g: Gender) => (g === 'F' ? 'Girls' : 'Boys')

  // ── The club's current numbers (Club Top 5) ──
  const pool = athletes.length ? await latestMeasurementPool(db) : new Map<string, MeasurementRow>()
  const club = athletes.length ? await clubPlayers(db) : []
  const testerIds = new Set(testers.map(a => a.id))
  /** Her current number: her best try today if she's testing, else her latest on file */
  const clubValue = (id: string, key: CombineMetricKey): number | null =>
    (testerIds.has(id) ? best(id, key) : null) ?? num(pool.get(id)?.[key])
  const clubTeam = (p: ClubPlayer, today: boolean) => (today ? `${p.teamName}  -  TODAY` : p.teamName)

  function clubBoard(g: Gender, accent: keyof typeof ACCENTS, sub: string, items: Array<ClubPlayer & { v: number; today: boolean }>, lowerFirst: boolean, value: (v: number) => string): Board {
    return makeBoard({
      key: accent, title: `Club Top ${CLUB_TOP}`, sub: withLabel(clubLabel(g), sub),
      items: items.filter(p => p.gender === g),
      score: p => (lowerFirst ? 1 / p.v : p.v),
      value: p => value(p.v),
      name: p => p.name, team: p => clubTeam(p, p.today), teamColor: p => p.teamColor,
      limit: CLUB_TOP,
    })
  }

  /** Today's board then the Club Top 5, for each gender here today */
  function paired(today: (g: Gender) => Board, clubFor: (g: Gender) => Board): Board[] {
    return genders.flatMap(g => [today(g), clubFor(g)])
  }

  // One test: today's best tries, and the club's numbers
  function testSection(page: string, key: CombineMetricKey, accent: keyof typeof ACCENTS, title: string, sub: string, clubSub: string): Section {
    const metric = combineMetric(key)!
    const lower = metric.better === 'lower'
    const items = testers
      .map(a => ({ ...a, v: best(a.id, key) }))
      .filter((a): a is typeof a & { v: number } => a.v != null)
    const clubItems = club
      .map(p => ({ ...p, v: clubValue(p.id, key), today: testerIds.has(p.id) && best(p.id, key) != null }))
      .filter((p): p is typeof p & { v: number } => p.v != null)
    return {
      page,
      boards: paired(
        g => makeBoard({
          ...common, key: accent, title, sub: withLabel(todayLabel(g), sub), items: items.filter(a => a.gender === g),
          score: a => (lower ? 1 / a.v : a.v),
          value: a => tvText(metric, a.v),
        }),
        g => clubBoard(g, accent, clubSub, clubItems, lower, v => tvText(metric, v)),
      ),
    }
  }

  // Vertical = touch minus standing reach (today's reach, else last time's)
  function verticalSection(page: string, touchKey: CombineMetricKey, title: string, sub: string, clubSub: string): Section {
    const vertText = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}"`
    const items = testers
      .map(a => ({ ...a, v: verticalFrom(best(a.id, touchKey), reachOf(a.id)) }))
      .filter((a): a is typeof a & { v: number } => a.v != null)
    const clubItems = club
      .map(p => ({
        ...p,
        v: verticalFrom(clubValue(p.id, touchKey), clubValue(p.id, 'standing_reach_in')),
        today: testerIds.has(p.id) && best(p.id, touchKey) != null,
      }))
      .filter((p): p is typeof p & { v: number } => p.v != null)
    return {
      page,
      boards: paired(
        g => makeBoard({
          ...common, key: 'jump', title, sub: withLabel(todayLabel(g), sub), items: items.filter(a => a.gender === g),
          score: a => a.v, value: a => vertText(a.v),
        }),
        g => clubBoard(g, 'jump', clubSub, clubItems, false, vertText),
      ),
    }
  }

  // ── Combine score (athleticism score with today's numbers in) ──
  const population = buildPopulationStats([...pool.values()].map(athleticismInputs))
  // Only players with at least 4 score tests done today (fewer if the combine
  // has fewer), so nobody is ranked on last season's numbers after one test
  const scoreTestsToday = (id: string) => SCORE_TESTS.filter(k => best(id, k) != null).length
  const scoreNeeded = Math.min(4, Math.max(0, ...testers.map(a => scoreTestsToday(a.id))))
  const scoreOf = (id: string) => {
    const inputs = athleticismInputs(pool.get(id))
    // Testers: today's best tries over what's on file (the pool is cached briefly)
    if (testerIds.has(id)) for (const k of SCORE_TESTS) { const b = best(id, k); if (b != null) (inputs as Record<string, number | null>)[k] = b }
    return calculateAthleticismScore(inputs, population).score
  }
  const scored = testers
    .filter(a => scoreNeeded > 0 && scoreTestsToday(a.id) >= scoreNeeded)
    .map(a => ({ ...a, score: scoreOf(a.id) }))
    .filter((a): a is typeof a & { score: number } => a.score != null)
  const clubScored = club
    .map(p => ({ ...p, v: scoreOf(p.id), today: testerIds.has(p.id) && scoreTestsToday(p.id) >= Math.max(1, scoreNeeded) }))
    .filter((p): p is typeof p & { v: number } => p.v != null)
  const scoreSection: Section = {
    page: 'COMBINE SCORE',
    boards: paired(
      g => makeBoard({
        ...common, key: 'vpi', title: 'Combine Score', sub: withLabel(todayLabel(g), 'Athleticism score, ~400 = club average'),
        items: scored.filter(a => a.gender === g), score: a => a.score, value: a => String(Math.round(a.score)),
      }),
      g => clubBoard(g, 'vpi', 'Best athleticism scores', clubScored, false, v => String(Math.round(v))),
    ),
  }

  const sections: Section[] = [
    scoreSection,
    verticalSection('MAX VERTICAL', 'approach_vertical_in', 'Max Vertical', 'Approach touch minus reach', 'Best max verticals'),
    testSection('APPROACH TOUCH', 'approach_vertical_in', 'jump', 'Approach Touch', 'Highest touch today', 'Highest approach touches'),
    verticalSection('STANDING VERTICAL', 'standing_vertical_in', 'Standing Vertical', 'Block touch minus reach', 'Best standing verticals'),
    testSection('BLOCK TOUCH', 'standing_vertical_in', 'jump', 'Block Touch', 'Highest touch today', 'Highest block touches'),
    testSection('ACCELERATION', 'acceleration_sec', 'sprint', 'Acceleration', 'Endline to net 9 m, fastest time', 'Fastest endline to net'),
    testSection('AGILITY', 'pro_agility_sec', 'sprint', 'Agility', 'Net shuttle 3-6-3 m, fastest time', 'Fastest agility shuttles'),
    testSection('WINGSPAN', 'wingspan_in', 'length', 'Wingspan', 'Fingertip to fingertip', 'Longest wingspans'),
    testSection('STANDING REACH', 'standing_reach_in', 'length', 'Standing Reach', 'Flat-footed, one hand', 'Highest standing reach'),
  ]
  // Swing Velocity is optional: only when someone entered a swing today
  if (testers.some(a => best(a.id, 'swing_velocity_mph') != null)) {
    sections.splice(7, 0, testSection('SWING VELOCITY', 'swing_velocity_mph', 'swing', 'Swing Velocity', 'Fastest arm swing', 'Fastest arm swings'))
  }

  // ── New bests today (beat the number from before today) ──
  type Event = { athlete: CombineAthlete; metric: CombineMetric; value: number; gain: number; at: string }
  const events: Event[] = []
  const latest: Event[] = []
  for (const a of testers) {
    for (const key of COMBINE_KEYS) {
      const e = tries.get(a.id)?.get(key)
      const metric = combineMetric(key)
      const v = best(a.id, key)
      if (!e || !metric || v == null) continue
      latest.push({ athlete: a, metric, value: v, gain: 0, at: e.lastAt })
      // Growing isn't a best: height, wingspan and reach only show as entries
      if (key === 'height_in' || key === 'wingspan_in' || key === 'standing_reach_in') continue
      const prev = num(previous.get(a.id)?.[key])
      if (prev != null && isBetter(metric, v, prev)) {
        events.push({ athlete: a, metric, value: v, gain: v - prev, at: e.lastAt })
      }
    }
  }
  events.sort((x, y) => y.at.localeCompare(x.at))
  latest.sort((x, y) => y.at.localeCompare(x.at))

  const bests: Board = events.length
    ? {
        key: 'best', title: 'New Bests Today', accent: ACCENTS.best,
        sub: `${events.length} new personal ${events.length === 1 ? 'best' : 'bests'}`,
        rows: events.slice(0, limit).map((ev, i) => ({
          rank: i + 1, name: ev.athlete.name, team: `${TV_SHORT[ev.metric.key]}  ${tvGain(ev.metric, ev.gain)}`,
          teamColor: ev.athlete.teamColor, done: false, value: tvText(ev.metric, ev.value), bar: 100,
        })),
      }
    : {
        key: 'best', title: 'Latest Entries', accent: ACCENTS.best,
        sub: latest.length ? 'No new bests yet - be the first!' : 'Enter your numbers on your phone',
        rows: latest.slice(0, limit).map((ev, i) => ({
          rank: i + 1, name: ev.athlete.name, team: TV_SHORT[ev.metric.key],
          teamColor: ev.athlete.teamColor, done: false, value: tvText(ev.metric, ev.value), bar: 100,
        })),
      }

  const waiting: Board = {
    key: 'combine', title: 'Combine Day', accent: ACCENTS.jump,
    sub: 'Boards fill in as numbers are entered', rows: [],
  }

  return {
    sections,
    bests,
    waiting,
    testing: athletes.filter(a => !a.completed).length,
    finished: athletes.filter(a => a.completed).length,
    newBests: events.length,
  }
}
