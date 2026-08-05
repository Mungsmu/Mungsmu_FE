// 월간 터널 통과 횟수를 AsyncStorage에 실제로 누적 기록 (웹 버전과 동일한 구조).
import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'maeum-sumgil:tunnel-pass-log'
function monthKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export async function recordTunnelPass() {
  const log = JSON.parse(await AsyncStorage.getItem(KEY) ?? '{}')
  const k = monthKey()
  log[k] = (log[k] ?? 0) + 1
  await AsyncStorage.setItem(KEY, JSON.stringify(log))
}

export async function getMonthlyPassCount() {
  const log = JSON.parse(await AsyncStorage.getItem(KEY) ?? '{}')
  return log[monthKey()] ?? 0
}
