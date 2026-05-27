'use client'
import { useState, useEffect } from 'react'

interface Props {
  value: string        // decimal inches, e.g. "84.5"
  onChange: (inches: string) => void
  placeholder?: string
  disabled?: boolean
}

export default function FeetInchesInput({ value, onChange, disabled }: Props) {
  const [ft, setFt] = useState('')
  const [ins, setIns] = useState('')

  // When value changes externally, parse into ft + in
  useEffect(() => {
    const total = parseFloat(value)
    if (!value || isNaN(total)) { setFt(''); setIns(''); return }
    setFt(Math.floor(total / 12).toString())
    setIns((Math.round((total % 12) * 10) / 10).toString())
  }, [value])

  function emit(newFt: string, newIns: string) {
    if (!newFt && !newIns) { onChange(''); return }
    const total = Math.round(((parseFloat(newFt) || 0) * 12 + (parseFloat(newIns) || 0)) * 10) / 10
    onChange(total.toString())
  }

  const inputStyle = {
    width: '100%', padding: '0.5rem 1.75rem 0.5rem 0.625rem',
    border: '1.5px solid var(--gray-border)', borderRadius: 7,
    fontSize: '0.95rem', fontFamily: 'var(--font-body)',
    background: 'var(--white)', color: 'var(--black)',
    outline: 'none', boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ display: 'flex', gap: '0.375rem' }}>
      <div style={{ position: 'relative', flex: 1 }}>
        <input type="number" min="0" max="8" placeholder="0" value={ft} disabled={disabled}
          onChange={e => { setFt(e.target.value); emit(e.target.value, ins) }}
          onFocus={e => (e.target.style.borderColor = 'var(--carolina)')}
          onBlur={e => (e.target.style.borderColor = 'var(--gray-border)')}
          style={inputStyle} />
        <span style={{ position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, pointerEvents: 'none' }}>ft</span>
      </div>
      <div style={{ position: 'relative', flex: 1 }}>
        <input type="number" min="0" max="11.9" step="0.5" placeholder="0" value={ins} disabled={disabled}
          onChange={e => { setIns(e.target.value); emit(ft, e.target.value) }}
          onFocus={e => (e.target.style.borderColor = 'var(--carolina)')}
          onBlur={e => (e.target.style.borderColor = 'var(--gray-border)')}
          style={inputStyle} />
        <span style={{ position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, pointerEvents: 'none' }}>in</span>
      </div>
    </div>
  )
}
