import { View, Text, StyleSheet } from 'react-native'
import { SHADOW_MD } from '../theme'

// 터널 통과 진행 카드 — 터널 이름 + 통과율 텍스트 + 진행바. 동반 모드 튜토리얼(CompanionScreen)과
// 실제 내비게이션 중 동반 모드 오버레이(NavigatingScreen)에서 똑같은 UI로 쓴다(웹의
// CompanionPage.jsx 하단 카드와 동일 — 예전엔 웹에만 있고 모바일엔 이식이 안 돼 있었다).
export default function TunnelProgressCard({ name, pct = 0 }) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.name} numberOfLines={1}>{name} 통과 중</Text>
        <Text style={styles.pct}>{pct >= 100 ? '통과 완료' : `${Math.round(pct)}% 통과`}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(pct, 100)}%` }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, ...SHADOW_MD },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  name: { fontSize: 12.5, fontWeight: '700', color: '#16242E', flexShrink: 1 },
  pct: { fontSize: 12.5, color: '#5B6C78', flexShrink: 0 },
  track: { height: 6, borderRadius: 99, backgroundColor: '#E4EAEF', overflow: 'hidden', marginTop: 8 },
  fill: { height: '100%', backgroundColor: '#0E5E58', borderRadius: 99 },
})
