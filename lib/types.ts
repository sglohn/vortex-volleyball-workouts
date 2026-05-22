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

export interface Workout {
  id: string
  title: string
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Exercise {
  id: string
  workout_id: string
  name: string
  sort_order: number
  sets: number
  reps: number
  rest_seconds?: number
  notes?: string
}

export interface Session {
  id: string
  player_id: string
  workout_id?: string
  checked_in_at: string
  completed_at?: string
  notes?: string
}

export interface SetLog {
  id: string
  session_id: string
  exercise_id: string
  set_number: number
  reps_completed?: number
  weight_lbs?: number
  completed: boolean
  logged_at: string
}

// Extended types used in the UI
export interface ExerciseWithSets extends Exercise {
  setLogs: SetLog[]
  estimatedOneRepMax: number
  recommendation?: { weight: number; percent: number; label: string }
}

export interface PlayerWithLatestMeasurements extends Player {
  latestMeasurement?: Measurement
}

export interface SessionWithDetails extends Session {
  player?: Player
  workout?: Workout
  setCount?: number
  completedSets?: number
}
