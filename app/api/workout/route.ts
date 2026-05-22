import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getBestOneRepMax, recommendWeight } from '@/lib/fitness'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

  const db = createServerClient()

  // Get session + player
  const { data: session } = await db
    .from('sessions')
    .select('id, player_id, workout_id')
    .eq('id', sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Get active workout
  const { data: workout } = await db
    .from('workouts')
    .select('id, title, description')
    .eq('is_active', true)
    .single()

  if (!workout) return NextResponse.json({ workout: null })

  // Get exercises
  const { data: exercises } = await db
    .from('exercises')
    .select('*')
    .eq('workout_id', workout.id)
    .order('sort_order')

  if (!exercises) return NextResponse.json({ workout: { ...workout, exercises: [] } })

  // For each exercise, get today's set logs AND best historical 1RM
  const enriched = await Promise.all(exercises.map(async (ex) => {
    // Today's logs for this session
    const { data: todayLogs } = await db
      .from('set_logs')
      .select('*')
      .eq('session_id', sessionId)
      .eq('exercise_id', ex.id)

    // All-time best for this player (for 1RM estimate)
    const { data: allLogs } = await db
      .from('set_logs')
      .select('weight_lbs, reps_completed')
      .eq('exercise_id', ex.id)
      .in('session_id',
        (await db.from('sessions').select('id').eq('player_id', session.player_id)).data?.map(s => s.id) ?? []
      )
      .eq('completed', true)

    const estimated1RM = getBestOneRepMax(allLogs ?? [])
    const recommendation = estimated1RM > 0 ? recommendWeight(estimated1RM, ex.reps) : undefined

    // Pad set logs to match expected set count
    const setLogs = Array.from({ length: ex.sets }, (_, i) => {
      const found = todayLogs?.find(l => l.set_number === i + 1)
      return found ?? { set_number: i + 1, completed: false }
    })

    return { ...ex, setLogs, estimatedOneRepMax: estimated1RM, recommendation }
  }))

  return NextResponse.json({ workout: { ...workout, exercises: enriched } })
}
