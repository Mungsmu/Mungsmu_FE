import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import MockMap from '../components/MockMap'
import { COLORS, RADIUS, SHADOW_MD } from '../theme'
import { MOCK_RESULT, DEFAULT_TUNNEL } from '../data/routeMock'

// 서울양양고속도로처럼 500m 이상 터널이 실제로 수십 개인 구간도 있어, 지도 마커는
// 상위 N개만 보여주고 나머지는 총 개수(result.tunnelCount)로만 표시한다.
const TUNNEL_PREVIEW_MAX = 3

export default function RouteDetailScreen() {
  const nav = useNavigation()
  const { origin, dest, selectedRoute, result: fullResult = MOCK_RESULT } = useRoute().params
  const isAvoid = selectedRoute === 'avoid'
  const result = fullResult[selectedRoute]
  const tunnels = result.tunnels?.length ? result.tunnels : (isAvoid ? [] : [DEFAULT_TUNNEL])

  const start = () => nav.navigate('Navigating', {
    origin, dest, durationMin: result.durationMin, distanceKm: result.distanceKm,
    waypoints: isAvoid ? fullResult.avoid.waypoints : [],
    path: result.path, maneuvers: result.maneuvers,
    originPlace: result.origin, destPlace: result.dest,
    ...(isAvoid ? {} : { tunnels }),
  })

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.headerRoute}>{origin} → {dest}</Text>

      <View style={styles.mapBox}>
        <MockMap
          showPath
          path={result.path}
          markers={[
            { id: 'o', label: '출발', query: origin, color: COLORS.primary, lat: result.origin?.lat, lng: result.origin?.lng },
            ...(isAvoid ? [] : tunnels.slice(0, TUNNEL_PREVIEW_MAX).map(t => ({ id: t.id, label: t.name, query: t.name, color: '#A53E33', lat: t.lat, lng: t.lng }))),
            { id: 'd', label: '도착', query: dest, color: COLORS.gradeRed, lat: result.dest?.lat, lng: result.dest?.lng },
          ]}
        >
          <View style={styles.mapLabel}>
            <Text style={styles.mapLabelText}>{isAvoid ? '터널 회피 루트' : '최단 루트'}</Text>
          </View>
        </MockMap>
      </View>

      <View style={styles.statRow}>
        <View>
          <Text style={styles.statValue}>
            {result.durationMin >= 60 ? `${Math.floor(result.durationMin / 60)}시간 ${result.durationMin % 60}분` : `${result.durationMin}분`}
          </Text>
          <Text style={styles.statLabel}>소요</Text>
        </View>
        <View>
          <Text style={styles.statValue}>{result.distanceKm}km</Text>
          <Text style={styles.statLabel}>거리</Text>
        </View>
        <View>
          <Text style={[styles.statValue, { color: isAvoid ? '#2E7D4F' : '#A53E33' }]}>{result.tunnelCount}개</Text>
          <Text style={styles.statLabel}>터널</Text>
        </View>
      </View>

      {isAvoid ? (
        <View style={styles.noticeGreen}>
          <Text style={styles.noticeIcon}>🛡️</Text>
          <Text style={styles.noticeGreenText}>이 경로는 터널 노출이 없어 동반 모드 없이 주행할 수 있어요</Text>
        </View>
      ) : (
        <View style={styles.noticeRed}>
          <Text style={styles.noticeIcon}>⚠️</Text>
          <Text style={styles.noticeRedText}>터널 통과 구간이 있어요({tunnels[0]?.name} 등). 동반 모드를 켜고 주행하세요.</Text>
        </View>
      )}

      {isAvoid && (
        <View style={{ marginTop: 16 }}>
          <Text style={styles.sectionLabel}>주요 경유</Text>
          {fullResult.avoid.waypoints.map(wp => (
            <View key={wp} style={styles.waypointRow}>
              <View style={styles.waypointDot} />
              <Text style={styles.waypointText}>{wp}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable onPress={start} style={[styles.startButton, { backgroundColor: isAvoid ? COLORS.primary : COLORS.gradeRed }]}>
        <Text style={styles.startButtonText}>{isAvoid ? '회피 루트로 길안내' : '이 경로로 출발하기'}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPage },
  headerRoute: { fontSize: 14, fontWeight: '700', color: COLORS.textHead, marginBottom: 14 },
  mapBox: { height: 280, borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.borderLight, marginBottom: 16, ...SHADOW_MD },
  mapLabel: { position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6 },
  mapLabelText: { fontSize: 11, fontWeight: '700', color: COLORS.textSub },
  statRow: { flexDirection: 'row', gap: 20, marginBottom: 14 },
  statValue: { fontWeight: '800', fontSize: 18, color: COLORS.textHead },
  statLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 4 },
  noticeGreen: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#ECF6F4', borderWidth: 1, borderColor: '#CBE6E0', borderRadius: RADIUS.md, padding: 12 },
  noticeGreenText: { fontSize: 11.5, fontWeight: '600', color: '#0E5E58', flex: 1, lineHeight: 16 },
  noticeRed: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#FBEAE7', borderWidth: 1, borderColor: '#E3A99F', borderRadius: RADIUS.md, padding: 12 },
  noticeRedText: { fontSize: 11.5, fontWeight: '600', color: '#A53E33', flex: 1, lineHeight: 16 },
  noticeIcon: { fontSize: 15 },
  sectionLabel: { fontSize: 11, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 8 },
  waypointRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 6 },
  waypointDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C3CDD5' },
  waypointText: { fontSize: 11.5, color: COLORS.textSub },
  startButton: { height: 46, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  startButtonText: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
})
