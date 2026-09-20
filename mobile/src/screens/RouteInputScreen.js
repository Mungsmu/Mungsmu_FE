import { useState, useEffect, useRef } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import * as Location from 'expo-location'
import { COLORS, RADIUS } from '../theme'
import { RECENT, MOCK_RESULT, computeRouteResult } from '../data/routeMock'
import { reverseGeocode } from '../lib/kakaoRest'
import { getCurrentPosition } from '../lib/geolocation'
import PlaceAutocompleteInput from '../components/PlaceAutocompleteInput'

export default function RouteInputScreen() {
  const nav = useNavigation()
  const params = useRoute().params
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState(params?.dest ?? '')
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  // 출발지를 텍스트로 검색해 다시 지오코딩하면 실제 GPS 위치와 몇십~몇백m씩 어긋날 수 있다 —
  // "현재 위치에서 출발"을 누르면 이 좌표를 원본 그대로 computeRouteResult에 넘겨 그 오차를 없앤다.
  // 텍스트(주소) 일치 여부로 판단하면 역지오코딩 결과가 조금만 달라져도 조용히 깨지므로,
  // 명시적인 플래그로 추적하고 사용자가 입력창을 직접 고치면 즉시 꺼버린다.
  const [originCoords, setOriginCoords] = useState(null)
  const [usingCurrentLocation, setUsingCurrentLocation] = useState(false)

  // 사용자가 이 화면에서 뭐라도(출발지든 목적지든) 입력을 시작했는지. 자동 위치 채우기가 늦게
  // 끝나면서 입력 중인 값을 덮어쓰지 않도록 하는 데 쓴다 — 출발지만 감시하면, 목적지를 타이핑하는
  // 도중에 출발지 칸이 자동으로 채워져 레이아웃이 밀리면서 포커스가 끊기고 키보드가 내려가
  // 버린다(사용자 리포트 "빈 칸일 때 글자 입력하면 화면이 움찔거리고 키보드가 닫힘").
  const interactedRef = useRef(false)

  const handleOriginChange = v => {
    interactedRef.current = true
    setOrigin(v)
    setUsingCurrentLocation(false)
  }
  const handleDestChange = v => {
    interactedRef.current = true
    setDest(v)
  }

  // 출발지는 대부분 "지금 있는 곳"이다. 예전에는 빈 칸으로 시작해 사용자가 직접 주소를 쳐야 했고,
  // 그렇게 친 주소를 다시 지오코딩하면 실제 위치와 어긋나 경로가 엉뚱하게 잡혔다. 화면에 들어오면
  // 한 번만 현재 위치로 채운다.
  const autoLocatedRef = useRef(false)
  useEffect(() => {
    if (autoLocatedRef.current || origin.trim()) return
    autoLocatedRef.current = true
    useCurrentLocation({ auto: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // auto: 화면 진입 시 자동으로 부른 경우. 이때는 사용자가 이미 입력을 시작했으면 덮어쓰지 않고,
  // 실패해도 경고창을 띄우지 않는다(직접 누른 게 아닌데 팝업이 뜨면 놀라기만 한다).
  //
  // GPS 권한 확인·위치 조회·역지오코딩은 각각 수백ms~수 초가 걸릴 수 있다. 예전에는 이 셋이 끝난
  // 뒤 마지막에 setOrigin()만 interactedRef로 막았는데, 그사이 setLocating(true)로 시작한 뒤
  // await 도중 사용자가 출발지 칸을 비우고 새로 타이핑하면 이 함수가 결국 setOriginCoords 등으로
  // 화면을 다시 렌더링해서 타이핑 중인 입력창 포커스가 끊겼다(사용자 리포트: "출발지 공란에서
  // 입력하면 키보드가 튕김"). 이제 auto 호출은 각 await 지점마다 확인해서, 사용자가 손을 댄
  // 순간 남은 단계를 전부 그만두고 아무 상태도 더 건드리지 않는다.
  const useCurrentLocation = async ({ auto = false } = {}) => {
    if (locating) return
    if (auto && interactedRef.current) return
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (auto && interactedRef.current) return
      if (status !== 'granted') {
        if (!auto) Alert.alert('위치 권한이 필요해요', '설정에서 위치 접근 권한을 허용해주세요.')
        return
      }
      const pos = await getCurrentPosition()
      if (auto && interactedRef.current) return
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      const address = await reverseGeocode(coords)
      if (auto && interactedRef.current) return
      setOriginCoords({ ...coords, name: '현재 위치', address: address ?? '' })
      setOrigin(address ?? '현재 위치')
      setUsingCurrentLocation(true)
    } catch {
      if (!auto) Alert.alert('위치를 확인할 수 없어요', 'GPS 신호를 받을 수 없습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setLocating(false)
    }
  }

  const search = async () => {
    if (!origin.trim() || !dest.trim() || loading) return
    setLoading(true)
    const fixedOrigin = usingCurrentLocation ? originCoords : undefined
    const result = (await computeRouteResult(origin, dest, { originPlace: fixedOrigin })) ?? MOCK_RESULT
    setLoading(false)
    // 실제로 지나는 터널이 없으면 회피 경로와 최단 경로가 같으므로 비교 화면 없이 바로 상세로 간다.
    if (result.hasTunnel === false) nav.navigate('RouteDetail', { origin, dest, result, selectedRoute: 'avoid' })
    else nav.navigate('RouteCompare', { origin, dest, result })
  }

  return (
    // keyboardShouldPersistTaps가 기본값(never)이면, 키보드가 떠 있는 상태에서 자동완성
    // 드롭다운 항목을 탭해도 ScrollView가 그 첫 탭을 "키보드 닫기"로만 소비하고 항목의
    // onPress에는 전달하지 않는다 — 그래서 드롭다운 위치명이 안 눌리고, 매번 한 번 더
    // 탭해야 하는 것처럼 느껴진다("자꾸 튕기는" 느낌의 원인).
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>안심 경로 길찾기</Text>
      <Text style={styles.subtitle}>출발지와 목적지를 입력하면 터널 회피 경로와 최단 경로를 비교해드려요.</Text>

      <View style={styles.inputBox}>
        <PlaceAutocompleteInput value={origin} onChange={handleOriginChange} onSubmit={search} placeholder="서울 (출발)" dotColor={COLORS.primary} recent={RECENT} />
        <View style={styles.divider} />
        <PlaceAutocompleteInput value={dest} onChange={handleDestChange} onSubmit={search} placeholder="강릉시 경포해변" dotColor={COLORS.gradeRed} recent={RECENT} />
      </View>

      <Pressable onPress={useCurrentLocation} disabled={locating} style={styles.currentLocBtn}>
        {locating
          ? <ActivityIndicator size="small" color={COLORS.primary} />
          : <View style={styles.currentLocDot} />}
        <Text style={styles.currentLocText}>{locating ? '현재 위치 확인 중...' : '현재 위치에서 출발'}</Text>
      </Pressable>

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
  currentLocBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 4, marginBottom: 18 },
  currentLocDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  currentLocText: { fontSize: 12.5, fontWeight: '700', color: COLORS.primary },
  button: { height: 46, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  sectionLabel: { fontSize: 11, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 8 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderLight },
  recentIcon: { fontSize: 14 },
  recentText: { fontSize: 12.5, color: COLORS.textSub },
})
