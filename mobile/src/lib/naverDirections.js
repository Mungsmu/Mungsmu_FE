// 네이버클라우드플랫폼(NCP) Maps "Directions 5" API로 실제 도로 기반 거리·시간·경로를 구한다.
// (모바일은 JS SDK가 아니라 REST 호출이라 웹의 src/lib/naverDirections.js와 로직은 같고
// 키를 process.env로 읽는 부분만 다르다 — mobile/src/lib/kakaoRest.js와 같은 패턴.)
// 콘솔에서 발급받은 키를 .env의 EXPO_PUBLIC_NAVER_MAPS_CLIENT_ID / EXPO_PUBLIC_NAVER_MAPS_CLIENT_SECRET에
// 넣어두면 자동으로 사용됩니다.
//
// 주의: 흔히 알려진 naveropenapi.apigw.ntruss.com 엔드포인트는 이 키로 401 Permission Denied가
// 났다 — 실제 호출로 확인 후 신규 게이트웨이인 maps.apigw.ntruss.com으로 바꿨다.
const CLIENT_ID = process.env.EXPO_PUBLIC_NAVER_MAPS_CLIENT_ID
const CLIENT_SECRET = process.env.EXPO_PUBLIC_NAVER_MAPS_CLIENT_SECRET
const ENDPOINT = 'https://maps.apigw.ntruss.com/map-direction/v1/driving'

export const hasNaverKey = !!CLIENT_ID && !!CLIENT_SECRET

// 실제 도로 기반 주행 경로 조회. origin/dest는 {lat, lng} 형태(카카오 지오코딩 결과와 동일 shape).
// 키가 없거나 API 호출/파싱이 실패하면 null을 반환해서 호출부가 직선거리 추정 방식으로
// 조용히 폴백하도록 한다.
export async function getDrivingRoute(origin, dest, option = 'trafast') {
  if (!CLIENT_ID || !CLIENT_SECRET) return null
  try {
    const url = `${ENDPOINT}?start=${origin.lng},${origin.lat}&goal=${dest.lng},${dest.lat}&option=${option}`
    const res = await fetch(url, {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': CLIENT_ID,
        'X-NCP-APIGW-API-KEY': CLIENT_SECRET,
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    const route = data?.route?.[option]?.[0]
    if (!route?.summary || !route?.path?.length) return null

    return {
      distanceKm: route.summary.distance / 1000,
      durationMin: route.summary.duration / 60000, // API는 duration을 ms 단위로 준다
      tollFare: route.summary.tollFare,
      fuelPrice: route.summary.fuelPrice,
      path: route.path.map(([lng, lat]) => ({ lat, lng })), // API는 [lng, lat] 순서로 준다
    }
  } catch {
    return null
  }
}
