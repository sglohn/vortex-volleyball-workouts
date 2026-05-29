import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getBestOneRepMax, recommendWeightForPhase } from '@/lib/fitness'
import { PhaseType } from '@/lib/types'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  const templateId = req.nextUrl.searchParams.get('templateId')

  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

  const db = createServerClient()
  const today = new Date().toISOString().split('T')[0]

  // Get session
  const { data: session } = await db
    .from('sessions')
    .select('id, player_id, team_id')
    .eq('id', sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Get current training phase for player's team
  let phase = null
  if (session.team_id) {
    const { data: phases } = await db
      .from('training_phases')
      .select('*')
      .eq('team_id', session.team_id)
      .lte('starts_on', today)
      .gte('ends_on', today)
      .order('created_at', { ascending: false })
      .limit(1)
    phase = phases?.[0] ?? null
  }

  const phaseType: PhaseType = (phase?.phase_type as PhaseType) ?? 'general'

  // Get exercises to skip/replace for this player
  const { data: skips } = await db
    .from('player_exercise_skips')
    .select('exercise_id, replacement_exercise_id, skip_type')
    .eq('player_id', session.player_id)
    .eq('is_active', true)
    .or(`ends_on.is.null,ends_on.gte.${today}`)

  const skippedIds = new Set(skips?.map(s => s.exercise_id) ?? [])
  const replacements = Object.fromEntries(
    (skips ?? [])
      .filter(s => s.replacement_exercise_id)
      .map(s => [s.exercise_id, s.replacement_exercise_id])
  )

  // ----- Try new template system first -----
  const resolvedTemplateId = templateId

  if (resolvedTemplateId) {
    const { data: template } = await db
      .from('workout_templates')
      .select('id, name, description, warmup_notes, phase_type')
      .eq('id', resolvedTemplateId)
      .single()

    if (template) {
      const { data: blocks } = await db
        .from('template_blocks')
        .select('id, block_label, sets, sort_order')
        .eq('template_id', template.id)
        .order('sort_order')

      const enrichedBlocks = await Promise.all((blocks ?? []).map(async (block) => {
        const { data: blockExercises } = await db
          .from('template_block_exercises')
          .select('id, exercise_id, custom_reps, custom_notes, sort_order')
          .eq('block_id', block.id)
          .order('sort_order')

        const exercises = await Promise.all((blockExercises ?? []).map(async (be) => {
          const { data: ex } = await db
            .from('exercise_library')
            .select('*')
            .eq('id', be.exercise_id)
            .single()

          if (!ex) return null

          // Check if this exercise is skipped and has a replacement
          const replacementId = replacements[ex.id]
          const skipped = skippedIds.has(ex.id) && !replacementId

          // Use replacement exercise if one is set
          let activeEx = ex
          let isReplaced = false
          if (replacementId) {
            const { data: repEx } = await db
              .from('exercise_library')
              .select('*')
              .eq('id', replacementId)
              .single()
            if (repEx) { activeEx = repEx; isReplaced = true }
          }

          // Get today's set logs
          const { data: todayLogs } = await db
            .from('set_logs')
            .select('*')
            .eq('session_id', sessionId)
            .eq('exercise_id', activeEx.id)

          // Get historical best for 1RM
          let recommendation = null
          if (activeEx.logs_weight) {
            const { data: playerSessions } = await db
              .from('sessions')
              .select('id')
              .eq('player_id', session.player_id)

            const { data: allLogs } = await db
              .from('set_logs')
              .select('weight_lbs, reps_completed')
              .eq('exercise_id', activeEx.id)
              .in('session_id', playerSessions?.map(s => s.id) ?? ['none'])
              .eq('completed', true)

            const best1RM = getBestOneRepMax(allLogs ?? [])
            recommendation = recommendWeightForPhase(best1RM, be.custom_reps ?? activeEx.default_reps ?? '8', phaseType)
            recommendation = { ...recommendation, best1RM }
          }

          const setLogs = Array.from({ length: block.sets }, (_, i) => {
            const found = todayLogs?.find(l => l.set_number === i + 1)
            return found ?? { set_number: i + 1, completed: false }
          })

          return {
            ...activeEx,
            blockExerciseId: be.id,
            customReps: be.custom_reps,
            customNotes: be.custom_notes,
            skipped,
            isReplaced,
            originalExerciseName: isReplaced ? ex.name : undefined,
            setLogs,
            recommendation,
          }
        }))

        return {
          ...block,
          exercises: exercises.filter(Boolean),
        }
      }))

      return NextResponse.json({
        source: 'template',
        template: { ...template, blocks: enrichedBlocks },
        phase,
        phaseType,
        skippedExerciseIds: [...skippedIds],
      })
    }
  }

  // ----- Fallback: legacy workout system -----
  const { data: workout } = await db
    .from('workouts')
    .select('id, title, description')
    .eq('is_active', true)
    .single()

  if (!workout) return NextResponse.json({ workout: null, source: 'none' })

  const { data: exercises } = await db
    .from('exercises')
    .select('*')
    .eq('workout_id', workout.id)
    .order('sort_order')

  const enriched = await Promise.all((exercises ?? []).map(async (ex) => {
    const { data: todayLogs } = await db
      .from('set_logs')
      .select('*')
      .eq('session_id', sessionId)
      .eq('exercise_id', ex.id)

    const setLogs = Array.from({ length: ex.sets }, (_, i) => {
      const found = todayLogs?.find((l: { set_number: number }) => l.set_number === i + 1)
      return found ?? { set_number: i + 1, completed: false }
    })

    return { ...ex, setLogs, estimatedOneRepMax: 0, recommendation: null }
  }))

  return NextResponse.json({
    source: 'legacy',
    workout: { ...workout, exercises: enriched },
    phase,
    phaseType,
  })
}
