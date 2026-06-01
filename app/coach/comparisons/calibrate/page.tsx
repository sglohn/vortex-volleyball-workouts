'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const STAND_URL = '/sil_stand_f.png'
const JUMP_URL  = '/sil_jump_f.png'
const NET_URL   = '/volleyball_net.webp'

const SW = 720, SH = 560
const LP = 60, RP = 20, TOP = 30, BOT = 60
const cW = SW - LP - RP, cH = SH - TOP - BOT
const MIN_IN = 56, MAX_IN = 140
const ppi = cH / (MAX_IN - MIN_IN)
function yp(inch: number) { return TOP + cH - (inch - MIN_IN) * ppi }
function xp(frac: number) { return LP + frac * cW }

const REF_LINES = [60, 66, 72, 78, 84, 88.25, 95.5, 102, 108, 120, 132]
const REF_LABELS: Record<number, string> = {
  60:"5'0\"", 66:"5'6\"", 72:"6'0\"", 78:"6'6\"",
  84:"7'0\"", 88.25:"7'4\" (Girls net)", 95.5:"7'11\" (Boys net)",
  102:"8'6\"", 108:"9'0\"", 120:"10'0\"", 132:"11'0\""
}

interface Obj { x:number; y:number; w:number; h:number; url:string; label:string; color:string }
type ObjMap = Record<string, Obj>

export default function CalibratePage() {
  const bgRef  = useRef<HTMLCanvasElement>(null)
  const fgRef  = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [objs, setObjs] = useState<ObjMap>({
    stand: { x:xp(.08),   y:yp(67)-10,    w:75,  h:200, url:STAND_URL, label:'Standing', color:'#3b82f6' },
    jump:  { x:xp(.38),   y:yp(110)-5,    w:85,  h:220, url:JUMP_URL,  label:'Jumping',  color:'#e11d48' },
    net:   { x:xp(.62)-10,y:yp(88.25)-15, w:280, h:120, url:NET_URL,   label:'Net',      color:'#d97706' },
  })
  const [copied, setCopied] = useState(false)
  const dragRef   = useRef<{key:string;ox:number;oy:number}|null>(null)
  const resizeRef = useRef<{key:string}|null>(null)
  const objsRef   = useRef(objs); objsRef.current = objs

  function drawBg() {
    const canvas = bgRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, SW, SH)
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SW, SH)
    REF_LINES.forEach(inch => {
      const y = yp(inch)
      if (y < TOP - 5 || y > TOP + cH + 5) return
      const isNet = inch === 88.25 || inch === 95.5
      ctx.strokeStyle = isNet ? '#f59e0b' : '#e2e8f0'
      ctx.lineWidth = isNet ? 2 : 1
      ctx.setLineDash(isNet ? [] : [4, 3])
      ctx.beginPath(); ctx.moveTo(LP, y); ctx.lineTo(SW-RP, y); ctx.stroke()
      ctx.setLineDash([])
      const lbl = REF_LABELS[inch] ?? `${Math.floor(inch/12)}'${Math.round(inch%12)}"`
      ctx.font = `${isNet?'500 ':''}11px sans-serif`
      ctx.fillStyle = isNet ? '#b45309' : '#94a3b8'
      ctx.textAlign = 'left'; ctx.fillText(lbl, LP+4, y-4)
      ctx.font = '10px sans-serif'; ctx.fillStyle = '#94a3b8'
      ctx.textAlign = 'right'; ctx.fillText(`${inch}"`, LP-4, y+4)
    })
    ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=1; ctx.setLineDash([])
    ctx.beginPath(); ctx.moveTo(LP,TOP); ctx.lineTo(LP,TOP+cH); ctx.stroke()
    ctx.fillStyle='#cbd5e1'; ctx.fillRect(LP,TOP+cH,cW,1)
    ctx.font='11px sans-serif'; ctx.fillStyle='#94a3b8'; ctx.textAlign='left'
    ctx.fillText('Floor (5\'0" reference)', LP+4, TOP+cH+14)
  }

  function drawFg(o: ObjMap) {
    const canvas = fgRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, SW, SH)
    Object.values(o).forEach(obj => {
      ctx.strokeStyle = obj.color; ctx.lineWidth = 2; ctx.setLineDash([4,2])
      ctx.strokeRect(obj.x, obj.y, obj.w, obj.h)
      ctx.setLineDash([])
      ctx.fillStyle = obj.color
      ctx.fillRect(obj.x+obj.w-10, obj.y+obj.h-10, 10, 10)
      ctx.font='500 11px sans-serif'; ctx.textAlign='left'
      ctx.fillText(obj.label, obj.x, obj.y-5)
    })
  }

  useEffect(() => { drawBg() }, [])
  useEffect(() => { drawFg(objs) }, [objs])

  function sceneXY(e: MouseEvent | React.MouseEvent) {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return {x:0,y:0}
    const scale = SW / r.width
    return { x:(e.clientX-r.left)*scale, y:(e.clientY-r.top)*scale }
  }

  function hitTest(x:number, y:number) {
    for (const [key,o] of Object.entries(objsRef.current)) {
      if (x>=o.x+o.w-12&&x<=o.x+o.w&&y>=o.y+o.h-12&&y<=o.y+o.h) return {key,type:'resize'}
      if (x>=o.x&&x<=o.x+o.w&&y>=o.y&&y<=o.y+o.h) return {key,type:'drag'}
    }
    return null
  }

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const {x,y} = sceneXY(e); const hit = hitTest(x,y); if (!hit) return
    e.preventDefault()
    if (hit.type==='drag') { const o=objsRef.current[hit.key]; dragRef.current={key:hit.key,ox:x-o.x,oy:y-o.y} }
    else { resizeRef.current={key:hit.key} }
  }, [])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const {x,y}=sceneXY(e)
      if (dragRef.current) {
        const {key,ox,oy}=dragRef.current
        setObjs(p=>({...p,[key]:{...p[key],x:x-ox,y:y-oy}}))
      } else if (resizeRef.current) {
        const {key}=resizeRef.current
        setObjs(p=>({...p,[key]:{...p[key],w:Math.max(30,x-p[key].x),h:Math.max(30,y-p[key].y)}}))
      }
    }
    function onUp() { dragRef.current=null; resizeRef.current=null }
    window.addEventListener('mousemove',onMove)
    window.addEventListener('mouseup',onUp)
    return ()=>{ window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp) }
  }, [])

  const s=objs.stand, j=objs.jump, n=objs.net
  const code = `  // Calibrated — paste into app/coach/comparisons/page.tsx
  const STAND_AR        = ${(s.w/s.h).toFixed(4)}
  const STAND_HEAD_FRAC = ${((s.y-TOP)/s.h).toFixed(3)}
  const STAND_FEET_FRAC = ${((s.y+s.h-TOP)/s.h).toFixed(3)}
  const STAND_CONTENT   = ${(((s.y+s.h-TOP)-(s.y-TOP))/s.h).toFixed(3)}

  const JUMP_AR         = ${(j.w/j.h).toFixed(4)}
  const JUMP_TIP_FRAC   = ${((j.y-TOP)/j.h).toFixed(3)}
  const JUMP_FEET_FRAC  = ${((j.y+j.h-TOP)/j.h).toFixed(3)}

  // Net
  const netPoleX        = xp(${((n.x-LP)/cW).toFixed(3)})
  const netTopOffset    = ${Math.round(n.y - yp(88.25))}  // px above net tape`

  return (
    <div style={{padding:'1.5rem',maxWidth:820}}>
      <h1 style={{fontFamily:'var(--font-display)',fontSize:'1.5rem',fontWeight:800,marginBottom:'.25rem'}}>
        Comparison Calibration
      </h1>
      <p style={{color:'var(--text-muted)',fontSize:'.82rem',marginBottom:'1rem',lineHeight:1.6}}>
        <strong>Standing:</strong> drag so the head aligns with a height line, feet touch the floor.<br/>
        <strong>Jumping:</strong> drag so the fingertip aligns with a reach line, feet touch the floor.<br/>
        <strong>Net:</strong> drag so the white tape aligns with the 7'4" amber line, pole on the left.<br/>
        Drag the <strong>colored square</strong> in the bottom-right corner of each image to resize it.
      </p>

      <div ref={wrapRef} onMouseDown={onMouseDown}
        style={{position:'relative',width:'100%',aspectRatio:`${SW}/${SH}`,border:'1px solid var(--gray-border)',borderRadius:12,overflow:'hidden',cursor:'crosshair',background:'#fff',marginBottom:'1rem'}}>

        <canvas ref={bgRef} width={SW} height={SH}
          style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}} />

        {Object.entries(objs).map(([key,o]) => (
          <img key={key} src={o.url} alt={key} draggable={false}
            style={{
              position:'absolute',
              left:   o.x/SW*100+'%',
              top:    o.y/SH*100+'%',
              width:  o.w/SW*100+'%',
              height: o.h/SH*100+'%',
              mixBlendMode:'multiply',
              pointerEvents:'none',
            }} />
        ))}

        <canvas ref={fgRef} width={SW} height={SH}
          style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}} />
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.5rem'}}>
        <span style={{fontWeight:600,fontSize:'.85rem'}}>Calibration output</span>
        <button onClick={() => { navigator.clipboard.writeText(code).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000) }) }}
          className="btn-volt" style={{padding:'.375rem 1rem',fontSize:'.82rem'}}>
          {copied ? '✓ Copied!' : 'Copy code'}
        </button>
      </div>
      <pre style={{background:'var(--carolina-light)',border:'1.5px solid var(--carolina-border)',borderRadius:8,padding:'1rem',fontSize:'.78rem',overflowX:'auto',lineHeight:1.8,color:'var(--black)',whiteSpace:'pre-wrap'}}>
        {code}
      </pre>
      <p style={{marginTop:'.75rem',fontSize:'.78rem',color:'var(--text-muted)'}}>
        Paste the copied values into <code>app/coach/comparisons/page.tsx</code> replacing the calibration block, then redeploy.
      </p>
    </div>
  )
}
