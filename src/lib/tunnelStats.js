// 이번 달 터널 통과 횟수를 localStorage에 실제로 누적 기록한다 (월이 바뀌면 자동 초기화).
const KEY = 'maeum-sumgil:tunnel-pass-log'

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function recordTunnelPass() {
  if (typeof window === 'undefined') return
  const log = JSON.parse(window.localStorage.getItem(KEY) ?? '{}')
  const k = monthKey()
  log[k] = (log[k] ?? 0) + 1
  window.localStorage.setItem(KEY, JSON.stringify(log))
}

export function getMonthlyPassCount() {
  if (typeof window === 'undefined') return 0
  const log = JSON.parse(window.localStorage.getItem(KEY) ?? '{}')
  return log[monthKey()] ?? 0
}
