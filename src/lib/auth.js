// Ma_BE(Spring Boot, :8080) API 클라이언트 + 세션 저장소.
// 개발 중에는 vite.config.js의 프록시가 /api 요청을 백엔드로 전달한다.
const SESSION_KEY = 'maeum-sumgil:session'

// ---------- 세션 (JWT + 표시용 프로필) ----------

export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') } catch { return null }
}

export function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

// ---------- 공통 fetch 래퍼 ----------

// 백엔드 공통 응답 포맷: { success, message, data }
async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (auth) {
    const token = getSession()?.accessToken
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  let res
  try {
    res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  } catch {
    throw new ApiError('서버에 연결할 수 없어요. 백엔드가 실행 중인지 확인해주세요.', 0, null)
  }

  let payload = null
  try { payload = await res.json() } catch { /* 본문 없는 응답 */ }

  if (!res.ok || payload?.success === false) {
    throw new ApiError(payload?.message ?? `요청에 실패했어요 (${res.status})`, res.status, payload?.data ?? null)
  }
  return payload
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

// ---------- API ----------

/** 아이디 중복확인 → true(사용 가능) / false(중복) */
export async function checkUsername(username) {
  const { data } = await request(`/api/members/check-username?username=${encodeURIComponent(username)}`)
  return data?.available === true
}

/** SMS 인증번호 발송 (데모 백엔드는 실제 발송 대신 서버 콘솔에 코드를 출력) */
export function sendSmsCode(phone) {
  return request('/api/sms/send', { method: 'POST', body: { phone } })
}

/** SMS 인증번호 확인 — 불일치/만료 시 ApiError */
export function verifySmsCode(phone, code) {
  return request('/api/sms/verify', { method: 'POST', body: { phone, code } })
}

/** 회원가입 */
export function signup(form) {
  return request('/api/members/signup', {
    method: 'POST',
    body: {
      name: form.name,
      phone: form.phone,
      email: form.email,
      username: form.userId,
      password: form.password,
      passwordConfirm: form.passwordConfirm,
      guardianName: form.guardianName,
      guardianPhone: form.guardianPhone,
      guardianRelation: form.relation,
    },
  })
}

/** 로그인 → JWT 발급받아 세션 저장, 내 정보까지 채워서 반환 */
export async function login(username, password) {
  const { data } = await request('/api/auth/login', { method: 'POST', body: { username, password } })
  setSession({ userId: username, name: username, accessToken: data.accessToken })
  try {
    const me = await getMe()
    setSession({ userId: me.username, name: me.name, accessToken: data.accessToken })
    return me
  } catch {
    return { username, name: username } // 내 정보 조회 실패해도 로그인 자체는 유지
  }
}

/** 내 정보 조회 (JWT 필요) */
export async function getMe() {
  const { data } = await request('/api/members/me', { auth: true })
  return data
}
