import { useEffect, useRef, useState } from 'react'
import { loadKakaoMaps, resolvePlace, haversineM } from '../lib/kakaoMap.js'
import { fetchRoute } from '../lib/route.js'
import { turnArrowSvg } from './NavOverlays.jsx'

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY

// 내비게이션 화면용 지도. VITE_KAKAO_MAP_KEY가 설정돼 있으면 실제 카카오맵을,
// 없으면(또는 로드 실패 시) 도로처럼 보이는 목업 지도를 보여준다.
const ROADS = [
  'M -20 260 C 120 230, 180 120, 340 90 S 520 60, 620 40',
  'M 60 -20 C 90 120, 60 220, 140 320 S 260 420, 260 470',
  'M -20 380 C 160 360, 260 300, 460 300 S 560 260, 620 200',
  'M 480 -20 C 440 100, 470 220, 420 320 S 380 420, 400 470',
]
const BLOCKS = [
  { x: 60, y: 40, w: 90, h: 60 }, { x: 200, y: 30, w: 60, h: 90 },
  { x: 330, y: 140, w: 100, h: 70 }, { x: 90, y: 180, w: 70, h: 80 },
  { x: 440, y: 60, w: 80, h: 50 }, { x: 150, y: 330, w: 110, h: 60 },
  { x: 320, y: 340, w: 70, h: 70 }, { x: 460, y: 260, w: 90, h: 60 },
]
const SEOUL = { lat: 37.5665, lng: 126.9780 }

// routeProfile: 'shortest'(실도로 최단) | 'avoid'(고속도로 회피 실도로) | undefined(마커 잇는 직선)
// onRoute: 실도로 경로 계산 완료 시 { path, maneuvers, ... } 전달 (내비게이션 페이지가 턴바이턴에 사용)
// navPosition: { lat, lng, heading?, zoom? } — 주행 중 현재 위치. 지정되면 헤딩 화살표 마커가
//   경로를 따라 움직이고 지도가 따라가며, zoom(카카오 레벨)으로 회전 접근 시 자동 확대를 제어한다.
// routeStyle: { color, weight } — 경로선 스타일 (내비 화면은 굵은 파란 선)
// navGuide: { progressIdx, turnIdx, turnType } — 주행 진행 인덱스와 다음 회전 지점.
//   지정되면 지나온 길은 옅게, 남은 길은 선명하게 나뉘고, 회전 지점에 방향 배지와
//   진출 구간(주황 강조선 + 화살촉)이 그려져 어느 길로 빠지는지 지도에서 바로 보인다.
// path: [[lat,lng],...] — 호출부가 이미 계산해 둔 좌표 배열. 지정되면 내부에서 fetchRoute를
//   다시 호출하지 않고 이 경로를 그대로 그린다(예: 터널 구간만 잘라낸 경로).
export default function MockStreetMap({ children, markers, showPath = false, routeProfile, onRoute, navPosition, routeStyle, navGuide, myLocation = false, path }) {
  const [coords, setCoords] = useState(null)
  const [geoError, setGeoError] = useState(false)
  const [kakaoError, setKakaoError] = useState(false)
  const [kakaoReady, setKakaoReady] = useState(false)
  const [resolvedMarkers, setResolvedMarkers] = useState([])
  const [routePath, setRoutePath] = useState(null) // Valhalla가 준 실도로 좌표 [[lat,lng],...]
  const containerRef = useRef(null)
  const mapObjRef = useRef({})
  const onRouteRef = useRef(onRoute)
  onRouteRef.current = onRoute
  const navigatingRef = useRef(false)
  const markerQuery = markers?.map(m => m.query ?? `${m.lat},${m.lng}`).join('|') ?? ''

  useEffect(() => {
    if (!navigator.geolocation) { setGeoError(true); return }
    navigator.geolocation.getCurrentPosition(
      pos => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError(true),
      { timeout: 6000 },
    )
  }, [])

  // 카카오맵 초기화 (키가 있을 때만)
  useEffect(() => {
    if (!KAKAO_KEY || !containerRef.current) return
    let cancelled = false
    loadKakaoMaps(KAKAO_KEY).then(kakao => {
      if (cancelled) return
      const center = new kakao.maps.LatLng(SEOUL.lat, SEOUL.lng)
      const map = new kakao.maps.Map(containerRef.current, { center, level: 5 })
      mapObjRef.current = { kakao, map, placeMarkers: [], polyline: null }
      setKakaoReady(true)
    }).catch(() => { if (!cancelled) setKakaoError(true) })
    return () => { cancelled = true }
  }, [])

  // 실제 GPS 좌표를 받으면 지도 중심을 옮긴다 (경로 마커가 없을 때만).
  // 단, 내비 주행 중(navPosition 제어)에는 GPS 좌표가 지도 중심을 뺏어가지 않게 한다.
  useEffect(() => {
    const { kakao, map } = mapObjRef.current
    if (!coords || !kakao || !map || navigatingRef.current) return
    const pos = new kakao.maps.LatLng(coords.lat, coords.lng)
    if (!markers?.length) map.setCenter(pos)
  }, [coords, markerQuery])

  // 현재 위치 하이라이트 — myLocation prop을 켠 화면(홈 화면)에서만 빨간 레이저 포인트로 표시.
  // 길찾기·경로 상세 등 나머지 화면에서는 그리지 않는다.
  useEffect(() => {
    const { kakao, map } = mapObjRef.current
    if (!kakao || !map) return
    if (!myLocation || !coords) {
      mapObjRef.current.myLocOverlay?.setMap(null)
      mapObjRef.current.myLocOverlay = null
      return
    }
    const pos = new kakao.maps.LatLng(coords.lat, coords.lng)
    if (!mapObjRef.current.myLocOverlay) {
      const el = document.createElement('div')
      el.style.cssText = 'position:relative;width:18px;height:18px'
      el.innerHTML = `
        <span style="position:absolute;inset:-16px;border-radius:50%;background:rgba(212,91,78,.3);animation:ripple 1.8s ease-out infinite"></span>
        <span style="position:absolute;inset:-16px;border-radius:50%;background:rgba(212,91,78,.3);animation:ripple 1.8s ease-out infinite;animation-delay:.9s"></span>
        <span style="position:absolute;inset:0;border-radius:50%;background:#D45B4E;border:3px solid #fff;box-shadow:0 2px 8px rgba(20,40,60,.35)"></span>
      `
      const overlay = new kakao.maps.CustomOverlay({ position: pos, content: el, zIndex: 4 })
      overlay.setMap(map)
      mapObjRef.current.myLocOverlay = overlay
    } else {
      mapObjRef.current.myLocOverlay.setPosition(pos)
    }
  }, [coords, myLocation])

  // 주행 중 현재 위치 — 실제 내비처럼 진행 방향을 가리키는 화살표 마커가 경로를 따라 움직이고,
  // 지도가 부드럽게 따라가며 회전 지점에 가까워지면 자동으로 확대된다.
  useEffect(() => {
    const { kakao, map } = mapObjRef.current
    if (!navPosition || !kakao || !map) return
    const first = !navigatingRef.current
    navigatingRef.current = true
    const pos = new kakao.maps.LatLng(navPosition.lat, navPosition.lng)

    if (first) {
      mapObjRef.current.myLocOverlay?.setMap(null) // 내비 시작 시 홈 화면용 위치 하이라이트 정리(있었다면)
      const el = document.createElement('div')
      el.style.cssText = 'width:46px;height:46px;border-radius:50%;background:#fff;box-shadow:0 4px 16px rgba(15,50,90,.45);display:flex;align-items:center;justify-content:center;border:2.5px solid #1A6DE3'
      el.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" style="transition:transform .45s ease"><path d="M12 2.5 L18.5 19.5 L12 15.8 L5.5 19.5 Z" fill="#1A6DE3"/></svg>'
      const overlay = new kakao.maps.CustomOverlay({ position: pos, content: el, zIndex: 10 })
      overlay.setMap(map)
      mapObjRef.current.navOverlay = overlay
      mapObjRef.current.navArrowEl = el.firstChild
    }
    mapObjRef.current.navOverlay.setPosition(pos)
    if (navPosition.heading != null && mapObjRef.current.navArrowEl) {
      mapObjRef.current.navArrowEl.style.transform = `rotate(${navPosition.heading}deg)`
    }
    if (navPosition.zoom && map.getLevel() !== navPosition.zoom) map.setLevel(navPosition.zoom, { animate: true })
    // 실제 내비처럼 차량이 화면 하단에 오도록, 지도 중심을 진행 방향 앞쪽으로 당긴다
    const AHEAD_M = { 3: 130, 4: 260, 5: 520, 7: 1500 }
    const aheadM = AHEAD_M[navPosition.zoom] ?? 260
    const rad = ((navPosition.heading ?? 0) * Math.PI) / 180
    const cLat = navPosition.lat + (aheadM * Math.cos(rad)) / 111320
    const cLng = navPosition.lng + (aheadM * Math.sin(rad)) / (111320 * Math.cos((navPosition.lat * Math.PI) / 180))
    map.panTo(new kakao.maps.LatLng(cLat, cLng))
  }, [navPosition])

  // markers prop을 실제 좌표로: lat/lng가 이미 있으면 그대로 쓰고, 장소명(query)만 있으면 검색해서 좌표를 붙인다
  useEffect(() => {
    const { kakao } = mapObjRef.current
    if (!kakao || !markers?.length) { setResolvedMarkers([]); return }
    let cancelled = false
    Promise.all(markers.map(async m => {
      if (m.lat != null && m.lng != null) return m
      const place = await resolvePlace(kakao, m.query)
      return place ? { ...m, ...place } : null
    })).then(list => { if (!cancelled) setResolvedMarkers(list.filter(Boolean)) })
    return () => { cancelled = true }
  }, [kakaoReady, markerQuery])

  // 실도로 경로 계산 (routeProfile이 지정된 경우에만) — 도착 전까지는 직선 폴리라인이 먼저 보인다.
  // path prop이 주어지면(호출부가 이미 좌표 배열을 갖고 있는 경우) 직접 계산하지 않고 그대로 쓴다.
  useEffect(() => {
    if (path) { setRoutePath(path); onRouteRef.current?.({ path }); return }
    setRoutePath(null)
    if (!showPath || !routeProfile || resolvedMarkers.length < 2) return
    let cancelled = false
    // 'avoid' 프로필 = 터널 완전 배제 경로 (Valhalla exclude_tunnels)
    fetchRoute(resolvedMarkers, { excludeTunnels: routeProfile === 'avoid' })
      .then(route => {
        if (cancelled || !route) return
        setRoutePath(route.path)
        onRouteRef.current?.(route)
      })
    return () => { cancelled = true }
  }, [resolvedMarkers, showPath, routeProfile, path])

  // 주행 안내 강조 — 지나온 길/남은 길 구분 + 회전 지점 배지 + 진출 구간 강조선
  useEffect(() => {
    const { kakao, map, polyline } = mapObjRef.current
    if (!kakao || !map || !navGuide || !routePath?.length) return
    const toLL = ([la, ln]) => new kakao.maps.LatLng(la, ln)

    // 전체 경로선은 "지나온 길" 색(옅은 회청색)으로 내려앉힌다 (재탐색으로 다시 그려져도 유지)
    polyline?.setOptions({ strokeColor: '#B9C8DF', strokeOpacity: 0.85 })
    if (!mapObjRef.current.remainLine) {
      mapObjRef.current.remainLine = new kakao.maps.Polyline({
        map, path: [], strokeWeight: routeStyle?.weight ?? 9,
        strokeColor: routeStyle?.color ?? '#1A6DE3', strokeOpacity: 0.95, zIndex: 2,
      })
      mapObjRef.current.exitLine = new kakao.maps.Polyline({
        map, path: [], strokeWeight: (routeStyle?.weight ?? 9) + 1,
        strokeColor: '#FF7A00', strokeOpacity: 0.95, zIndex: 3, endArrow: true,
      })
    }
    // 남은 경로 = 현재 위치부터 끝까지 (선명한 파랑)
    mapObjRef.current.remainLine.setPath(routePath.slice(navGuide.progressIdx).map(toLL))

    // 회전 지점이 바뀌었을 때만 배지·진출 강조선을 다시 그린다
    if (navGuide.turnIdx != null && navGuide.turnIdx !== mapObjRef.current.lastTurnIdx) {
      mapObjRef.current.lastTurnIdx = navGuide.turnIdx
      // 회전 직후 진출 구간(거리 기준 ~600m) — 갈림길에서 어느 쪽으로 빠지는지 화살촉으로 표시
      const exitPts = [routePath[Math.min(navGuide.turnIdx, routePath.length - 1)]]
      let acc = 0
      for (let i = navGuide.turnIdx + 1; i < routePath.length && acc < 600; i++) {
        acc += haversineM(
          { lat: routePath[i - 1][0], lng: routePath[i - 1][1] },
          { lat: routePath[i][0], lng: routePath[i][1] },
        )
        exitPts.push(routePath[i])
      }
      mapObjRef.current.exitLine.setPath(exitPts.map(toLL))
      mapObjRef.current.turnOverlay?.setMap(null)
      const el = document.createElement('div')
      el.style.cssText = 'width:44px;height:44px;border-radius:50%;background:#fff;border:3px solid #FF7A00;box-shadow:0 4px 14px rgba(200,90,0,.45);display:flex;align-items:center;justify-content:center'
      el.innerHTML = turnArrowSvg(navGuide.turnType, 26, '#FF7A00')
      const ov = new kakao.maps.CustomOverlay({ position: toLL(routePath[Math.min(navGuide.turnIdx, routePath.length - 1)]), content: el, zIndex: 9 })
      ov.setMap(map)
      mapObjRef.current.turnOverlay = ov
    }
    // 마지막 안내(도착) 이후에는 진출 강조를 지운다
    if (navGuide.turnIdx == null && mapObjRef.current.lastTurnIdx != null) {
      mapObjRef.current.lastTurnIdx = null
      mapObjRef.current.exitLine.setPath([])
      mapObjRef.current.turnOverlay?.setMap(null)
    }
  }, [navGuide?.progressIdx, navGuide?.turnIdx, routePath])

  // 검색된 좌표로 실제 마커/경로선을 그리고 지도를 맞춤
  useEffect(() => {
    const { kakao, map } = mapObjRef.current
    if (!kakao || !map) return
    mapObjRef.current.placeMarkers?.forEach(pm => { pm.marker.setMap(null); pm.overlay.setMap(null) })
    mapObjRef.current.placeMarkers = []
    if (mapObjRef.current.polyline) { mapObjRef.current.polyline.setMap(null); mapObjRef.current.polyline = null }
    if (resolvedMarkers.length === 0) return

    const bounds = new kakao.maps.LatLngBounds()
    resolvedMarkers.forEach(rm => {
      const pos = new kakao.maps.LatLng(rm.lat, rm.lng)
      bounds.extend(pos)
      const marker = new kakao.maps.Marker({ position: pos, map })
      const overlay = new kakao.maps.CustomOverlay({
        position: pos, yAnchor: 2.4,
        content: `<div style="background:${rm.color ?? '#14807A'};color:#fff;font:700 11px Pretendard,sans-serif;padding:3px 8px;border-radius:8px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.25)">${rm.label ?? rm.name}</div>`,
      })
      overlay.setMap(map)
      mapObjRef.current.placeMarkers.push({ marker, overlay })
    })

    if (showPath && resolvedMarkers.length >= 2) {
      // 실도로 경로가 도착했으면 그 좌표로, 아직이면(또는 실패하면) 마커를 잇는 직선으로
      const pathPoints = routePath ?? resolvedMarkers.map(rm => [rm.lat, rm.lng])
      mapObjRef.current.polyline = new kakao.maps.Polyline({
        path: pathPoints.map(([lat, lng]) => new kakao.maps.LatLng(lat, lng)),
        strokeWeight: routeStyle?.weight ?? 5, strokeColor: routeStyle?.color ?? '#14807A', strokeOpacity: 0.9, strokeStyle: 'solid',
      })
      mapObjRef.current.polyline.setMap(map)
      if (routePath) routePath.forEach(([lat, lng]) => bounds.extend(new kakao.maps.LatLng(lat, lng)))
    }

    if (resolvedMarkers.length === 1) {
      map.setCenter(new kakao.maps.LatLng(resolvedMarkers[0].lat, resolvedMarkers[0].lng))
      map.setLevel(6)
    } else {
      map.setBounds(bounds)
    }
  }, [resolvedMarkers, showPath, routePath])

  const markerBadge = markers?.length > 0 && (
    <div style={{ position: 'absolute', left: 14, top: 14, background: 'rgba(255,255,255,.92)', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, color: '#16242E', boxShadow: '0 1px 4px rgba(20,40,60,.1)' }}>
      {markers.map(m => m.query ?? m.label).join(' → ')}
    </div>
  )

  if (KAKAO_KEY && !kakaoError) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
        {/* 카카오맵 내부 레이어가 자체 z-index를 갖고 있어, 오버레이 UI를 명시적으로 그 위에 쌓는다.
            지도 빈 공간에서는 그대로 드래그/줌이 되도록 이 래퍼 자체는 클릭을 통과시키고,
            실제 버튼/입력창에서만 다시 pointerEvents:auto로 되살린다. */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
          {markerBadge}
          {children}
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320, overflow: 'hidden', background: '#E6EBE3' }}>
      <svg viewBox="0 0 600 450" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <rect x={0} y={0} width={600} height={450} fill="#E6EBE3" />
        {BLOCKS.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={6} fill="#D8DFD5" />
        ))}
        {ROADS.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#FFFFFF" strokeWidth={16} strokeLinecap="round" />
        ))}
        {ROADS.map((d, i) => (
          <path key={`c-${i}`} d={d} fill="none" stroke="#E4B94F" strokeWidth={2} strokeDasharray="10 8" strokeLinecap="round" opacity={0.55} />
        ))}
      </svg>

      {/* 현재 위치 하이라이트 — 홈 화면(myLocation)에서만 빨간 레이저 포인트로 표시 */}
      {myLocation && (
        <div style={{ position: 'absolute', left: '50%', top: '52%', transform: 'translate(-50%,-50%)' }}>
          <span style={{ position: 'absolute', inset: -16, borderRadius: '50%', background: 'rgba(212,91,78,.3)', animation: 'ripple 1.8s ease-out infinite' }} />
          <span style={{ position: 'absolute', inset: -16, borderRadius: '50%', background: 'rgba(212,91,78,.3)', animation: 'ripple 1.8s ease-out infinite', animationDelay: '.9s' }} />
          <span style={{ position: 'relative', display: 'block', width: 18, height: 18, borderRadius: '50%', background: '#D45B4E', border: '3px solid #fff', boxShadow: '0 2px 8px rgba(20,40,60,.35)' }} />
        </div>
      )}

      {/* GPS 좌표 뱃지 */}
      <div style={{ position: 'absolute', left: 14, bottom: 14, background: 'rgba(255,255,255,.92)', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: '#5B6C78', fontWeight: 600, boxShadow: '0 1px 4px rgba(20,40,60,.1)' }}>
        {kakaoError ? '카카오맵 로드 실패 · 목업 지도' : coords ? `현재 위치 ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : geoError ? 'GPS 위치 확인 불가 · 목업 지도' : '위치 확인 중...'}
      </div>

      {markerBadge}
      {children}
    </div>
  )
}
