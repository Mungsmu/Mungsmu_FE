import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, clearSession } from '../lib/auth.js'

export function MyPage() {
  const nav = useNavigate()
  const [share, setShare] = useState(true)
  const [auto,  setAuto]  = useState(true)
  const [emer,  setEmer]  = useState(false)

  const Toggle = ({ on, set }) => (
    <button onClick={() => set(v => !v)} style={{ position:'relative', width:44, height:26, borderRadius:13, background: on ? 'var(--primary)' : '#D6D0C4', border:'none', cursor:'pointer', transition:'background .2s', flexShrink:0 }}>
      <span style={{ position:'absolute', top:3, left: on ? 21 : 3, width:20, height:20, borderRadius:'50%', background:'#fff', transition:'left .2s', display:'block' }} />
    </button>
  )

  return (
    <div style={{ maxWidth:920, margin:'0 auto', padding:'30px 26px 80px' }}>
      <h1 style={{ fontSize:30, fontWeight:800, letterSpacing:'-.8px', marginBottom:22 }}>마이페이지</h1>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, alignItems:'start' }}>
        <div>
          {/* 프로필 */}
          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-light)', borderRadius:'var(--r-xl)', padding:22, display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'var(--primary-bg)', color:'var(--primary)', fontSize:20, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>서</div>
            <div>
              <p style={{ fontSize:18, fontWeight:800, color:'var(--text-head)', marginBottom:3 }}>서연 님</p>
              <p style={{ fontSize:12, color:'var(--text-muted)' }}>마음숨길 여행자</p>
            </div>
            <button style={{ marginLeft:'auto', border:'1px solid var(--border-light)', background:'var(--bg-page)', color:'var(--text-sub)', fontSize:12, fontWeight:700, padding:'7px 14px', borderRadius:8, cursor:'pointer', flexShrink:0 }}>프로필 수정</button>
          </div>
          {/* 통계 */}
          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-light)', borderRadius:'var(--r-xl)', padding:22 }}>
            <p style={{ fontSize:15, fontWeight:800, color:'var(--text-head)', marginBottom:18 }}>이번 달 기록</p>
            <div style={{ display:'flex' }}>
              {[['12회','터널 통과 성공','#2E9E6B'],['5회','안심 경로 회피','var(--primary)'],['3단계','평균 통과 난이도','#E0A93B']].map(([v,l,c],i,arr) => (
                <div key={l} style={{ flex:1, paddingLeft: i===0?0:16, borderLeft: i===0?'none':'1px solid var(--border-light)' }}>
                  <div style={{ fontSize:24, fontWeight:800, color:c, lineHeight:1, marginBottom:4 }}>{v}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          {/* 보호자 설정 */}
          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-light)', borderRadius:'var(--r-xl)', padding:22, marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <p style={{ fontSize:15, fontWeight:800, color:'var(--text-head)' }}>보호자 연동</p>
              <button style={{ fontSize:12, color:'var(--primary)', fontWeight:700, cursor:'pointer' }}>연락처 변경</button>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg-page)', borderRadius:8, marginBottom:16 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--primary-bg)', color:'var(--primary)', fontSize:14, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>민</div>
              <div>
                <p style={{ fontSize:15, fontWeight:700, color:'var(--text-head)', marginBottom:2 }}>김민준</p>
                <p style={{ fontSize:12, color:'var(--text-muted)' }}>가족 · 010-0000-0000</p>
              </div>
            </div>
            {[['실시간 위치 공유','동반 모드 중 보호자에게 위치 전송', share, setShare],['자동 통과 알림','터널 진입·통과 시 보호자에게 자동 알림', auto, setAuto],['긴급 호출 위임','긴급 호출 시 보호자에게 즉시 연결', emer, setEmer]].map(([l,s,v,set]) => (
              <div key={l} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 0', borderTop:'1px solid var(--border-light)' }}>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:13.5, fontWeight:700, color:'var(--text-head)', marginBottom:2 }}>{l}</p>
                  <p style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.4 }}>{s}</p>
                </div>
                <Toggle on={v} set={set} />
              </div>
            ))}
          </div>
          {/* 기타 */}
          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-light)', borderRadius:'var(--r-xl)', padding:22 }}>
            <p style={{ fontSize:15, fontWeight:800, color:'var(--text-head)', marginBottom:4 }}>서비스</p>
            {['이용 내역','앱 설정','문의하기'].map(l => (
              <button key={l} style={{ display:'block', width:'100%', textAlign:'left', borderTop:'1px solid var(--border-light)', padding:'14px 0', fontSize:15, fontWeight:500, color:'var(--text-sub)', cursor:'pointer' }}>{l}</button>
            ))}
            <button onClick={() => { clearSession(); nav('/login') }} style={{ display:'block', width:'100%', textAlign:'left', borderTop:'1px solid var(--border-light)', padding:'14px 0', fontSize:15, fontWeight:500, color:'#B24A33', cursor:'pointer' }}>로그아웃</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function LoginPage() {
  const nav = useNavigate()
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!userId.trim() || !password || loading) return
    setLoading(true)
    setError('')
    try {
      await login(userId.trim(), password)
      nav('/home')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-page)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-light)', borderRadius:24, padding:'48px 44px', width:'100%', maxWidth:440, textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:10, marginBottom:28 }}>
          <span style={{ position:'relative', width:32, height:32, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ position:'absolute', width:32, height:32, border:'2px solid #9FD4D9', borderRadius:'50%', opacity:.55 }} />
            <span style={{ position:'absolute', width:20, height:20, border:'2px solid #4FAEB8', borderRadius:'50%', opacity:.8 }} />
            <span style={{ width:10, height:10, background:'var(--primary)', borderRadius:'50%', display:'block' }} />
          </span>
          <span style={{ fontSize:22, fontWeight:800, letterSpacing:'-.5px', color:'var(--primary-deep)' }}>마음숨길</span>
        </div>
        <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:'-.5px', marginBottom:10 }}>안심하고 떠나는 강원 여행</h1>
        <p style={{ fontSize:13.5, color:'var(--text-sub)', lineHeight:1.6, marginBottom:36 }}>공황장애 환자를 위한 터널 회피 안심 관광 큐레이션 서비스</p>
        <div style={{ display:'flex', flexDirection:'column', gap:10, textAlign:'left', marginBottom:24 }}>
          <label style={{ fontSize:13.5, fontWeight:700, color:'var(--text-head)' }}>아이디</label>
          <input value={userId} onChange={e => { setUserId(e.target.value); setError('') }} placeholder="아이디를 입력하세요"
            style={{ border:'1.5px solid var(--border-light)', background:'var(--bg-page)', borderRadius:'var(--r-lg)', padding:'14px 16px', fontSize:16, color:'var(--text-body)' }} autoFocus />
          <label style={{ fontSize:13.5, fontWeight:700, color:'var(--text-head)', marginTop:4 }}>비밀번호</label>
          <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && submit()} placeholder="비밀번호를 입력하세요"
            style={{ border:'1.5px solid var(--border-light)', background:'var(--bg-page)', borderRadius:'var(--r-lg)', padding:'14px 16px', fontSize:16, color:'var(--text-body)' }} />
          {error && <p style={{ fontSize:12.5, color:'#A53E33', marginTop:-2 }}>{error}</p>}
          <button onClick={submit} disabled={!userId.trim() || !password || loading}
            style={{ background:'var(--primary)', color:'#fff', fontWeight:700, fontSize:16, padding:14, borderRadius:'var(--r-lg)', cursor:'pointer', boxShadow:'var(--shadow-lg)', marginTop:4, opacity: (!userId.trim() || !password || loading) ? 0.4 : 1 }}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </div>
        <button onClick={() => nav('/signup')} style={{ fontSize:13, fontWeight:700, color:'var(--primary)', cursor:'pointer' }}>회원가입 하러 가기 →</button>
      </div>
    </div>
  )
}
