'use client'
// FILE: app/player/bodycheck/page.tsx
//
// Body check on the player's phone, right after sign-in. The screen itself
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
    setSignIn({ sessionId: parsed.sessionId, playerId: parsed.playerId, playerName: parsed.playerName ?? '' })
  }, [router])

  if (!signIn) return null

  return (
    <BodyCheck
      playerName={signIn.playerName}
      onSend={async (quickStatus, regions) => {
        await playerFetch('/api/player/bodycheck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: signIn.sessionId, playerId: signIn.playerId, quickStatus, regions }),
        })
      }}
      onDone={() => router.push('/player/workout')} />
  )
}
