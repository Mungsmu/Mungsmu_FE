import { View } from 'react-native'
import Svg, { Path, Text as SvgText } from 'react-native-svg'
import { REGIONS, GRADE } from '../data/mock'
import { GANGWON_GEO, GANGWON_VIEWBOX } from '../data/gangwonGeo'

export default function GangwonMap({ selected, onSelect }) {
  return (
    <View style={{ width: '100%', aspectRatio: GANGWON_VIEWBOX.w / GANGWON_VIEWBOX.h }}>
      <Svg viewBox={`0 0 ${GANGWON_VIEWBOX.w} ${GANGWON_VIEWBOX.h}`} width="100%" height="100%">
        {REGIONS.map(r => {
          const m = GRADE[r.grade]
          const geo = GANGWON_GEO[r.name]
          if (!geo) return null
          const isSel = selected === r.name
          return (
            <Path
              key={r.name}
              d={geo.d}
              fill={m.bg}
              stroke={m.border}
              strokeWidth={isSel ? 2.4 : 1.6}
              strokeLinejoin="round"
              opacity={isSel ? 1 : 0.92}
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
              fill={m.color} stroke="#fff" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke" textAnchor="middle">{r.name}</SvgText>
          )
        })}
      </Svg>
    </View>
  )
}
