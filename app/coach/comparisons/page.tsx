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
  const [selId, setSelId] = useState('')
  const [gender, setGender] = useState<'F' | 'M'>('F')
  const [group, setGroup] = useState<CompGroup>('team')
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    fetch('/api/coach/players')
      .then(r => r.json())
      .then(d => {
        const pl: Player[] = (d.players ?? []).filter((p: Player) =>
          p.height_in && p.approach_vertical_in
        )
        setPlayers(pl)
        const first = pl.find(p => p.gender === 'F') ?? pl[0]
        if (first) { setSelId(first.id); setGender((first.gender as 'F' | 'M') ?? 'F') }
        setLoading(false)
      })
  }, [])

  const filteredByGender = players.filter(p => p.gender === gender)
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

    // Background
    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#f8f9fa' }))

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

    // Net
    const netY = yp(net)
    const nL = xp(.44), nR = xp(.97)
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
      if (ghost) img.setAttribute('filter', 'url(#ghost)')
      svg.appendChild(img)
      // Head line
      svg.appendChild(el('line', {
        x1: cx - wpx / 2 - 4, y1: footY - hpx,
        x2: cx + wpx / 2 + 4, y2: footY - hpx,
        stroke: ghost ? '#bbb' : '#222', 'stroke-width': 1.5,
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
      if (ghost) img.setAttribute('filter', 'url(#ghost)')
      svg.appendChild(img)
      // Reach line
      const lclr = ghost ? '#bbb' : '#e11d48'
      svg.appendChild(el('line', {
        x1: cx - 12, y1: tipY,
        x2: cx + wpx * .65, y2: tipY,
        stroke: lclr, 'stroke-width': 2,
      }))
      // Above/below label
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

    // Positions: player left, net right-centre
    const pStX = xp(.08), pJpX = xp(.25)
    const cStX = xp(.55), cJpX = xp(.73)

    // Comparison ghost
    if (co.length && aH > 0) {
      placeStanding(cStX, aH, true)
      placeJumping(cJpX, aAV, true)
      const glab = GROUP_LABELS[group] ?? 'Avg'
      const cl = el('text', { x: (cStX + cJpX) / 2, y: TOP + cH + 16, 'text-anchor': 'middle', 'font-size': '11', fill: '#888', 'font-weight': '500' })
      cl.textContent = `${glab} ${fi(aH)}`
      svg.appendChild(cl)
      const clr = el('text', { x: (cStX + cJpX) / 2, y: TOP + cH + 28, 'text-anchor': 'middle', 'font-size': '10', fill: '#aaa' })
      clr.textContent = `reach ${fi(aAV)}`
      svg.appendChild(clr)
    }

    // Player
    if (pH > 0)  placeStanding(pStX, pH, false)
    if (pAV > 0) placeJumping(pJpX, pAV, false)

    const pnl = el('text', { x: (pStX + pJpX) / 2, y: TOP + cH + 16, 'text-anchor': 'middle', 'font-size': '11', fill: '#111', 'font-weight': '500' })
    pnl.textContent = `${p.name.split(' ')[0]}  ${fi(pH)}`
    svg.appendChild(pnl)
    const prl = el('text', { x: (pStX + pJpX) / 2, y: TOP + cH + 28, 'text-anchor': 'middle', 'font-size': '10', fill: '#555' })
    prl.textContent = `reach ${fi(pAV)}`
    svg.appendChild(prl)
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
            const first = players.find(p => p.gender === g)
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
          ? <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>No player measurements found. Add measurements in the player profiles first.</div>
          : (
            <svg ref={svgRef} viewBox="0 0 700 500"
              style={{ display: 'block', width: '100%', borderRadius: 12, border: '.5px solid var(--gray-border)', background: '#f8f9fa' }} />
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
