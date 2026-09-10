import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import * as Location from 'expo-location'
import MockMap from '../components/MockMap'
import TunnelBanner from '../components/TunnelBanner'
import TunnelGauge from '../components/TunnelGauge'
import { TurnPanel, HazardWidget, SummaryBar, fmtDistM, fmtClock12 } from '../components/NavOverlays'
import { COLORS, RADIUS, SHADOW_MD } from '../theme'
import { resolvePlace, haversineM, hasKakaoKey } from '../lib/kakaoRest'
import { cumulativeDistM, maneuverLabel, fetchRoute } from '../lib/route'
import { speak } from '../lib/speech'
import { getMonthlyPassCount } from '../lib/tunnelStats'

// 웹의 src/pages/NavigatingPage.jsx와 동일 로직 — 실도로 경로(Valhalla) 기반 턴바이턴.
// RouteDetailScreen이 이미 계산해둔 path/maneuvers가 있으면 그대로 쓰고(재요청 없음),
// 없으면(레거시 진입 등) 목적지를 다시 지오코딩해 그 자리에서 계산한다.
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

function fmtMMSS(totalSec) {
  const m = Math.floor(totalSec / 60)
  const s = Math.round(totalSec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function NavigatingScreen() {
  const nav = useNavigation()
  const params = useRoute().params ?? {}
  const {
    origin = '출발지', dest = '목적지', durationMin = 192, distanceKm = 238,
    waypoints = [], tunnels: incomingTunnels, tunnel: singleTunnel,
    passedTunnels = [], path: incomingPath, maneuvers: incomingManeuvers,
    originPlace, destPlace,
  } = params
  const tunnels = incomingTunnels ?? (singleTunnel ? [singleTunnel] : [])
  const nextTunnel = tunnels[0] ?? null

  const [pct, setPct] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [tunnelDistM, setTunnelDistM] = useState(null)
  const [gpsActive, setGpsActive] = useState(false)
  const [navState, setNavState] = useState(null) // { lat, lng, heading, zoom, idx, man, distToManM, man2, distMan2M, curStreet, remainM, remainMin, speedKmh, hazard }
  const [signalLost, setSignalLost] = useState(false)
  const [rerouting, setRerouting] = useState(false)
  const [routeError, setRouteError] = useState(!incomingPath && !hasKakaoKey)
  const [monthlyCount, setMonthlyCount] = useState(0)

  const arrivedSpokenRef = useRef(false)
  const tunnelTriggeredRef = useRef(false)
  const routeRef = useRef(null) // { path, cum, totalM, maneuvers, durationMin }
  const traveledRef = useRef(0)
  const gpsLiveRef = useRef(false)
  const lastSpokenManRef = useRef(null)
  const hazardsRef = useRef([])
  const reroutingRef = useRef(false)
  const completedRef = useRef(false)

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

    setNavState({ lat, lng, heading, zoom, idx, man, distToManM, man2, distMan2M, curStreet, remainM, remainMin, speedKmh, hazard })
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
              setGpsActive(true)
              lastMoveAt = Date.now()
              updateNav(r.cum[best])
              return
            }
            if (gpsLiveRef.current) { reroute(here); return }
          }
          if (!place) return
          const remain = haversineM(here, place)
          if (startDist == null) startDist = Math.max(remain, 1)
          if (lastRemain != null && Math.abs(lastRemain - remain) <= 5) return
          lastRemain = remain
          lastMoveAt = Date.now()
          setGpsActive(true)
          setPct(Math.min(100, Math.max(0, ((startDist - remain) / startDist) * 100)))
        },
      )
      stallTimer = setInterval(() => {
        if (gpsLiveRef.current && Date.now() - lastMoveAt > 6000) {
          gpsLiveRef.current = false
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

  // 다음 터널까지의 실거리를 구해서 10m 이내면 동반 모드로 자동 진입. 실측이 안 되면 진행률 폴백.
  useEffect(() => {
    if (!nextTunnel || tunnelTriggeredRef.current) return
    const trigger = () => {
      if (tunnelTriggeredRef.current) return
      tunnelTriggeredRef.current = true
      nav.navigate('Companion', { tunnel: nextTunnel, tunnels, origin, dest, durationMin, distanceKm, waypoints, passedTunnels })
    }
    let cancelled = false
    let watchSub = null
    ;(async () => {
      if (!hasKakaoKey) return
      const place = nextTunnel.lat != null ? { lat: nextTunnel.lat, lng: nextTunnel.lng } : await resolvePlace(nextTunnel.name)
      if (cancelled || !place) return
      watchSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 2 },
        pos => {
          const d = haversineM({ lat: pos.coords.latitude, lng: pos.coords.longitude }, place)
          setTunnelDistM(Math.round(d))
          if (d <= TUNNEL_TRIGGER_M) trigger()
        },
      )
    })()
    return () => { cancelled = true; watchSub?.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextTunnel])

  useEffect(() => {
    if (!nextTunnel || gpsActive) return
    if (pct >= 55 && !tunnelTriggeredRef.current) {
      tunnelTriggeredRef.current = true
      nav.navigate('Companion', { tunnel: nextTunnel, tunnels, origin, dest, durationMin, distanceKm, waypoints, passedTunnels })
    }
  }, [pct, nextTunnel, gpsActive])

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

  const approachingSoon = !!nextTunnel && !tunnelTriggeredRef.current && !arrived && !dismissed
    && (tunnelDistM != null ? tunnelDistM <= 400 : pct >= 40)
  const distanceLeftM = approachingSoon ? (tunnelDistM ?? Math.max(10, Math.round(300 * (1 - Math.min((pct - 40) / 15, 1)) / 10) * 10)) : null
  const totalPassSec = passedTunnels.reduce((a, t) => a + (t.sec ?? 0), 0)

  const enterCompanion = () => {
    tunnelTriggeredRef.current = true
    nav.navigate('Companion', { tunnel: nextTunnel, tunnels, origin, dest, durationMin, distanceKm, waypoints, passedTunnels })
  }

  const routeMarkers = [origin, ...waypoints, dest].map((name, i, arr) => ({
    id: `${i}`, label: i === 0 ? '출발' : i === arr.length - 1 ? '도착' : String(i + 1), query: name,
    color: i === 0 ? COLORS.textMuted : i === arr.length - 1 ? COLORS.gradeRed : COLORS.primary,
    ...(i === 0 && originPlace ? { lat: originPlace.lat, lng: originPlace.lng } : {}),
    ...(i === arr.length - 1 && destPlace ? { lat: destPlace.lat, lng: destPlace.lng } : {}),
  }))

  return (
    <View style={{ flex: 1 }}>
      <MockMap
        showPath
        path={incomingPath ?? routeRef.current?.path}
        navPosition={navState && !arrived ? { lat: navState.lat, lng: navState.lng, heading: navState.heading, zoom: navState.zoom } : null}
        markers={routeMarkers}
      >
        {navState?.man && !arrived && !approachingSoon ? (
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
            />
            <View style={styles.gpsBadge}>
              <Text style={styles.gpsBadgeText}>{gpsActive ? 'GPS 실측' : '경로 시뮬레이션'}</Text>
            </View>
          </>
        ) : (
          <View style={styles.topRow}>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{arrived ? '도착 완료' : rerouting ? '경로 재탐색 중…' : gpsActive ? '주행 중 · GPS 실측' : '주행 중 · 내비게이션'}</Text>
            </View>
            <Pressable onPress={() => nav.navigate('Home')} style={styles.exitBtn}>
              <Text style={styles.exitText}>나가기 ✕</Text>
            </Pressable>
          </View>
        )}

        {navState?.hazard && !arrived && (
          <HazardWidget type={navState.hazard.type} distText={fmtDistM(navState.hazard.distM)} speed={navState.hazard.speed} />
        )}

        {approachingSoon && (
          <>
            <TunnelBanner title={`${nextTunnel.name} 진입 ${distanceLeftM}m 전`} subtitle={`공황 난이도 ${nextTunnel.diff}단계`} />
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
              <Pressable onPress={enterCompanion} style={[styles.actionBtn, styles.actionBtnPrimary, { flex: 1.4 }]}>
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
