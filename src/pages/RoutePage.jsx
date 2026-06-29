import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { TUNNELS } from '../data/mock.js'

const RECENT = ['속초 해수욕장', '양양 낙산사', '강릉 경포해변']
const DEFAULT_TUNNEL = TUNNELS.find(t => t.name === '미시령터널')

const MOCK_RESULT = {
  avoid: {
    durationMin: 192, distanceKm: 238, tunnelCount: 0,
    waypoints: ['영동고속 → 7번 국도 진입', '동해안 해안 라인 경유'],
  },
  shortest: {
    durationMin: 170, distanceKm: 216, tunnelCount: 4,
    tunnelNames: ['대관령1터널', '둔내터널'],
  },
}

export default function RoutePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const tunnel = location.state?.tunnel ?? DEFAULT_TUNNEL

  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState(location.state?.dest ?? '')
  const [step, setStep] = useState('input')
  const [selectedRoute, setSelectedRoute] = useState('avoid')
  const [loading, setLoading] = useState(false)
  const route = MOCK_RESULT[selectedRoute]

  const search = () => {
    if (!origin.trim() || !dest.trim()) return
    setLoading(true)
    setTimeout(() => { setLoading(false); setStep('compare') }, 700)
  }

  if (step === 'input') {
    return (
      <div style={{ maxWidth:680, margin:'0 auto', padding:'30px 26px 80px' }}>
        <h1 style={{ fontSize:28, fontWeight:800, letterSpacing:'-0.8px', marginBottom:6 }}>안심 경로 길찾기</h1>
        <p style={{ fontSize:15, color:'#5B6C78', marginBottom:22 }}>출발지와 목적지를 입력하면 터널 회피 경로와 최단 경로를 비교해드려요.</p>

        <div style={{ background:'#F6F8FA', border:'1px solid #E4EAEF', borderRadius:13, padding:'5px 13px', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:11, padding:'12px 0' }}>
            <span style={{ width:9, height:9, borderRadius:'50%', background:'#14807A', flexShrink:0 }} />
            <input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="서울 (출발)"
              style={{ flex:1, border:'none', background:'transparent', fontSize:13, fontWeight:600, color:'#16242E' }} />
          </div>
          <div style={{ borderBottom:'1px solid #E9EDF1' }} />
          <div style={{ display:'flex', alignItems:'center', gap:11, padding:'12px 0' }}>
            <span style={{ width:9, height:9, borderRadius:'50%', background:'#D45B4E', flexShrink:0 }} />
            <input value={dest} onChange={e => setDest(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="강릉시 경포해변"
              style={{ flex:1, border:'none', background:'transparent', fontSize:13, fontWeight:600, color:'#16242E' }} />
          </div>
        </div>

        <button onClick={search} disabled={!origin.trim() || !dest.trim() || loading}
          style={{ height:44, borderRadius:12, background:'#14807A', color:'#fff', fontWeight:800, fontSize:13.5, width:'100%', marginTop:16, cursor:'pointer', opacity: (!origin.trim() || !dest.trim() || loading) ? 0.45 : 1 }}>
          안심 경로 찾기
        </button>

        <div style={{ marginTop:22 }}>
          <p style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'#8A98A2', letterSpacing:'0.05em', marginBottom:10 }}>최근 검색</p>
          {RECENT.map(item => (
            <div key={item} onClick={() => setDest(item)}
              style={{ display:'flex', gap:10, padding:'9px 0', borderBottom:'1px solid #F0F3F5', cursor:'pointer' }}>
              <span style={{ fontSize:14 }}>🕓</span>
              <span style={{ fontSize:12.5, color:'#5B6C78' }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (step === 'compare') {
    return (
      <div style={{ maxWidth:720, margin:'0 auto', padding:'30px 26px 80px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
          <span onClick={() => setStep('input')} style={{ fontSize:20, color:'#8A98A2', cursor:'pointer' }}>‹</span>
          <span style={{ fontSize:14, fontWeight:700 }}>{origin} → {dest}</span>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:11 }}>
          <div onClick={() => { setSelectedRoute('avoid'); setStep('detail') }}
            style={{ position:'relative', border:'2px solid #14807A', borderRadius:13, padding:'13px 14px', background:'#F7FBFA', cursor:'pointer' }}>
            <span style={{ position:'absolute', top:-9, left:13, fontSize:9, fontWeight:800, color:'#fff', background:'#14807A', borderRadius:6, padding:'4px 8px' }}>추천 · 안심</span>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontWeight:800, fontSize:14 }}>터널 회피 루트</span>
              <span style={{ fontSize:11, fontWeight:700, color:'#2E7D4F', background:'#EAF7EF', borderRadius:99, padding:'4px 10px' }}>터널 0개</span>
            </div>
            <div style={{ display:'flex', gap:14, marginTop:10 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:16 }}>3시간 12분</div>
                <div style={{ fontSize:10.5, color:'#8A98A2' }}>소요 시간</div>
              </div>
              <div>
                <div style={{ fontWeight:800, fontSize:16 }}>+22분</div>
                <div style={{ fontSize:10.5, color:'#8A98A2' }}>최단 대비</div>
              </div>
            </div>
            <p style={{ fontSize:10.5, color:'#5B6C78', marginTop:10, lineHeight:1.5 }}>7번 국도 동해안 라인 경유 · 터널 노출 없음</p>
          </div>

          <div onClick={() => { setSelectedRoute('shortest'); setStep('detail') }}
            style={{ border:'1px solid #E4EAEF', borderRadius:13, padding:'13px 14px', cursor:'pointer' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontWeight:800, fontSize:14, color:'#5B6C78' }}>최단 루트</span>
              <span style={{ fontSize:11, fontWeight:700, color:'#A53E33', background:'#FBEAE7', borderRadius:99, padding:'4px 10px' }}>터널 4개</span>
            </div>
            <div style={{ display:'flex', gap:14, marginTop:10 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:16, color:'#5B6C78' }}>2시간 50분</div>
                <div style={{ fontSize:10.5, color:'#8A98A2' }}>소요 시간</div>
              </div>
              <div>
                <div style={{ fontWeight:800, fontSize:16, color:'#A53E33' }}>난이도 5</div>
                <div style={{ fontSize:10.5, color:'#8A98A2' }}>최고 터널</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:4, marginTop:11 }}>
              {MOCK_RESULT.shortest.tunnelNames.slice(0, 2).map(name => (
                <span key={name} style={{ fontSize:9, color:'#A53E33', background:'#FBEAE7', borderRadius:5, padding:'4px 6px' }}>{name}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'30px 26px 80px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span onClick={() => setStep('compare')} style={{ fontSize:20, color:'#8A98A2', cursor:'pointer' }}>‹</span>
        <span style={{ fontSize:14, fontWeight:700 }}>{origin} → {dest}</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:24, marginTop:20 }}>
        <div style={{ position:'relative', borderRadius:14, overflow:'hidden', minHeight:420, background:'#EAF0F3', border:'1px solid #E4EAEF' }}>
          <svg viewBox="0 0 500 400" preserveAspectRatio="none" style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}>
            {selectedRoute === 'avoid' ? (
              <path d="M70 360 C 220 330, 250 160, 440 110" fill="none" stroke="#14807A" strokeWidth={6} strokeLinecap="round" strokeDasharray="2 11" />
            ) : (
              <path d="M70 360 C 200 300, 300 280, 440 110" fill="none" stroke="#C3CDD5" strokeWidth={5} strokeLinecap="round" />
            )}
          </svg>

          <div style={{ position:'absolute', left:58, top:348, width:26, height:26, borderRadius:'50%', background:'#fff', border:'4px solid #14807A' }} />
          <div style={{ position:'absolute', left:428, top:98, width:26, height:26, borderRadius:'50%', background:'#fff', border:'4px solid #D45B4E' }} />

          {selectedRoute === 'shortest' && (
            <div style={{ position:'absolute', left:236, top:286, fontSize:9, fontWeight:700, color:'#A53E33', background:'#fff', border:'1px solid #E3A99F', borderRadius:6, padding:'4px 7px' }}>
              대관령1터널 · 난이도5
            </div>
          )}

          <div style={{ position:'absolute', top:18, left:20, fontSize:11, fontWeight:700, color:'#5B6C78', background:'rgba(255,255,255,.9)', borderRadius:7, padding:'6px 10px' }}>
            {selectedRoute === 'avoid' ? '터널 회피 루트' : '최단 루트'}
          </div>
        </div>

        <div>
          <div style={{ display:'flex', gap:16, marginBottom:14 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:19 }}>
                {route.durationMin >= 60 ? `${Math.floor(route.durationMin / 60)}:${String(route.durationMin % 60).padStart(2, '0')}` : `${route.durationMin}분`}
              </div>
              <div style={{ fontSize:10, color:'#8A98A2', marginTop:4 }}>소요</div>
            </div>
            <div>
              <div style={{ fontWeight:800, fontSize:19 }}>{route.distanceKm}km</div>
              <div style={{ fontSize:10, color:'#8A98A2', marginTop:4 }}>거리</div>
            </div>
            <div>
              <div style={{ fontWeight:800, fontSize:19, color: selectedRoute === 'avoid' ? '#2E7D4F' : '#A53E33' }}>{route.tunnelCount}개</div>
              <div style={{ fontSize:10, color:'#8A98A2', marginTop:4 }}>터널</div>
            </div>
          </div>

          {selectedRoute === 'avoid' && (
            <div style={{ background:'#ECF6F4', border:'1px solid #CBE6E0', borderRadius:11, padding:'11px 13px', display:'flex', alignItems:'center', gap:9 }}>
              <span style={{ fontSize:15 }}>🛡️</span>
              <span style={{ fontSize:11, fontWeight:600, color:'#0E5E58', lineHeight:1.45 }}>이 경로는 터널 노출이 없어 동반 모드 없이 주행할 수 있어요</span>
            </div>
          )}

          {selectedRoute === 'shortest' && (
            <div style={{ background:'#FBEAE7', border:'1px solid #E3A99F', borderRadius:11, padding:'11px 13px', display:'flex', alignItems:'center', gap:9 }}>
              <span style={{ fontSize:15 }}>⚠️</span>
              <span style={{ fontSize:11, fontWeight:600, color:'#A53E33', lineHeight:1.45 }}>터널 통과 구간이 있어요. 동반 모드를 켜고 주행하세요.</span>
            </div>
          )}

          {selectedRoute === 'avoid' && (
            <>
              <p style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'#8A98A2', letterSpacing:'0.05em', margin:'15px 0 9px' }}>주요 경유</p>
              {MOCK_RESULT.avoid.waypoints.map(wp => (
                <div key={wp} style={{ display:'flex', alignItems:'center', gap:9, fontSize:11.5, color:'#5B6C78', marginBottom:6 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'#C3CDD5', flexShrink:0 }} />
                  {wp}
                </div>
              ))}
            </>
          )}

          <button
            onClick={() => navigate('/navigating', {
              state: {
                origin, dest, durationMin: route.durationMin, distanceKm: route.distanceKm,
                ...(selectedRoute === 'shortest' ? { tunnel } : {}),
              },
            })}
            style={{
              marginTop:20, height:44, borderRadius:11, width:'100%', fontWeight:800, fontSize:13.5, cursor:'pointer',
              background: selectedRoute === 'avoid' ? '#14807A' : '#D45B4E', color:'#fff',
            }}>
            {selectedRoute === 'avoid' ? '회피 루트로 길안내' : '이 경로로 출발하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
