import { useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, Animated } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { COLORS, RADIUS, SHADOW_MD } from '../theme'
import { clearSession } from '../lib/auth'

function Toggle({ on, onToggle }) {
  const anim = useState(new Animated.Value(on ? 1 : 0))[0]
  const toggle = () => {
    const next = !on
    Animated.timing(anim, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: false }).start()
    onToggle(next)
  }
  const left = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 21] })
  return (
    <Pressable onPress={toggle} style={[styles.toggleTrack, { backgroundColor: on ? COLORS.primary : '#D6D0C4' }]}>
      <Animated.View style={[styles.toggleThumb, { left }]} />
    </Pressable>
  )
}

const SETTINGS = [
  { key: 'share', label: '실시간 위치 공유', desc: '동반 모드 중 보호자에게 위치 전송' },
  { key: 'auto', label: '자동 통과 알림', desc: '터널 진입·통과 시 보호자에게 자동 알림' },
  { key: 'emer', label: '긴급 호출 위임', desc: '긴급 호출 시 보호자에게 즉시 연결' },
]

export default function MyPageScreen() {
  const nav = useNavigation()
  const [toggles, setToggles] = useState({ share: true, auto: true, emer: false })

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>마이페이지</Text>

      <View style={styles.profileCard}>
        <View style={styles.avatar}><Text style={styles.avatarText}>서</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>서연 님</Text>
          <Text style={styles.profileSub}>마음숨길 여행자</Text>
        </View>
      </View>

      <View style={styles.statsCard}>
        <Text style={styles.cardTitle}>이번 달 기록</Text>
        <View style={styles.statsRow}>
          {[['12회', '터널 통과 성공', '#2E9E6B'], ['5회', '안심 경로 회피', COLORS.primary], ['3단계', '평균 통과 난이도', '#E0A93B']].map(([v, l, c]) => (
            <View key={l} style={styles.statItem}>
              <Text style={[styles.statValue, { color: c }]}>{v}</Text>
              <Text style={styles.statLabel}>{l}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.settingsCard}>
        <View style={styles.settingsHeader}>
          <Text style={styles.cardTitle}>보호자 연동</Text>
        </View>
        <View style={styles.guardianRow}>
          <View style={styles.guardianAvatar}><Text style={styles.guardianAvatarText}>민</Text></View>
          <View>
            <Text style={styles.guardianName}>김민준</Text>
            <Text style={styles.guardianPhone}>가족 · 010-0000-0000</Text>
          </View>
        </View>
        {SETTINGS.map(s => (
          <View key={s.key} style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>{s.label}</Text>
              <Text style={styles.settingDesc}>{s.desc}</Text>
            </View>
            <Toggle on={toggles[s.key]} onToggle={v => setToggles(t => ({ ...t, [s.key]: v }))} />
          </View>
        ))}
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.cardTitle}>서비스</Text>
        {['이용 내역', '앱 설정', '문의하기'].map(l => (
          <Pressable key={l} style={styles.serviceRow}><Text style={styles.serviceText}>{l}</Text></Pressable>
        ))}
        <Pressable onPress={async () => { await clearSession(); nav.reset({ index: 0, routes: [{ name: 'Login' }] }) }} style={styles.serviceRow}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPage },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.textHead, marginBottom: 18 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#fff', borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.borderLight, padding: 20, marginBottom: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 19, fontWeight: '800', color: COLORS.primary },
  profileName: { fontSize: 17, fontWeight: '800', color: COLORS.textHead, marginBottom: 2 },
  profileSub: { fontSize: 12, color: COLORS.textMuted },
  statsCard: { backgroundColor: '#fff', borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.borderLight, padding: 20, marginBottom: 14 },
  cardTitle: { fontSize: 14.5, fontWeight: '800', color: COLORS.textHead, marginBottom: 16 },
  statsRow: { flexDirection: 'row' },
  statItem: { flex: 1 },
  statValue: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  statLabel: { fontSize: 10.5, color: COLORS.textMuted, lineHeight: 14 },
  settingsCard: { backgroundColor: '#fff', borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.borderLight, padding: 20, marginBottom: 14 },
  settingsHeader: { marginBottom: 4 },
  guardianRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.bgPage, borderRadius: 8, padding: 12, marginBottom: 12 },
  guardianAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  guardianAvatarText: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  guardianName: { fontSize: 14.5, fontWeight: '700', color: COLORS.textHead, marginBottom: 2 },
  guardianPhone: { fontSize: 11.5, color: COLORS.textMuted },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  settingLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textHead, marginBottom: 2 },
  settingDesc: { fontSize: 11.5, color: COLORS.textMuted, lineHeight: 16 },
  toggleTrack: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center' },
  toggleThumb: { position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  serviceRow: { paddingVertical: 13, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  serviceText: { fontSize: 14, fontWeight: '500', color: COLORS.textSub },
  logoutText: { fontSize: 14, fontWeight: '500', color: '#B24A33' },
})
