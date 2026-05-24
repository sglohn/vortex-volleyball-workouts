import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { sessionId, playerId, regions } = await req.json()
  if (!sessionId || !playerId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = createServerClient()

  // Save body check
  await db.from('body_checks').insert({ session_id: sessionId, player_id: playerId, regions })

  // Auto-create health reports for any red (injured) regions
  const injuredRegions = Object.entries(regions as Record<string, string>)
    .filter(([, status]) => status === 'injured')
    .map(([region]) => region.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))

  const soreRegions = Object.entries(regions as Record<string, string>)
    .filter(([, status]) => status === 'sore')
    .map(([region]) => region.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))

  for (const bodyPart of injuredRegions) {
    await db.from('health_reports').insert({
      player_id: playerId, report_type: 'major_injury', body_part: bodyPart,
      reported_by: 'player', status: 'active', confirmed_by_coach: false,
      description: 'Reported via pre-workout body check',
    })
  }

  for (const bodyPart of soreRegions) {
    await db.from('health_reports').insert({
      player_id: playerId, report_type: 'nagging_pain', body_part: bodyPart,
      reported_by: 'player', status: 'active', confirmed_by_coach: false,
      description: 'Reported via pre-workout body check',
    })
  }

  return NextResponse.json({ ok: true, injuredCount: injuredRegions.length, soreCount: soreRegions.length })
}

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '10')
  if (!playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })

  const db = createServerClient()
  const { data: checks } = await db
    .from('body_checks')
    .select('*')
    .eq('player_id', playerId)
    .order('checked_at', { ascending: false })
    .limit(limit)

  return NextResponse.json({ checks: checks ?? [] })
}
