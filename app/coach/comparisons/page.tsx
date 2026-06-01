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
function fi(inches: number) {
  const totalInches = Math.round(inches)
  const ft = Math.floor(totalInches / 12)
  const inch = totalInches % 12
  return `${ft}'${inch}"`
}
function avgF(arr: Player[], key: keyof Player): number {
  const vals = arr.map(p => p[key] as number).filter(v => v > 0)
  return vals.length ? vals.reduce((a,b) => a+b,0)/vals.length : 0
}
const GROUP_LABELS: Record<CompGroup,string> = {
  team:'My team', cf:'Club (same gender)', ca:'Whole club',
  age:'Age group', pos:'Same position', t25:'Top 25%', no:'Solo',
}

// Scene
const W=700, H=480, LP=52, RP=16, TOP=24, BOT=56
const cW=W-LP-RP, cH=H-TOP-BOT
const ppi=cH/145
function yp(inch:number){return TOP+cH-inch*ppi}
function xp(frac:number){return LP+frac*cW}

// Calibration constants
const STAND_AR=0.4758, STAND_FEET_FRAC=0.926, STAND_CONTENT=0.864, STAND_HEAD_FRAC=0.062
const JUMP_AR=0.5754, JUMP_TIP_FRAC=0.025
const standCX=xp(.18), jumpCX=xp(.65), GHOST_OFF=14

// Net — locked to calibration. Do not change these values.
const NET_L='36.0%', NET_T='12.9%', NET_W='92.4%', NET_H_GIRLS='97.4%'
const NET_T_BOYS='2.3%', NET_H_BOYS='110.6%'
const NET_LABEL_X=xp(0.320)+20  // SVG net label x position

function standProps(hIn:number,cx:number){
  const hpx=hIn*ppi, imgH=hpx/STAND_CONTENT, imgW=imgH*STAND_AR
  return {top:(TOP+cH)-STAND_FEET_FRAC*imgH, left:cx-imgW/2, width:imgW, height:imgH}
}
function jumpProps(hIn:number,avIn:number,cx:number){
  const hpx=hIn*ppi, imgH=hpx/STAND_CONTENT, imgW=imgH*JUMP_AR
  const tipY=yp(avIn)
  return {top:tipY-JUMP_TIP_FRAC*imgH, left:cx-imgW*0.35, width:imgW, height:imgH, tipY}
}
function p2l(n:number){return`${n/W*100}%`}
function p2t(n:number){return`${n/H*100}%`}
function p2w(n:number){return`${n/W*100}%`}
function p2h(n:number){return`${n/H*100}%`}

export default function ComparisonsPage(){
  const [players,setPlayers]=useState<Player[]>([])
  const [loading,setLoading]=useState(true)
  const [selId,setSelId]=useState('')
  const [gender,setGender]=useState<'F'|'M'>('F')
  const [group,setGroup]=useState<CompGroup>('team')
  const svgRef=useRef<SVGSVGElement>(null)

  useEffect(()=>{
    fetch('/api/coach/comparisons').then(r=>r.json()).then(d=>{
      const pl:Player[]=(d.players??[]).map((p:Player)=>({
        ...p,gender:p.gender??(p.teamName?.toLowerCase().includes('boy')?'M':'F'),
      }))
      setPlayers(pl)
      const first=pl.find(p=>(p.gender??'F')==='F')??pl[0]
      if(first){setSelId(first.id);setGender((first.gender as 'F'|'M')??"F")}
      setLoading(false)
    })
  },[])

  const filteredByGender=players.filter(p=>{
    const g=p.gender??(p.teamName?.toLowerCase().includes('boy')?'M':'F')
    return g===gender
  })
  const sp=players.find(p=>p.id===selId)

  function getComp():Player[]{
    if(!sp)return[]
    const others=filteredByGender.filter(p=>p.id!==selId)
    if(group==='team')return others.filter(p=>p.teamName===sp.teamName)
    if(group==='cf')return others
    if(group==='ca')return players.filter(p=>p.id!==selId)
    if(group==='age')return others.filter(p=>p.age_group===sp.age_group)
    if(group==='pos')return others.filter(p=>p.position===sp.position)
    if(group==='t25'){const s=[...others].sort((a,b)=>(b.approach_vertical_in??0)-(a.approach_vertical_in??0));return s.slice(0,Math.max(1,Math.ceil(others.length*.25)))}
    return[]
  }

  const co=sp?getComp():[]
  const net=gender==='M'?MALE_NET:FEMALE_NET
  const pH=sp?.height_in??0, pAV=sp?.approach_vertical_in??0
  const aH=co.length?avgF(co,'height_in'):0, aAV=co.length?avgF(co,'approach_vertical_in'):0
  const above=pAV-net
  const aH2=co.length?avgF(co,'height_in'):null, aAV2=co.length?avgF(co,'approach_vertical_in'):null

  const pStand=pH>0?standProps(pH,standCX):null
  const pJump=pAV>0?jumpProps(pH,pAV,jumpCX):null
  const gStand=aH>0?standProps(aH,standCX+GHOST_OFF):null
  const gJump=aAV>0?jumpProps(aH,aAV,jumpCX+GHOST_OFF):null
  const divX=xp(.42)

  const NS='http://www.w3.org/2000/svg'
  function el(tag:string,attrs:Record<string,string|number>){
    const e=document.createElementNS(NS,tag)
    Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)))
    return e
  }

  useEffect(()=>{
    const svg=svgRef.current; if(!svg||!sp)return
    while(svg.firstChild)svg.removeChild(svg.firstChild)
    for(let ft=0;ft<=12;ft++){
      const inch=ft*12; if(inch>145)break
      const y=yp(inch); if(y<TOP-2||y>TOP+cH+2)continue
      svg.appendChild(el('line',{x1:LP,y1:y,x2:W-RP,y2:y,stroke:'#e2e8f0','stroke-width':'.8'}))
      const lbl=el('text',{x:LP-5,y:y+4,'text-anchor':'end','font-size':'10',fill:'#94a3b8'})
      lbl.textContent=`${ft}'`; svg.appendChild(lbl)
    }
    svg.appendChild(el('line',{x1:LP,y1:TOP,x2:LP,y2:TOP+cH,stroke:'#cbd5e1','stroke-width':'1'}))
    svg.appendChild(el('rect',{x:LP,y:TOP+cH,width:cW,height:1,fill:'#cbd5e1'}))
    svg.appendChild(el('line',{x1:divX,y1:TOP+8,x2:divX,y2:TOP+cH,stroke:'#e2e8f0','stroke-width':'1','stroke-dasharray':'4,3'}))
    const sl=el('text',{x:(LP+divX)/2,y:TOP+13,'text-anchor':'middle','font-size':'10',fill:'#94a3b8','font-weight':'600'});sl.textContent='STANDING HEIGHT';svg.appendChild(sl)
    const jl=el('text',{x:(divX+W-RP)/2,y:TOP+13,'text-anchor':'middle','font-size':'10',fill:'#94a3b8','font-weight':'600'});jl.textContent='APPROACH TOUCH';svg.appendChild(jl)
    if(pStand){
      const hy=pStand.top+STAND_HEAD_FRAC*pStand.height
      svg.appendChild(el('line',{x1:pStand.left-4,y1:hy,x2:pStand.left+pStand.width+4,y2:hy,stroke:'#1e293b','stroke-width':'1.5'}))
      const hl=el('text',{x:pStand.left-8,y:hy+4,'text-anchor':'end','font-size':'10',fill:'#1e293b','font-weight':'500'});hl.textContent=fi(pH);svg.appendChild(hl)
    }
    if(gStand&&co.length){const hy=gStand.top+STAND_HEAD_FRAC*gStand.height;svg.appendChild(el('line',{x1:gStand.left-4,y1:hy,x2:gStand.left+gStand.width+4,y2:hy,stroke:'#94a3b8','stroke-width':'1','stroke-dasharray':'4,3'}))}
    if(pJump){
      svg.appendChild(el('line',{x1:pJump.left-4,y1:pJump.tipY,x2:pJump.left+pJump.width*.85,y2:pJump.tipY,stroke:'#e11d48','stroke-width':'2'}))
      const al=el('text',{x:pJump.left+pJump.width*.88,y:pJump.tipY+4,'font-size':'10',fill:above>=0?'#16a34a':'#dc2626','font-weight':'500'});al.textContent=`${above>=0?'+':''}${above.toFixed(1)}" vs net`;svg.appendChild(al)
    }
    if(gJump&&co.length){svg.appendChild(el('line',{x1:gJump.left-4,y1:gJump.tipY,x2:gJump.left+gJump.width*.85,y2:gJump.tipY,stroke:'#94a3b8','stroke-width':'1','stroke-dasharray':'4,3'}))}
    const nl=el('text',{x:NET_LABEL_X,y:yp(net)-8,'font-size':'11',fill:'#1d4ed8','font-weight':'500'});nl.textContent=`Net ${fi(net)}`;svg.appendChild(nl)
    const pnl=el('text',{x:standCX,y:TOP+cH+16,'text-anchor':'middle','font-size':'11',fill:'#0f172a','font-weight':'600'});pnl.textContent=`${sp.name.split(' ')[0]}  ${fi(pH)}`;svg.appendChild(pnl)
    if(co.length&&aH>0){const dH=pH-aH;const dl=el('text',{x:standCX,y:TOP+cH+28,'text-anchor':'middle','font-size':'10',fill:dH>=0?'#16a34a':'#dc2626'});dl.textContent=`${dH>=0?'+':''}${dH.toFixed(1)}" vs ${GROUP_LABELS[group]} (${fi(aH)})`;svg.appendChild(dl)}
    const jnl=el('text',{x:jumpCX,y:TOP+cH+16,'text-anchor':'middle','font-size':'11',fill:'#0f172a','font-weight':'600'});jnl.textContent=`${sp.name.split(' ')[0]}  reach ${fi(pAV)}`;svg.appendChild(jnl)
    if(co.length&&aAV>0){const dAV=pAV-aAV;const dl=el('text',{x:jumpCX,y:TOP+cH+28,'text-anchor':'middle','font-size':'10',fill:dAV>=0?'#16a34a':'#dc2626'});dl.textContent=`${dAV>=0?'+':''}${dAV.toFixed(1)}" vs ${GROUP_LABELS[group]} (${fi(aAV)})`;svg.appendChild(dl)}
    const legY=TOP+26,legX=LP+6
    svg.appendChild(el('rect',{x:legX,y:legY-8,width:10,height:10,rx:2,fill:'#1e293b'}))
    const ll1=el('text',{x:legX+13,y:legY+1,'font-size':'10',fill:'#475569'});ll1.textContent=sp.name.split(' ')[0];svg.appendChild(ll1)
    if(co.length){svg.appendChild(el('rect',{x:legX,y:legY+8,width:10,height:10,rx:2,fill:'#94a3b8'}));const ll2=el('text',{x:legX+13,y:legY+17,'font-size':'10',fill:'#94a3b8'});ll2.textContent=GROUP_LABELS[group]??'Avg';svg.appendChild(ll2)}
  },[selId,gender,group,players])

  return(
    <div style={{padding:'2rem',maxWidth:860}}>
      <div style={{marginBottom:'1.25rem'}}>
        <h1 style={{fontFamily:'var(--font-display)',fontSize:'2rem',fontWeight:800,marginBottom:'.25rem'}}>Player Comparisons</h1>
        <p style={{color:'var(--text-muted)',fontSize:'.85rem'}}>Standing height and approach touch vs net</p>
      </div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end',marginBottom:'0.75rem'}}>
        <div style={{display:'flex',flexDirection:'column',gap:3}}>
          <label style={{fontSize:13,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em'}}>Net</label>
          <select className="input" value={gender} onChange={e=>{const g=e.target.value as 'F'|'M';setGender(g);const first=players.find(p=>{const pg=p.gender??(p.teamName?.toLowerCase().includes('boy')?'M':'F');return pg===g});if(first)setSelId(first.id)}} style={{fontSize:13}}>
            <option value="F">Girls — 7'4.25"</option>
            <option value="M">Boys — 7'11.5"</option>
          </select>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:3,minWidth:220}}>
          <label style={{fontSize:13,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em'}}>Player</label>
          <select className="input" value={selId} onChange={e=>setSelId(e.target.value)} style={{fontSize:13}}>
            {filteredByGender.map(p=><option key={p.id} value={p.id}>{p.name} ({p.teamName})</option>)}
          </select>
        </div>
      </div>
      <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:12,alignItems:'center',fontSize:12,color:'var(--text-muted)'}}>
        <span>Compare to:</span>
        {(Object.entries(GROUP_LABELS) as [CompGroup,string][]).map(([g,label])=>(
          <button key={g} onClick={()=>setGroup(g)} className={group===g?'btn-volt':'btn-ghost'} style={{fontSize:12,padding:'3px 10px',borderRadius:20}}>{label}</button>
        ))}
      </div>
      {loading?<div style={{color:'var(--text-muted)',padding:'2rem'}}>Loading players…</div>
      :!sp?<div style={{color:'var(--text-muted)',padding:'2rem',fontSize:'.9rem'}}>No players with measurements found. Go to <strong>Coach → Players → [player name]</strong> and enter height and approach touch.</div>
      :(
        <div style={{position:'relative',width:'100%',aspectRatio:`${W}/${H}`,border:'.5px solid var(--gray-border)',borderRadius:12,overflow:'hidden',background:'#fff'}}>
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{position:'absolute',inset:0,width:'100%',height:'100%',zIndex:1}} />

          <img src={NET_URL} alt="net" style={{position:'absolute',left:NET_L,top:gender==='M'?NET_T_BOYS:NET_T,width:NET_W,height:gender==='M'?NET_H_BOYS:NET_H_GIRLS,objectFit:'fill',objectPosition:'left top',zIndex:2,pointerEvents:'none'}} />

          {gStand&&co.length>0&&<img src={STAND_URL} alt="" style={{position:'absolute',left:p2l(gStand.left),top:p2t(gStand.top),width:p2w(gStand.width),height:p2h(gStand.height),opacity:.35,mixBlendMode:'multiply',zIndex:3,pointerEvents:'none'}} />}
          {gJump&&co.length>0&&<img src={JUMP_URL} alt="" style={{position:'absolute',left:p2l(gJump.left),top:p2t(gJump.top),width:p2w(gJump.width),height:p2h(gJump.height),opacity:.35,mixBlendMode:'multiply',zIndex:3,pointerEvents:'none'}} />}
          {pStand&&<img src={STAND_URL} alt="player standing" style={{position:'absolute',left:p2l(pStand.left),top:p2t(pStand.top),width:p2w(pStand.width),height:p2h(pStand.height),mixBlendMode:'multiply',zIndex:4,pointerEvents:'none'}} />}
          {pJump&&<img src={JUMP_URL} alt="player jumping" style={{position:'absolute',left:p2l(pJump.left),top:p2t(pJump.top),width:p2w(pJump.width),height:p2h(pJump.height),mixBlendMode:'multiply',zIndex:4,pointerEvents:'none'}} />}
        </div>
      )}
      {sp&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:8,marginTop:12}}>
          {[
            {label:'Height',val:fi(pH),diff:aH2!=null?pH-aH2:null},
            {label:'Standing reach',val:fi(sp.standing_reach_in??0),diff:null},
            {label:'Approach touch',val:fi(pAV),diff:aAV2!=null?pAV-aAV2:null},
            {label:above>=0?'Above net':'Below net',val:fi(Math.abs(above)),diff:null,color:above>=0?'var(--success)':'var(--danger)'},
            ...(co.length?[{label:GROUP_LABELS[group],val:`${co.length} players`,diff:null,sub:`avg reach ${fi(aAV2??0)}`}]:[]),
          ].map((s,i)=>(
            <div key={i} style={{background:'var(--white)',border:'1.5px solid var(--gray-border)',borderRadius:8,padding:'9px 12px'}}>
              <div style={{fontSize:19,fontWeight:500,color:s.color??'var(--black)'}}>{s.val}</div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{s.label}</div>
              {s.diff!=null&&<div style={{fontSize:11,marginTop:2,color:s.diff>=0?'var(--success)':'var(--danger)'}}>{s.diff>=0?'+':''}{s.diff.toFixed(1)}" vs avg</div>}
              {s.sub&&<div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{s.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
