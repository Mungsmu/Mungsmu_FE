// 백엔드 없이 localStorage로 흉내내는 간이 계정/세션 저장소.
const USERS_KEY = 'maeum-sumgil:users'
const SESSION_KEY = 'maeum-sumgil:session'

export function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]') } catch { return [] }
}

export function findUser(userId) {
  return getUsers().find(u => u.userId === userId) ?? null
}

export function saveUser(user) {
  const users = getUsers().filter(u => u.userId !== user.userId)
  users.push(user)
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') } catch { return null }
}

export function setSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.userId, name: user.name }))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}
