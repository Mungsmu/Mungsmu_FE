import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { COLORS, RADIUS, SHADOW_MD } from '../theme'
import { login } from '../lib/auth'

export default function LoginScreen() {
  const nav = useNavigation()
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!userId.trim() || !password || loading) return
    setLoading(true)
    setError('')
    try {
      await login(userId.trim(), password)
      nav.reset({ index: 0, routes: [{ name: 'Home' }] })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.logoRow}>
          <View style={styles.logoBadge}><Text style={styles.logoBadgeText}>숨</Text></View>
          <Text style={styles.logoText}>마음숨길</Text>
        </View>
        <Text style={styles.title}>안심하고 떠나는 강원 여행</Text>
        <Text style={styles.desc}>공황장애 환자를 위한 터널 회피 안심 관광 큐레이션 서비스</Text>

        <Text style={styles.label}>아이디</Text>
        <TextInput value={userId} onChangeText={t => { setUserId(t); setError('') }} placeholder="아이디를 입력하세요"
          placeholderTextColor={COLORS.textMuted} style={styles.input} autoFocus />
        <Text style={styles.label}>비밀번호</Text>
        <TextInput value={password} onChangeText={t => { setPassword(t); setError('') }} onSubmitEditing={submit}
          placeholder="비밀번호를 입력하세요" placeholderTextColor={COLORS.textMuted} style={styles.input} secureTextEntry />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Pressable onPress={submit} disabled={!userId.trim() || !password || loading} style={[styles.button, (!userId.trim() || !password || loading) && { opacity: 0.4 }]}>
          <Text style={styles.buttonText}>{loading ? '로그인 중...' : '로그인'}</Text>
        </Pressable>

        <Pressable onPress={() => nav.navigate('SignUp')}>
          <Text style={styles.signupLink}>회원가입 하러 가기 →</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPage, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 32, width: '100%', maxWidth: 420, alignItems: 'center' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  logoBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  logoBadgeText: { color: '#fff', fontWeight: '800' },
  logoText: { fontSize: 20, fontWeight: '800', color: COLORS.primaryDeep },
  title: { fontSize: 19, fontWeight: '800', color: COLORS.textHead, marginBottom: 8, textAlign: 'center' },
  desc: { fontSize: 12.5, color: COLORS.textSub, textAlign: 'center', lineHeight: 18, marginBottom: 28 },
  label: { alignSelf: 'flex-start', fontSize: 12.5, fontWeight: '700', color: COLORS.textHead, marginBottom: 8 },
  input: { width: '100%', borderWidth: 1.5, borderColor: COLORS.borderLight, backgroundColor: COLORS.bgPage, borderRadius: RADIUS.lg, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: COLORS.textBody, marginBottom: 14 },
  errorText: { alignSelf: 'flex-start', fontSize: 12.5, color: '#A53E33', marginTop: -8, marginBottom: 10 },
  button: { width: '100%', backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingVertical: 14, alignItems: 'center', ...SHADOW_MD },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  signupLink: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginTop: 14 },
})
