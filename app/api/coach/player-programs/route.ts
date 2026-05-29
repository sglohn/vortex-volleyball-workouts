import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { PHASE_CONFIG, PhaseType } from '@/lib/types'

export async function GET(req: NextRequest) {
  const playerId  = req.nextUrl.searchParams.get('playerId')
  const programId = req.nextUrl.searchParams.get('programId')
  const db = createServerClient()

  if (programId) {
    const { data } = await db.from('player_programs').select('*').eq('id', programId).single()
    return NextResponse.json({ program: data })
  }

  if (playerId) {
    const { data } = await db.from('player_programs').select('*').eq('player_id', playerId).order('created_at', { ascending: false })
    return NextResponse.json({ programs: data ?? [] })
  }

  // All active programs with player info
  const { data } = await db
    .from('player_programs')
    .select('*, players(id, name, jersey_number)')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  return NextResponse.json({ programs: data ?? [] })
}

// Compute what phase a program is in based on weeks elapsed
function getCurrentPhase(program: {
  started_on: string
  periodization_mode: string
  phase_cycle: Array<{ phase: string; weeks: number }>
  manual_phases: Array<{ phase: string; from: string; to: string }>
}): PhaseType {
  const today = new Date()

  if (program.periodization_mode === 'manual' && program.manual_phases?.length) {
    const todayStr = today.toISOString().split('T')[0]
    const match = program.manual_phases.find((p: { phase: string; from: string; to: string }) =>
      p.from <= todayStr && p.to >= todayStr
    )
    if (match) return match.phase as PhaseType
  }

  // Auto mode: cycle through phases by week
  const startDate = new Date(program.started_on)
  const weeksElapsed = Math.floor((today.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
  const cycle = program.phase_cycle ?? [
    { phase: 'build', weeks: 4 },
    { phase: 'pre_tournament', weeks: 2 },
    { phase: 'recovery', weeks: 1 },
  ]
  const totalWeeks = cycle.reduce((sum: number, p: { weeks: number }) => sum + p.weeks, 0)
  const weekInCycle = weeksElapsed % totalWeeks
  let cumulative = 0
  for (const p of cycle) {
    cumulative += p.weeks
    if (weekInCycle < cumulative) return p.phase as PhaseType
  }
  return 'general'
}

// Compute which template a player should do today based on session count
async function getCurrentTemplate(program: {
  template_sequence: string[]
  player_id: string
  started_on: string
}, db: ReturnType<typeof createServerClient>): Promise<string | null> {
  const sequence = program.template_sequence as string[]
  if (!sequence.length) return null

  // Count completed sessions since program started
  const { count } = await db
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('player_id', program.player_id)
    .gte('checked_in_at', program.started_on)

  const sessionIndex = (count ?? 0) % sequence.length
  return sequence[sessionIndex] ?? null
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = createServerClient()
  const { playerId, name, templateSequence, periodizationMode, phaseCycle, manualPhases, startedOn, notes } = body

  const { data, error } = await db
    .from('player_programs')
    .insert({
      player_id: playerId,
      name,
      template_sequence: templateSequence,
      periodization_mode: periodizationMode ?? 'auto',
      phase_cycle: phaseCycle ?? [
        { phase: 'build', weeks: 4 },
        { phase: 'pre_tournament', weeks: 2 },
        { phase: 'recovery', weeks: 1 },
      ],
      manual_phases: manualPhases ?? [],
      started_on: startedOn ?? new Date().toISOString().split('T')[0],
      notes,
      is_active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ program: data })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const db = createServerClient()
  const { id, ...updates } = body

  // Convert camelCase to snake_case for DB
  const dbUpdates: Record<string, unknown> = {}
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive
  if (updates.endedOn !== undefined) dbUpdates.ended_on = updates.endedOn
  if (updates.name !== undefined) dbUpdates.name = updates.name
  if (updates.phaseCycle !== undefined) dbUpdates.phase_cycle = updates.phaseCycle
  if (updates.manualPhases !== undefined) dbUpdates.manual_phases = updates.manualPhases
  if (updates.templateSequence !== undefined) dbUpdates.template_sequence = updates.templateSequence
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes
  dbUpdates.updated_at = new Date().toISOString()

  const { data, error } = await db
    .from('player_programs')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ program: data })
}

// Helper endpoint: what should this player do today?
export async function PUT(req: NextRequest) {
  const { programId } = await req.json()
  const db = createServerClient()

  const { data: program } = await db.from('player_programs').select('*').eq('id', programId).single()
  if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })

  const phase = getCurrentPhase(program)
  const templateId = await getCurrentTemplate(program, db)
  const phaseConfig = PHASE_CONFIG[phase]

  return NextResponse.json({ phase, phaseConfig, templateId, programId })
}
