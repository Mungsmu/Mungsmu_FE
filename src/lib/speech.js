// 브라우저 내장 음성합성(Web Speech API)으로 안내 음성을 재생.
// 지원 안 되는 환경(구형 브라우저 등)에서는 조용히 무시된다.
// onend를 넘기면 음성이 끝난(혹은 실패한) 시점에 콜백을 호출한다 — 호흡 가이드처럼
// "음성이 끝나야 다음 단계로 넘어가는" 흐름을 만들 때 쓴다.

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
// stopSpeech()가 호출될 때마다 증가 — 50ms 지연 재생이 예약된 상태에서 페이지를 나가
// stopSpeech()가 불려도, 그 타이머가 나중에 혼자 발화하지 않도록 실행 직전 이 토큰을 확인한다.
let stopToken = 0

export function speak(text, { onend, priority = SpeechPriority.ROUTE } = {}) {
  // 지금 재생 중인 안내보다 우선순위가 낮으면(숫자가 크면) 방해하지 않고 건너뛴다.
  if (currentPriority != null && priority > currentPriority) { onend?.(); return }
  if (typeof window === 'undefined' || !window.speechSynthesis) { onend?.(); return }
  const synth = window.speechSynthesis
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ko-KR'
  u.rate = 1
  currentPriority = priority
  const myToken = stopToken
  const clear = () => { if (currentPriority === priority) currentPriority = null }
  u.onend = () => { clear(); onend?.() }
  u.onerror = () => { clear(); onend?.() }
  const speakNow = () => {
    if (stopToken !== myToken) { clear(); onend?.(); return }
    synth.speak(u)
  }
  // 크롬은 cancel() 직후 같은 틱에서 speak()를 호출하면 새 발화가 조용히 씹히는 버그가 있다.
  // 재생 중일 때만 취소하고, 취소 후에는 한 틱 쉬었다가 새 발화를 넣어준다.
  if (synth.speaking || synth.pending) {
    synth.cancel()
    pendingTimer = setTimeout(() => { pendingTimer = null; speakNow() }, 50)
  } else {
    speakNow()
  }
}

// 내비게이션 페이지를 나갈 때(뒤로가기·나가기 버튼) 남아 있던 안내 음성을 즉시 끊는다 — 안 부르면
// 페이지는 사라져도 이미 재생 중이던 문장은 끝까지 나온다. 아직 실행되지 않은 50ms 지연 재생
// 예약(setTimeout)도 함께 취소해야, 그 타이머가 나중에 혼자 발화하는 걸 막을 수 있다.
export function stopSpeech() {
  currentPriority = null
  stopToken += 1
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null }
  if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
}
