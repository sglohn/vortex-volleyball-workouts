// FILE: app/team/layout.tsx
//
// Team Mode pages (/team/...) use the "Gym Tablet" app manifest
// (app/gym-tablet.webmanifest), so "Install" on the gym tablet makes a
// home-screen app that always opens /team/today, full screen. Every other
// page keeps the regular app (app/manifest.ts), which opens sign-in.
import type { Metadata } from 'next'

export const metadata: Metadata = {
  manifest: '/gym-tablet.webmanifest',
}

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return children
}
