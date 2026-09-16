// 장소 검색·지오코딩 (모바일은 지도 JS SDK가 아니라 REST API를 쓴다).
//
// 1순위는 카카오 Local REST API다 — 한국 POI 정확도가 가장 좋다.
// 다만 REST 키가 없으면(웹으로 띄워보는 경우처럼 아직 키를 안 넣었을 때) 앱 전체가 목업 값으로
// 떨어져 실제 경로·터널 기능을 전혀 확인할 수 없었다. 그래서 키가 없을 때는 Photon(Komoot이
// 운영하는 OSM 기반 지오코더)으로 대체한다 — 키가 필요 없고 브라우저에서 바로 호출된다.
// (Nominatim도 검토했지만 브라우저 요청을 차단해 CORS 에러가 나서 쓸 수 없었다.)
const KAKAO_REST_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_KEY

const PHOTON = 'https://photon.komoot.io'
const KR_BBOX = '124,33,132,39' // 대한민국 대략 경계(minLon,minLat,maxLon,maxLat) — 동명 지명이 해외로 잡히는 걸 막는다

// 공개 데모 서버라 과도한 연속 호출을 피하려고 요청을 짧은 간격으로 줄 세운다.
let photonGate = Promise.resolve()
function photonTurn() {
  const mine = photonGate.then(() => new Promise(r => setTimeout(r, 250)))
  photonGate = mine
  return mine
}

// Photon 결과 properties → "강원특별자치도 속초시 청호동" 형태의 주소 문자열
function photonAddress(pr = {}) {
  return [pr.state, pr.city ?? pr.county, pr.district ?? pr.locality, pr.street, pr.housenumber]
    .filter(Boolean).join(' ') || null
}

async function photonSearch(query) {
  try {
    await photonTurn()
    const res = await fetch(`${PHOTON}/api/?q=${encodeURIComponent(query)}&limit=1&bbox=${KR_BBOX}`)
    if (!res.ok) return null
    const hit = (await res.json())?.features?.[0]
    if (!hit?.geometry?.coordinates) return null
    const [lng, lat] = hit.geometry.coordinates
    return {
      lat: Number(lat), lng: Number(lng),
      name: hit.properties?.name ?? query,
      address: photonAddress(hit.properties) ?? '',
    }
  } catch {
    return null
  }
}

// 입력창 자동완성용 후보 목록. 카카오 키가 없을 때 keywordSearch를 대신한다 —
// 반환 형태는 카카오 문서와 같게 맞춰서 호출부가 분기하지 않아도 되게 한다.
async function photonSuggest(query, limit = 6) {
  try {
    await photonTurn()
    const res = await fetch(`${PHOTON}/api/?q=${encodeURIComponent(query)}&limit=${limit}&bbox=${KR_BBOX}`)
    if (!res.ok) return []
    const feats = (await res.json())?.features ?? []
    return feats
      .filter(f => f.geometry?.coordinates && f.properties?.name)
      .map((f, i) => {
        const [lng, lat] = f.geometry.coordinates
        return {
          id: `photon-${f.properties.osm_id ?? i}`,
          place_name: f.properties.name,
          road_address_name: '',
          address_name: photonAddress(f.properties) ?? '',
          x: String(lng), y: String(lat),
        }
      })
  } catch {
    return []
  }
}

async function photonReverse({ lat, lng }) {
  try {
    await photonTurn()
    const res = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lng}`)
    if (!res.ok) return null
    return photonAddress((await res.json())?.features?.[0]?.properties)
  } catch {
    return null
  }
}

// 주소·행정구역명 → 좌표 (카카오 Local 주소 검색). 해당 없으면 null.
export async function addressSearch(query) {
  if (!KAKAO_REST_KEY || !query?.trim()) return null
  try {
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
    })
    if (!res.ok) return null
    const hit = (await res.json()).documents?.[0]
    if (!hit) return null
    return { lat: Number(hit.y), lng: Number(hit.x), name: hit.address_name, address: hit.address_name }
  } catch {
    return null
  }
}

export async function keywordSearch(query) {
  if (!query?.trim()) return []
  // 키가 없으면 입력창 자동완성이 통째로 죽어 어디를 고르는지 알 수 없었다 — Photon으로 대신한다.
  if (!KAKAO_REST_KEY) return photonSuggest(query.trim())
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

  let result = null
  if (KAKAO_REST_KEY) {
    // 주소 검색을 먼저 시도한다. 키워드 검색은 인기 POI 순으로 결과를 주기 때문에 "홍천" 같은
    // 지명이 홍천군이 아니라 비발디파크 오션월드로 잡혀 출발지가 수십 km 어긋났다(실측 확인).
    result = await addressSearch(query.trim())
    if (!result) {
      // 정확한 이름으로 결과가 없으면(예: "청초호 수변공원"은 POI로 안 잡히지만 "청초호"는 잡힘)
      // 뒤 단어부터 하나씩 줄여가며 재시도한다.
      const words = query.trim().split(/\s+/)
      let hit = null
      for (let n = words.length; n > 0 && !hit; n--) {
        const data = await keywordSearch(words.slice(0, n).join(' '))
        hit = data[0]
      }
      result = hit
        ? { lat: Number(hit.y), lng: Number(hit.x), name: hit.place_name, address: hit.road_address_name || hit.address_name || '' }
        : null
    }
  } else {
    result = await photonSearch(query.trim())
  }
  placeCache.set(query, result)
  return result
}

// 좌표 → 주소 문자열. "현재 위치에서 출발" 버튼이 GPS로 얻은 좌표를 사람이 읽을 수 있는
// 주소로 보여주는 데 쓴다. 실패하면 null — 호출부가 "현재 위치"라는 라벨로 대체한다.
export async function reverseGeocode({ lat, lng }) {
  if (!KAKAO_REST_KEY) return photonReverse({ lat, lng })
  try {
    const res = await fetch(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    const hit = data.documents?.[0]
    if (!hit) return null
    return hit.road_address?.address_name || hit.address?.address_name || null
  } catch {
    return null
  }
}

export function haversineM(a, b) {
  const R = 6371000
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// 장소 검색이 가능한지 — 카카오 키가 있거나, 없으면 Photon 폴백이 있으므로 항상 true다.
// (이름은 기존 호출부 호환을 위해 유지한다. 지도 SDK 키 유무와는 별개다.)
export const hasKakaoKey = true
// 실제로 카카오 REST 키를 쓰고 있는지 — 정확도 안내 문구 등에 쓸 수 있다.
export const usingKakaoGeocoder = !!KAKAO_REST_KEY
