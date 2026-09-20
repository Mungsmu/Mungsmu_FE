// expo-speech로 안내 음성을 재생 (웹의 Web Speech API 버전과 동일한 인터페이스).
// onend를 넘기면 음성이 끝난(혹은 실패한) 시점에 콜백을 호출한다 — 호흡 가이드처럼
// "음성이 끝나야 다음 단계로 넘어가는" 흐름을 만들 때 쓴다.
import * as Speech from 'expo-speech'

// 안내 음성 우선순위 — 숫자가 작을수록 급하다. 예전에는 무조건 "나중에 부른 게 이긴다"라서
// 5초마다 반복되는 호흡 가이드가 회전·위험구간 안내를 잘라먹었다. 이제 "지금 나오는 안내보다
// 덜 급한 새 안내"는 끼어들지 못하고 조용히 건너뛴다.
export const SpeechPriority = {
  HAZARD: 1, // 위험구간(단속·공사·사고 등)
  BREATH: 2, // 동반 모드 호흡 가이드
  TURN: 3,   // 회전·분기 안내
  ROUTE: 4,  // 그 외 일반 경로 안내(재탐색, 터널 접근/통과, 도착 등)
}

let currentPriority = null

export async function speak(text, { onend, priority = SpeechPriority.ROUTE } = {}) {
  // 지금 재생 중인 안내보다 우선순위가 낮으면(숫자가 크면) 방해하지 않고 건너뛴다.
  if (currentPriority != null && priority > currentPriority) { onend?.(); return }
  currentPriority = priority
  const clear = () => { if (currentPriority === priority) currentPriority = null }
  const opts = {
    language: 'ko-KR', rate: 1,
    onDone: () => { clear(); onend?.() },
    onError: () => { clear(); onend?.() },
    onStopped: () => { clear(); onend?.() },
  }
  try {
    if (await Speech.isSpeakingAsync()) {
      Speech.stop()
      setTimeout(() => Speech.speak(text, opts), 50)
    } else {
      Speech.speak(text, opts)
    }
  } catch {
    clear()
    onend?.()
  }
}

// 내비게이션 화면을 나갈 때(뒤로가기·나가기 버튼) 남아 있던 안내 음성을 즉시 끊는다 — 안 부르면
// 화면은 사라져도 이미 재생 중이던 문장은 끝까지 나온다.
export function stopSpeech() {
  currentPriority = null
  Speech.stop()
}
