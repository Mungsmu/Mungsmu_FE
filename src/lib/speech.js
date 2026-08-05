// 브라우저 내장 음성합성(Web Speech API)으로 안내 음성을 재생.
// 지원 안 되는 환경(구형 브라우저 등)에서는 조용히 무시된다.
// onend를 넘기면 음성이 끝난(혹은 실패한) 시점에 콜백을 호출한다 — 호흡 가이드처럼
// "음성이 끝나야 다음 단계로 넘어가는" 흐름을 만들 때 쓴다.
export function speak(text, { onend } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) { onend?.(); return }
  const synth = window.speechSynthesis
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ko-KR'
  u.rate = 1
  if (onend) { u.onend = onend; u.onerror = onend }
  // 크롬은 cancel() 직후 같은 틱에서 speak()를 호출하면 새 발화가 조용히 씹히는 버그가 있다.
  // 재생 중일 때만 취소하고, 취소 후에는 한 틱 쉬었다가 새 발화를 넣어준다.
  if (synth.speaking || synth.pending) {
    synth.cancel()
    setTimeout(() => synth.speak(u), 50)
  } else {
    synth.speak(u)
  }
}
