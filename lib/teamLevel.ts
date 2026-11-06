// FILE: lib/teamLevel.ts
//
// Team level (teams.level, migration 2026-11-06_team_level.sql). Set on
// Coach → Teams → Edit; used to group players on Comparisons → Groups.

export type TeamLevel = 'national' | 'regional' | 'local'

export const TEAM_LEVELS: { key: TeamLevel; label: string }[] = [
  { key: 'national', label: 'National' },
  { key: 'regional', label: 'Regional' },
  { key: 'local',    label: 'Local' },
]

export function teamLevelLabel(level: string | null | undefined): string | null {
  return TEAM_LEVELS.find(l => l.key === level)?.label ?? null
}

/** Anything else (blank, typo) → null, so the database check never fails */
export function cleanTeamLevel(v: unknown): TeamLevel | null {
  return TEAM_LEVELS.some(l => l.key === v) ? (v as TeamLevel) : null
}
