import { View, StyleSheet } from 'react-native'

// 터널 이동 게이지 — 지도 화면 우측에 고정, 진행률(pct)만큼 위에서부터 채워짐
export default function TunnelGauge({ pct = 0 }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { height: `${Math.min(pct, 100)}%` }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute', top: '18%', bottom: '18%', right: 16, width: 14, borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)',
    overflow: 'hidden',
  },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#14807A' },
})
