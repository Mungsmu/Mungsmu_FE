import { useEffect, useRef, useState } from 'react'
import { loadKakaoMaps, resolvePlace } from '../lib/kakaoMap.js'

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

export default function MockStreetMap({ children, markers, showPath = false }) {
  const [coords, setCoords] = useState(null)
  const [geoError, setGeoError] = useState(false)
  const [kakaoError, setKakaoError] = useState(false)
  const [kakaoReady, setKakaoReady] = useState(false)
  const [resolvedMarkers, setResolvedMarkers] = useState([])
  const containerRef = useRef(null)
  const mapObjRef = useRef({})
  const markerQuery = markers?.map(m => m.query).join('|') ?? ''

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
      const posMarker = new kakao.maps.Marker({ position: center, map })
      mapObjRef.current = { kakao, map, posMarker, placeMarkers: [], polyline: null }
      setKakaoReady(true)
    }).catch(() => { if (!cancelled) setKakaoError(true) })
    return () => { cancelled = true }
  }, [])

  // 실제 GPS 좌표를 받으면 현재 위치 마커를 이동 (경로 마커가 없을 때만 지도 중심도 이동)
  useEffect(() => {
    const { kakao, map, posMarker } = mapObjRef.current
    if (!coords || !kakao || !map) return
    const pos = new kakao.maps.LatLng(coords.lat, coords.lng)
    posMarker.setPosition(pos)
    if (!markers?.length) map.setCenter(pos)
  }, [coords, markerQuery])

  // markers prop(장소명)을 실제 좌표로 검색
  useEffect(() => {
    const { kakao } = mapObjRef.current
    if (!kakao || !markers?.length) { setResolvedMarkers([]); return }
    let cancelled = false
    Promise.all(markers.map(async m => {
      const place = await resolvePlace(kakao, m.query)
      return place ? { ...m, ...place } : null
    })).then(list => { if (!cancelled) setResolvedMarkers(list.filter(Boolean)) })
    return () => { cancelled = true }
  }, [kakaoReady, markerQuery])

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
      mapObjRef.current.polyline = new kakao.maps.Polyline({
        path: resolvedMarkers.map(rm => new kakao.maps.LatLng(rm.lat, rm.lng)),
        strokeWeight: 5, strokeColor: '#14807A', strokeOpacity: 0.85, strokeStyle: 'solid',
      })
      mapObjRef.current.polyline.setMap(map)
    }

    if (resolvedMarkers.length === 1) {
      map.setCenter(new kakao.maps.LatLng(resolvedMarkers[0].lat, resolvedMarkers[0].lng))
      map.setLevel(6)
    } else {
      map.setBounds(bounds)
    }
  }, [resolvedMarkers, showPath])

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

      {/* 현재 위치 마커 */}
      <div style={{ position: 'absolute', left: '50%', top: '52%', transform: 'translate(-50%,-50%)' }}>
        <span style={{ position: 'absolute', inset: -14, borderRadius: '50%', background: 'rgba(20,128,122,.28)', animation: 'pulse 1.8s ease-in-out infinite' }} />
        <span style={{ position: 'relative', display: 'block', width: 18, height: 18, borderRadius: '50%', background: '#14807A', border: '3px solid #fff', boxShadow: '0 2px 8px rgba(20,40,60,.35)' }} />
      </div>

      {/* GPS 좌표 뱃지 */}
      <div style={{ position: 'absolute', left: 14, bottom: 14, background: 'rgba(255,255,255,.92)', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: '#5B6C78', fontWeight: 600, boxShadow: '0 1px 4px rgba(20,40,60,.1)' }}>
        {kakaoError ? '카카오맵 로드 실패 · 목업 지도' : coords ? `현재 위치 ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : geoError ? 'GPS 위치 확인 불가 · 목업 지도' : '위치 확인 중...'}
      </div>

      {markerBadge}
      {children}
    </div>
  )
}
