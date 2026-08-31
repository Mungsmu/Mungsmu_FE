import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkUsername, sendSmsCode, verifySmsCode, signup } from '../lib/auth.js'

const RELATIONS = ['부모', '배우자', '자녀', '형제자매', '기타']

const FIELD = { border: '1.5px solid var(--border-light)', background: 'var(--bg-page)', borderRadius: 'var(--r-md)', padding: '12px 14px', fontSize: 14.5, color: 'var(--text-body)', width: '100%' }
const LABEL = { fontSize: 12.5, fontWeight: 700, color: 'var(--text-head)', marginBottom: 6, display: 'block' }

export default function SignUpPage() {
  const nav = useNavigate()
  const [step, setStep] = useState('form') // form -> sms -> done
  const [form, setForm] = useState({
    name: '', phone: '', email: '', userId: '', password: '', passwordConfirm: '',
    guardianName: '', guardianPhone: '', relation: RELATIONS[0],
  })
  const [idCheck, setIdCheck] = useState(null) // null | 'checking' | 'ok' | 'dup'
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [codeError, setCodeError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const set = (k) => (e) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    if (k === 'userId') setIdCheck(null)
  }

  const checkId = async () => {
    if (!form.userId.trim()) return
    setIdCheck('checking')
    try {
      const available = await checkUsername(form.userId.trim())
      setIdCheck(available ? 'ok' : 'dup')
    } catch (e) {
      setIdCheck(null)
      alert(e.message)
    }
  }

  // 비밀번호 규칙은 백엔드(SignupRequest)와 동일: 영문+숫자 포함 8자 이상
  const passwordOk = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(form.password)
  const canSubmitForm = form.name.trim() && form.phone.trim() && form.email.trim()
    && form.userId.trim() && idCheck === 'ok'
    && passwordOk && form.password === form.passwordConfirm
    && form.guardianName.trim() && form.guardianPhone.trim()

  const sendCode = async () => {
    setCodeError('')
    try {
      await sendSmsCode(form.phone.trim())
      setCodeSent(true)
    } catch (e) {
      setCodeError(e.message)
    }
  }

  const verifyCode = async () => {
    if (code.trim().length !== 6) { setCodeError('6자리 인증번호를 입력해주세요'); return }
    setSubmitting(true)
    setCodeError('')
    try {
      await verifySmsCode(form.phone.trim(), code.trim())
      await signup({
        ...form,
        name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(),
        userId: form.userId.trim(),
        guardianName: form.guardianName.trim(), guardianPhone: form.guardianPhone.trim(),
      })
      setStep('done')
    } catch (e) {
      setCodeError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'done') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 24, padding: '48px 40px', width: '100%', maxWidth: 420, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#EAF7EF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 18px' }}>✓</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>가입이 완료됐어요</h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-sub)', lineHeight: 1.6, marginBottom: 28 }}>
            {form.name}님, 마음숨길과 함께 안심하고 떠나보세요.<br />
            길찾기 시 보호자 {form.guardianName}님께 SMS로 알려드릴게요.
          </p>
          <button onClick={() => nav('/login')} style={{ width: '100%', height: 48, borderRadius: 'var(--r-lg)', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>로그인하러 가기</button>
        </div>
      </div>
    )
  }

  if (step === 'sms') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 24, padding: '44px 40px', width: '100%', maxWidth: 420 }}>
          <button onClick={() => setStep('form')} style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, marginBottom: 18, cursor: 'pointer' }}>← 이전</button>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>휴대폰 번호 인증</h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-sub)', lineHeight: 1.6, marginBottom: 24 }}>{form.phone}로 전송된 인증번호 6자리를 입력해주세요.</p>

          <label style={LABEL}>인증번호</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setCodeError('') }}
              placeholder="123456" style={{ ...FIELD, flex: 1, letterSpacing: '0.3em', textAlign: 'center', fontWeight: 700 }} />
            <button onClick={sendCode} style={{ flexShrink: 0, padding: '0 16px', borderRadius: 'var(--r-md)', background: codeSent ? 'var(--bg-subtle)' : 'var(--primary-bg)', color: 'var(--primary)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {codeSent ? '재전송' : '인증번호 받기'}
            </button>
          </div>
          {codeSent && <p style={{ fontSize: 12, color: '#2E7D4F', marginBottom: 8 }}>✓ 인증번호가 발송됐어요 (데모: 백엔드 서버 콘솔에서 확인)</p>}
          {codeError && <p style={{ fontSize: 12, color: '#A53E33', marginBottom: 8 }}>{codeError}</p>}

          <button onClick={verifyCode} disabled={!codeSent || submitting} style={{ width: '100%', height: 48, borderRadius: 'var(--r-lg)', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginTop: 16, opacity: (codeSent && !submitting) ? 1 : 0.4 }}>{submitting ? '가입 중...' : '인증 완료'}</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 24, padding: '40px 40px 32px', width: '100%', maxWidth: 460 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>회원가입</h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-sub)', marginBottom: 24 }}>보호자 정보를 등록하면 길찾기 시 자동으로 SMS 알림을 보내드려요.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={LABEL}>이름</label>
            <input value={form.name} onChange={set('name')} placeholder="홍길동" style={FIELD} />
          </div>
          <div>
            <label style={LABEL}>전화번호</label>
            <input value={form.phone} onChange={set('phone')} placeholder="010-0000-0000" style={FIELD} />
          </div>
          <div>
            <label style={LABEL}>이메일</label>
            <input value={form.email} onChange={set('email')} placeholder="example@email.com" style={FIELD} />
          </div>
          <div>
            <label style={LABEL}>아이디</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={form.userId} onChange={set('userId')} placeholder="아이디를 입력하세요" style={{ ...FIELD, flex: 1 }} />
              <button onClick={checkId} style={{ flexShrink: 0, padding: '0 16px', borderRadius: 'var(--r-md)', background: 'var(--bg-subtle)', color: 'var(--text-sub)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>중복확인</button>
            </div>
            {idCheck === 'checking' && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>확인 중...</p>}
            {idCheck === 'ok' && <p style={{ fontSize: 12, color: '#2E7D4F', marginTop: 6 }}>✓ 사용 가능한 아이디예요</p>}
            {idCheck === 'dup' && <p style={{ fontSize: 12, color: '#A53E33', marginTop: 6 }}>이미 사용 중인 아이디예요</p>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={LABEL}>비밀번호</label>
              <input type="password" value={form.password} onChange={set('password')} placeholder="영문+숫자 8자 이상" style={FIELD} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={LABEL}>비밀번호 확인</label>
              <input type="password" value={form.passwordConfirm} onChange={set('passwordConfirm')} placeholder="다시 입력" style={FIELD} />
            </div>
          </div>
          {form.passwordConfirm && form.password !== form.passwordConfirm && (
            <p style={{ fontSize: 12, color: '#A53E33', marginTop: -8 }}>비밀번호가 일치하지 않아요</p>
          )}

          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 14, marginTop: 4 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-head)', marginBottom: 12 }}>보호자 정보</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>보호자 이름</label>
                <input value={form.guardianName} onChange={set('guardianName')} placeholder="김민준" style={FIELD} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={LABEL}>관계</label>
                <select value={form.relation} onChange={set('relation')} style={{ ...FIELD, cursor: 'pointer' }}>
                  {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <label style={LABEL}>보호자 전화번호</label>
            <input value={form.guardianPhone} onChange={set('guardianPhone')} placeholder="010-0000-0000" style={FIELD} />
          </div>

          <button onClick={() => canSubmitForm && setStep('sms')} disabled={!canSubmitForm}
            style={{ width: '100%', height: 48, borderRadius: 'var(--r-lg)', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginTop: 8, opacity: canSubmitForm ? 1 : 0.4 }}>
            다음 (휴대폰 인증)
          </button>
        </div>
      </div>
    </div>
  )
}
