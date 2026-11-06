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

// Team number within its age group (teams.club_rank, migration
// 2026-11-06_team_rank.sql): 1 = the age group's top team, from the USAV
// team code (G14VRTEX1SO → 1). Set on Coach → Teams → Edit.

export const TEAM_RANKS = [1, 2, 3, 4, 5]

/** 1 → "1 team" */
export function teamRankLabel(rank: number | null | undefined): string | null {
  return rank ? `${rank} team` : null
}

/** Anything but a whole number 1–9 → null, so the database check never fails */
export function cleanTeamRank(v: unknown): number | null {
  const n = Number(v)
  return v !== '' && v != null && Number.isInteger(n) && n >= 1 && n <= 9 ? n : null
}

/**
 * Team level and team number are for admins only: team coaches and players
 * never see them (Steve, Nov 6). Every API that returns whole team rows
 * passes them through this unless the signed-in coach is an admin.
 */
export function hideAdminTeamFields<T extends object>(team: T, isAdmin: boolean | undefined): T {
  if (isAdmin || !team) return team
  const { level: _level, club_rank: _rank, ...rest } = team as T & { level?: unknown; club_rank?: unknown }
  return rest as T
}
