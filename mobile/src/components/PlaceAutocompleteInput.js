import { useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { COLORS, RADIUS } from '../theme'
import { keywordSearch } from '../lib/kakaoRest'

// 카카오 키워드 검색으로 실제 장소를 추천해주는 출발지/목적지 입력창 (웹의 PlaceAutocomplete와 동일한 동작).
// 비어있는 채로 포커스하면 최근 검색을 드롭다운으로 보여준다.
export default function PlaceAutocompleteInput({ value, onChange, onSubmit, placeholder, dotColor, recent }) {
  const [results, setResults] = useState([])
  const [showRecent, setShowRecent] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef(null)
  const focusedRef = useRef(false)

  const handleChange = v => {
    onChange(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (v.trim() === '') {
      setResults([])
      setShowRecent(true)
      setOpen(!!recent?.length)
      return
    }
    setShowRecent(false)
    if (v.trim().length < 2) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      const data = await keywordSearch(v.trim())
      setResults(data.slice(0, 6))
      // 검색이 늦게 끝나서 응답이 왔을 때 이미 다른 입력창으로 넘어갔다면(포커스가 떠난 상태)
      // 드롭다운을 다시 띄우지 않는다 — 다음 필드를 가리는 문제 방지.
      if (focusedRef.current) setOpen(data.length > 0)
    }, 280)
  }

  const pick = place => { onChange(place.place_name); setOpen(false) }
  const pickRecent = text => { onChange(text); setShowRecent(false); setOpen(false) }

  const handleFocus = () => {
    focusedRef.current = true
    if (value.trim() === '' && recent?.length) { setShowRecent(true); setOpen(true) }
    else if (results.length > 0) setOpen(true)
  }
  const handleBlur = () => {
    focusedRef.current = false
    setTimeout(() => setOpen(false), 150)
  }

  return (
    // 열려있는(open) 입력창을 항상 위로 — 포커스가 옮겨갈 때(블러 딜레이 150ms 동안) 두 드롭다운이
    // 잠깐 동시에 열려도 겹쳐 보이지 않게, DOM 순서 대신 open 여부로 쌓임 순서를 정한다.
    <View style={{ position: 'relative', zIndex: open ? 20 : 10 }}>
      <View style={styles.inputRow}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <TextInput
          value={value}
          onChangeText={handleChange}
          onSubmitEditing={onSubmit}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          // iOS 기본 키보드의 QuickType이 "출발지"처럼 주소/현재 위치로 보이는 칸에 위치 기반
          // 자동완성 제안을 붙이려다가 첫 글자 입력 시 포커스가 끊기는 것으로 추정 — 이 칸에는
          // 그런 컨텍스트 추론(주소/이름/이메일 등)을 아예 끈다.
          textContentType="none"
          autoComplete="off"
          style={styles.input}
        />
      </View>

      {/* 드롭다운을 open 여부로 통째로 마운트/언마운트하면(예전 방식), 빈 칸 상태에서 뜬 "최근 검색"
          목록이 곧바로 새 글자 입력으로 닫힐 때 뷰 트리 전체가 한 프레임에 사라지면서 실기기에서
          입력창 포커스가 끊기고 키보드가 닫혀버렸다(사용자 리포트: "지우고 새로 치면 튕김").
          이제 컨테이너는 항상 떠 있게 두고 pointerEvents·opacity로만 보이기/숨기기를 전환해
          같은 입력 도중에 트리가 통째로 사라지는 일이 없게 한다. */}
      <View
        pointerEvents={open ? 'auto' : 'none'}
        style={[styles.dropdown, !open && styles.dropdownHidden]}
      >
        {showRecent ? (
          <>
            <Text style={styles.dropdownLabel}>최근 검색</Text>
            {recent.map(r => (
              <Pressable key={r} onPress={() => pickRecent(r)} style={styles.recentRow}>
                <Text style={styles.recentIcon}>🕓</Text>
                <Text style={styles.recentText}>{r}</Text>
              </Pressable>
            ))}
          </>
        ) : (
          results.map(r => (
            <Pressable key={r.id} onPress={() => pick(r)} style={styles.resultRow}>
              <Text style={styles.resultName}>{r.place_name}</Text>
              <Text style={styles.resultAddr}>{r.road_address_name || r.address_name}</Text>
            </Pressable>
          ))
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  input: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.textHead, padding: 0 },
  dropdown: {
    position: 'absolute', top: '100%', left: -13, right: -13, zIndex: 30,
    backgroundColor: '#fff', borderRadius: RADIUS.md, marginTop: 4,
    borderWidth: 1, borderColor: COLORS.borderLight, overflow: 'hidden',
    shadowColor: '#142838', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  dropdownHidden: { opacity: 0 },
  dropdownLabel: { fontSize: 10.5, color: COLORS.textMuted, letterSpacing: 1, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 4 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderLight },
  recentIcon: { fontSize: 13 },
  recentText: { fontSize: 12.5, color: COLORS.textSub },
  resultRow: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderLight },
  resultName: { fontSize: 13, fontWeight: '700', color: COLORS.textHead },
  resultAddr: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
})
