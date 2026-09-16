// 카카오맵 JS SDK를 한 번만 로드해서 재사용하기 위한 유틸.
// 앱 키는 카카오 개발자 콘솔(내 애플리케이션 > 앱 키 > JavaScript 키)에서 발급받아
// .env.local의 VITE_KAKAO_MAP_KEY에 넣어두면 자동으로 사용됩니다.
let loadPromise = null

export function loadKakaoMaps(appkey) {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.kakao?.maps) return Promise.resolve(window.kakao)
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appkey}&autoload=false&libraries=services`
    script.onload = () => window.kakao.maps.load(() => resolve(window.kakao))
    script.onerror = () => { loadPromise = null; reject(new Error('카카오맵 SDK 로드 실패 (앱 키·도메인 등록을 확인하세요)')) }
    document.head.appendChild(script)
  })
  return loadPromise
}

// 키워드로 실제 장소를 검색 (카카오맵 Places API). 실패/결과없음이면 빈 배열.
export function keywordSearch(kakao, keyword) {
  return new Promise(resolve => {
    if (!keyword?.trim()) { resolve([]); return }
    const places = new kakao.maps.services.Places()
    places.keywordSearch(keyword, (data, status) => {
      resolve(status === kakao.maps.services.Status.OK ? data : [])
    })
  })
}

// 주소·행정구역명 → 좌표 (카카오맵 Geocoder). 해당 없으면 null.
export function addressSearch(kakao, query) {
  return new Promise(resolve => {
    if (!query?.trim()) { resolve(null); return }
    const geocoder = new kakao.maps.services.Geocoder()
    geocoder.addressSearch(query, (data, status) => {
      if (status !== kakao.maps.services.Status.OK || !data[0]) { resolve(null); return }
      resolve({ lat: Number(data[0].y), lng: Number(data[0].x), name: data[0].address_name, address: data[0].address_name })
    })
  })
}

// 장소명·주소 → 좌표. 같은 이름을 반복 검색하지 않도록 모듈 전역 캐시.
//
// 주소 검색을 먼저 시도한다. 키워드 검색은 인기 POI 순으로 결과를 주기 때문에 "홍천" 같은
// 지명을 넣으면 홍천군이 아니라 비발디파크 오션월드가 1순위로 잡혀 출발지가 수십 km 어긋나고,
// 그 결과 전혀 다른 경로가 나왔다(실측 확인 — 홍천→속초가 서울 근교 터널을 지나는 경로로 잡힘).
// 주소로 안 잡히는 장소명("속초 해수욕장" 등)만 키워드 검색으로 넘긴다.
const placeCache = new Map()
export async function resolvePlace(kakao, query) {
  if (!query) return null
  if (placeCache.has(query)) return placeCache.get(query)

  let result = await addressSearch(kakao, query.trim())
  if (!result) {
    // 정확한 이름으로 결과가 없으면(예: "청초호 수변공원"은 POI로 안 잡히지만 "청초호"는 잡힘)
    // 뒤 단어부터 하나씩 줄여가며 재시도한다.
    const words = query.trim().split(/\s+/)
    let hit = null
    for (let n = words.length; n > 0 && !hit; n--) {
      const data = await keywordSearch(kakao, words.slice(0, n).join(' '))
      hit = data[0]
    }
    result = hit ? { lat: Number(hit.y), lng: Number(hit.x), name: hit.place_name, address: hit.road_address_name || hit.address_name || '' } : null
  }
  placeCache.set(query, result)
  return result
}

// 두 좌표 사이의 직선 거리 (m). 실도로 거리는 아니지만 실시간 GPS 진행률·근접 판정에 사용.
export function haversineM(a, b) {
  const R = 6371000
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// 좌표 → 주소 문자열 (현재 위치를 사람이 읽을 수 있는 주소로 표시할 때 사용)
export function coordToAddress(kakao, lat, lng) {
  return new Promise(resolve => {
    const geocoder = new kakao.maps.services.Geocoder()
    geocoder.coord2Address(lng, lat, (result, status) => {
      if (status !== kakao.maps.services.Status.OK || !result[0]) { resolve(null); return }
      const addr = result[0].road_address?.address_name || result[0].address?.address_name
      resolve(addr || null)
    })
  })
}
