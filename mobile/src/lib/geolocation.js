// 위치 조회 — 기본 정확도로 한 번만 요청한다. Accuracy.High를 강제하거나 watchPositionAsync로
// 계속 재시도하는 방식을 시도해봤지만, 웹 프리뷰(expo start --web)에서는 맥의 CoreLocation이
// GPS가 아니라 와이파이 기반으로 위치를 잡기 때문에 고정밀을 강제하면 오히려 kCLErrorLocationUnknown
// 실패가 더 잦아졌다 — 원래 쓰던 기본 정확도 단발 요청이 가장 안정적으로 동작한다.
import * as Location from 'expo-location'

export function getCurrentPosition() {
  return Location.getCurrentPositionAsync({})
}
