// FILE: lib/displayTeams.ts
//
// The teams the Roku TV Display app flips through with Left/Right:
// only teams with a workout scheduled today (club-local date), in the same
// order as the TV Display page's team pills (by age group, Open Gym last).
// If no team has a workout today, every active team is returned instead so
// the display can still be browsed.

import { createServerClient } from '@/lib/supabase'
import { clubDateString } from '@/lib/clubTime'

type TeamRow = { id: string; name: string; age_group: string | null; is_open_gym: boolean | null }

export type DisplayTeams = {
  date: string
  todayOnly: boolean
  teams: { id: string; name: string }[]
}

export async function displayTeamsForToday(): Promise<DisplayTeams> {
  const db = createServerClient()
  const date = clubDateString()

  const [{ data: scheduled }, { data: teams }] = await Promise.all([
    db.from('team_schedule').select('team_id, template_id').eq('scheduled_date', date),
    db.from('teams').select('id, name, age_group, is_open_gym').eq('is_active', true),
  ])

  const withWorkout = new Set(
    (scheduled ?? []).filter(s => s.template_id).map(s => s.team_id as string)
  )

  // Same order as /api/coach/teams: regular teams by age group, Open Gym last
  const ordered = ((teams ?? []) as TeamRow[]).sort((a, b) => {
    if (a.is_open_gym && !b.is_open_gym) return 1
    if (!a.is_open_gym && b.is_open_gym) return -1
    return (a.age_group ?? '').localeCompare(b.age_group ?? '')
  })

  const today = ordered.filter(t => withWorkout.has(t.id))
  const list = today.length ? today : ordered

  return {
    date,
    todayOnly: today.length > 0,
    teams: list.map(t => ({ id: t.id, name: t.name })),
  }
}
