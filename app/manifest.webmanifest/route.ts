// FILE: app/manifest.webmanifest/route.ts
//
// The regular app manifest: lets players "Add to Home Screen" so the site
// opens like an app, starting at sign-in. Name, colors and icons come from
// the brand (lib/brand.ts).
//
// Served as a route (it used to be app/manifest.ts, same address) and linked
// from app/layout.tsx metadata, so Team Mode pages can point to the Gym
// Tablet manifest instead (app/team/layout.tsx, app/gym-tablet.webmanifest).
// A manifest.ts file would override that on every page.

import { NextResponse } from 'next/server'
import { BRAND } from '@/lib/brand'

export const dynamic = 'force-static'

export function GET() {
  const manifest = {
    name: BRAND.appTitle,
    short_name: BRAND.shortTitle,
    description: BRAND.description,
    start_url: '/',
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
