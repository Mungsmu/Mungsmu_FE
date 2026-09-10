import { useEffect, useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import MockMap from '../components/MockMap'
import { COLORS, RADIUS, SHADOW_MD } from '../theme'
import { resolvePlace, hasKakaoKey } from '../lib/kakaoRest'
import { fetchRoute } from '../lib/route'

// 안심 코스 상세에서 "코스 안내"를 눌렀을 때 진입하는 화면 — 코스의 경유지를 순서대로
// 이어서 길안내를 시작하기 전에 전체 동선을 미리 보여준다 (웹 RoutePage의 'course' 스텝과 동일 —
// 거기도 routeProfile="avoid"로 실제 터널 회피 도로 경로를 계산해서 보여준다).
export default function RouteCourseScreen() {
  const nav = useNavigation()
  const { courseTitle, origin, dest, waypoints = [], distance, tunnelTag } = useRoute().params
  const allSpots = [origin, ...waypoints, dest]
  const [routePath, setRoutePath] = useState(null)
  const [spotPlaces, setSpotPlaces] = useState([]) // 각 경유지 지오코딩 결과 — 마커를 WebView 안 재검색 없이 바로 찍기 위함

  useEffect(() => {
    let cancelled = false
    setRoutePath(null)
    setSpotPlaces([])
    if (!hasKakaoKey) return
    ;(async () => {
      const places = await Promise.all(allSpots.map(name => resolvePlace(name)))
      if (cancelled || places.some(p => !p)) return
      setSpotPlaces(places)
      // 터널 회피(안심) 코스이므로 웹과 동일하게 exclude_tunnels 경로로 계산한다
      const route = await fetchRoute(places, { excludeTunnels: true })
      if (!cancelled && route) setRoutePath(route.path)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSpots.join('|')])

  const start = () => nav.navigate('Navigating', { origin, dest, waypoints })

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.headerRoute}>{courseTitle ?? `${origin} → ${dest}`}</Text>

      <View style={styles.mapBox}>
        <MockMap
          showPath
          path={routePath ?? undefined}
          markers={allSpots.map((name, i) => ({
            id: `${name}-${i}`, label: String(i + 1), query: name,
            color: i === 0 ? '#14807A' : i === allSpots.length - 1 ? '#D45B4E' : '#8A98A2',
            lat: spotPlaces[i]?.lat, lng: spotPlaces[i]?.lng,
          }))}
        />
      </View>

      <View style={styles.statRow}>
        {distance && (
          <View>
            <Text style={styles.statValue}>{distance}</Text>
            <Text style={styles.statLabel}>총 거리</Text>
          </View>
        )}
        <View>
          <Text style={styles.statValue}>{allSpots.length}곳</Text>
          <Text style={styles.statLabel}>경유지</Text>
        </View>
        {tunnelTag && (
          <View>
            <Text style={[styles.statValue, { color: '#2E7D4F' }]}>{tunnelTag}</Text>
            <Text style={styles.statLabel}>터널</Text>
          </View>
        )}
      </View>

      <Text style={styles.sectionLabel}>순서대로 경유</Text>
      {allSpots.map((name, i) => (
        <View key={`${name}-${i}`} style={styles.spotRow}>
          <View style={[styles.spotDot, { backgroundColor: i === 0 ? COLORS.primary : i === allSpots.length - 1 ? COLORS.gradeRed : COLORS.textMuted }]}>
            <Text style={styles.spotDotText}>{i + 1}</Text>
          </View>
          <Text style={styles.spotText}>{name}</Text>
        </View>
      ))}

      <Pressable onPress={start} style={styles.startButton}>
        <Text style={styles.startButtonText}>이 코스로 출발하기</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPage },
  headerRoute: { fontSize: 14, fontWeight: '700', color: COLORS.textHead, marginBottom: 14 },
  mapBox: { height: 240, borderRadius: RADIUS.lg, overflow: 'hidden', marginBottom: 16, ...SHADOW_MD },
  statRow: { flexDirection: 'row', gap: 20, marginBottom: 16 },
  statValue: { fontWeight: '800', fontSize: 18, color: COLORS.textHead },
  statLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 4 },
  sectionLabel: { fontSize: 11, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 8 },
  spotRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 },
  spotDot: { width: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  spotDotText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  spotText: { fontSize: 12.5, color: COLORS.textHead, fontWeight: '600' },
  startButton: { height: 46, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  startButtonText: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
})
