import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { COLORS, RADIUS } from '../theme'
import { MOCK_RESULT } from '../data/routeMock'

function fmtDuration(min) {
  return min >= 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min}분`
}

export default function RouteCompareScreen() {
  const nav = useNavigation()
  const { origin, dest, result = MOCK_RESULT } = useRoute().params
  const diffs = result.shortest.tunnels?.map(t => t.diff).filter(Boolean) ?? []
  const topDiff = diffs.length ? Math.max(...diffs) : null

  const select = selectedRoute => nav.navigate('RouteDetail', { origin, dest, result, selectedRoute })

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.headerRoute}>{origin} → {dest}</Text>

      <Pressable onPress={() => select('avoid')} style={[styles.card, styles.cardAvoid]}>
        <View style={styles.badge}><Text style={styles.badgeText}>추천 · 안심</Text></View>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>터널 회피 루트</Text>
          <View style={styles.tagGreen}><Text style={styles.tagGreenText}>터널 0개</Text></View>
        </View>
        <View style={styles.statRow}>
          <View>
            <Text style={styles.statValue}>{fmtDuration(result.avoid.durationMin)}</Text>
            <Text style={styles.statLabel}>소요 시간</Text>
          </View>
          <View>
            <Text style={styles.statValue}>{result.avoid.durationMin - result.shortest.durationMin >= 0 ? '+' : ''}{result.avoid.durationMin - result.shortest.durationMin}분</Text>
            <Text style={styles.statLabel}>최단 대비</Text>
          </View>
        </View>
        <Text style={styles.cardDesc}>{dest} 방면 국도·해안도로 경유 · 터널 노출 없음</Text>
      </Pressable>

      <Pressable onPress={() => select('shortest')} style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, { color: COLORS.textSub }]}>최단 루트</Text>
          <View style={styles.tagRed}><Text style={styles.tagRedText}>터널 {result.shortest.tunnelCount}개</Text></View>
        </View>
        <View style={styles.statRow}>
          <View>
            <Text style={[styles.statValue, { color: COLORS.textSub }]}>{fmtDuration(result.shortest.durationMin)}</Text>
            <Text style={styles.statLabel}>소요 시간</Text>
          </View>
          {topDiff != null && (
            <View>
              <Text style={[styles.statValue, { color: COLORS.gradeRed }]}>난이도 {topDiff}</Text>
              <Text style={styles.statLabel}>최고 터널</Text>
            </View>
          )}
        </View>
        {result.shortest.tunnels?.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
            {result.shortest.tunnels.slice(0, 3).map((t, i) => (
              <View key={t.id ?? `${t.name}-${i}`} style={styles.tunnelChip}><Text style={styles.tunnelChipText}>{t.name}</Text></View>
            ))}
          </View>
        )}
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPage },
  headerRoute: { fontSize: 14, fontWeight: '700', color: COLORS.textHead, marginBottom: 16 },
  card: { borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: RADIUS.lg, padding: 14, marginBottom: 12, backgroundColor: '#fff' },
  cardAvoid: { borderWidth: 2, borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  badge: { position: 'absolute', top: -9, left: 13, backgroundColor: COLORS.primary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontWeight: '800', fontSize: 14, color: COLORS.textHead },
  tagGreen: { backgroundColor: COLORS.gradeGreenBg, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  tagGreenText: { fontSize: 11, fontWeight: '700', color: '#2E7D4F' },
  tagRed: { backgroundColor: COLORS.gradeRedBg, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  tagRedText: { fontSize: 11, fontWeight: '700', color: '#A53E33' },
  statRow: { flexDirection: 'row', gap: 14, marginTop: 10 },
  statValue: { fontWeight: '800', fontSize: 16, color: COLORS.textHead },
  statLabel: { fontSize: 10.5, color: COLORS.textMuted },
  cardDesc: { fontSize: 10.5, color: COLORS.textSub, marginTop: 10, lineHeight: 15 },
  tunnelChip: { backgroundColor: COLORS.gradeRedBg, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 4 },
  tunnelChipText: { fontSize: 9, color: '#A53E33' },
})
