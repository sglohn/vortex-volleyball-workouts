// ============================================================
// VORTEX STRENGTH & CONDITIONING — V2 TYPES
// ============================================================

// ---- Existing types (unchanged) ----

export interface Player {
  id: string
  name: string
  pin: string
  jersey_number?: string
  position?: string
  is_active: boolean
  created_at: string
}

export interface Measurement {
  id: string
  player_id: string
  measured_at: string
  height_in?: number
  wingspan_in?: number
  standing_reach_in?: number
  standing_vertical_in?: number
  approach_vertical_in?: number
  notes?: string
}

export interface SetLog {
  id: string
  session_id: string
  exercise_id: string
  set_number: number
  reps_completed?: number
  weight_lbs?: number
  velocity_ms?: number
  completed: boolean
  logged_at: string
}

// ---- New v2 types ----

export interface Team {
  id: string
  name: string
  age_group?: string
  color: string
  is_active: boolean
  created_at: string
}

export interface PlayerTeam {
  id: string
  player_id: string
  team_id: string
  is_primary: boolean
  joined_at: string
}

export interface ExerciseLibrary {
  id: string
  name: string
  category?: string
  default_sets: number
  default_reps?: string
  logs_weight: boolean
  logs_velocity: boolean
  coaching_notes?: string
  demo_url?: string
  demo_image_url?: string
  is_active: boolean
  created_at: string
}

export interface WorkoutTemplate {
  id: string
  name: string
  description?: string
  phase_type?: string
  warmup_notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TemplateBlock {
  id: string
  template_id: string
  block_label: string
  sets: number
  sort_order: number
}

export interface TemplateBlockExercise {
  id: string
  block_id: string
  exercise_id: string
  custom_reps?: string
  custom_notes?: string
  sort_order: number
}

export interface TrainingPhase {
  id: string
  team_id: string
  phase_type: string
  name: string
  description?: string
  intensity_target?: string
  starts_on: string
  ends_on: string
  created_at: string
}

export interface TeamSchedule {
  id: string
  team_id: string
  template_id?: string
  scheduled_date: string
  notes?: string
  created_at: string
}

export interface PlayerOverride {
  id: string
  player_id: string
  template_id?: string
  override_date: string
  reason?: string
  created_at: string
}

export interface PlayerExerciseSkip {
  id: string
  player_id: string
  exercise_id: string
  reason?: string
  starts_on: string
  ends_on?: string
  created_by: string
  is_active: boolean
  created_at: string
}

export interface HealthReport {
  id: string
  player_id: string
  report_type: 'major_injury' | 'nagging_pain'
  body_part: string
  description?: string
  pain_level?: number
  reported_at: string
  reported_by: string
  confirmed_by_coach: boolean
  coach_notes?: string
  expected_return?: string
  status: 'active' | 'monitoring' | 'resolved'
  resolved_at?: string
  created_at: string
}

export interface OvrLog {
  id: string
  player_id: string
  session_id?: string
  exercise_id?: string
  log_type: 'velocity' | 'jump'
  value: number
  weight_lbs?: number
  notes?: string
  logged_at: string
}

export interface CoachAccount {
  id: string
  name: string
  pin: string
  role: 'head' | 'assistant'
  is_active: boolean
  created_at: string
}

export interface Session {
  id: string
  player_id: string
  workout_id?: string
  template_id?: string
  team_id?: string
  checked_in_at: string
  completed_at?: string
  notes?: string
}

// ---- Composite types used in UI ----

export type PhaseType = 'build' | 'peak' | 'pre_tournament' | 'recovery' | 'general'

export const PHASE_CONFIG: Record<PhaseType, {
  label: string
  color: string
  weightMultiplier: number
  playerMessage: string
  intensityNote: string
}> = {
  build: {
    label: 'Build',
    color: '#56a0d3',
    weightMultiplier: 0.82,
    // Between tournaments: hypertrophy focus — moderate-heavy weight, higher reps
    // 0.82 multiplier puts sets in the 70–80% 1RM range, ideal for muscle building
    playerMessage: 'Build phase — this is your hypertrophy window. Moderate weight, higher reps, controlled tempo. Focus on feeling the muscle work, not just moving weight.',
    intensityNote: 'Aim for 70–80% of your best. Slow and controlled — earn every rep.',
  },
  peak: {
    label: 'Peak',
    color: '#111827',
    weightMultiplier: 0.92,
    // Maintaining peak strength — heavy but not maximal, fast movement
    playerMessage: 'Peak phase — maintain the strength you built. Keep weights heavy but move them fast. No grinding, no failing.',
    intensityNote: 'Stay at 85–92% of your best. Move it with intent.',
  },
  pre_tournament: {
    label: 'Pre-Tournament',
    color: '#d97706',
    weightMultiplier: 0.72,
    // Week before tournament: lighter load, faster movement, stay fresh
    playerMessage: 'Tournament week — protect your body and sharpen your speed. Lighter weight moved explosively. You should leave feeling better than when you came in.',
    intensityNote: 'Use 65–75% of your best. Fast and sharp — not heavy.',
  },
  recovery: {
    label: 'Recovery',
    color: '#dc2626',
    weightMultiplier: 0.55,
    // Post-tournament or deload: light, perfect movement, flush fatigue
    playerMessage: 'Recovery week — your job is to flush fatigue and move well. Light weight, perfect form, no ego. This is what keeps you healthy all season.',
    intensityNote: 'Use about 55% of your best. This is intentional and important.',
  },
  general: {
    label: 'General',
    color: '#6b7280',
    weightMultiplier: 0.80,
    playerMessage: 'Focus on quality movement and steady effort today.',
    intensityNote: 'Work at a solid, repeatable pace.',
  },
}

export interface PlayerWithTeam extends Player {
  team?: Team
  activeHealthReports?: HealthReport[]
}

export interface TemplateWithBlocks extends WorkoutTemplate {
  blocks: Array<TemplateBlock & {
    exercises: Array<TemplateBlockExercise & {
      exercise: ExerciseLibrary
    }>
  }>
}

export interface PlayerWorkoutView {
  template: TemplateWithBlocks
  phase?: TrainingPhase
  phaseConfig?: typeof PHASE_CONFIG[PhaseType]
  skippedExerciseIds: string[]
  setLogs: SetLog[]
  healthFlags: HealthReport[]
}
