// FILE: lib/setChecks.ts
//
// "Looks right" checks on Workout Logs. A coach marks a flagged set as
// checked (app/api/coach/logs/check); the set's values at that moment are
// saved with it. The check only counts while the set still has those
// values, so if the player or an admin changes the set later, the flag
// shows up again to be looked at.
//
// Columns: supabase/migrations/2026-10-30_set_log_checks.sql

export type CheckableSet = {
  weight_lbs: number | string | null
  reps_completed: number | null
  velocity_ms: number | string | null
  completed: boolean
  band?: string | null
}

function num(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : ''
}

/** The set's values as one string, e.g. "135|8||1|" */
export function setFingerprint(s: CheckableSet): string {
  return [num(s.weight_lbs), num(s.reps_completed), num(s.velocity_ms), s.completed ? '1' : '0', s.band ?? ''].join('|')
}
