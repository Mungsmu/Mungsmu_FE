// 백엔드 안심 코스 API — GET /api/tour/courses (로그인 불필요). /api는 dev 중 vite 프록시가
// 배포 백엔드로 전달한다(vite.config.js). 응답 형식은 mock.js의 COURSES와 필드가 동일해서
// 화면 쪽 코드는 그대로 두고 데이터 출처만 바꾼다.

/**
 * region을 넘기면 그 시군구만(약 1초, 권장), 생략하면 18개 시군구 전체(콜드 상태 약 15초)를 가져온다.
 * 실패·결과 없음은 전부 빈 배열로 처리 — 호출부는 로딩만 신경 쓰면 된다.
 */
export async function fetchSafeCourses({ region, numOfRows } = {}) {
  const params = new URLSearchParams()
  if (region) params.set('region', region)
  if (numOfRows) params.set('numOfRows', String(numOfRows))
  const qs = params.toString()

  let res
  try {
    res = await fetch(`/api/tour/courses${qs ? `?${qs}` : ''}`)
  } catch {
    return []
  }
  const payload = await res.json().catch(() => null)
  if (!res.ok || payload?.success === false) return []
  return payload?.data ?? []
}
