'use client'
// FILE: app/player/bodycheck/page.tsx
//
// Body check on the player's phone, after she taps "Begin today's workout"
// on her home page (volleyball) or right after sign-in (lacrosse). The screen itself
// is components/BodyCheck.tsx (Team Mode uses the same one).
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { playerFetch } from '@/lib/playerPass'
import BodyCheck from '@/components/BodyCheck'

export default function BodyCheckPage() {
  const router = useRouter()
  const [signIn, setSignIn] = useState<{ sessionId: string; playerId: string; playerName: string } | null>(null)

  useEffect(() => {
    const s = localStorage.getItem('vx_session')
    if (!s) { router.push('/'); return }
    const parsed = JSON.parse(s)
    // Signed in but no workout begun yet: the body check comes after Begin on Home
    if (!parsed.sessionId) { router.replace('/player'); return }
    setSignIn({ sessionId: parsed.sessionId, playerId: parsed.playerId, playerName: parsed.playerName ?? '' })
  }, [router])

  if (!signIn) return null

  return (
    <BodyCheck
      playerName={signIn.playerName}
      onSend={async (quickStatus, regions, note) => {
        await playerFetch('/api/player/bodycheck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: signIn.sessionId, playerId: signIn.playerId, quickStatus, regions, note }),
        })
      }}
      onDone={() => router.push('/player/workout')} />
  )
}
