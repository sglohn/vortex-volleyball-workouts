// FILE: app/session/[date]/page.tsx
//
// Old multi-team session address (/session/<date>?teams=<id>,<id>).
// Multi-team sessions now run in Team Mode (app/team/[teamId]), which has
// the body check, Ask Coach, Combine Day and fixing sets, so this sends any
// saved link or tablet bookmark there. The date in the old address isn't
// needed: Team Mode always uses today's workouts.
import { redirect } from 'next/navigation'

export default async function OldSessionPage({ searchParams }: { searchParams: Promise<{ teams?: string }> }) {
  const { teams } = await searchParams
  const ids = (teams ?? '').split(',').map(s => s.trim()).filter(Boolean)
  redirect(ids.length ? `/team/${ids.join(',')}` : '/coach/teams')
}
