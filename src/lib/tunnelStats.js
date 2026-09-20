// 이번 달 터널 통과/경로선택 기록을 localStorage에 실제로 누적 기록한다 (월이 바뀌면 자동 초기화).
const PASS_KEY = 'maeum-sumgil:tunnel-pass-log'
const ROUTE_KEY = 'maeum-sumgil:route-choice-log'

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 예전 버전은 log[month]가 숫자(횟수)였다 — 그 형식으로 저장된 값도 그대로 읽을 수 있게 정규화한다.
function normalizePassEntry(v) {
  if (typeof v === 'number') return { count: v, diffSum: 0, diffCount: 0 }
  return v ?? { count: 0, diffSum: 0, diffCount: 0 }
}

/** 터널 통과 1회 기록. difficulty(터널백과 diff, 1~5)를 넘기면 이번 달 평균 통과 난이도 계산에도 반영된다. */
export function recordTunnelPass(difficulty) {
  if (typeof window === 'undefined') return
  const log = JSON.parse(window.localStorage.getItem(PASS_KEY) ?? '{}')
  const k = monthKey()
  const entry = normalizePassEntry(log[k])
  entry.count += 1
  if (typeof difficulty === 'number') {
    entry.diffSum += difficulty
    entry.diffCount += 1
  }
  log[k] = entry
  window.localStorage.setItem(PASS_KEY, JSON.stringify(log))
}

export function getMonthlyPassCount() {
  if (typeof window === 'undefined') return 0
  const log = JSON.parse(window.localStorage.getItem(PASS_KEY) ?? '{}')
  return normalizePassEntry(log[monthKey()]).count
}

/** 이번 달 실제로 통과한 터널들의 평균 난이도(1~5). 통과 기록이 없으면 null. */
export function getMonthlyAvgDifficulty() {
  if (typeof window === 'undefined') return null
  const log = JSON.parse(window.localStorage.getItem(PASS_KEY) ?? '{}')
  const entry = normalizePassEntry(log[monthKey()])
  if (!entry.diffCount) return null
  return Math.round((entry.diffSum / entry.diffCount) * 10) / 10
}

/**
 * 경로 선택 1회 기록. "안심 경로 회피" 통계는 회피 루트가 아니라 최단 루트를 택했을 때만 센다
 * (요청 사양 그대로 — 회피 루트를 안 타고 최단 루트로 갔다는 걸 기록하는 용도).
 */
export function recordRouteChoice(routeProfile) {
  if (typeof window === 'undefined' || routeProfile !== 'shortest') return
  const log = JSON.parse(window.localStorage.getItem(ROUTE_KEY) ?? '{}')
  const k = monthKey()
  log[k] = (log[k] ?? 0) + 1
  window.localStorage.setItem(ROUTE_KEY, JSON.stringify(log))
}

export function getMonthlyRouteAvoidCount() {
  if (typeof window === 'undefined') return 0
  const log = JSON.parse(window.localStorage.getItem(ROUTE_KEY) ?? '{}')
  return log[monthKey()] ?? 0
}
