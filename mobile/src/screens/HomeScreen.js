import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MockMap from '../components/MockMap'
import { COLORS, RADIUS, SHADOW_MD } from '../theme'

const FEATURES = [
  { icon: '🗺️', label: '안심 코스', screen: 'Courses' },
  { icon: '🚇', label: '터널 백과', screen: 'Tunnels' },
  { icon: '🧭', label: '길찾기',   screen: 'RouteInput' },
  { icon: '🫧', label: '동반 모드', screen: 'Companion' },
]

export default function HomeScreen() {
  const nav = useNavigation()
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.container}>
      <MockMap>
        <View style={[styles.topRow, { top: insets.top + 12 }]}>
          <Pressable onPress={() => nav.navigate('MyPage')} style={styles.avatarBtn}>
            <Text style={styles.avatarText}>서</Text>
          </Pressable>

          <Pressable onPress={() => nav.navigate('RouteInput')} style={styles.searchBar}>
            <Text style={styles.searchIcon}>⌕</Text>
            <Text style={styles.searchPlaceholder}>어디로 떠나볼까요?</Text>
          </Pressable>

          <Pressable onPress={() => nav.navigate('Companion')} style={styles.companionBtn}>
            <View style={styles.companionDot} />
          </Pressable>
        </View>

        <View style={[styles.featureRow, { paddingBottom: insets.bottom + 14 }]}>
          {FEATURES.map(f => (
            <Pressable key={f.label} style={styles.featureBtn} onPress={() => nav.navigate(f.screen)}>
              <View style={styles.featureIconWrap}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
              </View>
              <Text style={styles.featureLabel}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
      </MockMap>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPage },
  topRow: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...SHADOW_MD },
  avatarText: { fontSize: 15, fontWeight: '800', color: COLORS.primary },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: RADIUS.lg, paddingHorizontal: 16, height: 46, ...SHADOW_MD,
  },
  searchIcon: { fontSize: 16, color: COLORS.textMuted },
  searchPlaceholder: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  companionBtn: {
    width: 46, height: 46, borderRadius: 23, flexShrink: 0,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', ...SHADOW_MD,
  },
  companionDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.accent },
  featureRow: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.96)', paddingTop: 14, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, ...SHADOW_MD,
  },
  featureBtn: { alignItems: 'center', gap: 6, width: 72 },
  featureIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.bgSubtle, alignItems: 'center', justifyContent: 'center' },
  featureIcon: { fontSize: 20 },
  featureLabel: { fontSize: 11.5, color: COLORS.textSub, fontWeight: '600' },
})
