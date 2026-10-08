// FILE: app/manifest.ts
//
// Lets players "Add to Home Screen" so the site opens like an app.
// Name, colors and icons come from the brand (lib/brand.ts).
import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

export default function manifest(): MetadataRoute.Manifest {
  return {
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
}
