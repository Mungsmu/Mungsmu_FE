import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { TUNNELS, REGIONS } from '../data/mock.js'
import MockStreetMap from '../components/MockStreetMap.jsx'
import PlaceAutocomplete from '../components/PlaceAutocomplete.jsx'
import { loadKakaoMaps, resolvePlace, haversineM, coordToAddress } from '../lib/kakaoMap.js'
import { fetchRoute, traceTunnels } from '../lib/route.js'
import { findGangwonTunnel, nearestGangwonTunnel } from '../lib/tunnelGeo.js'
import { getCurrentPosition } from '../lib/geolocation.js'
import { recordRouteChoice } from '../lib/tunnelStats.js'

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY
const RECENT = ['속초 해수욕장', '양양 낙산사', '강릉 경포해변']
// 서울양양고속도로처럼 500m 이상 터널이 실제로 수십 개인 구간도 있어, 지도 마커·목록은
// 상위 N개만 보여주고 나머지는 "외 N개"로 요약한다 (전체 개수는 route.tunnelCount로 별도 표시)
const TUNNEL_PREVIEW_MAX = 3

// 카카오 키가 없거나 지오코딩이 실패했을 때만 쓰는 목업 결과값 (기존 데모 그대로 유지)
const MOCK_RESULT = {
  hasTunnel: true,
  avoid: {
    durationMin: 192, distanceKm: 238, tunnelCount: 0,
    waypoints: ['영동고속 → 7번 국도 진입', '동해안 해안 라인 경유'],
  },
  shortest: {
    durationMin: 170, distanceKm: 216, tunnelCount: 2,
    tunnels: [TUNNELS.find(t => t.name === '대관령1터널'), TUNNELS.find(t => t.name === '둔내터널')],
  },
}

// 출발지·목적지를 실좌표로 바꾼 뒤 Valhalla로 실도로 경로 2개(최단 / 고속도로 회피)를 계산한다.
// 거리·소요시간은 실제 경로 기준. 목적지가 속한 강원 시군을 매칭해 그 지역 터널들을 "최단 루트"에 연결한다.
// Valhalla 호출이 실패하면 예전 방식(직선거리 보정 추정치)으로 폴백.
// opts.originPlace: 이미 좌표를 아는 출발지("현재 위치에서 출발" — GPS로 얻은 좌표는 텍스트로 다시
// 지오코딩하면 엉뚱한 곳이 나올 수 있어 이 좌표를 그대로 쓴다)가 있으면 originStr 지오코딩을 건너뛴다.
// opts.waypoints: 출발지·목적지 사이를 순서대로 경유하는 지점 이름들(안심 코스의 중간 경유지 등).
// 실제로 지나는 터널이 하나도 없으면(hasTunnel: false) 회피 경로는 최단 경로와 완전히 같은
// 길이므로 따로 계산하지 않고 하나만 반환한다 — 비교할 게 없을 때 굳이 두 경로를 보여줄 필요가 없다.
async function computeRouteResult(originStr, destStr, { originPlace: fixedOriginPlace, waypoints: waypointStrs = [] } = {}) {
  if (!KAKAO_KEY) return null
  try {
    const kakao = await loadKakaoMaps(KAKAO_KEY)
    const [originPlace, ...rest] = await Promise.all([
      fixedOriginPlace ? Promise.resolve(fixedOriginPlace) : resolvePlace(kakao, originStr),
      ...waypointStrs.map(w => resolvePlace(kakao, w)),
      resolvePlace(kakao, destStr),
    ])
    const destPlace = rest.pop()
    const waypointPlaces = rest
    if (!originPlace || !destPlace || waypointPlaces.some(p => !p)) return null
    const routePoints = [originPlace, ...waypointPlaces, destPlace]

    // 상세 화면에 보여줄 정차 지점 목록 — 중간 경유지까지 순서대로 모두 담는다.
    const stopLabels = [
      `${originStr} 출발`,
      ...waypointStrs.map(w => `${w} 경유`),
      `${destStr} 도착`,
    ]

    const straightKm = haversineM(originPlace, destPlace) / 1000
    const region = REGIONS.find(r => destPlace.address.includes(r.name) || destPlace.name.includes(r.name) || destStr.includes(r.name))
    let tunnels = region ? TUNNELS.filter(t => t.region === region.name) : [] // 실측 실패 시 폴백

    const shortestRoute = await fetchRoute(routePoints)

    // 최단 루트가 실제로 지나는 터널을 실측 (500m 이상 장대터널만 집계, 짧은 지하차도 제외)
    const traced = shortestRoute ? await traceTunnels(shortestRoute.shapes) : null
    if (traced) {
      tunnels = traced.filter(s => s.lengthM >= 500).map((s, i) => {
        // 이름 우선순위: '~터널' > 도로명 > 노선번호(예: "60" → "60번 도로 터널")
        const name = s.names.find(n => n.includes('터널'))
          ?? (s.names.find(n => !/^\d+$/.test(n)) ? `${s.names.find(n => !/^\d+$/.test(n))} 터널` : null)
          ?? (s.names[0] ? `${s.names[0]}번 도로 터널` : '터널 구간')
        const known = TUNNELS.find(t => s.names.includes(t.name) || t.name === name)
        // path 상의 실제 진입 좌표 — 동반 모드가 터널 이름을 다시 지오코딩해서 위치·진행 방향을
        // 추측하는 불안정한 과정 없이 이 실측 구간을 그대로 진입점·주행 카메라 배경으로 쓸 수 있다.
        const [lat, lng] = shortestRoute.path[Math.min(s.begin, shortestRoute.path.length - 1)] ?? []
        // 큐레이션 목록(TUNNELS)에 없는 터널도 강원도 실측 데이터셋(404개)에서 찾아 난이도·규격을
        // 채운다 — 앱이 직접 큐레이션한 터널은 6개뿐이라 대부분의 실제 경로는 이 데이터셋 매칭에
        // 의존한다. OSM 도로명이 "미시령로"처럼 "터널"을 포함하지 않아 이름 매칭이 실패하는 경우가
        // 있어, 마지막 수단으로 진입 좌표와 가장 가까운 터널을 찾는다(300m 이내).
        const gw = !known
          ? (s.names.map(findGangwonTunnel).find(Boolean) ?? findGangwonTunnel(name)
            ?? (lat != null ? nearestGangwonTunnel({ lat, lng }, 300) : null))
          : null
        const BUFFER_PTS = 6
        const startIdx = Math.max(0, s.begin - BUFFER_PTS)
        const endIdx = Math.min(shortestRoute.path.length - 1, s.end + BUFFER_PTS)
        const path = shortestRoute.path.slice(startIdx, endIdx + 1)
        if (known) return { ...known, lat, lng, path }
        if (gw) return { id: gw.id, name: gw.name.replace(/\([^)]*\)\s*$/, ''), lengthM: s.lengthM, diff: gw.diff, lanes: gw.lanes, heightM: gw.heightM, lat, lng, path }
        return { id: `trace-${i}`, name, lengthM: s.lengthM, diff: null, lat, lng, path }
      })
    }

    const shortestKm = shortestRoute?.distanceKm ?? Math.max(1, Math.round(straightKm * 1.15))
    const shortest = {
      durationMin: shortestRoute?.durationMin ?? Math.max(5, Math.round((shortestKm / 78) * 60)),
      distanceKm: shortestKm,
      tunnelCount: tunnels.length, tunnels,
      path: shortestRoute?.path, maneuvers: shortestRoute?.maneuvers, origin: originPlace, dest: destPlace,
    }

    const hasTunnel = tunnels.length > 0
    if (!hasTunnel) {
      return {
        hasTunnel: false,
        avoid: { ...shortest, tunnelCount: 0, tunnels: [], waypoints: stopLabels },
        shortest,
      }
    }

    // 터널 회피 루트 = 터널을 아예 지나지 않는 경로 (옛 고갯길 등으로 우회) — 실제로 지나는 터널이
    // 있을 때만 계산한다.
    const avoidRoute = await fetchRoute(routePoints, { excludeTunnels: true })
    const avoidKm = avoidRoute?.distanceKm ?? Math.max(1, Math.round(straightKm * 1.3))

    return {
      hasTunnel: true,
      avoid: {
        durationMin: avoidRoute?.durationMin ?? Math.max(5, Math.round((avoidKm / 62) * 60)),
        distanceKm: avoidKm, tunnelCount: 0,
        waypoints: stopLabels,
        path: avoidRoute?.path, maneuvers: avoidRoute?.maneuvers, origin: originPlace, dest: destPlace,
      },
      shortest,
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
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState('')
  // 출발지를 텍스트로 검색해 다시 지오코딩하면 실제 GPS 위치와 몇십~몇백m씩 어긋날 수 있다 —
  // "현재 위치에서 출발"을 누르면 이 좌표를 원본 그대로 computeRouteResult에 넘겨 그 오차를 없앤다.
  // 텍스트(주소) 일치 여부로 판단하면 역지오코딩 결과가 조금만 달라져도 조용히 깨지므로,
  // 명시적인 플래그로 추적하고 사용자가 입력창을 직접 고치면 즉시 꺼버린다.
  const [originCoords, setOriginCoords] = useState(null)
  const [usingCurrentLocation, setUsingCurrentLocation] = useState(false)
  // 코스 모드에서 "현재 위치 → 코스 전체"로 안내할지. 위치를 잡을 수 있으면 기본으로 켠다 —
  // 코스만 따로 안내하면 정작 지금 있는 곳에서 코스까지 가는 길이 빠져 실제로 쓸 수 없다.
  const [courseFromCurrent, setCourseFromCurrent] = useState(true)
  // 실제로 경로를 계산할 때 쓴 출발지 이름 — 화면 상단 "A → B" 표기에 쓴다.
  const [routeOriginLabel, setRouteOriginLabel] = useState(null)
  // 마지막으로 포커스한 입력 칸 — 하단 "최근 검색"을 눌렀을 때 어느 칸에 채울지 정한다.
  // 예전에는 무조건 목적지에 넣어서, 출발지를 고치던 중에 누르면 아무 반응이 없어 보였다.
  const [activeField, setActiveField] = useState('dest')
  const [result, setResult] = useState(MOCK_RESULT)
  const route = result[selectedRoute]
  const tunnels = route.tunnels ?? []

  // 사용자가 출발지를 직접 건드렸는지. 자동 위치 채우기가 늦게 끝나면서 입력 중인 글자를
  // 덮어쓰지 않도록 하는 데 쓴다 — 한글 입력 중에 값이 통째로 바뀌면 조합이 끊기면서
  // 키보드가 내려가 버린다(사용자 리포트 "한 글자 입력하면 키보드가 내려감").
  const originTouchedRef = useRef(false)

  const handleOriginChange = v => {
    originTouchedRef.current = true
    setOrigin(v)
    setUsingCurrentLocation(false)
  }

  // 출발지는 대부분 "지금 있는 곳"이다. 예전에는 빈 칸으로 시작해서 사용자가 직접 주소를 쳐야
  // 했고, 그렇게 친 주소를 다시 지오코딩하면 실제 위치와 어긋나 경로가 엉뚱하게 잡혔다.
  // 화면에 들어오면 한 번만 현재 위치로 채운다(이미 값이 있거나 코스 모드면 건드리지 않는다).
  const autoLocatedRef = useRef(false)
  useEffect(() => {
    if (autoLocatedRef.current) return
    // 코스 모드는 출발지 칸이 없지만, "현재 위치에서 코스까지" 안내를 위해 좌표는 미리 잡아둔다.
    if (!courseMode && origin.trim()) return
    autoLocatedRef.current = true
    useCurrentLocation({ fillInput: !courseMode, auto: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // auto: 화면 진입 시 자동으로 부른 경우. 이때는 사용자가 이미 입력을 시작했으면 덮어쓰지 않는다.
  const useCurrentLocation = ({ fillInput = true, auto = false } = {}) => {
    if (locating) return
    setLocating(true)
    setLocateError('')
    getCurrentPosition(
      async pos => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        let address = null
        if (KAKAO_KEY) {
          try { address = await coordToAddress(await loadKakaoMaps(KAKAO_KEY), coords.lat, coords.lng) } catch { /* 실패 시 라벨로 대체 */ }
        }
        setOriginCoords({ ...coords, name: '현재 위치', address: address ?? '' })
        // 자동 호출인데 그 사이 사용자가 입력을 시작했다면 좌표만 챙기고 입력창은 그대로 둔다.
        if (fillInput && !(auto && originTouchedRef.current)) {
          setOrigin(address ?? '현재 위치')
          setUsingCurrentLocation(true)
        }
        setLocating(false)
      },
      () => {
        if (!auto) setLocateError('위치를 확인할 수 없어요. 브라우저 위치 권한을 확인해주세요.')
        setLocating(false)
      },
    )
  }

  const search = async () => {
    if (!origin.trim() || !dest.trim()) return
    setLoading(true)
    const fixedOrigin = usingCurrentLocation ? originCoords : undefined
    setRouteOriginLabel(origin.trim())
    const real = await computeRouteResult(origin.trim(), dest.trim(), { originPlace: fixedOrigin })
    const finalResult = real ?? MOCK_RESULT
    setResult(finalResult)
    setLoading(false)
    setSelectedRoute('avoid')
    // 실제로 지나는 터널이 없으면 회피 경로와 최단 경로가 같으므로 비교 화면 없이 바로 상세로 간다.
    setStep(finalResult.hasTunnel === false ? 'detail' : 'compare')
  }

  if (step === 'course') {
    const allSpots = [origin, ...waypoints, dest]
    const startsHere = courseFromCurrent && !!originCoords
    const courseStart = startsHere ? (originCoords.address || '현재 위치') : origin
    // 실제로 안내할 지점 순서 — 현재 위치에서 출발하면 코스 전체가 경유지가 된다.
    const routeSpots = startsHere ? [courseStart, ...allSpots] : allSpots
    return (
      <div style={{ maxWidth:640, margin:'0 auto', padding:'30px 26px 80px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
          <span onClick={() => navigate(-1)} style={{ fontSize:20, color:'#8A98A2', cursor:'pointer' }}>‹</span>
          <span style={{ fontSize:14, fontWeight:700 }}>{courseTitle ?? `${origin} → ${dest}`}</span>
        </div>

        <div style={{ borderRadius:14, overflow:'hidden', height:300, border:'1px solid #E4EAEF', marginBottom:20 }}>
          <MockStreetMap
            showPath
            routeProfile="avoid"
            markers={routeSpots.map((name, i) => ({
              id:`${i}`, label: i === 0 && startsHere ? '출발' : String(startsHere ? i : i + 1), query:name,
              ...(i === 0 && startsHere && originCoords ? { lat: originCoords.lat, lng: originCoords.lng } : {}),
              color: i === 0 ? '#14807A' : i === routeSpots.length - 1 ? '#D45B4E' : '#8A98A2',
            }))}
          />
        </div>

        {/* 출발지 — 코스만 따로 안내하면 지금 있는 곳에서 코스까지 가는 길이 빠진다 */}
        <button onClick={() => { if (!originCoords && !locating) useCurrentLocation({ fillInput: false }); setCourseFromCurrent(v => !v) }}
          disabled={locating}
          style={{
            display:'flex', alignItems:'center', gap:9, width:'100%', textAlign:'left',
            borderRadius:12, border:`1.5px solid ${startsHere ? '#14807A' : '#E4EAEF'}`,
            background: startsHere ? '#E6F4F2' : '#fff', padding:'11px 13px', marginBottom:16, cursor:'pointer',
          }}>
          <span style={{ fontSize:15 }}>{startsHere ? '📍' : '🚩'}</span>
          <span style={{ flex:1 }}>
            <span style={{ display:'block', fontSize:12.5, fontWeight:800, color:'#16242E' }}>
              {locating ? '현재 위치 확인 중...' : startsHere ? '현재 위치에서 출발' : `${origin}에서 출발`}
            </span>
            <span style={{ display:'block', fontSize:11, color:'#5B6C78', marginTop:2 }}>
              {startsHere ? courseStart : '코스 첫 지점부터 안내 · 눌러서 현재 위치에서 출발'}
            </span>
          </span>
        </button>

        <div style={{ display:'flex', gap:16, marginBottom:14 }}>
          {courseDistance && (
            <div>
              <div style={{ fontWeight:800, fontSize:19 }}>{courseDistance}</div>
              <div style={{ fontSize:10, color:'#8A98A2', marginTop:4 }}>{startsHere ? '코스 구간' : '총 거리'}</div>
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
        {startsHere && (
          <p style={{ fontSize:11.5, color:'#5B6C78', margin:'0 0 14px' }}>
            현재 위치에서 코스 첫 지점까지 가는 거리는 위 숫자에 포함되지 않았어요. 실제 총 거리는 다음 화면에서 계산됩니다.
          </p>
        )}

        <p style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'#8A98A2', letterSpacing:'0.05em', margin:'0 0 9px' }}>순서대로 경유</p>
        {routeSpots.map((name, i) => (
          <div key={`${name}-${i}`} style={{ display:'flex', alignItems:'center', gap:9, fontSize:12.5, color:'#16242E', fontWeight:600, marginBottom:8 }}>
            <span style={{ width:19, height:19, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#fff',
              background: i === 0 ? '#14807A' : i === routeSpots.length - 1 ? '#D45B4E' : '#8A98A2' }}>{startsHere && i === 0 ? '📍' : (startsHere ? i : i + 1)}</span>
            {name}
          </div>
        ))}

        <button
          onClick={async () => {
            if (loading) return
            setLoading(true)
            // 코스도 일반 길찾기와 똑같이 최단 루트/터널 회피 루트를 비교해서 보여주고, 최단 루트를
            // 고르면 실제로 지나는 터널에서 동반 모드가 뜨도록 한다 — "터널 1개 포함" 태그가 있어도
            // 예전에는 무조건 회피 루트만 계산해서 동반 모드가 뜰 좌표 자체가 없었다.
            const startFromHere = courseFromCurrent && originCoords
            setRouteOriginLabel(startFromHere ? (originCoords.address || '현재 위치') : origin)
            const real = startFromHere
              ? await computeRouteResult(originCoords.address || '현재 위치', dest, {
                  originPlace: originCoords,
                  waypoints: [origin, ...waypoints],
                })
              : await computeRouteResult(origin, dest, { waypoints })
            const finalResult = real ?? MOCK_RESULT
            setResult(finalResult)
            setLoading(false)
            setSelectedRoute('avoid')
            // 실제로 지나는 터널이 없으면 회피 경로와 최단 경로가 같으므로 비교 화면 없이 바로 상세로 간다.
            setStep(finalResult.hasTunnel === false ? 'detail' : 'compare')
          }}
          disabled={loading}
          style={{ marginTop:20, height:44, borderRadius:11, width:'100%', fontWeight:800, fontSize:13.5, cursor:'pointer', background:'#14807A', color:'#fff', opacity: loading ? 0.6 : 1 }}>
          {loading ? '경로 계산 중...' : '이 코스로 출발하기'}
        </button>
      </div>
    )
  }

  if (step === 'input') {
    return (
      <div style={{ maxWidth:680, margin:'0 auto', padding:'30px 26px 80px' }}>
        <h1 style={{ fontSize:28, fontWeight:800, letterSpacing:'-0.8px', marginBottom:6 }}>안심 경로 길찾기</h1>
        <p style={{ fontSize:15, color:'#5B6C78', marginBottom:22 }}>터널 회피 경로와 최단 경로 비교 제공</p>

        <div style={{ borderRadius:14, overflow:'hidden', height:150, border:'1px solid #E4EAEF', marginBottom:16 }}>
          <MockStreetMap myLocation />
        </div>

        <div style={{ background:'#F6F8FA', border:'1px solid #E4EAEF', borderRadius:13, padding:'5px 13px', marginBottom:16 }}>
          <div style={{ padding:'12px 0' }}>
            <PlaceAutocomplete value={origin} onChange={handleOriginChange} dotColor="#14807A" placeholder="출발지"
              recent={RECENT} onFieldFocus={() => setActiveField('origin')} />
          </div>
          <div style={{ borderBottom:'1px solid #E9EDF1' }} />
          <div style={{ padding:'12px 0' }}>
            <PlaceAutocomplete value={dest} onChange={setDest} onEnter={search} dotColor="#D45B4E" placeholder="목적지"
              recent={RECENT} onFieldFocus={() => setActiveField('dest')} />
          </div>
        </div>

        <button onClick={useCurrentLocation} disabled={locating}
          style={{
            display:'flex', alignItems:'center', justifyContent:'center', gap:7, width:'100%', height:40,
            borderRadius:11, border:`1.5px solid ${usingCurrentLocation ? '#14807A' : '#CFE0DC'}`,
            background: usingCurrentLocation ? '#E6F4F2' : '#fff',
            color:'#14807A', fontSize:13, fontWeight:800,
            marginBottom: locateError ? 6 : 16, cursor: locating ? 'default' : 'pointer', opacity: locating ? 0.6 : 1,
          }}>
          <span>📍</span>
          <span>{locating ? '현재 위치 확인 중...' : usingCurrentLocation ? '현재 위치에서 출발 중' : '현재 위치에서 출발'}</span>
        </button>
        {locateError && <p style={{ fontSize:11.5, color:'#A53E33', marginBottom:16 }}>{locateError}</p>}

        <button onClick={search} disabled={!origin.trim() || !dest.trim() || loading}
          style={{ height:44, borderRadius:12, background:'#14807A', color:'#fff', fontWeight:800, fontSize:13.5, width:'100%', marginTop:16, cursor:'pointer', opacity: (!origin.trim() || !dest.trim() || loading) ? 0.45 : 1 }}>
          {loading ? '경로 계산 중...' : '안심 경로 찾기'}
        </button>

        <div style={{ marginTop:22 }}>
          <p style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'#8A98A2', letterSpacing:'0.05em', marginBottom:10 }}>
            최근 검색 · 누르면 {activeField === 'origin' ? '출발지' : '목적지'}에 들어가요
          </p>
          {RECENT.map(item => (
            <div key={item} onClick={() => (activeField === 'origin' ? handleOriginChange(item) : setDest(item))}
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
    const diffs = tunnels.map(t => t.diff).filter(Boolean)
    const topDiff = diffs.length ? Math.max(...diffs) : null
    return (
      <div style={{ maxWidth:720, margin:'0 auto', padding:'30px 26px 80px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
          <span onClick={() => setStep('input')} style={{ fontSize:20, color:'#8A98A2', cursor:'pointer' }}>‹</span>
          <span style={{ fontSize:14, fontWeight:700 }}>{routeOriginLabel ?? origin} → {dest}</span>
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
                {result.shortest.tunnels.slice(0, TUNNEL_PREVIEW_MAX).map(t => (
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
        {/* 비교할 회피 루트가 없는 경우(hasTunnel: false)에는 compare 단계 자체가 없으므로 입력 화면으로 돌아간다 */}
        <span onClick={() => setStep(result.hasTunnel === false ? (courseMode ? 'course' : 'input') : 'compare')} style={{ fontSize:20, color:'#8A98A2', cursor:'pointer' }}>‹</span>
        <span style={{ fontSize:14, fontWeight:700 }}>{routeOriginLabel ?? origin} → {dest}</span>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:20, marginTop:20 }}>
        <div style={{ position:'relative', borderRadius:14, overflow:'hidden', height:300, flexShrink:0, border:'1px solid #E4EAEF' }}>
          <MockStreetMap
            showPath
            routeProfile={selectedRoute}
            markers={[
              { id:'o', label:'출발', query: origin, color:'#14807A' },
              ...(selectedRoute === 'shortest' ? tunnels.slice(0, TUNNEL_PREVIEW_MAX).map(t => ({ id:t.id, label:t.name, query:t.name, color:'#A53E33' })) : []),
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
              {tunnels.slice(0, TUNNEL_PREVIEW_MAX).map(t => (
                <div key={t.id} style={{ display:'flex', alignItems:'center', gap:9, fontSize:11.5, color:'#5B6C78', marginBottom:6 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'#D45B4E', flexShrink:0 }} />
                  {t.name}{t.diff ? ` · 난이도 ${t.diff}단계` : t.lengthM ? ` · ${(t.lengthM / 1000).toFixed(1)}km` : ''}
                </div>
              ))}
              {tunnels.length > TUNNEL_PREVIEW_MAX && (
                <div style={{ fontSize:11.5, color:'#8A98A2', fontWeight:600, marginBottom:6 }}>
                  외 {tunnels.length - TUNNEL_PREVIEW_MAX}개
                </div>
              )}
            </>
          )}

          <button
            onClick={() => {
              recordRouteChoice(selectedRoute)
              navigate('/navigating', {
                state: {
                  origin, dest, durationMin: route.durationMin, distanceKm: route.distanceKm,
                  waypoints, originPlace: route.origin, destPlace: route.dest,
                  // 내비가 같은 성격의 경로를 달리도록 선택값을 그대로 넘긴다. 터널 목록은 내비가
                  // 실제 주행 경로에서 다시 실측하므로(경유지·재탐색으로 달라질 수 있다) 참고용이다.
                  routeProfile: selectedRoute,
                  ...(selectedRoute === 'shortest' ? { tunnels } : {}),
                },
              })
            }}
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
