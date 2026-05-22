import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const db = createServerClient()
  const { data: players, error } = await db
    .from('players')
    .select('id, name, jersey_number')
    .eq('is_active', true)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ players })
}
