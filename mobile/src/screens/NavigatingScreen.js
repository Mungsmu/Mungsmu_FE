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
import { cumulativeDistM, maneuverLabel, fetchRoute, traceTunnels } from '../lib/route'
import { speak, stopSpeech, SpeechPriority } from '../lib/speech'
import { recordTunnelPass, getMonthlyPassCount } from '../lib/tunnelStats'
import { nearestGangwonTunnel, findGangwonTunnel, estimateDiff, tunnelDisplayName, formatTunnelLength, COMPANION_MIN_M } from '../lib/tunnelGeo'

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
const TUNNEL_APPROACH_M = 200  // 이 거리(m) 안으로 들어오면 상단에 터널 접근 배너를 띄운다
const TUNNEL_ANNOUNCE_M = 200  // 이 거리(m)에서 "잠시 후 진입" 음성 안내 + 동반 모드 준비 단계 시작
const DEMO_SPEED_MPS = 140
const ON_ROUTE_MAX_M = 250
const OFF_ROUTE_STRIKES = 3      // 연속 이 횟수만큼 경로 밖으로 잡혀야 재탐색한다 (튄 신호 한 번으로 돌지 않게)
const GPS_ACCURACY_MAX_M = 120  // 이보다 부정확한 신호는 버린다 (터널 출구·도심에서 흔히 크게 튄다)
const TUNNEL_GPS_GRACE_MS = 15000 // 터널을 빠져나온 뒤 이 시간 동안은 GPS를 신뢰하지 않는다
const GPS_REWIND_MAX_M = 200 // GPS 스냅이 이보다 많이 뒤로 가면 노이즈로 보고 버린다(경로 되감기 방지)
const PROGRESS_STALL_MS = 6000 // 경로상 진행이 이 시간 동안 없으면 추측항법이 이어받는다
const HAZARD_LOOKAHEAD_M = 1200
const HAZARD_SEEDS = [
  { type: '단속', frac: 0.16, speed: 80 },
  { type: '공사', frac: 0.42, speed: 60 },
  { type: '사고', frac: 0.66, speed: 40 },
  { type: '급정거', frac: 0.85, speed: 50 },
]
const BREATH_MS = 5000
// 호흡 안내 음성은 매 사이클(5초)마다 말하지 않는다 — 처음 한 세트로 리듬만 알려주고, 긴 터널에서는
// 이 거리(m)만큼 더 갈 때마다 한 번씩만 다시 말해 리듬을 잃지 않게 한다.
const BREATH_VOICE_INTERVAL_M = 1000
const EXIT_WARN_M = 120 // 출구까지 이 거리(m) 안으로 들어오면 "곧 빠져나갑니다" 안내
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
    waypoints = [], tunnels: incomingTunnels,
    passedTunnels: initialPassedTunnels = [], path: incomingPath, maneuvers: incomingManeuvers,
    shapes: incomingShapes, originPlace, destPlace,
  } = params
  // 사용자가 길찾기에서 고른 경로를 그대로 달린다. 예전에는 "남은 터널이 있으면 shortest, 없으면
  // avoid"로 파생시켜서, 마지막 터널을 통과하는 순간 경로가 통째로 바뀌며 주행 위치가 튀었다.
  const routeProfile = params.routeProfile ?? (incomingTunnels?.length ? 'shortest' : 'avoid')

  const [pct, setPct] = useState(0)
  // "나중에"로 건너뛴 터널의 startM. 실제 판정은 터널 객체의 dismissed 플래그가 하고, 이 상태는
  // 플래그를 바꾼 뒤 화면을 다시 그리게 하는 용도다(터널 목록은 ref라 그것만으로는 리렌더가 안 된다).
  const [dismissed, setDismissed] = useState(false)
  const [gpsActive, setGpsActive] = useState(false)
  const [navState, setNavState] = useState(null) // { lat, lng, heading, zoom, idx, man, distToManM, man2, distMan2M, curStreet, remainM, remainMin, speedKmh, hazard }
  const [signalLost, setSignalLost] = useState(false)
  const [rerouting, setRerouting] = useState(false)
  const [routeError, setRouteError] = useState(!incomingPath && !hasKakaoKey)
  const [monthlyCount, setMonthlyCount] = useState(0)

  // 통과한 터널 기록(도착 요약용). 남은 터널 목록은 경로에서 직접 실측하므로 상태로 들지 않는다.
  const [passedTunnels, setPassedTunnels] = useState(initialPassedTunnels)

  // 동반 모드(터널 통과) 오버레이 상태
  const [tunnelPhase, setTunnelPhase] = useState(null) // null | 'approach'(10m 전 안내) | 'breathing'(호흡 가이드 진행)
  const [breathPhase, setBreathPhase] = useState('exhale') // 'exhale'(내쉬기,빨강) | 'inhale'(들이마시기,초록)
  const [breathFrac, setBreathFrac] = useState(0) // 현재 호흡 구간 내 진행률 0~1
  const [tunnelPct, setTunnelPct] = useState(0) // 현재 터널 통과율 0~100
  const [tunnelExitWarned, setTunnelExitWarned] = useState(false)
  const [guardianState, setGuardianState] = useState('idle') // idle | calling | sent

  const arrivedSpokenRef = useRef(false)
  // 경로가 실제로 지나는 터널 [{ id, name, lengthM, diff, startM, endM, announced, entered, passed, dismissed }]
  // startM/endM은 경로상 누적거리(m) — 진입·통과 판정의 유일한 기준이다. startM 오름차순.
  const routeTunnelsRef = useRef([])
  const inTunnelRef = useRef(false)      // 지금 터널 안인지 — 터널 안에서는 GPS 대신 추측항법으로 달린다
  const tunnelExitAtRef = useRef(0)      // 마지막으로 터널을 빠져나온 시각(ms)
  const offRouteStrikesRef = useRef(0)   // 연속으로 경로 밖에 잡힌 횟수
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
    loadRouteTunnels(route, cum)
  }

  // 지금 달리는 경로가 실제로 지나는 터널을 OSM 터널 태그로 실측하고, 각 구간의 시작/끝을 경로상
  // 누적거리로 바꿔둔다. 이름·공황 난이도는 강원도 실측 데이터셋에서 보강하고, 동반 모드는 호흡
  // 가이드를 시작할 시간이 되는 500m 이상 터널만 대상으로 한다.
  const loadRouteTunnels = async (route, cum) => {
    routeTunnelsRef.current = []
    if (!route.shapes?.length) return // shapes 없이 들어온 레거시 경로는 터널 실측을 건너뛴다
    const segs = await traceTunnels(route.shapes)
    if (!segs || routeRef.current?.path !== route.path) return
    routeTunnelsRef.current = segs
      .filter(seg => seg.lengthM >= COMPANION_MIN_M)
      .map((seg, i) => {
        const startM = cum[Math.min(seg.beginIdx, cum.length - 1)]
        const endM = cum[Math.min(seg.endIdx, cum.length - 1)]
        const entry = { lat: route.path[seg.beginIdx][0], lng: route.path[seg.beginIdx][1] }
        const osmName = tunnelDisplayName(seg)
        const known = findGangwonTunnel(osmName) ?? nearestGangwonTunnel(entry, 400)
        return {
          id: known?.id ?? `seg-${i}`,
          name: known?.name ?? osmName,
          lengthM: Math.max(1, Math.round(endM - startM)) || seg.lengthM,
          diff: known?.diff ?? estimateDiff(seg.lengthM),
          startM, endM,
          announced: false, entered: false, dismissed: false,
          passed: endM <= traveledRef.current,
        }
      })
      .sort((a, b) => a.startM - b.startM)
  }

  // 경로 확보: RouteDetailScreen이 이미 계산해둔 path가 있으면 그대로 쓰고, 없으면
  // (레거시 진입·MOCK_RESULT 등) 목적지를 지오코딩해서 그 자리에서 다시 계산한다.
  useEffect(() => {
    if (incomingPath?.length) {
      handleRoute({ path: incomingPath, maneuvers: incomingManeuvers ?? [], shapes: incomingShapes, durationMin })
      return
    }
    if (!hasKakaoKey) return
    let cancelled = false
    ;(async () => {
      const o = originPlace ?? (await resolvePlace(origin))
      const d = destPlace ?? (await resolvePlace(dest))
      if (cancelled || !o || !d) { setRouteError(true); return }
      const route = await fetchRoute([o, d], { excludeTunnels: routeProfile === 'avoid' })
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
    inTunnelRef.current = false
    offRouteStrikesRef.current = 0
    traveledRef.current = 0
    lastSpokenManRef.current = null
    setNavState(null)
    setPct(0)
    speak('경로를 이탈하여 재탐색합니다.')
    try {
      const place = destPlace ?? (await resolvePlace(dest))
      // 사용자가 고른 경로 성격을 재탐색에서도 유지한다 — 예전에는 무조건 excludeTunnels: true라서
      // 한 번 이탈하면 남은 터널이 경로에서 통째로 사라졌다.
      const route = place ? await fetchRoute([here, place], { excludeTunnels: routeProfile === 'avoid' }) : null
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
  // ── 터널 도우미(동반 모드) ────────────────────────────────────────────────
  // 예전에는 "GPS 좌표 ↔ 터널 입구 좌표의 직선거리가 10m 이내"로 진입을 판정했다. 시속 100km면
  // GPS 갱신 1초 사이에 28m를 지나가 10m 창을 통째로 건너뛰고, 시뮬레이션 주행에서는 좌표가 아예
  // 안 움직여 영영 트리거되지 않았다. 이제는 경로상 누적거리(traveledM)와 터널 구간의 startM/endM만
  // 비교한다 — 실측이든 시뮬레이션이든 기준이 같고, 통과율·통과 시간이 터널 길이와 실제 속도에서
  // 그대로 따라 나온다.
  const announceTunnel = t => {
    setTunnelPhase('approach')
    speak(`잠시 후 ${t.name} 진입입니다. 길이 ${formatTunnelLength(t.lengthM)} 구간, 동반 모드를 준비합니다.`)
  }

  const beginBreathing = t => {
    tunnelEnterTimeRef.current = Date.now()
    tunnelCompletedRef.current = false
    tunnelExitWarnedRef.current = false
    setTunnelExitWarned(false)
    setTunnelPct(0)
    setTunnelPhase('breathing')
    speak(`${t.name} 진입. 지금부터 호흡을 함께 맞춰볼게요.`, { priority: SpeechPriority.BREATH })
  }

  const finishTunnel = t => {
    if (tunnelCompletedRef.current) return
    tunnelCompletedRef.current = true
    const sec = (Date.now() - (tunnelEnterTimeRef.current ?? Date.now())) / 1000
    recordTunnelPass(t.diff)
    speak(`${t.name}을 통과하셨습니다. 경로 안내를 이어갑니다.`, { priority: SpeechPriority.BREATH })
    setTunnelPct(100)
    setPassedTunnels(prev => [...prev, { name: t.name, diff: t.diff, sec }])
    setTimeout(() => { setTunnelPhase(null); setTunnelPct(0); setTunnelExitWarned(false); tunnelExitWarnedRef.current = false }, 1600)
  }

  // 경로상 누적거리로 "다음/현재 터널"을 갱신하고, 진입·통과 시점에 한 번씩만 부수효과를 낸다.
  const syncTunnels = traveledM => {
    // 터널 접근 배너·음성 안내는 시뮬레이션(데모 주행)이든 실측이든 항상 "진입 200m 전"부터
    // 뜨도록 고정한다. 예전에는 데모 주행(6배속)에서 배너가 너무 짧게(3초 미만) 스쳐 지나가는
    // 걸 막으려고 데모일 때만 거리를 늘려(노출 시간 확보) 잡았는데, 그러면 데모로 테스트할 때
    // "200m 전부터"가 실제로 적용되지 않고 훨씬 이른 지점부터 배너가 뜨는 것처럼 보였다.
    const approachM = TUNNEL_APPROACH_M
    const announceM = TUNNEL_ANNOUNCE_M
    for (const t of routeTunnelsRef.current) {
      if (t.passed) continue
      if (traveledM >= t.endM) {                 // 출구 통과
        t.passed = true
        inTunnelRef.current = false
        tunnelExitAtRef.current = Date.now()
        if (t.entered && !t.dismissed) finishTunnel(t)
        continue
      }
      if (traveledM >= t.startM) {               // 터널 안
        inTunnelRef.current = true
        if (!t.entered) {
          t.entered = true
          if (!t.dismissed) beginBreathing(t)
        }
        if (!t.dismissed) {
          setTunnelPct(Math.min(100, ((traveledM - t.startM) / Math.max(1, t.endM - t.startM)) * 100))
          if (t.endM - traveledM <= EXIT_WARN_M && !tunnelExitWarnedRef.current) {
            tunnelExitWarnedRef.current = true
            setTunnelExitWarned(true)
            speak('잠시 후 터널을 빠져나갑니다.', { priority: SpeechPriority.BREATH })
          }
        }
        return { tunnel: t, distM: 0, inside: true, approach: false }
      }
      const distM = t.startM - traveledM
      if (distM <= announceM && !t.announced && !t.dismissed) {
        t.announced = true
        announceTunnel(t)
      }
      return { tunnel: t, distM: Math.round(distM), inside: false, approach: distM <= approachM }
    }
    return null
  }

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
      speak(`잠시 후 ${maneuverLabel(man)}입니다.`, { priority: SpeechPriority.TURN })
    }

    // 터널 진입·통과 판정 (경로상 누적거리 기준 — GPS 실측·시뮬레이션 공통)
    const tunnelState = syncTunnels(traveledM)

    const next = { lat, lng, heading, zoom, idx, man, distToManM, man2, distMan2M, curStreet, remainM, remainMin, speedKmh, hazard, tunnelState }
    navStateRef.current = next
    setNavState(next)
    setPct(Math.min(100, (traveledM / r.totalM) * 100))
  }

  // ① 데모 주행: GPS 실측이 없거나 정지 상태일 때 경로를 따라 자동 주행
  useEffect(() => {
    const TICK_MS = 500
    const t = setInterval(() => {
      const r = routeRef.current
      if (!r || reroutingRef.current) return
      // 터널 안에서는 GPS가 끊기거나 크게 튄다 — GPS 상태와 무관하게 즉시 추측항법으로 이어
      // 달린다. 예전에는 정지 감지 타이머가 gpsLiveRef를 꺼줄 때까지 6초 동안 화면이 멈췄다.
      if (gpsLiveRef.current && !inTunnelRef.current) return
      // 터널 안에서는 실제 주행 속도로 움직인다 — 통과 시간이 "터널 길이 ÷ 속도"와 맞아야
      // 동반 모드가 입구~출구 구간에서만 정확히 유지된다.
      // 터널 안 속도를 어떻게 잡느냐는 "지금 진짜로 달리고 있는지"에 달렸다.
      //  · 실제 GPS로 주행하다 터널에서 신호가 끊긴 경우 → 진입 직전 속도로 추측항법(실제 속도).
      //  · 처음부터 GPS 없이 시뮬레이션으로 달리는 경우 → 터널 안에서도 같은 배속을 유지한다.
      // 예전에는 시뮬레이션에서도 터널에 들어가는 순간 배속이 6배 꺾여, 내 위치가 멈춘 것처럼 보였다.
      const deadReckoning = inTunnelRef.current && onRouteRef.current
      const mps = deadReckoning
        ? Math.min(MAX_PASS_KMH, Math.max(MIN_PASS_KMH, navStateRef.current?.speedKmh || DEFAULT_PASS_KMH)) / 3.6
        : DEMO_SPEED_MPS
      const step = mps * (TICK_MS / 1000)
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
    let lastProgressM = 0 // 마지막으로 '앞으로 나간' 경로상 거리 — 좌표만 흔들릴 때를 정지로 본다

    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return
      const place = destPlace ?? (hasKakaoKey ? await resolvePlace(dest) : null)
      if (cancelled) return

      watchSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 1 },
        pos => {
          setSignalLost(false)
          // 터널 안이거나 빠져나온 직후에는 GPS를 믿지 않는다 — 추측항법이 계속 이어간다.
          if (inTunnelRef.current || Date.now() - tunnelExitAtRef.current < TUNNEL_GPS_GRACE_MS) return
          // 정확도가 크게 나쁜 신호는 버린다
          if (pos.coords.accuracy != null && pos.coords.accuracy > GPS_ACCURACY_MAX_M) return
          const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          const r = routeRef.current
          if (r) {
            let best = 0, bestD = Infinity
            for (let i = 0; i < r.path.length; i++) {
              const d = haversineM(here, { lat: r.path[i][0], lng: r.path[i][1] })
              if (d < bestD) { bestD = d; best = i }
            }
            if (bestD <= ON_ROUTE_MAX_M) {
              offRouteStrikesRef.current = 0
              gpsLiveRef.current = true
              onRouteRef.current = true
              setGpsActive(true)
              // 경로 위 진행은 앞으로만 간다. GPS가 조금만 흔들려도 가까운 경로점이 뒤쪽으로 잡히는
              // 일이 잦은데, 그대로 받아들이면 주행이 통째로 출발지까지 되감긴다.
              const snappedM = r.cum[best]
              if (snappedM < traveledRef.current - GPS_REWIND_MAX_M) return
              // '움직였다'는 판정도 좌표 흔들림이 아니라 경로상 전진으로만 센다 — 그래야 제자리에서
              // 신호만 떨릴 때 정지로 감지돼 추측항법이 이어받는다(멈춰 보이던 원인).
              if (snappedM > lastProgressM + 5) { lastProgressM = snappedM; lastMoveAt = Date.now() }
              updateNav(Math.max(snappedM, traveledRef.current))
              return
            }
            // "경로 위에 실제로 있어본 적이 있는데" 지금 멀어졌을 때만 이탈로 보고 재탐색한다.
            // 한 번 튄 값으로는 재탐색하지 않는다 — 터널 출구에서 GPS가 크게 튀면 그 한 번으로
            // 재탐색이 돌면서 주행이 출발지로 초기화됐다(실측된 버그).
            if (onRouteRef.current) {
              offRouteStrikesRef.current += 1
              if (offRouteStrikesRef.current < OFF_ROUTE_STRIKES) return
              offRouteStrikesRef.current = 0
              onRouteRef.current = false
              reroute(here)
              return
            }
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
        if (gpsLiveRef.current && Date.now() - lastMoveAt > PROGRESS_STALL_MS) {
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

  // 화면을 나가면(나가기 버튼·뒤로가기 제스처 등 경로 불문) 재생 중이던 안내 음성을 바로 끊는다 —
  // 안 그러면 화면은 사라져도 이미 말하던 문장이 끝까지 나온다(사용자 리포트).
  useEffect(() => () => stopSpeech(), [])

  // 호흡 가이드: 5초 내쉬기 → 5초 들이마시기를 터널을 통과할 때까지 계속 반복한다. 예전에는 음성이
  // 끝난 시점부터 5초를 셌는데, 그러면 한 구간이 "음성 길이 + 5초"가 되어 실제로는 5초보다 길어지고
  // 매 구간마다 그 차이가 쌓여 갈수록 뒤로 밀렸다(사용자 리포트). 음성은 구간 시작과 동시에 재생하고
  // 카운트도 그 즉시 시작해서, 음성 길이와 무관하게 항상 정확히 5초 간격이 유지되게 한다.
  //
  // 음성은 매 사이클(5초)마다 말하지 않는다 — 처음 한 세트(내쉬기+들이마시기)로 리듬을 알려준 뒤로는
  // 시각(테두리·게이지)만으로 유지하고, 긴 터널에서는 1km 갈 때마다 한 번씩만 다시 말한다. 안 그러면
  // 5초마다 계속 말이 나와 회전·위험구간 안내와 계속 부딪힌다(사용자 리포트).
  useEffect(() => {
    if (tunnelPhase !== 'breathing') return
    let cancelled = false
    let tickTimer = null
    let cycleCount = 0
    let lastVoicedAtM = 0
    const runPhase = ph => {
      if (cancelled) return
      setBreathPhase(ph)
      setBreathFrac(0)
      cycleCount += 1
      const active = routeTunnelsRef.current.find(rt => rt.entered && !rt.passed)
      const intoM = active ? traveledRef.current - active.startM : 0
      if (cycleCount <= 2 || intoM - lastVoicedAtM >= BREATH_VOICE_INTERVAL_M) {
        lastVoicedAtM = intoM
        speak(ph === 'exhale' ? '5초간 숨을 내쉬세요.' : '5초간 숨을 들이마시세요.', { priority: SpeechPriority.BREATH })
      }
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
    }
    runPhase('exhale')
    return () => { cancelled = true; if (tickTimer) clearInterval(tickTimer) }
  }, [tunnelPhase])

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
  // 접근 배너·동반 모드 모두 경로상 실측 거리로만 뜬다.
  const tunnelState = navState?.tunnelState ?? null
  const nextTunnel = tunnelState?.tunnel ?? null
  const approachingSoon = !!nextTunnel && tunnelState.approach && !nextTunnel.dismissed && !arrived
  const distanceLeftM = tunnelState?.distM ?? null
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
            <TunnelBanner title={`${nextTunnel.name} 진입 ${distanceLeftM}m 전`} subtitle={`길이 ${formatTunnelLength(nextTunnel.lengthM)} · 공황 난이도 ${nextTunnel.diff}단계`} topOffset={insets.top} />
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
              <Pressable onPress={() => { nextTunnel.dismissed = true; setTunnelPhase(null); setDismissed(nextTunnel.startM) }} style={[styles.actionBtn, styles.actionBtnLight]}>
                <Text style={styles.actionTextLight}>나중에</Text>
              </Pressable>
              <Pressable onPress={() => beginBreathing(nextTunnel)} style={[styles.actionBtn, styles.actionBtnPrimary, { flex: 1.4 }]}>
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
