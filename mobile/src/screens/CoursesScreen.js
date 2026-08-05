import { useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import GangwonMap from '../components/GangwonMap'
import { COURSES, GRADE } from '../data/mock'
import { COLORS, RADIUS, SHADOW_MD } from '../theme'

const CATEGORIES = ['전체', '자연', '해안']

export default function CoursesScreen() {
  const nav = useNavigation()
  const [selected, setSelected] = useState(null)
  const [cat, setCat] = useState('전체')
  const list = COURSES
    .filter(c => !selected || c.region.includes(selected))
    .filter(c => cat === '전체' || c.tags.includes(cat))

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>안심 코스 큐레이션</Text>
      <Text style={styles.subtitle}>강원 18개 시군의 터널 노출도를 3등급으로 분류했어요. 지역을 골라 코스를 살펴보세요.</Text>

      <View style={styles.mapCard}>
        <GangwonMap selected={selected} onSelect={name => setSelected(p => p === name ? null : name)} />
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
        <Text style={styles.listCount}>{list.length}개 코스</Text>
      </View>
      <View style={styles.catRow}>
        {CATEGORIES.map(c => (
          <Pressable key={c} onPress={() => setCat(c)} style={[styles.catChip, cat === c && styles.catChipActive]}>
            <Text style={[styles.catChipText, cat === c && styles.catChipTextActive]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      {list.map(c => {
        const m = GRADE[c.grade]
        return (
          <Pressable key={c.id} onPress={() => nav.navigate('CourseDetail', { id: c.id })} style={styles.card}>
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
  mapCard: { backgroundColor: '#fff', borderRadius: RADIUS.xl, padding: 10, marginBottom: 12, ...SHADOW_MD },
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
