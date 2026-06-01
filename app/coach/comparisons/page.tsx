'use client'
import { useState, useEffect, useRef } from 'react'

const STAND_URL = '/sil_stand_f.png'
const JUMP_URL  = '/sil_jump_f.png'
const NET_URL   = '/volleyball_net.webp'
const FEMALE_NET = 88.25
const MALE_NET   = 95.5

type CompGroup = 'team' | 'cf' | 'ca' | 'age' | 'pos' | 't25' | 'no'

interface Player {
  id: string; name: string; jersey_number?: string
  teamName?: string; gender?: string; age_group?: string; position?: string
  height_in?: number; standing_reach_in?: number; approach_vertical_in?: number
}

function fi(inches: number) { return `${Math.floor(inches/12)}'${Math.round(inches%12)}"` }
function avgF(arr: Player[], key: keyof Player): number {
  const vals = arr.map(p => p[key] as number).filter(v => v > 0)
  return vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : 0
}

const GROUP_LABELS: Record<CompGroup, string> = {
  team:'My team', cf:'Club (same gender)', ca:'Whole club',
  age:'Age group', pos:'Same position', t25:'Top 25%', no:'Solo',
}

// Chart constants
const W = 700, H = 480
const LP = 52, RP = 16, TOP = 24, BOT = 56
const cW = W - LP - RP, cH = H - TOP - BOT

export default function ComparisonsPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [selId, setSelId] = useState('')
  const [gender, setGender] = useState<'F'|'M'>('F')
  const [group, setGroup] = useState<CompGroup>('team')
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/coach/comparisons').then(r => r.json()).then(d => {
      const pl: Player[] = (d.players ?? []).map((p: Player) => ({
        ...p, gender: p.gender ?? (p.teamName?.toLowerCase().includes('boy') ? 'M' : 'F'),
      }))
      setPlayers(pl)
      const first = pl.find(p => (p.gender ?? 'F') === 'F') ?? pl[0]
      if (first) { setSelId(first.id); setGender((first.gender as 'F'|'M') ?? 'F') }
      setLoading(false)
    })
  }, [])

  const filteredByGender = players.filter(p => {
    const g = p.gender ?? (p.teamName?.toLowerCase().includes('boy') ? 'M' : 'F')
    return g === gender
  })
  const sp = players.find(p => p.id === selId)

  function getComp(): Player[] {
    if (!sp) return []
    const others = filteredByGender.filter(p => p.id !== selId)
    if (group==='team') return others.filter(p => p.teamName === sp.teamName)
    if (group==='cf')   return others
    if (group==='ca')   return players.filter(p => p.id !== selId)
    if (group==='age')  return others.filter(p => p.age_group === sp.age_group)
    if (group==='pos')  return others.filter(p => p.position === sp.position)
    if (group==='t25') {
      const s = [...others].sort((a,b) => (b.approach_vertical_in??0)-(a.approach_vertical_in??0))
      return s.slice(0, Math.max(1, Math.ceil(others.length*.25)))
    }
    return []
  }

  const co = sp ? getComp() : []
  const net = gender==='M' ? MALE_NET : FEMALE_NET

  const pH  = sp?.height_in ?? 0
  const pAV = sp?.approach_vertical_in ?? 0
  const aH  = co.length ? avgF(co,'height_in') : 0
  const aAV = co.length ? avgF(co,'approach_vertical_in') : 0
  const above = pAV - net
  const aH2  = co.length ? avgF(co,'height_in') : null
  const aAV2 = co.length ? avgF(co,'approach_vertical_in') : null

  // Fixed scale 0-145" — must match calibration tool exactly
  const ppi = cH / 145
  function yp(inch: number) { return TOP + cH - inch * ppi }
  function xp(frac: number) { return LP + frac * cW }

  // ── CALIBRATION ── from /coach/comparisons/calibrate
  // Standing: calibrated with 6'0" player, feet on floor
  const STAND_AR        = 0.4758
  const STAND_HEAD_FRAC = 0.062   // head pixel as fraction from img top
  const STAND_FEET_FRAC = 0.926   // feet pixel as fraction from img top
  const STAND_CONTENT   = 0.864   // head-to-feet span as fraction of img height

  // Jumping: calibrated with fingertip at 10'0"
  // Body is sized using STAND_CONTENT so a 6' jumper is same size as 6' standing figure
  const JUMP_AR         = 0.5754
  const JUMP_TIP_FRAC   = 0.025   // fingertip as fraction from img top

  // Net
  const NET_POLE_FRAC   = 0.318
  const NET_TOP_VS_TAPE = -142    // img top relative to net tape height in px

  const standCX    = xp(.18)
  const jumpCX     = xp(.65)
  const GHOST_OFFSET = 14

  // Standing: size so head-to-feet content = player height in px
  // feet land at floor, head at player height
  function standProps(hIn: number, cx: number) {
    const hpx  = hIn * ppi                        // player height in scene pixels
    const imgH = hpx / STAND_CONTENT              // total image height
    const imgW = imgH * STAND_AR
    const imgTop = (TOP + cH) - STAND_FEET_FRAC * imgH  // feet at floor
    return { top: imgTop, left: cx - imgW / 2, width: imgW, height: imgH }
  }

  // Jumping: size body same as standing (same STAND_CONTENT fraction)
  // so a 6' jumper looks same size as 6' standing figure
  // then position so fingertip lands at approach touch height
  function jumpProps(hIn: number, avIn: number, cx: number) {
    const hpx  = hIn * ppi                        // player height in scene pixels
    const imgH = hpx / STAND_CONTENT              // same body scale as standing
    const imgW = imgH * JUMP_AR
    const tipY = yp(avIn)                         // approach touch height in scene
    const imgTop = tipY - JUMP_TIP_FRAC * imgH    // fingertip at approach touch
    return { top: imgTop, left: cx - imgW * 0.35, width: imgW, height: imgH, tipY }
  }

  const pStand = pH  > 0 ? standProps(pH,  standCX) : null
  const pJump  = pAV > 0 ? jumpProps(pH, pAV, jumpCX)  : null
  const gStand = aH  > 0 ? standProps(aH,  standCX + GHOST_OFFSET) : null
  const gJump  = aAV > 0 ? jumpProps(aH, aAV, jumpCX  + GHOST_OFFSET) : null

  // Net image sizing — left pole at divider, extends off right
  const divX = xp(.42)
  // Net image — fully hardcoded position from calibration, never changes
  // Derived from: NET_POLE_FRAC=0.318, NET_TOP_VS_TAPE=-142, fixed ppi=cH/145
  const NET_LEFT   = 253    // xp(0.318) = 52 + 0.318*632
  const NET_TOP    = 38     // yp(88.25) + (-142)
  const NET_WIDTH  = W - 253 + 32   // extends to right edge
  const NET_HEIGHT = H - 38         // fills from top to bottom of scene

  // SVG for grid, axes, lines
  const NS = 'http://www.w3.org/2000/svg'
  function el(tag: string, attrs: Record<string,string|number>) {
    const e = document.createElementNS(NS, tag)
    Object.entries(attrs).forEach(([k,v]) => e.setAttribute(k,String(v)))
    return e
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !sp) return
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    // Grid lines — fixed 0-145" scale
    for (let ft=0; ft<=12; ft++) {
      const inch = ft*12; if (inch > 145) break
      const y = yp(inch); if (y < TOP-2 || y > TOP+cH+2) continue
      svg.appendChild(el('line', {x1:LP,y1:y,x2:W-RP,y2:y,stroke:'#e2e8f0','stroke-width':'.8'}))
      const lbl = el('text', {x:LP-5,y:y+4,'text-anchor':'end','font-size':'10',fill:'#94a3b8'})
      lbl.textContent = `${ft}'`; svg.appendChild(lbl)
    }
    svg.appendChild(el('line', {x1:LP,y1:TOP,x2:LP,y2:TOP+cH,stroke:'#cbd5e1','stroke-width':'1'}))
    svg.appendChild(el('rect', {x:LP,y:TOP+cH,width:cW,height:1,fill:'#cbd5e1'}))

    // Section divider
    svg.appendChild(el('line', {x1:divX,y1:TOP+8,x2:divX,y2:TOP+cH,stroke:'#e2e8f0','stroke-width':'1','stroke-dasharray':'4,3'}))

    // Section labels
    const stLbl = el('text', {x:(LP+divX)/2,y:TOP+13,'text-anchor':'middle','font-size':'10',fill:'#94a3b8','font-weight':'600','letter-spacing':'0.06em'})
    stLbl.textContent = 'STANDING HEIGHT'; svg.appendChild(stLbl)
    const jpLbl = el('text', {x:(divX+W-RP)/2,y:TOP+13,'text-anchor':'middle','font-size':'10',fill:'#94a3b8','font-weight':'600','letter-spacing':'0.06em'})
    jpLbl.textContent = 'APPROACH TOUCH'; svg.appendChild(jpLbl)

    // Head-height line for player — aligns with actual head pixel in image
    if (pStand) {
      const headY = pStand.top + STAND_HEAD_FRAC * pStand.height
      svg.appendChild(el('line', {x1:pStand.left-4,y1:headY,x2:pStand.left+pStand.width+4,y2:headY,stroke:'#1e293b','stroke-width':'1.5'}))
      // Height label
      const hl = el('text', {x:pStand.left-8,y:headY+4,'text-anchor':'end','font-size':'10',fill:'#1e293b','font-weight':'500'})
      hl.textContent = fi(pH); svg.appendChild(hl)
    }
    // Ghost head line
    if (gStand && co.length) {
      const headY = gStand.top + STAND_HEAD_FRAC * gStand.height
      svg.appendChild(el('line', {x1:gStand.left-4,y1:headY,x2:gStand.left+gStand.width+4,y2:headY,stroke:'#94a3b8','stroke-width':'1','stroke-dasharray':'4,3'}))
    }

    // Reach line for player — tipY already = yp(avIn) = actual fingertip height
    if (pJump) {
      svg.appendChild(el('line', {x1:pJump.left-4,y1:pJump.tipY,x2:pJump.left+pJump.width*.85,y2:pJump.tipY,stroke:'#e11d48','stroke-width':'2'}))
      const aboveLbl = el('text', {x:pJump.left+pJump.width*.88,y:pJump.tipY+4,'font-size':'10',fill:above>=0?'#16a34a':'#dc2626','font-weight':'500'})
      aboveLbl.textContent = `${above>=0?'+':''}${above.toFixed(1)}" vs net`; svg.appendChild(aboveLbl)
    }
    // Ghost reach line
    if (gJump && co.length) {
      svg.appendChild(el('line', {x1:gJump.left-4,y1:gJump.tipY,x2:gJump.left+gJump.width*.85,y2:gJump.tipY,stroke:'#94a3b8','stroke-width':'1','stroke-dasharray':'4,3'}))
    }

    // Net label
    const netLbl = el('text', {x: NET_LEFT + 20, y: yp(net) - 8, 'font-size':'11', fill:'#1d4ed8', 'font-weight':'500'})
    netLbl.textContent = `Net ${fi(net)}`; svg.appendChild(netLbl)

    // Player label under standing
    const pnl = el('text', {x:standCX,y:TOP+cH+16,'text-anchor':'middle','font-size':'11',fill:'#0f172a','font-weight':'600'})
    pnl.textContent = `${sp.name.split(' ')[0]}  ${fi(pH)}`; svg.appendChild(pnl)

    if (co.length && aH > 0) {
      const dH = pH-aH
      const dHlbl = el('text', {x:standCX,y:TOP+cH+28,'text-anchor':'middle','font-size':'10',fill:dH>=0?'#16a34a':'#dc2626'})
      dHlbl.textContent = `${dH>=0?'+':''}${dH.toFixed(1)}" vs ${GROUP_LABELS[group]} (${fi(aH)})`; svg.appendChild(dHlbl)
    }

    // Player label under jumping
    const jnl = el('text', {x:jumpCX,y:TOP+cH+16,'text-anchor':'middle','font-size':'11',fill:'#0f172a','font-weight':'600'})
    jnl.textContent = `${sp.name.split(' ')[0]}  reach ${fi(pAV)}`; svg.appendChild(jnl)

    if (co.length && aAV > 0) {
      const dAV = pAV-aAV
      const dlbl = el('text', {x:jumpCX,y:TOP+cH+28,'text-anchor':'middle','font-size':'10',fill:dAV>=0?'#16a34a':'#dc2626'})
      dlbl.textContent = `${dAV>=0?'+':''}${dAV.toFixed(1)}" vs ${GROUP_LABELS[group]} (${fi(aAV)})`; svg.appendChild(dlbl)
    }

    // Legend
    const legY=TOP+26, legX=LP+6
    svg.appendChild(el('rect',{x:legX,y:legY-8,width:10,height:10,rx:2,fill:'#1e293b'}))
    const ll1=el('text',{x:legX+13,y:legY+1,'font-size':'10',fill:'#475569'}); ll1.textContent=sp.name.split(' ')[0]; svg.appendChild(ll1)
    if (co.length) {
      svg.appendChild(el('rect',{x:legX,y:legY+8,width:10,height:10,rx:2,fill:'#94a3b8'}))
      const ll2=el('text',{x:legX+13,y:legY+17,'font-size':'10',fill:'#94a3b8'}); ll2.textContent=GROUP_LABELS[group]??'Avg'; svg.appendChild(ll2)
    }
  }, [selId, gender, group, players])

  const pctW = (n: number) => `${(n/W)*100}%`
  const pctH = (n: number) => `${(n/H)*100}%`
  const pctT = (n: number) => `${(n/H)*100}%`
  const pctL = (n: number) => `${(n/W)*100}%`

  return (
    <div style={{ padding:'2rem', maxWidth:860 }}>
      <div style={{ marginBottom:'1.25rem' }}>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:800, marginBottom:'.25rem' }}>Player Comparisons</h1>
        <p style={{ color:'var(--text-muted)', fontSize:'.85rem' }}>Standing height and approach touch vs net</p>
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end', marginBottom:'0.75rem' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <label style={{ fontSize:13, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em' }}>Net</label>
          <select className="input" value={gender} onChange={e => {
            const g = e.target.value as 'F'|'M'; setGender(g)
            const first = players.find(p => { const pg=p.gender??(p.teamName?.toLowerCase().includes('boy')?'M':'F'); return pg===g })
            if (first) setSelId(first.id)
          }} style={{ fontSize:13 }}>
            <option value="F">Girls — 7'4.25"</option>
            <option value="M">Boys — 7'11.5"</option>
          </select>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:3, minWidth:220 }}>
          <label style={{ fontSize:13, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em' }}>Player</label>
          <select className="input" value={selId} onChange={e => setSelId(e.target.value)} style={{ fontSize:13 }}>
            {filteredByGender.map(p => <option key={p.id} value={p.id}>{p.name} ({p.teamName})</option>)}
          </select>
        </div>
      </div>

      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:12, alignItems:'center', fontSize:12, color:'var(--text-muted)' }}>
        <span>Compare to:</span>
        {(Object.entries(GROUP_LABELS) as [CompGroup,string][]).map(([g,label]) => (
          <button key={g} onClick={() => setGroup(g)}
            className={group===g ? 'btn-volt' : 'btn-ghost'}
            style={{ fontSize:12, padding:'3px 10px', borderRadius:20 }}>
            {label}
          </button>
        ))}
      </div>

      {loading
        ? <div style={{ color:'var(--text-muted)', padding:'2rem' }}>Loading players…</div>
        : !sp
          ? <div style={{ color:'var(--text-muted)', padding:'2rem', fontSize:'.9rem' }}>
              No players with measurements found. Go to <strong>Coach → Players → [player name]</strong> and enter their height and approach touch.
            </div>
          : (
            /* Chart container — SVG for grid/lines, HTML imgs for silhouettes */
            <div ref={containerRef} style={{ position:'relative', width:'100%', aspectRatio:`${W}/${H}`, border:'.5px solid var(--gray-border)', borderRadius:12, overflow:'hidden', background:'#fff' }}>

              {/* Background SVG — grid, axes, labels, lines */}
              <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
                style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:1 }} />

              {/* Net image — position hardcoded from calibration, never recalculates */}
              <img src={NET_URL} alt="volleyball net"
                style={{
                  position: 'absolute',
                  left:   '34.7%',
                  top:    '7.9%',
                  width:  '69.9%',
                  height: '92.1%',
                  objectFit: 'fill',
                  objectPosition: 'left top',
                  zIndex: 2,
                  pointerEvents: 'none',
                }} />

              {/* Ghost silhouettes — behind player, mix-blend-mode so transparent bg works */}
              {gStand && co.length > 0 && (
                <img src={STAND_URL} alt="comparison standing"
                  style={{
                    position:'absolute',
                    left:  pctL(gStand.left),
                    top:   pctT(gStand.top),
                    width: pctW(gStand.width),
                    height:pctH(gStand.height),
                    opacity:.35,
                    mixBlendMode:'multiply',
                    zIndex:3,
                  }} />
              )}
              {gJump && co.length > 0 && (
                <img src={JUMP_URL} alt="comparison jumping"
                  style={{
                    position:'absolute',
                    left:  pctL(gJump.left),
                    top:   pctT(gJump.top),
                    width: pctW(gJump.width),
                    height:pctH(gJump.height),
                    opacity:.35,
                    mixBlendMode:'multiply',
                    zIndex:3,
                  }} />
              )}

              {/* Player silhouettes — on top, also multiply so ghost shows through */}
              {pStand && (
                <img src={STAND_URL} alt="player standing"
                  style={{
                    position:'absolute',
                    left:  pctL(pStand.left),
                    top:   pctT(pStand.top),
                    width: pctW(pStand.width),
                    height:pctH(pStand.height),
                    mixBlendMode:'multiply',
                    zIndex:4,
                  }} />
              )}
              {pJump && (
                <img src={JUMP_URL} alt="player jumping"
                  style={{
                    position:'absolute',
                    left:  pctL(pJump.left),
                    top:   pctT(pJump.top),
                    width: pctW(pJump.width),
                    height:pctH(pJump.height),
                    mixBlendMode:'multiply',
                    zIndex:4,
                  }} />
              )}

              {/* Lines/labels SVG — on top of everything */}
              <svg viewBox={`0 0 ${W} ${H}`}
                style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:5, pointerEvents:'none' }} />
            </div>
          )
      }

      {/* Stats */}
      {sp && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:8, marginTop:12 }}>
          {[
            { label:'Height', val:fi(pH), diff:aH2!=null?pH-aH2:null },
            { label:'Standing reach', val:fi(sp.standing_reach_in??0), diff:null },
            { label:'Approach touch', val:fi(pAV), diff:aAV2!=null?pAV-aAV2:null },
            { label:above>=0?'Above net':'Below net', val:fi(Math.abs(above)), diff:null, color:above>=0?'var(--success)':'var(--danger)' },
            ...(co.length?[{ label:GROUP_LABELS[group], val:`${co.length} players`, diff:null, sub:`avg reach ${fi(aAV2??0)}` }]:[]),
          ].map((s,i) => (
            <div key={i} style={{ background:'var(--white)', border:'1.5px solid var(--gray-border)', borderRadius:8, padding:'9px 12px' }}>
              <div style={{ fontSize:19, fontWeight:500, color:s.color??'var(--black)' }}>{s.val}</div>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{s.label}</div>
              {s.diff!=null && <div style={{ fontSize:11, marginTop:2, color:s.diff>=0?'var(--success)':'var(--danger)' }}>{s.diff>=0?'+':''}{s.diff.toFixed(1)}" vs avg</div>}
              {s.sub && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{s.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
