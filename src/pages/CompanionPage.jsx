import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { TUNNELS } from '../data/mock.js'

const PHASES = {
  inhale: { label:'들이쉬기',  sec:4, next:'hold' },
  hold:   { label:'잠깐 멈춤', sec:2, next:'exhale' },
  exhale: { label:'내쉬기',    sec:6, next:'rest' },
  rest:   { label:'잠깐 쉬기', sec:1, next:'inhale' },
}
const DEFAULT_TUNNEL = TUNNELS.find(t => t.name === '미시령터널')

export default function CompanionPage() {
  const nav = useNavigate()
  const tunnel = useLocation().state?.tunnel ?? DEFAULT_TUNNEL
  const TUNNEL_LEN = tunnel.lengthM
  const [companionStep, setCompanionStep] = useState('breathing')
  const [phase, setPhase] = useState('inhale')
  const [count, setCount] = useState(4)
  const [pct, setPct] = useState(0)
  const [viz, setViz] = useState('ripple')
  const phaseRef = useRef('inhale')
  const countRef = useRef(4)

  useEffect(() => {
    if (companionStep !== 'breathing') return
    const t = setInterval(() => {
      countRef.current -= 1
      if (countRef.current <= 0) {
        const next = PHASES[phaseRef.current].next
        phaseRef.current = next
        countRef.current = PHASES[next].sec
        setPhase(next)
        setCount(PHASES[next].sec)
      } else { setCount(countRef.current) }
    }, 1000)
    return () => clearInterval(t)
  }, [companionStep])

  useEffect(() => {
    if (companionStep !== 'breathing') return
    const t = setInterval(() => setPct(p => Math.min(p + 100/30, 100)), 1000)
    return () => clearInterval(t)
  }, [companionStep])

  useEffect(() => {
    if (pct >= 99.5) setCompanionStep('complete')
  }, [pct])

  const remain = Math.round(TUNNEL_LEN * (1 - pct / 100))
  const orbScale = (phase === 'inhale' || phase === 'hold') ? 1.18 : 0.85

  if (companionStep === 'complete') {
    return (
      <div style={{ position:'fixed', inset:0, zIndex:60, background:'#fff', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0 28px', fontFamily:'Pretendard, sans-serif' }}>
        <div style={{ width:78, height:78, borderRadius:'50%', background:'#EAF7EF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:34 }}>✓</div>
        <p style={{ fontSize:19, fontWeight:800, marginTop:18, color:'#16242E' }}>통과 완료했어요</p>
        <p style={{ fontSize:12.5, color:'#6B7A85', marginTop:8, lineHeight:1.6, textAlign:'center' }}>{tunnel.name}을 무사히 지났습니다.<br />오늘도 한 걸음 나아갔어요.</p>
        <div style={{ display:'flex', gap:12, marginTop:24, width:'100%', maxWidth:320 }}>
          <div style={{ flex:1, background:'#F6F8FA', borderRadius:11, padding:12, textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:17, color:'#0E5E58' }}>3:14</div>
            <div style={{ fontSize:11, color:'#8A98A2', marginTop:3 }}>통과 시간</div>
          </div>
          <div style={{ flex:1, background:'#F6F8FA', borderRadius:11, padding:12, textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:17, color:'#0E5E58' }}>7회</div>
            <div style={{ fontSize:11, color:'#8A98A2', marginTop:3 }}>누적 통과</div>
          </div>
        </div>
        <div style={{ background:'#ECF6F4', border:'1px solid #CBE6E0', borderRadius:11, padding:'11px 13px', display:'flex', alignItems:'center', gap:9, marginTop:16, width:'100%', maxWidth:320 }}>
          <span style={{ fontSize:15 }}>📨</span>
          <span style={{ fontSize:11, color:'#0E5E58' }}>보호자(가족)에게 통과 완료 알림을 보냈어요</span>
        </div>
        <button onClick={() => nav('/home')} style={{ background:'#14807A', height:44, borderRadius:12, color:'#fff', fontWeight:800, fontSize:14, width:'100%', maxWidth:320, marginTop:24, cursor:'pointer' }}>여정 계속하기</button>
      </div>
    )
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:60, background:'#0E5E58', color:'#EAF6F4', display:'flex', flexDirection:'column', fontFamily:'Pretendard, sans-serif', overflow:'hidden' }}>
      {/* 상단 바 */}
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'20px 28px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
          <span style={{ width:9, height:9, borderRadius:'50%', background:'#8DE0C2', animation:'pulse 2s ease-in-out infinite' }} />
          <span style={{ fontSize:13, color:'#BFE6E0', fontWeight:600 }}>보호자 김민준 님께 실시간 위치 공유 중</span>
        </div>
        <button onClick={() => nav(-1)} style={{ marginLeft:'auto', border:'1px solid rgba(255,255,255,.22)', background:'rgba(255,255,255,.08)', color:'#EAF6F4', fontWeight:700, fontSize:14, padding:'9px 16px', borderRadius:11, cursor:'pointer' }}>나가기 ✕</button>
      </div>

      {/* 터널 진행도 */}
      <div style={{ padding:'0 28px', maxWidth:560, width:'100%', margin:'0 auto', flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8 }}>
          <span style={{ fontSize:11, color:'#8FD8CF' }}>{tunnel.name} 통과 중</span>
          <span style={{ fontSize:14, color:'#9FCFCB' }}>남은 거리 <strong style={{ color:'#8DE0C2' }}>{pct >= 99.5 ? '통과 완료! 🎉' : `${remain.toLocaleString()}m`}</strong></span>
        </div>
        <div style={{ height:8, borderRadius:99, background:'rgba(255,255,255,.13)', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#4FAEB8,#8DE0C2)', borderRadius:99, transition:'width .3s linear' }} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontSize:12, color:'#7FB0AC' }}>
          <span>진입</span><span>왕복 {tunnel.lanes}차로 · {tunnel.lengthM.toLocaleString()}m</span><span>출구</span>
        </div>
      </div>

      {/* 호흡 비주얼라이저 */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, minHeight:0, padding:'0 20px' }}>
        {viz === 'ripple' && (
          <div style={{ position:'relative', width:280, height:280, display:'flex', alignItems:'center', justifyContent:'center' }}>
            {[0, 1.7, 3.4].map(d => (
              <span key={d} style={{ position:'absolute', width:160, height:160, border:'2px solid rgba(141,224,194,.45)', borderRadius:'50%', animation:`ripple 5s ease-out ${d}s infinite` }} />
            ))}
            <div style={{ width:160, height:160, borderRadius:'50%', background:'radial-gradient(circle at 38% 32%,#7FE0CC,#2D9D9B)', boxShadow:'0 0 60px rgba(111,215,196,.4)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', transform:`scale(${orbScale})`, transition:'transform .8s ease' }}>
              <span style={{ fontSize:52, fontWeight:800, color:'#06343B', lineHeight:1 }}>{count}</span>
              <span style={{ fontSize:10.5, color:'#8FD8CF', marginTop:8 }}>남은 거리 {remain.toLocaleString()}m</span>
            </div>
          </div>
        )}
        {viz === 'wave' && (
          <div style={{ position:'relative', width:440, height:240, display:'flex', alignItems:'center', justifyContent:'center', maxWidth:'100%' }}>
            <svg viewBox="0 0 600 240" style={{ width:'100%', height:'100%' }}>
              <path d={`M0 120 Q75 ${orbScale > 1 ? 78 : 152} 150 120 T300 120 T450 120 T600 120`} fill="none" stroke="#8DE0C2" strokeWidth="5" strokeLinecap="round" style={{ transition:'d .8s ease' }} />
              <path d={`M0 120 Q75 ${orbScale > 1 ? 152 : 78} 150 120 T300 120 T450 120 T600 120`} fill="none" stroke="rgba(79,174,184,.5)" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span style={{ position:'absolute', fontSize:52, fontWeight:800, color:'#EAF6F4' }}>{count}</span>
          </div>
        )}
        {viz === 'tide' && (
          <div style={{ position:'relative', width:200, height:200, borderRadius:'50%', border:'3px solid rgba(141,224,194,.4)', overflow:'hidden', background:'rgba(255,255,255,.04)' }}>
            <div style={{ position:'absolute', left:0, right:0, bottom:0, height:`${orbScale > 1 ? 70 : 30}%`, background:'linear-gradient(180deg,#4FAEB8,#2D8C97)', transition:'height 1s linear' }} />
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:52, fontWeight:800, color:'#EAF6F4', zIndex:1 }}>{count}</div>
          </div>
        )}
        <p style={{ fontSize:22, fontWeight:800, marginTop:12 }}>{PHASES[phase].label}</p>
        <p style={{ fontSize:13, color:'rgba(234,246,244,.5)', fontWeight:500 }}>들이쉬기 4초 · 멈춤 2초 · 내쉬기 6초</p>
      </div>

      {/* 컨트롤 */}
      <div style={{ flexShrink:0, padding:'16px 28px 32px', display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
          {[['ripple','물결 파동'],['wave','음파'],['tide','차오름']].map(([k,l]) => (
            <button key={k} onClick={() => setViz(k)} style={{ border:`1px solid ${viz===k?'rgba(141,224,194,.4)':'rgba(255,255,255,.15)'}`, background: viz===k?'rgba(141,224,194,.18)':'rgba(255,255,255,.06)', color: viz===k?'#8DE0C2':'rgba(234,246,244,.6)', fontSize:13, fontWeight:600, padding:'8px 16px', borderRadius:99, cursor:'pointer' }}>{l}</button>
          ))}
        </div>
        <button style={{ height:42, border:'1px solid rgba(255,255,255,.25)', borderRadius:12, color:'rgba(255,255,255,.9)', background:'transparent', fontWeight:700, fontSize:14, cursor:'pointer' }}>일시 정지</button>
      </div>
    </div>
  )
}
