import { useEffect, useMemo, useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import GangwonMap from '../components/GangwonMap'
import { GRADE } from '../data/mock'
import { fetchSafeCourses } from '../lib/tourApi'
import { COLORS, RADIUS } from '../theme'

const CATEGORIES = ['전체', '자연', '역사']

// safetyScore(100 - 10×터널개수)를 거꾸로 풀어서 터널 개수를 되짚고, 백엔드와 동일한 기준으로
// 등급을 매긴다(0개→green, 1~2개→amber, 3개 이상→red).
function tunnelCountFromScore(score) {
  return Math.max(0, Math.round((100 - score) / 10))
}
function classifyGrade(tunnelCount) {
  if (tunnelCount === 0) return 'green'
  if (tunnelCount <= 2) return 'amber'
  return 'red'
}
function shortRegionName(fullName) {
  return /[시군구]$/.test(fullName) ? fullName.slice(0, -1) : fullName
}

export default function CoursesScreen() {
  const nav = useNavigation()
  const [selected, setSelected] = useState(null)
  const [cat, setCat] = useState('전체')
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  // 강원지도 색깔은 목록 필터(selected)와 무관하게 항상 18개 시군 전체를 보여줘야 하므로,
  // 화면 목록용 courses와 별개로 전체 코스를 한 번 받아서 지역별 평균 등급을 낸다.
  const [allCourses, setAllCourses] = useState([])

  // 지역을 고르면 그 시군구만 조회(약 1초) — 백엔드가 권장하는 방식. 전체 조회는 첫 콜드 호출 시
  // 15초 정도 걸릴 수 있어 로딩 표시를 둔다.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchSafeCourses({ region: selected ?? undefined }).then(data => {
      if (!cancelled) { setCourses(data); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [selected])

  useEffect(() => {
    fetchSafeCourses({}).then(setAllCourses)
  }, [])

  const regionGrades = useMemo(() => {
    const byRegion = {}
    for (const c of allCourses) {
      const short = shortRegionName(c.region)
      ;(byRegion[short] ??= []).push(tunnelCountFromScore(c.safetyScore))
    }
    const result = {}
    for (const [region, counts] of Object.entries(byRegion)) {
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length
      result[region] = classifyGrade(Math.round(avg))
    }
    return result
  }, [allCourses])

  const list = courses.filter(c => cat === '전체' || c.tags.includes(cat))

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>안심 코스 큐레이션</Text>
      <Text style={styles.subtitle}>강원 18개 시군의 터널 노출도를 3등급으로 분류했어요. 지역을 골라 코스를 살펴보세요.</Text>

      <View style={styles.mapWrap}>
        <GangwonMap selected={selected} onSelect={name => setSelected(p => p === name ? null : name)} regionGrades={regionGrades} />
      </View>
      <View style={styles.legendRow}>
        {Object.entries(GRADE).map(([k, m]) => (
          <View key={k} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: m.bg, borderColor: m.border }]} />
            <Text style={styles.legendText}>{m.label}</Text>
          </View>
        ))}
        {selected && (
          <Pressable onPress={() => setSelected(null)} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>전체 보기</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{selected ? `${selected} 주변` : '전체 추천 코스'}</Text>
        <Text style={styles.listCount}>{loading ? '불러오는 중...' : `${list.length}개 코스`}</Text>
      </View>
      <View style={styles.catRow}>
        {CATEGORIES.map(c => (
          <Pressable key={c} onPress={() => setCat(c)} style={[styles.catChip, cat === c && styles.catChipActive]}>
            <Text style={[styles.catChipText, cat === c && styles.catChipTextActive]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.loadingText}>{selected ? '코스를 불러오는 중...' : '전체 코스를 불러오는 중 (첫 조회는 최대 15초 정도 걸려요)'}</Text>
        </View>
      )}

      {!loading && list.length === 0 && (
        <Text style={styles.emptyText}>이 지역에는 아직 등록된 코스가 없어요.</Text>
      )}

      {list.map(c => {
        const m = GRADE[c.grade]
        return (
          <Pressable key={c.id} onPress={() => nav.navigate('CourseDetail', { course: c })} style={styles.card}>
            <View style={styles.cardThumb} />
            <View style={{ padding: 16 }}>
              <View style={styles.cardTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardRegion}>{c.region}</Text>
                  <Text style={styles.cardTitle}>{c.title}</Text>
                </View>
                <View style={[styles.gradeBadge, { backgroundColor: m.bg, borderColor: m.border }]}>
                  <Text style={[styles.gradeBadgeText, { color: m.color }]}>{m.label}</Text>
                </View>
              </View>
              <Text style={styles.cardSummary}>{c.summary}</Text>
              <View style={styles.tagRow}>
                {c.tags.map(t => <View key={t} style={styles.tagChip}><Text style={styles.tagChipText}>{t}</Text></View>)}
                <Text style={styles.safetyScore}>안심 {c.safetyScore}</Text>
              </View>
            </View>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPage },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.textHead, marginBottom: 6 },
  subtitle: { fontSize: 13.5, color: COLORS.textSub, lineHeight: 19, marginBottom: 18 },
  // 웹(src/pages/CoursesPage.jsx)처럼 카드로 감싸지 않고 지도 모양만 배경 위에 바로 띄운다.
  mapWrap: { marginBottom: 20 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 4, borderWidth: 1.5 },
  legendText: { fontSize: 12.5, color: COLORS.textSub, fontWeight: '600' },
  clearBtn: { marginLeft: 'auto', backgroundColor: COLORS.bgSubtle, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  clearBtnText: { fontSize: 11.5, color: COLORS.textSub, fontWeight: '700' },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  listTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textHead },
  listCount: { fontSize: 12.5, color: COLORS.textMuted, fontWeight: '600' },
  catRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  catChip: { backgroundColor: COLORS.bgSubtle, borderRadius: 99, paddingHorizontal: 13, paddingVertical: 7 },
  catChipActive: { backgroundColor: COLORS.primary },
  catChipText: { fontSize: 11, fontWeight: '600', color: COLORS.textSub },
  catChipTextActive: { color: '#fff' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 24 },
  loadingText: { flex: 1, fontSize: 12.5, color: COLORS.textSub, lineHeight: 18 },
  emptyText: { fontSize: 13, color: COLORS.textMuted, paddingVertical: 24, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: RADIUS.xl, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.borderLight },
  cardThumb: { height: 110, backgroundColor: '#DCEBE9' },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 10 },
  cardRegion: { fontSize: 11.5, color: COLORS.textMuted, marginBottom: 3 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textHead },
  gradeBadge: { borderRadius: 99, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  gradeBadgeText: { fontSize: 11, fontWeight: '700' },
  cardSummary: { fontSize: 12.5, color: COLORS.textSub, lineHeight: 18, marginBottom: 10 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  tagChip: { backgroundColor: COLORS.bgSubtle, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3 },
  tagChipText: { fontSize: 11, color: COLORS.textSub },
  safetyScore: { fontSize: 10, fontWeight: '800', color: '#9A6B12', marginLeft: 'auto' },
})
