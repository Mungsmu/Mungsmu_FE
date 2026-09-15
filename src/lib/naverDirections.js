// 네이버클라우드플랫폼(NCP) Maps "Directions 5" API로 실제 도로 기반 거리·시간·경로를 구한다.
//
// 브라우저가 NCP를 직접 호출하지 않는다 — 두 가지 이유:
// 1) NCP가 이 요청에 CORS 허용 헤더를 안 줘서 브라우저 프리플라이트에서 막힌다.
// 2) 시크릿 키(CLIENT_SECRET)를 클라이언트 코드에 두면(VITE_ 접두사 등) 번들에 그대로 박혀
//    개발자도구에서 노출된다.
// 그래서 같은 origin의 /api/naver-directions(프록시)만 호출하고, 실제 NCP 호출·시크릿 첨부는
// 서버 쪽에서만 한다.
// - 로컬 개발: vite.config.js의 dev 서버 미들웨어가 이 경로를 처리한다.
// - 프로덕션: 배포 방식이 아직 정해지지 않았다. 정적 호스팅이 아니라 서버/서버리스 함수가
//   있는 환경으로 배포할 경우, 그 런타임에도 동일한 프록시를 별도로 구현해야 이 경로가 동작한다.
const PROXY_ENDPOINT = '/api/naver-directions'

// 실제 도로 기반 주행 경로 조회. origin/dest는 {lat, lng} 형태(카카오 지오코딩 결과와 동일 shape).
// 프록시 호출이 실패(네트워크 오류·서버에 키 미설정·경로 없음 등)하면 null을 반환해서
// 호출부가 직선거리 추정 방식으로 조용히 폴백하도록 한다.
export async function getDrivingRoute(origin, dest, option = 'trafast') {
  try {
    const url = `${PROXY_ENDPOINT}?start=${origin.lng},${origin.lat}&goal=${dest.lng},${dest.lat}&option=${option}`
    const res = await fetch(url)
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
