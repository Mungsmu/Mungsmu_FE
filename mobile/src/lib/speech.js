// expo-speech로 안내 음성을 재생 (웹의 Web Speech API 버전과 동일한 인터페이스).
// onend를 넘기면 음성이 끝난(혹은 실패한) 시점에 콜백을 호출한다 — 호흡 가이드처럼
// "음성이 끝나야 다음 단계로 넘어가는" 흐름을 만들 때 쓴다.
import * as Speech from 'expo-speech'
import { setAudioModeAsync } from 'expo-audio'

// expo-speech 공식 문서: iOS 실기기가 무음 모드(스위치)면 소리를 전혀 내지 않고, expo-speech
// 자체에는 이를 우회하는 옵션이 없다 — 앱의 오디오 세션을 무음 모드에서도 재생하도록 먼저 설정해야
// 한다(expo-speech는 기본적으로 앱의 오디오 세션을 그대로 쓴다, useApplicationAudioSession). 앱
// 전체에서 한 번만 설정하면 되므로 모듈 로드 시 바로 호출한다.
setAudioModeAsync({ playsInSilentMode: true }).catch(() => {})

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
let pendingTimer = null
// stopSpeech()가 호출될 때마다 증가 — "지금 이 speak() 호출 이후로 stopSpeech()가 불렸는지"를
// 판단하는 용도. isSpeakingAsync()의 await나 50ms 지연 재생 도중에 화면이 나가서 stopSpeech()가
// 끼어들어도, 그 뒤에 실제로 Speech.speak()가 불리기 직전 이 토큰을 다시 확인해 재생을 막는다.
let stopToken = 0

export async function speak(text, { onend, priority = SpeechPriority.ROUTE } = {}) {
  // 지금 재생 중인 안내보다 우선순위가 낮으면(숫자가 크면) 방해하지 않고 건너뛴다.
  if (currentPriority != null && priority > currentPriority) { onend?.(); return }
  currentPriority = priority
  const myToken = stopToken
  const clear = () => { if (currentPriority === priority) currentPriority = null }
  const opts = {
    language: 'ko-KR', rate: 1,
    onDone: () => { clear(); onend?.() },
    onError: () => { clear(); onend?.() },
    onStopped: () => { clear(); onend?.() },
  }
  const speakNow = () => {
    if (stopToken !== myToken) { clear(); onend?.(); return }
    Speech.speak(text, opts)
  }
  try {
    if (await Speech.isSpeakingAsync()) {
      Speech.stop()
      pendingTimer = setTimeout(() => { pendingTimer = null; speakNow() }, 50)
    } else {
      speakNow()
    }
  } catch {
    clear()
    onend?.()
  }
}

// 내비게이션 화면을 나갈 때(뒤로가기·나가기 버튼) 남아 있던 안내 음성을 즉시 끊는다 — 안 부르면
// 화면은 사라져도 이미 재생 중이던 문장은 끝까지 나온다. 아직 실행되지 않은 50ms 지연 재생
// 예약(setTimeout)도 함께 취소해야, 그 타이머가 나중에 혼자 발화하는 걸 막을 수 있다.
export function stopSpeech() {
  currentPriority = null
  stopToken += 1
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null }
  Speech.stop()
}
