import { NavLink, Outlet, useNavigate, Navigate } from 'react-router-dom'
import { getSession } from './lib/auth.js'

const NAV = [
  { to: '/home',    label: '홈' },
  { to: '/courses', label: '안심 코스' },
  { to: '/tunnels', label: '터널 백과' },
  { to: '/route',   label: '길찾기' },
  { to: '/my',      label: '마이페이지' },
]

export default function Layout() {
  const nav = useNavigate()
  if (!getSession()) return <Navigate to="/login" replace />
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        flex: '0 0 auto', zIndex: 30,
        background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #D9E0E6',
      }}>
        <div style={{
          maxWidth: 'var(--max-w)', margin: '0 auto',
          padding: '14px 26px', display: 'flex', alignItems: 'center', gap: 30,
        }}>
          {/* 로고 */}
          <button onClick={() => nav('/home')}>
            <div style={{ display:'flex', alignItems:'center', gap:11 }}>
              <div style={{
                width:30, height:30, borderRadius:8,
                background:'linear-gradient(135deg,#1E9E94,#2C6CB0)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight:800, fontSize:15, color:'#fff'
              }}>숨</div>
              <div>
                <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, fontWeight:600, letterSpacing:'0.12em', color:'#14807A', textTransform:'uppercase', lineHeight:1 }}>
                  마음숨길 · MAEUM SUMGIL
                </div>
              </div>
            </div>
          </button>

          {/* 내비게이션 */}
          <nav style={{ display:'flex', gap:4 }}>
            {NAV.map(({ to, label }) => (
              <NavLink key={to} to={to} style={({ isActive }) => ({
                // paddingBottom을 활성 상태에서만 다른 값으로 덮어써야 해서, 나머지 세 방향도
                // padding 축약형 대신 각각 longhand로 써야 한다 — 축약형과 개별 속성을 섞어 쓰면
                // 리액트가 리렌더 시 어느 쪽이 최종값인지 판단 못 해 "Removing a style property
                // during rerender" 경고가 난다.
                display: 'block', paddingTop: 9, paddingRight: 16, paddingLeft: 16, fontSize: 15, textDecoration: 'none',
                ...(isActive
                  ? { color:'#0E5E58', fontWeight:700, borderBottom:'3px solid #14807A', borderRadius:0, background:'transparent', paddingBottom:13, opacity:1 }
                  : { color:'#5B6C78', fontWeight:600, opacity:1, background:'transparent', borderRadius:'var(--r-sm)', paddingBottom:9 }),
              })}>
                {label}
              </NavLink>
            ))}
          </nav>

          {/* 동반 모드 버튼 */}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:14 }}>
            <button
              onClick={() => nav('/companion')}
              style={{
                background: 'var(--primary)', color: '#fff', fontWeight: 700,
                fontSize: 14.5, padding: '10px 18px', borderRadius: 'var(--r-md)',
                display: 'flex', alignItems: 'center', gap: 8, boxShadow: 'var(--shadow-md)',
              }}
            >
              <span style={{ width:8, height:8, background:'var(--accent)', borderRadius:'50%', display:'inline-block' }} />
              동반 모드
            </button>
            <div style={{
              width:38, height:38, borderRadius:'50%', background:'var(--primary-bg)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontWeight:700, color:'var(--primary)', fontSize:15,
            }}>서</div>
          </div>
        </div>
      </header>

      <main style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
