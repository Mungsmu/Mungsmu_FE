import { TUNNELS, REGIONS } from './mock'
import { resolvePlace, haversineM, hasKakaoKey } from '../lib/kakaoRest'

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

// 실측(카카오 REST 지오코딩 + 실제 직선거리 보정) 기반 경로 결과 계산.
// REST 키가 없거나 지오코딩이 실패하면 null을 반환해서 호출부가 MOCK_RESULT로 대체하도록 한다.
export async function computeRouteResult(originStr, destStr) {
  if (!hasKakaoKey) return null
  try {
    const [originPlace, destPlace] = await Promise.all([resolvePlace(originStr), resolvePlace(destStr)])
    if (!originPlace || !destPlace) return null
    const straightKm = haversineM(originPlace, destPlace) / 1000
    const region = REGIONS.find(r => destPlace.address.includes(r.name) || destPlace.name.includes(r.name) || destStr.includes(r.name))
    const tunnels = region ? TUNNELS.filter(t => t.region === region.name) : []
    const avoidKm = Math.max(1, Math.round(straightKm * 1.3))
    const shortestKm = Math.max(1, Math.round(straightKm * 1.15))
    return {
      avoid: {
        durationMin: Math.max(5, Math.round((avoidKm / 62) * 60)), distanceKm: avoidKm, tunnelCount: 0,
        waypoints: [`${originStr} 출발`, `${destStr} 방면 국도·해안도로 경유`],
      },
      shortest: {
        durationMin: Math.max(5, Math.round((shortestKm / 78) * 60)), distanceKm: shortestKm, tunnelCount: tunnels.length,
        tunnelNames: tunnels.map(t => t.name), tunnels,
      },
    }
  } catch {
    return null
  }
}
