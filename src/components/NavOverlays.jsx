import { memo } from 'react'

// ─── 포맷 규칙 ───────────────────────────────────────────────
// 거리: 1km 미만은 m 정수, 1km 이상은 소수점 1자리 km
export function fmtDistM(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.max(0, Math.round(m))}m`
}

// 시각: 12시간제 + 오전/오후 (예: 오후 4:03)
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

// 종류별 스트로크 path 데이터 (컴포넌트와 지도 오버레이 SVG 문자열이 공유)
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

// SVG 마크업 문자열 생성 — 카카오맵 CustomOverlay(innerHTML)에서도 같은 화살표를 쓰기 위한 형태
export function turnArrowSvg(type, size = 24, color = '#fff') {
  const kind = arrowKind(type)
  const stroke = `fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"`
  let body
  if (kind === 'dest') {
    body = `<path d="M8 21 V4" ${stroke}/><path d="M8 5 H17 L14.5 8 L17 11 H8 Z" fill="${color}"/>`
  } else {
    body = (ARROW_PATHS[kind] ?? ARROW_PATHS['straight']).map(d => `<path d="${d}" ${stroke}/>`).join('')
    if (kind === 'roundabout') body = `<circle cx="12" cy="13.5" r="5" ${stroke}/>` + body
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">${body}</svg>`
}

export function TurnArrow({ type, size = 46, color = '#fff' }) {
  return <span style={{ display: 'inline-flex', lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: turnArrowSvg(type, size, color) }} />
}

// 도로명 토큰 — 숫자면 국도 표지판 배지, 아니면 텍스트
function RoadToken({ name, dark = false }) {
  if (/^\d+$/.test(name)) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 26, height: 19, padding: '0 6px', borderRadius: 9.5, background: '#2B6CB8', border: '1.5px solid #fff', color: '#fff', fontSize: 11.5, fontWeight: 800 }}>
        {name}
      </span>
    )
  }
  return <span style={{ fontWeight: 800, color: dark ? '#fff' : '#16242E' }}>{name}</span>
}

export function RoadTokens({ street, dark }) {
  if (!street) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
      {street.split('·').map((t, i) => <RoadToken key={`${t}-${i}`} name={t} dark={dark} />)}
    </span>
  )
}

// ─── [기능 1] 턴바이턴 안내 패널 (화면 상단) ─────────────────
// memo: 표시 값이 이전과 같으면 다시 그리지 않는다.
export const TurnPanel = memo(function TurnPanel({
  manType, distText, streetText, subManType, subDistText, subLabel,
  signalLost, rerouting, onExit,
}) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, pointerEvents: 'none' }}>
      {/* 메인 바 */}
      <div style={{ background: 'linear-gradient(180deg, #1F72E8 0%, #1457C5 100%)', color: '#fff', padding: '13px 18px 13px 16px', display: 'flex', alignItems: 'center', gap: 15, boxShadow: '0 6px 24px rgba(12,60,150,.38)' }}>
        <TurnArrow type={manType} size={54} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>{distText}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {rerouting
              ? <span>경로 재탐색 중…</span>
              : streetText
                ? <><RoadTokens street={streetText} dark /><span style={{ flexShrink: 0 }}>방면</span></>
                : <span>{subLabel}</span>}
          </div>
        </div>
        {signalLost && (
          <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, background: 'rgba(255,255,255,.18)', borderRadius: 99, padding: '5px 11px', animation: 'pulse 1.4s ease-in-out infinite' }}>
            위치 재탐색 중
          </span>
        )}
        <button onClick={onExit} style={{ alignSelf: 'flex-start', color: '#fff', fontWeight: 700, fontSize: 15, background: 'rgba(255,255,255,.16)', border: 'none', borderRadius: 99, width: 30, height: 30, cursor: 'pointer', flexShrink: 0, lineHeight: 1, pointerEvents: 'auto' }}>✕</button>
      </div>
      {/* 하단 서브바 — 그 다음 안내 지점까지의 거리 */}
      {subManType != null && !rerouting && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(10,52,122,.93)', color: '#fff', borderRadius: '0 12px 12px 0', padding: '7px 14px 7px 12px', boxShadow: '0 4px 14px rgba(12,60,150,.3)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#A9CBFF' }}>다음</span>
          <TurnArrow type={subManType} size={19} color="#A9CBFF" />
          <span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{subDistText}</span>
        </div>
      )}
    </div>
  )
})

// ─── [기능 2] 전방 위험구간 경고 위젯 (화면 좌측 중앙) ────────
// 감지된 위험이 없으면 부모가 아예 렌더하지 않는다(공간도 차지하지 않음).
const HAZARD_META = {
  단속: { icon: '📷', label: '단속 카메라', color: '#D8342C' },
  사고: { icon: '🚨', label: '사고 구간', color: '#D8342C' },
  공사: { icon: '🚧', label: '공사 구간', color: '#E08A00' },
  급정거: { icon: '🛑', label: '급정거 구간', color: '#E08A00' },
}

export const HazardWidget = memo(function HazardWidget({ type, distText, speed }) {
  const meta = HAZARD_META[type] ?? HAZARD_META['사고']
  return (
    <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 2, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {/* 기준 속도 표지판 */}
      <div style={{ width: 66, height: 66, borderRadius: '50%', background: '#fff', border: `6px solid ${meta.color}`, boxShadow: '0 6px 20px rgba(20,40,60,.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, color: '#16242E', fontVariantNumeric: 'tabular-nums' }}>{speed}</span>
        <span style={{ fontSize: 8, fontWeight: 700, color: '#8A98A2', marginTop: 1 }}>기준 속도</span>
      </div>
      {/* 남은 거리 배지 */}
      <div style={{ background: meta.color, color: '#fff', borderRadius: 8, padding: '4px 12px', fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', boxShadow: '0 4px 12px rgba(200,50,40,.35)' }}>
        {distText}
      </div>
      {/* 위험 유형 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,.94)', borderRadius: 99, padding: '4px 11px', fontSize: 11.5, fontWeight: 800, color: meta.color, boxShadow: '0 3px 10px rgba(20,40,60,.18)' }}>
        <span style={{ fontSize: 13 }}>{meta.icon}</span>{meta.label}
      </div>
    </div>
  )
})

// ─── [기능 3] 주행 요약 바 (화면 하단) ───────────────────────
export const SummaryBar = memo(function SummaryBar({ street, remainText, etaText, pct, danger, arrived, origin, dest, error }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 6px 20px rgba(20,40,60,.14)' }}>
      <div style={{ height: 4, background: '#E5EAE8' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: danger ? '#D45B4E' : '#14807A', transition: 'width .4s linear' }} />
      </div>
      {error ? (
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: '#A53E33' }}>경로 정보를 불러오지 못했어요. 네트워크 확인 후 다시 시도해주세요.</span>
        </div>
      ) : arrived ? (
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#EAF7EF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✓</span>
          <span style={{ fontSize: 14.5, fontWeight: 800, color: '#0E5E58' }}>{dest} 도착</span>
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#8A98A2', fontWeight: 600 }}>{origin} 출발</span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', padding: '11px 18px 12px' }}>
          <div style={{ flex: 1.1, minWidth: 0 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: '#16242E', lineHeight: 1.15, display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {street ? <RoadTokens street={street} /> : '—'}
            </div>
            <div style={{ fontSize: 10.5, color: '#8A98A2', fontWeight: 600, marginTop: 3 }}>주행 중인 도로</div>
          </div>
          <div style={{ flex: .9, borderLeft: '1px solid #EDF0EE', paddingLeft: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#16242E', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{remainText}</div>
            <div style={{ fontSize: 10.5, color: '#8A98A2', fontWeight: 600, marginTop: 3 }}>남은 거리</div>
          </div>
          <div style={{ flex: 1, borderLeft: '1px solid #EDF0EE', paddingLeft: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0E5E58', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{etaText}</div>
            <div style={{ fontSize: 10.5, color: '#8A98A2', fontWeight: 600, marginTop: 3 }}>도착 예정</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, maxWidth: 140, overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5B6C78', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{dest}</div>
            <div style={{ fontSize: 10, color: '#B3BDC4', fontWeight: 600, marginTop: 3 }}>{origin} 출발</div>
          </div>
        </div>
      )}
    </div>
  )
})
