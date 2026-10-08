// FILE: lib/brand.ts
//
// Which club this deployment is. One setting per Vercel project:
//
//   NEXT_PUBLIC_BRAND=lacrosse   → Bruisers Lacrosse (GPS girls' lacrosse)
//   NEXT_PUBLIC_BRAND=vortex     → Vortex Volleyball (also used when not set;
//                                   see next.config.js)
//
// The brand decides the names, logos, colors and sport. The sport decides
// which volleyball-only features are hidden (see lib/features.ts).
//
// NEXT_PUBLIC_ values are written into the app when Vercel builds it, so
// after changing NEXT_PUBLIC_BRAND you must redeploy. Only the chosen
// brand ends up in the built site.

export type Sport = 'volleyball' | 'lacrosse'

export interface Brand {
  sport: Sport
  /** Big wordmark in headers and sign-in screens */
  name: string
  /** Browser tab / home-screen name */
  appTitle: string
  /** Short home-screen label (12 characters or fewer looks best) */
  shortTitle: string
  description: string
  /** Line under the name on sign-in screens */
  tagline: string
  /** Round logo shown in headers. null = the lightning-bolt circle. */
  markSrc: string | null
  /** Home-screen and browser icons. null = none.
   *  maskable: Android version with extra margin (it gets cropped to a circle);
   *  falls back to icon512 when not set. */
  icons: { favicon: string; apple: string; icon192: string; icon512: string; maskable?: string } | null
  /** Phone status-bar / home-screen color */
  themeColor: string
  /** CSS variable overrides for app/globals.css. null = keep globals.css as is. */
  cssVars: Record<string, string> | null
  /** Replaces the page background pattern from globals.css when set */
  bodyBackgroundImage: string | null
}

const VORTEX: Brand = {
  sport: 'volleyball',
  name: 'VORTEX',
  appTitle: 'Vortex S&C',
  shortTitle: 'Vortex S&C',
  description: 'Vortex Volleyball Strength & Conditioning',
  tagline: 'Strength & Conditioning',
  markSrc: null,
  // WORK logo (public/brand/vortex). Favicon is the swirling ball only.
  icons: {
    favicon: '/brand/vortex/favicon-32.png',
    apple: '/brand/vortex/apple-touch-icon.png',
    icon192: '/brand/vortex/icon-192.png',
    icon512: '/brand/vortex/icon-512.png',
    maskable: '/brand/vortex/icon-maskable-512.png',
  },
  themeColor: '#111827',
  cssVars: null,
  bodyBackgroundImage: null,
}

// GPS blue #4B90C1 (from the GPS seal), black and white.
// The "--yellow" variables are the accent role (used on the black bars and
// for highlight tints); here they become GPS blue and cool grays.
const LACROSSE: Brand = {
  sport: 'lacrosse',
  name: 'BRUISERS LACROSSE',
  appTitle: 'Bruisers Lacrosse',
  shortTitle: 'Bruisers',
  description: 'Bruisers Lacrosse Strength & Conditioning',
  tagline: 'Strength & Conditioning',
  markSrc: '/brand/lacrosse/mark.png',
  icons: {
    favicon: '/brand/lacrosse/favicon-32.png',
    apple: '/brand/lacrosse/apple-touch-icon.png',
    icon192: '/brand/lacrosse/icon-192.png',
    icon512: '/brand/lacrosse/icon-512.png',
  },
  themeColor: '#111827',
  cssVars: {
    '--yellow': '#4b90c1',
    '--yellow-light': '#f3f6f9',
    '--yellow-mid': '#e8edf2',
    '--yellow-border': '#cfd9e3',
    '--carolina': '#4b90c1',
    '--carolina-dark': '#3c739a',
    '--carolina-deep': '#29506d',
    '--carolina-light': '#eaf2f9',
    '--carolina-border': '#a9cbe3',
  },
  bodyBackgroundImage:
    'radial-gradient(ellipse at 10% 0%, rgba(75,144,193,0.14) 0%, transparent 55%), ' +
    'radial-gradient(ellipse at 90% 100%, rgba(17,24,39,0.06) 0%, transparent 50%)',
}

export const BRAND: Brand = process.env.NEXT_PUBLIC_BRAND === 'lacrosse' ? LACROSSE : VORTEX

/** CSS that applies the brand's colors. Empty string for Vortex. */
export function brandCss(): string {
  const parts: string[] = []
  if (BRAND.cssVars) {
    parts.push(`:root{${Object.entries(BRAND.cssVars).map(([k, v]) => `${k}:${v}`).join(';')}}`)
  }
  if (BRAND.bodyBackgroundImage) {
    parts.push(`body{background-image:${BRAND.bodyBackgroundImage}}`)
  }
  return parts.join('\n')
}
