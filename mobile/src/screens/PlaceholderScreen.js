import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { COLORS, RADIUS } from '../theme'

export default function PlaceholderScreen() {
  const nav = useNavigation()
  const { params } = useRoute()
  const title = params?.title ?? '준비 중인 화면'
  const desc = params?.desc ?? '이 화면은 다음 단계에서 구현될 예정이에요.'

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🚧</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.desc}>{desc}</Text>
      <Pressable style={styles.button} onPress={() => nav.goBack()}>
        <Text style={styles.buttonText}>돌아가기</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bgPage, padding: 32 },
  emoji: { fontSize: 40, marginBottom: 14 },
  title: { fontSize: 19, fontWeight: '800', color: COLORS.textHead, marginBottom: 8 },
  desc: { fontSize: 13.5, color: COLORS.textSub, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  button: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: 24 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
})
