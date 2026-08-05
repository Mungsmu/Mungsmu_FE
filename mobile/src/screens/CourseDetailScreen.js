import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import MockMap from '../components/MockMap'
import { COURSES, GRADE } from '../data/mock'
import { COLORS, RADIUS, SHADOW_MD } from '../theme'

export default function CourseDetailScreen() {
  const nav = useNavigation()
  const { id } = useRoute().params
  const course = COURSES.find(c => c.id === id)
  if (!course) return <View style={styles.container}><Text style={styles.notFound}>코스를 찾을 수 없어요.</Text></View>
  const m = GRADE[course.grade]

  const guideCourse = () => {
    const [first, ...rest] = course.spots
    const last = rest.pop()
    nav.navigate('RouteCourse', {
      courseTitle: course.title,
      origin: first.name,
      dest: last.name,
      waypoints: rest.map(s => s.name),
      distance: course.distance,
      tunnelTag: course.tags.find(t => t.startsWith('터널')),
    })
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <View style={styles.mapCard}>
        <MockMap showPath markers={course.spots.map((s, i) => ({ id: s.name, label: String(i + 1), query: s.name, color: '#14807A' }))}>
          <View style={styles.mapBadge}><Text style={styles.mapBadgeText}>{course.spots.length}개 경유지</Text></View>
        </MockMap>
      </View>

      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.region}>{course.region}</Text>
          <Text style={styles.title}>{course.title}</Text>
        </View>
        <View style={[styles.gradeBadge, { backgroundColor: m.bg, borderColor: m.border }]}>
          <Text style={[styles.gradeBadgeText, { color: m.color }]}>{m.label}</Text>
        </View>
      </View>

      <View style={styles.tagRow}>
        {course.tags.map(t => <View key={t} style={styles.tagChip}><Text style={styles.tagChipText}>{t}</Text></View>)}
        <View style={styles.tagChip}><Text style={styles.tagChipText}>📍 {course.distance}</Text></View>
      </View>

      <Text style={styles.summary}>{course.summary}</Text>

      <Text style={styles.sectionTitle}>경유지</Text>
      {course.spots.map((s, i) => (
        <View key={s.name} style={styles.spotRow}>
          <View style={styles.spotIndex}><Text style={styles.spotIndexText}>{i + 1}</Text></View>
          <View style={{ flex: 1 }}>
            <View style={styles.spotTopRow}>
              <Text style={styles.spotName}>{s.name}</Text>
              <View style={styles.spotTypeChip}><Text style={styles.spotTypeText}>{s.type}</Text></View>
            </View>
            <Text style={styles.spotDesc}>{s.desc}</Text>
          </View>
        </View>
      ))}

      <Pressable onPress={guideCourse} style={styles.ctaBtn}>
        <Text style={styles.ctaBtnText}>코스 안내</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPage },
  notFound: { padding: 40, textAlign: 'center', color: COLORS.textMuted },
  mapCard: { height: 220, borderRadius: RADIUS.xl, overflow: 'hidden', marginBottom: 18, ...SHADOW_MD },
  mapBadge: { position: 'absolute', top: 14, left: 14, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  mapBadgeText: { fontSize: 11.5, fontWeight: '700', color: COLORS.textSub },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  region: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.textHead },
  gradeBadge: { borderRadius: 99, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  gradeBadgeText: { fontSize: 12, fontWeight: '700' },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 14 },
  tagChip: { backgroundColor: COLORS.bgSubtle, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  tagChipText: { fontSize: 11.5, color: COLORS.textSub },
  summary: { fontSize: 14, color: COLORS.textSub, lineHeight: 21, marginBottom: 22, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textHead, marginBottom: 14 },
  spotRow: { flexDirection: 'row', gap: 14, backgroundColor: '#fff', borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.borderLight, padding: 14, marginBottom: 12 },
  spotIndex: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  spotIndexText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  spotTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  spotName: { fontSize: 14.5, fontWeight: '800', color: COLORS.textHead },
  spotTypeChip: { backgroundColor: COLORS.bgSubtle, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  spotTypeText: { fontSize: 10.5, color: COLORS.textSub },
  spotDesc: { fontSize: 12.5, color: COLORS.textSub, lineHeight: 18 },
  ctaBtn: { backgroundColor: COLORS.primary, height: 48, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center', marginTop: 8, ...SHADOW_MD },
  ctaBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
