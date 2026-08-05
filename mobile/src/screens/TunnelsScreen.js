import { useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { TUNNELS, DIFF } from '../data/mock'
import { COLORS, RADIUS, SHADOW_MD } from '../theme'

const FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'desc', label: '난이도 높은 순' },
  { value: 'asc', label: '난이도 낮은 순' },
]

function DiffBar({ level }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <View key={i} style={{ width: 9, height: 20, borderRadius: 3, backgroundColor: i <= level ? DIFF[level].color : '#E7E2D7' }} />
      ))}
    </View>
  )
}

export default function TunnelsScreen() {
  const nav = useNavigation()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const filtered = q ? TUNNELS.filter(t => t.name.includes(q) || t.road.includes(q)) : TUNNELS
  const list = filter === 'desc' ? [...filtered].sort((a, b) => b.diff - a.diff)
    : filter === 'asc' ? [...filtered].sort((a, b) => a.diff - b.diff)
    : filtered

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>터널 정보 백과</Text>
      <Text style={styles.subtitle}>길이·차로·환기·정체를 종합한 공황 난이도 1~5단계로 미리 확인하세요.</Text>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput value={q} onChangeText={setQ} placeholder="터널 이름으로 검색 (예: 미시령, 인제)" placeholderTextColor={COLORS.textMuted} style={styles.searchInput} />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <Pressable key={f.value} onPress={() => setFilter(f.value)} style={[styles.filterChip, filter === f.value && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, filter === f.value && styles.filterChipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {list.map(t => (
        <Pressable key={t.id} onPress={() => nav.navigate('TunnelDetail', { id: t.id })} style={styles.card}>
          <View style={styles.cardTopRow}>
            <View>
              <Text style={styles.cardName}>{t.name}</Text>
              <Text style={styles.cardRoad}>{t.road}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={[styles.diffLabel, { color: DIFF[t.diff].color }]}>난이도 {t.diff}단계</Text>
              <DiffBar level={t.diff} />
            </View>
          </View>
          <View style={styles.statRow}>
            {[['길이', `${(t.lengthM / 1000).toFixed(2)}km`], ['차로', `왕복 ${t.lanes}차로`], ['환기', t.ventGrade], ['정체', t.congestion]].map(([k, v]) => (
              <View key={k}>
                <Text style={styles.statKey}>{k}</Text>
                <Text style={styles.statValue}>{v}</Text>
              </View>
            ))}
          </View>
        </Pressable>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPage },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.textHead, marginBottom: 6 },
  subtitle: { fontSize: 13.5, color: COLORS.textSub, lineHeight: 19, marginBottom: 18 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.borderLight, paddingHorizontal: 16, height: 48, marginBottom: 14 },
  searchIcon: { fontSize: 16, color: COLORS.textMuted },
  searchInput: { flex: 1, fontSize: 13.5, color: COLORS.textBody },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  filterChip: { backgroundColor: COLORS.bgSubtle, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  filterChipActive: { backgroundColor: COLORS.primary },
  filterChipText: { fontSize: 11, fontWeight: '600', color: COLORS.textSub },
  filterChipTextActive: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.borderLight, padding: 16, marginBottom: 12 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  cardName: { fontSize: 16, fontWeight: '800', color: COLORS.textHead, marginBottom: 3 },
  cardRoad: { fontSize: 12.5, color: COLORS.textMuted },
  diffLabel: { fontSize: 11.5, fontWeight: '700' },
  statRow: { flexDirection: 'row', gap: 20, flexWrap: 'wrap' },
  statKey: { fontSize: 11.5, color: COLORS.textMuted, marginBottom: 2 },
  statValue: { fontSize: 13.5, fontWeight: '700', color: '#243C42' },
})
