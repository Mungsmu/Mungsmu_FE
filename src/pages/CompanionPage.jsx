import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { TUNNELS } from '../data/mock.js'
import MockStreetMap from '../components/MockStreetMap.jsx'
import TunnelBanner from '../components/TunnelBanner.jsx'
import TunnelGauge from '../components/TunnelGauge.jsx'
import { loadKakaoMaps, resolvePlace, haversineM } from '../lib/kakaoMap.js'
import { cumulativeDistM, fetchRoute, traceTunnels } from '../lib/route.js'
import { speak } from '../lib/speech.js'
import { recordTunnelPass } from '../lib/tunnelStats.js'

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY
const DEFAULT_TUNNEL = TUNNELS.find(t => t.name === '미시령터널')
const BREATH_MS = 5000
const EXIT_WARN_M = 10
const DEMO_TICK_MS = 250     // 데모 진행 타이머 간격 — 1초 단위는 카메라가 뚝뚝 끊겨 보여서 촘촘하게
const DEMO_DURATION_MS = 24000 // 데모 모드에서 터널 하나를 통과하는 데 걸리는 총 시간(길이 무관, 고정)
const APPROACH_MS = 5000 // 10m 전 팝업을 보여주는 시간 — 이 동안은 아직 호흡 가이드가 시작되지 않는다
// 주행 카메라가 움직일 경로: 터널 이름을 지오코딩한 지점 전후로 여러 각도를 시도해 실도로 경로를 구하고,
// traceTunnels()로 그 경로가 실제 이 터널을 지나는지 검증한다 (도로 진행 방향을 모르므로 각도를 바꿔가며 시도).
// 지오코딩·검증에 실패하면(카카오 키 없음 등) 주행 카메라 없이 기본 지도만 보여준다.
const TUNNEL_PASS_BEARINGS = [0, 45, 90, 135]

export default function CompanionPage() {
  const nav = useNavigate()
  const state = useLocation().state ?? {}
  const tunnel = state.tunnel ?? DEFAULT_TUNNEL
  const tunnels = state.tunnels ?? [tunnel]
  const remainingTunnels = tunnels.slice(1)
  const { origin, dest, durationMin, distanceKm, waypoints = [], passedTunnels = [] } = state
  const isTutorial = !dest // 헤더의 "동반 모드" 버튼으로 들어온 경우 — 실제 여정이 없으니 호흡 연습용

  // phase: 'approach'(10m 전 팝업, 아직 호흡 없음) → 'breathing'(터널 안, 호흡 가이드 진행)
  const [phase, setPhase] = useState('approach')
  const [pct, setPct] = useState(0)
  const [breathPhase, setBreathPhase] = useState('exhale') // 'exhale'(내쉬기,빨강) | 'inhale'(들이마시기,초록)
  const [breathFrac, setBreathFrac] = useState(0) // 현재 호흡 구간 내 진행률 0~1 (테두리를 5초에 걸쳐 매끄럽게 채움)
  const [guardianState, setGuardianState] = useState('idle') // 'idle' | 'calling' | 'sent'
  const [exitWarned, setExitWarned] = useState(false)
  const [navPos, setNavPos] = useState(null) // { lat, lng, heading, zoom } — 경로 위 주행 카메라 위치
  const [tunnelPath, setTunnelPath] = useState(null) // [[lat,lng],...] 검증된 실제 터널 구간. 없으면 주행 카메라 미표시

  const enterTimeRef = useRef(null)
  const phaseStartRef = useRef(Date.now())
  const exitWarnedRef = useRef(false)
  const demoRouteRef = useRef(null) // { path, cum, totalM } — 주행 카메라가 따라갈 경로
  const completedRef = useRef(false)

  // 0) 터널 이름을 지오코딩한 지점 전후로 몇 가지 각도를 시도해 실도로 경로를 계산하고,
  // traceTunnels()로 그 경로가 실제 이 터널(비슷한 길이의 터널 구간)을 지나는지 검증한다.
  // 검증에 성공하면 경로 전체가 아니라 실제 터널 edge의 시작~끝 구간(+약간의 여유)만 잘라서
  // 쓴다 — 앵커점이 도로에서 멀리 떨어져 있으면 경로 전체가 수십 km짜리 우회로가 될 수 있어서,
  // 우회 구간 없이 터널 자체를 주행 카메라 배경으로 쓰기 위함.
  // 실패하면(지오코딩 불가·일치하는 터널 없음 등) tunnelPath를 null로 두어 주행 카메라를 표시하지 않는다.
  useEffect(() => {
    let cancelled = false
    setTunnelPath(null)
    if (!KAKAO_KEY) return
    ;(async () => {
      try {
        const kakao = await loadKakaoMaps(KAKAO_KEY)
        const center = await resolvePlace(kakao, tunnel.name)
        if (cancelled || !center) return
        const lengthM = tunnel.lengthM || 2000
        const halfM = Math.max(300, lengthM / 2) + 250 // 터널 전후로 진입부까지 포함하는 여유
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
            const BUFFER_PTS = 6 // 터널 진입/진출 직전 도로가 살짝 보이도록 앞뒤로 여유를 둔다
            const startIdx = Math.max(0, seg.begin - BUFFER_PTS)
            const endIdx = Math.min(route.path.length - 1, seg.end + BUFFER_PTS)
            const trimmed = route.path.slice(startIdx, endIdx + 1)
            if (trimmed.length >= 2 && !cancelled) setTunnelPath(trimmed)
            return
          }
        }
      } catch { /* 실패 시 폴백 경로 유지 */ }
    })()
    return () => { cancelled = true }
  }, [tunnel])

  // 1) 접근 단계: 10m 전 팝업 + 음성. 아직 호흡 가이드는 시작하지 않는다.
  // (개발 모드 StrictMode는 effect를 두 번 실행하는데, cleanup에서 speech를 취소해 두지 않으면
  //  첫 호출과 두 번째 호출의 음성이 겹쳐서 씹히는 것처럼 들린다.)
  useEffect(() => {
    speak('터널 진입 10미터 전입니다. 곧 동반모드가 실행됩니다.')
    const t = setTimeout(() => {
      enterTimeRef.current = Date.now()
      setPhase('breathing')
    }, APPROACH_MS)
    return () => {
      clearTimeout(t)
      window.speechSynthesis?.cancel()
    }
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
    recordTunnelPass()
    speak('터널을 통과하셨습니다.')
    setPct(100)
    if (isTutorial) {
      // 튜토리얼은 실제 여정이 없으니 자동으로 화면을 넘기지 않고, 사용자가 직접 "나가기"를 눌러야 끝난다.
      setPhase('done')
      return
    }
    setTimeout(() => {
      const newPassed = [...passedTunnels, { name: tunnel.name, diff: tunnel.diff, sec }]
      nav('/navigating', {
        state: { origin, dest, durationMin, distanceKm, waypoints, tunnels: remainingTunnels, passedTunnels: newPassed },
      })
    }, 1600)
  }

  // 3) 터널 통과 진행률: 실제 이동거리(GPS)를 터널 길이와 비교해서 계산.
  // 실측이 안 되면(카카오 키 없음·위치 권한 거부 등) 타이머 데모로 대체한다. 호흡 단계에서만 진행된다.
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
    let watchId = null
    let mockTimer = null
    let usingGps = false
    let last = null
    let traveled = 0

    const startMock = () => {
      if (usingGps || mockTimer) return
      mockTimer = setInterval(() => {
        traveled += lengthM * (DEMO_TICK_MS / DEMO_DURATION_MS)
        applyProgress(traveled)
      }, DEMO_TICK_MS)
    }
    const stopMock = () => { if (mockTimer) { clearInterval(mockTimer); mockTimer = null } }

    ;(async () => {
      if (!KAKAO_KEY || !navigator.geolocation) { startMock(); return }
      try {
        await loadKakaoMaps(KAKAO_KEY)
        if (cancelled) return
        watchId = navigator.geolocation.watchPosition(
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
          () => startMock(),
          { enableHighAccuracy: true, maximumAge: 2000 },
        )
        setTimeout(() => { if (!usingGps) startMock() }, 4000)
      } catch {
        if (!cancelled) startMock()
      }
    })()

    return () => {
      cancelled = true
      stopMock()
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
    }
  }, [phase, tunnel])

  // 주행 카메라가 따라갈 경로(실제 터널 구간 또는 폴백)를 받아오면 누적거리 테이블을 준비한다.
  const handleDemoRoute = (route) => {
    const cum = cumulativeDistM(route.path)
    demoRouteRef.current = { ...route, cum, totalM: cum[cum.length - 1] }
  }

  // 터널 통과 진행률(pct, 0~100)을 데모 경로 위 위치로 매핑해 주행 카메라를 움직인다.
  // 짧은 터널은 경로 좌표점 간격이 넓어서(도로가 곧으면 Valhalla가 점을 듬성듬성 찍음) 점에
  // 그대로 스냅하면 카메라가 멈췄다 점프하는 것처럼 보인다 — 두 점 사이를 거리 비율로 보간해서
  // 항상 부드럽게 이어지는 위치를 계산한다.
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
  const demoMarkers = tunnelPath
    ? [
        { id:'o', label:'진입', lat: tunnelPath[0][0], lng: tunnelPath[0][1], color:'#8A98A2' },
        { id:'d', label:'진출', lat: tunnelPath[tunnelPath.length - 1][0], lng: tunnelPath[tunnelPath.length - 1][1], color:'#D45B4E' },
      ]
    : []

  return (
    <div style={{ position:'fixed', inset:0, zIndex:60, fontFamily:'Pretendard, sans-serif' }}>
      {/* 호흡 가이드: 호흡 단계에서만 화면 테두리가 내쉴 때 빨강, 들이마실 때 초록으로 5초에 걸쳐 차오른다.
          중앙에는 별도 카드를 두지 않는다 — 실제 주행 화면(지도)을 가리지 않기 위함. */}
      {breathing && (
        <div style={{
          position:'absolute', inset:0, zIndex:2, pointerEvents:'none',
          boxShadow:`inset 0 0 0 ${thickness}px rgba(${borderColor},.55)`,
        }} />
      )}

      <MockStreetMap
        showPath
        path={tunnelPath ?? undefined}
        onRoute={handleDemoRoute}
        navPosition={phase !== 'done' ? navPos : null}
        routeStyle={{ color:'#1A6DE3', weight:8 }}
        markers={demoMarkers}
      >
        {/* 상단 상태 · 나가기 */}
        <div style={{ position:'absolute', top:16, left:16, right:16, display:'flex', alignItems:'center', gap:10, zIndex:1, pointerEvents:'auto' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.9)', borderRadius:99, padding:'7px 14px' }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#14807A', animation:'pulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize:12, color:'#0E5E58', fontWeight:700 }}>
              {phase === 'done' ? '터널 통과 완료' : breathing ? '동반 모드 진행 중' : '터널 접근 중'}
            </span>
          </div>
          <button onClick={() => nav(-1)} style={{ marginLeft:'auto', background:'#fff', color:'#5B6C78', fontWeight:700, fontSize:13, padding:'7px 14px', borderRadius:99, cursor:'pointer' }}>나가기 ✕</button>
        </div>

        {phase === 'approach' ? (
          <TunnelBanner title="터널 진입 10m 전" subtitle="곧 동반모드가 시작됩니다" />
        ) : phase === 'done' ? (
          <TunnelBanner title="터널을 통과하셨습니다" subtitle="나가기를 눌러 마칠 수 있어요" />
        ) : exitWarned ? (
          <TunnelBanner title="터널 통과 10m 전" subtitle="곧 도착해요, 조금만 더 힘내요" />
        ) : (
          <TunnelBanner
            title={guardianState === 'calling' ? '보호자 호출 중...' : '보호자 호출'}
            subtitle={guardianState === 'sent' ? '- 메시지 전송 완료 -' : null}
            onClick={callGuardian}
            disabled={guardianState === 'calling'}
          />
        )}
        {breathing && <TunnelGauge pct={pct} />}

        {/* 하단 진행 정보 — 호흡 단계에서만 표시 */}
        {breathing && (
          <div style={{ position:'absolute', left:16, right:16, bottom:16, pointerEvents:'auto' }}>
            <div style={{ background:'#fff', borderRadius:14, padding:'13px 16px', boxShadow:'0 6px 20px rgba(20,40,60,.12)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                <span style={{ fontSize:12.5, fontWeight:700, color:'#16242E' }}>{tunnel.name} 통과 중</span>
                <span style={{ fontSize:12.5, color:'#5B6C78' }}>{pct >= 100 ? '통과 완료' : `${Math.round(pct)}% 통과`}</span>
              </div>
              <div style={{ height:6, borderRadius:99, background:'#E4EAEF', overflow:'hidden', marginTop:8 }}>
                <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#1E9E94,#0E5E58)', borderRadius:99, transition:'width .3s linear' }} />
              </div>
            </div>
          </div>
        )}
      </MockStreetMap>
    </div>
  )
}
