import { TUNNELS, REGIONS } from './mock'
import { resolvePlace, haversineM, hasKakaoKey } from '../lib/kakaoRest'
import { fetchRoute, traceTunnels } from '../lib/route'

export const RECENT = ['속초 해수욕장', '양양 낙산사', '강릉 경포해변']
export const DEFAULT_TUNNEL = TUNNELS.find(t => t.name === '미시령터널')

export const MOCK_RESULT = {
  avoid: {
    durationMin: 192, distanceKm: 238, tunnelCount: 0,
    waypoints: ['영동고속 → 7번 국도 진입', '동해안 해안 라인 경유'],
  },
  shortest: {
    durationMin: 170, distanceKm: 216, tunnelCount: 4,
    tunnelNames: ['대관령1터널', '둔내터널'],
    tunnels: [TUNNELS.find(t => t.name === '대관령1터널'), TUNNELS.find(t => t.name === '둔내터널')],
  },
}

// 출발지·목적지를 실좌표로 바꾼 뒤 Valhalla로 실도로 경로 2개(최단 / 터널 완전 회피)를 계산한다.
// 거리·소요시간은 실제 경로 기준. 최단 루트가 실제로 지나는 터널은 trace_attributes로 실측.
// (웹의 src/pages/RoutePage.jsx computeRouteResult()와 동일 로직 — 카카오 REST 지오코딩만 다르다.)
// 카카오 REST 키가 없거나 지오코딩이 실패하면 null을 반환해서 호출부가 MOCK_RESULT로 대체하도록 한다.
export async function computeRouteResult(originStr, destStr) {
  if (!hasKakaoKey) return null
  try {
    const [originPlace, destPlace] = await Promise.all([resolvePlace(originStr), resolvePlace(destStr)])
    if (!originPlace || !destPlace) return null

    const straightKm = haversineM(originPlace, destPlace) / 1000
    const region = REGIONS.find(r => destPlace.address.includes(r.name) || destPlace.name.includes(r.name) || destStr.includes(r.name))
    let tunnels = region ? TUNNELS.filter(t => t.region === region.name) : [] // 실측 실패 시 폴백

    const [shortestRoute, avoidRoute] = await Promise.all([
      fetchRoute([originPlace, destPlace]),
      // 터널 회피 루트 = 터널을 아예 지나지 않는 경로 (옛 고갯길 등으로 우회)
      fetchRoute([originPlace, destPlace], { excludeTunnels: true }),
    ])

    // 최단 루트가 실제로 지나는 터널을 실측 (500m 이상 장대터널만 집계, 짧은 지하차도 제외)
    const traced = shortestRoute ? await traceTunnels(shortestRoute.shapes) : null
    if (traced) {
      tunnels = traced.filter(s => s.lengthM >= 500).map((s, i) => {
        // 이름 우선순위: '~터널' > 도로명 > 노선번호(예: "60" → "60번 도로 터널")
        const name = s.names.find(n => n.includes('터널'))
          ?? (s.names.find(n => !/^\d+$/.test(n)) ? `${s.names.find(n => !/^\d+$/.test(n))} 터널` : null)
          ?? (s.names[0] ? `${s.names[0]}번 도로 터널` : '터널 구간')
        const known = TUNNELS.find(t => s.names.includes(t.name) || t.name === name)
        // path 상의 실제 진입 좌표 — 지도에 터널 이름으로 재검색하는 대신 이 좌표를 바로 마커에 쓸 수 있다.
        // 구간 좌표(path)도 같이 잘라서 붙여두면, 동반 모드가 터널 이름을 다시 지오코딩해서 도로를
        // 재검증하는 불안정한 과정 없이 이 실측 구간을 그대로 주행 카메라 배경으로 쓸 수 있다.
        const [lat, lng] = shortestRoute.path[Math.min(s.begin, shortestRoute.path.length - 1)] ?? []
        const BUFFER_PTS = 6
        const startIdx = Math.max(0, s.begin - BUFFER_PTS)
        const endIdx = Math.min(shortestRoute.path.length - 1, s.end + BUFFER_PTS)
        const path = shortestRoute.path.slice(startIdx, endIdx + 1)
        return known ? { ...known, lat, lng, path } : { id: `trace-${i}`, name, lengthM: s.lengthM, diff: null, lat, lng, path }
      })
    }

    const avoidKm = avoidRoute?.distanceKm ?? Math.max(1, Math.round(straightKm * 1.3))
    const shortestKm = shortestRoute?.distanceKm ?? Math.max(1, Math.round(straightKm * 1.15))

    return {
      avoid: {
        durationMin: avoidRoute?.durationMin ?? Math.max(5, Math.round((avoidKm / 62) * 60)),
        distanceKm: avoidKm, tunnelCount: 0,
        waypoints: [`${originStr} 출발`, `${destStr} 방면 국도·해안도로 경유`],
        path: avoidRoute?.path, maneuvers: avoidRoute?.maneuvers, origin: originPlace, dest: destPlace,
      },
      shortest: {
        durationMin: shortestRoute?.durationMin ?? Math.max(5, Math.round((shortestKm / 78) * 60)),
        distanceKm: shortestKm,
        tunnelCount: tunnels.length, tunnelNames: tunnels.map(t => t.name), tunnels,
        path: shortestRoute?.path, maneuvers: shortestRoute?.maneuvers, origin: originPlace, dest: destPlace,
      },
    }
  } catch {
    return null
  }
}
