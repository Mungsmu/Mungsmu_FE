import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import * as Location from 'expo-location'
import MockMap from '../components/MockMap'
import TunnelBanner from '../components/TunnelBanner'
import TunnelGauge from '../components/TunnelGauge'
import { COLORS } from '../theme'
import { DEFAULT_TUNNEL } from '../data/routeMock'
import { haversineM, hasKakaoKey, resolvePlace } from '../lib/kakaoRest'
import { cumulativeDistM, fetchRoute, traceTunnels } from '../lib/route'
import { speak } from '../lib/speech'
import { recordTunnelPass, getMonthlyPassCount } from '../lib/tunnelStats'

// 웹의 src/pages/CompanionPage.jsx와 동일 로직 — 5초 내쉬기 → 5초 들이마시기를 터널을 통과할
// 때까지 반복. 화면 테두리가 내쉴 때 빨강, 들이마실 때 초록으로 5초에 걸쳐 차오르는 것으로만
// 표시하고(별도 카드/숫자 카운트다운 없음), 음성이 실제로 끝난 시점부터 5초를 센다.
const BREATH_MS = 5000
const EXIT_WARN_M = 10
const APPROACH_MS = 5000
// 주행 카메라가 움직일 경로: 터널 이름을 지오코딩한 지점 전후로 여러 각도를 시도해 실도로 경로를 구하고,
// traceTunnels()로 그 경로가 실제 이 터널을 지나는지 검증한다 (도로 진행 방향을 모르므로 각도를 바꿔가며 시도).
// 지오코딩·검증에 실패하면(카카오 키 없음 등) 주행 카메라 없이 기본 지도만 보여준다.
// (웹의 src/pages/CompanionPage.jsx와 동일 로직)
const TUNNEL_PASS_BEARINGS = [0, 45, 90, 135]

function fmtMMSS(totalSec) {
  const m = Math.floor(totalSec / 60)
  const s = Math.round(totalSec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function CompanionScreen() {
  const nav = useNavigation()
  const params = useRoute().params ?? {}
  const tunnel = params.tunnel ?? DEFAULT_TUNNEL
  const tunnels = params.tunnels ?? [tunnel]
  const remainingTunnels = tunnels.slice(1)
  const { origin, dest, durationMin, distanceKm, waypoints = [], passedTunnels = [] } = params
  const isTutorial = !dest

  // phase: 'approach'(10m 전 팝업, 아직 호흡 없음) → 'breathing'(터널 안, 호흡 가이드 진행) → 'done'(튜토리얼 통과 완료, 나가기 대기)
  const [phase, setPhase] = useState('approach')
  const [breathPhase, setBreathPhase] = useState('exhale') // 'exhale'(내쉬기,빨강) | 'inhale'(들이마시기,초록)
  const [breathFrac, setBreathFrac] = useState(0) // 현재 호흡 구간 내 진행률 0~1 (테두리를 5초에 걸쳐 매끄럽게 채움)
  const [pct, setPct] = useState(0)
  const [guardianState, setGuardianState] = useState('idle') // idle | calling | sent
  const [exitWarned, setExitWarned] = useState(false)
  const [monthlyCount, setMonthlyCount] = useState(0)
  const [navPos, setNavPos] = useState(null) // { lat, lng, heading, zoom } — 경로 위 주행 카메라 위치
  const [tunnelPath, setTunnelPath] = useState(null) // [[lat,lng],...] 검증된 실제 터널 구간. 없으면 주행 카메라 미표시
  const [pathResolved, setPathResolved] = useState(false) // 터널 구간 탐색이 끝났는지 — 끝나기 전엔 마커를 아예 안 그려서, "일단 이름으로 찾은 위치" → "실제 터널 구간"으로 지도가 두 번 튀는 걸 막는다

  const phaseStartRef = useRef(Date.now())
  const enterTimeRef = useRef(null)
  const exitWarnedRef = useRef(false)
  const completedRef = useRef(false)
  const demoRouteRef = useRef(null) // { path, cum, totalM } — 주행 카메라가 따라갈 경로

  // 0) 터널 구간 경로 확보. RouteInputScreen에서 실도로 경로를 계산할 때(computeRouteResult)
  // 이미 traceTunnels로 검증해서 실제 터널 구간 좌표(tunnel.path)를 붙여준 경우 그걸 그대로 쓴다
  // — 합성 이름(예: "서울양양고속도로 터널")은 장소명 검색으로 다시 지오코딩하면 엉뚱한 곳이 나올 수
  // 있어서, 이미 검증된 좌표가 있으면 재검색하지 않는 것이 훨씬 안정적이다.
  // 없으면(홈 화면 "동반 모드" 버튼으로 들어온 튜토리얼 등) 터널 이름을 지오코딩한 지점 전후로 몇
  // 각도를 시도해 실도로 경로를 계산하고, traceTunnels()로 실제 이 터널을 지나는지 검증한다.
  useEffect(() => {
    let cancelled = false
    setTunnelPath(null)
    setPathResolved(false)
    demoRouteRef.current = null
    if (tunnel.path?.length >= 2) {
      setTunnelPath(tunnel.path)
      setPathResolved(true)
      const cum = cumulativeDistM(tunnel.path)
      demoRouteRef.current = { path: tunnel.path, cum, totalM: cum[cum.length - 1] }
      return
    }
    if (!hasKakaoKey) { setPathResolved(true); return }
    ;(async () => {
      try {
        const center = await resolvePlace(tunnel.name)
        if (cancelled || !center) return
        const lengthM = tunnel.lengthM || 2000
        const halfM = Math.max(300, lengthM / 2) + 250
        for (const bearing of TUNNEL_PASS_BEARINGS) {
          if (cancelled) return
          const rad = (bearing * Math.PI) / 180
          const dLat = (halfM * Math.cos(rad)) / 111320
          const dLng = (halfM * Math.sin(rad)) / (111320 * Math.cos((center.lat * Math.PI) / 180))
          const a = { lat: center.lat - dLat, lng: center.lng - dLng }
          const b = { lat: center.lat + dLat, lng: center.lng + dLng }
          const route = await fetchRoute([a, b])
          if (!route) continue
          const traced = await traceTunnels(route.shapes)
          const seg = traced?.find(s => s.lengthM >= lengthM * 0.5 && s.begin != null && s.end != null)
          if (seg) {
            const BUFFER_PTS = 6
            const startIdx = Math.max(0, seg.begin - BUFFER_PTS)
            const endIdx = Math.min(route.path.length - 1, seg.end + BUFFER_PTS)
            const trimmed = route.path.slice(startIdx, endIdx + 1)
            if (trimmed.length >= 2 && !cancelled) {
              setTunnelPath(trimmed)
              const cum = cumulativeDistM(trimmed)
              demoRouteRef.current = { path: trimmed, cum, totalM: cum[cum.length - 1] }
            }
            return
          }
        }
      } catch { /* 실패 시 폴백(기본 지도만) 유지 */ }
      finally { if (!cancelled) setPathResolved(true) }
    })()
    return () => { cancelled = true }
  }, [tunnel])

  // 1) 접근 단계: 10m 전 팝업 + 음성. 아직 호흡 가이드는 시작하지 않는다.
  useEffect(() => {
    speak('터널 진입 10미터 전입니다. 곧 동반모드가 실행됩니다.')
    const t = setTimeout(() => {
      enterTimeRef.current = Date.now()
      setPhase('breathing')
    }, APPROACH_MS)
    return () => clearTimeout(t)
  }, [])

  // 2) 호흡 가이드: 5초 내쉬기 → 5초 들이마시기를 터널을 통과할 때까지 계속 반복한다.
  // 음성이 실제로 끝난 시점부터 5초를 세기 시작해서, 문장이 채 끝나기도 전에 테두리가 먼저 차오르는
  // 어긋남 없이 "안내 음성 → 그 다음 5초간 호흡" 순서가 항상 지켜지도록 한다.
  useEffect(() => {
    if (phase !== 'breathing') return
    let cancelled = false
    let tickTimer = null

    const runPhase = ph => {
      if (cancelled) return
      setBreathPhase(ph)
      setBreathFrac(0)
      speak(ph === 'exhale' ? '5초간 숨을 내쉬세요.' : '5초간 숨을 들이마시세요.', {
        onend: () => {
          if (cancelled) return
          phaseStartRef.current = Date.now()
          tickTimer = setInterval(() => {
            const elapsed = Date.now() - phaseStartRef.current
            if (elapsed >= BREATH_MS) {
              clearInterval(tickTimer)
              runPhase(ph === 'exhale' ? 'inhale' : 'exhale')
            } else {
              setBreathFrac(elapsed / BREATH_MS)
            }
          }, 100)
        },
      })
    }
    runPhase('exhale')

    return () => { cancelled = true; if (tickTimer) clearInterval(tickTimer) }
  }, [phase])

  const finish = () => {
    if (completedRef.current) return
    completedRef.current = true
    const sec = (Date.now() - (enterTimeRef.current ?? Date.now())) / 1000
    recordTunnelPass().then(() => getMonthlyPassCount()).then(setMonthlyCount)
    speak('터널을 통과하셨습니다.')
    setPct(100)
    if (isTutorial) {
      setPhase('done')
      return
    }
    setTimeout(() => {
      const newPassed = [...passedTunnels, { name: tunnel.name, diff: tunnel.diff, sec }]
      nav.navigate('Navigating', {
        origin, dest, durationMin, distanceKm, waypoints,
        tunnels: remainingTunnels, passedTunnels: newPassed,
      })
    }, 1600)
  }

  // 3) 터널 통과 진행률: 실제 이동거리(GPS 델타 누적)를 터널 길이와 비교. 호흡 단계에서만 진행되고,
  // 실측이 안 되면(권한 거부·정지 상태 등) 타이머 데모로 대체한다.
  useEffect(() => {
    if (phase !== 'breathing') return
    const lengthM = tunnel?.lengthM || 2000
    const warnAtM = Math.max(0, lengthM - EXIT_WARN_M)

    const applyProgress = traveledM => {
      setPct(Math.min(100, Math.max(0, (traveledM / lengthM) * 100)))
      if (traveledM >= warnAtM && !exitWarnedRef.current) {
        exitWarnedRef.current = true
        setExitWarned(true)
        speak('터널 통과 10미터 전.')
      }
      if (traveledM >= lengthM) finish()
    }

    let cancelled = false
    let watchSub = null
    let mockTimer = null
    let usingGps = false
    let last = null
    let traveled = 0

    const startMock = () => {
      if (usingGps || mockTimer) return
      mockTimer = setInterval(() => {
        traveled += lengthM / 24
        applyProgress(traveled)
      }, 1000)
    }
    const stopMock = () => { if (mockTimer) { clearInterval(mockTimer); mockTimer = null } }

    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') { startMock(); return }
      try {
        watchSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 1 },
          pos => {
            const cur = { lat: pos.coords.latitude, lng: pos.coords.longitude }
            if (last) {
              const delta = haversineM(last, cur)
              if (delta > 0.5 && delta < 200) {
                traveled += delta
                usingGps = true
                stopMock()
                applyProgress(traveled)
              }
            }
            last = cur
          },
        )
        setTimeout(() => { if (!usingGps) startMock() }, 4000)
      } catch {
        if (!cancelled) startMock()
      }
    })()

    return () => {
      cancelled = true
      stopMock()
      watchSub?.remove()
    }
  }, [phase, tunnel])

  // 터널 통과 진행률(pct, 0~100)을 실제 터널 경로 위 위치로 매핑해 주행 카메라를 움직인다.
  // 짧은 터널은 경로 좌표점 간격이 넓어서(도로가 곧으면 Valhalla가 점을 듬성듬성 찍음) 점에 그대로
  // 스냅하면 카메라가 멈췄다 점프하는 것처럼 보인다 — 두 점 사이를 거리 비율로 보간해 부드럽게 잇는다.
  useEffect(() => {
    const r = demoRouteRef.current
    if (!r || !r.totalM) return
    const traveledM = (pct / 100) * r.totalM
    let lo = 0, hi = r.cum.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (r.cum[mid] < traveledM) lo = mid + 1; else hi = mid }
    const idx = lo
    const prevIdx = Math.max(0, idx - 1)
    const segLenM = r.cum[idx] - r.cum[prevIdx]
    const t = segLenM > 0 ? Math.min(1, Math.max(0, (traveledM - r.cum[prevIdx]) / segLenM)) : 1
    const [la0, ln0] = r.path[prevIdx]
    const [la1, ln1] = r.path[Math.min(idx, r.path.length - 1)]
    const lat = la0 + (la1 - la0) * t
    const lng = ln0 + (ln1 - ln0) * t
    const j = Math.min(idx + 3, r.path.length - 1)
    const toRad = d => (d * Math.PI) / 180
    const heading = (Math.atan2((r.path[j][1] - lng) * Math.cos(toRad(lat)), r.path[j][0] - lat) * 180 / Math.PI + 360) % 360
    setNavPos({ lat, lng, heading, zoom: 4 })
  }, [pct])

  const callGuardian = () => {
    if (guardianState === 'calling') return
    setGuardianState('calling')
    speak('보호자를 호출합니다.')
    setTimeout(() => {
      setGuardianState('sent')
      speak('보호자 호출 완료.')
      setTimeout(() => setGuardianState('idle'), 4000)
    }, 1200)
  }

  const breathing = phase === 'breathing'
  const borderColor = breathPhase === 'exhale' ? '212,91,78' : '46,158,107' // 내쉬기=빨강, 들이마시기=초록
  const thickness = Math.round(breathFrac * 30)
  // 터널 구간 탐색이 끝나기 전에는 마커를 아예 안 그린다 — "일단 이름으로 찾은 위치"를 먼저
  // 보여줬다가 실제 구간 좌표가 나오면 지도가 다시 튀는 깜빡임을 막고, 탐색이 끝나면(성공이든
  // 실패든) 최종 모습으로 한 번에 전환한다.
  const demoMarkers = tunnelPath
    ? [
        { id: 'o', label: '진입', lat: tunnelPath[0][0], lng: tunnelPath[0][1], color: '#8A98A2' },
        { id: 'd', label: '진출', lat: tunnelPath[tunnelPath.length - 1][0], lng: tunnelPath[tunnelPath.length - 1][1], color: '#D45B4E' },
      ]
    : pathResolved
      ? [{ id: tunnel.id, label: tunnel.name, query: tunnel.name, color: '#D45B4E' }]
      : []

  return (
    <View style={{ flex: 1 }}>
      {/* 호흡 가이드: 호흡 단계에서만 화면 테두리가 내쉴 때 빨강, 들이마실 때 초록으로 5초에 걸쳐
          차오른다. 중앙에는 별도 카드를 두지 않는다 — 실제 주행 화면(지도)을 가리지 않기 위함. */}
      {breathing && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { zIndex: 2, borderWidth: thickness, borderColor: `rgba(${borderColor},0.55)` }]}
        />
      )}

      <MockMap
        showPath
        path={tunnelPath ?? undefined}
        navPosition={phase !== 'done' ? navPos : null}
        markers={demoMarkers}
      >
        <View style={styles.topRow}>
          <View style={styles.sharePill}>
            <View style={styles.shareDot} />
            <Text style={styles.shareText}>보호자 김민준 님께 실시간 위치 공유 중</Text>
          </View>
          <Pressable onPress={() => nav.goBack()} style={styles.exitBtn}>
            <Text style={styles.exitText}>나가기 ✕</Text>
          </Pressable>
        </View>

        {phase === 'approach' ? (
          <TunnelBanner title="터널 진입 10m 전" subtitle="곧 동반모드가 시작됩니다" />
        ) : phase === 'done' ? (
          <TunnelBanner title="터널을 통과하셨습니다" subtitle="나가기를 눌러 마칠 수 있어요" />
        ) : exitWarned ? (
          <TunnelBanner title="터널 통과 10m 전" subtitle="곧 도착해요, 조금만 더 힘내요" />
        ) : (
          <TunnelBanner
            title={guardianState === 'calling' ? '보호자 호출 중...' : '보호자 호출'}
            subtitle={guardianState === 'sent' ? '- 메시지 전송 완료 -' : '탭하여 보호자를 호출해요'}
            onPress={callGuardian}
            disabled={guardianState === 'calling'}
          />
        )}
        {breathing && <TunnelGauge pct={pct} />}
      </MockMap>
    </View>
  )
}

const styles = StyleSheet.create({
  topRow: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sharePill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7, flexShrink: 1 },
  shareDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  shareText: { fontSize: 12, color: '#0E5E58', fontWeight: '700', flexShrink: 1 },
  exitBtn: { marginLeft: 'auto', backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7 },
  exitText: { fontSize: 13, fontWeight: '700', color: COLORS.textSub },
})
