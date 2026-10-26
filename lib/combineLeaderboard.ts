// FILE: lib/combineLeaderboard.ts
//
// Live Combine Day boards for the TV leaderboard (app/api/leaderboard, shown
// by both Roku apps). Used whenever a team on the board has a Combine Day
// template scheduled today (lib/combine.ts).
//
// Boards come from the tries players enter on their phones today
// (combine_attempts), best try per test:
//   COMBINE SCORE   the athleticism score (lib/athleticism.ts) from each
//                   player's latest numbers, today's included, once 5 of the
//                   8 score metrics are on file
//   APPROACH JUMP   max vertical (approach touch minus standing reach) and
//                   approach touch
//   BLOCK JUMP      standing vertical and block touch
//   SPEED           acceleration and pro-agility (fastest time first)
//   SWING VELOCITY  fastest swing
//   LENGTH          wingspan and standing reach
// Girls are only ranked against girls and boys against boys, as on every
// other board. Height isn't ranked.
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
import { ACCENTS, byGender, makeBoard, withLabel, type Board, type Gender, type Section } from '@/lib/leaderboardBoards'

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
  acceleration_sec: 'Accel', pro_agility_sec: 'Pro-Agility', swing_velocity_mph: 'Swing',
}

const IN_CHUNK = 100
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

  // One board per gender for a test (fastest-first tests rank by 1 / time,
  // so the bar shows how close each time is to the fastest)
  function testBoards(key: CombineMetricKey, accent: keyof typeof ACCENTS, title: string, sub: string): Board[] {
    const metric = combineMetric(key)!
    const items = testers
      .map(a => ({ ...a, v: best(a.id, key) }))
      .filter((a): a is typeof a & { v: number } => a.v != null)
    return byGender(items, a => a.gender).map(g => makeBoard({
      ...common, key: accent, title, sub: withLabel(g.label, sub), items: g.items,
      score: a => metric.better === 'lower' ? 1 / a.v : a.v,
      value: a => tvText(metric, a.v),
    }))
  }

  // Vertical = touch minus standing reach (today's reach, else last time's)
  function verticalBoards(touchKey: CombineMetricKey, title: string, sub: string): Board[] {
    const items = testers
      .map(a => ({ ...a, v: verticalFrom(best(a.id, touchKey), reachOf(a.id)) }))
      .filter((a): a is typeof a & { v: number } => a.v != null)
    return byGender(items, a => a.gender).map(g => makeBoard({
      ...common, key: 'jump', title, sub: withLabel(g.label, sub), items: g.items,
      score: a => a.v,
      value: a => `${Number.isInteger(a.v) ? a.v : a.v.toFixed(1)}"`,
    }))
  }

  // ── Combine score (athleticism score with today's numbers in) ──
  const pool = testers.length ? await latestMeasurementPool(db) : new Map<string, MeasurementRow>()
  const population = buildPopulationStats([...pool.values()].map(athleticismInputs))
  const scored = testers
    .map(a => ({ ...a, score: calculateAthleticismScore(athleticismInputs(pool.get(a.id)), population).score }))
    .filter((a): a is typeof a & { score: number } => a.score != null)
  const scoreBoards = byGender(scored, a => a.gender).map(g => makeBoard({
    ...common, key: 'vpi', title: 'Combine Score', sub: withLabel(g.label, 'Athleticism score, ~400 = club average'),
    items: g.items, score: a => a.score, value: a => String(Math.round(a.score)),
  }))

  const sections: Section[] = [
    { page: 'COMBINE SCORE', boards: scoreBoards },
    { page: 'APPROACH JUMP', boards: [
      ...verticalBoards('approach_vertical_in', 'Max Vertical', 'Approach touch minus reach'),
      ...testBoards('approach_vertical_in', 'jump', 'Approach Touch', 'Highest touch today'),
    ] },
    { page: 'BLOCK JUMP', boards: [
      ...verticalBoards('standing_vertical_in', 'Standing Vertical', 'Block touch minus reach'),
      ...testBoards('standing_vertical_in', 'jump', 'Block Touch', 'Highest touch today'),
    ] },
    { page: 'SPEED', boards: [
      ...testBoards('acceleration_sec', 'sprint', 'Acceleration', '5 yards, fastest time'),
      ...testBoards('pro_agility_sec', 'sprint', 'Pro-Agility', '5-10-5, fastest time'),
    ] },
    { page: 'SWING VELOCITY', boards: testBoards('swing_velocity_mph', 'swing', 'Swing Velocity', 'Fastest arm swing') },
    { page: 'LENGTH', boards: [
      ...testBoards('wingspan_in', 'length', 'Wingspan', 'Fingertip to fingertip'),
      ...testBoards('standing_reach_in', 'length', 'Standing Reach', 'Flat-footed, one hand'),
    ] },
  ]

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
