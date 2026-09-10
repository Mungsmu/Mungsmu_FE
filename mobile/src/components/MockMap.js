import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Animated, Easing } from 'react-native'
import Svg, { Rect, Path } from 'react-native-svg'
import * as Location from 'expo-location'
import KakaoMapView from './KakaoMapView'
import { resolvePlace } from '../lib/kakaoRest'
import { COLORS } from '../theme'

// KakaoMapView는 플랫폼별로 갈린다: 네이티브(iOS/Android)는 KakaoMapView.js(react-native-webview),
// 웹 프리뷰(expo start --web)는 KakaoMapView.web.js(실제 브라우저 iframe)를 Metro가 자동으로 골라 쓴다.
// 두 경로 모두 로드에 실패하면(도메인 미등록 등) SVG 목업으로 조용히 대체한다.
const HAS_JS_KEY = !!process.env.EXPO_PUBLIC_KAKAO_JS_KEY

// 내비게이션 화면 배경 지도. 카카오맵 JS 키가 있으면 WebView로 실제 카카오맵을 띄우고,
// 키가 없거나 로드에 실패하면(도메인 미등록 등) 기존 SVG 목업 지도로 조용히 대체한다.
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

function SvgMockMap({ children }) {
  const [coords, setCoords] = useState(null)
  const [status, setStatus] = useState('loading')
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    (async () => {
      const { status: perm } = await Location.requestForegroundPermissionsAsync()
      if (perm !== 'granted') { setStatus('denied'); return }
      try {
        const pos = await Location.getCurrentPositionAsync({})
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setStatus('ok')
      } catch {
        setStatus('denied')
      }
    })()
  }, [])

  useEffect(() => {
    Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ).start()
  }, [pulse])

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] })
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] })

  return (
    <View style={styles.container}>
      <Svg viewBox="0 0 600 450" style={StyleSheet.absoluteFill} preserveAspectRatio="xMidYMid slice">
        <Rect x={0} y={0} width={600} height={450} fill="#E6EBE3" />
        {BLOCKS.map((b, i) => (
          <Rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={6} fill="#D8DFD5" />
        ))}
        {ROADS.map((d, i) => (
          <Path key={i} d={d} fill="none" stroke="#FFFFFF" strokeWidth={16} strokeLinecap="round" />
        ))}
        {ROADS.map((d, i) => (
          <Path key={`c-${i}`} d={d} fill="none" stroke="#E4B94F" strokeWidth={2} strokeDasharray="10 8" strokeLinecap="round" opacity={0.55} />
        ))}
      </Svg>

      <View style={styles.markerWrap} pointerEvents="none">
        <Animated.View style={[styles.markerPulse, { opacity, transform: [{ scale }] }]} />
        <View style={styles.markerDot} />
      </View>

      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.badgeText}>
          {status === 'ok' && coords ? `현재 위치 ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
            : status === 'denied' ? 'GPS 위치 확인 불가 · 목업 지도'
            : '위치 확인 중...'}
        </Text>
      </View>

      {children}
    </View>
  )
}

export default function MockMap({ children, markers, showPath, path, navPosition }) {
  const [mapFailed, setMapFailed] = useState(false)
  const [coords, setCoords] = useState(null)
  const [hasFix, setHasFix] = useState(false)
  const [resolvedMarkers, setResolvedMarkers] = useState([])
  const markerQuery = markers?.map(m => (m.lat != null ? `${m.lat},${m.lng}` : m.query)).join('|') ?? ''

  useEffect(() => {
    if (!HAS_JS_KEY || markers?.length) return // 마커가 있으면 좌표는 마커 쪽으로 지도 범위를 맞추므로 현재 위치는 굳이 안 구해도 된다
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return
      try {
        const pos = await Location.getCurrentPositionAsync({})
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setHasFix(true)
      } catch { /* 위치 못 구해도 지도 기본 중심으로 보여준다 */ }
    })()
  }, [markers])

  // 마커의 장소명(query)을 여기서 미리 좌표로 바꿔둔다. WebView 안 카카오맵 JS SDK의 자체
  // 키워드 검색(Places.keywordSearch)에 맡기면, 지도 표시(JS 키)와 검색(Local API) 서비스의
  // 콘솔 활성화·도메인 등록 조건이 달라서 지도는 뜨는데 검색만 401로 막히는 경우가 있다 —
  // 실도로 경로 계산에 이미 쓰고 있는 카카오 REST 키(kakaoRest.resolvePlace, 별도 인증 경로)로
  // 미리 좌표를 구해서 넘기면 그 문제를 완전히 피할 수 있다.
  useEffect(() => {
    if (!markers?.length) { setResolvedMarkers([]); return }
    let cancelled = false
    Promise.all(markers.map(async m => {
      if (m.lat != null && m.lng != null) return m
      const place = await resolvePlace(m.query)
      return place ? { ...m, lat: place.lat, lng: place.lng } : null
    })).then(list => { if (!cancelled) setResolvedMarkers(list.filter(Boolean)) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerQuery])

  if (HAS_JS_KEY && !mapFailed) {
    return (
      <View style={styles.container}>
        <KakaoMapView
          lat={coords?.lat} lng={coords?.lng} hasFix={hasFix}
          markers={markers?.length ? resolvedMarkers : markers} showPath={showPath} path={path} navPosition={navPosition}
          onError={() => setMapFailed(true)}
        />
        {children}
      </View>
    )
  }

  return <SvgMockMap>{children}</SvgMockMap>
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#E6EBE3' },
  markerWrap: { position: 'absolute', left: '50%', top: '52%', marginLeft: -14, marginTop: -14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  markerPulse: { position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(20,128,122,0.35)' },
  markerDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.primary, borderWidth: 3, borderColor: '#fff' },
  badge: { position: 'absolute', left: 14, bottom: 14, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { fontSize: 11, color: COLORS.textSub, fontWeight: '600' },
})
