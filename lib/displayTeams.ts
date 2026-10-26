// FILE: lib/displayTeams.ts
//
// The teams the Roku TV Display app flips through with Left/Right:
// only teams with a workout scheduled today (club-local date), in the same
// order as the TV Display page's team pills (by age group, Open Gym last).
// If no team has a workout today, every active team is returned instead so
// the display can still be browsed.
//
// combineToday is true when any team has a Combine Day (lib/combine.ts)
// scheduled today: the Roku TV Display app then opens the live combine
// leaderboard on its own (roku/tv-display/components/DisplayScene.brs).

import { createServerClient } from '@/lib/supabase'
import { clubDateString } from '@/lib/clubTime'
import { FEATURES } from '@/lib/features'

type TeamRow = { id: string; name: string; age_group: string | null; is_open_gym: boolean | null }

export type DisplayTeams = {
  date: string
  todayOnly: boolean
  combineToday: boolean
  teams: { id: string; name: string; combine: boolean }[]
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

  // Which of today's workouts are Combine Days ('*' so this works before the migration)
  const templateIds = [...new Set((scheduled ?? []).map(s => s.template_id as string | null).filter((id): id is string => !!id))]
  const combineTemplates = new Set<string>()
  if (FEATURES.measurements && templateIds.length) {
    const { data: tmpl } = await db.from('workout_templates').select('*').in('id', templateIds)
    for (const t of tmpl ?? []) if (t.is_combine === true) combineTemplates.add(t.id as string)
  }
  const combineTeams = new Set(
    (scheduled ?? []).filter(s => s.template_id && combineTemplates.has(s.template_id)).map(s => s.team_id as string))

  const today = ordered.filter(t => withWorkout.has(t.id))
  const list = today.length ? today : ordered

  return {
    date,
    todayOnly: today.length > 0,
    combineToday: combineTeams.size > 0,
    teams: list.map(t => ({ id: t.id, name: t.name, combine: combineTeams.has(t.id) })),
  }
}
