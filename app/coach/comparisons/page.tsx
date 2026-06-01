'use client'
import { useState, useEffect, useRef } from 'react'

const STAND_URL = '/sil_stand_f.png'
const JUMP_URL  = '/sil_jump_f.png'
const FEMALE_NET = 88.25
const MALE_NET   = 95.5

type CompGroup = 'team' | 'cf' | 'ca' | 'age' | 'pos' | 't25' | 'no'

interface Player {
  id: string
  name: string
  jersey_number?: string
  teamName?: string
  gender?: string
  age_group?: string
  position?: string
  height_in?: number
  standing_reach_in?: number
  approach_vertical_in?: number
}

function fi(inches: number) {
  return `${Math.floor(inches / 12)}'${Math.round(inches % 12)}"`
}
function avg(arr: Player[], key: keyof Player): number {
  const vals = arr.map(p => p[key] as number).filter(v => v > 0)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

const GROUP_LABELS: Record<CompGroup, string> = {
  team: 'My team', cf: 'Club (same gender)', ca: 'Whole club',
  age: 'Age group', pos: 'Same position', t25: 'Top 25%', no: 'Solo',
}

export default function ComparisonsPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [debug, setDebug] = useState<Record<string, number> | null>(null)
  const [selId, setSelId] = useState('')
  const [gender, setGender] = useState<'F' | 'M'>('F')
  const [group, setGroup] = useState<CompGroup>('team')
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    fetch('/api/coach/comparisons')
      .then(r => r.json())
      .then(d => {
        console.log('Comparisons API response:', d._debug, d.players?.length)
        // Derive gender from team name since players table may not have gender column
        const pl: Player[] = (d.players ?? []).map((p: Player) => ({
          ...p,
          gender: p.gender ?? (p.teamName?.toLowerCase().includes('boy') ? 'M' : 'F'),
        }))
        setPlayers(pl)
        setDebug(d._debug ?? null)
        const first = pl.find(p => (p.gender ?? 'F') === 'F') ?? pl[0]
        if (first) { setSelId(first.id); setGender((first.gender as 'F' | 'M') ?? 'F') }
        setLoading(false)
      })
  }, [])

  // Filter by gender — derive from team name as fallback
  const filteredByGender = players.filter(p => {
    const g = p.gender ?? (p.teamName?.toLowerCase().includes('boy') ? 'M' : 'F')
    return g === gender
  })
  const sp = players.find(p => p.id === selId)

  function getComp(): Player[] {
    if (!sp) return []
    const others = filteredByGender.filter(p => p.id !== selId)
    if (group === 'team')  return others.filter(p => p.teamName === sp.teamName)
    if (group === 'cf')    return others
    if (group === 'ca')    return players.filter(p => p.id !== selId)
    if (group === 'age')   return others.filter(p => p.age_group === sp.age_group)
    if (group === 'pos')   return others.filter(p => p.position === sp.position)
    if (group === 't25') {
      const sorted = [...others].sort((a, b) => (b.approach_vertical_in ?? 0) - (a.approach_vertical_in ?? 0))
      return sorted.slice(0, Math.max(1, Math.ceil(others.length * 0.25)))
    }
    return []
  }

  useEffect(() => {
    if (!svgRef.current || !sp) return
    drawChart(svgRef.current, sp, getComp(), gender === 'M' ? MALE_NET : FEMALE_NET)
  }, [selId, gender, group, players])

  function drawChart(svg: SVGSVGElement, p: Player, co: Player[], net: number) {
    // Clear
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const W = 700, H = 500
    const LP = 52, RP = 16, TOP = 24, BOT = 56
    const cW = W - LP - RP, cH = H - TOP - BOT

    const pH  = p.height_in ?? 0
    const pAV = p.approach_vertical_in ?? 0
    const pSR = p.standing_reach_in ?? 0
    const aH  = co.length ? avg(co, 'height_in') : 0
    const aAV = co.length ? avg(co, 'approach_vertical_in') : 0

    const maxIn = Math.max(pAV, aAV, net) + 16
    const ppi   = cH / maxIn
    const yp = (inch: number) => TOP + cH - inch * ppi
    const xp = (frac: number) => LP + frac * cW

    const NS = 'http://www.w3.org/2000/svg'
    function el(tag: string, attrs: Record<string, string | number>) {
      const e = document.createElementNS(NS, tag)
      Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)))
      return e
    }

    // Defs
    const defs = el('defs', {})

    const pat = el('pattern', { id: 'np', x: 0, y: 0, width: 12, height: 10, patternUnits: 'userSpaceOnUse' })
    pat.appendChild(el('rect', { width: 12, height: 10, fill: 'none', stroke: '#bbb', 'stroke-width': '.8' }))
    defs.appendChild(pat)

    const flt = el('filter', { id: 'ghost' })
    const fcm = el('feColorMatrix', { type: 'saturate', values: '0' })
    const fct = el('feComponentTransfer', {})
    const ffa = el('feFuncA', { type: 'linear', slope: '0.28' })
    fct.appendChild(ffa); flt.appendChild(fcm); flt.appendChild(fct)
    defs.appendChild(flt)
    svg.appendChild(defs)

    // Background — must be WHITE for mix-blend-mode multiply to work
    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#ffffff' }))

    // Grid + labels
    for (let ft = 0; ft <= Math.ceil(maxIn / 12) + 1; ft++) {
      const inch = ft * 12
      if (inch > maxIn + 6) break
      const y = yp(inch)
      if (y < TOP - 2 || y > TOP + cH + 2) continue
      svg.appendChild(el('line', { x1: LP, y1: y, x2: W - RP, y2: y, stroke: '#dde', 'stroke-width': '.8' }))
      const lbl = el('text', { x: LP - 5, y: y + 4, 'text-anchor': 'end', 'font-size': '10', fill: '#aaa' })
      lbl.textContent = `${ft}'`
      svg.appendChild(lbl)
    }
    svg.appendChild(el('line', { x1: LP, y1: TOP, x2: LP, y2: TOP + cH, stroke: '#ccc', 'stroke-width': '1' }))
    svg.appendChild(el('rect', { x: LP, y: TOP + cH, width: cW, height: 1, fill: '#ccc' }))

    // Net — draw in right half (jumping section) only
    const netY = yp(net)
    const nL = xp(.42), nR = xp(.97)
    const netH = TOP + cH - netY
    svg.appendChild(el('rect', { x: nL - 6, y: netY - 18, width: 10, height: netH + 18, rx: 3, fill: '#2563eb' }))
    svg.appendChild(el('rect', { x: nR - 4, y: netY - 18, width: 10, height: netH + 18, rx: 3, fill: '#2563eb' }))
    for (let i = 0; i < 7; i++) {
      const fill = i % 2 === 0 ? '#e11d48' : '#fff'
      svg.appendChild(el('rect', { x: nL + 1, y: netY - 42 + i * 7, width: 4, height: 5, fill }))
      svg.appendChild(el('rect', { x: nR + 1, y: netY - 42 + i * 7, width: 4, height: 5, fill }))
    }
    svg.appendChild(el('rect', { x: nL + 4, y: netY, width: nR - nL - 8, height: netH, fill: 'url(#np)' }))
    svg.appendChild(el('rect', { x: nL + 4, y: netY - 3, width: nR - nL - 8, height: 7, fill: 'white', stroke: '#ccc', 'stroke-width': '.5' }))
    const nlb = el('text', { x: (nL + nR) / 2, y: netY - 22, 'text-anchor': 'middle', 'font-size': '11', fill: '#1d4ed8', 'font-weight': '500' })
    nlb.textContent = `Net ${fi(net)}`
    svg.appendChild(nlb)

    // Image aspect ratios (standing 250x387, jumping 280x373)
    const STAND_AR = 250 / 387
    const JUMP_AR  = 280 / 373

    function placeStanding(cx: number, hIn: number, ghost: boolean) {
      const hpx = hIn * ppi
      const wpx = hpx * STAND_AR
      const footY = TOP + cH
      const img = el('image', {
        href: STAND_URL,
        x: cx - wpx / 2,
        y: footY - hpx,
        width: wpx,
        height: hpx,
        preserveAspectRatio: 'xMidYMax meet',
      })
      if (ghost) {
        img.setAttribute('style', 'mix-blend-mode: multiply; opacity: 0.35;')
      }
      svg.appendChild(img)
      // Head line
      svg.appendChild(el('line', {
        x1: cx - wpx / 2 - 4, y1: footY - hpx,
        x2: cx + wpx / 2 + 4, y2: footY - hpx,
        stroke: ghost ? '#bbb' : '#222', 'stroke-width': ghost ? 1 : 1.5,
      }))
    }

    function placeJumping(cx: number, avIn: number, ghost: boolean) {
      const avpx = avIn * ppi
      const wpx  = avpx * JUMP_AR
      const footY = TOP + cH
      const tipY  = footY - avpx
      const img = el('image', {
        href: JUMP_URL,
        x: cx - wpx * 0.35,
        y: tipY,
        width: wpx,
        height: avpx,
        preserveAspectRatio: 'xMidYMax meet',
      })
      if (ghost) {
        img.setAttribute('style', 'mix-blend-mode: multiply; opacity: 0.35;')
      }
      svg.appendChild(img)
      // Reach line
      const lclr = ghost ? '#bbb' : '#e11d48'
      const lw = ghost ? 1 : 2
      svg.appendChild(el('line', {
        x1: cx - 12, y1: tipY,
        x2: cx + wpx * .65, y2: tipY,
        stroke: lclr, 'stroke-width': lw,
      }))
      if (!ghost) {
        const above = avIn - net
        const sign  = above >= 0 ? '+' : ''
        const clr   = above >= 0 ? '#16a34a' : '#dc2626'
        const lbl   = el('text', {
          x: cx + wpx * .68, y: tipY + 4,
          'font-size': '10', fill: clr, 'font-weight': '500',
        })
        lbl.textContent = `${sign}${above.toFixed(1)}" vs net`
        svg.appendChild(lbl)
      }
    }

    // ── NET IMAGE ──
    // Left pole visible, net extends to right edge
    const netY = yp(net)
    const poleW = 18
    const poleX = xp(.42)
    const netImgH = TOP + cH - netY + 40  // image height from net top to floor
    const netImgW = (W - poleX) * 1.1     // wider than needed so it runs off right edge

    // Net image — position so bottom of image aligns with floor, left edge at pole
    svg.appendChild(el('image', {
      href: '/volleyball_net.png',
      x: poleX - poleW,
      y: netY - netImgH * 0.12,   // a bit above net line so top tape aligns
      width: netImgW,
      height: netImgH * 1.12,
      preserveAspectRatio: 'xMinYMid meet',
    }))

    // Net height label above the tape
    const nlb = el('text', { x: poleX + 30, y: netY - 8, 'font-size': '11', fill: '#1d4ed8', 'font-weight': '500' })
    nlb.textContent = `Net ${fi(net)}`
    svg.appendChild(nlb)

    // ── FIGURE PLACEMENT ──
    const standCX = xp(.18)   // centre of standing group
    const jumpCX  = xp(.65)   // centre of jumping group
    const OFFSET  = 12         // ghost offset px so differences are visible

    // Ghost FIRST so player renders on top
    if (co.length && aH > 0) {
      placeStanding(standCX + OFFSET, aH, true)
      placeJumping(jumpCX + OFFSET, aAV, true)
    }

    // Player on top
    if (pH > 0)  placeStanding(standCX, pH, false)
    if (pAV > 0) placeJumping(jumpCX, pAV, false)

    // ── LABELS ──
    const lblY = TOP + cH + 16
    const subY = TOP + cH + 28

    const pnl = el('text', { x: standCX, y: lblY, 'text-anchor': 'middle', 'font-size': '11', fill: '#111', 'font-weight': '600' })
    pnl.textContent = `${p.name.split(' ')[0]}  ${fi(pH)}`
    svg.appendChild(pnl)

    if (co.length && aH > 0) {
      const glab = GROUP_LABELS[group] ?? 'Avg'
      const dH = pH - aH; const dHs = dH >= 0 ? '+' : ''
      const dHlbl = el('text', { x: standCX, y: subY, 'text-anchor': 'middle', 'font-size': '10', fill: dH >= 0 ? '#16a34a' : '#dc2626' })
      dHlbl.textContent = `${dHs}${dH.toFixed(1)}" vs ${glab} (${fi(aH)})`
      svg.appendChild(dHlbl)
    }

    const jnl = el('text', { x: jumpCX, y: lblY, 'text-anchor': 'middle', 'font-size': '11', fill: '#111', 'font-weight': '600' })
    jnl.textContent = `${p.name.split(' ')[0]}  reach ${fi(pAV)}`
    svg.appendChild(jnl)

    if (co.length && aAV > 0) {
      const glab = GROUP_LABELS[group] ?? 'Avg'
      const dAV = pAV - aAV; const dS = dAV >= 0 ? '+' : ''
      const dlbl = el('text', { x: jumpCX, y: subY, 'text-anchor': 'middle', 'font-size': '10', fill: dAV >= 0 ? '#16a34a' : '#dc2626' })
      dlbl.textContent = `${dS}${dAV.toFixed(1)}" vs ${glab} (${fi(aAV)})`
      svg.appendChild(dlbl)
    }

    // Divider between standing and jumping sections
    const divX = xp(.40)
    svg.appendChild(el('line', { x1: divX, y1: TOP + 10, x2: divX, y2: TOP + cH, stroke: '#dde', 'stroke-width': 1, 'stroke-dasharray': '4,4' }))

    // Section titles
    const stLbl = el('text', { x: (LP + divX) / 2, y: TOP + 12, 'text-anchor': 'middle', 'font-size': '10', fill: '#aaa', 'font-weight': '600', 'letter-spacing': '0.08em' })
    stLbl.textContent = 'STANDING HEIGHT'; svg.appendChild(stLbl)
    const jpLbl = el('text', { x: (divX + W - RP) / 2, y: TOP + 12, 'text-anchor': 'middle', 'font-size': '10', fill: '#aaa', 'font-weight': '600', 'letter-spacing': '0.08em' })
    jpLbl.textContent = 'APPROACH TOUCH'; svg.appendChild(jpLbl)

    // Legend
    const legY = TOP + 24; const legX = LP + 6
    svg.appendChild(el('rect', { x: legX, y: legY - 7, width: 10, height: 10, rx: 2, fill: '#333' }))
    const ll1 = el('text', { x: legX + 13, y: legY + 2, 'font-size': '10', fill: '#555' }); ll1.textContent = p.name.split(' ')[0]; svg.appendChild(ll1)
    if (co.length) {
      svg.appendChild(el('rect', { x: legX, y: legY + 10, width: 10, height: 10, rx: 2, fill: '#aaa' }))
      const ll2 = el('text', { x: legX + 13, y: legY + 19, 'font-size': '10', fill: '#999' }); ll2.textContent = GROUP_LABELS[group] ?? 'Avg'; svg.appendChild(ll2)
    }
  }

  const sp2 = players.find(p => p.id === selId)
  const co2 = sp2 ? getComp() : []
  const net = gender === 'M' ? MALE_NET : FEMALE_NET
  const above = sp2 ? (sp2.approach_vertical_in ?? 0) - net : 0
  const aH2  = co2.length ? avg(co2, 'height_in') : null
  const aAV2 = co2.length ? avg(co2, 'approach_vertical_in') : null

  function diff(d: number | null) {
    if (d === null || !sp2) return null
    return d
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 860 }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, marginBottom: '.25rem' }}>Player Comparisons</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>Standing height and approach touch vs net</p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Net</label>
          <select className="input" value={gender} onChange={e => {
            const g = e.target.value as 'F' | 'M'
            setGender(g)
            const first = players.find(p => {
              const pg = p.gender ?? (p.teamName?.toLowerCase().includes('boy') ? 'M' : 'F')
              return pg === g
            })
            if (first) setSelId(first.id)
          }} style={{ fontSize: 13 }}>
            <option value="F">Girls — 7'4.25"</option>
            <option value="M">Boys — 7'11.5"</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 220 }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Player</label>
          <select className="input" value={selId} onChange={e => setSelId(e.target.value)} style={{ fontSize: 13 }}>
            {filteredByGender.filter(p => p.height_in && p.approach_vertical_in).map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.teamName})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Compare buttons */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
        <span>Compare to:</span>
        {(Object.entries(GROUP_LABELS) as [CompGroup, string][]).map(([g, label]) => (
          <button key={g} onClick={() => setGroup(g)}
            className={group === g ? 'btn-volt' : 'btn-ghost'}
            style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20 }}>
            {label}
          </button>
        ))}
      </div>

      {/* Chart */}
      {loading
        ? <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading players…</div>
        : !sp2
          ? <div style={{ color: 'var(--text-muted)', padding: '2rem', fontSize: '.9rem' }}>
              No players with measurements found. Go to <strong>Coach → Players → [player name]</strong> and enter their height and approach touch to see them here.
              {debug && <div style={{ marginTop: '0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', background: '#fef3c7', padding: '0.5rem', borderRadius: 6, color: '#92400e' }}>
                Debug: {JSON.stringify(debug)}
              </div>}
            </div>
          : (
            <svg ref={svgRef} viewBox="0 0 700 500"
              style={{ display: 'block', width: '100%', borderRadius: 12, border: '.5px solid var(--gray-border)', background: '#fff' }} />
          )
      }

      {/* Stats row */}
      {sp2 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginTop: 12 }}>
          {[
            { label: 'Height', val: fi(sp2.height_in ?? 0), diff: aH2 != null ? (sp2.height_in ?? 0) - aH2 : null },
            { label: 'Standing reach', val: fi(sp2.standing_reach_in ?? 0), diff: null },
            { label: 'Approach touch', val: fi(sp2.approach_vertical_in ?? 0), diff: aAV2 != null ? (sp2.approach_vertical_in ?? 0) - aAV2 : null },
            { label: above >= 0 ? 'Above net' : 'Below net', val: fi(Math.abs(above)), diff: null, color: above >= 0 ? 'var(--success)' : 'var(--danger)' },
            ...(co2.length ? [{ label: GROUP_LABELS[group], val: `${co2.length} players`, diff: null, sub: `avg reach ${fi(aAV2 ?? 0)}` }] : []),
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--white)', border: '1.5px solid var(--gray-border)', borderRadius: 8, padding: '9px 12px' }}>
              <div style={{ fontSize: 19, fontWeight: 500, color: s.color ?? 'var(--black)' }}>{s.val}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
              {s.diff != null && (
                <div style={{ fontSize: 11, marginTop: 2, color: s.diff >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {s.diff >= 0 ? '+' : ''}{s.diff.toFixed(1)}" vs avg
                </div>
              )}
              {s.sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
