import { View, Text, Pressable, StyleSheet } from 'react-native'

// 지도 화면 상단 팝업 배너 — 터널 진입 전 / 보호자 호출 / 통과 완료 메시지에 공통 사용.
// onPress를 주면 보호자 호출 버튼처럼 누를 수 있는 배너로 동작한다.
// topOffset: 노치·다이나믹 아일랜드가 있는 기기에서 상단 안전영역(safe area)만큼 더 내려야 할 때
// 화면(NavigatingScreen 등)에서 insets.top을 넘겨준다.
export default function TunnelBanner({ title, subtitle, onPress, disabled, topOffset = 0 }) {
  if (!title) return null
  const Wrap = onPress ? Pressable : View
  return (
    <Wrap style={[styles.banner, { top: 64 + topOffset }, disabled && { opacity: 0.7 }]} onPress={onPress} disabled={disabled} pointerEvents={onPress ? 'auto' : 'none'}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </Wrap>
  )
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', top: 64, left: '10%', right: '10%', backgroundColor: '#0E5E58',
    borderRadius: 16, paddingVertical: 15, paddingHorizontal: 22, alignItems: 'center',
  },
  title: { color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'center', lineHeight: 22 },
  subtitle: { color: '#8FD8CF', fontWeight: '700', fontSize: 13, marginTop: 4, textAlign: 'center' },
})
