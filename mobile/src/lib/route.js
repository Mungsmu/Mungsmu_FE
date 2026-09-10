// Valhalla(오픈소스 라우팅 엔진) 클라이언트 — 실도로 경로 계산.
// 공개 데모 서버(FOSSGIS)를 사용하므로 키가 필요 없고 앱에서 직접 호출 가능
// (모바일은 브라우저가 아니라 CORS 자체가 적용되지 않아 웹보다도 더 간단히 쓸 수 있다).
// 웹의 src/lib/route.js와 로직이 완전히 동일 — 순수 fetch라 플랫폼 차이가 없다.
// 데모/발표용으로는 충분하지만 상용 트래픽은 자체 호스팅(Docker + 한국 OSM)으로 전환할 것.
const VALHALLA_URL = 'https://valhalla1.openstreetmap.de/route'

// Valhalla 응답의 shape은 polyline6 인코딩 문자열 → [[lat, lng], ...] 로 디코딩
function decodePolyline6(str) {
  const pts = []
  let i = 0, lat = 0, lng = 0
  while (i < str.length) {
    let b, shift = 0, result = 0
    do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : (result >> 1)
    shift = 0; result = 0
    do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : (result >> 1)
    pts.push([lat / 1e6, lng / 1e6])
  }
  return pts
}

// Valhalla maneuver type → 한국어 안내문 / 화살표 (https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/)
const MANEUVER_KO = {
  1: '출발', 2: '출발', 3: '출발',
  4: '목적지 도착', 5: '목적지 도착', 6: '목적지 도착',
  8: '직진', 9: '우측 방향', 10: '우회전', 11: '급우회전', 12: '유턴', 13: '유턴',
  14: '급좌회전', 15: '좌회전', 16: '좌측 방향',
  17: '램프 진입', 18: '우측 램프 진입', 19: '좌측 램프 진입',
  20: '우측 출구로 진출', 21: '좌측 출구로 진출',
  22: '직진', 23: '우측 차로 유지', 24: '좌측 차로 유지', 25: '본선 합류',
  26: '회전교차로 진입', 27: '회전교차로 통과', 28: '페리 탑승', 29: '페리 하차',
  37: '우측으로 합류', 38: '좌측으로 합류',
}
const MANEUVER_ARROW = {
  1: '🚩', 2: '🚩', 3: '🚩', 4: '🏁', 5: '🏁', 6: '🏁',
  9: '↗', 10: '→', 11: '↘', 12: '↩', 13: '↩', 14: '↙', 15: '←', 16: '↖',
  17: '↗', 18: '↗', 19: '↖', 20: '↗', 21: '↖', 23: '↗', 24: '↖',
  26: '⟳', 27: '⟳',
}
export function maneuverLabel(m) { return MANEUVER_KO[m.type] ?? '직진' }
export function maneuverArrow(m) { return MANEUVER_ARROW[m.type] ?? '↑' }

// 경로 좌표 배열의 누적 이동거리(m) — [0, d1, d1+d2, ...]. 시뮬레이션·남은거리 계산에 사용.
export function cumulativeDistM(path) {
  const R = 6371000, toRad = d => (d * Math.PI) / 180
  const cum = [0]
  for (let i = 1; i < path.length; i++) {
    const [la1, lo1] = path[i - 1], [la2, lo2] = path[i]
    const dLat = toRad(la2 - la1), dLng = toRad(lo2 - lo1)
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2
    cum.push(cum[i - 1] + 2 * R * Math.asin(Math.sqrt(s)))
  }
  return cum
}

const routeCache = new Map()

/**
 * 실도로 경로 계산.
 * @param points [{lat, lng}, ...] 출발지→(경유지)→목적지
 * @param opts.excludeTunnels true면 터널을 완전히 배제한 경로 (옛 고갯길 등으로 우회 — 시간이 크게 늘 수 있음)
 * @param opts.avoidHighways true면 고속도로 회피
 * @param opts.excludePolygons [[[lng,lat],...], ...] 통과 금지 영역 (특정 터널만 골라 회피할 때)
 * @returns { path: [[lat,lng],...], distanceKm, durationMin } 또는 실패 시 null
 */
export async function fetchRoute(points, { avoidHighways = false, excludeTunnels = false, excludePolygons } = {}) {
  if (!points || points.length < 2) return null
  const key = JSON.stringify([points.map(p => [p.lat.toFixed(5), p.lng.toFixed(5)]), avoidHighways, excludeTunnels, excludePolygons])
  if (routeCache.has(key)) return routeCache.get(key)

  const body = {
    locations: points.map(p => ({ lat: p.lat, lon: p.lng })),
    costing: 'auto',
    directions_options: { units: 'kilometers' },
  }
  const auto = {}
  if (avoidHighways) auto.use_highways = 0
  if (excludeTunnels) auto.exclude_tunnels = true
  if (Object.keys(auto).length) body.costing_options = { auto }
  if (excludePolygons?.length) body.exclude_polygons = excludePolygons

  try {
    const res = await fetch(VALHALLA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok || data.error || !data.trip) { routeCache.set(key, null); return null }

    // 경로 좌표와 턴바이턴 안내를 함께 추출. maneuver의 idx는 전체 path 배열 기준 인덱스
    // (여러 leg를 이어붙일 때 앞 leg들의 좌표 수만큼 밀어서 보정)
    const path = []
    const maneuvers = []
    for (const leg of data.trip.legs) {
      const pts = decodePolyline6(leg.shape)
      for (const m of leg.maneuvers ?? []) {
        maneuvers.push({ idx: m.begin_shape_index + path.length, type: m.type, street: (m.street_names ?? []).join('·') })
      }
      path.push(...pts)
    }
    const result = {
      path,
      maneuvers,
      shapes: data.trip.legs.map(leg => leg.shape), // traceTunnels()용 원본 인코딩 좌표
      distanceKm: Math.round(data.trip.summary.length),
      durationMin: Math.round(data.trip.summary.time / 60),
    }
    routeCache.set(key, result)
    return result
  } catch {
    return null // 네트워크 실패 — 호출부에서 직선/추정치로 폴백
  }
}

/**
 * 경로가 실제로 지나는 터널 구간 목록 (Valhalla trace_attributes — OSM 터널 태그 기반).
 * @param shapes fetchRoute 결과의 shapes (leg별 인코딩 좌표)
 * @returns [{ names: string[], lengthM, begin, end }] 인접 터널 엣지를 구간으로 병합한 목록. 실패 시 null.
 *   begin/end는 해당 leg의 shape 인덱스 — 경유지 없는 단일 leg 경로에서는 fetchRoute() 결과의 path 인덱스와 그대로 일치한다.
 */
export async function traceTunnels(shapes) {
  if (!shapes?.length) return null
  try {
    const segs = []
    for (const shape of shapes) {
      const res = await fetch('https://valhalla1.openstreetmap.de/trace_attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encoded_polyline: shape, costing: 'auto', shape_match: 'edge_walk',
          filters: { attributes: ['edge.tunnel', 'edge.length', 'edge.names', 'edge.begin_shape_index', 'edge.end_shape_index'], action: 'include' },
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) return null
      // leg마다 shape 인덱스가 0부터 다시 시작하므로 병합은 leg 안에서만 한다
      const legSegs = []
      const edges = (data.edges ?? []).filter(e => e.tunnel).sort((a, b) => a.begin_shape_index - b.begin_shape_index)
      for (const e of edges) {
        const last = legSegs[legSegs.length - 1]
        if (last && e.begin_shape_index <= last.end + 2) {
          last.end = Math.max(last.end, e.end_shape_index)
          last.lengthM += (e.length ?? 0) * 1000
          ;(e.names ?? []).forEach(n => last.names.add(n))
        } else {
          legSegs.push({ begin: e.begin_shape_index, end: e.end_shape_index, lengthM: (e.length ?? 0) * 1000, names: new Set(e.names ?? []) })
        }
      }
      segs.push(...legSegs)
    }
    return segs.map(s => ({ names: [...s.names], lengthM: Math.round(s.lengthM), begin: s.begin, end: s.end }))
  } catch {
    return null
  }
}
