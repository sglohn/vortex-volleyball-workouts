// FILE: lib/clubTime.ts
//
// Club-local date helpers.
//
// Vercel runs API routes in UTC. Using `new Date().toISOString()` or
// `date.getDate()` on the server gives the UTC date, which rolls over to
// "tomorrow" at 8 PM Eastern (7 PM in winter). These helpers always work in
// the club's timezone, no matter where the server runs.

export const CLUB_TIMEZONE = 'America/New_York'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Today's date (or the date of `at`) in the club's timezone, as YYYY-MM-DD. */
export function clubDateString(at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** True if the string looks like YYYY-MM-DD. */
export function isDateString(value: string | null | undefined): value is string {
  return !!value && DATE_RE.test(value)
}

/** Milliseconds the club timezone is offset from UTC at a given instant (negative for US zones). */
function clubOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLUB_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}

/**
 * The UTC instants where a club-local day starts and ends.
 * Use as: .gte('checked_in_at', start).lt('checked_in_at', end)
 */
export function clubDayBounds(date: string): { start: string; end: string } {
  const [y, m, d] = date.split('-').map(Number)
  const startGuess = Date.UTC(y, m - 1, d)
  const endGuess = Date.UTC(y, m - 1, d + 1)
  const start = new Date(startGuess - clubOffsetMs(new Date(startGuess)))
  const end = new Date(endGuess - clubOffsetMs(new Date(endGuess)))
  return { start: start.toISOString(), end: end.toISOString() }
}

/** The club-local date (YYYY-MM-DD) a stored timestamp falls on. */
export function clubDateOf(timestamp: string): string {
  return clubDateString(new Date(timestamp))
}
