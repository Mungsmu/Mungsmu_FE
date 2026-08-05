import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import * as Location from 'expo-location'
import MockMap from '../components/MockMap'
import TunnelBanner from '../components/TunnelBanner'
import TunnelGauge from '../components/TunnelGauge'
import { COLORS, RADIUS, SHADOW_MD } from '../theme'
import { DEFAULT_TUNNEL } from '../data/routeMock'
import { haversineM, hasKakaoKey } from '../lib/kakaoRest'
import { speak } from '../lib/speech'
import { recordTunnelPass, getMonthlyPassCount } from '../lib/tunnelStats'

const PHASES = {
  inhale: { label: '들이쉬기', sec: 4, next: 'hold' },
  hold: { label: '잠깐 멈춤', sec: 2, next: 'exhale' },
  exhale: { label: '내쉬기', sec: 6, next: 'rest' },
  rest: { label: '잠깐 쉬기', sec: 1, next: 'inhale' },
}
const VIZ_OPTIONS = [['ripple', '물결'], ['wave', '음파'], ['tide', '차오름']]
const EXIT_WARN_M = 10
const APPROACH_MS = 5000

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
  const [breathPhase, setBreathPhase] = useState('inhale')
  const [count, setCount] = useState(PHASES.inhale.sec)
  const [pct, setPct] = useState(0)
  const [breathOpen, setBreathOpen] = useState(false)
  const [viz, setViz] = useState('ripple')
  const [guardianState, setGuardianState] = useState('idle') // idle | calling | sent
  const [exitWarned, setExitWarned] = useState(false)
  const [monthlyCount, setMonthlyCount] = useState(0)

  const phaseRef = useRef('inhale')
  const countRef = useRef(PHASES.inhale.sec)
  const scaleAnim = useRef(new Animated.Value(0.85)).current
  const enterTimeRef = useRef(null)
  const exitWarnedRef = useRef(false)
  const completedRef = useRef(false)

  // 1) 접근 단계: 10m 전 팝업 + 음성. 아직 호흡 가이드는 시작하지 않는다.
  useEffect(() => {
    speak('터널 진입 10미터 전입니다. 곧 동반모드가 실행됩니다.')
    const t = setTimeout(() => {
      enterTimeRef.current = Date.now()
      setPhase('breathing')
    }, APPROACH_MS)
    return () => clearTimeout(t)
  }, [])

  // 2) 호흡 가이드: 들이쉬기 4초 → 멈춤 2초 → 내쉬기 6초 → 쉬기 1초를 계속 반복. 전환마다 음성 안내.
  useEffect(() => {
    if (phase !== 'breathing') return
    speak(PHASES.inhale.label)
    const t = setInterval(() => {
      countRef.current -= 1
      if (countRef.current <= 0) {
        const next = PHASES[phaseRef.current].next
        phaseRef.current = next
        countRef.current = PHASES[next].sec
        setBreathPhase(next)
        setCount(PHASES[next].sec)
        speak(PHASES[next].label)
      } else {
        setCount(countRef.current)
      }
    }, 1000)
    return () => clearInterval(t)
  }, [phase])

  useEffect(() => {
    const target = (breathPhase === 'inhale' || breathPhase === 'hold') ? 1.15 : 0.85
    Animated.timing(scaleAnim, { toValue: target, duration: 800, useNativeDriver: true }).start()
  }, [breathPhase])

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
  const remain = Math.round((tunnel.lengthM || 2000) * (1 - pct / 100))

  return (
    <View style={{ flex: 1 }}>
      <MockMap markers={[{ id: tunnel.id, label: tunnel.name, query: tunnel.name, color: '#D45B4E' }]}>
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

        <View style={styles.bottomWrap}>
          {breathing && (
            <View style={[styles.summaryCard, breathOpen && { marginBottom: 12 }]}>
              <View style={styles.summaryTopRow}>
                <Text style={styles.summaryTitle}>{tunnel.name} 통과 중</Text>
                <Text style={styles.summaryRemain}>남은 거리 <Text style={styles.summaryRemainStrong}>{pct >= 99.5 ? '완료' : `${remain.toLocaleString()}m`}</Text></Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
              <Pressable onPress={() => setBreathOpen(v => !v)}>
                <Text style={styles.breathToggle}>{breathOpen ? '호흡 가이드 접기 ▾' : '호흡 가이드 열기 ▸'}</Text>
              </Pressable>
            </View>
          )}

          {breathing && breathOpen && (
            <View style={styles.breathCard}>
              <View style={styles.orbWrap}>
                <Animated.View style={[styles.orb, { transform: [{ scale: scaleAnim }] }]}>
                  <Text style={styles.orbCount}>{count}</Text>
                </Animated.View>
              </View>
              <Text style={styles.phaseLabel}>{PHASES[breathPhase].label}</Text>
              <View style={styles.vizRow}>
                {VIZ_OPTIONS.map(([k, l]) => (
                  <Pressable key={k} onPress={() => setViz(k)} style={[styles.vizBtn, viz === k && styles.vizBtnActive]}>
                    <Text style={[styles.vizBtnText, viz === k && styles.vizBtnTextActive]}>{l}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
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
  bottomWrap: { position: 'absolute', left: 16, right: 16, bottom: 16 },
  summaryCard: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: 14, ...SHADOW_MD },
  summaryTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  summaryTitle: { fontSize: 12.5, fontWeight: '700', color: COLORS.textHead },
  summaryRemain: { fontSize: 12.5, color: COLORS.textSub },
  summaryRemainStrong: { color: '#0E5E58', fontWeight: '800' },
  progressTrack: { height: 6, borderRadius: 99, backgroundColor: COLORS.borderLight, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: '100%', borderRadius: 99, backgroundColor: COLORS.primary },
  breathToggle: { marginTop: 10, fontSize: 12, fontWeight: '700', color: COLORS.primary },
  breathCard: { backgroundColor: '#0E5E58', borderRadius: RADIUS.xl, padding: 18, alignItems: 'center' },
  orbWrap: { width: 130, height: 130, alignItems: 'center', justifyContent: 'center' },
  orb: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#2D9D9B', alignItems: 'center', justifyContent: 'center' },
  orbCount: { fontSize: 30, fontWeight: '800', color: '#06343B' },
  phaseLabel: { fontSize: 15, fontWeight: '800', color: '#EAF6F4', marginTop: 4 },
  vizRow: { flexDirection: 'row', gap: 7, marginTop: 10 },
  vizBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 },
  vizBtnActive: { borderColor: 'rgba(141,224,194,0.4)', backgroundColor: 'rgba(141,224,194,0.18)' },
  vizBtnText: { fontSize: 11.5, fontWeight: '600', color: 'rgba(234,246,244,0.6)' },
  vizBtnTextActive: { color: '#8FD8CF' },
})
