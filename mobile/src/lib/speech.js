// expo-speech로 안내 음성을 재생 (웹의 Web Speech API 버전과 동일한 인터페이스).
// onend를 넘기면 음성이 끝난(혹은 실패한) 시점에 콜백을 호출한다 — 호흡 가이드처럼
// "음성이 끝나야 다음 단계로 넘어가는" 흐름을 만들 때 쓴다.
import * as Speech from 'expo-speech'

export async function speak(text, { onend } = {}) {
  const opts = { language: 'ko-KR', rate: 1, onDone: onend, onError: onend, onStopped: onend }
  try {
    if (await Speech.isSpeakingAsync()) {
      Speech.stop()
      setTimeout(() => Speech.speak(text, opts), 50)
    } else {
      Speech.speak(text, opts)
    }
  } catch {
    onend?.()
  }
}
