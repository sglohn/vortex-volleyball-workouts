// FILE: components/BrandMark.tsx
//
// The club's round logo for headers and sign-in screens.
// Uses the brand's logo image when it has one (lib/brand.ts); otherwise
// the original lightning-bolt circle.
//
//   tone="accent"  bolt circle in the accent color (for black bars)
//   tone="dark"    black bolt circle (for light pages)
import { BRAND } from '@/lib/brand'

export default function BrandMark({ size, tone = 'accent' }: { size: number | string; tone?: 'accent' | 'dark' }) {
  if (BRAND.markSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={BRAND.markSrc} alt={BRAND.appTitle} width={typeof size === 'number' ? size : undefined}
        style={{ width: size, height: size, borderRadius: '50%', display: 'block', flexShrink: 0, objectFit: 'cover', background: '#fff' }} />
    )
  }
  const bg = tone === 'accent' ? 'var(--yellow)' : 'var(--black)'
  const fg = tone === 'accent' ? 'var(--black)' : 'var(--yellow)'
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
    </div>
  )
}
