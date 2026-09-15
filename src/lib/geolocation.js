// 위치 조회 — 기본 정확도로 한 번만 요청한다. enableHighAccuracy를 강제하거나 watchPosition으로
// 계속 재시도하는 방식을 시도해봤지만, 맥은 GPS가 아니라 와이파이 기반으로 위치를 잡기 때문에
// 고정밀을 강제하면 오히려 CoreLocation의 kCLErrorLocationUnknown 실패가 더 잦아졌다 — 원래
// 쓰던 기본 정확도 단발 요청이 가장 안정적으로 동작한다.
export function getCurrentPosition(onSuccess, onError) {
  if (!navigator.geolocation) { onError?.(); return }
  navigator.geolocation.getCurrentPosition(onSuccess, () => onError?.(), { timeout: 8000 })
}
