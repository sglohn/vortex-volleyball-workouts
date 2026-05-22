import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { pin } = await req.json()
  const correctPin = process.env.COACH_PIN ?? '1234'
  if (pin === correctPin) return NextResponse.json({ ok: true })
  return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
}
