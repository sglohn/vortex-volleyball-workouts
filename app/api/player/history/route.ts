// FILE: app/api/player/history/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { canAccessPlayer, signInAgain } from '@/lib/playerAuth'
import { asGeneratedWorkout } from '@/lib/fullBodyWorkout'

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  if (!playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })
  if (!(await canAccessPlayer(req, playerId))) return signInAgain()

  const db = createServerClient()

  const { data: sessions } = await db
    .from('sessions')
    .select('*')   // '*' so this works before sessions.generated_workout exists
    .eq('player_id', playerId)
    .order('checked_in_at', { ascending: false })

  if (!sessions?.length) return NextResponse.json({ sessions: [] })

  const enriched = await Promise.all(sessions.map(async s => {
    const { count: totalSets } = await db.from('set_logs').select('*', { count: 'exact', head: true }).eq('session_id', s.id)
    const { count: completedSets } = await db.from('set_logs').select('*', { count: 'exact', head: true }).eq('session_id', s.id).eq('completed', true)

    let workoutName = 'Workout'
    const generated = asGeneratedWorkout(s.generated_workout)
    if (generated) {
      // Self-guided full-body workout (lib/fullBodyWorkout.ts)
      workoutName = generated.name
    } else if (s.team_id) {
      const date = s.checked_in_at.split('T')[0]
      const { data: schedule } = await db.from('team_schedule').select('workout_templates(name)').eq('team_id', s.team_id).eq('scheduled_date', date).single()
      if (schedule?.workout_templates) workoutName = (schedule.workout_templates as unknown as { name: string }).name
    }

    const { data: logs } = await db.from('set_logs').select('exercise_id, weight_lbs, reps_completed').eq('session_id', s.id).eq('completed', true)
    const exerciseIds = [...new Set((logs ?? []).map(l => l.exercise_id))]
    let exerciseNames: Record<string, string> = {}
    if (exerciseIds.length) {
      const { data: libEx } = await db.from('exercise_library').select('id, name').in('id', exerciseIds)
      const { data: legEx } = await db.from('exercises').select('id, name').in('id', exerciseIds)
      for (const e of [...(libEx ?? []), ...(legEx ?? [])]) exerciseNames[e.id] = e.name
    }

    const exerciseMap: Record<string, { name: string; bestWeight?: number; reps?: number }> = {}
    for (const log of (logs ?? [])) {
      if (!exerciseMap[log.exercise_id]) exerciseMap[log.exercise_id] = { name: exerciseNames[log.exercise_id] ?? 'Exercise' }
      if (log.weight_lbs && (!exerciseMap[log.exercise_id].bestWeight || log.weight_lbs > exerciseMap[log.exercise_id].bestWeight!)) {
        exerciseMap[log.exercise_id].bestWeight = log.weight_lbs
        exerciseMap[log.exercise_id].reps = log.reps_completed
      }
    }

    const duration = s.completed_at ? Math.round((new Date(s.completed_at).getTime() - new Date(s.checked_in_at).getTime()) / 60000) : null

    return { id: s.id, checkedInAt: s.checked_in_at, completedAt: s.completed_at, workoutName, totalSets: totalSets ?? 0, completedSets: completedSets ?? 0, duration, exercises: Object.values(exerciseMap) }
  }))

  return NextResponse.json({ sessions: enriched })
}
