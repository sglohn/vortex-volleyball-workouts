// FILE: components/Confetti.tsx
//
// A one-time confetti pop over the whole screen (canvas, no extra
// packages). Used when a player finishes their workout
// (app/player/workout/page.tsx).
//
//   <Confetti />          pops once when it appears
//   <Confetti key={n} />  change the key to pop again
//
// Colors come from the site's theme (--volt, --carolina), so each brand
// gets its own colors. Taps go straight through it. Players whose phone is
// set to reduce motion get a short, gentle version.
'use client'
import { useEffect, useRef } from 'react'

type Piece = {
  x: number; y: number; vx: number; vy: number
  w: number; h: number; rot: number; vr: number
  color: string; shape: 'rect' | 'circle'; wobble: number
}

function themeColors(): string[] {
  const css = getComputedStyle(document.documentElement)
  const fromTheme = ['--volt', '--carolina', '--carolina-dark']
    .map(v => css.getPropertyValue(v).trim())
    .filter(Boolean)
  return [...fromTheme, '#ffffff', '#facc15', '#f472b6']
}

export default function Confetti({ duration = 3200 }: { duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0
    const size = () => {
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W * dpr; canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    size()
    window.addEventListener('resize', size)

    const colors = themeColors()
    const pieces: Piece[] = []
    const burst = (x: number, y: number, count: number, angle: number, spread: number, speed: number) => {
      for (let i = 0; i < count; i++) {
        const a = angle + (Math.random() - 0.5) * spread
        const v = speed * (0.55 + Math.random() * 0.6)
        pieces.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
          color: colors[Math.floor(Math.random() * colors.length)],
          shape: Math.random() < 0.25 ? 'circle' : 'rect',
          wobble: Math.random() * Math.PI * 2,
        })
      }
    }

    const scale = Math.min(1.4, Math.max(0.8, W / 420))
    if (reduce) {
      burst(W / 2, H * 0.35, 40, -Math.PI / 2, Math.PI * 2, 5)
    } else {
      // Two cannons from the bottom corners, then a pop in the middle
      burst(0, H, 90, -Math.PI / 3, 0.7, 22 * scale)
      burst(W, H, 90, -Math.PI * 2 / 3, 0.7, 22 * scale)
      setTimeout(() => burst(W / 2, H * 0.35, 80, -Math.PI / 2, Math.PI * 2, 13 * scale), 250)
    }

    const total = reduce ? 1200 : duration
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = now - start
      ctx.clearRect(0, 0, W, H)
      const fade = t > total - 700 ? Math.max(0, (total - t) / 700) : 1
      ctx.globalAlpha = fade
      for (const p of pieces) {
        p.vy += 0.38           // gravity
        p.vx *= 0.985          // air
        p.vy *= 0.985
        p.wobble += 0.12
        p.x += p.vx + Math.sin(p.wobble) * 0.6
        p.y += p.vy
        p.rot += p.vr
        if (p.y > H + 40) continue
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        if (p.shape === 'circle') {
          ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill()
        } else {
          // Flip effect: squash the width as it spins
          ctx.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.wobble)), p.w, p.h * Math.abs(Math.cos(p.wobble)) + 1)
        }
        ctx.restore()
      }
      if (t < total) raf = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, W, H)
    }
    raf = requestAnimationFrame(tick)

    // A short buzz on phones that support it
    try { if (!reduce) navigator.vibrate?.([30, 40, 60]) } catch { /* not supported */ }

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size) }
  }, [duration])

  return (
    <canvas ref={ref} aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 100 }} />
  )
}
