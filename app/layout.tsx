// FILE: app/layout.tsx
//
// Root layout. Title, icons and colors come from the brand (lib/brand.ts).
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { BRAND, brandCss } from '@/lib/brand'

export const metadata: Metadata = {
  title: BRAND.appTitle,
  description: BRAND.description,
  applicationName: BRAND.appTitle,
  appleWebApp: { capable: true, title: BRAND.shortTitle, statusBarStyle: 'black' },
  ...(BRAND.icons
    ? { icons: { icon: BRAND.icons.favicon, apple: BRAND.icons.apple } }
    : {}),
}

export const viewport: Viewport = {
  themeColor: BRAND.themeColor,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const css = brandCss()
  return (
    <html lang="en">
      <head>
        {/* Must be null (not an empty string) when there's no brand CSS:
            a stray text node in <head> breaks hydration and drops the
            stylesheet on the Vortex site. */}
        {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      </head>
      <body>{children}</body>
    </html>
  )
}
