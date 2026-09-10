import { useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { COLORS, RADIUS } from '../theme'
import { RECENT, MOCK_RESULT, computeRouteResult } from '../data/routeMock'
import PlaceAutocompleteInput from '../components/PlaceAutocompleteInput'

export default function RouteInputScreen() {
  const nav = useNavigation()
  const params = useRoute().params
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState(params?.dest ?? '')
  const [loading, setLoading] = useState(false)

  const search = async () => {
    if (!origin.trim() || !dest.trim() || loading) return
    setLoading(true)
    const result = (await computeRouteResult(origin, dest)) ?? MOCK_RESULT
    setLoading(false)
    nav.navigate('RouteCompare', { origin, dest, result })
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>안심 경로 길찾기</Text>
      <Text style={styles.subtitle}>출발지와 목적지를 입력하면 터널 회피 경로와 최단 경로를 비교해드려요.</Text>

      <View style={styles.inputBox}>
        <PlaceAutocompleteInput value={origin} onChange={setOrigin} placeholder="서울 (출발)" dotColor={COLORS.primary} recent={RECENT} />
        <View style={styles.divider} />
        <PlaceAutocompleteInput value={dest} onChange={setDest} onSubmit={search} placeholder="강릉시 경포해변" dotColor={COLORS.gradeRed} recent={RECENT} />
      </View>

      <Pressable onPress={search} disabled={!origin.trim() || !dest.trim() || loading}
        style={[styles.button, (!origin.trim() || !dest.trim() || loading) && { opacity: 0.45 }]}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>안심 경로 찾기</Text>}
      </Pressable>

      <Text style={styles.sectionLabel}>최근 검색</Text>
      {RECENT.map(item => (
        <Pressable key={item} onPress={() => setDest(item)} style={styles.recentRow}>
          <Text style={styles.recentIcon}>🕓</Text>
          <Text style={styles.recentText}>{item}</Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPage },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.textHead, marginBottom: 6 },
  subtitle: { fontSize: 13.5, color: COLORS.textSub, marginBottom: 18, lineHeight: 19 },
  // zIndex를 줘서 얘가 독립된 쌓임 맥락(stacking context)을 갖게 한다 — 안 그러면 내부 자동완성
  // 드롭다운의 zIndex가 바깥의 검색 버튼·최근 검색 목록(둘 다 zIndex 없음)에는 안 먹혀서, 드롭다운이
  // 그 위로 제대로 안 뜨고 화면 아래쪽 요소들과 겹쳐 보인다.
  inputBox: { backgroundColor: COLORS.bgSubtle, borderRadius: RADIUS.lg, paddingHorizontal: 13, marginBottom: 14, zIndex: 5 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
  button: { height: 46, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  sectionLabel: { fontSize: 11, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 8 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderLight },
  recentIcon: { fontSize: 14 },
  recentText: { fontSize: 12.5, color: COLORS.textSub },
})
