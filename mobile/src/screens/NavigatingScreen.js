import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import * as Location from 'expo-location'
import MockMap from '../components/MockMap'
import TunnelBanner from '../components/TunnelBanner'
import TunnelGauge from '../components/TunnelGauge'
import { COLORS, RADIUS, SHADOW_MD } from '../theme'
import { resolvePlace, haversineM, hasKakaoKey } from '../lib/kakaoRest'
import { speak } from '../lib/speech'
import { getMonthlyPassCount } from '../lib/tunnelStats'

function fmtMMSS(totalSec) {
  const m = Math.floor(totalSec / 60)
  const s = Math.round(totalSec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function NavigatingScreen() {
  const nav = useNavigation()
  const {
    origin = '출발지', dest = '목적지', durationMin = 192, distanceKm = 238,
    waypoints = [], tunnels: incomingTunnels, tunnel: singleTunnel,
    passedTunnels = [],
  } = useRoute().params ?? {}
  const tunnels = incomingTunnels ?? (singleTunnel ? [singleTunnel] : [])
  const nextTunnel = tunnels[0] ?? null

  const [pct, setPct] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [monthlyCount, setMonthlyCount] = useState(0)
  const arrivedSpokenRef = useRef(false)

  // 목적지의 실제 좌표를 구해서 GPS 실거리로 진행률을 계산한다. 카카오 키가 없거나
  // 위치 권한이 없거나, 있어도 실제로 움직이지 않는 정지 상태(책상 테스트 등)라면
  // 데모 타이머로 대체한다 (GPS는 잡히지만 안 움직이는 경우까지 감지).
  useEffect(() => {
    let cancelled = false
    let watchSub = null
    let mockTimer = null
    let usingGps = false
    let startDist = null
    let lastRemain = null
    let lastMoveAt = Date.now()
    let stallTimer = null

    const startMock = () => {
      usingGps = false
      if (mockTimer) return
      mockTimer = setInterval(() => setPct(p => Math.min(p + 100 / 20, 100)), 500)
    }
    const stopMock = () => { if (mockTimer) { clearInterval(mockTimer); mockTimer = null } }

    ;(async () => {
      if (!hasKakaoKey) { startMock(); return }
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') { startMock(); return }
      const place = await resolvePlace(dest)
      if (cancelled) return
      if (!place) { startMock(); return }

      watchSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 1 },
        pos => {
          const remain = haversineM({ lat: pos.coords.latitude, lng: pos.coords.longitude }, place)
          if (startDist == null) startDist = Math.max(remain, 1)
          if (lastRemain == null || Math.abs(lastRemain - remain) > 5) {
            lastRemain = remain
            lastMoveAt = Date.now()
            usingGps = true
            stopMock()
            setPct(Math.min(100, Math.max(0, ((startDist - remain) / startDist) * 100)))
          }
        },
      )
      setTimeout(() => { if (!usingGps) startMock() }, 4000)
      stallTimer = setInterval(() => {
        if (usingGps && Date.now() - lastMoveAt > 6000) startMock()
      }, 2000)
    })()

    return () => {
      cancelled = true
      stopMock()
      if (stallTimer != null) clearInterval(stallTimer)
      watchSub?.remove()
    }
  }, [dest])

  useEffect(() => { getMonthlyPassCount().then(setMonthlyCount) }, [])

  const arrived = pct >= 100
  useEffect(() => {
    if (arrived && !arrivedSpokenRef.current) {
      arrivedSpokenRef.current = true
      speak('목적지에 도착하였습니다.')
      getMonthlyPassCount().then(setMonthlyCount)
    }
  }, [arrived])

  const showAlert = !!nextTunnel && pct >= 55 && !arrived && !dismissed
  const distanceLeftM = showAlert ? Math.max(10, Math.round(300 * (1 - Math.min((pct - 55) / 15, 1)) / 10) * 10) : null
  const totalPassSec = passedTunnels.reduce((a, t) => a + (t.sec ?? 0), 0)

  const enterCompanion = () => nav.navigate('Companion', {
    tunnel: nextTunnel, tunnels, origin, dest, durationMin, distanceKm, waypoints, passedTunnels,
  })

  return (
    <View style={{ flex: 1 }}>
      <MockMap
        showPath
        markers={[origin, ...waypoints, dest].map((name, i, arr) => ({
          id: `${i}`, label: i === 0 ? '출발' : i === arr.length - 1 ? '도착' : String(i + 1), query: name,
          color: i === 0 ? COLORS.textMuted : i === arr.length - 1 ? COLORS.gradeRed : COLORS.primary,
        }))}
      >
        <View style={styles.topRow}>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{arrived ? '도착 완료' : '주행 중 · 내비게이션'}</Text>
          </View>
          <Pressable onPress={() => nav.navigate('Home')} style={styles.exitBtn}>
            <Text style={styles.exitText}>나가기 ✕</Text>
          </Pressable>
        </View>

        {showAlert && (
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
                  {passedTunnels.map(t => (
                    <View key={t.name} style={styles.arrivedTunnelRow}>
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
          <View style={styles.summaryCard}>
            <Text style={styles.routeText}>{origin} → {dest}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: showAlert ? COLORS.gradeRed : COLORS.primary }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabel}>{distanceKm}km</Text>
              <Text style={styles.progressLabel}>{durationMin}분 예상</Text>
            </View>
          </View>

          {showAlert ? (
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
  summaryCard: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: 14, ...SHADOW_MD },
  routeText: { fontSize: 13, fontWeight: '700', color: COLORS.textHead, marginBottom: 8 },
  progressTrack: { height: 7, borderRadius: 99, backgroundColor: '#DCE3E8', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 99 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressLabel: { fontSize: 11.5, color: COLORS.textMuted },
  actionRow: { flexDirection: 'row', gap: 9, marginTop: 10 },
  actionBtn: { flex: 1, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  actionBtnLight: { backgroundColor: '#fff', ...SHADOW_MD },
  actionBtnPrimary: { backgroundColor: COLORS.primary },
  actionTextLight: { fontSize: 13, fontWeight: '700', color: COLORS.textSub },
  actionTextPrimary: { fontSize: 13, fontWeight: '800', color: '#fff' },
})
