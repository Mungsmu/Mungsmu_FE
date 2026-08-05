// 카카오 Local REST API로 장소 검색·지오코딩 (모바일은 JS SDK가 아니라 REST API 키를 쓴다).
// 키가 없으면 null을 반환해서 호출부가 목업 값으로 조용히 대체하도록 한다.
const KAKAO_REST_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_KEY

export async function keywordSearch(query) {
  if (!KAKAO_REST_KEY || !query) return []
  try {
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.documents ?? []
  } catch {
    return []
  }
}

const placeCache = new Map()

export async function resolvePlace(query) {
  if (!query) return null
  if (placeCache.has(query)) return placeCache.get(query)
  const words = query.trim().split(/\s+/)
  let hit = null
  for (let n = words.length; n > 0 && !hit; n--) {
    const data = await keywordSearch(words.slice(0, n).join(' '))
    hit = data[0]
  }
  const result = hit
    ? { lat: Number(hit.y), lng: Number(hit.x), name: hit.place_name, address: hit.road_address_name || hit.address_name || '' }
    : null
  placeCache.set(query, result)
  return result
}

export function haversineM(a, b) {
  const R = 6371000
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export const hasKakaoKey = !!KAKAO_REST_KEY
