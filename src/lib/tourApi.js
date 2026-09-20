// 백엔드 안심 코스 API — GET /api/tour/courses (로그인 불필요). auth.js의 request()를 거쳐야
// 배포 환경에서 VITE_API_BASE_URL이 붙는다(dev는 vite 프록시). 응답 형식은 mock.js의 COURSES와
// 필드가 동일해서 화면 쪽 코드는 그대로 두고 데이터 출처만 바꾼다.
import { request } from './auth.js'

/**
 * region을 넘기면 그 시군구만(약 1초, 권장), 생략하면 18개 시군구 전체(콜드 상태 약 15초)를 가져온다.
 * 실패·결과 없음은 전부 빈 배열로 처리 — 호출부는 로딩만 신경 쓰면 된다.
 */
export async function fetchSafeCourses({ region, numOfRows } = {}) {
  const params = new URLSearchParams()
  if (region) params.set('region', region)
  if (numOfRows) params.set('numOfRows', String(numOfRows))
  const qs = params.toString()

  try {
    const payload = await request(`/api/tour/courses${qs ? `?${qs}` : ''}`)
    return payload?.data ?? []
  } catch {
    return []
  }
}
