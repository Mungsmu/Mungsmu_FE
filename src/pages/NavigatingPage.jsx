import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import MockStreetMap from '../components/MockStreetMap.jsx'
import TunnelBanner from '../components/TunnelBanner.jsx'
import TunnelGauge from '../components/TunnelGauge.jsx'
import TunnelProgressCard from '../components/TunnelProgressCard.jsx'
import { TurnPanel, HazardWidget, SummaryBar, fmtDistM, fmtClock12 } from '../components/NavOverlays.jsx'
import { loadKakaoMaps, resolvePlace, haversineM } from '../lib/kakaoMap.js'
import { cumulativeDistM, maneuverLabel, fetchRoute, traceTunnels } from '../lib/route.js'
import { speak, stopSpeech, SpeechPriority } from '../lib/speech.js'
import { recordTunnelPass, getMonthlyPassCount } from '../lib/tunnelStats.js'
import { nearestGangwonTunnel, findGangwonTunnel, estimateDiff, tunnelDisplayName, formatTunnelLength, COMPANION_MIN_M } from '../lib/tunnelGeo.js'

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY
const TUNNEL_APPROACH_M = 200  // 이 거리(m) 안으로 들어오면 상단에 터널 접근 배너를 띄운다
const TUNNEL_ANNOUNCE_M = 200  // 이 거리(m)에서 "잠시 후 진입" 음성 안내 + 동반 모드 준비 단계 시작
const DEMO_SPEED_MPS = 140  // 데모 주행 속도(m/s) — 실주행의 약 6배속. 거리뷰 줌에서도 화면을 따라갈 수 있는 수준
const ON_ROUTE_MAX_M = 250  // GPS 좌표가 경로에서 이내면 "경로 위"로 보고 맵매칭
const OFF_ROUTE_STRIKES = 3      // 연속 이 횟수만큼 경로 밖으로 잡혀야 재탐색한다 (튄 신호 한 번으로 돌지 않게)
const GPS_ACCURACY_MAX_M = 120  // 이보다 부정확한 신호는 버린다 (터널 출구·도심에서 흔히 크게 튄다)
const TUNNEL_GPS_GRACE_MS = 15000 // 터널을 빠져나온 뒤 이 시간 동안은 GPS를 신뢰하지 않는다
const GPS_REWIND_MAX_M = 200 // GPS 스냅이 이보다 많이 뒤로 가면 노이즈로 보고 버린다(경로 되감기 방지)
const PROGRESS_STALL_MS = 6000 // 경로상 진행이 이 시간 동안 없으면 추측항법이 이어받는다
const HAZARD_LOOKAHEAD_M = 1200 // 전방 위험구간 감지 범위
const BREATH_MS = 5000
// 호흡 안내 음성은 매 사이클(5초)마다 말하지 않는다 — 처음 한 세트로 리듬만 알려주고, 긴 터널에서는
// 이 거리(m)만큼 더 갈 때마다 한 번씩만 다시 말해 리듬을 잃지 않게 한다.
const BREATH_VOICE_INTERVAL_M = 1000
const EXIT_WARN_M = 120 // 출구까지 이 거리(m) 안으로 들어오면 "곧 빠져나갑니다" 안내
// 터널 안은 GPS가 거의 잡히지 않는다 — 신호가 끊기면 진입 직전 속도로 계속 달리고 있다고 보고
// 경로상 위치를 추정(추측항법)해서 터널 길이만큼 지났을 때 자동으로 동반 모드를 내린다.
const DEFAULT_PASS_KMH = 80
const MIN_PASS_KMH = 30
const MAX_PASS_KMH = 110

// 전방 위험구간 데모 시드 (경로 총거리 대비 비율 위치) — 실데이터(공공데이터 무인단속카메라 등) 연결 지점
const HAZARD_SEEDS = [
  { type: '단속', frac: 0.16, speed: 80 },
  { type: '공사', frac: 0.42, speed: 60 },
  { type: '사고', frac: 0.66, speed: 40 },
  { type: '급정거', frac: 0.85, speed: 50 },
]

function fmtMMSS(totalSec) {
  const m = Math.floor(totalSec / 60)
  const s = Math.round(totalSec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// 동반 모드(터널 통과 호흡 가이드)는 예전에는 별도 페이지(/companion)로 전환했지만, 실제 주행
// 중에는 페이지가 넘어갔다 돌아오면서 지도가 두 번 튀고 진행률이 끊기는 문제가 있어 이 페이지
// 안에 오버레이로 통합했다 — 터널 진입~통과까지 지도·턴패널·하단 요약바 등 기존 내비 UI는 그대로
// 유지한 채, 호흡 가이드 테두리·좌측 게이지·상단 보호자 호출 배너·터널 통과율만 덧붙였다가
// 통과하면 그 UI만 사라진다. CompanionPage는 헤더 "동반 모드" 버튼으로 들어오는 실제 여정 없는
// 튜토리얼 전용으로 그대로 남겨둔다.
export default function NavigatingPage() {
  const navigate = useNavigate()
  const state = useLocation().state ?? {}
  const {
    origin = '출발지', dest = '목적지', durationMin = 192, distanceKm = 238,
    waypoints = [], tunnels: incomingTunnels,
    passedTunnels: initialPassedTunnels = [], originPlace, destPlace,
  } = state
  // 사용자가 길찾기에서 고른 경로를 그대로 달린다. 예전에는 "남은 터널이 있으면 shortest, 없으면
  // avoid"로 매 렌더 파생시켰는데, 마지막 터널을 통과하는 순간 프로필이 뒤집혀 지도가 전혀 다른
  // 경로를 새로 받아오면서 주행 위치가 출발지로 튀는 문제가 있었다(사용자 리포트 "출발지로 리셋").
  const routeProfile = state.routeProfile ?? (incomingTunnels?.length ? 'shortest' : 'avoid')

  const [pct, setPct] = useState(0)
  // "나중에"로 건너뛴 터널의 startM. 실제 판정은 터널 객체의 dismissed 플래그가 하고, 이 상태는
  // 플래그를 바꾼 뒤 화면을 다시 그리게 하는 용도다(터널 목록은 ref라 그것만으로는 리렌더가 안 된다).
  const [dismissed, setDismissed] = useState(false)
  const [gpsActive, setGpsActive] = useState(false)
  const [nav, setNav] = useState(null) // { lat, lng, man, distToManM, remainM, remainMin }
  const arrivedSpokenRef = useRef(false)
  // 경로가 실제로 지나는 터널 [{ id, name, lengthM, diff, startM, endM, announced, entered, passed, dismissed }]
  // startM/endM은 경로상 누적거리(m) — 진입·통과 판정의 유일한 기준이다. startM 오름차순.
  const routeTunnelsRef = useRef([])
  const inTunnelRef = useRef(false)      // 지금 터널 안인지 — 터널 안에서는 GPS 대신 추측항법으로 달린다
  const tunnelExitAtRef = useRef(0)      // 마지막으로 터널을 빠져나온 시각(ms)
  const offRouteStrikesRef = useRef(0)   // 연속으로 경로 밖에 잡힌 횟수
  const routeRef = useRef(null)      // { path, cum, totalM, maneuvers, durationMin }
  const traveledRef = useRef(0)      // 경로 위 누적 이동거리(m)
  const gpsLiveRef = useRef(false)   // GPS로 뭐라도(경로 위 실측이든 폴백 진행률이든) 추적 중 — 데모 주행 일시정지·정지 감지에만 쓴다
  const onRouteRef = useRef(false)   // 경로 위에 실제로 스냅된 적이 있는지 — 이때 이탈하면만 재탐색한다.
  // gpsLiveRef와 분리한 이유: 실제 위치가 경로에서 멀리 떨어진 채(책상 테스트 등) 폴백 진행률만
  // 쓰고 있을 때도 gpsLiveRef는 true가 되는데, 그걸로 "이탈했다"고 재탐색을 걸면 애초에 경로 위에
  // 있어본 적도 없이 매번 "현재 위치→목적지"로 경로가 통째로 바뀌어버린다(실측된 회귀 버그).
  const lastSpokenManRef = useRef(null)
  const [signalLost, setSignalLost] = useState(false) // 위치 신호 유실 — 마지막 값 유지 + 패널에 표시
  const [rerouting, setRerouting] = useState(false)   // 경로 이탈 → 재탐색 중
  const [routeError, setRouteError] = useState(false) // 경로 데이터 수신 실패
  const hazardsRef = useRef([])                        // [{ type, atM, speed }] 경로상 위험구간
  const reroutingRef = useRef(false)
  const navRef = useRef(null) // nav 상태의 최신값 미러 — 터널 진입 트리거처럼 effect 클로저 밖에서 "지금 속도"가 필요한 곳에 쓴다
  const goHome = useCallback(() => navigate('/home'), [navigate])

  // 페이지를 나가면(나가기 버튼·뒤로가기 등 경로 불문) 재생 중이던 안내 음성을 바로 끊는다 —
  // 안 그러면 페이지는 사라져도 이미 말하던 문장이 끝까지 나온다(사용자 리포트).
  useEffect(() => () => stopSpeech(), [])

  // 통과한 터널 기록(도착 요약용). 남은 터널 목록은 경로에서 직접 실측하므로 상태로 들지 않는다.
  const [passedTunnels, setPassedTunnels] = useState(initialPassedTunnels)

  // 동반 모드(터널 통과) 오버레이 상태
  const [tunnelPhase, setTunnelPhase] = useState(null) // null | 'approach'(10m 전 안내) | 'breathing'(호흡 가이드 진행)
  const [breathPhase, setBreathPhase] = useState('exhale')
  const [breathFrac, setBreathFrac] = useState(0)
  const [tunnelPct, setTunnelPct] = useState(0)
  const [tunnelExitWarned, setTunnelExitWarned] = useState(false)
  const [guardianState, setGuardianState] = useState('idle')
  const tunnelEnterTimeRef = useRef(null)
  const tunnelExitWarnedRef = useRef(false)
  const breathPhaseStartRef = useRef(Date.now())
  const tunnelCompletedRef = useRef(false)

  // 지도 컴포넌트가 Valhalla 실경로를 받아오면 턴바이턴에 필요한 누적거리 테이블을 준비한다.
  const handleRoute = (route) => {
    const cum = cumulativeDistM(route.path)
    routeRef.current = { ...route, cum, totalM: cum[cum.length - 1] }
    hazardsRef.current = HAZARD_SEEDS.map(s => ({ ...s, atM: s.frac * routeRef.current.totalM }))
    setRouteError(false)
    updateNav(traveledRef.current)
    loadRouteTunnels(route, cum)
  }

  // 지금 달리는 경로가 실제로 지나는 터널을 OSM 터널 태그로 실측하고, 각 구간의 시작/끝을 경로상
  // 누적거리로 바꿔둔다. 이름·공황 난이도는 강원도 실측 데이터셋에서 좌표로 찾아 보강하고(경기·서울
  // 구간처럼 데이터셋에 없으면 OSM tunnel:name과 길이 기반 추정값을 쓴다), 동반 모드는 호흡 가이드를
  // 시작할 시간이 되는 500m 이상 터널만 대상으로 한다.
  const loadRouteTunnels = async (route, cum) => {
    routeTunnelsRef.current = []
    const segs = await traceTunnels(route.shapes)
    if (!segs || routeRef.current?.path !== route.path) return // 그 사이 재탐색됐으면 버린다
    routeTunnelsRef.current = segs
      .filter(s => s.lengthM >= COMPANION_MIN_M)
      .map((s, i) => {
        const startM = cum[Math.min(s.beginIdx, cum.length - 1)]
        const endM = cum[Math.min(s.endIdx, cum.length - 1)]
        const entry = { lat: route.path[s.beginIdx][0], lng: route.path[s.beginIdx][1] }
        const osmName = tunnelDisplayName(s)
        const known = findGangwonTunnel(osmName) ?? nearestGangwonTunnel(entry, 400)
        return {
          id: known?.id ?? `seg-${i}`,
          name: known?.name ?? osmName,
          lengthM: Math.max(1, Math.round(endM - startM)) || s.lengthM,
          diff: known?.diff ?? estimateDiff(s.lengthM),
          startM, endM,
          announced: false, entered: false, dismissed: false,
          passed: endM <= traveledRef.current, // 이미 지나온 구간(재탐색 등)은 건너뛴다
        }
      })
      .sort((a, b) => a.startM - b.startM)
  }

  // 경로 이탈 시 재탐색: 현재 위치→목적지로 경로를 다시 계산하고 3개 오버레이를 초기 상태로 되돌린다.
  const reroute = async (here) => {
    if (reroutingRef.current) return
    reroutingRef.current = true
    setRerouting(true)
    gpsLiveRef.current = false
    inTunnelRef.current = false
    offRouteStrikesRef.current = 0
    traveledRef.current = 0
    lastSpokenManRef.current = null
    setNav(null)
    setPct(0)
    speak('경로를 이탈하여 재탐색합니다.')
    try {
      const kakao = await loadKakaoMaps(KAKAO_KEY)
      const place = await resolvePlace(kakao, dest)
      // 사용자가 고른 경로 성격(최단/터널 회피)을 재탐색에서도 유지한다 — 예전에는 무조건
      // excludeTunnels: true라서, 한 번 이탈하면 남은 터널이 경로에서 통째로 사라졌다.
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

  // ── 터널 도우미(동반 모드) ────────────────────────────────────────────────
  // 예전에는 "GPS 좌표 ↔ 터널 입구 좌표의 직선거리가 10m 이내"로 진입을 판정했다. 이 방식은 두 가지로
  // 깨졌다 — ① 시속 100km면 GPS 갱신 1초 사이에 28m를 지나가 10m 창을 통째로 건너뛰고, ② 시뮬레이션
  // 주행에서는 좌표가 아예 안 움직여 영영 트리거되지 않는다(사용자 리포트 "터널을 인식해도 동반 모드가
  // 안 뜬다"). 이제는 경로상 누적거리(traveledM)와 터널 구간의 startM/endM만 비교한다. 실측이든
  // 시뮬레이션이든 기준이 같고, 통과율·통과 시간이 터널 길이와 실제 속도에서 그대로 따라 나온다.
  const announceTunnel = (t) => {
    setTunnelPhase('approach')
    speak(`잠시 후 ${t.name} 진입입니다. 길이 ${formatTunnelLength(t.lengthM)} 구간, 동반 모드를 준비합니다.`)
  }

  const beginBreathing = (t) => {
    tunnelEnterTimeRef.current = Date.now()
    tunnelCompletedRef.current = false
    tunnelExitWarnedRef.current = false
    setTunnelExitWarned(false)
    setTunnelPct(0)
    setTunnelPhase('breathing')
    speak(`${t.name} 진입. 지금부터 호흡을 함께 맞춰볼게요.`, { priority: SpeechPriority.BREATH })
  }

  const finishTunnel = (t) => {
    if (tunnelCompletedRef.current) return
    tunnelCompletedRef.current = true
    const sec = (Date.now() - (tunnelEnterTimeRef.current ?? Date.now())) / 1000
    recordTunnelPass(t.diff)
    speak(`${t.name}을 통과하셨습니다. 경로 안내를 이어갑니다.`, { priority: SpeechPriority.BREATH })
    setTunnelPct(100)
    setPassedTunnels(prev => [...prev, { name: t.name, diff: t.diff, sec }])
    // 오버레이만 걷어내고 주행은 그대로 이어진다 — 페이지 전환이 없으므로 진행률·지도가 끊기지 않는다.
    setTimeout(() => { setTunnelPhase(null); setTunnelPct(0); setTunnelExitWarned(false); tunnelExitWarnedRef.current = false }, 1600)
  }

  // 경로상 누적거리로 "다음/현재 터널"을 갱신하고, 진입·통과 시점에 한 번씩만 부수효과를 낸다.
  const syncTunnels = (traveledM) => {
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
      // 아직 입구 전 — 가장 가까운 미통과 터널 하나만 본다
      const distM = t.startM - traveledM
      if (distM <= announceM && !t.announced && !t.dismissed) {
        t.announced = true
        announceTunnel(t)
      }
      return { tunnel: t, distM: Math.round(distM), inside: false, approach: distM <= approachM }
    }
    return null
  }

  // 경로 위 누적 이동거리 → 현재 좌표·다음 안내·남은 거리/시간을 계산해 화면과 음성에 반영
  const updateNav = (traveledM) => {
    const r = routeRef.current
    if (!r || !r.totalM) return
    traveledRef.current = traveledM

    let lo = 0, hi = r.cum.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (r.cum[mid] < traveledM) lo = mid + 1; else hi = mid }
    const idx = lo
    const [lat, lng] = r.path[Math.min(idx, r.path.length - 1)]

    const man = r.maneuvers.find(m => m.idx > idx && m.type > 3) ?? null // 출발(1~3) 안내는 건너뜀
    const distToManM = man ? Math.max(0, r.cum[Math.min(man.idx, r.cum.length - 1)] - traveledM) : 0
    // 그 다음 안내 (실제 내비의 "다음 ↑ 2.1km" 미리보기 스택)
    const man2 = man ? (r.maneuvers.find(m => m.idx > man.idx && m.type > 3) ?? null) : null
    const distMan2M = man2 ? Math.max(0, r.cum[Math.min(man2.idx, r.cum.length - 1)] - r.cum[Math.min(man.idx, r.cum.length - 1)]) : 0
    // 지금 달리고 있는 도로 = 마지막으로 지난 안내 지점의 도로명
    let curStreet = ''
    for (const m of r.maneuvers) { if (m.idx > idx) break; if (m.street) curStreet = m.street }
    const remainM = Math.max(0, r.totalM - traveledM)
    const remainMin = Math.ceil((r.durationMin ?? durationMin) * remainM / r.totalM)
    // 표시용 속도: 경로의 실제 평균 속도(총거리/총시간)에 구간별 미세 변화를 더한 값
    const avgKmh = (r.totalM / ((r.durationMin ?? durationMin) * 60)) * 3.6
    const speedKmh = Math.round(avgKmh * (1 + 0.12 * Math.sin(traveledM / 2600)))
    // 진행 방향(도북 기준 방위각) — 몇 점 앞의 경로 좌표를 보고 계산해 마커 화살표를 돌린다
    const j = Math.min(idx + 3, r.path.length - 1)
    const toRad = (d) => (d * Math.PI) / 180
    const heading = (Math.atan2((r.path[j][1] - lng) * Math.cos(toRad(lat)), r.path[j][0] - lat) * 180 / Math.PI + 360) % 360
    // 실제 내비처럼 거리 수준 줌: 평상시 레벨 4(~100m), 회전 600m 이내면 교차로 확대 레벨 3(~50m)
    const zoom = man && distToManM < 600 ? 3 : 4
    // 전방 위험구간: 감지 범위 안에서 아직 통과하지 않은 것 중 가장 가까운 하나만.
    // 데모 주행은 배속이 있어 실측보다 감지 범위를 넓힌다 (노출 시간 약 15초 확보)
    const lookaheadM = gpsLiveRef.current ? HAZARD_LOOKAHEAD_M : Math.max(HAZARD_LOOKAHEAD_M, DEMO_SPEED_MPS * 15)
    const hz = hazardsRef.current
      .filter(h => h.atM - traveledM > -20 && h.atM - traveledM <= lookaheadM)
      .sort((a, b) => a.atM - b.atM)[0] ?? null
    const hazard = hz ? { type: hz.type, distM: Math.max(0, hz.atM - traveledM), speed: hz.speed } : null

    // 안내 지점이 가까워지면 한 번만 음성 안내
    if (man && man.idx !== lastSpokenManRef.current && distToManM <= 700) {
      lastSpokenManRef.current = man.idx
      speak(`잠시 후 ${maneuverLabel(man)}입니다.`, { priority: SpeechPriority.TURN })
    }

    // 터널 진입·통과 판정 (경로상 누적거리 기준 — GPS 실측·시뮬레이션 공통)
    const tunnelState = syncTunnels(traveledM)

    const next = { lat, lng, heading, zoom, idx, man, distToManM, man2, distMan2M, curStreet, remainM, remainMin, speedKmh, hazard, tunnelState }
    navRef.current = next
    setNav(next)
    setPct(Math.min(100, (traveledM / r.totalM) * 100))
  }

  // ① 데모 주행: GPS 실측이 없거나 정지 상태(책상 테스트)일 때 경로를 따라 자동 주행
  useEffect(() => {
    const TICK_MS = 500
    const t = setInterval(() => {
      const r = routeRef.current
      if (!r || reroutingRef.current) return
      // 터널 안에서는 GPS가 끊기거나 크게 튄다 — GPS 상태와 무관하게 즉시 추측항법으로 이어
      // 달린다. 예전에는 정지 감지 타이머가 gpsLiveRef를 꺼줄 때까지 6초 동안 화면이 멈췄다.
      if (gpsLiveRef.current && !inTunnelRef.current) return
      // 터널 안에서는 실제 주행 속도로 움직인다 — 통과 시간이 "터널 길이 ÷ 속도"와 맞아야
      // 동반 모드가 입구~출구 구간에서만 정확히 유지된다(6배속 데모 속도를 쓰면 호흡 가이드가
      // 시작되기도 전에 터널을 빠져나간다). 터널 밖에서는 시연을 위해 배속을 유지한다.
      // 터널 안 속도를 어떻게 잡느냐는 "지금 진짜로 달리고 있는지"에 달렸다.
      //  · 실제 GPS로 주행하다 터널에서 신호가 끊긴 경우 → 진입 직전 속도로 추측항법(실제 속도).
      //  · 처음부터 GPS 없이 시뮬레이션으로 달리는 경우 → 터널 안에서도 같은 배속을 유지한다.
      // 예전에는 시뮬레이션에서도 터널에 들어가는 순간 실제 속도로 떨어뜨려, 배속이 6배 꺾이면서
      // 내 위치가 멈춘 것처럼 보이고 화면이 정지한 느낌을 줬다(사용자 리포트). 통과 시간이 터널
      // 길이에 비례하는 건 배속을 유지해도 그대로다.
      const deadReckoning = inTunnelRef.current && onRouteRef.current
      const mps = deadReckoning
        ? Math.min(MAX_PASS_KMH, Math.max(MIN_PASS_KMH, navRef.current?.speedKmh || DEFAULT_PASS_KMH)) / 3.6
        : DEMO_SPEED_MPS
      updateNav(Math.min(traveledRef.current + mps * (TICK_MS / 1000), r.totalM))
    }, TICK_MS)
    return () => clearInterval(t)
  }, [])

  // ② GPS 실측: 실제로 움직이고 경로 근처에 있으면 좌표를 경로 위 가장 가까운 지점으로
  //    스냅(맵매칭)해 실측 기반으로 안내한다. 경로 이탈·정지 시에는 ①의 데모 주행이 이어받고,
  //    실경로 자체를 못 받은 환경에서는 예전처럼 목적지 직선거리 기반 진행률로 폴백한다.
  useEffect(() => {
    let cancelled = false
    let watchId = null
    let stallTimer = null
    let startDist = null
    let lastRemain = null
    let lastMoveAt = Date.now()
    let lastProgressM = 0 // 마지막으로 '앞으로 나간' 경로상 거리 — 좌표만 흔들릴 때를 정지로 본다

    ;(async () => {
      if (!KAKAO_KEY || !navigator.geolocation) return
      try {
        const kakao = await loadKakaoMaps(KAKAO_KEY)
        const place = await resolvePlace(kakao, dest)
        if (cancelled || !place) return

        watchId = navigator.geolocation.watchPosition(
          pos => {
            setSignalLost(false) // 신호 복구 — 정상 갱신 재개
            // 터널 안이거나 빠져나온 직후에는 GPS를 믿지 않는다 — 추측항법이 계속 이어간다.
            if (inTunnelRef.current || Date.now() - tunnelExitAtRef.current < TUNNEL_GPS_GRACE_MS) return
            // 정확도가 크게 나쁜 신호는 버린다
            if (pos.coords.accuracy != null && pos.coords.accuracy > GPS_ACCURACY_MAX_M) return
            const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
            const remain = haversineM(here, place)
            if (startDist == null) startDist = Math.max(remain, 1)
            // 이전 측정과 5m 이상 차이 날 때만 "실제로 움직였다"고 본다 (GPS 노이즈 필터링 겸 정지 감지)
            if (lastRemain != null && Math.abs(lastRemain - remain) <= 5) return
            lastRemain = remain

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
                // 경로 위 진행은 앞으로만 간다. GPS가 조금만 흔들려도 가까운 경로점이 뒤쪽으로
                // 잡히는 일이 잦은데, 그대로 받아들이면 주행이 통째로 출발지까지 되감긴다
                // (사용자 리포트 "조금이라도 불안정해지면 초기화"). 뒤로 크게 가는 값은 버린다.
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
            // 실경로가 없으면(계산 실패 등) 직선거리 기반 진행률 폴백. gpsLiveRef도 같이 켜둬야
            // 아래 stallTimer가 "6초간 못 움직임"을 감지해서 다시 꺼줄 수 있다. onRouteRef는 여기서
            // 켜지 않는다 — 이건 "경로 위에 있다"가 아니라 "경로랑 멀리 떨어진 채 폴백 중"이기
            // 때문에, 이 상태에서 계속 멀리 있다고 재탐색을 걸면 매번 현재 위치로 경로가 통째로
            // 바뀐다(실측된 회귀 버그).
            gpsLiveRef.current = true
            setGpsActive(true)
            setPct(Math.min(100, Math.max(0, ((startDist - remain) / startDist) * 100)))
          },
          // 위치 신호 유실: 마지막 유효 값은 그대로 두고 상단 패널에 재탐색 중임만 표시
          () => { if (gpsLiveRef.current) setSignalLost(true) },
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 },
        )
        stallTimer = setInterval(() => {
          if (gpsLiveRef.current && Date.now() - lastMoveAt > PROGRESS_STALL_MS) {
            gpsLiveRef.current = false // 정지 감지 → 데모 주행이 이어받는다
            onRouteRef.current = false
            setGpsActive(false)
          }
        }, 2000)
      } catch { /* GPS 불가 — 데모 주행만으로 진행 */ }
    })()

    return () => {
      cancelled = true
      if (stallTimer != null) clearInterval(stallTimer)
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
    }
  }, [dest])

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
    return () => {
      cancelled = true
      if (tickTimer) clearInterval(tickTimer)
      window.speechSynthesis?.cancel()
    }
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
    if (arrived && !arrivedSpokenRef.current) {
      arrivedSpokenRef.current = true
      speak('목적지에 도착하였습니다.')
    }
  }, [arrived])

  const inTunnel = tunnelPhase != null
  const breathing = tunnelPhase === 'breathing'
  // 접근 배너·동반 모드 모두 경로상 실측 거리로만 뜬다. 진행률(pct) 기반 추정은 실제 터널이 아닌
  // 엉뚱한 지점에서 동반 모드를 띄울 수 있어 쓰지 않는다.
  const tunnelState = nav?.tunnelState ?? null
  const nextTunnel = tunnelState?.tunnel ?? null
  const approachingSoon = !!nextTunnel && tunnelState.approach && !nextTunnel.dismissed && !arrived
  const distanceLeftM = tunnelState?.distM ?? null

  // 터널 배너(TunnelBanner)는 화면 상단에 절대좌표로 뜨는데, 턴바이턴 안내 바(TurnPanel)도
  // 같은 화면 상단을 쓴다 — 터널이 연달아 있는 경로는 "다음 터널 접근" 상태(approachingSoon)가
  // 아니어도 TurnPanel이 계속 떠 있어서, 고정된 top 값만 쓰면 배너가 그 위에 겹쳐 그려졌다
  // (사용자 리포트: 안내 문구가 겹쳐서 잘려 보임). TurnPanel이 떠 있으면 그 실제 높이만큼,
  // 서브바(다음 안내)까지 있으면 더 크게 내려서 배치한다.
  const turnPanelVisible = !!nav?.man && !arrived && !approachingSoon
  const turnPanelHasSubBar = turnPanelVisible && nav.man2 != null && !rerouting
  const bannerTop = turnPanelVisible ? (turnPanelHasSubBar ? 145 : 110) : 64

  const totalPassSec = passedTunnels.reduce((a, t) => a + (t.sec ?? 0), 0)
  const breathBorderColor = breathPhase === 'exhale' ? '212,91,78' : '46,158,107' // 내쉬기=빨강, 들이마시기=초록
  const breathThickness = Math.round(breathFrac * 30)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, fontFamily: 'Pretendard, sans-serif' }}>
      {/* 동반 모드 호흡 가이드 테두리 — 기존 내비 UI를 가리지 않도록 화면 맨 위에 얇게 덧그린다 */}
      {breathing && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
          boxShadow: `inset 0 0 0 ${breathThickness}px rgba(${breathBorderColor},.55)`,
        }} />
      )}

      <MockStreetMap
        showPath
        routeProfile={routeProfile}
        showTunnels={routeProfile === 'shortest'}
        onRoute={handleRoute}
        navPosition={nav && !arrived ? { lat: nav.lat, lng: nav.lng, heading: nav.heading, zoom: nav.zoom } : null}
        navGuide={nav && !arrived ? { progressIdx: nav.idx, turnIdx: nav.man?.idx ?? null, turnType: nav.man?.type } : null}
        routeStyle={{ color: '#1A6DE3', weight: 9 }}
        markers={[origin, ...waypoints, dest].map((name, i, arr) => ({
          id:`${i}`, label: i === 0 ? '출발' : i === arr.length - 1 ? '도착' : String(i + 1), query:name,
          color: i === 0 ? '#8A98A2' : i === arr.length - 1 ? '#D45B4E' : '#14807A',
          ...(i === 0 && originPlace ? { lat: originPlace.lat, lng: originPlace.lng } : {}),
          ...(i === arr.length - 1 && destPlace ? { lat: destPlace.lat, lng: destPlace.lng } : {}),
        }))}
      >
        {/* [기능 1] 턴바이턴 안내 패널 — 도착·터널 접근·동반 모드 중에는 숨긴다 */}
        {/* 터널 안에서도 턴 패널은 그대로 둔다. 예전에는 통째로 숨겨서, 긴 터널에서는
            몇 분 동안 상단이 비어 화면이 정지한 것처럼 보였다(사용자 리포트). */}
        {nav?.man && !arrived && !approachingSoon ? (
          <>
            <TurnPanel
              manType={nav.man.type}
              distText={fmtDistM(nav.distToManM)}
              streetText={nav.man.street}
              subLabel={maneuverLabel(nav.man)}
              subManType={nav.man2?.type ?? null}
              subDistText={nav.man2 ? fmtDistM(nav.distMan2M) : ''}
              signalLost={signalLost}
              rerouting={rerouting}
              onExit={goHome}
            />
            {/* GPS 상태 미니 배지 */}
            <span style={{ position: 'absolute', top: 99, right: 16, zIndex: 1, fontSize: 10.5, fontWeight: 700, color: '#5B6C78', background: 'rgba(255,255,255,.92)', borderRadius: 99, padding: '4px 10px' }}>
              {gpsActive ? 'GPS 실측' : '경로 시뮬레이션'}
            </span>
          </>
        ) : (
          <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 8, zIndex: 1, pointerEvents: 'auto' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#5B6C78', background: 'rgba(255,255,255,.94)', border: '1px solid #E4EAEF', borderRadius: 99, padding: '7px 13px' }}>
              {arrived ? '도착 완료' : inTunnel ? '동반 모드 진행 중' : rerouting ? '경로 재탐색 중…' : gpsActive ? '주행 중 · GPS 실측' : '주행 중 · 내비게이션'}
            </span>
            <button onClick={goHome} style={{ color: '#5B6C78', fontWeight: 700, fontSize: 13, background: 'rgba(255,255,255,.94)', border: '1px solid #E4EAEF', borderRadius: 99, padding: '7px 13px', cursor: 'pointer' }}>나가기 ✕</button>
          </div>
        )}

        {/* [기능 2] 전방 위험구간 경고 — 감지된 경우에만 렌더 (동반 모드 중에는 좌측 게이지와 겹치므로 숨김) */}
        {nav?.hazard && !arrived && !inTunnel && (
          <HazardWidget type={nav.hazard.type} distText={fmtDistM(nav.hazard.distM)} speed={nav.hazard.speed} />
        )}

        {/* 동반 모드 오버레이 — 상단 가운데 배너(10m 전 안내 / 보호자 호출 / 통과 임박)와 좌측 게이지 */}
        {tunnelPhase === 'approach' ? (
          <TunnelBanner top={bannerTop} title="터널 진입 10m 전" subtitle="곧 동반모드가 시작됩니다" />
        ) : tunnelExitWarned ? (
          <TunnelBanner top={bannerTop} title="터널 통과 10m 전" subtitle="곧 도착해요, 조금만 더 힘내요" />
        ) : breathing ? (
          <TunnelBanner
            top={bannerTop}
            title={guardianState === 'calling' ? '보호자 호출 중...' : '보호자 호출'}
            subtitle={guardianState === 'sent' ? '- 메시지 전송 완료 -' : '탭하여 보호자를 호출해요'}
            onClick={callGuardian}
            disabled={guardianState === 'calling'}
          />
        ) : null}
        {breathing && <TunnelGauge pct={tunnelPct} />}

        {approachingSoon && (
          <>
            <TunnelBanner title={`${nextTunnel.name} 진입 ${distanceLeftM}m 전`} subtitle={`길이 ${formatTunnelLength(nextTunnel.lengthM)} · 공황 난이도 ${nextTunnel.diff}단계`} />
            <TunnelGauge pct={4} />
          </>
        )}

        {arrived && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', background: '#fff', borderRadius: 20, padding: '28px 30px', boxShadow: '0 10px 30px rgba(20,40,60,.18)', width: 300 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#EAF7EF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 12px' }}>✓</div>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#16242E' }}>목적지에 도착하였습니다</p>
            <p style={{ fontSize: 12.5, color: '#5B6C78', marginTop: 6, marginBottom: passedTunnels.length ? 16 : 0 }}>
              {passedTunnels.length ? '터널 구간을 지나 무사히 도착했어요.' : '터널 없는 안심 경로로 편안하게 도착했어요.'}
            </p>
            {passedTunnels.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1, background: '#F6F8FA', borderRadius: 11, padding: '11px 8px' }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: '#0E5E58' }}>{fmtMMSS(totalPassSec)}</div>
                    <div style={{ fontSize: 10.5, color: '#8A98A2', marginTop: 3 }}>터널 통과 시간</div>
                  </div>
                  <div style={{ flex: 1, background: '#F6F8FA', borderRadius: 11, padding: '11px 8px' }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: '#0E5E58' }}>{getMonthlyPassCount()}회</div>
                    <div style={{ fontSize: 10.5, color: '#8A98A2', marginTop: 3 }}>이번 달 누적</div>
                  </div>
                </div>
                <div style={{ textAlign: 'left', marginTop: 14 }}>
                  <p style={{ fontSize: 10.5, color: '#8A98A2', letterSpacing: '0.05em', marginBottom: 6 }}>이번 여정 통과 터널</p>
                  {passedTunnels.map(t => (
                    <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#16242E', fontWeight: 600, marginBottom: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#14807A', flexShrink: 0 }} />
                      {t.name} · 난이도 {t.diff}단계
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 하단: 속도계 + 터널 통과율 + [기능 3] 주행 요약 바 */}
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, pointerEvents: 'auto' }}>
          {!arrived && nav && (
            <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 10, pointerEvents: 'none' }}>
              {/* 속도계 */}
              <div style={{ width: 62, height: 62, borderRadius: '50%', background: '#fff', border: '4px solid #1A6DE3', boxShadow: '0 6px 18px rgba(20,40,60,.22)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 21, fontWeight: 800, lineHeight: 1, color: '#16242E', fontVariantNumeric: 'tabular-nums' }}>{nav.speedKmh}</span>
                <span style={{ fontSize: 8.5, fontWeight: 700, color: '#8A98A2', marginTop: 2 }}>km/h</span>
              </div>
            </div>
          )}

          {/* 터널 통과율 — 동반 모드 튜토리얼(CompanionPage)과 같은 카드. 기존 하단 요약바
              (실제 주행 도로·남은 거리·도착 예정)는 그대로 두고 그 위에 덧붙인다 */}
          {breathing && nextTunnel && (
            <div style={{ marginBottom: 10 }}>
              <TunnelProgressCard name={nextTunnel.name} pct={tunnelPct} />
            </div>
          )}

          <SummaryBar
            street={nav?.curStreet ?? ''}
            remainText={nav ? `${(nav.remainM / 1000).toFixed(1)}km` : `${distanceKm}km`}
            etaText={nav ? fmtClock12(new Date(Date.now() + nav.remainMin * 60000)) : '--:--'}
            pct={Math.round(pct)}
            danger={approachingSoon}
            arrived={arrived}
            origin={origin}
            dest={dest}
            error={routeError}
          />

          {approachingSoon ? (
            <div style={{ display: 'flex', gap: 9, marginTop: 10 }}>
              <button onClick={() => { nextTunnel.dismissed = true; setTunnelPhase(null); setDismissed(nextTunnel.startM) }} style={{ flex: 1, height: 44, borderRadius: 12, background: '#fff', color: '#5B6C78', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 14px rgba(20,40,60,.1)' }}>나중에</button>
              <button
                onClick={() => beginBreathing(nextTunnel)}
                style={{ flex: 1.4, height: 44, borderRadius: 12, background: '#14807A', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                동반 모드 시작
              </button>
            </div>
          ) : (
            <button onClick={() => navigate('/home')} style={{ width: '100%', height: 44, borderRadius: 12, background: arrived ? '#14807A' : '#fff', color: arrived ? '#fff' : '#5B6C78', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', marginTop: 10, boxShadow: arrived ? 'none' : '0 4px 14px rgba(20,40,60,.1)' }}>
              {arrived ? '여정 마치기' : '안내 종료'}
            </button>
          )}
        </div>
      </MockStreetMap>
    </div>
  )
}
