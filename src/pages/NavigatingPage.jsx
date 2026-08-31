import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import MockStreetMap from '../components/MockStreetMap.jsx'
import TunnelBanner from '../components/TunnelBanner.jsx'
import TunnelGauge from '../components/TunnelGauge.jsx'
import { TurnPanel, HazardWidget, SummaryBar, fmtDistM, fmtClock12 } from '../components/NavOverlays.jsx'
import { loadKakaoMaps, resolvePlace, haversineM } from '../lib/kakaoMap.js'
import { cumulativeDistM, maneuverLabel, fetchRoute } from '../lib/route.js'
import { speak } from '../lib/speech.js'
import { getMonthlyPassCount } from '../lib/tunnelStats.js'

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY
const TUNNEL_TRIGGER_M = 10 // 터널 진입 예상 지점과 이 거리(m) 이내로 좁혀지면 동반 모드 자동 진입
const DEMO_SPEED_MPS = 140  // 데모 주행 속도(m/s) — 실주행의 약 6배속. 거리뷰 줌에서도 화면을 따라갈 수 있는 수준
const ON_ROUTE_MAX_M = 250  // GPS 좌표가 경로에서 이내면 "경로 위"로 보고 맵매칭
const HAZARD_LOOKAHEAD_M = 1200 // 전방 위험구간 감지 범위

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

export default function NavigatingPage() {
  const navigate = useNavigate()
  const state = useLocation().state ?? {}
  const {
    origin = '출발지', dest = '목적지', durationMin = 192, distanceKm = 238,
    waypoints = [], tunnels: incomingTunnels, tunnel: singleTunnel,
    passedTunnels = [],
  } = state
  const tunnels = incomingTunnels ?? (singleTunnel ? [singleTunnel] : [])
  const nextTunnel = tunnels[0] ?? null

  const [pct, setPct] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [tunnelDistM, setTunnelDistM] = useState(null)
  const [gpsActive, setGpsActive] = useState(false)
  const [nav, setNav] = useState(null) // { lat, lng, man, distToManM, remainM, remainMin }
  const arrivedSpokenRef = useRef(false)
  const tunnelTriggeredRef = useRef(false)
  const routeRef = useRef(null)      // { path, cum, totalM, maneuvers, durationMin }
  const traveledRef = useRef(0)      // 경로 위 누적 이동거리(m)
  const gpsLiveRef = useRef(false)   // GPS 실측이 주도권을 잡고 있는 동안 데모 주행 정지
  const lastSpokenManRef = useRef(null)
  const [signalLost, setSignalLost] = useState(false) // 위치 신호 유실 — 마지막 값 유지 + 패널에 표시
  const [rerouting, setRerouting] = useState(false)   // 경로 이탈 → 재탐색 중
  const [routeError, setRouteError] = useState(false) // 경로 데이터 수신 실패
  const hazardsRef = useRef([])                        // [{ type, atM, speed }] 경로상 위험구간
  const reroutingRef = useRef(false)
  const goHome = useCallback(() => navigate('/home'), [navigate])

  // 지도 컴포넌트가 Valhalla 실경로를 받아오면 턴바이턴에 필요한 누적거리 테이블을 준비한다.
  const handleRoute = (route) => {
    const cum = cumulativeDistM(route.path)
    routeRef.current = { ...route, cum, totalM: cum[cum.length - 1] }
    hazardsRef.current = HAZARD_SEEDS.map(s => ({ ...s, atM: s.frac * routeRef.current.totalM }))
    setRouteError(false)
    updateNav(traveledRef.current)
  }

  // 경로 이탈 시 재탐색: 현재 위치→목적지로 경로를 다시 계산하고 3개 오버레이를 초기 상태로 되돌린다.
  const reroute = async (here) => {
    if (reroutingRef.current) return
    reroutingRef.current = true
    setRerouting(true)
    gpsLiveRef.current = false
    traveledRef.current = 0
    lastSpokenManRef.current = null
    setNav(null)
    setPct(0)
    speak('경로를 이탈하여 재탐색합니다.')
    try {
      const kakao = await loadKakaoMaps(KAKAO_KEY)
      const place = await resolvePlace(kakao, dest)
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
      speak(`잠시 후 ${maneuverLabel(man)}입니다.`)
    }

    setNav({ lat, lng, heading, zoom, idx, man, distToManM, man2, distMan2M, curStreet, remainM, remainMin, speedKmh, hazard })
    setPct(Math.min(100, (traveledM / r.totalM) * 100))
  }

  // ① 데모 주행: GPS 실측이 없거나 정지 상태(책상 테스트)일 때 경로를 따라 자동 주행
  useEffect(() => {
    const TICK_MS = 500
    const t = setInterval(() => {
      const r = routeRef.current
      if (!r || gpsLiveRef.current || reroutingRef.current) return
      const step = DEMO_SPEED_MPS * (TICK_MS / 1000)
      updateNav(Math.min(traveledRef.current + step, r.totalM))
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

    ;(async () => {
      if (!KAKAO_KEY || !navigator.geolocation) return
      try {
        const kakao = await loadKakaoMaps(KAKAO_KEY)
        const place = await resolvePlace(kakao, dest)
        if (cancelled || !place) return

        watchId = navigator.geolocation.watchPosition(
          pos => {
            setSignalLost(false) // 신호 복구 — 정상 갱신 재개
            const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
            const remain = haversineM(here, place)
            if (startDist == null) startDist = Math.max(remain, 1)
            // 이전 측정과 5m 이상 차이 날 때만 "실제로 움직였다"고 본다 (GPS 노이즈 필터링 겸 정지 감지)
            if (lastRemain != null && Math.abs(lastRemain - remain) <= 5) return
            lastRemain = remain
            lastMoveAt = Date.now()

            const r = routeRef.current
            if (r) {
              let best = 0, bestD = Infinity
              for (let i = 0; i < r.path.length; i++) {
                const d = haversineM(here, { lat: r.path[i][0], lng: r.path[i][1] })
                if (d < bestD) { bestD = d; best = i }
              }
              if (bestD <= ON_ROUTE_MAX_M) {
                gpsLiveRef.current = true
                setGpsActive(true)
                updateNav(r.cum[best])
                return
              }
              // 실측 주행 중이었는데 경로에서 벗어남 → 경로 이탈로 보고 재탐색
              if (gpsLiveRef.current) { reroute(here); return }
            }
            // 실경로가 없으면(계산 실패 등) 직선거리 기반 진행률 폴백
            setGpsActive(true)
            setPct(Math.min(100, Math.max(0, ((startDist - remain) / startDist) * 100)))
          },
          // 위치 신호 유실: 마지막 유효 값은 그대로 두고 상단 패널에 재탐색 중임만 표시
          () => { if (gpsLiveRef.current) setSignalLost(true) },
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 },
        )
        stallTimer = setInterval(() => {
          if (gpsLiveRef.current && Date.now() - lastMoveAt > 6000) {
            gpsLiveRef.current = false // 정지 감지 → 데모 주행이 이어받는다
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

  // 다음 터널까지의 실거리를 구해서 10m 이내면 동반 모드로 자동 진입한다.
  // 실측이 안 되는 환경(카카오 키 없음·위치 권한 거부 등)에서는 진행률 55% 지점을 10m 전 신호로 대신 쓴다.
  useEffect(() => {
    if (!nextTunnel || tunnelTriggeredRef.current) return

    // 10m 전 팝업·음성 안내와 호흡 시작은 CompanionPage가 순서대로 처리한다
    // (여기서 먼저 말하고 넘어가면 팝업이 뜨기도 전에 호흡이 시작되는 싱크 문제가 생긴다).
    const trigger = () => {
      if (tunnelTriggeredRef.current) return
      tunnelTriggeredRef.current = true
      navigate('/companion', { state: { tunnel: nextTunnel, tunnels, origin, dest, durationMin, distanceKm, waypoints, passedTunnels } })
    }

    let cancelled = false
    let watchId = null
    ;(async () => {
      if (!KAKAO_KEY || !navigator.geolocation) return
      try {
        const kakao = await loadKakaoMaps(KAKAO_KEY)
        const place = await resolvePlace(kakao, nextTunnel.name)
        if (cancelled || !place) return
        watchId = navigator.geolocation.watchPosition(
          pos => {
            const d = haversineM({ lat: pos.coords.latitude, lng: pos.coords.longitude }, place)
            setTunnelDistM(Math.round(d))
            if (d <= TUNNEL_TRIGGER_M) trigger()
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 3000 },
        )
      } catch { /* 실측 실패 시 아래 pct 기반 폴백에 맡긴다 */ }
    })()
    return () => { cancelled = true; if (watchId != null) navigator.geolocation.clearWatch(watchId) }
  }, [nextTunnel])

  // GPS 실측이 없거나(권한 거부 등) 정지 상태라 실거리가 안 움직이는 환경(책상 테스트 등)의
  // 폴백: 진행률 55%를 "터널 10m 전"으로 간주한다. gpsActive는 정지 감지 시 다시 false로 돌아오므로
  // 이 폴백이 항상 살아있게 된다.
  useEffect(() => {
    if (!nextTunnel || gpsActive) return
    if (pct >= 55 && !tunnelTriggeredRef.current) {
      tunnelTriggeredRef.current = true
      navigate('/companion', { state: { tunnel: nextTunnel, tunnels, origin, dest, durationMin, distanceKm, waypoints, passedTunnels } })
    }
  }, [pct, nextTunnel, gpsActive])

  const arrived = pct >= 100
  useEffect(() => {
    if (arrived && !arrivedSpokenRef.current) {
      arrivedSpokenRef.current = true
      speak('목적지에 도착하였습니다.')
    }
  }, [arrived])

  const approachingSoon = !!nextTunnel && !tunnelTriggeredRef.current && !arrived && !dismissed
    && (tunnelDistM != null ? tunnelDistM <= 400 : pct >= 40)
  const distanceLeftM = approachingSoon ? (tunnelDistM ?? Math.max(10, Math.round(300 * (1 - Math.min((pct - 40) / 15, 1)) / 10) * 10)) : null

  const totalPassSec = passedTunnels.reduce((a, t) => a + (t.sec ?? 0), 0)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, fontFamily: 'Pretendard, sans-serif' }}>
      <MockStreetMap
        showPath
        routeProfile="avoid"
        onRoute={handleRoute}
        navPosition={nav && !arrived ? { lat: nav.lat, lng: nav.lng, heading: nav.heading, zoom: nav.zoom } : null}
        navGuide={nav && !arrived ? { progressIdx: nav.idx, turnIdx: nav.man?.idx ?? null, turnType: nav.man?.type } : null}
        routeStyle={{ color: '#1A6DE3', weight: 9 }}
        markers={[origin, ...waypoints, dest].map((name, i, arr) => ({
          id:`${i}`, label: i === 0 ? '출발' : i === arr.length - 1 ? '도착' : String(i + 1), query:name,
          color: i === 0 ? '#8A98A2' : i === arr.length - 1 ? '#D45B4E' : '#14807A',
        }))}
      >
        {/* [기능 1] 턴바이턴 안내 패널 — 도착·터널 접근 시에는 숨긴다 */}
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
              {arrived ? '도착 완료' : rerouting ? '경로 재탐색 중…' : gpsActive ? '주행 중 · GPS 실측' : '주행 중 · 내비게이션'}
            </span>
            <button onClick={goHome} style={{ color: '#5B6C78', fontWeight: 700, fontSize: 13, background: 'rgba(255,255,255,.94)', border: '1px solid #E4EAEF', borderRadius: 99, padding: '7px 13px', cursor: 'pointer' }}>나가기 ✕</button>
          </div>
        )}

        {/* [기능 2] 전방 위험구간 경고 — 감지된 경우에만 렌더 (미감지 시 DOM 자체가 없음) */}
        {nav?.hazard && !arrived && (
          <HazardWidget type={nav.hazard.type} distText={fmtDistM(nav.hazard.distM)} speed={nav.hazard.speed} />
        )}

        {approachingSoon && (
          <>
            <TunnelBanner title={`${nextTunnel.name} 진입 ${distanceLeftM}m 전`} subtitle={`공황 난이도 ${nextTunnel.diff}단계`} />
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

        {/* 하단: 속도계 + [기능 3] 주행 요약 바 */}
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
              <button onClick={() => setDismissed(true)} style={{ flex: 1, height: 44, borderRadius: 12, background: '#fff', color: '#5B6C78', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 14px rgba(20,40,60,.1)' }}>나중에</button>
              <button
                onClick={() => {
                  tunnelTriggeredRef.current = true
                  navigate('/companion', { state: { tunnel: nextTunnel, tunnels, origin, dest, durationMin, distanceKm, waypoints, passedTunnels } })
                }}
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
