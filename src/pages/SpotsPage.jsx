import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOUR_SPOTS } from '../data/tourSpots.js'
import { evaluateSpots } from '../lib/tourSafety.js'
import { formatTunnelLength } from '../lib/tunnelGeo.js'
import { loadKakaoMaps, coordToAddress } from '../lib/kakaoMap.js'
import { getCurrentPosition } from '../lib/geolocation.js'

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY
const CATEGORIES = ['전체', '해변', '자연', '문화', '전망', '체험', '카페']
// 현재 위치를 못 잡았을 때 쓰는 기준점(춘천 시청) — 강원 한가운데라 목록을 미리 보여주기에 무난하다.
const FALLBACK_ORIGIN = { lat: 37.8813, lng: 127.7300, label: '춘천 (기본 기준점)' }

// 관광지 추천 — "어디가 좋은가"가 아니라 "가는 길이 견딜 만한가"로 정렬한다. 각 카드의 안심 지수는
// 출발지에서 그 관광지까지의 실제 최단 경로가 지나는 터널을 실측(Valhalla + OSM 터널 태그)해서 낸 값이다.
export default function SpotsPage() {
  const nav = useNavigate()
  const [origin, setOrigin] = useState(null)        // { lat, lng, label }
  const [locating, setLocating] = useState(true)
  const [cat, setCat] = useState('전체')
  const [indoorOnly, setIndoorOnly] = useState(false)
  const [results, setResults] = useState({})        // { [spotId]: 평가결과 | null }
  const stopRef = useRef(null)

  // 현재 위치를 기준점으로 잡는다. 권한 거부·실패 시 기본 기준점으로 진행한다(빈 화면을 보여주지 않기 위해).
  useEffect(() => {
    let cancelled = false
    getCurrentPosition(
      async pos => {
        if (cancelled) return
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        let label = '현재 위치'
        if (KAKAO_KEY) {
          try {
            const kakao = await loadKakaoMaps(KAKAO_KEY)
            label = (await coordToAddress(kakao, here.lat, here.lng)) ?? label
          } catch { /* 주소 변환 실패는 무시 — 좌표만으로 충분하다 */ }
        }
        if (!cancelled) { setOrigin({ ...here, label }); setLocating(false) }
      },
      () => { if (!cancelled) { setOrigin(FALLBACK_ORIGIN); setLocating(false) } },
    )
    return () => { cancelled = true }
  }, [])

  // 기준점이 정해지면 관광지를 하나씩 평가한다. 공개 라우팅 서버를 쓰므로 동시 요청을 제한하고,
  // 끝나는 대로 카드에 채워 넣어 전부 끝날 때까지 기다리지 않아도 되게 한다.
  useEffect(() => {
    if (!origin) return
    setResults({})
    stopRef.current?.()
    stopRef.current = evaluateSpots(origin, TOUR_SPOTS, {
      concurrency: 3,
      onResult: (id, res) => setResults(prev => ({ ...prev, [id]: res })),
    })
    return () => stopRef.current?.()
  }, [origin])

  const list = useMemo(() => {
    const filtered = TOUR_SPOTS
      .filter(s => cat === '전체' || s.category === cat)
      .filter(s => !indoorOnly || s.indoor)
    // 평가가 끝난 곳을 안심 지수 높은 순으로 먼저, 아직 계산 중인 곳은 뒤에 원래 순서대로 둔다.
    return filtered.sort((a, b) => {
      const ra = results[a.id], rb = results[b.id]
      if (ra && rb) return rb.score - ra.score || ra.distanceKm - rb.distanceKm
      if (ra) return -1
      if (rb) return 1
      return 0
    })
  }, [cat, indoorOnly, results])

  const done = Object.keys(results).length
  const scored = Object.values(results).filter(Boolean)
  const safeCount = scored.filter(r => r.score >= 85).length

  return (
    <div style={{ maxWidth:'var(--max-w)', margin:'0 auto', padding:'30px 26px 80px' }}>
      <h1 style={{ fontSize:30, fontWeight:800, letterSpacing:'-.8px', marginBottom:6 }}>관광지 추천</h1>
      <p style={{ fontSize:16, color:'var(--text-sub)', marginBottom:20 }}>
        가는 길의 터널 노출을 실측해 안심 지수가 높은 곳부터 보여드려요
      </p>

      {/* 기준점 + 진행 상황 */}
      <div style={{ background:'#F6F8FA', border:'1px solid #E4EAEF', borderRadius:13, padding:'13px 16px', marginBottom:18, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <span style={{ fontSize:13, fontWeight:700, color:'#14807A' }}>📍 출발 기준</span>
        <span style={{ fontSize:13, color:'#16242E', fontWeight:600, flex:1, minWidth:180 }}>
          {locating ? '현재 위치 확인 중...' : origin?.label}
        </span>
        <span style={{ fontSize:12, color:'#8A98A2', fontWeight:600 }}>
          {done < TOUR_SPOTS.length
            ? `경로 실측 중 ${done}/${TOUR_SPOTS.length}`
            : `${scored.length}곳 실측 완료 · 안심 ${safeCount}곳`}
        </span>
      </div>

      {/* 필터 */}
      <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCat(c)}
            style={{
              background: cat === c ? '#14807A' : '#F1F4F6',
              color: cat === c ? '#fff' : '#5B6C78',
              borderRadius:99, padding:'7px 13px', fontSize:11.5, fontWeight:700, cursor:'pointer',
            }}>{c}</button>
        ))}
        <button onClick={() => setIndoorOnly(v => !v)}
          style={{
            background: indoorOnly ? '#2C6CB0' : '#F1F4F6',
            color: indoorOnly ? '#fff' : '#5B6C78',
            borderRadius:99, padding:'7px 13px', fontSize:11.5, fontWeight:700, cursor:'pointer', marginLeft:'auto',
          }}>☔ 실내 위주</button>
      </div>
      <p style={{ fontSize:11.5, color:'#8A98A2', marginBottom:16 }}>
        안심 지수는 500m 이상 터널의 개수와 총 길이로 계산합니다. 짧은 지하차도는 제외합니다.
      </p>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(310px,1fr))', gap:14 }}>
        {list.map(spot => {
          const r = results[spot.id]
          const pending = !(spot.id in results)
          return (
            <div key={spot.id}
              style={{ background:'#fff', border:'1px solid #E4EAEF', borderRadius:14, padding:'16px 17px', display:'flex', flexDirection:'column', gap:9, boxShadow:'0 1px 3px rgba(20,40,60,.05)' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:15.5, fontWeight:800, color:'#16242E' }}>{spot.name}</div>
                  <div style={{ fontSize:11.5, color:'#8A98A2', fontWeight:600, marginTop:3 }}>
                    {spot.region} · {spot.category}{spot.indoor ? ' · 실내' : ''} · {spot.season}
                  </div>
                </div>
                {/* 안심 지수 배지 */}
                <div style={{
                  flexShrink:0, textAlign:'center', borderRadius:11, padding:'6px 10px', minWidth:58,
                  background: r ? r.grade.bg : '#F1F4F6',
                }}>
                  <div style={{ fontSize:18, fontWeight:800, lineHeight:1, color: r ? r.grade.color : '#B4BEC6' }}>
                    {r ? r.score : pending ? '···' : '–'}
                  </div>
                  <div style={{ fontSize:9.5, fontWeight:700, color: r ? r.grade.color : '#B4BEC6', marginTop:3 }}>
                    {r ? r.grade.label : pending ? '측정 중' : '측정 실패'}
                  </div>
                </div>
              </div>

              <p style={{ fontSize:12.5, color:'#5B6C78', lineHeight:1.5, margin:0 }}>{spot.desc}</p>

              {r && (
                <div style={{ display:'flex', gap:14, paddingTop:8, borderTop:'1px solid #F0F3F5' }}>
                  <div>
                    <div style={{ fontSize:13.5, fontWeight:800, color:'#16242E' }}>{r.distanceKm}km</div>
                    <div style={{ fontSize:9.5, color:'#8A98A2', marginTop:2 }}>거리</div>
                  </div>
                  <div>
                    <div style={{ fontSize:13.5, fontWeight:800, color:'#16242E' }}>
                      {r.durationMin >= 60 ? `${Math.floor(r.durationMin/60)}시간 ${r.durationMin%60}분` : `${r.durationMin}분`}
                    </div>
                    <div style={{ fontSize:9.5, color:'#8A98A2', marginTop:2 }}>소요</div>
                  </div>
                  <div>
                    <div style={{ fontSize:13.5, fontWeight:800, color: r.tunnelCount ? '#A53E33' : '#2E7D4F' }}>
                      {r.tunnelCount}개
                    </div>
                    <div style={{ fontSize:9.5, color:'#8A98A2', marginTop:2 }}>
                      {r.tunnelCount ? `터널 ${formatTunnelLength(r.totalTunnelM)}` : '터널 없음'}
                    </div>
                  </div>
                </div>
              )}

              {r?.longest && (
                <div style={{ fontSize:11, color:'#A53E33', fontWeight:600 }}>
                  최장 구간 {r.longest.name} {formatTunnelLength(r.longest.lengthM)}
                </div>
              )}

              <button
                onClick={() => nav('/route', { state: { dest: spot.name } })}
                style={{ marginTop:'auto', height:38, borderRadius:10, background:'#14807A', color:'#fff', fontWeight:800, fontSize:12.5, cursor:'pointer' }}>
                이곳으로 안심 경로 찾기
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
