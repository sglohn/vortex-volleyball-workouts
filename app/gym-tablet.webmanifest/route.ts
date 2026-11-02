// FILE: app/gym-tablet.webmanifest/route.ts
//
// The "Gym Tablet" app: the home-screen app for the tablet that stays in the
// gym. Installing from any Team Mode page (/team/...) gives an app that
// always opens /team/today (today's scheduled teams, app/team/[teamId]),
// full screen with no address bar.
//
// It has its own id, so it installs separately from the regular app
// (app/manifest.ts), which players add on their phones and which opens the
// sign-in screen. app/team/layout.tsx points Team Mode pages here.

import { NextResponse } from 'next/server'
import { BRAND } from '@/lib/brand'

export const dynamic = 'force-static'

export function GET() {
  const manifest = {
    id: '/team/today',
    name: `${BRAND.appTitle} Gym Tablet`,
    short_name: 'Gym Tablet',
    description: 'Team Mode for the gym tablet: today\'s teams check in and log their work here.',
    start_url: '/team/today',
    scope: '/team/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: BRAND.themeColor,
    icons: BRAND.icons
      ? [
          { src: BRAND.icons.icon192, sizes: '192x192', type: 'image/png' },
          { src: BRAND.icons.icon512, sizes: '512x512', type: 'image/png' },
          { src: BRAND.icons.maskable ?? BRAND.icons.icon512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ]
      : [],
  }
  return new NextResponse(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=300' },
  })
}
