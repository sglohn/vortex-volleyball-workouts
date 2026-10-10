// FILE: components/ExerciseClip.tsx   (new file)
//
// Plays an exercise's demo clip as a silent loop, like a GIF: no sound, no
// controls, starts on its own. Fills whatever box it's placed in (the page
// decides the size), cropped to fit like the photos.
//
// - Only loads and plays while it's on screen, so a long workout page
//   doesn't download every clip at once or drain phone batteries.
// - Shows the clip's still picture (poster) while loading, or if the
//   phone can't play the clip (for example iPhone Low Power Mode, which
//   blocks videos from starting on their own).
// - Phones set to "Reduce Motion" get the still picture; tapping plays it.
//   Tapping a playing clip pauses it.
// - still: show only the still picture. Used for the Roku snapshot, which
//   can only show a picture (see app/api/display-snapshot/route.ts).
'use client'
import { useEffect, useRef, useState } from 'react'

interface Props {
  src: string
  poster?: string | null
  alt: string
  still?: boolean
}

export default function ExerciseClip({ src, poster, alt, still = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [visible, setVisible] = useState(false)
  const [loaded, setLoaded] = useState(false)   // src set once it first comes on screen
  const [failed, setFailed] = useState(false)
  const [paused, setPaused] = useState(false)   // paused by a tap (or Reduce Motion)

  const fill: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }

  // Reduce Motion: start paused
  useEffect(() => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true)
    } catch { /* ignore */ }
  }, [])

  // Watch whether the clip is on screen
  useEffect(() => {
    if (still) return
    const el = videoRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); setLoaded(true); return }
    const obs = new IntersectionObserver(entries => {
      const on = entries.some(e => e.isIntersecting)
      setVisible(on)
      if (on) setLoaded(true)
    }, { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [still])

  // Play while on screen, pause when not
  useEffect(() => {
    const el = videoRef.current
    if (!el || !loaded || failed) return
    // React doesn't always set the muted attribute itself, and phones only
    // start videos on their own when they're muted
    el.muted = true
    el.defaultMuted = true
    if (visible && !paused) el.play().catch(() => { /* blocked: the poster stays up */ })
    else el.pause()
  }, [visible, loaded, paused, failed])

  if (still || failed) {
    return poster
      ? <img src={poster} alt={alt} style={fill} />
      : <div aria-label={alt} style={{ ...fill, background: '#0d1117' }} />
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <video
        ref={videoRef}
        src={loaded ? src : undefined}
        poster={poster ?? undefined}
        muted
        loop
        playsInline
        preload={loaded ? 'auto' : 'none'}
        aria-label={alt}
        onError={() => setFailed(true)}
        onClick={() => setPaused(p => !p)}
        style={{ ...fill, background: '#0d1117', cursor: 'pointer' }}
      />
      {paused && (
        <button type="button" onClick={() => setPaused(false)} aria-label={`Play ${alt}`}
          style={{ position: 'absolute', inset: 0, margin: 'auto', width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="7 4 20 12 7 20 7 4" /></svg>
        </button>
      )}
    </div>
  )
}
