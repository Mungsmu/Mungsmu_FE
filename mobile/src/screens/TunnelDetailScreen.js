import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { useRoute } from '@react-navigation/native'
import { TUNNELS, DIFF } from '../data/mock'
import { COLORS, RADIUS, SHADOW_MD } from '../theme'
import MockMap from '../components/MockMap'

const DIFF_META = {
  1: { label: '매우 낮음', desc: '길이가 짧고 환기가 잘 돼요. 대부분 부담 없이 통과할 수 있어요.', bg: '#E8F6EE' },
  2: { label: '낮음', desc: '짧은 편이고 차선이 넓어요. 처음 도전하기 좋은 난이도예요.', bg: '#EAF3DE' },
  3: { label: '보통', desc: '평균적인 강원 터널이에요. 동반 모드를 준비하면 도움이 돼요.', bg: '#FBF0D9' },
  4: { label: '높음', desc: '길이가 길거나 정체가 잦아요. 동반 모드를 켜고 진입하세요.', bg: '#FAE6E0' },
  5: { label: '매우 높음', desc: '장대터널로 10분 이상 소요돼요. 반드시 동반 모드를 준비하세요.', bg: '#FCEAEA' },
}

export default function TunnelDetailScreen() {
  const { id } = useRoute().params
  const t = TUNNELS.find(t => t.id === id)
  if (!t) return <View style={styles.container}><Text style={styles.notFound}>터널 정보를 찾을 수 없어요.</Text></View>

  const dm = DIFF_META[t.diff]
  const dc = DIFF[t.diff].color
  const avgSec = Math.round((t.lengthM / 80) * 3.6)
  const avgTime = `${Math.floor(avgSec / 60)}분 ${avgSec % 60}초`

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <View style={styles.mapBox}>
        <MockMap markers={[{ id: t.id, label: t.name, query: t.name, color: dc }]} />
      </View>

      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.road}>{t.road}</Text>
          <Text style={styles.name}>{t.name}</Text>
        </View>
        <View style={[styles.diffBadge, { backgroundColor: dm.bg }]}>
          <Text style={[styles.diffValue, { color: dc }]}>{t.diff}단계</Text>
          <Text style={[styles.diffLabel, { color: dc }]}>{dm.label}</Text>
        </View>
      </View>

      <View style={[styles.warnBox, { backgroundColor: dm.bg }]}>
        <Text style={{ fontSize: 18 }}>⚠️</Text>
        <Text style={[styles.warnText, { color: dc }]}>{dm.desc}</Text>
      </View>

      <View style={styles.grid}>
        {[['길이', `${(t.lengthM / 1000).toFixed(2)}km`], ['차로수', `왕복 ${t.lanes}차로`], ['환기 등급', t.ventGrade], ['평균 통과', avgTime], ['정체 빈도', t.congestion], ['공황 난이도', `${t.diff} / 5단계`]].map(([k, v]) => (
          <View key={k} style={styles.gridItem}>
            <Text style={styles.gridKey}>{k}</Text>
            <Text style={styles.gridValue}>{v}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPage },
  notFound: { padding: 40, textAlign: 'center', color: COLORS.textMuted },
  mapBox: { height: 200, borderRadius: RADIUS.xl, overflow: 'hidden', marginBottom: 18, ...SHADOW_MD },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 20 },
  road: { fontSize: 12, color: COLORS.textMuted, marginBottom: 5 },
  name: { fontSize: 24, fontWeight: '800', color: COLORS.textHead },
  diffBadge: { borderRadius: RADIUS.xl, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', gap: 3 },
  diffValue: { fontSize: 26, fontWeight: '800' },
  diffLabel: { fontSize: 11, fontWeight: '700' },
  warnBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: RADIUS.lg, padding: 14, marginBottom: 20 },
  warnText: { flex: 1, fontSize: 13.5, lineHeight: 19, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: { width: '47%', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: RADIUS.lg, padding: 16 },
  gridKey: { fontSize: 11.5, color: COLORS.textMuted, marginBottom: 6 },
  gridValue: { fontSize: 18, fontWeight: '800', color: '#243C42' },
})
