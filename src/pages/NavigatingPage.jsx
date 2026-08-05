import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import MockStreetMap from '../components/MockStreetMap.jsx'
import TunnelBanner from '../components/TunnelBanner.jsx'
import TunnelGauge from '../components/TunnelGauge.jsx'
import { loadKakaoMaps, resolvePlace, haversineM } from '../lib/kakaoMap.js'
import { speak } from '../lib/speech.js'
import { getMonthlyPassCount } from '../lib/tunnelStats.js'

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY
const TUNNEL_TRIGGER_M = 10 // 터널 진입 예상 지점과 이 거리(m) 이내로 좁혀지면 동반 모드 자동 진입

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
  const arrivedSpokenRef = useRef(false)
  const tunnelTriggeredRef = useRef(false)

  // 목적지의 실제 좌표를 구해서, 실시간 GPS와 목적지 사이의 실거리로 진행률(%)을 계산한다.
  // 카카오 키가 없거나 위치 권한이 없는 등 실측이 불가능하면 이전처럼 타이머 데모로 대체한다.
  // GPS 신호는 잡히지만(권한은 허용했지만) 실제로는 움직이지 않는 경우(책상에서 테스트 등)도
  // "실측 모드로 고정"되어 버리면 진행률이 0%에서 영원히 멈춰 아무 일도 안 일어나는 것처럼 보인다.
  // 그래서 일정 시간 동안 실거리가 의미 있게 변하지 않으면 데모 타이머로 다시 전환한다.
  useEffect(() => {
    let cancelled = false
    let watchId = null
    let mockTimer = null
    let stallTimer = null
    let usingGps = false
    let startDist = null
    let lastRemain = null
    let lastMoveAt = Date.now()

    const startMock = () => {
      usingGps = false
      setGpsActive(false)
      if (mockTimer) return
      mockTimer = setInterval(() => setPct(p => Math.min(p + 100 / 20, 100)), 500)
    }
    const stopMock = () => { if (mockTimer) { clearInterval(mockTimer); mockTimer = null } }

    ;(async () => {
      if (!KAKAO_KEY || !navigator.geolocation) { startMock(); return }
      try {
        const kakao = await loadKakaoMaps(KAKAO_KEY)
        const place = await resolvePlace(kakao, dest)
        if (cancelled) return
        if (!place) { startMock(); return }

        watchId = navigator.geolocation.watchPosition(
          pos => {
            const remain = haversineM({ lat: pos.coords.latitude, lng: pos.coords.longitude }, place)
            if (startDist == null) startDist = Math.max(remain, 1)
            // 이전 측정과 5m 이상 차이 날 때만 "실제로 움직였다"고 본다 (GPS 노이즈 필터링 겸 정지 감지)
            if (lastRemain == null || Math.abs(lastRemain - remain) > 5) {
              lastRemain = remain
              lastMoveAt = Date.now()
              usingGps = true
              setGpsActive(true)
              stopMock()
              setPct(Math.min(100, Math.max(0, ((startDist - remain) / startDist) * 100)))
            }
          },
          () => startMock(),
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 },
        )
        setTimeout(() => { if (!usingGps) startMock() }, 4000)
        stallTimer = setInterval(() => {
          if (usingGps && Date.now() - lastMoveAt > 6000) startMock()
        }, 2000)
      } catch {
        if (!cancelled) startMock()
      }
    })()

    return () => {
      cancelled = true
      stopMock()
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
        markers={[origin, ...waypoints, dest].map((name, i, arr) => ({
          id:`${i}`, label: i === 0 ? '출발' : i === arr.length - 1 ? '도착' : String(i + 1), query:name,
          color: i === 0 ? '#8A98A2' : i === arr.length - 1 ? '#D45B4E' : '#14807A',
        }))}
      >
        {/* 상단 상태 · 나가기 */}
        <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', alignItems: 'center', gap: 14, zIndex: 1, pointerEvents: 'auto' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#5B6C78', background: '#fff', border: '1px solid #E4EAEF', borderRadius: 99, padding: '7px 14px' }}>
            {arrived ? '도착 완료' : '주행 중 · 내비게이션'}
          </span>
          <button onClick={() => navigate('/home')} style={{ marginLeft: 'auto', color: '#5B6C78', fontWeight: 700, fontSize: 13, background: '#fff', border: '1px solid #E4EAEF', borderRadius: 99, padding: '7px 14px', cursor: 'pointer' }}>나가기 ✕</button>
        </div>

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

        {/* 하단 경로 진행바 + 액션 */}
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, pointerEvents: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '13px 16px', boxShadow: '0 6px 20px rgba(20,40,60,.12)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#16242E', marginBottom: 8 }}>{origin} → {dest}</p>
            <div style={{ height: 7, borderRadius: 99, background: '#DCE3E8', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: approachingSoon ? '#D45B4E' : '#14807A', borderRadius: 99, transition: 'width .4s linear' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11.5, color: '#8A98A2' }}>
              <span>{distanceKm}km</span>
              <span>{durationMin}분 예상</span>
            </div>
          </div>

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
