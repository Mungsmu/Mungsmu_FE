import { View, Text, Pressable, StyleSheet } from 'react-native'
import Svg, { Path, Circle } from 'react-native-svg'

// 웹의 src/components/NavOverlays.jsx와 동일 로직/스타일을 React Native로 옮긴 것.
// ─── 포맷 규칙 ───────────────────────────────────────────────
export function fmtDistM(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.max(0, Math.round(m))}m`
}

export function fmtClock12(date) {
  return date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
}

// ─── 회전 화살표 (Valhalla maneuver type → 아이콘) ───────────
function arrowKind(type) {
  if ([4, 5, 6].includes(type)) return 'dest'
  if ([9, 23].includes(type)) return 'slight-right'
  if ([16, 24].includes(type)) return 'slight-left'
  if ([10, 18, 20, 37].includes(type)) return 'right'
  if ([15, 19, 21, 38].includes(type)) return 'left'
  if (type === 11) return 'sharp-right'
  if (type === 14) return 'sharp-left'
  if ([12, 13].includes(type)) return 'uturn'
  if ([26, 27].includes(type)) return 'roundabout'
  if (type === 25) return 'merge'
  return 'straight'
}

const ARROW_PATHS = {
  'straight': ['M12 21 V6.5', 'M6.8 11 L12 5 L17.2 11'],
  'right': ['M7 21 V13.5 Q7 10 10.5 10 H16.5', 'M13 5.5 L17.8 10 L13 14.5'],
  'left': ['M17 21 V13.5 Q17 10 13.5 10 H7.5', 'M11 5.5 L6.2 10 L11 14.5'],
  'sharp-right': ['M8 21 V12 Q8 8.5 11 10.5 L16.5 14.5', 'M16.2 8.5 L17.6 15.3 L11.2 14.2'],
  'sharp-left': ['M16 21 V12 Q16 8.5 13 10.5 L7.5 14.5', 'M7.8 8.5 L6.4 15.3 L12.8 14.2'],
  'slight-right': ['M9 21 C9 15.5 10.5 12.5 15 8', 'M15.6 13.4 L15.8 7.2 L9.8 8.6'],
  'slight-left': ['M15 21 C15 15.5 13.5 12.5 9 8', 'M8.4 13.4 L8.2 7.2 L14.2 8.6'],
  'uturn': ['M7 21 V10 Q7 4.5 12 4.5 Q17 4.5 17 10 V15.5', 'M13.6 12.3 L17 16.8 L20.4 12.3'],
  'roundabout': ['M12 8.5 V3.5', 'M9.2 6 L12 2.8 L14.8 6'],
  'merge': ['M6.5 21 C6.5 14.5 12 15 12 8.5', 'M17.5 21 C17.5 14.5 12 15 12 8.5', 'M8.8 8.2 L12 4.4 L15.2 8.2'],
}

export function TurnArrow({ type, size = 46, color = '#fff' }) {
  const kind = arrowKind(type)
  if (kind === 'dest') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M8 21 V4" fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M8 5 H17 L14.5 8 L17 11 H8 Z" fill={color} />
      </Svg>
    )
  }
  const paths = ARROW_PATHS[kind] ?? ARROW_PATHS['straight']
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {kind === 'roundabout' && <Circle cx={12} cy={13.5} r={5} fill="none" stroke={color} strokeWidth={3.2} />}
      {paths.map((d, i) => (
        <Path key={i} d={d} fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  )
}

// 도로명 토큰 — 숫자면 국도 표지판 배지, 아니면 텍스트
function RoadToken({ name, dark }) {
  if (/^\d+$/.test(name)) {
    return (
      <View style={styles.roadBadge}>
        <Text style={styles.roadBadgeText}>{name}</Text>
      </View>
    )
  }
  return <Text style={[styles.roadText, dark && styles.roadTextDark]}>{name}</Text>
}

export function RoadTokens({ street, dark }) {
  if (!street) return null
  return (
    <View style={styles.roadTokensRow}>
      {street.split('·').map((t, i) => <RoadToken key={`${t}-${i}`} name={t} dark={dark} />)}
    </View>
  )
}

// ─── [기능 1] 턴바이턴 안내 패널 (화면 상단) ─────────────────
export function TurnPanel({ manType, distText, streetText, subManType, subDistText, subLabel, signalLost, rerouting, onExit }) {
  return (
    <View style={styles.turnPanelWrap} pointerEvents="box-none">
      <View style={styles.turnPanelBar}>
        <TurnArrow type={manType} size={50} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.turnDist}>{distText}</Text>
          <View style={styles.turnSubRow}>
            {rerouting
              ? <Text style={styles.turnSubText}>경로 재탐색 중…</Text>
              : streetText
                ? <><RoadTokens street={streetText} dark /><Text style={styles.turnSubText}> 방면</Text></>
                : <Text style={styles.turnSubText}>{subLabel}</Text>}
          </View>
        </View>
        {signalLost && (
          <View style={styles.signalLostBadge}><Text style={styles.signalLostText}>위치 재탐색 중</Text></View>
        )}
        <Pressable onPress={onExit} style={styles.turnExitBtn}>
          <Text style={styles.turnExitText}>✕</Text>
        </Pressable>
      </View>
      {subManType != null && !rerouting && (
        <View style={styles.turnSubBar}>
          <Text style={styles.turnSubBarLabel}>다음</Text>
          <TurnArrow type={subManType} size={17} color="#A9CBFF" />
          <Text style={styles.turnSubBarDist}>{subDistText}</Text>
        </View>
      )}
    </View>
  )
}

// ─── [기능 2] 전방 위험구간 경고 위젯 (화면 좌측 중앙) ────────
const HAZARD_META = {
  단속: { icon: '📷', label: '단속 카메라', color: '#D8342C' },
  사고: { icon: '🚨', label: '사고 구간', color: '#D8342C' },
  공사: { icon: '🚧', label: '공사 구간', color: '#E08A00' },
  급정거: { icon: '🛑', label: '급정거 구간', color: '#E08A00' },
}

export function HazardWidget({ type, distText, speed }) {
  const meta = HAZARD_META[type] ?? HAZARD_META['사고']
  return (
    <View style={styles.hazardWrap} pointerEvents="none">
      <View style={[styles.hazardSign, { borderColor: meta.color }]}>
        <Text style={styles.hazardSpeed}>{speed}</Text>
        <Text style={styles.hazardSpeedLabel}>기준 속도</Text>
      </View>
      <View style={[styles.hazardDistBadge, { backgroundColor: meta.color }]}>
        <Text style={styles.hazardDistText}>{distText}</Text>
      </View>
      <View style={styles.hazardTypeBadge}>
        <Text style={{ fontSize: 13 }}>{meta.icon}</Text>
        <Text style={[styles.hazardTypeText, { color: meta.color }]}>{meta.label}</Text>
      </View>
    </View>
  )
}

// ─── [기능 3] 주행 요약 바 (화면 하단) ───────────────────────
export function SummaryBar({ street, remainText, etaText, pct, danger, arrived, origin, dest, error }) {
  return (
    <View style={styles.summaryWrap}>
      <View style={styles.summaryProgressTrack}>
        <View style={[styles.summaryProgressFill, { width: `${pct}%`, backgroundColor: danger ? '#D45B4E' : '#14807A' }]} />
      </View>
      {error ? (
        <View style={styles.summaryRow}>
          <Text style={{ fontSize: 16 }}>⚠️</Text>
          <Text style={styles.summaryErrorText}>경로 정보를 불러오지 못했어요. 네트워크 확인 후 다시 시도해주세요.</Text>
        </View>
      ) : arrived ? (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCheckIcon}><Text style={{ fontSize: 14 }}>✓</Text></View>
          <Text style={styles.summaryArrivedText}>{dest} 도착</Text>
          <Text style={styles.summaryOriginTextRight}>{origin} 출발</Text>
        </View>
      ) : (
        <View style={styles.summaryStatsRow}>
          <View style={{ flex: 1.1, minWidth: 0 }}>
            <RoadTokens street={street} />
            {!street && <Text style={styles.summaryStreetValue}>—</Text>}
            <Text style={styles.summaryStatLabel}>주행 중인 도로</Text>
          </View>
          <View style={[styles.summaryStatCol, { borderLeftWidth: 1, borderLeftColor: '#EDF0EE' }]}>
            <Text style={styles.summaryStatValue}>{remainText}</Text>
            <Text style={styles.summaryStatLabel}>남은 거리</Text>
          </View>
          <View style={[styles.summaryStatCol, { borderLeftWidth: 1, borderLeftColor: '#EDF0EE' }]}>
            <Text style={[styles.summaryStatValue, { color: '#0E5E58' }]}>{etaText}</Text>
            <Text style={styles.summaryStatLabel}>도착 예정</Text>
          </View>
          <View style={{ alignItems: 'flex-end', flexShrink: 0, maxWidth: 110 }}>
            <Text style={styles.summaryDestText} numberOfLines={1}>{dest}</Text>
            <Text style={styles.summaryOriginText} numberOfLines={1}>{origin} 출발</Text>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  roadBadge: { minWidth: 26, height: 19, paddingHorizontal: 6, borderRadius: 9.5, backgroundColor: '#2B6CB8', borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  roadBadgeText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  roadText: { fontWeight: '800', color: '#16242E' },
  roadTextDark: { color: '#fff' },
  roadTokensRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },

  turnPanelWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  turnPanelBar: { backgroundColor: '#1863D6', paddingVertical: 13, paddingLeft: 16, paddingRight: 18, flexDirection: 'row', alignItems: 'center', gap: 15 },
  turnDist: { fontSize: 34, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  turnSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  turnSubText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  signalLostBadge: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 99, paddingHorizontal: 11, paddingVertical: 5 },
  signalLostText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  turnExitBtn: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 99, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  turnExitText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  turnSubBar: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(10,52,122,0.93)', borderRadius: 12, borderTopLeftRadius: 0, paddingVertical: 7, paddingHorizontal: 13 },
  turnSubBarLabel: { fontSize: 11, fontWeight: '700', color: '#A9CBFF' },
  turnSubBarDist: { fontSize: 14, fontWeight: '800', color: '#fff' },

  hazardWrap: { position: 'absolute', left: 16, top: '46%', alignItems: 'center', gap: 6, zIndex: 2 },
  hazardSign: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff', borderWidth: 5, alignItems: 'center', justifyContent: 'center' },
  hazardSpeed: { fontSize: 22, fontWeight: '800', color: '#16242E' },
  hazardSpeedLabel: { fontSize: 8, fontWeight: '700', color: '#8A98A2', marginTop: 1 },
  hazardDistBadge: { borderRadius: 8, paddingHorizontal: 11, paddingVertical: 4 },
  hazardDistText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  hazardTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  hazardTypeText: { fontSize: 11, fontWeight: '800' },

  summaryWrap: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  summaryProgressTrack: { height: 4, backgroundColor: '#E5EAE8' },
  summaryProgressFill: { height: '100%' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  summaryErrorText: { fontSize: 12.5, fontWeight: '700', color: '#A53E33', flex: 1 },
  summaryCheckIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#EAF7EF', alignItems: 'center', justifyContent: 'center' },
  summaryArrivedText: { fontSize: 14, fontWeight: '800', color: '#0E5E58' },
  summaryOriginTextRight: { marginLeft: 'auto', fontSize: 11, color: '#8A98A2', fontWeight: '600' },
  summaryStatsRow: { flexDirection: 'row', alignItems: 'center', padding: 13, gap: 14 },
  summaryStatCol: { paddingLeft: 14 },
  summaryStreetValue: { fontSize: 15.5, fontWeight: '800', color: '#16242E' },
  summaryStatValue: { fontSize: 16.5, fontWeight: '800', color: '#16242E' },
  summaryStatLabel: { fontSize: 10, color: '#8A98A2', fontWeight: '600', marginTop: 3 },
  summaryDestText: { fontSize: 11, fontWeight: '700', color: '#5B6C78' },
  summaryOriginText: { fontSize: 9.5, color: '#B3BDC4', fontWeight: '600', marginTop: 3 },
})
