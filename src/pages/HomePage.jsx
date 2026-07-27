import { useNavigate } from 'react-router-dom'
import GangwonMap from '../components/GangwonMap.jsx'

const FEATURES = [
  { icon: '🗺️', bg: '#E3F0F2', title: '안심 코스 큐레이션', desc: '18개 시군 3등급 · 30개 터널 회피 코스', to: '/courses' },
  { icon: '🚇', bg: '#FBF0D9', title: '터널 정보 백과',     desc: '공황 난이도 1~5단계로 미리 확인',    to: '/tunnels' },
  { icon: '🧭', bg: '#EAF5F1', title: '안심 경로 길찾기',   desc: '최단 vs 터널 회피 경로 비교',        to: '/route' },
  { icon: '🫧', bg: '#E6F0EF', title: '터널 동반 모드',     desc: 'CBT 호흡 가이드 · 보호자 알림',      to: '/companion' },
]

export default function HomePage() {
  const nav = useNavigate()
  return (
    <div style={{ maxWidth: 'var(--max-w)', margin: '0 auto', padding: '0 26px 80px' }}>

      {/* 히어로 */}
      <section style={{ display:'grid', gridTemplateColumns:'1.05fr .95fr', gap:40, alignItems:'center', padding:'56px 0 48px' }}>
        <div>
          <p style={{ fontSize:13.5, fontWeight:600, color:'var(--primary)', marginBottom:14, letterSpacing:'.02em' }}>
            공황장애 환자를 위한 강원 안심 관광
          </p>
          <h1 style={{ fontSize:46, fontWeight:800, lineHeight:1.18, letterSpacing:'-1.2px', marginBottom:18, textWrap:'balance' }}>
            터널 걱정 없이<br />강원을 즐기세요
          </h1>
          <p style={{ fontSize:16, color:'var(--text-sub)', lineHeight:1.7, marginBottom:28 }}>
            마음숨길은 터널 회피 경로와 CBT 호흡 가이드로<br />
            누구나 강원도 여행을 안심하고 떠날 수 있게 돕습니다.
          </p>
          <div style={{ display:'flex', gap:12, marginBottom:38 }}>
            <button onClick={() => nav('/courses')} style={{
              background:'var(--primary)', color:'#fff', fontWeight:700, fontSize:16,
              padding:'15px 26px', borderRadius:'var(--r-lg)', boxShadow:'var(--shadow-lg)',
            }}>안심 코스 둘러보기</button>
            <button onClick={() => nav('/companion')} style={{
              background:'var(--bg-surface)', color:'var(--primary-deep)', fontWeight:700, fontSize:16,
              padding:'15px 24px', borderRadius:'var(--r-lg)', border:'1.5px solid var(--border-light)',
            }}>동반 모드 체험</button>
          </div>
          {/* 통계 */}
          <div style={{ display:'flex', gap:30, alignItems:'center' }}>
            {[['18','시군','안심 등급 분류'],['30','코스','터널 회피 큐레이션'],['100+','','터널 공황 난이도 DB']].map(([v,u,l]) => (
              <div key={l} style={{ display:'flex', flexDirection:'column', gap:3 }}>
                <span style={{ fontSize:26, fontWeight:800, color:'var(--text-head)', lineHeight:1 }}>{v}<span style={{ fontSize:14, color:'var(--text-muted)', fontWeight:600 }}> {u}</span></span>
                <span style={{ fontSize:12, color:'var(--text-muted)' }}>{l}</span>
              </div>
            )).reduce((acc, el, i) => i === 0 ? [el] : [...acc, <div key={i} style={{ width:1, height:36, background:'var(--border-light)' }}/>, el], [])}
          </div>
        </div>

        {/* 시군 맵 */}
        <div>
          <span style={{ display:'inline-block', background:'#fff', border:'1px solid var(--border-light)', boxShadow:'var(--shadow-sm)', borderRadius:99, padding:'8px 18px', fontSize:16, fontWeight:700, color:'var(--text-head)', marginBottom:20 }}>
            강원 18개 시군 안심 등급
          </span>
          <GangwonMap onSelect={name => nav(`/courses?region=${name}`)} />
        </div>
      </section>

      {/* 기능 카드 */}
      <section>
        <h2 style={{ fontSize:22, fontWeight:800, marginBottom:20, letterSpacing:'-.5px' }}>주요 기능</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:14 }}>
          {FEATURES.map(f => (
            <button key={f.to} onClick={() => nav(f.to)} style={{
              display:'flex', alignItems:'center', gap:16,
              background:'var(--bg-surface)', border:'1px solid var(--border-light)',
              borderRadius:'var(--r-xl)', padding:'20px 22px', textAlign:'left',
              cursor:'pointer', transition:'box-shadow .15s,transform .15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow='var(--shadow-sm)'; e.currentTarget.style.transform='translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='translateY(0)' }}
            >
              <span style={{ width:52, height:52, borderRadius:11, background:f.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>{f.icon}</span>
              <div>
                <p style={{ fontSize:15, fontWeight:700, color:'var(--text-head)', marginBottom:4 }}>{f.title}</p>
                <p style={{ fontSize:12, color:'var(--text-muted)' }}>{f.desc}</p>
              </div>
              <span style={{ marginLeft:'auto', fontSize:18, color:'var(--text-muted)' }}>→</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
