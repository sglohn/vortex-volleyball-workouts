import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Vortex S&C',
  description: 'Vortex Volleyball Strength & Conditioning',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
