import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { TUNNELS, REGIONS } from '../data/mock.js'
import MockStreetMap from '../components/MockStreetMap.jsx'
import PlaceAutocomplete from '../components/PlaceAutocomplete.jsx'
import { loadKakaoMaps, resolvePlace, haversineM } from '../lib/kakaoMap.js'

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY
const RECENT = ['속초 해수욕장', '양양 낙산사', '강릉 경포해변']

// 카카오 키가 없거나 지오코딩이 실패했을 때만 쓰는 목업 결과값 (기존 데모 그대로 유지)
const MOCK_RESULT = {
  avoid: {
    durationMin: 192, distanceKm: 238, tunnelCount: 0,
    waypoints: ['영동고속 → 7번 국도 진입', '동해안 해안 라인 경유'],
  },
  shortest: {
    durationMin: 170, distanceKm: 216, tunnelCount: 2,
    tunnels: [TUNNELS.find(t => t.name === '대관령1터널'), TUNNELS.find(t => t.name === '둔내터널')],
  },
}

// 출발지·목적지 실좌표로 거리(직선거리 보정)·소요시간을 추정하고,
// 목적지가 속한 강원 시군을 매칭해 그 지역에 실제로 등록된 터널들을 "최단 루트"에 연결한다.
async function computeRouteResult(originStr, destStr) {
  if (!KAKAO_KEY) return null
  try {
    const kakao = await loadKakaoMaps(KAKAO_KEY)
    const [originPlace, destPlace] = await Promise.all([resolvePlace(kakao, originStr), resolvePlace(kakao, destStr)])
    if (!originPlace || !destPlace) return null

    const straightKm = haversineM(originPlace, destPlace) / 1000
    const region = REGIONS.find(r => destPlace.address.includes(r.name) || destPlace.name.includes(r.name) || destStr.includes(r.name))
    const tunnels = region ? TUNNELS.filter(t => t.region === region.name) : []

    const avoidKm = Math.max(1, Math.round(straightKm * 1.3))
    const shortestKm = Math.max(1, Math.round(straightKm * 1.15))

    return {
      avoid: {
        durationMin: Math.max(5, Math.round((avoidKm / 62) * 60)), distanceKm: avoidKm, tunnelCount: 0,
        waypoints: [`${originStr} 출발`, `${destStr} 방면 국도·해안도로 경유`],
      },
      shortest: {
        durationMin: Math.max(5, Math.round((shortestKm / 78) * 60)), distanceKm: shortestKm,
        tunnelCount: tunnels.length, tunnels,
      },
    }
  } catch {
    return null
  }
}

export default function RoutePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const courseMode = !!location.state?.courseMode
  const courseTitle = location.state?.courseTitle
  const waypoints = location.state?.waypoints ?? []
  const courseDistance = location.state?.distance
  const courseTunnelTag = location.state?.tunnelTag

  const [origin, setOrigin] = useState(location.state?.origin ?? '')
  const [dest, setDest] = useState(location.state?.dest ?? '')
  const [step, setStep] = useState(courseMode ? 'course' : 'input')
  const [selectedRoute, setSelectedRoute] = useState('avoid')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(MOCK_RESULT)
  const route = result[selectedRoute]
  const tunnels = route.tunnels ?? []

  const search = async () => {
    if (!origin.trim() || !dest.trim()) return
    setLoading(true)
    const real = await computeRouteResult(origin.trim(), dest.trim())
    setResult(real ?? MOCK_RESULT)
    setLoading(false)
    setStep('compare')
  }

  if (step === 'course') {
    const allSpots = [origin, ...waypoints, dest]
    return (
      <div style={{ maxWidth:640, margin:'0 auto', padding:'30px 26px 80px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
          <span onClick={() => navigate(-1)} style={{ fontSize:20, color:'#8A98A2', cursor:'pointer' }}>‹</span>
          <span style={{ fontSize:14, fontWeight:700 }}>{courseTitle ?? `${origin} → ${dest}`}</span>
        </div>

        <div style={{ borderRadius:14, overflow:'hidden', height:300, border:'1px solid #E4EAEF', marginBottom:20 }}>
          <MockStreetMap
            showPath
            markers={allSpots.map((name, i) => ({
              id:`${i}`, label:String(i + 1), query:name,
              color: i === 0 ? '#14807A' : i === allSpots.length - 1 ? '#D45B4E' : '#8A98A2',
            }))}
          />
        </div>

        <div style={{ display:'flex', gap:16, marginBottom:14 }}>
          {courseDistance && (
            <div>
              <div style={{ fontWeight:800, fontSize:19 }}>{courseDistance}</div>
              <div style={{ fontSize:10, color:'#8A98A2', marginTop:4 }}>총 거리</div>
            </div>
          )}
          <div>
            <div style={{ fontWeight:800, fontSize:19 }}>{allSpots.length}곳</div>
            <div style={{ fontSize:10, color:'#8A98A2', marginTop:4 }}>경유지</div>
          </div>
          {courseTunnelTag && (
            <div>
              <div style={{ fontWeight:800, fontSize:19, color:'#2E7D4F' }}>{courseTunnelTag}</div>
              <div style={{ fontSize:10, color:'#8A98A2', marginTop:4 }}>터널</div>
            </div>
          )}
        </div>

        <p style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'#8A98A2', letterSpacing:'0.05em', margin:'0 0 9px' }}>순서대로 경유</p>
        {allSpots.map((name, i) => (
          <div key={`${name}-${i}`} style={{ display:'flex', alignItems:'center', gap:9, fontSize:12.5, color:'#16242E', fontWeight:600, marginBottom:8 }}>
            <span style={{ width:19, height:19, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#fff',
              background: i === 0 ? '#14807A' : i === allSpots.length - 1 ? '#D45B4E' : '#8A98A2' }}>{i + 1}</span>
            {name}
          </div>
        ))}

        <button
          onClick={() => navigate('/navigating', { state: { origin, dest, waypoints } })}
          style={{ marginTop:20, height:44, borderRadius:11, width:'100%', fontWeight:800, fontSize:13.5, cursor:'pointer', background:'#14807A', color:'#fff' }}>
          이 코스로 출발하기
        </button>
      </div>
    )
  }

  if (step === 'input') {
    return (
      <div style={{ maxWidth:680, margin:'0 auto', padding:'30px 26px 80px' }}>
        <h1 style={{ fontSize:28, fontWeight:800, letterSpacing:'-0.8px', marginBottom:6 }}>안심 경로 길찾기</h1>
        <p style={{ fontSize:15, color:'#5B6C78', marginBottom:22 }}>터널 회피 경로와 최단 경로 비교 제공</p>

        <div style={{ background:'#F6F8FA', border:'1px solid #E4EAEF', borderRadius:13, padding:'5px 13px', marginBottom:16 }}>
          <div style={{ padding:'12px 0' }}>
            <PlaceAutocomplete value={origin} onChange={setOrigin} dotColor="#14807A" placeholder="서울 (출발)" />
          </div>
          <div style={{ borderBottom:'1px solid #E9EDF1' }} />
          <div style={{ padding:'12px 0' }}>
            <PlaceAutocomplete value={dest} onChange={setDest} onEnter={search} dotColor="#D45B4E" placeholder="강릉시 경포해변" />
          </div>
        </div>

        <button onClick={search} disabled={!origin.trim() || !dest.trim() || loading}
          style={{ height:44, borderRadius:12, background:'#14807A', color:'#fff', fontWeight:800, fontSize:13.5, width:'100%', marginTop:16, cursor:'pointer', opacity: (!origin.trim() || !dest.trim() || loading) ? 0.45 : 1 }}>
          {loading ? '경로 계산 중...' : '안심 경로 찾기'}
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
    const topDiff = tunnels.length ? Math.max(...tunnels.map(t => t.diff)) : null
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
                <div style={{ fontWeight:800, fontSize:16 }}>
                  {result.avoid.durationMin >= 60 ? `${Math.floor(result.avoid.durationMin / 60)}시간 ${result.avoid.durationMin % 60}분` : `${result.avoid.durationMin}분`}
                </div>
                <div style={{ fontSize:10.5, color:'#8A98A2' }}>소요 시간</div>
              </div>
              <div>
                <div style={{ fontWeight:800, fontSize:16 }}>{result.avoid.distanceKm - result.shortest.distanceKm >= 0 ? '+' : ''}{result.avoid.durationMin - result.shortest.durationMin}분</div>
                <div style={{ fontSize:10.5, color:'#8A98A2' }}>최단 대비</div>
              </div>
            </div>
            <p style={{ fontSize:10.5, color:'#5B6C78', marginTop:10, lineHeight:1.5 }}>{dest} 방면 국도·해안도로 경유 · 터널 노출 없음</p>
          </div>

          <div onClick={() => { setSelectedRoute('shortest'); setStep('detail') }}
            style={{ border:'1px solid #E4EAEF', borderRadius:13, padding:'13px 14px', cursor:'pointer' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontWeight:800, fontSize:14, color:'#5B6C78' }}>최단 루트</span>
              <span style={{ fontSize:11, fontWeight:700, color:'#A53E33', background:'#FBEAE7', borderRadius:99, padding:'4px 10px' }}>터널 {result.shortest.tunnelCount}개</span>
            </div>
            <div style={{ display:'flex', gap:14, marginTop:10 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:16, color:'#5B6C78' }}>
                  {result.shortest.durationMin >= 60 ? `${Math.floor(result.shortest.durationMin / 60)}시간 ${result.shortest.durationMin % 60}분` : `${result.shortest.durationMin}분`}
                </div>
                <div style={{ fontSize:10.5, color:'#8A98A2' }}>소요 시간</div>
              </div>
              {topDiff && (
                <div>
                  <div style={{ fontWeight:800, fontSize:16, color:'#A53E33' }}>난이도 {topDiff}</div>
                  <div style={{ fontSize:10.5, color:'#8A98A2' }}>최고 터널</div>
                </div>
              )}
            </div>
            {result.shortest.tunnels.length > 0 && (
              <div style={{ display:'flex', gap:4, marginTop:11, flexWrap:'wrap' }}>
                {result.shortest.tunnels.slice(0, 3).map(t => (
                  <span key={t.id} style={{ fontSize:9, color:'#A53E33', background:'#FBEAE7', borderRadius:5, padding:'4px 6px' }}>{t.name}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth:640, margin:'0 auto', padding:'30px 26px 80px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span onClick={() => setStep('compare')} style={{ fontSize:20, color:'#8A98A2', cursor:'pointer' }}>‹</span>
        <span style={{ fontSize:14, fontWeight:700 }}>{origin} → {dest}</span>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:20, marginTop:20 }}>
        <div style={{ position:'relative', borderRadius:14, overflow:'hidden', height:300, flexShrink:0, border:'1px solid #E4EAEF' }}>
          <MockStreetMap
            showPath
            markers={[
              { id:'o', label:'출발', query: origin, color:'#14807A' },
              ...(selectedRoute === 'shortest' ? tunnels.map(t => ({ id:t.id, label:t.name, query:t.name, color:'#A53E33' })) : []),
              { id:'d', label:'도착', query: dest, color:'#D45B4E' },
            ]}
          >
            <div style={{ position:'absolute', top:14, right:14, fontSize:11, fontWeight:700, color:'#5B6C78', background:'rgba(255,255,255,.9)', borderRadius:7, padding:'6px 10px' }}>
              {selectedRoute === 'avoid' ? '터널 회피 루트' : '최단 루트'}
            </div>
          </MockStreetMap>
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
              {result.avoid.waypoints.map(wp => (
                <div key={wp} style={{ display:'flex', alignItems:'center', gap:9, fontSize:11.5, color:'#5B6C78', marginBottom:6 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'#C3CDD5', flexShrink:0 }} />
                  {wp}
                </div>
              ))}
            </>
          )}

          {selectedRoute === 'shortest' && tunnels.length > 0 && (
            <>
              <p style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'#8A98A2', letterSpacing:'0.05em', margin:'15px 0 9px' }}>지나는 터널</p>
              {tunnels.map(t => (
                <div key={t.id} style={{ display:'flex', alignItems:'center', gap:9, fontSize:11.5, color:'#5B6C78', marginBottom:6 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'#D45B4E', flexShrink:0 }} />
                  {t.name} · 난이도 {t.diff}단계
                </div>
              ))}
            </>
          )}

          <button
            onClick={() => navigate('/navigating', {
              state: {
                origin, dest, durationMin: route.durationMin, distanceKm: route.distanceKm,
                ...(selectedRoute === 'shortest' ? { tunnel: tunnels[0], tunnels } : {}),
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
