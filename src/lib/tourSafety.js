// 관광지 "안심 지수" — 출발지에서 그 관광지까지 가는 실제 최단 경로가 터널에 얼마나 노출되는지를
// 0~100 점수로 환산한다. 공황장애가 있는 운전자에게는 "거기 뭐가 있나"보다 "가는 길이 견딜 만한가"가
// 먼저라, 관광지 추천을 거리·인기순이 아니라 이 점수 순으로 보여주기 위한 값이다.
//
// 계산은 앱의 다른 기능과 같은 실측 파이프라인을 쓴다 — Valhalla로 실도로 최단 경로를 구하고,
// trace_attributes(OSM tunnel 태그)로 그 경로가 실제로 지나는 터널 구간을 뽑는다. 추정값이 아니다.
// 호흡 가이드를 띄울 만한 길이(COMPANION_MIN_M=500m) 이상인 터널만 센다 — 그보다 짧은 지하차도는
// 순식간에 지나가 불안 요인으로 보기 어렵다.
import { fetchRoute, traceTunnels } from './route.js'
import { COMPANION_MIN_M, tunnelDisplayName } from './tunnelGeo.js'

// 감점 기준: 총 터널 길이가 지배적이고(갇혀 있는 시간), 터널 개수는 보조로 본다(진입 스트레스의 반복).
// 10km를 통째로 지나면 길이 감점이 상한(55점)에 걸리고, 10개를 지나면 개수 감점이 상한(25점)에 걸린다.
const LEN_PENALTY_PER_KM = 5.5
const LEN_PENALTY_MAX = 55
const CNT_PENALTY_EACH = 2.5
const CNT_PENALTY_MAX = 25

export function safetyGrade(score) {
  if (score >= 85) return { key: 'green', label: '안심', color: '#2E7D4F', bg: '#E8F5EC' }
  if (score >= 65) return { key: 'amber', label: '보통', color: '#9A6B0F', bg: '#FCF3E2' }
  return { key: 'red', label: '주의', color: '#A53E33', bg: '#FBEBE9' }
}

export function scoreFromTunnels(totalTunnelM, tunnelCount) {
  const lenPenalty = Math.min(LEN_PENALTY_MAX, (totalTunnelM / 1000) * LEN_PENALTY_PER_KM)
  const cntPenalty = Math.min(CNT_PENALTY_MAX, tunnelCount * CNT_PENALTY_EACH)
  return Math.max(0, Math.round(100 - lenPenalty - cntPenalty))
}

// 출발지 좌표가 달라지면 점수도 달라지므로 캐시 키에 출발지를 포함한다(소수 3자리 ≈ 100m 격자).
const cache = new Map()
const keyOf = (origin, spot) => `${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}|${spot.id}`

/**
 * 관광지 한 곳의 안심 지수를 계산한다.
 * @returns { score, grade, tunnelCount, totalTunnelM, longest, distanceKm, durationMin } 또는 실패 시 null
 */
export async function evaluateSpot(origin, spot) {
  const key = keyOf(origin, spot)
  if (cache.has(key)) return cache.get(key)

  const route = await fetchRoute([origin, { lat: spot.lat, lng: spot.lng }])
  if (!route) { cache.set(key, null); return null }

  // 터널 추적이 실패해도(공개 서버 일시 오류 등) 거리·시간은 보여줄 수 있게 0개로 처리한다.
  const segs = (await traceTunnels(route.shapes)) ?? []
  const tunnels = segs.filter(s => s.lengthM >= COMPANION_MIN_M)
  const totalTunnelM = tunnels.reduce((a, s) => a + s.lengthM, 0)
  const longestSeg = tunnels.reduce((a, s) => (!a || s.lengthM > a.lengthM ? s : a), null)
  const score = scoreFromTunnels(totalTunnelM, tunnels.length)

  const result = {
    score,
    grade: safetyGrade(score),
    tunnelCount: tunnels.length,
    totalTunnelM,
    longest: longestSeg ? { name: tunnelDisplayName(longestSeg), lengthM: longestSeg.lengthM } : null,
    distanceKm: route.distanceKm,
    durationMin: route.durationMin,
  }
  cache.set(key, result)
  return result
}

/**
 * 여러 관광지를 순차적으로 평가하면서 끝나는 대로 하나씩 돌려준다(onResult).
 * 공개 Valhalla 데모 서버를 쓰므로 동시 요청 수를 제한한다 — 한꺼번에 36곳을 던지면 429가 난다.
 * @returns 중단 함수 — 화면을 벗어나면 호출해서 남은 요청을 멈춘다.
 */
export function evaluateSpots(origin, spots, { concurrency = 3, onResult } = {}) {
  let cancelled = false
  let cursor = 0

  const worker = async () => {
    while (!cancelled && cursor < spots.length) {
      const spot = spots[cursor++]
      try {
        const res = await evaluateSpot(origin, spot)
        if (!cancelled) onResult?.(spot.id, res)
      } catch {
        if (!cancelled) onResult?.(spot.id, null)
      }
    }
  }
  for (let i = 0; i < concurrency; i++) worker()

  return () => { cancelled = true }
}
