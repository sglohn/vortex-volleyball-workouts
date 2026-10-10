// FILE: components/ClipPicker.tsx   (new file)
//
// The "Demo Clip" box on the coach Exercise Library edit form
// (app/coach/exercises/page.tsx). Lets the coach pick a short video, checks
// it, plays a preview, and takes a still picture from the middle of it.
// Nothing is uploaded here; the page uploads when Save is pressed.
//
// Checks before a clip is accepted:
//   - MP4 or WebM only. iPhone .mov files often won't play on Android phones
//     or Chrome, so they go through the clip converter first
//     (scripts/make-exercise-clips.py), which makes small MP4s.
//   - 20 MB at most, 12 seconds at most (one rep is the goal)
//   - this browser can actually play it (if it can't, players' phones
//     probably can't either)
'use client'
import { useRef, useState } from 'react'

export const MAX_CLIP_BYTES = 20 * 1024 * 1024
export const MAX_CLIP_SECONDS = 12

export interface PickedClip {
  file: File
  contentType: 'video/mp4' | 'video/webm'
  poster: Blob
  previewUrl: string
  posterUrl: string
}

interface Props {
  previewUrl: string          // clip to show ('' = none)
  posterUrl: string
  uploading: boolean
  onPick: (clip: PickedClip) => void
  onRemove: () => void
}

function clipType(file: File): 'video/mp4' | 'video/webm' | 'mov' | null {
  const name = file.name.toLowerCase()
  if (file.type === 'video/quicktime' || name.endsWith('.mov')) return 'mov'
  if (file.type === 'video/mp4' || name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4'
  if (file.type === 'video/webm' || name.endsWith('.webm')) return 'video/webm'
  return null
}

// Loads the clip in a hidden player, checks it plays, and grabs a frame
// from the middle as a JPEG
function readClip(url: string): Promise<{ duration: number; poster: Blob }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    const timer = setTimeout(() => fail('timeout'), 15000)
    function fail(why: string) { clearTimeout(timer); v.removeAttribute('src'); v.load(); reject(new Error(why)) }

    v.onerror = () => fail('cannot play')
    v.onloadeddata = () => {
      const d = v.duration
      if (!isFinite(d) || d <= 0) return fail('cannot play')
      v.onseeked = () => {
        try {
          const w = v.videoWidth, h = v.videoHeight
          if (!w || !h) return fail('cannot play')
          const scale = Math.min(1, 960 / Math.max(w, h))
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(w * scale)
          canvas.height = Math.round(h * scale)
          canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height)
          canvas.toBlob(blob => {
            clearTimeout(timer)
            if (!blob) return reject(new Error('cannot play'))
            resolve({ duration: d, poster: blob })
          }, 'image/jpeg', 0.85)
        } catch { fail('cannot play') }
      }
      v.currentTime = Math.min(d * 0.4, Math.max(0, d - 0.1))
    }
    v.src = url
  })
}

export default function ClipPicker({ previewUrl, posterUrl, uploading, onPick, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [checking, setChecking] = useState(false)
  const [problem, setProblem] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''   // so picking the same file again still works
    if (!file) return
    setProblem('')

    const type = clipType(file)
    if (type === 'mov') {
      setProblem('iPhone .mov videos don’t play on every phone. Run the video through the clip converter first, then pick the .mp4 file it makes.')
      return
    }
    if (!type) { setProblem('Pick an MP4 video.'); return }
    if (file.size > MAX_CLIP_BYTES) {
      setProblem(`That video is ${(file.size / 1024 / 1024).toFixed(0)} MB (20 MB max). Run it through the clip converter to make it smaller.`)
      return
    }

    setChecking(true)
    const url = URL.createObjectURL(file)
    try {
      const { duration, poster } = await readClip(url)
      if (duration > MAX_CLIP_SECONDS + 0.5) {
        URL.revokeObjectURL(url)
        setProblem(`That clip is ${Math.round(duration)} seconds long. Trim it to one rep (${MAX_CLIP_SECONDS} seconds at most).`)
        return
      }
      onPick({ file, contentType: type, poster, previewUrl: url, posterUrl: URL.createObjectURL(poster) })
    } catch {
      URL.revokeObjectURL(url)
      setProblem('This browser can’t play that video, so players’ phones probably can’t either. Run it through the clip converter first.')
    } finally {
      setChecking(false)
    }
  }

  const label: React.CSSProperties = { display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', fontWeight: 600 }
  const smallBtn: React.CSSProperties = { border: 'none', borderRadius: 5, padding: '0.15rem 0.45rem', fontSize: '0.65rem', color: '#fff', fontWeight: 700, cursor: 'pointer' }

  return (
    <div>
      <span style={label}>Demo Clip (optional)</span>
      <div onClick={() => { if (!previewUrl && !checking && !uploading) inputRef.current?.click() }}
        style={{ width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden', border: `2px dashed ${previewUrl ? 'var(--carolina)' : 'var(--gray-border)'}`, cursor: previewUrl ? 'default' : 'pointer', position: 'relative', background: previewUrl ? '#0d1117' : 'var(--carolina-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {previewUrl ? (
          <video key={previewUrl} src={previewUrl} poster={posterUrl || undefined} muted loop autoPlay playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>🎬</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 500 }}>{checking ? 'Checking video…' : 'Tap to add a clip'}</div>
            <div style={{ fontSize: '0.65rem', marginTop: '0.2rem' }}>one rep, 3–6 seconds, MP4</div>
          </div>
        )}
        {(uploading || (checking && previewUrl)) && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(86,160,211,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: '0.85rem' }}>
            {uploading ? 'Uploading…' : 'Checking video…'}
          </div>
        )}
        {previewUrl && !uploading && !checking && (
          <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
            <button type="button" onClick={e => { e.stopPropagation(); inputRef.current?.click() }} style={{ ...smallBtn, background: 'var(--carolina)' }}>Change</button>
            <button type="button" onClick={e => { e.stopPropagation(); setProblem(''); onRemove() }} style={{ ...smallBtn, background: 'var(--danger)' }}>Remove</button>
          </div>
        )}
      </div>
      {problem && (
        <div style={{ marginTop: '0.5rem', background: 'var(--danger-light)', border: '1.5px solid #fecaca', borderRadius: 8, padding: '0.5rem 0.625rem', color: 'var(--danger)', fontSize: '0.78rem' }}>{problem}</div>
      )}
      <input ref={inputRef} type="file" accept="video/mp4,video/webm,.mp4,.m4v,.webm,video/quicktime,.mov" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  )
}
