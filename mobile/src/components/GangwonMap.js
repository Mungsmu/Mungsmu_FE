import { View } from 'react-native'
import Svg, { Path, Text as SvgText } from 'react-native-svg'
import { REGIONS, GRADE } from '../data/mock'
import { GANGWON_GEO, GANGWON_VIEWBOX } from '../data/gangwonGeo'

// 원본 시군 경계 좌표는 세로로 눌린 비율이라 그대로 그리면 강원도 모양이 뭉툭하고 촌스러워
// 보인다 — 웹(src/components/GangwonMap.jsx)은 이를 세로로 15% 늘려서 실제 지형에 가깝게
// 보정한다. RN에서는 컨테이너를 미리 그만큼 늘린 비율로 잡고 Svg를 preserveAspectRatio="none"
// 으로 꽉 채워 늘리는 방식으로 같은 효과를 낸다. 다만 그러면 글자도 같이 세로로 늘어나 찌그러져
// 보이므로, 라벨 텍스트에는 그 반대 배율(1/STRETCH)을 각 라벨의 중심을 기준으로 되돌려 걸어
// 정사각 비율을 유지한다.
const STRETCH = 1.15

function labelTransform(x0, y0) {
  return `translate(${x0} ${y0}) scale(1 ${1 / STRETCH}) translate(${-x0} ${-y0})`
}

// 웹(GangwonMap.jsx)은 선택된 지역에 CSS filter:brightness(1.12)를 걸어 밝게 튀어 보이게 한다.
// RN에는 filter가 없어서(네이티브에서는 아예 지원 안 함) 같은 공식(각 채널 ×1.12, 255 클램프)을
// 색상 자체에 직접 적용해 두 플랫폼에서 동일한 강조 정도를 낸다.
function brighten(hex, factor) {
  const n = parseInt(hex.slice(1), 16)
  const clamp = c => Math.min(255, Math.round(c * factor))
  const r = clamp((n >> 16) & 255), g = clamp((n >> 8) & 255), b = clamp(n & 255)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export default function GangwonMap({ selected, onSelect }) {
  return (
    <View style={{ width: '100%', aspectRatio: GANGWON_VIEWBOX.w / (GANGWON_VIEWBOX.h * STRETCH) }}>
      <Svg viewBox={`0 0 ${GANGWON_VIEWBOX.w} ${GANGWON_VIEWBOX.h}`} width="100%" height="100%" preserveAspectRatio="none">
        {REGIONS.map(r => {
          const m = GRADE[r.grade]
          const geo = GANGWON_GEO[r.name]
          if (!geo) return null
          const isSel = selected === r.name
          return (
            <Path
              key={r.name}
              d={geo.d}
              fill={isSel ? brighten(m.bg, 1.12) : m.bg}
              stroke={isSel ? brighten(m.border, 1.12) : m.border}
              strokeWidth={isSel ? 2.4 : 1.6}
              strokeLinejoin="round"
              // react-native-svg 웹 구현은 onPress가 있어야만 그걸 실제 DOM onClick으로 바꿔준다
              // (lib/web/utils/prepare.js: `if (onPress !== null) clean.onClick = props.onPress` —
              // onPress를 안 주면 undefined가 되는데 `undefined !== null`은 true라서 이 줄이 그대로
              // 실행되며 onClick을 undefined로 덮어써버린다. 즉 onClick을 따로 줘도 소용없고
              // onPress가 있어야만 클릭이 동작한다). 그 과정에서 콘솔에 찍히는
              // "Unknown event handler property onStartShouldSetResponder" 등은 같이 딸려오는
              // 라이브러리 자체의 무해한 경고라 onPress를 지우지 않는 한 없앨 수 없다 — 기능이
              // 우선이라 경고는 감수하고 onPress를 유지한다.
              onPress={() => onSelect?.(r.name)}
            />
          )
        })}
        {REGIONS.map(r => {
          const m = GRADE[r.grade]
          const geo = GANGWON_GEO[r.name]
          if (!geo) return null
          return (
            <SvgText key={r.name} x={geo.labelX} y={geo.labelY} fontSize={14.5} fontWeight="800"
              fill={m.color} stroke="#fff" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke" textAnchor="middle"
              transform={labelTransform(geo.labelX, geo.labelY)}>{r.name}</SvgText>
          )
        })}
      </Svg>
    </View>
  )
}
