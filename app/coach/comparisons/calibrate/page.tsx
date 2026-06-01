'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const STAND_URL = '/sil_stand_f.png'
const JUMP_URL  = '/sil_jump_f.png'
const NET_URL   = '/volleyball_net.webp'

// These must match EXACTLY what comparisons/page.tsx uses
const SW = 720, SH = 560
const LP = 60, RP = 20, TOP = 30, BOT = 60
const cW = SW - LP - RP, cH = SH - TOP - BOT
const MIN_IN = 0, MAX_IN = 145
const ppi = cH / (MAX_IN - MIN_IN)
const FLOOR_Y = TOP + cH   // pixel Y of floor = 0 inches

function yp(inch: number) { return TOP + cH - inch * ppi }
function xp(frac: number)  { return LP + frac * cW }

const REF_LINES = [0,12,24,36,48,60,66,72,78,84,88.25,95.5,96,108,120,132,144]
const REF_LABELS: Record<number,string> = {
  0:"0\" floor", 12:"1'", 24:"2'", 36:"3'", 48:"4'",
  60:"5'0\"", 66:"5'6\"", 72:"6'0\"", 78:"6'6\"",
  84:"7'0\"", 88.25:"7'4\" Girls net", 95.5:"7'11\" Boys net",
  96:"8'0\"", 108:"9'0\"", 120:"10'0\"", 132:"11'0\"", 144:"12'0\""
}

interface Obj { x:number; y:number; w:number; h:number; url:string; label:string; color:string }
type ObjMap = Record<string,Obj>

// Initial positions: standing 6' player, feet on floor
// Head at yp(72), feet at FLOOR_Y, so h = FLOOR_Y - yp(72)
const initStandH = FLOOR_Y - yp(72)
const initJumpH  = FLOOR_Y - yp(120)  // jump reaching 10', feet at floor

export default function CalibratePage() {
  const bgRef   = useRef<HTMLCanvasElement>(null)
  const fgRef   = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const [objs, setObjs] = useState<ObjMap>({
    stand: { x:xp(.08),    y:yp(72),          w:initStandH*0.65, h:initStandH, url:STAND_URL, label:'Standing (6\'0" player)', color:'#3b82f6' },
    jump:  { x:xp(.35),    y:yp(120),         w:initJumpH*0.70,  h:initJumpH,  url:JUMP_URL,  label:'Jumping (10\'0" reach)',  color:'#e11d48' },
    net:   { x:xp(.58)-10, y:yp(88.25)-10,    w:320,             h:130,        url:NET_URL,   label:'Net',                    color:'#d97706' },
  })

  const [copied, setCopied] = useState(false)
  const dragRef   = useRef<{key:string;ox:number;oy:number}|null>(null)
  const resizeRef = useRef<{key:string}|null>(null)
  const objsRef   = useRef(objs); objsRef.current = objs

  function drawBg() {
    const c = bgRef.current; if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0,0,SW,SH)
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,SW,SH)

    REF_LINES.forEach(inch => {
      const y = yp(inch)
      if (y < TOP-2 || y > TOP+cH+2) return
      const isNet = inch===88.25||inch===95.5
      const isFloor = inch===0
      ctx.strokeStyle = isNet?'#f59e0b':isFloor?'#64748b':'#e2e8f0'
      ctx.lineWidth   = isNet?2:isFloor?2:1
      ctx.setLineDash(isNet||isFloor?[]:[4,3])
      ctx.beginPath(); ctx.moveTo(LP,y); ctx.lineTo(SW-RP,y); ctx.stroke()
      ctx.setLineDash([])
      const lbl = REF_LABELS[inch]??`${Math.floor(inch/12)}'${Math.round(inch%12)}"`
      ctx.font=`${isNet||isFloor?'500 ':''}11px sans-serif`
      ctx.fillStyle=isNet?'#b45309':isFloor?'#334155':'#94a3b8'
      ctx.textAlign='left'; ctx.fillText(lbl, LP+4, y-(isFloor?2:4))
      ctx.fillStyle='#94a3b8'; ctx.font='10px sans-serif'
      ctx.textAlign='right'
      if (inch>0) ctx.fillText(`${inch}"`, LP-4, y+4)
    })

    ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=1; ctx.setLineDash([])
    ctx.beginPath(); ctx.moveTo(LP,TOP); ctx.lineTo(LP,TOP+cH); ctx.stroke()
    ctx.fillStyle='#cbd5e1'; ctx.fillRect(LP,TOP+cH,cW,1)
  }

  function drawFg(o: ObjMap) {
    const c = fgRef.current; if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0,0,SW,SH)
    Object.values(o).forEach(obj => {
      ctx.strokeStyle=obj.color; ctx.lineWidth=2; ctx.setLineDash([5,2])
      ctx.strokeRect(obj.x, obj.y, obj.w, obj.h)
      ctx.setLineDash([])
      // Resize handle
      ctx.fillStyle=obj.color
      ctx.fillRect(obj.x+obj.w-10, obj.y+obj.h-10, 10, 10)
      // Label
      ctx.font='500 11px sans-serif'; ctx.fillStyle=obj.color; ctx.textAlign='left'
      ctx.fillText(obj.label, obj.x, obj.y-5)
    })
    // Instruction overlay
    ctx.font='12px sans-serif'; ctx.fillStyle='#64748b'; ctx.textAlign='center'
    ctx.fillText('Drag image to move · Drag colored square (bottom-right) to resize', SW/2, SH-8)
  }

  useEffect(()=>{ drawBg() },[])
  useEffect(()=>{ drawFg(objs) },[objs])

  function sceneXY(e: MouseEvent|React.MouseEvent) {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return {x:0,y:0}
    return { x:(e.clientX-r.left)*(SW/r.width), y:(e.clientY-r.top)*(SH/r.height) }
  }

  function hitTest(x:number,y:number) {
    // Check in reverse order so topmost drawn object wins
    const keys = Object.keys(objsRef.current).reverse()
    for (const key of keys) {
      const o = objsRef.current[key]
      if (x>=o.x+o.w-14&&x<=o.x+o.w&&y>=o.y+o.h-14&&y<=o.y+o.h) return {key,type:'resize'}
      if (x>=o.x&&x<=o.x+o.w&&y>=o.y&&y<=o.y+o.h) return {key,type:'drag'}
    }
    return null
  }

  const onMouseDown = useCallback((e:React.MouseEvent)=>{
    const {x,y}=sceneXY(e); const hit=hitTest(x,y); if(!hit) return
    e.preventDefault()
    if (hit.type==='drag') { const o=objsRef.current[hit.key]; dragRef.current={key:hit.key,ox:x-o.x,oy:y-o.y} }
    else { resizeRef.current={key:hit.key} }
  },[])

  useEffect(()=>{
    function onMove(e:MouseEvent){
      const {x,y}=sceneXY(e)
      if (dragRef.current) {
        const {key,ox,oy}=dragRef.current
        setObjs(p=>({...p,[key]:{...p[key],x:x-ox,y:y-oy}}))
      } else if (resizeRef.current) {
        const {key}=resizeRef.current
        setObjs(p=>({...p,[key]:{...p[key],w:Math.max(20,x-p[key].x),h:Math.max(20,y-p[key].y)}}))
      }
    }
    function onUp(){ dragRef.current=null; resizeRef.current=null }
    window.addEventListener('mousemove',onMove)
    window.addEventListener('mouseup',onUp)
    return ()=>{ window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp) }
  },[])

  // Output: the key values the comparisons page needs are:
  // For standing: given player height H inches,
  //   imgH = H * ppi * (s.h / initStandH) / 1   ... but simpler:
  //   The image was calibrated at 72" = initStandH px tall
  //   So imgH per inch = s.h / 72
  //   And the head is at s.y within a scene where yp(72) is the 6' mark
  //   headFrac = (s.y - yp(72)) / s.h  (negative if img top is above head)
  //   feetFrac = (FLOOR_Y - s.y) / s.h

  const s=objs.stand, j=objs.jump, n=objs.net

  // How many scene pixels per inch of player height (from this calibration)
  const standPxPerIn = s.h / 72        // image was set to represent 72"
  const jumpPxPerIn  = j.h / 120       // image was set to represent 120" reach

  // Where is the head within the image (as fraction of img height)
  // head should be at yp(72) scene Y — if user moved img top above that, headFrac > 0
  const standHeadFrac = (yp(72) - s.y) / s.h
  const standFeetFrac = (FLOOR_Y - s.y) / s.h

  // For jump: tip at yp(120), feet at FLOOR_Y
  const jumpTipFrac  = (yp(120) - j.y) / j.h
  const jumpFeetFrac = (FLOOR_Y - j.y) / j.h

  const standAR = s.w / s.h
  const jumpAR  = j.w / j.h

  const netPoleFrac   = (n.x - LP) / cW
  const netTopVsNet   = Math.round(n.y - yp(88.25))   // how many px above/below girls net tape

  const code =
`  // ── CALIBRATION ── generated by /coach/comparisons/calibrate
  // Standing image: calibrated with a 6'0" (72") player, feet on floor
  const STAND_AR        = ${standAR.toFixed(4)}   // img w/h ratio
  const STAND_HEAD_FRAC = ${standHeadFrac.toFixed(3)}   // head pixel as fraction from img top
  const STAND_FEET_FRAC = ${standFeetFrac.toFixed(3)}   // feet pixel as fraction from img top
  const STAND_CONTENT   = ${(standFeetFrac - standHeadFrac).toFixed(3)} // content span fraction

  // Jumping image: calibrated with 10'0" (120") reach, feet on floor
  const JUMP_AR         = ${jumpAR.toFixed(4)}
  const JUMP_TIP_FRAC   = ${jumpTipFrac.toFixed(3)}   // fingertip as fraction from img top
  const JUMP_FEET_FRAC  = ${jumpFeetFrac.toFixed(3)}   // feet as fraction from img top

  // Net image positioning
  const NET_POLE_FRAC   = ${netPoleFrac.toFixed(3)}   // left pole position (use as xp arg)
  const NET_TOP_VS_TAPE = ${netTopVsNet}   // img top, in pixels relative to net tape height`

  return (
    <div style={{padding:'1.5rem',maxWidth:820}}>
      <h1 style={{fontFamily:'var(--font-display)',fontSize:'1.5rem',fontWeight:800,marginBottom:'.25rem'}}>
        Comparison Calibration
      </h1>
      <div style={{background:'var(--carolina-light)',border:'1.5px solid var(--carolina-border)',borderRadius:8,padding:'.75rem 1rem',marginBottom:'1rem',fontSize:'.82rem',lineHeight:1.7}}>
        <strong>Standing figure:</strong> drag so the head aligns with the <strong>6'0"</strong> line and the feet align with the <strong>floor (0")</strong> line. Resize if needed.<br/>
        <strong>Jumping figure:</strong> drag so the fingertip aligns with the <strong>10'0"</strong> line and the feet align with the <strong>floor</strong>. Keep similar body size to standing.<br/>
        <strong>Net image:</strong> drag so the white tape aligns with the <strong>7'4" Girls net</strong> amber line. Drag right edge to size.<br/>
        When aligned, copy the calibration code and paste into <code>comparisons/page.tsx</code>.
      </div>

      <div ref={wrapRef} onMouseDown={onMouseDown}
        style={{position:'relative',width:'100%',aspectRatio:`${SW}/${SH}`,border:'1px solid var(--gray-border)',borderRadius:12,overflow:'hidden',cursor:'crosshair',background:'#fff',marginBottom:'1rem'}}>

        <canvas ref={bgRef} width={SW} height={SH}
          style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}} />

        {Object.entries(objs).map(([key,o])=>(
          <img key={key} src={o.url} alt={key} draggable={false}
            style={{position:'absolute',left:o.x/SW*100+'%',top:o.y/SH*100+'%',width:o.w/SW*100+'%',height:o.h/SH*100+'%',mixBlendMode:'multiply',pointerEvents:'none'}} />
        ))}

        <canvas ref={fgRef} width={SW} height={SH}
          style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}} />
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.5rem'}}>
        <span style={{fontWeight:600,fontSize:'.85rem'}}>Calibration output</span>
        <button onClick={()=>{ navigator.clipboard.writeText(code).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000) }) }}
          className="btn-volt" style={{padding:'.375rem 1rem',fontSize:'.82rem'}}>
          {copied?'✓ Copied!':'Copy code'}
        </button>
      </div>
      <pre style={{background:'var(--carolina-light)',border:'1.5px solid var(--carolina-border)',borderRadius:8,padding:'1rem',fontSize:'.78rem',overflowX:'auto',lineHeight:1.8,color:'var(--black)',whiteSpace:'pre-wrap'}}>
        {code}
      </pre>
    </div>
  )
}
