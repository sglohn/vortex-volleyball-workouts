// FILE: app/api/workout/route.ts
//
// The workout a player sees for a session.
//
// Sources, in order:
//   1. templateId passed in      → coach template (team schedule, override, program)
//   2. session.generated_workout → self-guided full-body workout (lib/fullBodyWorkout.ts)
//      Each exercise also gets `swap`, so the player page can offer an
//      easier option before any set of it is logged.
//   3. legacy active workout
//
// Templates and generated workouts come back in the same shape
// (source: 'template'), so the player page, kiosk and session pages show
// and log them the same way.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getPlayerRecommendation } from '@/lib/suggestions'
import { PhaseType } from '@/lib/types'
import { canAccessSession, signInAgain } from '@/lib/playerAuth'
import { asGeneratedWorkout, slotId } from '@/lib/fullBodyWorkout'

type Db = ReturnType<typeof createServerClient>

interface ExerciseContext {
  db: Db
  sessionId: string
  playerId: string
  phaseType: PhaseType
  skippedIds: Set<string>
  replacements: Record<string, string>
}

interface BlockExerciseInput {
  blockExerciseId: string
  exerciseId: string
  customReps: string | null
  customNotes: string | null
  targetVelocityMin: number | null
  targetVelocityMax: number | null
}

// One exercise in a block: skips/replacements, today's logs and the weight suggestion
async function buildExercise(ctx: ExerciseContext, be: BlockExerciseInput, blockSets: number) {
  const { db, sessionId } = ctx
  const { data: ex } = await db
    .from('exercise_library')
    .select('*')
    .eq('id', be.exerciseId)
    .single()

  if (!ex) return null

  // Check if this exercise is skipped and has a replacement
  const replacementId = ctx.replacements[ex.id]
  const skipped = ctx.skippedIds.has(ex.id) && !replacementId

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

  // Suggested weight — see lib/suggestions.ts for the rules.
  // Uses today's session so speed-target exercises can adjust
  // from the player's last set.
  let recommendation = null
  if (activeEx.logs_weight) {
    recommendation = await getPlayerRecommendation(db, {
      playerId: ctx.playerId,
      exerciseId: activeEx.id,
      targetReps: be.customReps ?? activeEx.default_reps ?? '8',
      phaseType: ctx.phaseType,
      sessionId,
      targetVelocityMin: be.targetVelocityMin,
      targetVelocityMax: be.targetVelocityMax,
    })
  }

  const setLogs = Array.from({ length: blockSets }, (_, i) => {
    const found = todayLogs?.find(l => l.set_number === i + 1)
    return found ?? { set_number: i + 1, completed: false }
  })

  return {
    ...activeEx,
    blockExerciseId: be.blockExerciseId,
    customReps: be.customReps,
    customNotes: be.customNotes,
    targetVelocityMin: be.targetVelocityMin ?? null,
    targetVelocityMax: be.targetVelocityMax ?? null,
    skipped,
    isReplaced,
    originalExerciseName: isReplaced ? ex.name : undefined,
    setLogs,
    recommendation,
  }
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  const templateId = req.nextUrl.searchParams.get('templateId')

  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  if (!(await canAccessSession(req, sessionId))) return signInAgain()

  const db = createServerClient()
  const today = new Date().toISOString().split('T')[0]

  // Get session (select '*' so this works before the generated_workout column exists)
  const { data: session } = await db
    .from('sessions')
    .select('*')
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

  const skippedIds = new Set<string>(skips?.map(s => s.exercise_id) ?? [])
  const replacements: Record<string, string> = Object.fromEntries(
    (skips ?? [])
      .filter(s => s.replacement_exercise_id)
      .map(s => [s.exercise_id, s.replacement_exercise_id])
  )

  const ctx: ExerciseContext = { db, sessionId, playerId: session.player_id, phaseType, skippedIds, replacements }

  // ----- 1. Coach template -----
  if (templateId) {
    const { data: template } = await db
      .from('workout_templates')
      .select('id, name, description, warmup_notes, phase_type')
      .eq('id', templateId)
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
          .select('id, exercise_id, custom_reps, custom_notes, sort_order, target_velocity_min, target_velocity_max')
          .eq('block_id', block.id)
          .order('sort_order')

        const exercises = await Promise.all((blockExercises ?? []).map(be => buildExercise(ctx, {
          blockExerciseId: be.id,
          exerciseId: be.exercise_id,
          customReps: be.custom_reps,
          customNotes: be.custom_notes,
          targetVelocityMin: be.target_velocity_min,
          targetVelocityMax: be.target_velocity_max,
        }, block.sets)))

        return { ...block, exercises: exercises.filter(Boolean) }
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

  // ----- 2. Self-guided full-body workout saved on the session -----
  const generated = asGeneratedWorkout(session.generated_workout)
  if (generated) {
    const blocks = await Promise.all(generated.blocks.map(async (block, bi) => {
      const exercises = await Promise.all(block.exercises.map(async (ge, ei) => {
        const built = await buildExercise(ctx, {
          blockExerciseId: slotId(bi, ei),
          exerciseId: ge.exerciseId,
          customReps: ge.reps ?? null,
          customNotes: ge.swappedFromName
            ? `Easier option in place of ${ge.swappedFromName}. Go lighter and keep it in a pain-free range.`
            : null,
          targetVelocityMin: null,
          targetVelocityMax: null,
        }, block.sets)
        if (!built) return null
        const anyLogged = built.setLogs.some((l: { completed?: boolean }) => l.completed)
        return {
          ...built,
          swap: {
            available: !anyLogged,           // can only swap before logging a set
            role: ge.role ?? null,           // 'main' | 'secondary'
            swappedFromName: ge.swappedFromName ?? null,
          },
        }
      }))

      return {
        id: `gen-${block.label}`,
        block_label: block.label,
        title: block.title ?? null,
        sets: block.sets,
        sort_order: bi,
        exercises: exercises.filter(Boolean),
      }
    }))

    return NextResponse.json({
      source: 'template',
      generated: true,
      template: {
        id: `generated-${sessionId}`,
        name: generated.name,
        description: generated.description,
        warmup_notes: generated.warmupNotes,
        phase_type: null,
        blocks: blocks.filter(b => b.exercises.length > 0),
      },
      phase,
      phaseType,
      skippedExerciseIds: [...skippedIds],
    })
  }

  // ----- 3. Fallback: legacy workout system -----
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
