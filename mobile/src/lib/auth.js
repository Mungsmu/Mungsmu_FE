// 백엔드 없이 AsyncStorage로 흉내내는 간이 계정/세션 저장소 (웹의 localStorage 버전과 동일한 구조).
import AsyncStorage from '@react-native-async-storage/async-storage'

const USERS_KEY = 'maeum-sumgil:users'
const SESSION_KEY = 'maeum-sumgil:session'

export async function getUsers() {
  try { return JSON.parse(await AsyncStorage.getItem(USERS_KEY) ?? '[]') } catch { return [] }
}

export async function findUser(userId) {
  const users = await getUsers()
  return users.find(u => u.userId === userId) ?? null
}

export async function saveUser(user) {
  const users = (await getUsers()).filter(u => u.userId !== user.userId)
  users.push(user)
  await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users))
}

export async function getSession() {
  try { return JSON.parse(await AsyncStorage.getItem(SESSION_KEY) ?? 'null') } catch { return null }
}

export async function setSession(user) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.userId, name: user.name }))
}

export async function clearSession() {
  await AsyncStorage.removeItem(SESSION_KEY)
}
