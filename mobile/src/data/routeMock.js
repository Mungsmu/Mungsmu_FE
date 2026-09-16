import { TUNNELS, REGIONS } from './mock'
import { resolvePlace, haversineM, hasKakaoKey } from '../lib/kakaoRest'
import { fetchRoute, traceTunnels } from '../lib/route'
import { findGangwonTunnel, nearestGangwonTunnel } from '../lib/tunnelGeo'

export const RECENT = ['속초 해수욕장', '양양 낙산사', '강릉 경포해변']
export const DEFAULT_TUNNEL = TUNNELS.find(t => t.name === '미시령터널')

export const MOCK_RESULT = {
  hasTunnel: true,
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

// 출발지·목적지를 실좌표로 바꾼 뒤 Valhalla로 실도로 경로를 계산한다. 거리·소요시간은 실제 경로
// 기준. 최단 루트가 실제로 지나는 터널은 trace_attributes로 실측하고, 실제로 지나는 터널이 하나도
// 없으면(hasTunnel: false) 회피 경로는 최단 경로와 완전히 같은 길이므로 따로 계산하지 않고 하나만
// 반환한다 — 비교할 게 없을 때 굳이 두 경로를 보여줄 필요가 없다.
// (웹의 src/pages/RoutePage.jsx computeRouteResult()와 동일 로직 — 카카오 REST 지오코딩만 다르다.)
// 카카오 REST 키가 없거나 지오코딩이 실패하면 null을 반환해서 호출부가 MOCK_RESULT로 대체하도록 한다.
// opts.originPlace: 이미 좌표를 아는 출발지(예: "현재 위치에서 출발" — GPS로 얻은 좌표는 텍스트로
// 다시 지오코딩하면 엉뚱한 곳이 나올 수 있어 이 좌표를 그대로 쓴다)가 있으면 originStr 지오코딩을 건너뛴다.
// opts.waypoints: 출발지·목적지 사이를 순서대로 경유하는 지점 이름들(안심 코스의 중간 경유지 등).
export async function computeRouteResult(originStr, destStr, { originPlace: fixedOriginPlace, waypoints: waypointStrs = [] } = {}) {
  if (!hasKakaoKey) return null
  try {
    const [originPlace, ...rest] = await Promise.all([
      fixedOriginPlace ? Promise.resolve(fixedOriginPlace) : resolvePlace(originStr),
      ...waypointStrs.map(w => resolvePlace(w)),
      resolvePlace(destStr),
    ])
    const destPlace = rest.pop()
    const waypointPlaces = rest
    if (!originPlace || !destPlace || waypointPlaces.some(p => !p)) return null
    const routePoints = [originPlace, ...waypointPlaces, destPlace]

    const straightKm = haversineM(originPlace, destPlace) / 1000
    const region = REGIONS.find(r => destPlace.address.includes(r.name) || destPlace.name.includes(r.name) || destStr.includes(r.name))
    let tunnels = region ? TUNNELS.filter(t => t.region === region.name) : [] // 실측 실패 시 폴백

    const shortestRoute = await fetchRoute(routePoints)

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
        // 큐레이션 목록(TUNNELS)에 없는 터널도 강원도 실측 데이터셋(404개)에서 찾아 난이도·규격을
        // 채운다 — 앱이 직접 큐레이션한 터널은 6개뿐이라 대부분의 실제 경로는 이 데이터셋 매칭에
        // 의존한다. OSM 도로명이 "미시령로"처럼 "터널"을 포함하지 않아 이름 매칭이 실패하는 경우가
        // 있어, 마지막 수단으로 진입 좌표와 가장 가까운 터널을 찾는다(300m 이내).
        const gw = !known
          ? (s.names.map(findGangwonTunnel).find(Boolean) ?? findGangwonTunnel(name)
            ?? (lat != null ? nearestGangwonTunnel({ lat, lng }, 300) : null))
          : null
        const BUFFER_PTS = 6
        const startIdx = Math.max(0, s.begin - BUFFER_PTS)
        const endIdx = Math.min(shortestRoute.path.length - 1, s.end + BUFFER_PTS)
        const path = shortestRoute.path.slice(startIdx, endIdx + 1)
        if (known) return { ...known, lat, lng, path }
        if (gw) return { id: gw.id, name: gw.name.replace(/\([^)]*\)\s*$/, ''), lengthM: s.lengthM, diff: gw.diff, lanes: gw.lanes, heightM: gw.heightM, lat, lng, path }
        return { id: `trace-${i}`, name, lengthM: s.lengthM, diff: null, lat, lng, path }
      })
    }

    const shortestKm = shortestRoute?.distanceKm ?? Math.max(1, Math.round(straightKm * 1.15))
    const shortest = {
      durationMin: shortestRoute?.durationMin ?? Math.max(5, Math.round((shortestKm / 78) * 60)),
      distanceKm: shortestKm,
      tunnelCount: tunnels.length, tunnelNames: tunnels.map(t => t.name), tunnels,
      // shapes를 함께 넘겨야 내비게이션 화면이 이 경로의 터널 구간을 다시 실측할 수 있다
      path: shortestRoute?.path, maneuvers: shortestRoute?.maneuvers, shapes: shortestRoute?.shapes, origin: originPlace, dest: destPlace,
    }

    const hasTunnel = tunnels.length > 0
    if (!hasTunnel) {
      // 실제로 지나는 터널이 없으면 회피 경로도 최단 경로와 완전히 같다 — API를 한 번 더 부르지
      // 않고, 비교 화면 없이 이 경로 하나만 보여준다.
      return {
        hasTunnel: false,
        avoid: { ...shortest, tunnelCount: 0, tunnelNames: [], tunnels: [], waypoints: [`${originStr} 출발`, `${destStr} 도착`] },
        shortest,
      }
    }

    // 터널 회피 루트 = 터널을 아예 지나지 않는 경로 (옛 고갯길 등으로 우회) — 실제로 지나는 터널이
    // 있을 때만 계산한다.
    const avoidRoute = await fetchRoute(routePoints, { excludeTunnels: true })
    const avoidKm = avoidRoute?.distanceKm ?? Math.max(1, Math.round(straightKm * 1.3))

    return {
      hasTunnel: true,
      avoid: {
        durationMin: avoidRoute?.durationMin ?? Math.max(5, Math.round((avoidKm / 62) * 60)),
        distanceKm: avoidKm, tunnelCount: 0,
        waypoints: [`${originStr} 출발`, `${destStr} 방면 국도·해안도로 경유`],
        path: avoidRoute?.path, maneuvers: avoidRoute?.maneuvers, shapes: avoidRoute?.shapes, origin: originPlace, dest: destPlace,
      },
      shortest,
    }
  } catch {
    return null
  }
}
