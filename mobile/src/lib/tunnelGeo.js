// 강원도 터널 실측 데이터셋(../data/gangwonTunnels)에서 이름·좌표로 터널 진입/진출 지점을 찾는 헬퍼.
// 동반 모드·내비게이션이 터널 위치를 알아낼 때, 터널 이름을 지오코딩(키워드 검색)하는 방식은
// 엉뚱한 동명 장소를 짚거나(예: 터널 이름이 인근 지명과 겹침) 진행 방향을 몰라 추측해야 하는 문제가
// 있었다 — 여기서는 강원도가 실측한 404개 터널의 실제 출입구 좌표를 우선 사용해 그 불안정성을 없앤다.
import { GANGWON_TUNNELS } from '../data/gangwonTunnels'
import { haversineM } from './kakaoRest'

// 경로 추적(traceTunnels) 결과나 mock.js 큐레이션 목록의 터널 이름은 방향 표기가 없고, 이 데이터셋은
// "미시령터널(상)"처럼 방향별 접미사가 붙어 있어 그대로는 일치하지 않는다 — 접미사를 뗀 기본 이름으로 비교한다.
function baseName(name) {
  return (name ?? '').replace(/\([^)]*\)\s*$/, '').trim()
}

const byBaseName = new Map()
for (const t of GANGWON_TUNNELS) {
  const key = baseName(t.name)
  if (!byBaseName.has(key)) byBaseName.set(key, [])
  byBaseName.get(key).push(t)
}

// 이름으로 강원도 터널 데이터셋에서 찾는다. 상/하행 등 방향별로 여러 항목이 있으면 첫 항목을
// 대표로 쓴다 — 어느 방향인지까지 구분하는 정밀도는 필요 없고, 좌표 차이도 대개 수십~수백m
// 이내라 진입 판정(10m 트리거) 정확도 외에는 실질적 영향이 작다.
export function findGangwonTunnel(name) {
  if (!name) return null
  return byBaseName.get(name.trim())?.[0] ?? byBaseName.get(baseName(name))?.[0] ?? null
}

// 좌표 기준으로 가장 가까운 터널을 찾는다 — 이름 매칭이 안 될 때(traceTunnels가 지어낸 합성
// 이름 등)의 보조 수단. maxM 밖이면 매칭 실패로 보고 null.
export function nearestGangwonTunnel(point, maxM = 300) {
  let best = null, bestD = Infinity
  for (const t of GANGWON_TUNNELS) {
    const d = Math.min(
      haversineM(point, { lat: t.startLat, lng: t.startLng }),
      haversineM(point, { lat: t.endLat, lng: t.endLng }),
    )
    if (d < bestD) { bestD = d; best = t }
  }
  return bestD <= maxM ? best : null
}

// 터널 객체(mock.js 큐레이션이든 실도로 경로 추적 결과든)의 진입·진출 좌표를 구할 수 있는 가장
// 정확한 소스에서 뽑아낸다:
//   ① 이미 실도로 경로 구간(tunnel.path, Valhalla trace_attributes로 검증된 좌표)이 있으면 그 양 끝
//   ② tunnel 객체 자체에 startLat/startLng가 있으면(이 데이터셋으로 이미 보강된 경우) 그대로
//   ③ 이름으로 이 데이터셋에서 찾는다
// 셋 다 실패하면 null — 호출부가 지오코딩(장소명 검색) 폴백을 쓰도록 한다.
export function resolveTunnelEndpoints(tunnel) {
  if (!tunnel) return null
  if (tunnel.path?.length >= 2) {
    const [sLat, sLng] = tunnel.path[0]
    const [eLat, eLng] = tunnel.path[tunnel.path.length - 1]
    return { start: { lat: sLat, lng: sLng }, end: { lat: eLat, lng: eLng } }
  }
  if (tunnel.startLat != null && tunnel.startLng != null) {
    return {
      start: { lat: tunnel.startLat, lng: tunnel.startLng },
      end: tunnel.endLat != null ? { lat: tunnel.endLat, lng: tunnel.endLng } : { lat: tunnel.startLat, lng: tunnel.startLng },
    }
  }
  const found = findGangwonTunnel(tunnel.name)
  if (!found) return null
  return { start: { lat: found.startLat, lng: found.startLng }, end: { lat: found.endLat, lng: found.endLng }, meta: found }
}
