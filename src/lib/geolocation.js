// 위치 조회 — 기본 정확도 단발 요청. enableHighAccuracy를 강제하거나 watchPosition으로 계속
// 재조회하는 방식을 시도해봤지만, 맥은 GPS가 아니라 와이파이 기반으로 위치를 잡기 때문에
// 고정밀을 강제하면 오히려 CoreLocation의 kCLErrorLocationUnknown 실패가 더 잦아졌다 — 원래
// 쓰던 기본 정확도 단발 요청이 가장 안정적으로 동작한다.
//
// kCLErrorLocationUnknown은 대개 일시적인 실패라(같은 조건으로 다시 물어보면 성공하는 경우가
// 많음), 정확도를 그대로 둔 채 짧은 간격을 두고 몇 번 재시도한다 — 실패했던 watchPosition
// 방식과 달리 매번 새 단발 요청이라 고정밀 강제와는 무관하다.
const RETRY_DELAYS_MS = [1200, 2000]

export function getCurrentPosition(onSuccess, onError) {
  if (!navigator.geolocation) { onError?.(); return }
  let attempt = 0
  const tryOnce = () => {
    navigator.geolocation.getCurrentPosition(onSuccess, () => {
      if (attempt < RETRY_DELAYS_MS.length) {
        setTimeout(tryOnce, RETRY_DELAYS_MS[attempt])
        attempt += 1
      } else {
        onError?.()
      }
    }, { timeout: 8000 })
  }
  tryOnce()
}
