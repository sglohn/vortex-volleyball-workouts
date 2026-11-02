// FILE: components/InchModeSwitch.tsx
//
// "Feet + inches | Inches" switch above the entry box for feet-and-inches
// combine tests (Height, Wingspan, Standing Reach, Block Touch, Approach
// Touch). Inches is for measurers marked only in inches: one box, and the
// read-back shows it in feet and inches. Each test remembers its own choice
// on the device (lib/combine.ts readInchMode / saveInchMode).
//
// Used by components/CombineDay.tsx (phones, Team Mode) and
// components/CombineStation.tsx (coach station).
'use client'
import type { InchMode } from '@/lib/combine'

export default function InchModeSwitch({ mode, onChange }: { mode: InchMode; onChange: (m: InchMode) => void }) {
  const options: { m: InchMode; label: string }[] = [{ m: 'ft-in', label: 'Feet + inches' }, { m: 'in', label: 'Inches' }]
  return (
    <div role="radiogroup" aria-label="Enter in" style={{ display: 'inline-flex', border: '1.5px solid var(--gray-border)', borderRadius: 20, padding: 2, marginBottom: '0.5rem', background: 'var(--white)' }}>
      {options.map(o => {
        const on = mode === o.m
        return (
          <button key={o.m} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.m)}
            style={{ padding: '0.3rem 0.8rem', borderRadius: 18, border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
              background: on ? 'var(--black)' : 'transparent', color: on ? 'var(--yellow, #fff)' : 'var(--text-secondary)' }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
