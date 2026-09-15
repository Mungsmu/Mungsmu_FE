import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import MockMap from '../components/MockMap'
import TunnelBanner from '../components/TunnelBanner'
import TunnelGauge from '../components/TunnelGauge'
import TunnelProgressCard from '../components/TunnelProgressCard'
import { TurnPanel, HazardWidget, SummaryBar, fmtDistM, fmtClock12 } from '../components/NavOverlays'
import { COLORS, RADIUS, SHADOW_MD } from '../theme'
import { resolvePlace, haversineM, hasKakaoKey } from '../lib/kakaoRest'
import { cumulativeDistM, maneuverLabel, fetchRoute } from '../lib/route'
import { speak } from '../lib/speech'
import { recordTunnelPass, getMonthlyPassCount } from '../lib/tunnelStats'
import { resolveTunnelEndpoints } from '../lib/tunnelGeo'

// 웹의 src/pages/NavigatingPage.jsx와 동일 로직 — 실도로 경로(Valhalla) 기반 턴바이턴.
// RouteDetailScreen이 이미 계산해둔 path/maneuvers가 있으면 그대로 쓰고(재요청 없음),
// 없으면(레거시 진입 등) 목적지를 다시 지오코딩해 그 자리에서 계산한다.
//
// 동반 모드(터널 통과 호흡 가이드)는 예전에는 별도 화면(CompanionScreen)으로 전환했지만,
// 실제 주행 중에는 화면이 넘어갔다 돌아오면서 지도가 두 번 튀고 진행률이 끊기는 문제가 있어
// 이 화면 안에 오버레이로 통합했다 — 터널 진입~통과까지 지도·턴패널·하단 요약바 등 기존 내비
// UI는 그대로 유지한 채, 호흡 가이드 테두리·좌측 게이지·상단 보호자 호출 배너·터널 통과율만
// 덧붙였다가 통과하면 그 UI만 사라진다. CompanionScreen은 홈 화면 "동반 모드" 버튼으로 들어오는
// 실제 여정 없는 튜토리얼 전용으로 그대로 남겨둔다.
const TUNNEL_TRIGGER_M = 10
const DEMO_SPEED_MPS = 140
const ON_ROUTE_MAX_M = 250
const HAZARD_LOOKAHEAD_M = 1200
const HAZARD_SEEDS = [
  { type: '단속', frac: 0.16, speed: 80 },
  { type: '공사', frac: 0.42, speed: 60 },
  { type: '사고', frac: 0.66, speed: 40 },
  { type: '급정거', frac: 0.85, speed: 50 },
]
const APPROACH_MS = 5000
const BREATH_MS = 5000
const EXIT_WARN_M = 10
// 추정 타이머로 진행 중이라도 실제 GPS가 터널 출구 좌표 이 거리(m) 이내에서 다시 잡히면 그걸
// 우선해 즉시 통과 처리한다 — GPS 정확도·출구 앵커점 오차를 감안한 여유값.
const EXIT_CONFIRM_M = 50
// 터널 안은 GPS가 거의 잡히지 않아 실측 진행률을 못 구하는 경우가 대부분이다 — 그때는 진입 직전
// 속도(navState.speedKmh)와 터널 길이로 통과 소요 시간을 추정해 그 시간에 맞춰 자동으로 통과
// 처리한다. 상하한을 둬서 정차·서행 중 진입했거나 비정상적으로 빠른 값이 들어와도 터널 안에서
// 하염없이 멈추거나 순식간에 끝나버리지 않도록 한다.
const DEFAULT_PASS_KMH = 80
const MIN_PASS_KMH = 30
const MAX_PASS_KMH = 110

function fmtMMSS(totalSec) {
  const m = Math.floor(totalSec / 60)
  const s = Math.round(totalSec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function NavigatingScreen() {
  const nav = useNavigation()
  const insets = useSafeAreaInsets()
  const params = useRoute().params ?? {}
  const {
    origin = '출발지', dest = '목적지', durationMin = 192, distanceKm = 238,
    waypoints = [], tunnels: incomingTunnels, tunnel: singleTunnel,
    passedTunnels: initialPassedTunnels = [], path: incomingPath, maneuvers: incomingManeuvers,
    originPlace, destPlace,
  } = params

  const [pct, setPct] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [tunnelDistM, setTunnelDistM] = useState(null)
  const [gpsActive, setGpsActive] = useState(false)
  const [navState, setNavState] = useState(null) // { lat, lng, heading, zoom, idx, man, distToManM, man2, distMan2M, curStreet, remainM, remainMin, speedKmh, hazard }
  const [signalLost, setSignalLost] = useState(false)
  const [rerouting, setRerouting] = useState(false)
  const [routeError, setRouteError] = useState(!incomingPath && !hasKakaoKey)
  const [monthlyCount, setMonthlyCount] = useState(0)

  // 남은 터널 목록·통과한 터널 기록을 상태로 들고 있는다(예전처럼 화면을 다시 navigate해서
  // 새로 받는 게 아니라) — 그래야 터널을 하나 통과해도 지도·진행률·경로가 안 끊기고 이어진다.
  const [tunnels, setTunnels] = useState(incomingTunnels ?? (singleTunnel ? [singleTunnel] : []))
  const [passedTunnels, setPassedTunnels] = useState(initialPassedTunnels)
  const nextTunnel = tunnels[0] ?? null

  // 동반 모드(터널 통과) 오버레이 상태
  const [tunnelPhase, setTunnelPhase] = useState(null) // null | 'approach'(10m 전 안내) | 'breathing'(호흡 가이드 진행)
  const [breathPhase, setBreathPhase] = useState('exhale') // 'exhale'(내쉬기,빨강) | 'inhale'(들이마시기,초록)
  const [breathFrac, setBreathFrac] = useState(0) // 현재 호흡 구간 내 진행률 0~1
  const [tunnelPct, setTunnelPct] = useState(0) // 현재 터널 통과율 0~100
  const [tunnelExitWarned, setTunnelExitWarned] = useState(false)
  const [guardianState, setGuardianState] = useState('idle') // idle | calling | sent

  const arrivedSpokenRef = useRef(false)
  const tunnelTriggeredRef = useRef(false)
  const routeRef = useRef(null) // { path, cum, totalM, maneuvers, durationMin }
  const traveledRef = useRef(0)
  const gpsLiveRef = useRef(false) // GPS로 뭐라도(경로 위 실측이든 폴백 진행률이든) 추적 중 — 데모 주행 일시정지·정지 감지에만 쓴다
  const onRouteRef = useRef(false) // 경로 위에 실제로 스냅된 적이 있는지 — 이때 이탈하면만 재탐색한다.
  // gpsLiveRef와 분리한 이유: 실제 위치가 경로에서 멀리 떨어진 채(책상 테스트 등) 폴백 진행률만
  // 쓰고 있을 때도 gpsLiveRef는 true가 되는데, 그걸로 "이탈했다"고 재탐색을 걸면 애초에 경로 위에
  // 있어본 적도 없이 매번 "현재 위치→목적지"로 경로가 통째로 바뀌어버린다(실측된 회귀 버그).
  const lastSpokenManRef = useRef(null)
  const hazardsRef = useRef([])
  const reroutingRef = useRef(false)
  const completedRef = useRef(false)
  const navStateRef = useRef(null) // navState의 최신값 미러 — 터널 진입 트리거처럼 effect 클로저 밖에서 "지금 속도"가 필요한 곳에 쓴다
  const tunnelEnterTimeRef = useRef(null)
  const tunnelExitWarnedRef = useRef(false)
  const breathPhaseStartRef = useRef(Date.now())
  const tunnelCompletedRef = useRef(false)

  const handleRoute = route => {
    const cum = cumulativeDistM(route.path)
    routeRef.current = { ...route, cum, totalM: cum[cum.length - 1] }
    hazardsRef.current = HAZARD_SEEDS.map(s => ({ ...s, atM: s.frac * routeRef.current.totalM }))
    setRouteError(false)
    updateNav(traveledRef.current)
  }

  // 경로 확보: RouteDetailScreen이 이미 계산해둔 path가 있으면 그대로 쓰고, 없으면
  // (레거시 진입·MOCK_RESULT 등) 목적지를 지오코딩해서 그 자리에서 다시 계산한다.
  useEffect(() => {
    if (incomingPath?.length) {
      handleRoute({ path: incomingPath, maneuvers: incomingManeuvers ?? [], durationMin })
      return
    }
    if (!hasKakaoKey) return
    let cancelled = false
    ;(async () => {
      const o = originPlace ?? (await resolvePlace(origin))
      const d = destPlace ?? (await resolvePlace(dest))
      if (cancelled || !o || !d) { setRouteError(true); return }
      const route = await fetchRoute([o, d], { excludeTunnels: !nextTunnel })
      if (cancelled) return
      if (route) handleRoute(route)
      else setRouteError(true)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 경로 이탈 시 재탐색
  const reroute = async here => {
    if (reroutingRef.current) return
    reroutingRef.current = true
    setRerouting(true)
    gpsLiveRef.current = false
    traveledRef.current = 0
    lastSpokenManRef.current = null
    setNavState(null)
    setPct(0)
    speak('경로를 이탈하여 재탐색합니다.')
    try {
      const place = destPlace ?? (await resolvePlace(dest))
      const route = place ? await fetchRoute([here, place], { excludeTunnels: true }) : null
      if (route) handleRoute(route)
      else setRouteError(true)
    } catch {
      setRouteError(true)
    } finally {
      reroutingRef.current = false
      setRerouting(false)
    }
  }

  // 경로 위 누적 이동거리 → 현재 좌표·다음 안내·남은 거리/시간을 계산해 화면과 음성에 반영
  const updateNav = traveledM => {
    const r = routeRef.current
    if (!r || !r.totalM) return
    traveledRef.current = traveledM

    let lo = 0, hi = r.cum.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (r.cum[mid] < traveledM) lo = mid + 1; else hi = mid }
    const idx = lo
    const [lat, lng] = r.path[Math.min(idx, r.path.length - 1)]

    const man = r.maneuvers.find(m => m.idx > idx && m.type > 3) ?? null
    const distToManM = man ? Math.max(0, r.cum[Math.min(man.idx, r.cum.length - 1)] - traveledM) : 0
    const man2 = man ? (r.maneuvers.find(m => m.idx > man.idx && m.type > 3) ?? null) : null
    const distMan2M = man2 ? Math.max(0, r.cum[Math.min(man2.idx, r.cum.length - 1)] - r.cum[Math.min(man.idx, r.cum.length - 1)]) : 0
    let curStreet = ''
    for (const m of r.maneuvers) { if (m.idx > idx) break; if (m.street) curStreet = m.street }
    const remainM = Math.max(0, r.totalM - traveledM)
    const remainMin = Math.ceil((r.durationMin ?? durationMin) * remainM / r.totalM)
    const avgKmh = (r.totalM / ((r.durationMin ?? durationMin) * 60)) * 3.6
    const speedKmh = Math.round(avgKmh * (1 + 0.12 * Math.sin(traveledM / 2600)))
    const j = Math.min(idx + 3, r.path.length - 1)
    const toRad = d => (d * Math.PI) / 180
    const heading = (Math.atan2((r.path[j][1] - lng) * Math.cos(toRad(lat)), r.path[j][0] - lat) * 180 / Math.PI + 360) % 360
    const zoom = man && distToManM < 600 ? 3 : 4
    const lookaheadM = gpsLiveRef.current ? HAZARD_LOOKAHEAD_M : Math.max(HAZARD_LOOKAHEAD_M, DEMO_SPEED_MPS * 15)
    const hz = hazardsRef.current
      .filter(h => h.atM - traveledM > -20 && h.atM - traveledM <= lookaheadM)
      .sort((a, b) => a.atM - b.atM)[0] ?? null
    const hazard = hz ? { type: hz.type, distM: Math.max(0, hz.atM - traveledM), speed: hz.speed } : null

    if (man && man.idx !== lastSpokenManRef.current && distToManM <= 700) {
      lastSpokenManRef.current = man.idx
      speak(`잠시 후 ${maneuverLabel(man)}입니다.`)
    }

    const next = { lat, lng, heading, zoom, idx, man, distToManM, man2, distMan2M, curStreet, remainM, remainMin, speedKmh, hazard }
    navStateRef.current = next
    setNavState(next)
    setPct(Math.min(100, (traveledM / r.totalM) * 100))
  }

  // ① 데모 주행: GPS 실측이 없거나 정지 상태일 때 경로를 따라 자동 주행
  useEffect(() => {
    const TICK_MS = 500
    const t = setInterval(() => {
      const r = routeRef.current
      if (!r || gpsLiveRef.current || reroutingRef.current) return
      const step = DEMO_SPEED_MPS * (TICK_MS / 1000)
      updateNav(Math.min(traveledRef.current + step, r.totalM))
    }, TICK_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ② GPS 실측: 경로 근처에 있으면 맵매칭해 실측 기반으로, 이탈하면 재탐색.
  //    실경로 자체가 없는 환경(폴백)에서는 예전처럼 목적지 직선거리 기반 진행률을 쓴다.
  useEffect(() => {
    let cancelled = false
    let watchSub = null
    let stallTimer = null
    let startDist = null
    let lastRemain = null
    let lastMoveAt = Date.now()

    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return
      const place = destPlace ?? (hasKakaoKey ? await resolvePlace(dest) : null)
      if (cancelled) return

      watchSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 1 },
        pos => {
          setSignalLost(false)
          const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          const r = routeRef.current
          if (r) {
            let best = 0, bestD = Infinity
            for (let i = 0; i < r.path.length; i++) {
              const d = haversineM(here, { lat: r.path[i][0], lng: r.path[i][1] })
              if (d < bestD) { bestD = d; best = i }
            }
            if (bestD <= ON_ROUTE_MAX_M) {
              gpsLiveRef.current = true
              onRouteRef.current = true
              setGpsActive(true)
              lastMoveAt = Date.now()
              updateNav(r.cum[best])
              return
            }
            // "경로 위에 실제로 있어본 적이 있는데" 지금 멀어졌을 때만 이탈로 보고 재탐색한다.
            if (onRouteRef.current) { onRouteRef.current = false; reroute(here); return }
          }
          if (!place) return
          const remain = haversineM(here, place)
          if (startDist == null) startDist = Math.max(remain, 1)
          if (lastRemain != null && Math.abs(lastRemain - remain) <= 5) return
          lastRemain = remain
          lastMoveAt = Date.now()
          // gpsLiveRef도 같이 켜둬야 아래 stallTimer가 "6초간 못 움직임"을 감지해서 다시 꺼줄 수
          // 있다 — 이걸 안 켜면 경로에서 먼 곳(데스크 테스트 등)에서 GPS가 한 번이라도 잡히는
          // 순간 gpsActive가 영구히 true로 고정되어, 데모 주행 기반 터널 트리거(pct>=55)가
          // 실제로 터널에 다가가지 않는 한 평생 발동하지 않게 된다. onRouteRef는 여기서 켜지
          // 않는다 — 이건 "경로 위에 있다"가 아니라 "경로랑 멀리 떨어진 채 폴백 중"이기 때문에,
          // 이 상태에서 계속 멀리 있다고 재탐색을 걸면 매번 현재 위치로 경로가 통째로 바뀐다.
          gpsLiveRef.current = true
          setGpsActive(true)
          setPct(Math.min(100, Math.max(0, ((startDist - remain) / startDist) * 100)))
        },
      )
      stallTimer = setInterval(() => {
        if (gpsLiveRef.current && Date.now() - lastMoveAt > 6000) {
          gpsLiveRef.current = false
          onRouteRef.current = false
          setGpsActive(false)
        }
      }, 2000)
    })()

    return () => {
      cancelled = true
      if (stallTimer != null) clearInterval(stallTimer)
      watchSub?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest])

  useEffect(() => { getMonthlyPassCount().then(setMonthlyCount) }, [])

  // 터널 진입 — 예전에는 별도 화면(Companion)으로 전환했지만, 이제는 이 화면 안에서 상태만
  // 바꿔서 오버레이를 띄운다. 10m 전 안내 음성 후 5초 뒤 호흡 가이드가 시작되는 흐름은 그대로 유지.
  const enterTunnelCompanion = () => {
    if (tunnelTriggeredRef.current) return
    tunnelTriggeredRef.current = true
    setDismissed(false)
    setTunnelExitWarned(false)
    tunnelExitWarnedRef.current = false
    setTunnelPct(0)
    speak('터널 진입 10미터 전입니다. 곧 동반모드가 실행됩니다.')
    setTunnelPhase('approach')
    setTimeout(() => {
      tunnelEnterTimeRef.current = Date.now()
      tunnelCompletedRef.current = false
      setTunnelPhase('breathing')
    }, APPROACH_MS)
  }

  // 다음 터널까지의 실거리를 구해서 10m 이내면 동반 모드로 자동 진입. 실측이 안 되면 진행률 폴백.
  useEffect(() => {
    if (!nextTunnel || tunnelTriggeredRef.current) return
    let cancelled = false
    let watchSub = null
    ;(async () => {
      // 터널 진입점은 ①실도로 경로 추적 좌표 ②강원도 터널 실측 데이터셋(이름 매칭) ③마지막
      // 수단으로 이름 지오코딩 순으로 구한다 — ①②는 카카오 키 없이도 동작한다.
      const endpoints = resolveTunnelEndpoints(nextTunnel)
      const place = endpoints?.start ?? (hasKakaoKey ? await resolvePlace(nextTunnel.name) : null)
      if (cancelled || !place) return
      watchSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 2 },
        pos => {
          const d = haversineM({ lat: pos.coords.latitude, lng: pos.coords.longitude }, place)
          setTunnelDistM(Math.round(d))
          if (d <= TUNNEL_TRIGGER_M) enterTunnelCompanion()
        },
      )
    })()
    return () => { cancelled = true; watchSub?.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextTunnel])

  // 호흡 가이드: 5초 내쉬기 → 5초 들이마시기를 터널을 통과할 때까지 계속 반복한다. 음성이 실제로
  // 끝난 시점부터 5초를 세기 시작해서 "안내 음성 → 그 다음 5초간 호흡" 순서가 항상 지켜지게 한다.
  useEffect(() => {
    if (tunnelPhase !== 'breathing') return
    let cancelled = false
    let tickTimer = null
    const runPhase = ph => {
      if (cancelled) return
      setBreathPhase(ph)
      setBreathFrac(0)
      speak(ph === 'exhale' ? '5초간 숨을 내쉬세요.' : '5초간 숨을 들이마시세요.', {
        onend: () => {
          if (cancelled) return
          breathPhaseStartRef.current = Date.now()
          tickTimer = setInterval(() => {
            const elapsed = Date.now() - breathPhaseStartRef.current
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
  }, [tunnelPhase])

  const finishTunnel = () => {
    if (tunnelCompletedRef.current || !nextTunnel) return
    tunnelCompletedRef.current = true
    const passedTunnel = nextTunnel
    const sec = (Date.now() - (tunnelEnterTimeRef.current ?? Date.now())) / 1000
    recordTunnelPass().then(() => getMonthlyPassCount()).then(setMonthlyCount)
    speak('터널을 통과하셨습니다.')
    setTunnelPct(100)
    setTimeout(() => {
      setPassedTunnels(prev => [...prev, { name: passedTunnel.name, diff: passedTunnel.diff, sec }])
      setTunnels(prev => prev.slice(1))
      setTunnelPhase(null)
      tunnelTriggeredRef.current = false
    }, 1600)
  }

  // 터널 통과 진행률: 실제 이동거리(GPS 델타 누적)를 터널 길이와 비교. 호흡 단계에서만 진행되고,
  // 실측이 안 되면(터널 안이라 GPS가 끊기는 경우가 대부분·권한 거부·정지 상태 등) 진입 시각 +
  // 터널 길이/평균 속도로 통과 시점을 추정하는 타이머로 대체한다. 실측이 한 번 잡혔더라도 그 뒤
  // 일정 시간 갱신이 없으면(터널 진입 직후 신호 유실) 다시 타이머로 넘어간다 — 안 그러면 진입
  // 직후 GPS가 딱 한 번 잡히고 끊기는 순간 진행률이 영원히 멈춰버린다(실측된 버그).
  useEffect(() => {
    if (tunnelPhase !== 'breathing' || !nextTunnel) return
    const tunnel = nextTunnel
    const lengthM = tunnel.lengthM || 2000
    const warnAtM = Math.max(0, lengthM - EXIT_WARN_M)
    const passSpeedMps = Math.min(MAX_PASS_KMH, Math.max(MIN_PASS_KMH, navStateRef.current?.speedKmh || DEFAULT_PASS_KMH)) / 3.6
    // 실제 출구 좌표 — 터널 안에서 GPS가 다시 잡히는 순간(출구 부근에서 흔히 일어난다) 이 좌표와
    // 비교해서, 속도·길이로 추정한 타이머가 아직 안 끝났어도 실제로 이미 빠져나왔으면 즉시
    // 통과 처리한다. 이게 없으면 실제보다 느리게 추정했을 때 이미 빠져나온 뒤에도 동반 모드가
    // 계속 진행 중인 것처럼 보일 수 있다.
    const exitPoint = resolveTunnelEndpoints(tunnel)?.end

    const applyProgress = traveledM => {
      setTunnelPct(Math.min(100, Math.max(0, (traveledM / lengthM) * 100)))
      if (traveledM >= warnAtM && !tunnelExitWarnedRef.current) {
        tunnelExitWarnedRef.current = true
        setTunnelExitWarned(true)
        speak('터널 통과 10미터 전.')
      }
      if (traveledM >= lengthM) finishTunnel()
    }

    let cancelled = false
    let watchSub = null
    let mockTimer = null
    let usingGps = false
    let last = null
    let traveled = 0
    let lastGpsAt = Date.now()
    let stallTimer = null

    const startMock = () => {
      if (mockTimer) return
      mockTimer = setInterval(() => {
        traveled += passSpeedMps
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
            // 추정 타이머로 진행 중이더라도, 실제 GPS가 출구 근처(50m 이내)에서 다시 잡히면
            // 그걸 우선해 즉시 통과 처리한다 — 실제로는 이미 빠져나왔는데 느린 추정 탓에 계속
            // "통과 중"으로 남아있는 일을 막는다.
            if (exitPoint && haversineM(cur, exitPoint) <= EXIT_CONFIRM_M) {
              finishTunnel()
              return
            }
            if (last) {
              const delta = haversineM(last, cur)
              if (delta > 0.5 && delta < 200) {
                traveled += delta
                usingGps = true
                lastGpsAt = Date.now()
                stopMock()
                applyProgress(traveled)
              }
            }
            last = cur
          },
        )
        setTimeout(() => { if (!usingGps) startMock() }, 4000)
        stallTimer = setInterval(() => {
          if (usingGps && Date.now() - lastGpsAt > 5000) {
            usingGps = false
            startMock()
          }
        }, 1000)
      } catch {
        if (!cancelled) startMock()
      }
    })()

    return () => {
      cancelled = true
      stopMock()
      if (stallTimer) clearInterval(stallTimer)
      watchSub?.remove()
    }
  }, [tunnelPhase, nextTunnel])

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

  const arrived = pct >= 100
  useEffect(() => {
    if (arrived && !completedRef.current) {
      completedRef.current = true
      if (!arrivedSpokenRef.current) {
        arrivedSpokenRef.current = true
        speak('목적지에 도착하였습니다.')
      }
      getMonthlyPassCount().then(setMonthlyCount)
    }
  }, [arrived])

  const inTunnel = tunnelPhase != null
  const breathing = tunnelPhase === 'breathing'
  // 동반 모드는 실제 터널 좌표에 실측으로 가까워졌을 때만 뜬다(tunnelDistM은 위 GPS 워처가 채움) —
  // 진행률(pct) 기반 데모 추정은 실제 터널이 아닌 엉뚱한 지점에서 동반 모드를 띄울 수 있어 쓰지 않는다.
  const approachingSoon = !!nextTunnel && !tunnelTriggeredRef.current && !arrived && !dismissed
    && tunnelDistM != null && tunnelDistM <= 400
  const distanceLeftM = approachingSoon ? tunnelDistM : null
  const totalPassSec = passedTunnels.reduce((a, t) => a + (t.sec ?? 0), 0)

  const routeMarkers = [origin, ...waypoints, dest].map((name, i, arr) => ({
    id: `${i}`, label: i === 0 ? '출발' : i === arr.length - 1 ? '도착' : String(i + 1), query: name,
    color: i === 0 ? COLORS.textMuted : i === arr.length - 1 ? COLORS.gradeRed : COLORS.primary,
    ...(i === 0 && originPlace ? { lat: originPlace.lat, lng: originPlace.lng } : {}),
    ...(i === arr.length - 1 && destPlace ? { lat: destPlace.lat, lng: destPlace.lng } : {}),
  }))

  const breathBorderColor = breathPhase === 'exhale' ? '212,91,78' : '46,158,107' // 내쉬기=빨강, 들이마시기=초록
  const breathThickness = Math.round(breathFrac * 30)

  return (
    <View style={{ flex: 1 }}>
      {/* 동반 모드 호흡 가이드 테두리 — 기존 내비 UI를 가리지 않도록 화면 맨 위에 얇게 덧그린다 */}
      {breathing && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { zIndex: 5, borderWidth: breathThickness, borderColor: `rgba(${breathBorderColor},0.55)` }]}
        />
      )}

      <MockMap
        showPath
        path={incomingPath ?? routeRef.current?.path}
        navPosition={navState && !arrived ? { lat: navState.lat, lng: navState.lng, heading: navState.heading, zoom: navState.zoom } : null}
        markers={routeMarkers}
      >
        {navState?.man && !arrived && !approachingSoon && !inTunnel ? (
          <>
            <TurnPanel
              manType={navState.man.type}
              distText={fmtDistM(navState.distToManM)}
              streetText={navState.man.street}
              subLabel={maneuverLabel(navState.man)}
              subManType={navState.man2?.type ?? null}
              subDistText={navState.man2 ? fmtDistM(navState.distMan2M) : ''}
              signalLost={signalLost}
              rerouting={rerouting}
              onExit={() => nav.navigate('Home')}
              topOffset={insets.top}
            />
            <View style={[styles.gpsBadge, { top: 99 + insets.top }]}>
              <Text style={styles.gpsBadgeText}>{gpsActive ? 'GPS 실측' : '경로 시뮬레이션'}</Text>
            </View>
          </>
        ) : (
          <View style={[styles.topRow, { top: 16 + insets.top }]}>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>
                {arrived ? '도착 완료' : inTunnel ? '동반 모드 진행 중' : rerouting ? '경로 재탐색 중…' : gpsActive ? '주행 중 · GPS 실측' : '주행 중 · 내비게이션'}
              </Text>
            </View>
            <Pressable onPress={() => nav.navigate('Home')} style={styles.exitBtn}>
              <Text style={styles.exitText}>나가기 ✕</Text>
            </Pressable>
          </View>
        )}

        {navState?.hazard && !arrived && !inTunnel && (
          <HazardWidget type={navState.hazard.type} distText={fmtDistM(navState.hazard.distM)} speed={navState.hazard.speed} />
        )}

        {/* 동반 모드 오버레이 — 상단 가운데 배너(10m 전 안내 / 보호자 호출 / 통과 임박)와 좌측 게이지 */}
        {tunnelPhase === 'approach' ? (
          <TunnelBanner title="터널 진입 10m 전" subtitle="곧 동반모드가 시작됩니다" topOffset={insets.top} />
        ) : tunnelExitWarned ? (
          <TunnelBanner title="터널 통과 10m 전" subtitle="곧 도착해요, 조금만 더 힘내요" topOffset={insets.top} />
        ) : breathing ? (
          <TunnelBanner
            title={guardianState === 'calling' ? '보호자 호출 중...' : '보호자 호출'}
            subtitle={guardianState === 'sent' ? '- 메시지 전송 완료 -' : '탭하여 보호자를 호출해요'}
            onPress={callGuardian}
            disabled={guardianState === 'calling'}
            topOffset={insets.top}
          />
        ) : null}
        {breathing && <TunnelGauge pct={tunnelPct} />}

        {approachingSoon && (
          <>
            <TunnelBanner title={`${nextTunnel.name} 진입 ${distanceLeftM}m 전`} subtitle={`공황 난이도 ${nextTunnel.diff}단계`} topOffset={insets.top} />
            <TunnelGauge pct={4} />
          </>
        )}

        {arrived && (
          <View style={styles.arrivedCard}>
            <View style={styles.arrivedIcon}><Text style={{ fontSize: 24 }}>✓</Text></View>
            <Text style={styles.arrivedTitle}>목적지에 도착하였습니다</Text>
            <Text style={[styles.arrivedDesc, passedTunnels.length > 0 && { marginBottom: 16 }]}>
              {passedTunnels.length > 0 ? '터널 구간을 지나 무사히 도착했어요.' : '터널 없는 안심 경로로 편안하게 도착했어요.'}
            </Text>
            {passedTunnels.length > 0 && (
              <>
                <View style={styles.arrivedStatRow}>
                  <View style={styles.arrivedStatBox}>
                    <Text style={styles.arrivedStatValue}>{fmtMMSS(totalPassSec)}</Text>
                    <Text style={styles.arrivedStatLabel}>터널 통과 시간</Text>
                  </View>
                  <View style={styles.arrivedStatBox}>
                    <Text style={styles.arrivedStatValue}>{monthlyCount}회</Text>
                    <Text style={styles.arrivedStatLabel}>이번 달 누적</Text>
                  </View>
                </View>
                <View style={styles.arrivedTunnelList}>
                  <Text style={styles.arrivedTunnelListLabel}>이번 여정 통과 터널</Text>
                  {passedTunnels.map((t, i) => (
                    <View key={`${t.name}-${i}`} style={styles.arrivedTunnelRow}>
                      <View style={styles.arrivedTunnelDot} />
                      <Text style={styles.arrivedTunnelText}>{t.name} · 난이도 {t.diff}단계</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        <View style={styles.bottomWrap}>
          {!arrived && navState && (
            <View style={styles.speedoWrap}>
              <View style={styles.speedo}>
                <Text style={styles.speedoValue}>{navState.speedKmh}</Text>
                <Text style={styles.speedoLabel}>km/h</Text>
              </View>
            </View>
          )}

          {/* 터널 통과율 — 동반 모드 튜토리얼(CompanionScreen)과 같은 카드. 기존 하단 요약바
              (실제 주행 도로·남은 거리·도착 예정)는 그대로 두고 그 위에 덧붙인다 */}
          {breathing && nextTunnel && (
            <View style={{ marginBottom: 10 }}>
              <TunnelProgressCard name={nextTunnel.name} pct={tunnelPct} />
            </View>
          )}

          <SummaryBar
            street={navState?.curStreet ?? ''}
            remainText={navState ? `${(navState.remainM / 1000).toFixed(1)}km` : `${distanceKm}km`}
            etaText={navState ? fmtClock12(new Date(Date.now() + navState.remainMin * 60000)) : '--:--'}
            pct={Math.round(pct)}
            danger={approachingSoon}
            arrived={arrived}
            origin={origin}
            dest={dest}
            error={routeError}
          />

          {approachingSoon ? (
            <View style={styles.actionRow}>
              <Pressable onPress={() => setDismissed(true)} style={[styles.actionBtn, styles.actionBtnLight]}>
                <Text style={styles.actionTextLight}>나중에</Text>
              </Pressable>
              <Pressable onPress={enterTunnelCompanion} style={[styles.actionBtn, styles.actionBtnPrimary, { flex: 1.4 }]}>
                <Text style={styles.actionTextPrimary}>동반 모드 시작</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => nav.navigate('Home')} style={[styles.actionBtn, arrived ? styles.actionBtnPrimary : styles.actionBtnLight, { marginTop: 10 }]}>
              <Text style={arrived ? styles.actionTextPrimary : styles.actionTextLight}>{arrived ? '여정 마치기' : '안내 종료'}</Text>
            </Pressable>
          )}
        </View>
      </MockMap>
    </View>
  )
}

const styles = StyleSheet.create({
  topRow: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  statusPill: { backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7 },
  statusText: { fontSize: 12.5, fontWeight: '700', color: COLORS.textSub },
  exitBtn: { marginLeft: 'auto', backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7 },
  exitText: { fontSize: 13, fontWeight: '700', color: COLORS.textSub },
  gpsBadge: { position: 'absolute', top: 99, right: 16, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  gpsBadgeText: { fontSize: 10.5, fontWeight: '700', color: COLORS.textSub },
  arrivedCard: { position: 'absolute', top: '30%', left: 30, right: 30, alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 26, ...SHADOW_MD },
  arrivedIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#EAF7EF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  arrivedTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textHead },
  arrivedDesc: { fontSize: 12.5, color: COLORS.textSub, marginTop: 6, textAlign: 'center' },
  arrivedStatRow: { flexDirection: 'row', gap: 10, width: '100%' },
  arrivedStatBox: { flex: 1, backgroundColor: '#F6F8FA', borderRadius: 11, padding: 11, alignItems: 'center' },
  arrivedStatValue: { fontWeight: '800', fontSize: 16, color: '#0E5E58' },
  arrivedStatLabel: { fontSize: 10.5, color: COLORS.textMuted, marginTop: 3 },
  arrivedTunnelList: { width: '100%', marginTop: 14 },
  arrivedTunnelListLabel: { fontSize: 10.5, color: COLORS.textMuted, letterSpacing: 0.5, marginBottom: 6 },
  arrivedTunnelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  arrivedTunnelDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  arrivedTunnelText: { fontSize: 12.5, color: COLORS.textHead, fontWeight: '600' },
  bottomWrap: { position: 'absolute', left: 16, right: 16, bottom: 16 },
  speedoWrap: { flexDirection: 'row', marginBottom: 10 },
  speedo: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff', borderWidth: 4, borderColor: '#1A6DE3', alignItems: 'center', justifyContent: 'center', ...SHADOW_MD },
  speedoValue: { fontSize: 20, fontWeight: '800', color: COLORS.textHead },
  speedoLabel: { fontSize: 8.5, fontWeight: '700', color: COLORS.textMuted, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 9, marginTop: 10 },
  actionBtn: { flex: 1, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  actionBtnLight: { backgroundColor: '#fff', ...SHADOW_MD },
  actionBtnPrimary: { backgroundColor: COLORS.primary },
  actionTextLight: { fontSize: 13, fontWeight: '700', color: COLORS.textSub },
  actionTextPrimary: { fontSize: 13, fontWeight: '800', color: '#fff' },
})
