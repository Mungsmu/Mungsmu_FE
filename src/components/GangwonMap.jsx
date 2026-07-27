import { REGIONS, GRADE } from '../data/mock.js'
import { GANGWON_GEO, GANGWON_VIEWBOX } from '../data/gangwonGeo.js'

const STRETCH = 1.15

// 라벨 앵커(x0,y0) 기준으로 역스케일을 걸어, svg 전체는 세로로 늘어나되
// 글자 자체는 원래 비율(정사각형)을 유지하도록 한다.
function labelTransform(x0, y0) {
  return `translate(${x0} ${y0}) scale(1 ${1 / STRETCH}) translate(${-x0} ${-y0})`
}

export default function GangwonMap({ selected, onSelect }) {
  return (
    <svg
      viewBox={`0 0 ${GANGWON_VIEWBOX.w} ${GANGWON_VIEWBOX.h}`}
      style={{ width:'100%', height:'auto', display:'block', transform:`scaleY(${STRETCH})`, transformOrigin:'center' }}
    >
      {/* 1st pass: 시군 경계 */}
      <g>
        {REGIONS.map(r => {
          const m = GRADE[r.grade]
          const geo = GANGWON_GEO[r.name]
          if (!geo) return null
          const isSel = selected === r.name
          return (
            <path
              key={r.name}
              d={geo.d}
              fill={m.bg}
              stroke={m.border}
              strokeWidth={isSel ? 2.4 : 1.6}
              strokeLinejoin="round"
              style={{ cursor:'pointer', filter: isSel ? 'brightness(1.12)' : 'none' }}
              onClick={() => onSelect?.(r.name)}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.filter='brightness(1.1)' }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.filter='none' }}
            >
              <title>{r.name} · 터널 {r.tunnels}</title>
            </path>
          )
        })}
      </g>

      {/* 2nd pass: 라벨을 모든 도형 위에 그려서, 이웃 시군과 겹쳐도 항상 보이게 함 */}
      <g style={{ pointerEvents:'none' }}>
        {REGIONS.map(r => {
          const m = GRADE[r.grade]
          const geo = GANGWON_GEO[r.name]
          if (!geo) return null
          const isSel = selected === r.name
          const color = m.color
          const nameY = geo.labelY - 2
          const tunnelY = geo.labelY + 12
          return (
            <g key={r.name}>
              <g transform={labelTransform(geo.labelX, nameY)}>
                <text
                  x={geo.labelX} y={nameY} textAnchor="middle" fontSize={14.5} fontWeight={800}
                  fill={color} stroke="#fff" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke"
                >{r.name}</text>
              </g>
              <g transform={labelTransform(geo.labelX, tunnelY)}>
                <text
                  x={geo.labelX} y={tunnelY} textAnchor="middle" fontSize={10.5}
                  fill={color} opacity={isSel ? .9 : .75} stroke="#fff" strokeWidth={2.4} strokeLinejoin="round" paintOrder="stroke"
                >터널 {r.tunnels}</text>
              </g>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
